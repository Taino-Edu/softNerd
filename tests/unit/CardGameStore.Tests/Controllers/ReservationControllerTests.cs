// =============================================================================
// ReservationControllerTests.cs — Testes do ReservationController
//
// Cobre o bug reportado em produção: "a pré-venda dá erro ao registrar, o
// produto some do estoque e não vincula na pré-venda". Causa raiz: CriarItemAsync
// baixava o estoque com ExecuteUpdateAsync (commit imediato, fora de qualquer
// transação) e só DEPOIS tentava inserir a ProductReservation com SaveChangesAsync
// — se esse insert falhasse (FK inválida, conflito etc.), o estoque já baixado
// ficava perdido, sem reserva nenhuma pra mostrar por ele.
//
// SQLite in-memory (não o EF InMemory provider): ExecuteUpdateAsync e
// BeginTransactionAsync/rollback só funcionam com um provider relacional de verdade.
// =============================================================================

using System.Security.Claims;
using CardGameStore.Controllers;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CardGameStore.Tests.Controllers;

public class ReservationControllerTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

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

    private static InterSyncService CreateInterStub()
    {
        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        return new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance).Object;
    }

    private static IHubContext<ComandaHub> CreateHubMock()
    {
        var mockClientProxy = new Mock<IClientProxy>();
        mockClientProxy
            .Setup(p => p.SendCoreAsync(It.IsAny<string>(), It.IsAny<object[]>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var mockClients = new Mock<IHubClients>();
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockClientProxy.Object);

        var mockHub = new Mock<IHubContext<ComandaHub>>();
        mockHub.Setup(h => h.Clients).Returns(mockClients.Object);
        return mockHub.Object;
    }

    private static ReservationController CreateController(
        AppDbContext db, Guid? loggedUserId = null,
        IVendaAvulsaService? vendaService = null, IComandaService? comandaService = null)
    {
        var controller = new ReservationController(
            db,
            vendaService ?? new Mock<IVendaAvulsaService>().Object,
            comandaService ?? new Mock<IComandaService>().Object,
            CreateInterStub(),
            new Mock<IPixReconciliationService>().Object,
            new Mock<IPushService>().Object,
            new Mock<IAuditService>().Object,
            CreateHubMock());

        var claims = new List<Claim> { new("name", "Admin Teste") };
        if (loggedUserId.HasValue) claims.Add(new Claim("sub", loggedUserId.Value.ToString()));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")),
            },
        };
        return controller;
    }

    private static async Task<User> SeedUserAsync(AppDbContext db, string name = "Cliente Teste")
    {
        var user = new User
        {
            Id = Guid.NewGuid(), Name = name, Email = $"{Guid.NewGuid()}@test.com",
            PasswordHash = "hash", Role = UserRole.Customer,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task<Product> SeedProductAsync(AppDbContext db, int stock = 5, bool isPreVenda = false)
    {
        var product = new Product
        {
            Id = Guid.NewGuid(), Name = "Booster Pack", Category = "MTG",
            PriceInCents = 1500, StockQuantity = stock, MinimumStock = 1,
            IsActive = true, IsPreVenda = isPreVenda,
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    }

    // ── Bug de produção: insert falha depois da baixa de estoque ───────────────

    [Fact]
    public async Task Create_QuandoInsertDaReservaFalha_NaoDevePerderOEstoqueBaixado()
    {
        var db      = CreateDb(nameof(Create_QuandoInsertDaReservaFalha_NaoDevePerderOEstoqueBaixado));
        var product = await SeedProductAsync(db, stock: 5);

        // Usuário autenticado mas SEM linha em Users (token de conta apagada/inconsistente):
        // CriarItemAsync baixa o estoque com sucesso, mas o insert da reserva viola a FK
        // de UserId — exatamente o "clica e dá erro" que o Maikon reportou.
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var act = async () => await controller.Create(new CreateReservationRequest
        {
            ProductId = product.Id,
            Quantity  = 2,
        });

        await act.Should().ThrowAsync<DbUpdateException>();

        db.ChangeTracker.Clear();
        var estoqueDepois = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoqueDepois.Should().Be(5, "a baixa de estoque tem que desfazer junto com o rollback da transação " +
                                     "quando o insert da reserva falha — senão o produto some do estoque sem virar pré-venda nenhuma");

        (await db.ProductReservations.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task AdminCreate_ClienteInexistente_RetornaNotFoundSemTocarEstoque()
    {
        // AdminCreate e Create passam pelo mesmo CriarEPersistirAsync (o helper que
        // ganhou a transação) — a prova de que o insert-falha-depois-da-baixa está
        // corrigido está nos testes de Create acima. Este cobre a guarda específica
        // do admin-create: cliente removido/inexistente nunca chega a mexer no estoque.
        var db      = CreateDb(nameof(AdminCreate_ClienteInexistente_RetornaNotFoundSemTocarEstoque));
        var product = await SeedProductAsync(db, stock: 5);
        var clienteInexistente = Guid.NewGuid();

        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.AdminCreate(new AdminCreateReservationRequest
        {
            UserId    = clienteInexistente,
            ProductId = product.Id,
            Quantity  = 2,
        });

        result.Should().BeOfType<NotFoundObjectResult>();

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(5);
        (await db.ProductReservations.CountAsync()).Should().Be(0);
    }

    // ── Caminho feliz: continua funcionando depois da mudança pra transação ────

    [Fact]
    public async Task Create_ComEstoqueDisponivel_DeveCriarPreVendaEBaixarEstoque()
    {
        var db      = CreateDb(nameof(Create_ComEstoqueDisponivel_DeveCriarPreVendaEBaixarEstoque));
        var user    = await SeedUserAsync(db);
        var product = await SeedProductAsync(db, stock: 5);
        var controller = CreateController(db, loggedUserId: user.Id);

        var result = await controller.Create(new CreateReservationRequest { ProductId = product.Id, Quantity = 2 });

        result.Should().BeOfType<OkObjectResult>();

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(3);
        var reserva = await db.ProductReservations.SingleAsync();
        reserva.Kind.Should().Be("pre_venda");
        reserva.Status.Should().Be("active");
        reserva.Quantity.Should().Be(2);
        // ExpiresAt só marca "ainda não paga" — não é mais um prazo que expira sozinho.
        reserva.ExpiresAt.Should().NotBeNull();
    }

    [Fact]
    public async Task AdminCreate_ComClienteEEstoqueValidos_DeveCriarPreVenda()
    {
        var db      = CreateDb(nameof(AdminCreate_ComClienteEEstoqueValidos_DeveCriarPreVenda));
        var cliente = await SeedUserAsync(db);
        var product = await SeedProductAsync(db, stock: 3);
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.AdminCreate(new AdminCreateReservationRequest
        {
            UserId = cliente.Id, ProductId = product.Id, Quantity = 1,
        });

        result.Should().BeOfType<OkObjectResult>();

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(2);
        (await db.ProductReservations.CountAsync(r => r.UserId == cliente.Id)).Should().Be(1);
    }

    [Fact]
    public async Task Create_SemEstoqueEProdutoNaoAceitaFila_DeveRetornarBadRequestSemMexerNoEstoque()
    {
        var db      = CreateDb(nameof(Create_SemEstoqueEProdutoNaoAceitaFila_DeveRetornarBadRequestSemMexerNoEstoque));
        var user    = await SeedUserAsync(db);
        var product = await SeedProductAsync(db, stock: 0, isPreVenda: false);
        var controller = CreateController(db, loggedUserId: user.Id);

        var result = await controller.Create(new CreateReservationRequest { ProductId = product.Id, Quantity = 1 });

        result.Should().BeOfType<BadRequestObjectResult>();
        (await db.ProductReservations.CountAsync()).Should().Be(0);
    }

    // ── Homologar o carrinho inteiro (bug: só o item clicado saía como retirado) ─

    private static async Task<(ProductReservation a, ProductReservation b)> SeedCarrinhoAsync(
        AppDbContext db, User cliente, Product produtoA, Product produtoB)
    {
        var groupId = Guid.NewGuid();
        var a = new ProductReservation
        {
            ReservationGroupId = groupId, UserId = cliente.Id, ProductId = produtoA.Id,
            Quantity = 1, Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
        };
        var b = new ProductReservation
        {
            ReservationGroupId = groupId, UserId = cliente.Id, ProductId = produtoB.Id,
            Quantity = 1, Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
        };
        db.ProductReservations.AddRange(a, b);
        await db.SaveChangesAsync();
        return (a, b);
    }

    [Fact]
    public async Task HomologarGrupo_CarrinhoComDoisItens_MarcaOsDoisComoFulfilled()
    {
        // Reproduz o bug reportado: cliente reserva 2 itens juntos (mesmo grupo), mas o
        // botão "Homologar" só existia por reserva individual — só um saía como retirado
        // e o outro ficava "active" pra sempre sem ninguém perceber.
        var db      = CreateDb(nameof(HomologarGrupo_CarrinhoComDoisItens_MarcaOsDoisComoFulfilled));
        var cliente = await SeedUserAsync(db);
        var produtoA = await SeedProductAsync(db, stock: 5);
        var produtoB = await SeedProductAsync(db, stock: 5);
        var (a, b) = await SeedCarrinhoAsync(db, cliente, produtoA, produtoB);

        var vendaMock = new Mock<IVendaAvulsaService>();
        vendaMock.Setup(v => v.RegisterAsync(It.IsAny<VendaAvulsaRequest>(), It.IsAny<Guid>(), It.IsAny<string>()))
                 .ReturnsAsync(new VendaAvulsaDto());

        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: vendaMock.Object);

        var result = await controller.HomologarGrupo(a.ReservationGroupId, new HomologarRequest { Mode = "pdv" });

        result.Should().BeOfType<OkObjectResult>();
        vendaMock.Verify(v => v.RegisterAsync(
            It.Is<VendaAvulsaRequest>(r => r.Items.Count == 2 && r.SkipStockDecrement),
            It.IsAny<Guid>(), It.IsAny<string>()), Times.Once);

        db.ChangeTracker.Clear();
        var itens = await db.ProductReservations.Where(r => r.Id == a.Id || r.Id == b.Id).ToListAsync();
        itens.Should().OnlyContain(r => r.Status == "fulfilled" && r.FulfilledAt != null);
    }

    [Fact]
    public async Task HomologarGrupo_ModoComanda_AdicionaTodosOsItensNaMesmaComanda()
    {
        var db      = CreateDb(nameof(HomologarGrupo_ModoComanda_AdicionaTodosOsItensNaMesmaComanda));
        var cliente = await SeedUserAsync(db);
        var produtoA = await SeedProductAsync(db, stock: 5);
        var produtoB = await SeedProductAsync(db, stock: 5);
        var (a, _) = await SeedCarrinhoAsync(db, cliente, produtoA, produtoB);
        var comandaId = Guid.NewGuid();

        var comandaMock = new Mock<IComandaService>();
        comandaMock.Setup(c => c.AdminAddItemAsync(comandaId, It.IsAny<Guid>(), It.IsAny<AddItemToComandaRequest>()))
                   .ReturnsAsync(new ComandaDto());

        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), comandaService: comandaMock.Object);

        var result = await controller.HomologarGrupo(a.ReservationGroupId,
            new HomologarRequest { Mode = "comanda", ComandaId = comandaId });

        result.Should().BeOfType<OkObjectResult>();
        comandaMock.Verify(c => c.AdminAddItemAsync(comandaId, It.IsAny<Guid>(), It.IsAny<AddItemToComandaRequest>()),
            Times.Exactly(2));
    }

    [Fact]
    public async Task HomologarGrupo_SemReservasAtivasNoGrupo_RetornaNotFound()
    {
        var db = CreateDb(nameof(HomologarGrupo_SemReservasAtivasNoGrupo_RetornaNotFound));
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.HomologarGrupo(Guid.NewGuid(), new HomologarRequest { Mode = "pdv" });

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // ── Timer de expiração removido ─────────────────────────────────────────────

    [Fact]
    public void PreVendaExpiryBackgroundService_NaoDeveMaisExistir()
    {
        // O robô que cancelava pré-vendas vencidas e devolvia o estoque sozinho foi
        // removido a pedido: agora só o admin cancela manualmente (tela de reservas).
        var tipo = typeof(ReservationController).Assembly
            .GetType("CardGameStore.Services.Implementations.PreVendaExpiryBackgroundService");
        tipo.Should().BeNull();
    }
}
