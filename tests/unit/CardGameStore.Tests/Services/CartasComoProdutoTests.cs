// =============================================================================
// CartasComoProdutoTests.cs — carta avulsa vira produto (v1.91.0, chave "cartas-como-produto").
// A carta fica no Mercado de Cartas (GET /api/product/cartas) e some de Produtos/home com a chave ligada;
// desligada, a lista de Produtos volta a ser a de antes (a carta aparece como produto comum).
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace CardGameStore.Tests.Services;

public class CartasComoProdutoTests
{
    private static AppDbContext CreateDb()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static (ProductService servico, FuncionalidadesService chaves) Servico(AppDbContext db)
    {
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        var servico = new ProductService(db,
            new Mock<IPushService>().Object, new Mock<IEmailService>().Object,
            new Mock<ILogger<ProductService>>().Object, chaves);
        return (servico, chaves);
    }

    private static Product Produto(string nome, int estoque = 3) => new()
    {
        Name = nome, Category = "Booster", PriceInCents = 2500, StockQuantity = estoque, MinimumStock = 1,
    };

    private static Product Carta(string nome, string jogo = "Pokémon", string? colecao = null, int estoque = 1,
        DateTime? criada = null, string? numero = null) => new()
    {
        Name = nome, Category = "Cartas avulsas", PriceInCents = 1500, StockQuantity = estoque, MinimumStock = 0,
        CartaAvulsa = true, CartaJogo = jogo, CartaCondicao = "NM", CartaColecao = colecao, CartaIdioma = "PT",
        CartaNumero = numero,
        CreatedAt = criada ?? DateTime.UtcNow,
    };

    [Fact]
    public async Task ChaveLigada_CartaSaiDeProdutos()
    {
        var db = CreateDb();
        db.Products.AddRange(Produto("Booster 151"), Carta("Pikachu ex"));
        await db.SaveChangesAsync();
        var (servico, _) = Servico(db);

        var lista = await servico.GetAllActiveAsync();
        var porCategoria = await servico.GetByCategoryAsync("Cartas avulsas");

        lista.Select(p => p.Name).Should().Equal("Booster 151");
        porCategoria.Should().BeEmpty();
    }

    [Fact]
    public async Task ChaveDesligada_CartaVoltaAProdutosComoAntes()
    {
        var db = CreateDb();
        db.Products.AddRange(Produto("Booster 151"), Carta("Pikachu ex"));
        await db.SaveChangesAsync();
        var (servico, chaves) = Servico(db);
        await chaves.DefinirAsync(Funcionalidades.CartasComoProduto, false, Guid.NewGuid());

        var lista = await servico.GetAllActiveAsync();

        lista.Select(p => p.Name).Should().BeEquivalentTo("Booster 151", "Pikachu ex");
    }

    [Fact]
    public async Task SemServicoDeChaves_ListaFicaComoAntes()
    {
        // Quem monta o ProductService sem a chave (testes antigos, outros serviços) vê a lista de sempre
        var db = CreateDb();
        db.Products.AddRange(Produto("Booster 151"), Carta("Pikachu ex"));
        await db.SaveChangesAsync();
        var servico = new ProductService(db, new Mock<IPushService>().Object, new Mock<IEmailService>().Object,
            new Mock<ILogger<ProductService>>().Object);

        (await servico.GetAllActiveAsync()).Should().HaveCount(2);
    }

    [Fact]
    public async Task Mercado_SoCartaAtivaNaLojaEComEstoque_MaisNovaPrimeiro()
    {
        var db = CreateDb();
        var agora = DateTime.UtcNow;
        var esgotada  = Carta("Esgotada", estoque: 0);
        var inativa   = Carta("Inativa");   inativa.IsActive = false;
        var escondida = Carta("Escondida"); escondida.ShowOnMarketplace = false;
        db.Products.AddRange(
            Produto("Booster 151"), esgotada, inativa, escondida,
            Carta("Charizard ex", criada: agora.AddDays(-2)),
            Carta("Mew ex", criada: agora.AddDays(-1)));
        await db.SaveChangesAsync();
        var (servico, _) = Servico(db);

        var cartas = await servico.ListarCartasAsync(null, null);

        cartas.Select(c => c.Name).Should().Equal("Mew ex", "Charizard ex");
    }

    [Fact]
    public async Task Mercado_FiltraPorJogoEBuscaNoNomeNaColecaoENoNumero()
    {
        var db = CreateDb();
        db.Products.AddRange(
            Carta("Charizard ex", colecao: "151", numero: "199/165"),
            Carta("Pikachu", colecao: "Base Set"),
            Carta("Lightning Bolt", jogo: "Magic", colecao: "Alpha"));
        await db.SaveChangesAsync();
        var (servico, _) = Servico(db);

        (await servico.ListarCartasAsync("Magic", null)).Select(c => c.Name).Should().Equal("Lightning Bolt");
        (await servico.ListarCartasAsync(null, "199/165")).Select(c => c.Name).Should().Equal("Charizard ex");
        (await servico.ListarCartasAsync("Pokémon", "PIKA")).Select(c => c.Name).Should().Equal("Pikachu");
        (await servico.ListarCartasAsync(null, "base")).Select(c => c.Name).Should().Equal("Pikachu");
    }

    [Fact]
    public async Task Cadastro_LimpaOsCamposDaCarta_ERecusaEstadoForaDaLista()
    {
        var db = CreateDb();
        var (servico, _) = Servico(db);

        var criada = await servico.CreateAsync(new Product
        {
            Name = "Mew ex", Category = "Cartas avulsas", PriceInCents = 1500, StockQuantity = 1,
            CartaAvulsa = true, CartaJogo = "  Pokémon ", CartaCondicao = "lp", CartaColecao = "  ", CartaIdioma = "pt",
            CartaNumero = " 199/165 ", CartaRaridade = "   ",
        });

        criada.CartaJogo.Should().Be("Pokémon");
        criada.CartaCondicao.Should().Be("LP");
        criada.CartaColecao.Should().BeNull();
        criada.CartaIdioma.Should().Be("PT");
        criada.CartaNumero.Should().Be("199/165");
        criada.CartaRaridade.Should().BeNull();

        var errada = async () => await servico.CreateAsync(new Product
        {
            Name = "X", Category = "Cartas avulsas", PriceInCents = 100, StockQuantity = 1, CartaAvulsa = true, CartaCondicao = "Novinha",
        });
        await errada.Should().ThrowAsync<ArgumentException>().WithMessage("*NM, LP, MP, HP, DMG*");
    }

    [Fact]
    public async Task Editar_GuardaOsCamposDaCarta()
    {
        var db = CreateDb();
        var carta = Carta("Mew ex", colecao: "151");
        db.Products.Add(carta);
        await db.SaveChangesAsync();
        var (servico, _) = Servico(db);

        var editada = await servico.UpdateAsync(new Product
        {
            Id = carta.Id, Name = "Mew ex", Category = "Cartas avulsas", PriceInCents = 1800, StockQuantity = 2,
            CartaAvulsa = true, CartaJogo = "Pokémon", CartaCondicao = "MP", CartaColecao = "151", CartaIdioma = "EN",
            CartaNumero = "151/165", CartaRaridade = "Rara Ilustração",
        });

        editada.CartaCondicao.Should().Be("MP");
        editada.CartaColecao.Should().Be("151");
        editada.CartaNumero.Should().Be("151/165");
        editada.CartaRaridade.Should().Be("Rara Ilustração");
        editada.CartaIdioma.Should().Be("EN");
        editada.StockQuantity.Should().Be(2);
    }
}
