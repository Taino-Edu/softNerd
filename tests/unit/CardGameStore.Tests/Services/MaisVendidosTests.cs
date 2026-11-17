// =============================================================================
// MaisVendidosTests.cs — ranking público da seção "Mais vendidos" da home (v1.90.0).
// Conta comanda FECHADA e venda de balcão não cancelada, nos últimos 90 dias; o resto fica de fora.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace CardGameStore.Tests.Services;

public class MaisVendidosTests
{
    private static readonly DateTime Agora = new(2026, 11, 17, 15, 0, 0, DateTimeKind.Utc);

    private static AppDbContext CreateDb()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static Product NovoProduto(AppDbContext db, string nome)
    {
        var p = new Product { Name = nome, Category = "Pokémon", PriceInCents = 1000, StockQuantity = 10 };
        db.Products.Add(p);
        return p;
    }

    private static void Comanda(AppDbContext db, User u, ComandaStatus status, DateTime fechada, params (Product p, int qtd)[] itens)
    {
        var c = new Comanda { UserId = u.Id, Status = status, ClosedAt = fechada };
        foreach (var (p, qtd) in itens)
            c.Items.Add(new ComandaItem { ProductId = p.Id, ItemNameSnapshot = p.Name, UnitPriceInCents = 1000, Quantity = qtd, SubtotalInCents = 1000 * qtd });
        db.Comandas.Add(c);
    }

    private static IVendaAvulsaService Balcao(params VendaAvulsaDto[] vendas)
    {
        var m = new Mock<IVendaAvulsaService>();
        m.Setup(s => s.GetRecentAsync(It.IsAny<int>(), It.IsAny<DateTime?>())).ReturnsAsync(vendas);
        return m.Object;
    }

    private static VendaAvulsaDto Venda(Product p, int qtd, bool cancelada = false) => new()
    {
        SoldAt = Agora.AddDays(-1), Cancelada = cancelada,
        Items = [new VendaAvulsaItemDto { ProductId = p.Id, ProductName = p.Name, Quantity = qtd }],
    };

    [Fact]
    public async Task SomaComandaFechadaEBalcao_EOrdenaPorUnidades()
    {
        var db = CreateDb();
        var u = new User { Name = "C", Email = "c@t.com", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.Add(u);
        var booster = NovoProduto(db, "Booster");
        var sleeve  = NovoProduto(db, "Sleeve");
        var deck    = NovoProduto(db, "Deck box");
        Comanda(db, u, ComandaStatus.Fechada, Agora.AddDays(-2), (booster, 2), (sleeve, 1));
        await db.SaveChangesAsync();

        // Sleeve: 1 na comanda + 3 no balcão = 4 > Booster 2 > Deck box 1
        var ids = await MaisVendidos.CalcularAsync(db, Balcao(Venda(sleeve, 3), Venda(deck, 1)), 10, Agora);

        ids.Should().Equal(sleeve.Id, booster.Id, deck.Id);
    }

    [Fact]
    public async Task ComandaAbertaCanceladaOuAntiga_EVendaCancelada_NaoContam()
    {
        var db = CreateDb();
        var u = new User { Name = "C", Email = "c@t.com", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.Add(u);
        var vale   = NovoProduto(db, "Vale");
        var aberta = NovoProduto(db, "Aberta");
        var velha  = NovoProduto(db, "Velha");
        var estorn = NovoProduto(db, "Cancelada no balcão");
        Comanda(db, u, ComandaStatus.Fechada, Agora.AddDays(-5), (vale, 1));
        Comanda(db, u, ComandaStatus.Aberta, Agora.AddDays(-1), (aberta, 9));
        Comanda(db, u, ComandaStatus.Cancelada, Agora.AddDays(-1), (aberta, 9));
        Comanda(db, u, ComandaStatus.Fechada, Agora.AddDays(-(MaisVendidos.DiasDeJanela + 1)), (velha, 9));
        await db.SaveChangesAsync();

        var ids = await MaisVendidos.CalcularAsync(db, Balcao(Venda(estorn, 9, cancelada: true)), 10, Agora);

        ids.Should().Equal(vale.Id);
    }

    [Fact]
    public async Task ForaDaVitrine_NaoOcupaVaga()
    {
        var db = CreateDb();
        var u = new User { Name = "C", Email = "c@t.com", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.Add(u);
        var esgotado = NovoProduto(db, "Esgotado");   esgotado.StockQuantity = 0;
        var inativo  = NovoProduto(db, "Inativo");    inativo.IsActive = false;
        var escondido = NovoProduto(db, "Escondido"); escondido.ShowOnMarketplace = false;
        var variacao = NovoProduto(db, "Camiseta");   variacao.HasVariants = true; variacao.StockQuantity = 0;
        db.Set<ProductVariant>().Add(new ProductVariant { ProductId = variacao.Id, Size = "M", StockQuantity = 2 });
        var normal   = NovoProduto(db, "Normal");
        Comanda(db, u, ComandaStatus.Fechada, Agora.AddDays(-1),
            (esgotado, 9), (inativo, 8), (escondido, 7), (variacao, 2), (normal, 1));
        await db.SaveChangesAsync();

        // Limite 2: os três de fora não gastam vaga; a camiseta tem estoque nas variações
        var ids = await MaisVendidos.CalcularAsync(db, Balcao(), 2, Agora);

        ids.Should().Equal(variacao.Id, normal.Id);
    }

    [Fact]
    public async Task RespeitaOLimite()
    {
        var db = CreateDb();
        var u = new User { Name = "C", Email = "c@t.com", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.Add(u);
        var ps = Enumerable.Range(1, 5).Select(i => NovoProduto(db, $"P{i}")).ToList();
        Comanda(db, u, ComandaStatus.Fechada, Agora.AddDays(-1), ps.Select((p, i) => (p, i + 1)).ToArray());
        await db.SaveChangesAsync();

        var ids = await MaisVendidos.CalcularAsync(db, Balcao(), 2, Agora);

        ids.Should().Equal(ps[4].Id, ps[3].Id);
    }
}
