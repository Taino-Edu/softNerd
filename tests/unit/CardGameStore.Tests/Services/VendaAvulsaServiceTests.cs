// =============================================================================
// VendaAvulsaServiceTests.cs — Testes unitários do VendaAvulsaService
// MongoDB é mockado com Moq; PostgreSQL usa InMemory database.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using MongoDB.Driver;

namespace CardGameStore.Tests.Services;

public class VendaAvulsaServiceTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    // Usa SQLite in-memory (não o EF InMemory provider) para suportar ExecuteUpdateAsync.
    // O EF InMemory provider não implementa bulk operations (ExecuteUpdate/Delete).
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

    private static (Mock<IMongoDatabase> db, Mock<IMongoCollection<VendaAvulsa>> collection) CreateMongoBacks(
        List<VendaAvulsa>? storedDocs = null)
    {
        storedDocs ??= new List<VendaAvulsa>();

        var mockCollection = new Mock<IMongoCollection<VendaAvulsa>>();

        // ── InsertOneAsync ────────────────────────────────────────────────────
        // InsertOneAsync(TDocument, InsertOneOptions?, CancellationToken) is a real
        // IMongoCollection interface method — Moq can intercept it directly.
        mockCollection
            .Setup(c => c.InsertOneAsync(
                It.IsAny<VendaAvulsa>(),
                It.IsAny<InsertOneOptions>(),
                It.IsAny<CancellationToken>()))
            .Callback<VendaAvulsa, InsertOneOptions?, CancellationToken>((doc, _, _) => storedDocs.Add(doc))
            .Returns(Task.CompletedTask);

        // ── FindAsync<TResult> ────────────────────────────────────────────────
        // In MongoDB.Driver 2.28 the fluent .Find() / .SortByDescending() / .Limit()
        // are ALL extension methods and cannot be mocked by Moq.
        // Strategy: let the real FindFluent (created by the extension) run its chain,
        // and mock only FindAsync<VendaAvulsa> — the actual IMongoCollection interface
        // method that FindFluent calls internally when ToListAsync() is invoked.
        var mockCursor = new Mock<IAsyncCursor<VendaAvulsa>>();
        mockCursor.Setup(c => c.Current).Returns(storedDocs);
        mockCursor.SetupSequence(c => c.MoveNextAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(true)
            .ReturnsAsync(false);

        // Session-ful overload (called by FindFluent with session = null):
        mockCollection
            .Setup(c => c.FindAsync<VendaAvulsa>(
                It.IsAny<IClientSessionHandle>(),
                It.IsAny<FilterDefinition<VendaAvulsa>>(),
                It.IsAny<FindOptions<VendaAvulsa, VendaAvulsa>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(mockCursor.Object);

        // Session-less overload (fallback, in case the driver uses this path):
        mockCollection
            .Setup(c => c.FindAsync<VendaAvulsa>(
                It.IsAny<FilterDefinition<VendaAvulsa>>(),
                It.IsAny<FindOptions<VendaAvulsa, VendaAvulsa>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(mockCursor.Object);

        var mockMongo = new Mock<IMongoDatabase>();
        mockMongo
            .Setup(m => m.GetCollection<VendaAvulsa>(It.IsAny<string>(), It.IsAny<MongoCollectionSettings>()))
            .Returns(mockCollection.Object);

        return (mockMongo, mockCollection);
    }

    /// <summary>Cria mock de IHubContext com Clients.Group configurado para evitar NullReferenceException.</summary>
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

    private static VendaAvulsaService CreateService(AppDbContext db, IMongoDatabase mongo) =>
        new(db, mongo, NullLogger<VendaAvulsaService>.Instance, new Mock<IServiceScopeFactory>().Object, CreateHubMock());

    private static async Task<Product> SeedProductAsync(AppDbContext db,
        string name = "Booster Pack", int priceInCents = 1500, int stock = 10, bool isActive = true)
    {
        var product = new Product
        {
            Id            = Guid.NewGuid(),
            Name          = name,
            Category      = "MTG",
            PriceInCents  = priceInCents,
            StockQuantity = stock,
            MinimumStock  = 2,
            IsActive      = isActive,
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    }

    private static readonly Guid AdminId   = Guid.NewGuid();
    private const string AdminName = "Admin Teste";

    // ── Registro bem-sucedido ─────────────────────────────────────────────────

    [Fact]
    public async Task Register_Sucesso_DeveDecrementarEstoqueERetornarDto()
    {
        var db = CreateDb(nameof(Register_Sucesso_DeveDecrementarEstoqueERetornarDto));
        var product = await SeedProductAsync(db, priceInCents: 2000, stock: 5);
        var (mockMongo, _) = CreateMongoBacks();

        var service  = CreateService(db, mockMongo.Object);
        var request  = new VendaAvulsaRequest
        {
            PaymentMethod = PaymentMethod.Pix,
            Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 2 }],
        };

        var resultado = await service.RegisterAsync(request, AdminId, AdminName);

        resultado.TotalInReais.Should().Be(40.00m); // 2 × R$ 20,00
        resultado.PaymentMethod.Should().Be(PaymentMethod.Pix);
        resultado.Items.Should().ContainSingle();
        resultado.Items[0].Quantity.Should().Be(2);
        resultado.Items[0].SubtotalInReais.Should().Be(40.00m);

        // ExecuteUpdateAsync bypassa o change tracker — limpar antes de reler do banco
        db.ChangeTracker.Clear();
        var estoque = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoque.Should().Be(3); // 5 - 2
    }

    [Fact]
    public async Task Register_ComClientName_DevePreservarNomeNoDto()
    {
        var db = CreateDb(nameof(Register_ComClientName_DevePreservarNomeNoDto));
        var product = await SeedProductAsync(db);
        var (mockMongo, _) = CreateMongoBacks();

        var service   = CreateService(db, mockMongo.Object);
        var resultado = await service.RegisterAsync(new VendaAvulsaRequest
        {
            ClientName    = "  João Silva  ",
            PaymentMethod = PaymentMethod.Dinheiro,
            Items         = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 1 }],
        }, AdminId, AdminName);

        resultado.ClientName.Should().Be("João Silva"); // trimado
    }

    [Fact]
    public async Task Register_SemClientName_DeveSetarNuloNoDto()
    {
        var db = CreateDb(nameof(Register_SemClientName_DeveSetarNuloNoDto));
        var product = await SeedProductAsync(db);
        var (mockMongo, _) = CreateMongoBacks();

        var service   = CreateService(db, mockMongo.Object);
        var resultado = await service.RegisterAsync(new VendaAvulsaRequest
        {
            ClientName    = null,
            PaymentMethod = PaymentMethod.CartaoCredito,
            Items         = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 1 }],
        }, AdminId, AdminName);

        resultado.ClientName.Should().BeNull();
    }

    [Fact]
    public async Task Register_MultiplosProdutos_DeveSomarTotalCorretamente()
    {
        var db = CreateDb(nameof(Register_MultiplosProdutos_DeveSomarTotalCorretamente));
        var p1 = await SeedProductAsync(db, "Card A", priceInCents: 1000, stock: 5);
        var p2 = await SeedProductAsync(db, "Card B", priceInCents: 500,  stock: 5);
        var (mockMongo, _) = CreateMongoBacks();

        var service   = CreateService(db, mockMongo.Object);
        var resultado = await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod = PaymentMethod.CartaoDebito,
            Items =
            [
                new VendaAvulsaItemRequest { ProductId = p1.Id, Quantity = 3 },
                new VendaAvulsaItemRequest { ProductId = p2.Id, Quantity = 2 },
            ],
        }, AdminId, AdminName);

        resultado.TotalInReais.Should().Be(40.00m); // 3×10 + 2×5
        resultado.Items.Should().HaveCount(2);

        // ExecuteUpdateAsync bypassa o change tracker — limpar antes de reler do banco
        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(p1.Id))!.StockQuantity.Should().Be(2);
        (await db.Products.FindAsync(p2.Id))!.StockQuantity.Should().Be(3);
    }

    [Fact]
    public async Task Register_DevePersistirDocumentoNoMongoDB()
    {
        var db = CreateDb(nameof(Register_DevePersistirDocumentoNoMongoDB));
        var product = await SeedProductAsync(db);
        var storedDocs = new List<VendaAvulsa>();
        var (mockMongo, _) = CreateMongoBacks(storedDocs);

        var service = CreateService(db, mockMongo.Object);
        await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod = PaymentMethod.Pix,
            Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 1 }],
        }, AdminId, AdminName);

        storedDocs.Should().ContainSingle();
        storedDocs[0].SoldByAdminId.Should().Be(AdminId);
        storedDocs[0].SoldByAdminName.Should().Be(AdminName);
        storedDocs[0].PaymentMethod.Should().Be(PaymentMethod.Pix);
    }

    // ── Validações ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Register_ProdutoNaoEncontrado_DeveLancarExcecao()
    {
        var db = CreateDb(nameof(Register_ProdutoNaoEncontrado_DeveLancarExcecao));
        var (mockMongo, _) = CreateMongoBacks();
        var service = CreateService(db, mockMongo.Object);

        var act = async () => await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod = PaymentMethod.Pix,
            Items = [new VendaAvulsaItemRequest { ProductId = Guid.NewGuid(), Quantity = 1 }],
        }, AdminId, AdminName);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*não encontrado ou inativo*");
    }

    [Fact]
    public async Task Register_ProdutoInativo_DeveLancarExcecao()
    {
        var db = CreateDb(nameof(Register_ProdutoInativo_DeveLancarExcecao));
        var product = await SeedProductAsync(db, isActive: false);
        var (mockMongo, _) = CreateMongoBacks();
        var service = CreateService(db, mockMongo.Object);

        var act = async () => await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod = PaymentMethod.Pix,
            Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 1 }],
        }, AdminId, AdminName);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*não encontrado ou inativo*");
    }

    [Fact]
    public async Task Register_EstoqueInsuficiente_DeveLancarExcecao()
    {
        var db = CreateDb(nameof(Register_EstoqueInsuficiente_DeveLancarExcecao));
        var product = await SeedProductAsync(db, stock: 2);
        var (mockMongo, _) = CreateMongoBacks();
        var service = CreateService(db, mockMongo.Object);

        var act = async () => await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod = PaymentMethod.Pix,
            Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 5 }],
        }, AdminId, AdminName);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Estoque insuficiente*");
    }

    [Fact]
    public async Task Register_EstoqueInsuficiente_NaoDeveAlterarEstoque()
    {
        var db = CreateDb(nameof(Register_EstoqueInsuficiente_NaoDeveAlterarEstoque));
        var product = await SeedProductAsync(db, stock: 3);
        var (mockMongo, _) = CreateMongoBacks();
        var service = CreateService(db, mockMongo.Object);

        try
        {
            await service.RegisterAsync(new VendaAvulsaRequest
            {
                PaymentMethod = PaymentMethod.Pix,
                Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 10 }],
            }, AdminId, AdminName);
        }
        catch (InvalidOperationException) { }

        // Estoque não deve ter sido alterado — fail-fast antes de qualquer escrita
        db.ChangeTracker.Clear();
        var estoque = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoque.Should().Be(3);
    }

    // ── Desconto ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Register_ComDesconto10Porcento_DeveCalcularTotalComDesconto()
    {
        // 1 × R$20,00 com 10% desconto → R$18,00 final, R$2,00 desconto
        var db = CreateDb(nameof(Register_ComDesconto10Porcento_DeveCalcularTotalComDesconto));
        var product = await SeedProductAsync(db, priceInCents: 2000, stock: 5);
        var (mockMongo, _) = CreateMongoBacks();
        var service = CreateService(db, mockMongo.Object);

        var result = await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod   = PaymentMethod.Pix,
            DiscountPercent = 10,
            Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 1 }],
        }, AdminId, AdminName);

        result.TotalInReais.Should().Be(18.00m,    "10% de desconto sobre R$20,00");
        result.DiscountPercent.Should().Be(10);
        result.DiscountInReais.Should().Be(2.00m,  "desconto de 10% sobre R$20,00 = R$2,00");
    }

    [Fact]
    public async Task Register_SemDesconto_TotalDeveSerioBruto()
    {
        // DiscountPercent = 0 → total bruto sem alteração
        var db = CreateDb(nameof(Register_SemDesconto_TotalDeveSerioBruto));
        var product = await SeedProductAsync(db, priceInCents: 1500, stock: 3);
        var (mockMongo, _) = CreateMongoBacks();
        var service = CreateService(db, mockMongo.Object);

        var result = await service.RegisterAsync(new VendaAvulsaRequest
        {
            PaymentMethod   = PaymentMethod.Dinheiro,
            DiscountPercent = 0,
            Items = [new VendaAvulsaItemRequest { ProductId = product.Id, Quantity = 2 }],
        }, AdminId, AdminName);

        result.TotalInReais.Should().Be(30.00m);  // 2 × R$15,00
        result.DiscountInReais.Should().Be(0.00m);
    }

    // ── GetByDate ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetByDate_DeveRetornarVendasMapeadasComTotalCorreto()
    {
        var db = CreateDb(nameof(GetByDate_DeveRetornarVendasMapeadasComTotalCorreto));
        var targetDate = DateTime.UtcNow.Date;
        var doc = new VendaAvulsa
        {
            PaymentMethod   = PaymentMethod.Pix,
            ClientName      = "Comprador Dia",
            TotalInCents    = 5000,
            DiscountInCents = 500,
            DiscountPercent = 10,
            SoldAt          = targetDate.AddHours(14), // 14h do dia alvo
            SoldByAdminId   = AdminId,
            SoldByAdminName = AdminName,
            Items =
            [
                new VendaAvulsaItem
                {
                    ProductId = Guid.NewGuid(), ProductName = "Booster",
                    Quantity = 1, UnitPriceInCents = 5500, SubtotalInCents = 5500
                }
            ],
        };
        var (mockMongo, _) = CreateMongoBacks([doc]);
        var service = CreateService(db, mockMongo.Object);

        var result = (await service.GetByDateAsync(targetDate)).ToList();

        result.Should().ContainSingle();
        result[0].TotalInReais.Should().Be(50.00m);         // 5000 / 100
        result[0].DiscountInReais.Should().Be(5.00m);       // 500 / 100
        result[0].ClientName.Should().Be("Comprador Dia");
        result[0].PaymentMethod.Should().Be(PaymentMethod.Pix);
    }

    [Fact]
    public async Task GetByDate_SemVendas_DeveRetornarListaVazia()
    {
        var db = CreateDb(nameof(GetByDate_SemVendas_DeveRetornarListaVazia));
        // Cursor mock que retorna lista vazia
        var (mockMongo, _) = CreateMongoBacks(new List<VendaAvulsa>());
        var service = CreateService(db, mockMongo.Object);

        var result = (await service.GetByDateAsync(DateTime.UtcNow.Date)).ToList();

        result.Should().BeEmpty("sem vendas no MongoDB, lista deve ser vazia");
    }

    // ── GetRecent ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetRecent_DeveRetornarVendasMapeadasDoMongo()
    {
        var db = CreateDb(nameof(GetRecent_DeveRetornarVendasMapeadasDoMongo));
        var existingDoc = new VendaAvulsa
        {
            PaymentMethod   = PaymentMethod.Dinheiro,
            ClientName      = "Carlos",
            TotalInCents    = 3000,
            SoldByAdminId   = AdminId,
            SoldByAdminName = AdminName,
            SoldAt          = DateTime.UtcNow,
            Items =
            [
                new VendaAvulsaItem
                {
                    ProductId = Guid.NewGuid(), ProductName = "Draft Set",
                    Quantity = 1, UnitPriceInCents = 3000, SubtotalInCents = 3000,
                }
            ],
        };
        var (mockMongo, _) = CreateMongoBacks([existingDoc]);
        var service = CreateService(db, mockMongo.Object);

        var resultado = (await service.GetRecentAsync(10)).ToList();

        resultado.Should().ContainSingle();
        resultado[0].ClientName.Should().Be("Carlos");
        resultado[0].TotalInReais.Should().Be(30.00m);
        resultado[0].PaymentMethod.Should().Be(PaymentMethod.Dinheiro);
    }
}
