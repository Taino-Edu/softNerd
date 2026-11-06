// =============================================================================
// DescontoPixPedidoTests.cs — Pix do pedido do site com o desconto que a loja anuncia
// (chave pix-pedido-com-desconto, v1.83.0). A vitrine mostrava "R$ 35,91 no Pix" e o QR
// cobrava R$ 39,90. Os dois caminhos testados: chave ligada (com desconto) e desligada (cheio).
// =============================================================================

using System.Text.Json;
using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Pedidos;
using CardGameStore.Services.Vigia;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class DescontoPixPedidoTests
{
    // ── Regra do percentual (espelho de resolvePixPercent da vitrine) ───────────

    private static readonly ProductCategory Cartas  = new() { Name = "Cartas",  PixDiscountPercent = 7m };
    private static readonly ProductCategory Pokemon = new() { Name = "Pokémon", PixDiscountPercent = 3m };
    private static readonly ProductCategory OnePiece = new() { Name = "One Piece" };
    private static List<ProductCategory> Categorias()
    {
        OnePiece.ParentCategoryId = Cartas.Id;
        return [Cartas, Pokemon, OnePiece, new() { Name = "Acessórios" }];
    }

    [Theory]
    [InlineData(null, "Pokémon", 3)]    // categoria com percentual próprio
    [InlineData(null, "pokémon", 3)]    // nome sem diferenciar maiúscula
    [InlineData(null, "One Piece", 7)]  // subcategoria sem percentual herda do pai
    [InlineData(null, "Acessórios", 10)] // categoria sem percentual e sem pai → padrão da loja
    [InlineData(null, "Inexistente", 10)]
    [InlineData(15, "Pokémon", 15)]     // o do produto manda
    [InlineData(0, "Pokémon", 0)]       // 0 no produto é "sem desconto", não "herda"
    public void Percentual_SegueAOrdemDaVitrine(int? doProduto, string categoria, int esperado)
    {
        var produto = new Product { Name = "X", Category = categoria, PixDiscountPercent = doProduto };
        DescontoPixPedido.Percentual(produto, Categorias(), 10m).Should().Be(esperado);
    }

    [Theory]
    [InlineData(3990, 10, 3591)]   // o "R$ 35,91 no Pix" do sleeve
    [InlineData(19499, 3, 18914)]  // 189,1403 → centavo pra baixo, a favor do cliente
    [InlineData(1000, 0, 1000)]
    [InlineData(1000, 150, 0)]     // percentual fora da faixa é limitado
    public void PrecoNoPix_CentavoPraBaixo(int preco, int pct, int esperado) =>
        DescontoPixPedido.PrecoNoPix(preco, pct).Should().Be(esperado);

    // ── Cobrança do Pix do pedido ────────────────────────────────────────────

    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static Mock<InterSyncService> CreateInterMock()
    {
        var env = new Mock<IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);
        inter.Setup(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { TxId = Guid.NewGuid().ToString("N"), Status = "ATIVA" });
        return inter;
    }

    /// <summary>Pedido do teste do celular: sleeve R$ 39,90 (acessório, padrão 10%) + booster R$ 194,99 (Pokémon, 3%).</summary>
    private static async Task<(Guid Grupo, User Cliente)> SeedPedidoAsync(AppDbContext db)
    {
        var cliente = new User { Id = Guid.NewGuid(), Name = "Cliente", Email = "c@test.com", PasswordHash = "hash", Role = UserRole.Customer };
        db.Users.Add(cliente);
        db.IntegrationConfigs.Add(new IntegrationConfig { Source = "inter" });
        db.SiteConfigs.Add(new SiteConfig { PixDiscountPercent = 10m });
        db.ProductCategories.Add(new ProductCategory { Name = "Pokémon", PixDiscountPercent = 3m });
        var grupo = Guid.NewGuid();
        foreach (var (nome, categoria, preco) in new[] { ("Sleeve", "Acessórios", 3990), ("Booster", "Pokémon", 19499) })
        {
            var p = new Product { Name = nome, Category = categoria, PriceInCents = preco, StockQuantity = 5, IsActive = true };
            db.Products.Add(p);
            db.ProductReservations.Add(new ProductReservation
            {
                ReservationGroupId = grupo, UserId = cliente.Id, ProductId = p.Id, Quantity = 1,
                Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow, UnitPriceInCents = preco,
            });
        }
        await db.SaveChangesAsync();
        return (grupo, cliente);
    }

    private static FuncionalidadesService Chaves(AppDbContext db) => new(db, new MemoryCache(new MemoryCacheOptions()));

    [Fact]
    public async Task ChaveLigada_PixCobraComODescontoDaLojaEGravaODesconto()
    {
        var db = CreateDb();
        var (grupo, cliente) = await SeedPedidoAsync(db);
        var inter = CreateInterMock();

        var r = await new ReservationPixService(db, inter.Object, Chaves(db)).GerarAsync(grupo, cliente.Id);

        r.Success.Should().BeTrue(r.Error);
        // 39,90 → 35,91 (10%) e 194,99 → 189,14 (3%): o mesmo "No Pix R$ 225,05" da sacola
        r.Pix!.ValorEmCentavos.Should().Be(22505);
        r.Pix.DescontoEmCentavos.Should().Be(23489 - 22505);
        inter.Verify(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), 22505,
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task ChaveDesligada_PixCobraOPrecoCheio()
    {
        var db = CreateDb();
        var (grupo, cliente) = await SeedPedidoAsync(db);
        var chaves = Chaves(db);
        await chaves.DefinirAsync(Funcionalidades.PixPedidoComDesconto, false, Guid.NewGuid());

        var r = await new ReservationPixService(db, CreateInterMock().Object, chaves).GerarAsync(grupo, cliente.Id);

        r.Success.Should().BeTrue(r.Error);
        r.Pix!.ValorEmCentavos.Should().Be(23489, "jeito antigo: o desconto do Pix fica só na vitrine");
        r.Pix.DescontoEmCentavos.Should().BeNull();
    }

    [Fact]
    public async Task ChaveLigada_DescontoDe100PorCento_NaoGeraPixNemCobraCheio()
    {
        var db = CreateDb();
        var (grupo, cliente) = await SeedPedidoAsync(db);
        foreach (var p in db.Products) p.PixDiscountPercent = 100m;
        await db.SaveChangesAsync();
        var inter = CreateInterMock();

        var r = await new ReservationPixService(db, inter.Object, Chaves(db)).GerarAsync(grupo, cliente.Id);

        r.Success.Should().BeFalse("Pix de R$ 0 não existe e o preço cheio cobraria o que era de graça");
        inter.Verify(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Vigia_NaoAcusaPixComODescontoGravado()
    {
        var db = CreateDb();
        var (grupo, _) = await SeedPedidoAsync(db);
        var itens = await db.ProductReservations.Where(r => r.ReservationGroupId == grupo).Select(r => r.Id).ToListAsync();
        db.PixCobrancas.Add(new PixCobranca
        {
            Origem = PixCobrancaOrigem.Reserva, ReservationGroupId = grupo, TxId = "tx-desconto",
            ValorEmCentavos = 22505, DescontoEmCentavos = 984, Status = "CONCLUIDA", PagoEm = DateTime.UtcNow,
            ReservationItemIdsJson = JsonSerializer.Serialize(itens),
        });
        await db.SaveChangesAsync();

        var achados = await new VerificacaoValorPixDiferente(db).VerificarAsync(CancellationToken.None);

        achados.Should().BeEmpty("o Pix cobrou o pedido menos o desconto da loja — não é valor diferente");
    }
}
