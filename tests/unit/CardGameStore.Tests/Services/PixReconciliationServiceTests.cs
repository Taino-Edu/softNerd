// =============================================================================
// PixReconciliationServiceTests.cs — Testes unitários do PixReconciliationService
// InterSyncService mockado (ConsultarCobrancaAsync virtual) — sem chamada HTTP.
// Executar: dotnet test  (na pasta tests/unit/CardGameStore.Tests)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class PixReconciliationServiceTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    // SQLite in-memory (mesmo motivo do ComandaServiceTests: converter de enum
    // quebra o EF InMemory no Update). Cada teste tem sua própria conexão aberta.
    private static AppDbContext CreateDb(string _)
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .Options;
        var db = new AppDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private static Mock<InterSyncService> CreateInterMock(string status)
    {
        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();

        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);

        inter.Setup(i => i.ConsultarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Status = status });
        return inter;
    }

    private static PixReconciliationService CreateService(
        AppDbContext db, InterSyncService inter, IComandaService comanda, IEmailService? email = null) =>
        new(db, inter, comanda,
            email ?? new Mock<IEmailService>().Object,
            NullLogger<PixReconciliationService>.Instance);

    private static async Task<User> SeedBaseAsync(AppDbContext db)
    {
        var user = new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Cliente Teste",
            Email        = "cliente@test.com",
            PasswordHash = "hash",
            Role         = UserRole.Customer,
        };
        db.Users.Add(user);
        db.IntegrationConfigs.Add(new IntegrationConfig { Source = "inter" });
        await db.SaveChangesAsync();
        return user;
    }

    private static PixCobranca NovaCobranca(PixCobrancaOrigem origem, int valorEmCentavos = 10000) =>
        new()
        {
            Origem           = origem,
            TxId             = Guid.NewGuid().ToString("N"),
            ValorEmCentavos  = valorEmCentavos,
            Status           = "ATIVA",
            CriadoPorAdminId = Guid.NewGuid(),
        };

    // ── Crediário ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Reconciliar_CrediarioPago_RegistraPagamentoEQuita()
    {
        var db   = CreateDb(nameof(Reconciliar_CrediarioPago_RegistraPagamentoEQuita));
        var user = await SeedBaseAsync(db);

        var crediario = new Crediario
        {
            UserId          = user.Id,
            ValorEmCentavos = 10000,
            DataVencimento  = DateTime.UtcNow.AddDays(30),
        };
        db.Crediarios.Add(crediario);
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario);
        pix.CrediarioId = crediario.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);
        var adminId = Guid.NewGuid();

        var result = await service.ReconciliarAsync(pix, adminId);

        result.BaixaEfetuada.Should().BeTrue();
        result.Status.Should().Be("CONCLUIDA");
        pix.PagoEm.Should().NotBeNull();

        crediario.Status.Should().Be(CrediariosStatus.Pago);
        crediario.ValorPagoEmCentavos.Should().Be(10000);
        crediario.PagoPorAdminId.Should().Be(adminId);

        var pagamentos = await db.PagamentosCrediario.Where(p => p.CrediarioId == crediario.Id).ToListAsync();
        pagamentos.Should().HaveCount(1);
        pagamentos[0].FormaPagamento.Should().Be("Pix");
        pagamentos[0].AdminId.Should().Be(adminId);
    }

    [Fact]
    public async Task Reconciliar_Crediario_SegundaChamadaNaoDuplicaPagamento()
    {
        var db   = CreateDb(nameof(Reconciliar_Crediario_SegundaChamadaNaoDuplicaPagamento));
        var user = await SeedBaseAsync(db);

        var crediario = new Crediario
        {
            UserId          = user.Id,
            ValorEmCentavos = 10000,
            DataVencimento  = DateTime.UtcNow.AddDays(30),
        };
        db.Crediarios.Add(crediario);
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario);
        pix.CrediarioId = crediario.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var inter   = CreateInterMock("CONCLUIDA");
        var service = CreateService(db, inter.Object, new Mock<IComandaService>().Object);

        await service.ReconciliarAsync(pix);
        var segunda = await service.ReconciliarAsync(pix);

        segunda.BaixaEfetuada.Should().BeFalse("PagoEm preenchido = baixa já feita");
        (await db.PagamentosCrediario.CountAsync(p => p.CrediarioId == crediario.Id))
            .Should().Be(1, "pagamento não pode duplicar em reconciliação repetida");
        crediario.ValorPagoEmCentavos.Should().Be(10000);

        // Segunda chamada nem consulta o Inter — corta na guarda de PagoEm.
        inter.Verify(i => i.ConsultarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()), Times.Once);
    }

    // ── Comanda ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Reconciliar_ComandaPaga_FechaComandaViaServico()
    {
        var db   = CreateDb(nameof(Reconciliar_ComandaPaga_FechaComandaViaServico));
        var user = await SeedBaseAsync(db);

        var comanda = new Comanda { UserId = user.Id, Status = ComandaStatus.Aberta };
        db.Comandas.Add(comanda);
        var pix = NovaCobranca(PixCobrancaOrigem.Comanda);
        pix.ComandaId = comanda.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var comandaSvc = new Mock<IComandaService>();
        comandaSvc.Setup(c => c.CloseComandaAsync(
                comanda.Id, It.IsAny<Guid>(), "Pix",
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(),
                It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<bool>(), It.IsAny<DateTime?>()))
            .ReturnsAsync(new ComandaDto { Id = comanda.Id });

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, comandaSvc.Object);
        var result  = await service.ReconciliarAsync(pix);

        result.BaixaEfetuada.Should().BeTrue();
        result.ComandaFechada.Should().NotBeNull();
        // Quem assina é o admin passado ou, sem ele, o CriadoPorAdminId da cobrança.
        comandaSvc.Verify(c => c.CloseComandaAsync(
            comanda.Id, pix.CriadoPorAdminId, "Pix",
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(),
            It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<bool>(), It.IsAny<DateTime?>()), Times.Once);
    }

    [Fact]
    public async Task Reconciliar_ComandaJaFechada_NaoFechaDeNovo()
    {
        var db   = CreateDb(nameof(Reconciliar_ComandaJaFechada_NaoFechaDeNovo));
        var user = await SeedBaseAsync(db);

        var comanda = new Comanda { UserId = user.Id, Status = ComandaStatus.Fechada };
        db.Comandas.Add(comanda);
        var pix = NovaCobranca(PixCobrancaOrigem.Comanda);
        pix.ComandaId = comanda.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var comandaSvc = new Mock<IComandaService>();
        var service    = CreateService(db, CreateInterMock("CONCLUIDA").Object, comandaSvc.Object);
        var result     = await service.ReconciliarAsync(pix);

        result.BaixaEfetuada.Should().BeTrue();
        result.ComandaFechada.Should().BeNull();
        comandaSvc.Verify(c => c.CloseComandaAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(),
            It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<bool>(), It.IsAny<DateTime?>()), Times.Never,
            "comanda já fechada por outro caminho não pode ser fechada de novo (pontos duplicados)");
    }

    // ── Campeonato ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Reconciliar_InscricaoPaga_MarcaEntryFeeEIdempotente()
    {
        var db   = CreateDb(nameof(Reconciliar_InscricaoPaga_MarcaEntryFeeEIdempotente));
        var user = await SeedBaseAsync(db);

        var championship = new Championship { Name = "Torneio Teste", Game = "Magic", EntryFeeInCents = 5000 };
        db.Championships.Add(championship);
        var participant = new ChampionshipParticipant
        {
            ChampionshipId = championship.Id,
            UserId         = user.Id,
        };
        db.ChampionshipParticipants.Add(participant);
        var pix = NovaCobranca(PixCobrancaOrigem.Campeonato, 5000);
        pix.ChampionshipParticipantId = participant.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);

        await service.ReconciliarAsync(pix);

        participant.EntryFeePaidAt.Should().NotBeNull();
        participant.EntryFeePaymentMethod.Should().Be("Pix");

        // Reconciliação repetida não reescreve a data original do pagamento.
        var pagoEmOriginal = participant.EntryFeePaidAt;
        await service.ReconciliarAsync(pix);
        participant.EntryFeePaidAt.Should().Be(pagoEmOriginal);
    }

    // ── Reserva (pré-venda) ───────────────────────────────────────────────────

    [Fact]
    public async Task Reconciliar_ReservaPaga_LimpaExpiracaoEDeduplicaLancamento()
    {
        var db   = CreateDb(nameof(Reconciliar_ReservaPaga_LimpaExpiracaoEDeduplicaLancamento));
        var user = await SeedBaseAsync(db);

        var product = new Product
        {
            Name          = "Booster Box",
            Category      = "Selado",
            PriceInCents  = 50000,
            StockQuantity = 0,
            IsActive      = true,
        };
        db.Products.Add(product);

        var groupId = Guid.NewGuid();
        var reserva = new ProductReservation
        {
            ReservationGroupId = groupId,
            UserId             = user.Id,
            ProductId          = product.Id,
            Kind               = "pre_venda",
            Status             = "active",
            ExpiresAt          = DateTime.UtcNow.AddHours(-1), // já vencida — pagou em cima da hora
        };
        db.ProductReservations.Add(reserva);
        var pix = NovaCobranca(PixCobrancaOrigem.Reserva, 50000);
        pix.ReservationGroupId = groupId;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);

        await service.ReconciliarAsync(pix);

        reserva.ExpiresAt.Should().BeNull("pré-venda paga vira venda feita — não expira mais");
        (await db.ExternalTransactions.CountAsync(x => x.ExternalId == pix.TxId))
            .Should().Be(1);

        // Robô e tela confirmando quase juntos: segundo passe não duplica o lançamento.
        await service.ReconciliarAsync(pix);
        (await db.ExternalTransactions.CountAsync(x => x.ExternalId == pix.TxId))
            .Should().Be(1);
    }

    // ── Casos sem baixa ───────────────────────────────────────────────────────

    [Fact]
    public async Task Reconciliar_AindaAtiva_NaoExecutaBaixa()
    {
        var db   = CreateDb(nameof(Reconciliar_AindaAtiva_NaoExecutaBaixa));
        var user = await SeedBaseAsync(db);

        var crediario = new Crediario
        {
            UserId          = user.Id,
            ValorEmCentavos = 10000,
            DataVencimento  = DateTime.UtcNow.AddDays(30),
        };
        db.Crediarios.Add(crediario);
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario);
        pix.CrediarioId = crediario.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("ATIVA").Object, new Mock<IComandaService>().Object);
        var result  = await service.ReconciliarAsync(pix);

        result.BaixaEfetuada.Should().BeFalse();
        result.Status.Should().Be("ATIVA");
        pix.PagoEm.Should().BeNull();
        (await db.PagamentosCrediario.CountAsync()).Should().Be(0);
        crediario.Status.Should().Be(CrediariosStatus.Aberto);
    }

    [Fact]
    public async Task Reconciliar_VendaAvulsa_PagaMasSemBaixaAutomatizada()
    {
        var db = CreateDb(nameof(Reconciliar_VendaAvulsa_PagaMasSemBaixaAutomatizada));
        await SeedBaseAsync(db);

        var pix = NovaCobranca(PixCobrancaOrigem.VendaAvulsa);
        pix.VendaAvulsaId = "mongo-doc-id";
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);
        var result  = await service.ReconciliarAsync(pix);

        // Origem existe no enum mas nenhum fluxo gera cobrança com ela — só marca e loga.
        result.BaixaEfetuada.Should().BeTrue();
        pix.PagoEm.Should().NotBeNull();
        (await db.ExternalTransactions.CountAsync()).Should().Be(0);
        (await db.PagamentosCrediario.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Reconciliar_ErroNaConsulta_NaoTocaNaCobranca()
    {
        var db = CreateDb(nameof(Reconciliar_ErroNaConsulta_NaoTocaNaCobranca));
        await SeedBaseAsync(db);

        var pix = NovaCobranca(PixCobrancaOrigem.VendaAvulsa);
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);
        inter.Setup(i => i.ConsultarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Error = "timeout" });

        var service = CreateService(db, inter.Object, new Mock<IComandaService>().Object);
        var result  = await service.ReconciliarAsync(pix);

        result.Error.Should().Be("timeout");
        result.BaixaEfetuada.Should().BeFalse();
        pix.PagoEm.Should().BeNull();
        pix.Status.Should().Be("ATIVA", "falha na consulta deixa a cobrança pra próxima tentativa");
    }
}
