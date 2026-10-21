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
using CardGameStore.Configuration;
using CardGameStore.Controllers;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
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

    /// <summary>
    /// InterSyncService é classe concreta; o mock só precisa existir porque o controller
    /// o recebe. Os métodos usados no cancelamento de cobrança são virtuais.
    /// </summary>
    private static InterSyncService CreateInterMock() => CreateInterMockConfiguravel().Object;

    private static Mock<InterSyncService> CreateInterMockConfiguravel()
    {
        var env = new Mock<IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();

        return new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);
    }

    private static ReservationController CreateController(
        AppDbContext db, Guid? loggedUserId = null, IVendaAvulsaService? vendaService = null,
        IPixReconciliationService? pixReconciliation = null, InterSyncService? inter = null,
        FuncionalidadesService? funcionalidades = null)
    {
        var controller = new ReservationController(
            db,
            vendaService ?? new Mock<IVendaAvulsaService>().Object,
            new Mock<IReservationPixService>().Object,
            pixReconciliation ?? new Mock<IPixReconciliationService>().Object,
            new Mock<IPushService>().Object,
            new Mock<IAuditService>().Object,
            CreateHubMock(),
            inter ?? CreateInterMock(),
            NullLogger<ReservationController>.Instance,
            funcionalidades);

        var claims = new List<Claim>();
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
    public async Task AdminCreate_ComVariosItens_DeveCriarTudoNoMesmoGrupo()
    {
        // Pedido do balcão/WhatsApp com mais de um produto pro mesmo cliente: antes só
        // dava pra registrar um item por vez (cada um virava um pedido solto).
        var db      = CreateDb(nameof(AdminCreate_ComVariosItens_DeveCriarTudoNoMesmoGrupo));
        var cliente = await SeedUserAsync(db);
        var p1      = await SeedProductAsync(db, stock: 5);
        var p2      = await SeedProductAsync(db, stock: 2);
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.AdminCreate(new AdminCreateReservationRequest
        {
            UserId = cliente.Id,
            Items  =
            [
                new AdminCreateReservationItem { ProductId = p1.Id, Quantity = 2 },
                new AdminCreateReservationItem { ProductId = p2.Id, Quantity = 1 },
            ],
        });

        result.Should().BeOfType<OkObjectResult>();

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(p1.Id))!.StockQuantity.Should().Be(3);
        (await db.Products.FindAsync(p2.Id))!.StockQuantity.Should().Be(1);

        var reservas = await db.ProductReservations.Where(r => r.UserId == cliente.Id).ToListAsync();
        reservas.Should().HaveCount(2);
        reservas.Select(r => r.ReservationGroupId).Distinct().Should().HaveCount(1,
            "os itens do mesmo pedido têm que ficar num grupo só — é o que junta o Pix e a homologação");
    }

    [Fact]
    public async Task AdminCreate_ItemInvalidoNoMeio_DeveDesfazerAbaixaDosAnteriores()
    {
        var db      = CreateDb(nameof(AdminCreate_ItemInvalidoNoMeio_DeveDesfazerAbaixaDosAnteriores));
        var cliente = await SeedUserAsync(db);
        var p1      = await SeedProductAsync(db, stock: 5);
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.AdminCreate(new AdminCreateReservationRequest
        {
            UserId = cliente.Id,
            Items  =
            [
                new AdminCreateReservationItem { ProductId = p1.Id,          Quantity = 2 },
                new AdminCreateReservationItem { ProductId = Guid.NewGuid(), Quantity = 1 }, // não existe
            ],
        });

        result.Should().BeOfType<NotFoundObjectResult>();

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(p1.Id))!.StockQuantity.Should().Be(5,
            "o estoque baixado dos itens anteriores volta no rollback quando um item do pedido falha");
        (await db.ProductReservations.CountAsync()).Should().Be(0);
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

    // ── Homologação do carrinho inteiro ────────────────────────────────────────
    // Bug de produção: "reservei 2 itens, só retirou um". O botão Homologar era por
    // linha, então o resto do carrinho ficava "active" pra sempre, sem aviso nenhum.

    /// <summary>Mock que captura a VendaAvulsaRequest montada pela homologação.</summary>
    private static (IVendaAvulsaService Service, List<VendaAvulsaRequest> Capturadas) CreateVendaSpy()
    {
        var capturadas = new List<VendaAvulsaRequest>();
        var mock = new Mock<IVendaAvulsaService>();
        mock.Setup(v => v.RegisterAsync(It.IsAny<VendaAvulsaRequest>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .Callback<VendaAvulsaRequest, Guid, string>((req, _, _) => capturadas.Add(req))
            .ReturnsAsync(new VendaAvulsaDto());
        return (mock.Object, capturadas);
    }

    private static async Task<List<ProductReservation>> SeedCarrinhoAsync(
        AppDbContext db, Guid userId, Guid groupId, params (Guid ProductId, int Qty)[] itens)
    {
        var reservas = itens.Select(i => new ProductReservation
        {
            Id = Guid.NewGuid(), ReservationGroupId = groupId, UserId = userId,
            ProductId = i.ProductId, Quantity = i.Qty,
            Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
        }).ToList();
        db.ProductReservations.AddRange(reservas);
        await db.SaveChangesAsync();
        return reservas;
    }

    [Fact]
    public async Task HomologarGrupo_CarrinhoDeDoisItens_DeveHomologarTudoNumaVendaSo()
    {
        var db       = CreateDb(nameof(HomologarGrupo_CarrinhoDeDoisItens_DeveHomologarTudoNumaVendaSo));
        var cliente  = await SeedUserAsync(db);
        var produtoA = await SeedProductAsync(db, stock: 10);
        var produtoB = await SeedProductAsync(db, stock: 10);
        var groupId  = Guid.NewGuid();
        await SeedCarrinhoAsync(db, cliente.Id, groupId, (produtoA.Id, 2), (produtoB.Id, 3));

        var (venda, capturadas) = CreateVendaSpy();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: venda);

        var result = await controller.HomologarGrupo(groupId, new HomologarRequest { PaymentMethod = "Dinheiro" });

        result.Should().BeOfType<OkObjectResult>();

        db.ChangeTracker.Clear();
        var reservas = await db.ProductReservations.Where(r => r.ReservationGroupId == groupId).ToListAsync();
        reservas.Should().OnlyContain(r => r.Status == "fulfilled",
            "o cliente retirou o carrinho inteiro de uma vez — nenhum item pode ficar pra trás");
        reservas.Should().OnlyContain(r => r.FulfilledAt != null);

        capturadas.Should().HaveCount(1, "o carrinho vira UMA venda no PDV, não uma por item");
        capturadas[0].Items.Should().HaveCount(2);
        capturadas[0].Items.Sum(i => i.Quantity).Should().Be(5);
        capturadas[0].ReservationGroupId.Should().Be(groupId);
        capturadas[0].SkipStockDecrement.Should().BeTrue("o estoque já saiu quando a pré-venda foi criada");
    }

    [Fact]
    public async Task HomologarGrupo_CarrinhoMisturado_NaoContaComoPreVendaNoFinanceiro()
    {
        // Só é "Pré-venda" no Financeiro a venda em que TODO o pedido é de item com a tag;
        // misturar um item comum joga a venda pro balde "Site", que é de onde ela veio.
        var db       = CreateDb(nameof(HomologarGrupo_CarrinhoMisturado_NaoContaComoPreVendaNoFinanceiro));
        var cliente  = await SeedUserAsync(db);
        var comTag   = await SeedProductAsync(db, stock: 10, isPreVenda: true);
        var semTag   = await SeedProductAsync(db, stock: 10, isPreVenda: false);
        var groupId  = Guid.NewGuid();
        await SeedCarrinhoAsync(db, cliente.Id, groupId, (comTag.Id, 1), (semTag.Id, 1));

        var (venda, capturadas) = CreateVendaSpy();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: venda);

        await controller.HomologarGrupo(groupId, new HomologarRequest { PaymentMethod = "Pix" });

        capturadas.Should().ContainSingle();
        capturadas[0].ProductIsPreVenda.Should().BeFalse();
        capturadas[0].Origem.Should().Be("Reserva");
    }

    [Fact]
    public async Task HomologarGrupo_ReservaAvulsa_FuncionaPeloMesmoEndpoint()
    {
        // Reserva avulsa tem ReservationGroupId = o próprio Id, então a tela pode usar
        // sempre o endpoint de grupo sem se preocupar em qual caso está.
        var db      = CreateDb(nameof(HomologarGrupo_ReservaAvulsa_FuncionaPeloMesmoEndpoint));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var id      = Guid.NewGuid();

        db.ProductReservations.Add(new ProductReservation
        {
            Id = id, ReservationGroupId = id, UserId = cliente.Id,
            ProductId = produto.Id, Quantity = 1,
            Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var (venda, capturadas) = CreateVendaSpy();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: venda);

        var result = await controller.HomologarGrupo(id, new HomologarRequest { PaymentMethod = "Dinheiro" });

        result.Should().BeOfType<OkObjectResult>();
        capturadas.Should().ContainSingle();
        capturadas[0].Items.Should().ContainSingle();

        db.ChangeTracker.Clear();
        (await db.ProductReservations.FindAsync(id))!.Status.Should().Be("fulfilled");
    }

    [Fact]
    public async Task HomologarGrupo_SemPreVendaAtiva_RetornaNotFoundSemLancarVenda()
    {
        var db      = CreateDb(nameof(HomologarGrupo_SemPreVendaAtiva_RetornaNotFoundSemLancarVenda));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var groupId = Guid.NewGuid();

        // Grupo existe, mas já foi todo homologado antes (duplo clique / F5 na tela).
        db.ProductReservations.Add(new ProductReservation
        {
            Id = Guid.NewGuid(), ReservationGroupId = groupId, UserId = cliente.Id,
            ProductId = produto.Id, Quantity = 1,
            Kind = "pre_venda", Status = "fulfilled", FulfilledAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var (venda, capturadas) = CreateVendaSpy();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: venda);

        var result = await controller.HomologarGrupo(groupId, new HomologarRequest { PaymentMethod = "Dinheiro" });

        result.Should().BeOfType<NotFoundObjectResult>();
        capturadas.Should().BeEmpty("nada pra homologar não pode virar venda de R$ 0 no caixa");
    }

    // ── Pix travando a edição de quantidade ─────────────────────────────────────
    // Reportado pelo Maikon: cliente pagou na chave normal da loja, fora da cobrança
    // gerada pelo site. O Inter nunca confirma aquele txid, a cobrança fica "ATIVA"
    // pra sempre e a reserva não aceitava mais mudar de quantidade — com a mensagem
    // mandando cancelar um Pix que não tinha onde ser cancelado.

    private static async Task<ProductReservation> SeedPreVendaComPixAsync(
        AppDbContext db, DateTime? pixExpiraEm, string pixStatus = "ATIVA")
    {
        var user    = await SeedUserAsync(db);
        var product = await SeedProductAsync(db, stock: 20, isPreVenda: true);
        var groupId = Guid.NewGuid();

        var reserva = new ProductReservation
        {
            Id = Guid.NewGuid(), ReservationGroupId = groupId,
            UserId = user.Id, ProductId = product.Id,
            Quantity = 2, Kind = "pre_venda", Status = "active",
        };
        db.ProductReservations.Add(reserva);
        db.PixCobrancas.Add(new PixCobranca
        {
            Id = Guid.NewGuid(), Origem = PixCobrancaOrigem.Reserva,
            ReservationGroupId = groupId, TxId = Guid.NewGuid().ToString("N"),
            ValorEmCentavos = 3000, Status = pixStatus,
            CriadoEm = DateTime.UtcNow.AddHours(-30), ExpiraEm = pixExpiraEm,
            CriadoPorAdminId = Guid.NewGuid(),
        });
        await db.SaveChangesAsync();
        return reserva;
    }

    [Fact]
    public async Task UpdateQuantity_ComPixVencido_DeveDeixarAlterar()
    {
        var db      = CreateDb(nameof(ReservationControllerTests));
        var reserva = await SeedPreVendaComPixAsync(db, pixExpiraEm: DateTime.UtcNow.AddHours(-29));
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.UpdateQuantity(reserva.Id,
            new UpdateReservationQuantityRequest { Quantity = 5 });

        result.Should().NotBeOfType<ConflictObjectResult>(
            "cobrança vencida não é mais pagável — travar a reserva por causa dela é travar pra sempre");
        (await db.ProductReservations.FindAsync(reserva.Id))!.Quantity.Should().Be(5);
    }

    [Fact]
    public async Task UpdateQuantity_ComPixAindaNoPrazo_DeveBloquear()
    {
        var db      = CreateDb(nameof(ReservationControllerTests));
        var reserva = await SeedPreVendaComPixAsync(db, pixExpiraEm: DateTime.UtcNow.AddMinutes(30));
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.UpdateQuantity(reserva.Id,
            new UpdateReservationQuantityRequest { Quantity = 5 });

        result.Should().BeOfType<ConflictObjectResult>(
            "cobrança viva ainda pode ser paga — mudar a quantidade desalinharia o valor");
        (await db.ProductReservations.FindAsync(reserva.Id))!.Quantity.Should().Be(2);
    }

    [Fact]
    public async Task CancelarPixReserva_ComCobrancaVencida_EncerraMesmoSemOInter()
    {
        // Sem integração configurada o PATCH no Inter falha. Cobrança vencida não pode
        // mais receber pagamento, então encerrar localmente é seguro — é o que tira o
        // lojista do beco quando o cliente pagou por fora.
        var db      = CreateDb(nameof(ReservationControllerTests));
        var reserva = await SeedPreVendaComPixAsync(db, pixExpiraEm: DateTime.UtcNow.AddHours(-29));
        var semInter = new Mock<IPixReconciliationService>();
        semInter.Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>()))
                .ReturnsAsync(new PixReconciliationResult { Status = "ATIVA", Error = "Integração com o Inter não configurada." });
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), pixReconciliation: semInter.Object);

        var result = await controller.CancelarPixReserva(reserva.ReservationGroupId);

        result.Should().BeOfType<OkObjectResult>();
        var pix = await db.PixCobrancas.FirstAsync(p => p.ReservationGroupId == reserva.ReservationGroupId);
        pix.Status.Should().Be("REMOVIDA_PELO_USUARIO_RECEBEDOR");
    }

    [Fact]
    public async Task CancelarPixReserva_ComCobrancaViva_NaoEncerraSeOInterRecusar()
    {
        // Encerrar só no nosso banco deixaria o QR de pé no PSP: o cliente ainda
        // pagaria uma cobrança que pra loja não existe mais.
        var db      = CreateDb(nameof(ReservationControllerTests));
        var reserva = await SeedPreVendaComPixAsync(db, pixExpiraEm: DateTime.UtcNow.AddMinutes(30));

        // Cobrança no prazo é conferida no Inter antes de cancelar (pra não apagar a
        // pista de um pagamento recém-caído); aqui ela volta em aberto.
        var reconciliacao = new Mock<IPixReconciliationService>();
        reconciliacao
            .Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new PixReconciliationResult { Status = "ATIVA" });

        var controller = CreateController(db, loggedUserId: Guid.NewGuid(),
            pixReconciliation: reconciliacao.Object);

        var result = await controller.CancelarPixReserva(reserva.ReservationGroupId);

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(502);
        var pix = await db.PixCobrancas.FirstAsync(p => p.ReservationGroupId == reserva.ReservationGroupId);
        pix.Status.Should().Be("ATIVA");
    }

    // ── Cancelar pedido não pago derruba o Pix (chave "pedido-pix-consistente") ──
    // Caso real de 20/10/2026: pedido cancelado 11:36 com o QR ainda de pé; o cliente
    // pagou 11:37 e o dinheiro caiu num pedido cancelado.

    private static async Task<(ProductReservation Reserva, Product Produto, User Cliente)> SeedPedidoNaoPagoComPixAsync(AppDbContext db)
    {
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 4);
        var groupId = Guid.NewGuid();
        var reserva = new ProductReservation
        {
            Id = Guid.NewGuid(), ReservationGroupId = groupId, UserId = cliente.Id, ProductId = produto.Id,
            Quantity = 1, Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow, // não pago
        };
        db.ProductReservations.Add(reserva);
        db.PixCobrancas.Add(new PixCobranca
        {
            Id = Guid.NewGuid(), Origem = PixCobrancaOrigem.Reserva, ReservationGroupId = groupId,
            TxId = Guid.NewGuid().ToString("N"), ValorEmCentavos = 1500, Status = "ATIVA",
            ExpiraEm = DateTime.UtcNow.AddMinutes(50), CriadoPorAdminId = cliente.Id,
        });
        db.IntegrationConfigs.Add(new IntegrationConfig { Source = "inter" });
        await db.SaveChangesAsync();
        return (reserva, produto, cliente);
    }

    private static Mock<IPixReconciliationService> PixAindaAberto()
    {
        var m = new Mock<IPixReconciliationService>();
        m.Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>()))
         .ReturnsAsync(new PixReconciliationResult { Status = "ATIVA" });
        return m;
    }

    [Fact]
    public async Task Cancel_PedidoNaoPagoComPix_DerrubaACobrancaNoInter()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, produto, cliente) = await SeedPedidoNaoPagoComPixAsync(db);
        var inter = CreateInterMockConfiguravel();
        inter.Setup(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Status = "REMOVIDA_PELO_USUARIO_RECEBEDOR" });
        var controller = CreateController(db, loggedUserId: cliente.Id,
            pixReconciliation: PixAindaAberto().Object, inter: inter.Object);

        var result = await controller.Cancel(reserva.Id);

        result.Should().BeOfType<OkObjectResult>();
        inter.Verify(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()), Times.Once);
        (await db.PixCobrancas.SingleAsync()).Status.Should().Be("REMOVIDA_PELO_USUARIO_RECEBEDOR");
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("cancelled");
        (await db.Products.AsNoTracking().SingleAsync(p => p.Id == produto.Id)).StockQuantity.Should().Be(5);
    }

    [Fact]
    public async Task Cancel_InterRecusaDerrubarPixNoPrazo_NaoCancelaOPedido()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, produto, cliente) = await SeedPedidoNaoPagoComPixAsync(db);
        var inter = CreateInterMockConfiguravel();
        inter.Setup(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Error = "timeout" });
        var controller = CreateController(db, loggedUserId: cliente.Id,
            pixReconciliation: PixAindaAberto().Object, inter: inter.Object);

        var result = await controller.Cancel(reserva.Id);

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(502,
            "cancelar com o QR de pé é exatamente o que fez o dinheiro cair em pedido cancelado");
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("active");
        (await db.PixCobrancas.SingleAsync()).Status.Should().Be("ATIVA");
    }

    [Fact]
    public async Task Cancel_PixAcabouDeSerPago_NaoCancela()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, _, cliente) = await SeedPedidoNaoPagoComPixAsync(db);
        var pago = new Mock<IPixReconciliationService>();
        pago.Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new PixReconciliationResult { Status = "CONCLUIDA", PagoEm = DateTime.UtcNow });
        var inter = CreateInterMockConfiguravel();
        var controller = CreateController(db, loggedUserId: cliente.Id, pixReconciliation: pago.Object, inter: inter.Object);

        var result = await controller.Cancel(reserva.Id);

        result.Should().BeOfType<ConflictObjectResult>();
        inter.Verify(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()), Times.Never);
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("active");
    }

    [Fact]
    public async Task Cancel_PixVencidoMasPagoAntesDeVencer_NaoCancelaNemSomeComOPagamento()
    {
        // Codex no PR #87: pago pouco antes de vencer e ainda não conciliado. Pular a
        // conferência por estar vencido marcaria a cobrança como removida e o pagamento sumiria.
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, _, cliente) = await SeedPedidoNaoPagoComPixAsync(db);
        var pix = await db.PixCobrancas.SingleAsync();
        pix.ExpiraEm = DateTime.UtcNow.AddMinutes(-2);
        await db.SaveChangesAsync();
        var pago = new Mock<IPixReconciliationService>();
        pago.Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new PixReconciliationResult { Status = "CONCLUIDA", PagoEm = DateTime.UtcNow.AddMinutes(-3) });
        var inter = CreateInterMockConfiguravel();
        var controller = CreateController(db, loggedUserId: cliente.Id, pixReconciliation: pago.Object, inter: inter.Object);

        var result = await controller.Cancel(reserva.Id);

        result.Should().BeOfType<ConflictObjectResult>();
        inter.Verify(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()), Times.Never);
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("active");
        (await db.PixCobrancas.AsNoTracking().SingleAsync()).Status.Should().NotBe("REMOVIDA_PELO_USUARIO_RECEBEDOR");
    }

    [Fact]
    public async Task Cancel_NaoConsegueConferirOPix_NaoCancela()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, _, cliente) = await SeedPedidoNaoPagoComPixAsync(db);
        var foraDoAr = new Mock<IPixReconciliationService>();
        foraDoAr.Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>()))
                .ReturnsAsync(new PixReconciliationResult { Status = "ATIVA", Error = "timeout" });
        var controller = CreateController(db, loggedUserId: cliente.Id, pixReconciliation: foraDoAr.Object,
            inter: CreateInterMockConfiguravel().Object);

        var result = await controller.Cancel(reserva.Id);

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(502);
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("active");
    }

    [Fact]
    public async Task UpdateStatusCancelado_PeloAdmin_TambemDerrubaOPix()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, _, _) = await SeedPedidoNaoPagoComPixAsync(db);
        var inter = CreateInterMockConfiguravel();
        inter.Setup(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Status = "REMOVIDA_PELO_USUARIO_RECEBEDOR" });
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(),
            pixReconciliation: PixAindaAberto().Object, inter: inter.Object);

        var result = await controller.UpdateStatus(reserva.Id, new UpdateReservationStatusRequest { Status = "cancelled" });

        result.Should().BeOfType<OkObjectResult>();
        (await db.PixCobrancas.SingleAsync()).Status.Should().Be("REMOVIDA_PELO_USUARIO_RECEBEDOR");
    }

    [Fact]
    public async Task Cancel_ChaveDesligada_DeixaOPixAbertoComoAntes()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var (reserva, _, cliente) = await SeedPedidoNaoPagoComPixAsync(db);
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        await chaves.DefinirAsync(Funcionalidades.PedidoPixConsistente, false, cliente.Id);
        var inter = CreateInterMockConfiguravel();
        var controller = CreateController(db, loggedUserId: cliente.Id, inter: inter.Object, funcionalidades: chaves);

        var result = await controller.Cancel(reserva.Id);

        result.Should().BeOfType<OkObjectResult>();
        inter.Verify(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()), Times.Never);
        (await db.PixCobrancas.SingleAsync()).Status.Should().Be("ATIVA");
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("cancelled");
    }

    // ── Venda no pagamento (chave "pedido-venda-no-pagamento") ─────────────────

    [Fact]
    public async Task Create_CongelaOPrecoDoPedido()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var controller = CreateController(db, loggedUserId: cliente.Id);

        await controller.Create(new CreateReservationRequest { ProductId = produto.Id, Quantity = 1 });

        (await db.ProductReservations.AsNoTracking().SingleAsync()).UnitPriceInCents.Should().Be(1500);
    }

    [Fact]
    public async Task HomologarGrupo_JaVendidoNoPagamento_SoEntrega()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var groupId = Guid.NewGuid();
        var itens = await SeedCarrinhoAsync(db, cliente.Id, groupId, (produto.Id, 1));
        itens[0].ExpiresAt = null; itens[0].VendaAvulsaId = "venda-pix";
        await db.SaveChangesAsync();
        var (venda, capturadas) = CreateVendaSpy();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: venda);

        var result = await controller.HomologarGrupo(groupId, new HomologarRequest { PaymentMethod = "Dinheiro" });

        result.Should().BeOfType<OkObjectResult>();
        capturadas.Should().BeEmpty("a venda já entrou no Financeiro quando o Pix caiu");
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("fulfilled");
    }

    [Fact]
    public async Task HomologarGrupo_Misturado_VendeSoOQueFaltaComPrecoCongelado()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var pago = await SeedProductAsync(db, stock: 5);
        var balcao = await SeedProductAsync(db, stock: 5);
        var groupId = Guid.NewGuid();
        var itens = await SeedCarrinhoAsync(db, cliente.Id, groupId, (pago.Id, 1), (balcao.Id, 2));
        itens[0].ExpiresAt = null; itens[0].VendaAvulsaId = "venda-pix";
        itens[1].UnitPriceInCents = 1200;
        await db.SaveChangesAsync();
        var mock = new Mock<IVendaAvulsaService>();
        var capturadas = new List<VendaAvulsaRequest>();
        mock.Setup(v => v.RegisterAsync(It.IsAny<VendaAvulsaRequest>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .Callback<VendaAvulsaRequest, Guid, string>((r, _, _) => capturadas.Add(r))
            .ReturnsAsync(new VendaAvulsaDto { Id = "venda-balcao" });
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: mock.Object);

        await controller.HomologarGrupo(groupId, new HomologarRequest { PaymentMethod = "Dinheiro" });

        var item = capturadas.Single().Items.Single();
        (item.ProductId, item.Quantity, item.UnitPriceInCents).Should().Be((balcao.Id, 2, 1200));
        (await db.ProductReservations.AsNoTracking().SingleAsync(r => r.ProductId == balcao.Id)).VendaAvulsaId.Should().Be("venda-balcao");
    }

    [Fact]
    public async Task HomologarGrupo_PixRegistrouAVendaNoMeio_NaoVendeDuasVezes()
    {
        // Corrida: o Homologar leu o item sem venda; antes do UPDATE dele, o Pix registrou a venda.
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var groupId = Guid.NewGuid();
        var itens = await SeedCarrinhoAsync(db, cliente.Id, groupId, (produto.Id, 1));
        var mock = new Mock<IVendaAvulsaService>();
        mock.Setup(v => v.RegisterAsync(It.IsAny<VendaAvulsaRequest>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(new VendaAvulsaDto { Id = "venda-balcao" });
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: mock.Object);
        var lidos = await db.ProductReservations.Include(r => r.Product).Include(r => r.User)
            .Where(r => r.ReservationGroupId == groupId).ToListAsync();      // o que o Homologar leu
        await db.ProductReservations.Where(r => r.Id == itens[0].Id)          // o Pix chegou antes
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, "venda-pix").SetProperty(r => r.ExpiresAt, (DateTime?)null));

        var result = await controller.HomologarItensParaTesteAsync(lidos, new HomologarRequest { PaymentMethod = "Dinheiro" });

        result.Should().BeOfType<BadRequestObjectResult>();
        mock.Verify(v => v.RegisterAsync(It.IsAny<VendaAvulsaRequest>(), It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
        (await db.ProductReservations.AsNoTracking().SingleAsync()).VendaAvulsaId.Should().Be("venda-pix");
    }

    [Fact]
    public async Task Cancelar_VendaSendoRegistradaAgora_RecusaSemDevolverEstoque()
    {
        // O Pix acabou de cair e a venda está sendo gravada: cancelar agora deixaria venda sem pedido
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var itens = await SeedCarrinhoAsync(db, cliente.Id, Guid.NewGuid(), (produto.Id, 1));
        itens[0].ExpiresAt = null; itens[0].VendaAvulsaId = "registrando:tx1";
        await db.SaveChangesAsync();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());
        controller.ControllerContext.HttpContext.User.AddIdentity(
            new System.Security.Claims.ClaimsIdentity([new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Admin")]));

        var result = await controller.UpdateStatus(itens[0].Id, new UpdateReservationStatusRequest { Status = "cancelled" });

        result.Should().BeOfType<ConflictObjectResult>();
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("active");
        (await db.Products.AsNoTracking().SingleAsync()).StockQuantity.Should().Be(5);
    }

    [Fact]
    public async Task UpdateQuantity_PedidoJaVendido_Recusa()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var itens = await SeedCarrinhoAsync(db, cliente.Id, Guid.NewGuid(), (produto.Id, 2));
        itens[0].ExpiresAt = null; itens[0].VendaAvulsaId = "venda-pix";
        await db.SaveChangesAsync();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.UpdateQuantity(itens[0].Id, new UpdateReservationQuantityRequest { Quantity = 1 });

        result.Should().BeOfType<ConflictObjectResult>();
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Quantity.Should().Be(2);
        (await db.Products.AsNoTracking().SingleAsync()).StockQuantity.Should().Be(5);
    }

    [Fact]
    public async Task CancelarPedidoComVenda_ChaveDesligada_AindaEstorna()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var itens = await SeedCarrinhoAsync(db, cliente.Id, Guid.NewGuid(), (produto.Id, 1));
        itens[0].ExpiresAt = null; itens[0].VendaAvulsaId = "venda-pix";
        await db.SaveChangesAsync();
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        await chaves.DefinirAsync(Funcionalidades.PedidoVendaNoPagamento, false, cliente.Id);
        var vendas = new Mock<IVendaAvulsaService>();
        vendas.Setup(v => v.EstornarAsync("venda-pix", It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
              .ReturnsAsync(new VendaAvulsaDto { Id = "venda-pix" });
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: vendas.Object, funcionalidades: chaves);
        controller.ControllerContext.HttpContext.User.AddIdentity(
            new System.Security.Claims.ClaimsIdentity([new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Admin")]));

        var result = await controller.UpdateStatus(itens[0].Id, new UpdateReservationStatusRequest { Status = "cancelled" });

        result.Should().BeOfType<OkObjectResult>("venda que já existe sempre cancela pelo estorno");
        vendas.Verify(v => v.EstornarAsync("venda-pix", It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task UpdateStatusRetirado_SemVenda_Recusa()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var itens = await SeedCarrinhoAsync(db, cliente.Id, Guid.NewGuid(), (produto.Id, 1));
        var controller = CreateController(db, loggedUserId: Guid.NewGuid());

        var result = await controller.UpdateStatus(itens[0].Id, new UpdateReservationStatusRequest { Status = "fulfilled" });

        result.Should().BeOfType<BadRequestObjectResult>("retirar sem venda some com o faturamento");
        (await db.ProductReservations.AsNoTracking().SingleAsync()).Status.Should().Be("active");
    }

    [Fact]
    public async Task CancelarPedidoPagoComVenda_EstornaAVendaECancelaOPedidoInteiroSemDevolverEstoqueDuasVezes()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var a = await SeedProductAsync(db, stock: 5);
        var b = await SeedProductAsync(db, stock: 5);
        var groupId = Guid.NewGuid();
        var itens = await SeedCarrinhoAsync(db, cliente.Id, groupId, (a.Id, 1), (b.Id, 1));
        foreach (var r in itens) { r.ExpiresAt = null; r.VendaAvulsaId = "venda-pix"; }
        await db.SaveChangesAsync();
        var vendas = new Mock<IVendaAvulsaService>();
        vendas.Setup(v => v.EstornarAsync("venda-pix", It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
              .ReturnsAsync(new VendaAvulsaDto { Id = "venda-pix" });
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: vendas.Object);
        controller.ControllerContext.HttpContext.User.AddIdentity(
            new System.Security.Claims.ClaimsIdentity([new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Admin")]));

        var result = await controller.UpdateStatus(itens[0].Id, new UpdateReservationStatusRequest { Status = "cancelled" });

        result.Should().BeOfType<OkObjectResult>();
        vendas.Verify(v => v.EstornarAsync("venda-pix", It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()), Times.Once);
        (await db.ProductReservations.AsNoTracking().ToListAsync()).Should().OnlyContain(r => r.Status == "cancelled");
        (await db.Products.AsNoTracking().Select(p => p.StockQuantity).ToListAsync())
            .Should().OnlyContain(q => q == 5, "quem devolve o estoque é o estorno da venda");
    }

    [Fact]
    public async Task HomologarGrupo_ChaveDesligada_VendePeloPrecoDoMomentoMasNuncaVendeDuasVezes()
    {
        var db = CreateDb(nameof(ReservationControllerTests));
        var cliente = await SeedUserAsync(db);
        var produto = await SeedProductAsync(db, stock: 5);
        var vendidoNoPix = await SeedProductAsync(db, stock: 5);
        var groupId = Guid.NewGuid();
        var itens = await SeedCarrinhoAsync(db, cliente.Id, groupId, (produto.Id, 1), (vendidoNoPix.Id, 1));
        itens[0].UnitPriceInCents = 1200;
        itens[1].ExpiresAt = null; itens[1].VendaAvulsaId = "venda-pix"; // vendeu enquanto a chave estava ligada
        await db.SaveChangesAsync();
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        await chaves.DefinirAsync(Funcionalidades.PedidoVendaNoPagamento, false, cliente.Id);
        var (venda, capturadas) = CreateVendaSpy();
        var controller = CreateController(db, loggedUserId: Guid.NewGuid(), vendaService: venda, funcionalidades: chaves);

        await controller.HomologarGrupo(groupId, new HomologarRequest { PaymentMethod = "Dinheiro" });

        capturadas.Should().ContainSingle();
        var item = capturadas[0].Items.Single();
        item.ProductId.Should().Be(produto.Id, "o que já virou venda no Pix não entra de novo");
        item.UnitPriceInCents.Should().BeNull("jeito antigo: preço do momento");
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
