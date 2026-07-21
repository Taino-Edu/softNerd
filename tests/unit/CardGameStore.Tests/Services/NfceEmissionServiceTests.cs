// =============================================================================
// NfceEmissionServiceTests.cs — Testes do motor de emissão de NFC-e.
// Não há como testar uma transmissão real à SEFAZ neste ambiente (sem
// certificado de homologação nem rede) — os testes aqui verificam a garantia
// central do serviço: nunca lançar exceção e sempre deixar a nota registrada
// como PendenteEmissao quando a emissão não pode ser concluída.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos;

namespace CardGameStore.Tests.Services;

public class NfceEmissionServiceTests
{
    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        var db = new AppDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private static EncryptionService CreateEncryptionService()
    {
        var config = new ConfigurationBuilder().Build();
        var env = new Mock<IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        return new EncryptionService(config, env.Object);
    }

    private static NfceEmissionService CreateService(AppDbContext db) =>
        new(db, new Mock<IMongoDatabase>().Object, CreateEncryptionService(), NullLogger<NfceEmissionService>.Instance);

    private static async Task<Comanda> SeedComandaFechadaAsync(AppDbContext db)
    {
        var user = new User { Id = Guid.NewGuid(), Name = "Cliente Teste", Role = UserRole.Customer };
        db.Users.Add(user);

        var product = new Product { Id = Guid.NewGuid(), Name = "Booster Pack", Category = "MTG", PriceInCents = 1500, StockQuantity = 10, Ncm = "95044000" };
        db.Products.Add(product);

        var comanda = new Comanda
        {
            Id            = Guid.NewGuid(),
            UserId        = user.Id,
            Status        = ComandaStatus.Fechada,
            TotalInCents  = 1500,
            PaymentMethod = "Dinheiro",
        };
        comanda.Items.Add(new ComandaItem
        {
            ComandaId          = comanda.Id,
            ProductId          = product.Id,
            ItemNameSnapshot    = product.Name,
            UnitPriceInCents    = 1500,
            Quantity            = 1,
            SubtotalInCents     = 1500,
        });
        db.Comandas.Add(comanda);
        await db.SaveChangesAsync();
        return comanda;
    }

    /// <summary>Comanda com item de R$15,00 mas desconto de R$5,00 aplicado no fechamento —
    /// TotalInCents (1000) já sai líquido, igual ComandaService.CloseComandaAsync faz de
    /// verdade. Usada pra provar que a nota fiscal declara o valor PAGO, não o bruto dos itens.</summary>
    private static async Task<Comanda> SeedComandaFechadaComDescontoAsync(AppDbContext db)
    {
        var user = new User { Id = Guid.NewGuid(), Name = "Cliente Teste", Role = UserRole.Customer };
        db.Users.Add(user);

        var product = new Product { Id = Guid.NewGuid(), Name = "Booster Pack", Category = "MTG", PriceInCents = 1500, StockQuantity = 10, Ncm = "95044000" };
        db.Products.Add(product);

        var comanda = new Comanda
        {
            Id              = Guid.NewGuid(),
            UserId          = user.Id,
            Status          = ComandaStatus.Fechada,
            TotalInCents    = 1000, // 1500 (itens) - 500 (desconto) = líquido cobrado de verdade
            DiscountInCents = 500,
            PaymentMethod   = "Dinheiro",
        };
        comanda.Items.Add(new ComandaItem
        {
            ComandaId          = comanda.Id,
            ProductId          = product.Id,
            ItemNameSnapshot    = product.Name,
            UnitPriceInCents    = 1500,
            Quantity            = 1,
            SubtotalInCents     = 1500, // bruto do item — NÃO reflete o desconto
        });
        db.Comandas.Add(comanda);
        await db.SaveChangesAsync();
        return comanda;
    }

    [Fact]
    public async Task EmitirParaComandaAsync_SemFiscalConfig_RegistraPendenteEmissaoSemLancarExcecao()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);
        var service = CreateService(db);

        var nota = await service.EmitirParaComandaAsync(comanda.Id);

        nota.Status.Should().Be(NotaFiscalStatus.PendenteEmissao);
        nota.ComandaId.Should().Be(comanda.Id);
        nota.ValorTotalEmCentavos.Should().Be(1500);
    }

    [Fact]
    public async Task EmitirParaComandaAsync_ComDesconto_ValorTotalEhOLiquidoNaoOBrutoDosItens()
    {
        // Bug real: a nota saía pelo valor BRUTO dos itens (1500), ignorando o desconto
        // de R$5 aplicado no fechamento — o cliente pagou 1000, a nota tinha que declarar 1000.
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaComDescontoAsync(db);
        var service = CreateService(db);

        var nota = await service.EmitirParaComandaAsync(comanda.Id);

        nota.ValorTotalEmCentavos.Should().Be(1000);
    }

    [Fact]
    public async Task EmitirParaComandaAsync_ComFiscalConfigIncompleto_RegistraPendenteEmissaoSemLancarExcecao()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);

        // Config existe mas sem certificado/endereço — deve cair no caminho "não configurado".
        db.FiscalConfigs.Add(new FiscalConfig { Cnpj = "12345678000100" });
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var nota = await service.EmitirParaComandaAsync(comanda.Id);

        nota.Status.Should().Be(NotaFiscalStatus.PendenteEmissao);
    }

    [Fact]
    public async Task EmitirParaComandaAsync_ComandaInexistente_NuncaLancaExcecao()
    {
        using var db = CreateDb();
        var service = CreateService(db);

        var nota = await service.EmitirParaComandaAsync(Guid.NewGuid());

        nota.Status.Should().Be(NotaFiscalStatus.PendenteEmissao);
    }

    [Fact]
    public async Task EmitirParaVendaAvulsaAsync_SemVendaCorrespondente_NuncaLancaExcecao()
    {
        using var db = CreateDb();
        var service = CreateService(db);

        var nota = await service.EmitirParaVendaAvulsaAsync(MongoDB.Bson.ObjectId.GenerateNewId().ToString());

        nota.Status.Should().Be(NotaFiscalStatus.PendenteEmissao);
        nota.Origem.Should().Be(NotaFiscalOrigem.VendaAvulsa);
    }

    [Fact]
    public async Task ReprocessarAsync_NotaAutorizada_DevolveSemTentarDeNovo()
    {
        using var db = CreateDb();
        var nota = new NotaFiscalEmitida { Status = NotaFiscalStatus.Autorizada, ChaveAcesso = "X", Protocolo = "P" };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.ReprocessarAsync(nota.Id);

        resultado.Status.Should().Be(NotaFiscalStatus.Autorizada);
        resultado.TentativasReprocessamento.Should().Be(0); // nem tentou — devolveu direto
    }

    [Fact]
    public async Task ReprocessarAsync_AcimaDoLimiteDeTentativas_NaoTentaDeNovo()
    {
        using var db = CreateDb();
        var nota = new NotaFiscalEmitida { Status = NotaFiscalStatus.Rejeitada, TentativasReprocessamento = 10 };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.ReprocessarAsync(nota.Id);

        resultado.TentativasReprocessamento.Should().Be(10); // não incrementou — nem tentou
    }

    [Fact]
    public async Task CancelarAsync_NotaNaoAutorizada_LancaExcecao()
    {
        using var db = CreateDb();
        var nota = new NotaFiscalEmitida { Status = NotaFiscalStatus.PendenteEmissao };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        Func<Task> act = () => service.CancelarAsync(nota.Id, "Motivo com mais de quinze caracteres");

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*Autorizada*");
    }

    [Fact]
    public async Task CancelarAsync_JustificativaCurta_LancaExcecao()
    {
        using var db = CreateDb();
        var nota = new NotaFiscalEmitida { Status = NotaFiscalStatus.Autorizada, EmitidoEm = DateTime.UtcNow };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        Func<Task> act = () => service.CancelarAsync(nota.Id, "curta demais");

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*15 caracteres*");
    }

    [Fact]
    public async Task CancelarAsync_ForaDaJanelaLegal_LancaExcecao()
    {
        using var db = CreateDb();
        var nota = new NotaFiscalEmitida
        {
            Status = NotaFiscalStatus.Autorizada,
            EmitidoEm = DateTime.UtcNow.AddHours(-2), // muito depois dos 30 min de janela
        };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        Func<Task> act = () => service.CancelarAsync(nota.Id, "Motivo com mais de quinze caracteres");

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*janela legal*");
    }

    [Fact]
    public async Task EmitirParaComandaAsync_ComandaCancelada_AnulaNotaSemTentarTransmitir()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);
        comanda.Status = ComandaStatus.Cancelada;
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var nota = await service.EmitirParaComandaAsync(comanda.Id);

        nota.Status.Should().Be(NotaFiscalStatus.Cancelada);
        nota.CanceladoEm.Should().NotBeNull();
        nota.ChaveAcesso.Should().BeNull(); // nunca chegou a ser transmitida à SEFAZ
    }

    [Fact]
    public async Task ReprocessarAsync_ComandaFoiCanceladaAposFicarPendente_AnulaNotaEmVezDeEmitir()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);

        var nota = new NotaFiscalEmitida
        {
            Origem    = NotaFiscalOrigem.Comanda,
            ComandaId = comanda.Id,
            Status    = NotaFiscalStatus.PendenteEmissao,
        };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        // Comanda é cancelada enquanto a nota ainda está pendente (ex: retry automático não rodou ainda)
        comanda.Status = ComandaStatus.Cancelada;
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.ReprocessarAsync(nota.Id);

        resultado.Status.Should().Be(NotaFiscalStatus.Cancelada);
    }

    // ── Contingência offline: prazo de 24h e isenção do limite de tentativas ──

    [Fact]
    public async Task ReprocessarAsync_ContingenciaComPrazoExpirado_ParaDeTentarESinaliza()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);

        var nota = new NotaFiscalEmitida
        {
            Origem          = NotaFiscalOrigem.Comanda,
            ComandaId       = comanda.Id,
            Status          = NotaFiscalStatus.AutorizadaContingencia,
            DhContingencia  = DateTime.UtcNow.AddHours(-25), // passou das 24h legais
            CnfContingencia = 12345678,
            Numero          = 42,
        };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.ReprocessarAsync(nota.Id);

        resultado.TentativasReprocessamento.Should().Be(0); // nem tentou — prazo expirado
        resultado.Status.Should().Be(NotaFiscalStatus.AutorizadaContingencia); // não vira Rejeitada (cupom já entregue)
        resultado.MotivoRejeicao.Should().Contain("24h");
    }

    [Fact]
    public async Task ReprocessarAsync_ContingenciaDentroDoPrazo_IgnoraLimiteDe10Tentativas()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);

        var nota = new NotaFiscalEmitida
        {
            Origem                     = NotaFiscalOrigem.Comanda,
            ComandaId                  = comanda.Id,
            Status                     = NotaFiscalStatus.AutorizadaContingencia,
            DhContingencia             = DateTime.UtcNow.AddHours(-2), // dentro das 24h
            CnfContingencia            = 12345678,
            Numero                     = 42,
            TentativasReprocessamento  = 10, // numa nota comum isso travaria — em contingência, não
        };
        db.NotasFiscaisEmitidas.Add(nota);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.ReprocessarAsync(nota.Id);

        // Tentou (incrementou) — a transmissão falha por falta de config fiscal,
        // mas a nota NÃO pode ser abandonada antes do prazo legal de 24h.
        resultado.TentativasReprocessamento.Should().Be(11);
        resultado.Status.Should().Be(NotaFiscalStatus.AutorizadaContingencia);
    }

    // ── Idempotência: uma origem tem no máximo uma nota ───────────────────────

    [Fact]
    public async Task EmitirParaComandaAsync_NotaJaAutorizada_DevolveExistenteSemDuplicar()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);

        var existente = new NotaFiscalEmitida
        {
            Origem    = NotaFiscalOrigem.Comanda,
            ComandaId = comanda.Id,
            Status    = NotaFiscalStatus.Autorizada,
            ChaveAcesso = "X", Protocolo = "P",
        };
        db.NotasFiscaisEmitidas.Add(existente);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.EmitirParaComandaAsync(comanda.Id);

        resultado.Id.Should().Be(existente.Id);
        db.NotasFiscaisEmitidas.Count().Should().Be(1); // nenhuma nota nova criada
    }

    [Fact]
    public async Task EmitirParaComandaAsync_NotaPendenteExistente_ReprocessaMesmaLinhaSemDuplicar()
    {
        using var db = CreateDb();
        var comanda = await SeedComandaFechadaAsync(db);

        var existente = new NotaFiscalEmitida
        {
            Origem    = NotaFiscalOrigem.Comanda,
            ComandaId = comanda.Id,
            Status    = NotaFiscalStatus.PendenteEmissao,
        };
        db.NotasFiscaisEmitidas.Add(existente);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var resultado = await service.EmitirParaComandaAsync(comanda.Id);

        resultado.Id.Should().Be(existente.Id);
        resultado.TentativasReprocessamento.Should().Be(1); // virou reprocessamento na mesma linha
        db.NotasFiscaisEmitidas.Count().Should().Be(1);
    }

    // ── Mapeamento de CSOSN (MontarIcmsSimplesNacional) ───────────────────────

    private static NfceEmissionService.ItemFiscal Item(string? csosn, decimal? percentualCredito = null) =>
        new(Nome: "Item Teste", Ncm: "95044000", Cfop: "5102", Csosn: csosn,
            PercentualCreditoSn: percentualCredito, Quantidade: 1, PrecoUnitarioCentavos: 1000, SubtotalCentavos: 1000);

    [Theory]
    [InlineData("102", Csosnicms.Csosn102)]
    [InlineData(null,  Csosnicms.Csosn102)]
    [InlineData("",    Csosnicms.Csosn102)]
    [InlineData("103", Csosnicms.Csosn103)]
    [InlineData("300", Csosnicms.Csosn300)]
    [InlineData("400", Csosnicms.Csosn400)]
    public void MontarIcmsSimplesNacional_CodigosSemCredito_UsamClasseICMSSN102(string? csosn, Csosnicms esperado)
    {
        var icms = NfceEmissionService.MontarIcmsSimplesNacional(Item(csosn));

        icms.Should().BeOfType<ICMSSN102>();
        ((ICMSSN102)icms).CSOSN.Should().Be(esperado);
    }

    [Fact]
    public void MontarIcmsSimplesNacional_Csosn101_CalculaCreditoCorretamente()
    {
        var icms = NfceEmissionService.MontarIcmsSimplesNacional(Item("101", percentualCredito: 2.5m));

        var sn101 = icms.Should().BeOfType<ICMSSN101>().Subject;
        sn101.CSOSN.Should().Be(Csosnicms.Csosn101);
        sn101.pCredSN.Should().Be(2.5m);
        sn101.vCredICMSSN.Should().Be(0.25m); // R$10,00 (1000 centavos) * 2,5% = R$0,25
    }

    [Fact]
    public void MontarIcmsSimplesNacional_Csosn500_UsaClasseICMSSN500()
    {
        var icms = NfceEmissionService.MontarIcmsSimplesNacional(Item("500"));

        icms.Should().BeOfType<ICMSSN500>().Which.CSOSN.Should().Be(Csosnicms.Csosn500);
    }

    [Fact]
    public void MontarIcmsSimplesNacional_Csosn900_UsaClasseICMSSN900()
    {
        var icms = NfceEmissionService.MontarIcmsSimplesNacional(Item("900"));

        icms.Should().BeOfType<ICMSSN900>().Which.CSOSN.Should().Be(Csosnicms.Csosn900);
    }

    [Theory]
    [InlineData("201")]
    [InlineData("202")]
    [InlineData("203")]
    public void MontarIcmsSimplesNacional_CsosnComIcmsSt_LancaFiscalNaoConfigurado(string csosn)
    {
        var act = () => NfceEmissionService.MontarIcmsSimplesNacional(Item(csosn));

        act.Should().Throw<FiscalNaoConfiguradoException>().WithMessage("*ICMS-ST*");
    }

    [Fact]
    public void MontarIcmsSimplesNacional_CsosnDesconhecido_LancaFiscalNaoConfigurado()
    {
        var act = () => NfceEmissionService.MontarIcmsSimplesNacional(Item("999"));

        act.Should().Throw<FiscalNaoConfiguradoException>();
    }

    // ── Sanitização de NCM/CFOP (bug real: cadastro com pontuação ia direto pro XML) ──

    [Theory]
    [InlineData("84743100",   "84743100")] // já limpo
    [InlineData("8474.31.00", "84743100")] // formato do placeholder antigo do formulário
    [InlineData(" 8474 3100 ", "84743100")] // espaço também some
    [InlineData(null,         "")]
    [InlineData("",           "")]
    public void SanitizeNcm_RemoveTudoQueNaoEDigito(string? entrada, string esperado)
    {
        NfceEmissionService.SanitizeNcm(entrada).Should().Be(esperado);
    }

    [Theory]
    [InlineData("1234567")]   // 7 dígitos
    [InlineData("123456789")] // 9 dígitos
    [InlineData("")]
    public void SanitizeNcm_ForaDe8Digitos_NaoEhValidoPraEmissao(string entrada)
    {
        // A validação de 8 dígitos mora no controller (CarregarDados*Async) — aqui só
        // confirma que o sanitizador não "conserta" quantidade errada de dígitos sozinho.
        NfceEmissionService.SanitizeNcm(entrada).Length.Should().NotBe(8);
    }

    [Theory]
    [InlineData("5102", 5102)]
    [InlineData(" 5102 ", 5102)]
    [InlineData("5.102", 5102)]
    public void ParseCfop_AceitaComOuSemPontuacao(string entrada, int esperado)
    {
        NfceEmissionService.ParseCfop(entrada).Should().Be(esperado);
    }

    [Theory]
    [InlineData("510")]   // 3 dígitos
    [InlineData("51022")] // 5 dígitos
    [InlineData("")]
    [InlineData(null)]
    [InlineData("abcd")]
    public void ParseCfop_ForaDe4Digitos_LancaFiscalNaoConfigurado(string? entrada)
    {
        var act = () => NfceEmissionService.ParseCfop(entrada);

        act.Should().Throw<FiscalNaoConfiguradoException>().WithMessage("*CFOP*");
    }

    // ── Detecção de falha de conectividade (contingência) ─────────────────────

    [Theory]
    [InlineData(typeof(System.Net.Http.HttpRequestException))]
    [InlineData(typeof(System.Net.WebException))]
    [InlineData(typeof(System.Net.Sockets.SocketException))]
    [InlineData(typeof(TimeoutException))]
    [InlineData(typeof(TaskCanceledException))]
    public void EhFalhaDeConectividade_TiposDeRede_RetornaTrue(Type tipoExcecao)
    {
        var ex = (Exception)Activator.CreateInstance(tipoExcecao)!;

        NfceEmissionService.EhFalhaDeConectividade(ex).Should().BeTrue();
    }

    [Fact]
    public void EhFalhaDeConectividade_ExcecaoEmbrulhadaEmInnerException_RetornaTrue()
    {
        var ex = new InvalidOperationException("erro genérico da lib", new System.Net.Http.HttpRequestException("timeout"));

        NfceEmissionService.EhFalhaDeConectividade(ex).Should().BeTrue();
    }

    [Fact]
    public void EhFalhaDeConectividade_ExcecaoDeNegocio_RetornaFalse()
    {
        var ex = new InvalidOperationException("CNPJ inválido");

        NfceEmissionService.EhFalhaDeConectividade(ex).Should().BeFalse();
    }
}
