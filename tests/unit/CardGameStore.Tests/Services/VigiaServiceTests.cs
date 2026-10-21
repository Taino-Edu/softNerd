// =============================================================================
// VigiaServiceTests.cs — Vigia do sistema (Services/Vigia)
// Ciclo de vida dos alertas, gatilhos de pedidos/estoque e erro de tela.
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Vigia;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class VigiaServiceTests
{
    private sealed record Amb(AppDbContext Db, FuncionalidadesService Chaves, User Admin, User Cliente)
    {
        public VigiaService Vigia(params IVerificacaoVigia[] verificacoes) =>
            new(Db, verificacoes, Chaves, NullLogger<VigiaService>.Instance);

        public VigiaService VigiaDePedidos() => Vigia(
            new VerificacaoPixPagoPedidoCancelado(Db), new VerificacaoPedidoPagoSemVenda(Db, Chaves),
            new VerificacaoVendaTravada(Db), new VerificacaoValorPixDiferente(Db),
            new VerificacaoEstoqueNegativo(Db), new VerificacaoPedidoParado(Db));
    }

    private static Amb Criar()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        var admin = new User { Name = "Maikon", Email = "adm@t.com", PasswordHash = "h", Role = UserRole.Admin };
        var cliente = new User { Name = "Lucas", Email = "c@t.com", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.AddRange(admin, cliente);
        db.SaveChanges();
        return new Amb(db, new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions())), admin, cliente);
    }

    private static Product Produto(Amb a, int estoque = 5)
    {
        var p = new Product { Name = "Blister", Category = "Selado", PriceInCents = 5000, StockQuantity = estoque, IsActive = true };
        a.Db.Products.Add(p);
        a.Db.SaveChanges();
        return p;
    }

    private static (ProductReservation Item, PixCobranca Pix) PedidoPago(Amb a, string status = "active", int valor = 5000,
        int? preco = 5000, string? venda = null, int minutosAtras = 30)
    {
        var p = Produto(a);
        var grupo = Guid.NewGuid();
        var item = new ProductReservation
        {
            ReservationGroupId = grupo, UserId = a.Cliente.Id, ProductId = p.Id, Quantity = 1, Kind = "pre_venda",
            Status = status, ExpiresAt = null, PaymentMethod = "pix", UnitPriceInCents = preco, VendaAvulsaId = venda,
        };
        a.Db.ProductReservations.Add(item);
        var pix = new PixCobranca
        {
            Origem = PixCobrancaOrigem.Reserva, ReservationGroupId = grupo, TxId = Guid.NewGuid().ToString("N"),
            ValorEmCentavos = valor, Status = "CONCLUIDA", PagoEm = DateTime.UtcNow.AddMinutes(-minutosAtras),
            CriadoPorAdminId = a.Admin.Id,
            ReservationItemIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { item.Id }),
        };
        a.Db.PixCobrancas.Add(pix);
        a.Db.SaveChanges();
        return (item, pix);
    }

    private sealed class Quebrada : IVerificacaoVigia
    {
        public string Codigo => "quebrada";
        public string Nome => "Verificação quebrada";
        public Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct) => throw new InvalidOperationException("tabela sumiu");
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────

    [Fact]
    public async Task Alerta_AbreSomaEResolveSozinho_SoAvisaUmaVez()
    {
        var a = Criar();
        var (item, pix) = PedidoPago(a, status: "cancelled");
        var vigia = a.VigiaDePedidos();

        await vigia.RodarAsync();
        await vigia.RodarAsync();

        var alerta = await a.Db.AlertasSistema.AsNoTracking().SingleAsync(x => x.Codigo == "pix-pago-pedido-cancelado");
        alerta.Ocorrencias.Should().Be(2);
        alerta.Gravidade.Should().Be(VigiaGravidade.Critico);
        alerta.Chave.Should().Contain(pix.TxId);
        (await a.Db.Notifications.CountAsync(n => n.UserId == a.Admin.Id)).Should().Be(1, "o sininho avisa uma vez, não a cada volta");

        // O admin reativa o pedido: o problema some e o alerta fecha sozinho
        await a.Db.ProductReservations.Where(r => r.Id == item.Id).ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "active"));
        await vigia.RodarAsync();
        var fechado = await a.Db.AlertasSistema.AsNoTracking().SingleAsync(x => x.Codigo == "pix-pago-pedido-cancelado");
        fechado.ResolvidoEm.Should().NotBeNull();
        fechado.ResolvidoPor.Should().Be(AlertaSistema.ResolvidoSozinho);
    }

    [Fact]
    public async Task ResolvidoPeloAdmin_NaoVoltaNaProximaVolta()
    {
        var a = Criar();
        PedidoPago(a, status: "cancelled");
        var vigia = a.VigiaDePedidos();
        await vigia.RodarAsync();
        var alerta = await a.Db.AlertasSistema.SingleAsync();

        await vigia.ResolverAsync(alerta.Id, "Maikon");
        await vigia.RodarAsync();

        (await a.Db.AlertasSistema.CountAsync()).Should().Be(1, "o admin ficou ciente desse caso");
        (await a.Db.AlertasSistema.AsNoTracking().SingleAsync()).ResolvidoPor.Should().Be("Maikon");
    }

    [Fact]
    public async Task VerificacaoQueQuebra_ViraAlerta_ENaoDerrubaAsOutras()
    {
        var a = Criar();
        var p = Produto(a, estoque: -2);
        var vigia = a.Vigia(new Quebrada(), new VerificacaoEstoqueNegativo(a.Db));

        await vigia.RodarAsync();

        var alertas = await a.Db.AlertasSistema.AsNoTracking().ToListAsync();
        alertas.Should().Contain(x => x.Codigo == VigiaService.CodigoFalha && x.Detalhe.Contains("tabela sumiu"));
        alertas.Should().Contain(x => x.Codigo == "estoque-negativo" && x.Titulo.Contains(p.Name));
    }

    [Fact]
    public async Task ChaveDesligada_NaoRodaNemRegistraErroDeTela()
    {
        var a = Criar();
        await a.Chaves.DefinirAsync(Funcionalidades.VigiaSistema, false, a.Admin.Id);
        Produto(a, estoque: -1);
        var vigia = a.VigiaDePedidos();

        await vigia.RodarAsync();
        await vigia.RegistrarErroTelaAsync("boom", "/cliente", null, null, null);

        (await a.Db.AlertasSistema.CountAsync()).Should().Be(0);
    }

    // ── Erro de tela ─────────────────────────────────────────────────────────

    [Fact]
    public async Task ErroDeTela_MesmoErroNaMesmaTela_UmAlertaSoComOcorrencias()
    {
        var a = Criar();
        var vigia = a.Vigia();

        await vigia.RegistrarErroTelaAsync("Cannot read properties of null (reading 'mesa')",
            "/liga/jogar?t=abc", null, a.Cliente.Id, "Mozilla/5.0 Android");
        await vigia.RegistrarErroTelaAsync("Cannot read properties of null (reading 'mesa')",
            "/liga/jogar?t=xyz", "stack…", null, null);
        await vigia.RegistrarErroTelaAsync("Outro erro", "/liga/jogar", null, null, null);

        var alertas = await a.Db.AlertasSistema.AsNoTracking().Where(x => x.Codigo == VigiaService.CodigoErroTela).ToListAsync();
        alertas.Should().HaveCount(2, "agrupa por tela + mensagem, ignorando a query");
        alertas.Single(x => x.Detalhe.Contains("reading 'mesa'")).Ocorrencias.Should().Be(2);
        alertas.Should().OnlyContain(x => x.Link == null, "rota vinda do navegador não vira link pro admin");
        (await a.Db.Notifications.CountAsync()).Should().Be(1, "erro de tela vai pro sininho no máximo 1 vez por hora");
        (await a.Db.Notifications.SingleAsync()).Body.Should().NotContain("reading 'mesa'", "texto do navegador não vai pro sininho");
        alertas.Single(x => x.Detalhe.Contains("reading 'mesa'")).Detalhe.Should().NotContain("stack…", "o 1º relato fica; os seguintes só somam");
    }

    [Fact]
    public async Task ErroDeTela_AcimaDoTeto_SomaNumAlertaDeExcesso()
    {
        var a = Criar();
        var vigia = a.Vigia();
        for (var i = 0; i < VigiaService.MaxErrosTelaAbertos + 5; i++)
            await vigia.RegistrarErroTelaAsync($"erro {i}", "/x", null, null, null);

        var abertos = await a.Db.AlertasSistema.AsNoTracking().Where(x => x.Codigo == VigiaService.CodigoErroTela).ToListAsync();
        abertos.Should().HaveCount(VigiaService.MaxErrosTelaAbertos + 1, "o excesso soma num alerta só");
        abertos.Single(x => x.Chave.EndsWith(":excesso")).Ocorrencias.Should().Be(5);
    }

    [Theory]
    [InlineData("/campeonato/3f2b8c1e-1d2c-4b5a-9e8f-1a2b3c4d5e6f/inscricao", "/campeonato/:id/inscricao")]
    [InlineData("/mesa/12?x=1", "/mesa/:id")]
    [InlineData("liga", "/liga")]
    [InlineData("//golpe.com/login", "/(rota inválida)")]
    [InlineData("/a\\b<script>", "/(rota inválida)")]
    public void ErroDeTela_RotaSemIdNemQuery(string rota, string esperado) =>
        VigiaService.NormalizarRota(rota).Should().Be(esperado);

    // ── Gatilhos de pedidos ──────────────────────────────────────────────────

    [Fact]
    public async Task PedidoPagoSemVenda_SoDepoisDe15Minutos()
    {
        var a = Criar();
        PedidoPago(a, minutosAtras: 5);
        PedidoPago(a, minutosAtras: 40);

        await a.VigiaDePedidos().RodarAsync();

        (await a.Db.AlertasSistema.CountAsync(x => x.Codigo == "pedido-pago-sem-venda")).Should().Be(1,
            "o de 5 minutos ainda pode estar registrando a venda");
    }

    [Fact]
    public async Task PedidoComVenda_ESemDiferenca_NaoAlerta()
    {
        var a = Criar();
        PedidoPago(a, venda: "venda-1");

        await a.VigiaDePedidos().RodarAsync();

        (await a.Db.AlertasSistema.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task VendaTravada_EValorDiferente_Alertam()
    {
        var a = Criar();
        PedidoPago(a, venda: PedidoVendaService.Registrando + "tx9");
        PedidoPago(a, valor: 4000, venda: "venda-2"); // pagou 40, o pedido soma 50

        await a.VigiaDePedidos().RodarAsync();

        var codigos = await a.Db.AlertasSistema.Select(x => x.Codigo).ToListAsync();
        codigos.Should().Contain(["venda-travada", "pix-valor-diferente"]);
    }

    [Fact]
    public async Task PedidoParado_SoRegistra_SemSininho()
    {
        var a = Criar();
        var p = Produto(a);
        a.Db.ProductReservations.Add(new ProductReservation
        {
            ReservationGroupId = Guid.NewGuid(), UserId = a.Cliente.Id, ProductId = p.Id, Quantity = 1,
            Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow, ReservedAt = DateTime.UtcNow.AddDays(-5),
        });
        a.Db.SaveChanges();

        await a.VigiaDePedidos().RodarAsync();

        var alerta = await a.Db.AlertasSistema.SingleAsync();
        (alerta.Codigo, alerta.Gravidade).Should().Be(("pedido-parado", VigiaGravidade.Info));
        (await a.Db.Notifications.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Listar_FiltraPorStatusEBusca()
    {
        var a = Criar();
        Produto(a, estoque: -1);
        var vigia = a.VigiaDePedidos();
        await vigia.RodarAsync();
        await vigia.RegistrarErroTelaAsync("boom", "/cliente", null, null, null);

        (await vigia.ListarAsync(null, null, null, "blister")).Should().ContainSingle(x => x.Codigo == "estoque-negativo");
        (await vigia.ListarAsync(null, VigiaGravidade.Aviso, null, null)).Should().ContainSingle(x => x.Codigo == VigiaService.CodigoErroTela);
        (await vigia.ListarAsync("resolvidos", null, null, null)).Should().BeEmpty();
        (await vigia.ResumoAsync()).Should().Match<ResumoVigia>(r => r.Abertos == 2 && r.Criticos == 1 && r.Avisos == 1);
    }

    // ── Gatilhos da operação (v1.63.2) ───────────────────────────────────────

    private static Comanda Comanda(Amb a, int horasAtras, ComandaStatus status = ComandaStatus.EmAndamento)
    {
        var c = new Comanda { UserId = a.Cliente.Id, TableIdentifier = "4", Status = status,
            OpenedAt = DateTime.UtcNow.AddHours(-horasAtras), TotalInCents = 4500 };
        a.Db.Comandas.Add(c);
        a.Db.SaveChanges();
        return c;
    }

    [Fact]
    public async Task ComandaEsquecida_SoDepoisDe12Horas_EFechadaNaoConta()
    {
        var a = Criar();
        var velha = Comanda(a, 13);
        Comanda(a, 2);
        Comanda(a, 30, ComandaStatus.Fechada);

        var achados = await new VerificacaoComandaEsquecida(a.Db).VerificarAsync(default);

        achados.Should().ContainSingle().Which.Referencia.Should().Be(velha.Id.ToString());
    }

    [Fact]
    public async Task PixDeComandaPago_EComandaAberta_Critico()
    {
        var a = Criar();
        var aberta = Comanda(a, 1);
        var fechada = Comanda(a, 1, ComandaStatus.Fechada);
        foreach (var c in new[] { aberta, fechada })
            a.Db.PixCobrancas.Add(new PixCobranca
            {
                Origem = PixCobrancaOrigem.Comanda, ComandaId = c.Id, TxId = Guid.NewGuid().ToString("N"),
                ValorEmCentavos = 4500, Status = "CONCLUIDA", PagoEm = DateTime.UtcNow.AddMinutes(-30), CriadoPorAdminId = a.Admin.Id,
            });
        a.Db.SaveChanges();

        var achados = await new VerificacaoPixComandaSemFechar(a.Db).VerificarAsync(default);

        achados.Should().ContainSingle().Which.Gravidade.Should().Be(VigiaGravidade.Critico);
    }

    [Fact]
    public async Task NfceRejeitada_EPendenteParada_Alertam_AutorizadaNao()
    {
        var a = Criar();
        a.Db.NotasFiscaisEmitidas.AddRange(
            new NotaFiscalEmitida { Status = NotaFiscalStatus.Rejeitada, MotivoRejeicao = "539 - Duplicidade", ValorTotalEmCentavos = 1000 },
            new NotaFiscalEmitida { Status = NotaFiscalStatus.PendenteEmissao, ValorTotalEmCentavos = 2000, UpdatedAt = DateTime.UtcNow.AddHours(-3) },
            new NotaFiscalEmitida { Status = NotaFiscalStatus.PendenteEmissao, ValorTotalEmCentavos = 3000, UpdatedAt = DateTime.UtcNow.AddMinutes(-10) },
            new NotaFiscalEmitida { Status = NotaFiscalStatus.Autorizada, ValorTotalEmCentavos = 4000 });
        a.Db.SaveChanges();

        var achados = await new VerificacaoNfceComProblema(a.Db).VerificarAsync(default);

        achados.Should().HaveCount(2);
        achados.Should().Contain(x => x.Detalhe.Contains("539 - Duplicidade"));
    }

    [Fact]
    public async Task TorneioEmAndamentoHaMaisDe12Horas_Alerta()
    {
        var a = Criar();
        a.Db.Championships.AddRange(
            new Championship { Name = "Liguinha esquecida", Game = "Pokemon", StartDate = DateTime.UtcNow.AddHours(-20), Status = ChampionshipStatus.EmAndamento, RodadaAtual = 3 },
            new Championship { Name = "Liguinha de agora", Game = "Pokemon", StartDate = DateTime.UtcNow.AddHours(-2), Status = ChampionshipStatus.EmAndamento });
        a.Db.SaveChanges();

        var achados = await new VerificacaoTorneioNaoEncerrado(a.Db).VerificarAsync(default);

        achados.Should().ContainSingle().Which.Titulo.Should().Contain("esquecida");
    }

    [Fact]
    public async Task Robos_ParadoOuFalhandoAlerta_OSaudavelNao()
    {
        BatimentoRobos.Limpar();
        try
        {
            BatimentoRobos.Iniciou("saudável", TimeSpan.Zero, TimeSpan.FromMinutes(5));
            BatimentoRobos.Bateu("saudável");
            // Parado: começou há 1 h com espera de 1 min e intervalo de 5 — nunca completou volta
            BatimentoRobos.Definir(new EstadoRobo("parado", DateTime.UtcNow.AddHours(-1), TimeSpan.FromMinutes(1),
                TimeSpan.FromMinutes(5), UltimaVoltaOk: null, FalhasSeguidas: 0, UltimoErro: null));
            BatimentoRobos.Iniciou("falhando", TimeSpan.Zero, TimeSpan.FromMinutes(5));
            for (var i = 0; i < VerificacaoRobosParados.FalhasParaAlertar; i++)
                BatimentoRobos.Falhou("falhando", new InvalidOperationException("Inter fora do ar"));

            var achados = await new VerificacaoRobosParados().VerificarAsync(default);

            achados.Select(x => x.Referencia).Should().BeEquivalentTo(["parado", "falhando"]);
            achados.Single(x => x.Referencia == "falhando").Detalhe.Should().Contain("Inter fora do ar");
        }
        finally { BatimentoRobos.Limpar(); }
    }
}
