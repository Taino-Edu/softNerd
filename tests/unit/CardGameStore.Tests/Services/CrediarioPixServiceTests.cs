// =============================================================================
// CrediarioPixServiceTests.cs — Cobrança Pix do crediário e link de pagamento
// InterSyncService mockado (CriarCobrancaAsync não é virtual → testa só o que não
// chama o Inter: reaproveitamento, conta quitada, tokens e o link no aviso).
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class CrediarioPixServiceTests
{
    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static IConfiguration Config() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["SmtpSettings:AppUrl"] = "https://loja.test/" })
            .Build();

    private static CrediarioPixService CreateService(AppDbContext db)
    {
        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);

        return new CrediarioPixService(db, inter.Object, new Mock<IPixReconciliationService>().Object,
            Config(), NullLogger<CrediarioPixService>.Instance);
    }

    private static (User, Crediario) Seed(AppDbContext db, int valor = 10000, int pago = 0)
    {
        var user = new User { Id = Guid.NewGuid(), Name = "Pietro Souza", PasswordHash = "h", Role = UserRole.Customer };
        var conta = new Crediario
        {
            UserId = user.Id, ValorEmCentavos = valor, ValorPagoEmCentavos = pago,
            DataVencimento = DateTime.UtcNow.AddDays(10),
            Status = pago >= valor ? CrediariosStatus.Pago : CrediariosStatus.Aberto,
        };
        db.Users.Add(user);
        db.Crediarios.Add(conta);
        db.SaveChanges();
        return (user, conta);
    }

    [Fact]
    public void NovaConta_JaNasceComTokenDe32Hex()
    {
        var c = new Crediario();
        c.PagamentoToken.Should().MatchRegex("^[0-9a-f]{32}$");
        new Crediario().PagamentoToken.Should().NotBe(c.PagamentoToken);
    }

    [Fact]
    public async Task GarantirTokens_ContaAntigaSemToken_GanhaUm()
    {
        var db = CreateDb();
        var (_, conta) = Seed(db);
        conta.PagamentoToken = null;
        await db.SaveChangesAsync();

        (await CrediarioPixService.GarantirTokensAsync(db)).Should().Be(1);
        (await CrediarioPixService.GarantirTokensAsync(db)).Should().Be(0);
        db.ChangeTracker.Clear();
        (await db.Crediarios.FindAsync(conta.Id))!.PagamentoToken.Should().NotBeNull();
    }

    [Fact]
    public async Task ObterOuGerar_CobrancaAtivaDoMesmoSaldo_Reaproveita()
    {
        var db = CreateDb();
        var (_, conta) = Seed(db, valor: 10000, pago: 2500);
        var ativa = new PixCobranca
        {
            Origem = PixCobrancaOrigem.Crediario, CrediarioId = conta.Id, TxId = "tx-ativa",
            ValorEmCentavos = 7500, Status = "ATIVA", CriadoPorAdminId = Guid.NewGuid(),
            ExpiraEm = DateTime.UtcNow.AddMinutes(40),
        };
        db.PixCobrancas.Add(ativa);
        await db.SaveChangesAsync();

        var r = await CreateService(db).ObterOuGerarAsync(conta.Id, criadoPor: null);

        r.Pix.Should().NotBeNull();
        r.Pix!.TxId.Should().Be("tx-ativa", "não abre outra cobrança no Inter a cada clique");
        (await db.PixCobrancas.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task ObterOuGerar_ContaQuitada_Recusa()
    {
        var db = CreateDb();
        var (_, conta) = Seed(db, valor: 5000, pago: 5000);

        var r = await CreateService(db).ObterOuGerarAsync(conta.Id, criadoPor: null);

        r.Pix.Should().BeNull();
        r.Erro.Should().Contain("quitada");
    }

    [Theory]
    [InlineData(50, "mínimo")]
    [InlineData(20000, "passa do que falta")]
    public async Task ObterOuGerar_ValorEscolhidoForaDoLimite_Recusa(int valor, string mensagem)
    {
        var db = CreateDb();
        var (_, conta) = Seed(db, valor: 10000);

        var r = await CreateService(db).ObterOuGerarAsync(conta.Id, criadoPor: null, valorEmCentavos: valor);

        r.Pix.Should().BeNull();
        r.Erro.Should().Contain(mensagem);
    }

    [Fact]
    public async Task ObterOuGerar_ValorParcialComCobrancaAtivaIgual_Reaproveita()
    {
        var db = CreateDb();
        var (_, conta) = Seed(db, valor: 10000);
        db.PixCobrancas.Add(new PixCobranca
        {
            Origem = PixCobrancaOrigem.Crediario, CrediarioId = conta.Id, TxId = "tx-parcial",
            ValorEmCentavos = 3000, Status = "ATIVA", CriadoPorAdminId = Guid.NewGuid(),
            ExpiraEm = DateTime.UtcNow.AddMinutes(40),
        });
        await db.SaveChangesAsync();

        var r = await CreateService(db).ObterOuGerarAsync(conta.Id, criadoPor: null, valorEmCentavos: 3000);

        r.Pix!.TxId.Should().Be("tx-parcial");
    }

    [Fact]
    public async Task ObterOuGerar_Tudo_ReaproveitaSoACobrancaDasMesmasContas()
    {
        var db = CreateDb();
        var (user, conta) = Seed(db, valor: 10000);
        var outra = new Crediario { UserId = user.Id, ValorEmCentavos = 4000, DataVencimento = DateTime.UtcNow.AddDays(30) };
        db.Crediarios.Add(outra);
        var ids = System.Text.Json.JsonSerializer.Serialize(new[] { conta.Id, outra.Id });
        db.PixCobrancas.AddRange(
            new PixCobranca { Origem = PixCobrancaOrigem.Crediario, CrediarioId = conta.Id, TxId = "tx-so-esta",
                ValorEmCentavos = 14000, Status = "ATIVA", CriadoPorAdminId = Guid.NewGuid(), ExpiraEm = DateTime.UtcNow.AddMinutes(40) },
            new PixCobranca { Origem = PixCobrancaOrigem.Crediario, CrediarioId = conta.Id, TxId = "tx-tudo", CrediarioIdsJson = ids,
                ValorEmCentavos = 14000, Status = "ATIVA", CriadoPorAdminId = Guid.NewGuid(), ExpiraEm = DateTime.UtcNow.AddMinutes(40) });
        await db.SaveChangesAsync();

        var r = await CreateService(db).ObterOuGerarAsync(conta.Id, criadoPor: null, todasDoCliente: true);

        r.Pix!.TxId.Should().Be("tx-tudo");
    }

    [Fact]
    public void LinkPagamento_UsaAUrlDoSite()
    {
        CrediarioPixService.LinkPagamento(Config(), "abc").Should().Be("https://loja.test/pagar/abc");
    }

    [Fact]
    public void MontarMensagem_ComLinkPix_IncluiOLink()
    {
        var user  = new User { Name = "Pietro Souza" };
        var conta = new Crediario { ValorEmCentavos = 5000, DataVencimento = CrediarioLancamentos.VencimentoFimDoDia(new DateTime(2026, 10, 10)) };

        var (_, texto) = CrediarioAvisoService.MontarMensagem(
            user, new List<Crediario> { conta }, new List<Crediario> { conta }, new DateTime(2026, 10, 10),
            "Santuário Nerd", null, c => $"https://loja.test/pagar/{c.PagamentoToken}");

        texto.Should().Contain($"https://loja.test/pagar/{conta.PagamentoToken}");
        texto.Should().Contain("Pague por Pix na hora");
    }
}
