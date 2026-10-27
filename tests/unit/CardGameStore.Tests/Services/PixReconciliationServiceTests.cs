// =============================================================================
// PixReconciliationServiceTests.cs — Testes unitários do PixReconciliationService
// InterSyncService mockado (ConsultarCobrancaAsync virtual) — sem chamada HTTP.
// Executar: dotnet test  (na pasta tests/unit/CardGameStore.Tests)
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
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
        AppDbContext db, InterSyncService inter, IComandaService comanda,
        IEmailService? email = null, IPushService? push = null,
        PedidoVendaService? pedidoVenda = null) =>
        new(db, inter, comanda,
            email ?? new Mock<IEmailService>().Object,
            push ?? new Mock<IPushService>().Object,
            NullLogger<PixReconciliationService>.Instance,
            pedidoVenda);

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
    public async Task Reconciliar_CrediarioJaQuitadoPorOutroMeio_RegistraPixEViraCredito()
    {
        var db   = CreateDb(nameof(Reconciliar_CrediarioJaQuitadoPorOutroMeio_RegistraPixEViraCredito));
        var user = await SeedBaseAsync(db);

        // QR gerado, cliente acertou em dinheiro no balcão e depois pagou o Pix também
        var crediario = new Crediario
        {
            UserId              = user.Id,
            ValorEmCentavos     = 10000,
            ValorPagoEmCentavos = 10000,
            Status              = CrediariosStatus.Pago,
            DataVencimento      = DateTime.UtcNow.AddDays(30),
        };
        db.Crediarios.Add(crediario);
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario);
        pix.CrediarioId = crediario.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);
        await service.ReconciliarAsync(pix);

        var pagamentos = await db.PagamentosCrediario.Where(p => p.CrediarioId == crediario.Id).ToListAsync();
        pagamentos.Should().ContainSingle(p => p.ValorEmCentavos == 10000,
            "o dinheiro caiu no Inter — tem que aparecer no extrato");
        (await db.Users.FindAsync(user.Id))!.BalanceInCents.Should().Be(10000,
            "o que passou do saldo vira crédito do cliente");
    }

    [Fact]
    public async Task Reconciliar_PixMaiorQueSaldo_QuitaEExcedenteViraCredito()
    {
        var db   = CreateDb(nameof(Reconciliar_PixMaiorQueSaldo_QuitaEExcedenteViraCredito));
        var user = await SeedBaseAsync(db);

        // QR de R$ 100 gerado; depois o cliente pagou R$ 30 em dinheiro e só então pagou o Pix
        var crediario = new Crediario
        {
            UserId              = user.Id,
            ValorEmCentavos     = 10000,
            ValorPagoEmCentavos = 3000,
            DataVencimento      = DateTime.UtcNow.AddDays(30),
        };
        db.Crediarios.Add(crediario);
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario);
        pix.CrediarioId = crediario.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);
        await service.ReconciliarAsync(pix);

        crediario.Status.Should().Be(CrediariosStatus.Pago);
        crediario.ValorPagoEmCentavos.Should().Be(13000);
        (await db.Users.FindAsync(user.Id))!.BalanceInCents.Should().Be(3000);
    }

    [Fact]
    public async Task Reconciliar_PixDeVariasContas_DistribuiPeloVencimentoEQuitaTodas()
    {
        var db   = CreateDb(nameof(Reconciliar_PixDeVariasContas_DistribuiPeloVencimentoEQuitaTodas));
        var user = await SeedBaseAsync(db);

        var vencida = new Crediario { UserId = user.Id, ValorEmCentavos = 3000, DataVencimento = DateTime.UtcNow.AddDays(-5) };
        var aVencer = new Crediario { UserId = user.Id, ValorEmCentavos = 5000, ValorPagoEmCentavos = 1000, DataVencimento = DateTime.UtcNow.AddDays(10) };
        db.Crediarios.AddRange(vencida, aVencer);
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario, valorEmCentavos: 9000); // 3000 + 4000 + 2000 a mais
        pix.CrediarioId      = vencida.Id;
        pix.CrediarioIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { vencida.Id, aVencer.Id });
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);
        await service.ReconciliarAsync(pix);

        vencida.Status.Should().Be(CrediariosStatus.Pago);
        aVencer.Status.Should().Be(CrediariosStatus.Pago);
        (await db.PagamentosCrediario.Where(p => p.CrediarioId == vencida.Id).SumAsync(p => p.ValorEmCentavos)).Should().Be(3000);
        (await db.PagamentosCrediario.Where(p => p.CrediarioId == aVencer.Id).SumAsync(p => p.ValorEmCentavos)).Should().Be(6000,
            "os 4000 que faltavam mais os 2000 a mais entram na última conta paga");
        (await db.Users.FindAsync(user.Id))!.BalanceInCents.Should().Be(2000, "o que passou dos saldos vira crédito");
    }

    [Fact]
    public async Task Reconciliar_PixDeVariasContas_ValorMenor_PagaAMaisAntigaPrimeiro()
    {
        var db   = CreateDb(nameof(Reconciliar_PixDeVariasContas_ValorMenor_PagaAMaisAntigaPrimeiro));
        var user = await SeedBaseAsync(db);

        var antiga = new Crediario { UserId = user.Id, ValorEmCentavos = 3000, DataVencimento = DateTime.UtcNow.AddDays(-5) };
        var nova   = new Crediario { UserId = user.Id, ValorEmCentavos = 5000, DataVencimento = DateTime.UtcNow.AddDays(10) };
        db.Crediarios.AddRange(antiga, nova);
        // Saldo mudou entre gerar e pagar: o Pix cobre 5000 de 8000
        var pix = NovaCobranca(PixCobrancaOrigem.Crediario, valorEmCentavos: 5000);
        pix.CrediarioId      = antiga.Id;
        pix.CrediarioIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { antiga.Id, nova.Id });
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);
        await service.ReconciliarAsync(pix);

        antiga.Status.Should().Be(CrediariosStatus.Pago);
        nova.ValorPagoEmCentavos.Should().Be(2000);
        nova.Status.Should().Be(CrediariosStatus.Aberto);
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
                It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<DateTime?>()))
            .ReturnsAsync(new ComandaDto { Id = comanda.Id });

        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, comandaSvc.Object);
        var result  = await service.ReconciliarAsync(pix);

        result.BaixaEfetuada.Should().BeTrue();
        result.ComandaFechada.Should().NotBeNull();
        // Quem assina é o admin passado ou, sem ele, o CriadoPorAdminId da cobrança.
        comandaSvc.Verify(c => c.CloseComandaAsync(
            comanda.Id, pix.CriadoPorAdminId, "Pix",
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(),
            It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<DateTime?>()), Times.Once);
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
            It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<DateTime?>()), Times.Never,
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

    [Fact]
    public async Task Reconciliar_InscricaoPaga_AvisaOJogador()
    {
        var db   = CreateDb(nameof(Reconciliar_InscricaoPaga_AvisaOJogador));
        var user = await SeedBaseAsync(db);

        var championship = new Championship { Name = "Torneio Teste", Game = "Magic", EntryFeeInCents = 5000 };
        db.Championships.Add(championship);
        var participant = new ChampionshipParticipant
        {
            ChampionshipId = championship.Id,
            UserId         = user.Id,
            PlayerNumber   = 7,
        };
        db.ChampionshipParticipants.Add(participant);
        var pix = NovaCobranca(PixCobrancaOrigem.Campeonato, 5000);
        pix.ChampionshipParticipantId = participant.Id;
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();

        var push    = new Mock<IPushService>();
        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object,
            new Mock<IComandaService>().Object, push: push.Object);

        await service.ReconciliarAsync(pix);

        // Sininho: quem fechou a tela antes da baixa precisa achar o aviso depois.
        var aviso = db.Notifications.Single(n => n.UserId == user.Id);
        aviso.Title.Should().Contain("Torneio Teste");
        aviso.Body.Should().Contain("#7");

        push.Verify(p => p.SendAsync(user.Id, It.IsAny<string>(), It.IsAny<string>(),
            "/cliente", It.IsAny<string?>()), Times.Once);

        // Segunda passada não avisa de novo — o claim atômico barra antes da baixa.
        await service.ReconciliarAsync(pix);
        db.Notifications.Count(n => n.UserId == user.Id).Should().Be(1);
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

    // ── Pix pago depois do pedido cancelado ──
    // Caso real de 20/10/2026: pedido criado 11:32, cancelado 11:36, Pix pago 11:37.
    // O dinheiro entrou, o estoque já tinha voltado e nada virou venda nem aviso.

    private static async Task<(ProductReservation Reserva, Product Produto, PixCobranca Pix, User Admin)> SeedPedidoCanceladoComPixAsync(
        AppDbContext db, int estoque)
    {
        var user  = await SeedBaseAsync(db);
        var admin = new User
        {
            Id = Guid.NewGuid(), Name = "Maikon", Email = "admin@test.com",
            PasswordHash = "hash", Role = UserRole.Admin,
        };
        db.Users.Add(admin);
        var produto = new Product
        {
            Name = "Mini Tin", Category = "Selado", PriceInCents = 8500,
            StockQuantity = estoque, IsActive = true,
        };
        db.Products.Add(produto);

        var groupId = Guid.NewGuid();
        var reserva = new ProductReservation
        {
            ReservationGroupId = groupId, UserId = user.Id, ProductId = produto.Id, Quantity = 1,
            Kind = "pre_venda", Status = "cancelled", CancelledAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddMinutes(-5),
        };
        db.ProductReservations.Add(reserva);
        var pix = NovaCobranca(PixCobrancaOrigem.Reserva, 8500);
        pix.ReservationGroupId     = groupId;
        pix.ReservationItemIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { reserva.Id });
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();
        return (reserva, produto, pix, admin);
    }

    [Fact]
    public async Task Reconciliar_PixDePedidoCancelado_ComEstoque_ReativaComoPagoEAvisaAdmin()
    {
        var db = CreateDb(nameof(Reconciliar_PixDePedidoCancelado_ComEstoque_ReativaComoPagoEAvisaAdmin));
        var (reserva, produto, pix, admin) = await SeedPedidoCanceladoComPixAsync(db, estoque: 3);
        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);

        await service.ReconciliarAsync(pix);

        await db.Entry(reserva).ReloadAsync();
        await db.Entry(produto).ReloadAsync();
        reserva.Status.Should().Be("active", "o cliente pagou — o pedido volta e aguarda retirada");
        reserva.ExpiresAt.Should().BeNull("pago");
        reserva.CancelledAt.Should().BeNull();
        reserva.PaymentMethod.Should().Be("pix");
        produto.StockQuantity.Should().Be(2, "o item sai do estoque de novo");
        (await db.Notifications.Where(n => n.UserId == admin.Id).Select(n => n.Title).ToListAsync())
            .Should().ContainSingle().Which.Should().Contain("reativado");
        (await db.ExternalTransactions.SingleAsync(x => x.ExternalId == pix.TxId)).Notes
            .Should().Contain("pago depois de cancelado");
    }

    [Fact]
    public async Task Reconciliar_PixDePedidoCancelado_SemEstoque_FicaCanceladoEAvisaReembolso()
    {
        var db = CreateDb(nameof(Reconciliar_PixDePedidoCancelado_SemEstoque_FicaCanceladoEAvisaReembolso));
        var (reserva, produto, pix, admin) = await SeedPedidoCanceladoComPixAsync(db, estoque: 0);
        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object);

        await service.ReconciliarAsync(pix);

        await db.Entry(reserva).ReloadAsync();
        await db.Entry(produto).ReloadAsync();
        reserva.Status.Should().Be("cancelled");
        produto.StockQuantity.Should().Be(0, "não pode vender o que não tem");
        (await db.Notifications.Where(n => n.UserId == admin.Id).Select(n => n.Title).ToListAsync())
            .Should().ContainSingle().Which.Should().Contain("reembolso pendente");
        (await db.ExternalTransactions.SingleAsync(x => x.ExternalId == pix.TxId)).Notes
            .Should().Contain("ATENÇÃO");
    }

    // ── Pedido pago = venda do dia ───────

    private static async Task<(ProductReservation Reserva, PixCobranca Pix, User Admin)> SeedPedidoNaoPagoAsync(AppDbContext db)
    {
        var user  = await SeedBaseAsync(db);
        var admin = new User { Id = Guid.NewGuid(), Name = "Maikon", Email = "adm@test.com", PasswordHash = "h", Role = UserRole.Admin };
        db.Users.Add(admin);
        var produto = new Product { Name = "Blister", Category = "Selado", PriceInCents = 9999, StockQuantity = 3, IsActive = true };
        db.Products.Add(produto);
        var groupId = Guid.NewGuid();
        var reserva = new ProductReservation
        {
            ReservationGroupId = groupId, UserId = user.Id, ProductId = produto.Id, Quantity = 2,
            Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
            UnitPriceInCents = 4000, // preço do dia do pedido; o produto subiu depois
        };
        db.ProductReservations.Add(reserva);
        var pix = NovaCobranca(PixCobrancaOrigem.Reserva, 8000);
        pix.ReservationGroupId     = groupId;
        pix.ReservationItemIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { reserva.Id });
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();
        return (reserva, pix, admin);
    }

    private static (Mock<IVendaAvulsaService> Mock, List<VendaAvulsaRequest> Pedidos) VendaSpy(bool falhar = false)
    {
        var pedidos = new List<VendaAvulsaRequest>();
        var mock = new Mock<IVendaAvulsaService>();
        var setup = mock.Setup(v => v.RegisterAsync(It.IsAny<VendaAvulsaRequest>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .Callback<VendaAvulsaRequest, Guid, string>((r, _, _) => pedidos.Add(r));
        if (falhar) setup.ThrowsAsync(new InvalidOperationException("Mongo fora"));
        else setup.ReturnsAsync(new VendaAvulsaDto { Id = "venda-1", TotalInReais = 80m });
        return (mock, pedidos);
    }

    private static PedidoVendaService PedidoVenda(AppDbContext db, IVendaAvulsaService vendas) =>
        new(db, vendas, NullLogger<PedidoVendaService>.Instance);

    [Fact]
    public async Task Reconciliar_PedidoPago_RegistraUmaVendaPixComPrecoCongelado()
    {
        var db = CreateDb(nameof(Reconciliar_PedidoPago_RegistraUmaVendaPixComPrecoCongelado));
        var (reserva, pix, _) = await SeedPedidoNaoPagoAsync(db);
        var (vendas, pedidos) = VendaSpy();
        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object,
            pedidoVenda: PedidoVenda(db, vendas.Object));

        await service.ReconciliarAsync(pix);
        await service.ReconciliarAsync(pix); // robô e tela juntos

        pedidos.Should().ContainSingle("um pagamento, uma venda");
        var req = pedidos[0];
        req.PaymentMethod.Should().Be("Pix");
        req.SkipStockDecrement.Should().BeTrue("o estoque saiu quando o pedido foi feito");
        req.Origem.Should().Be("Reserva");
        req.Items.Single().UnitPriceInCents.Should().Be(4000, "vale o preço que o cliente viu e pagou");
        (await db.ProductReservations.AsNoTracking().SingleAsync()).VendaAvulsaId.Should().Be("venda-1");
    }

    [Fact]
    public async Task Reconciliar_PedidoPago_VendaFalha_LiberaEAvisaOsAdmins()
    {
        var db = CreateDb(nameof(Reconciliar_PedidoPago_VendaFalha_LiberaEAvisaOsAdmins));
        var (_, pix, admin) = await SeedPedidoNaoPagoAsync(db);
        var (vendas, _) = VendaSpy(falhar: true);
        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object,
            pedidoVenda: PedidoVenda(db, vendas.Object));

        var r = await service.ReconciliarAsync(pix);

        r.BaixaEfetuada.Should().BeTrue("o pagamento continua baixado");
        var reserva = await db.ProductReservations.AsNoTracking().SingleAsync();
        reserva.ExpiresAt.Should().BeNull();
        reserva.VendaAvulsaId.Should().BeNull("o Homologar continua podendo registrar a venda");
        (await db.Notifications.Where(n => n.UserId == admin.Id).Select(n => n.Title).SingleAsync())
            .Should().Contain("sem venda");
    }

    [Fact]
    public async Task Reconciliar_PedidoPago_FalhaDepoisDeGravarAVenda_NaoLiberaPraVenderDeNovo()
    {
        var db = CreateDb(nameof(Reconciliar_PedidoPago_FalhaDepoisDeGravarAVenda_NaoLiberaPraVenderDeNovo));
        var (_, pix, _) = await SeedPedidoNaoPagoAsync(db);
        var (vendas, _) = VendaSpy(falhar: true);
        var reserva = await db.ProductReservations.AsNoTracking().SingleAsync();
        vendas.Setup(v => v.BuscarVendaDoPedidoAsync(pix.ReservationGroupId!.Value, reserva.Id, It.IsAny<DateTime>()))
              .ReturnsAsync(new VendaAvulsaDto { Id = "venda-gravada" }); // o insert no Mongo aconteceu
        var service = CreateService(db, CreateInterMock("CONCLUIDA").Object, new Mock<IComandaService>().Object,
            pedidoVenda: PedidoVenda(db, vendas.Object));

        await service.ReconciliarAsync(pix);

        (await db.ProductReservations.AsNoTracking().SingleAsync()).VendaAvulsaId.Should().Be("venda-gravada",
            "liberar faria o Homologar vender o mesmo pedido de novo");
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
