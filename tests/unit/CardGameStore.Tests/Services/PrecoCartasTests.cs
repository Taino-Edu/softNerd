// =============================================================================
// PrecoCartasTests.cs — preço de referência das cartas avulsas (v1.92.0, chave "preco-referencia-cartas").
// Regra da loja (sugestão), rodada do robô (referência, histórico do dia, ajuste só nas marcadas),
// cotação degradada não precifica, chave desligada não mexe, variação de 7/30 dias, hora do robô
// e a leitura do catálogo tcgcsv (cartas sem número = selado, raridade traduzida, nome sem número).
// =============================================================================

using System.Net;
using System.Text;
using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class PrecoCartasTests
{
    private static AppDbContext CreateDb()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private sealed class CotacaoFixa(decimal valor, bool degradada = false) : IFonteCotacao
    {
        public Task<CotacaoUsdBrl> GetCotacaoAsync() =>
            Task.FromResult(new CotacaoUsdBrl(valor, DateTime.UtcNow, "teste", degradada, degradada ? "Cotação desatualizada" : null));
    }

    /// <summary>Catálogo de mentira: preços por (categoria, grupo) → produto.</summary>
    private sealed class CatalogoFalso : ICatalogoCartas
    {
        public Dictionary<(int, int), Dictionary<int, IReadOnlyList<PrecoCatalogo>>> Precos { get; } = new();
        public int Leituras { get; private set; }
        /// <summary>Roda no meio da leitura de preços (simula outra rodada gravando ao mesmo tempo).</summary>
        public Func<Task>? AoLer { get; set; }
        public Task<IReadOnlyList<ColecaoCatalogo>> ColecoesAsync(string jogo, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<ColecaoCatalogo>>([]);
        public Task<IReadOnlyList<CartaCatalogo>> CartasAsync(int categoria, int grupo, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<CartaCatalogo>>([]);
        public Task<IReadOnlyList<SeladoCatalogo>> SeladosAsync(int categoria, int grupo, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<SeladoCatalogo>>([]);
        public async Task<IReadOnlyDictionary<int, IReadOnlyList<PrecoCatalogo>>> PrecosAsync(int categoria, int grupo, CancellationToken ct = default)
        {
            Leituras++;
            if (AoLer is not null) await AoLer();
            if (!Precos.TryGetValue((categoria, grupo), out var p)) throw new HttpRequestException("fora do ar");
            return p;
        }
    }

    private static (PrecoCartasService servico, FuncionalidadesService chaves) Servico(AppDbContext db, ICatalogoCartas catalogo, IFonteCotacao cotacao)
    {
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        return (new PrecoCartasService(db, catalogo, cotacao, chaves, NullLogger<PrecoCartasService>.Instance), chaves);
    }

    private static Product Carta(string nome, int tcgId, int precoCentavos = 1000, bool automatico = false, string? variante = null,
        int grupo = 23237) => new()
    {
        Name = nome, Category = "Cartas avulsas", PriceInCents = precoCentavos, StockQuantity = 1, MinimumStock = 0,
        CartaAvulsa = true, CartaJogo = "Pokémon", CartaTcgProdutoId = tcgId, CartaTcgCategoria = 3, CartaTcgGrupo = grupo,
        CartaTcgVariante = variante, CartaPrecoAutomatico = automatico,
    };

    private static PrecoCatalogo Preco(string variante, decimal? mercado, decimal? baixo = null) => new(variante, mercado, baixo, null, null);

    // ── Regra ────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(4433, 100, 50, 100, 4450)]   // R$ 44,33 → arredonda pra cima em R$ 0,50
    [InlineData(4433, 90, 50, 100, 4000)]    // 90% = R$ 39,897 → R$ 40,00
    [InlineData(4400, 100, 50, 100, 4400)]   // já no múltiplo: fica
    [InlineData(30, 100, 50, 100, 100)]      // R$ 0,30 lá fora → mínimo de R$ 1,00
    [InlineData(1234, 100, 1, 0, 1234)]      // sem arredondar
    public void Sugestao_SegueARegraDaLoja(int referencia, decimal fator, int arredondar, int minimo, int esperado)
    {
        var regra = new CartaRegraPreco { FatorPercent = fator, ArredondarCentavos = arredondar, MinimoCentavos = minimo };
        PrecoCartasService.Sugestao(referencia, regra).Should().Be(esperado);
    }

    [Fact]
    public void Referencia_DolarVezesCotacaoEmCentavos()
    {
        PrecoCartasService.ReferenciaCentavos(8.21m, 5.40m).Should().Be(4433);
    }

    [Fact]
    public void PrecoDaVariante_EscolhidaOuPrimeiraComPreco()
    {
        var precos = new[] { Preco("Normal", null, null), Preco("Holofoil", 8.21m), Preco("Reverse Holofoil", 2m) };
        PrecoCartasService.PrecoDaVariante(precos, "Reverse Holofoil")!.Variante.Should().Be("Reverse Holofoil");
        PrecoCartasService.PrecoDaVariante(precos, null)!.Variante.Should().Be("Holofoil");
        // Variante escolhida sem preço hoje: não troca por outra (seria preço de outra carta)
        PrecoCartasService.PrecoDaVariante(precos, "Normal").Should().BeNull();
        // Sem mercado, vale o mais baixo
        PrecoCartasService.PrecoDaVariante([Preco("Normal", null, 1.5m)], null)!.Referencia.Should().Be(1.5m);
    }

    [Fact]
    public async Task Regra_PadraoESalvar_ValidaOsLimites()
    {
        var db = CreateDb();
        var (servico, _) = Servico(db, new CatalogoFalso(), new CotacaoFixa(5m));

        (await servico.RegraAsync()).FatorPercent.Should().Be(100m);
        (await servico.SalvarRegraAsync(90m, 100, 200)).FatorPercent.Should().Be(90m);
        (await servico.RegraAsync()).MinimoCentavos.Should().Be(200);

        var errada = () => servico.SalvarRegraAsync(5m, 50, 100);
        await errada.Should().ThrowAsync<ArgumentException>();
    }

    // ── Rodada ───────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Rodada_GravaReferenciaEHistorico_ESoAjustaAsMarcadas()
    {
        var db = CreateDb();
        var so = Carta("Charizard ex", 502558, precoCentavos: 5000);
        var auto = Carta("Mew ex", 502700, precoCentavos: 1000, automatico: true, variante: "Holofoil");
        var manual = new Product { Name = "Sem catálogo", Category = "Cartas avulsas", PriceInCents = 700, StockQuantity = 1, CartaAvulsa = true };
        db.Products.AddRange(so, auto, manual);
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new()
        {
            [502558] = [Preco("Holofoil", 8.21m)],
            [502700] = [Preco("Normal", 1m), Preco("Holofoil", 4m)],
        };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5.40m));

        var r = await servico.AtualizarAsync();

        r.Rodou.Should().BeTrue();
        r.Atualizadas.Should().Be(2);
        r.PrecosTrocados.Should().Be(1);
        catalogo.Leituras.Should().Be(1, "uma leitura por coleção, não por carta");
        db.ChangeTracker.Clear();
        var s = await db.Products.FindAsync(so.Id);
        s!.CartaRefCentavos.Should().Be(4433);
        s.PriceInCents.Should().Be(5000, "só sugere — o Maikon decide");
        var a = await db.Products.FindAsync(auto.Id);
        a!.CartaRefCentavos.Should().Be(2160, "Holofoil: US$ 4 × 5,40");
        a.PriceInCents.Should().Be(2200, "ajusta pela regra padrão: 100%, pra cima em R$ 0,50");
        (await db.Products.FindAsync(manual.Id))!.CartaRefCentavos.Should().BeNull();
        (await db.CartaPrecoHistorico.CountAsync()).Should().Be(2);
        (await db.MarcosOperacao.AnyAsync(m => m.Chave == PrecoCartasService.MarcoRodada)).Should().BeTrue();
    }

    [Fact]
    public async Task Rodada_DuasVezesNoDia_UmaLinhaDeHistoricoPorCarta()
    {
        var db = CreateDb();
        var carta = Carta("Charizard ex", 502558);
        db.Products.Add(carta);
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [502558] = [Preco("Holofoil", 8m)] };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5m));

        await servico.AtualizarAsync();
        catalogo.Precos[(3, 23237)] = new() { [502558] = [Preco("Holofoil", 9m)] };
        await servico.AtualizarAsync();

        var linhas = await db.CartaPrecoHistorico.AsNoTracking().ToListAsync();
        linhas.Should().ContainSingle().Which.ReferenciaCentavos.Should().Be(4500);
    }

    [Fact]
    public async Task Rodada_CotacaoDegradada_NaoMexeEmNada()
    {
        var db = CreateDb();
        var carta = Carta("Mew ex", 502700, precoCentavos: 1000, automatico: true);
        db.Products.Add(carta);
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [502700] = [Preco("Holofoil", 40m)] };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5m, degradada: true));

        var r = await servico.AtualizarAsync();

        r.Rodou.Should().BeFalse();
        r.Cotacao.Should().Be(5m);
        catalogo.Leituras.Should().Be(0);
        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(carta.Id))!.PriceInCents.Should().Be(1000);
        (await db.CartaPrecoHistorico.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Rodada_ChaveDesligada_NaoRoda()
    {
        var db = CreateDb();
        db.Products.Add(Carta("Mew ex", 502700, automatico: true));
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        var (servico, chaves) = Servico(db, catalogo, new CotacaoFixa(5m));
        await chaves.DefinirAsync(Funcionalidades.PrecoReferenciaCartas, false, Guid.NewGuid());

        var r = await servico.AtualizarAsync();

        r.Rodou.Should().BeFalse();
        r.Cotacao.Should().BeNull("chave desligada não é falha do robô");
        catalogo.Leituras.Should().Be(0);
    }

    [Fact]
    public async Task Rodada_ColecaoForaDoAr_SegueAsOutras()
    {
        var db = CreateDb();
        db.Products.AddRange(Carta("Charizard ex", 502558), Carta("Luffy", 9001, grupo: 777));
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [502558] = [Preco("Holofoil", 8m)] };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5m));

        var r = await servico.AtualizarAsync();

        r.Atualizadas.Should().Be(1);
        r.ColecoesComErro.Should().Be(1);
        // Coleção fora do ar: o dia não fica marcado como feito — o robô tenta de novo na próxima hora
        (await db.MarcosOperacao.AnyAsync(m => m.Chave == PrecoCartasService.MarcoRodada)).Should().BeFalse();
    }

    [Fact]
    public async Task Rodada_OutraRodadaGravouOHistoricoJunto_ViraAtualizacao()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        AppDbContext NovoDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        var db = NovoDb();
        db.Database.EnsureCreated();
        var carta = Carta("Mew ex", 502700, precoCentavos: 1000, automatico: true);
        db.Products.Add(carta);
        await db.SaveChangesAsync();
        var hoje = DateTime.SpecifyKind(Brasilia.Hoje(), DateTimeKind.Utc);
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [502700] = [Preco("Holofoil", 4m)] };
        // Depois que esta rodada leu o histórico (vazio), "outra" grava a linha de hoje da mesma carta
        catalogo.AoLer = async () =>
        {
            await using var outro = NovoDb();
            outro.CartaPrecoHistorico.Add(new CartaPrecoHistorico { ProductId = carta.Id, Dia = hoje, MercadoUsd = 3, Cotacao = 5, ReferenciaCentavos = 1500 });
            await outro.SaveChangesAsync();
        };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5.40m));

        var r = await servico.AtualizarAsync();

        r.Rodou.Should().BeTrue();
        await using var conferir = NovoDb();
        conferir.CartaPrecoHistorico.Should().ContainSingle().Which.ReferenciaCentavos.Should().Be(2160);
        (await conferir.Products.FindAsync(carta.Id))!.PriceInCents.Should().Be(2200, "o resto da rodada também foi salvo");
    }

    [Fact]
    public async Task Variacoes_ReferenciaDe7E30DiasAtras()
    {
        var db = CreateDb();
        var carta = Carta("Charizard ex", 502558);
        carta.CartaRefCentavos = 5000;
        db.Products.Add(carta);
        var hoje = DateTime.SpecifyKind(Brasilia.Hoje(), DateTimeKind.Utc);
        db.CartaPrecoHistorico.AddRange(
            new CartaPrecoHistorico { ProductId = carta.Id, Dia = hoje, MercadoUsd = 10, Cotacao = 5, ReferenciaCentavos = 5000 },
            new CartaPrecoHistorico { ProductId = carta.Id, Dia = hoje.AddDays(-8), MercadoUsd = 8, Cotacao = 5, ReferenciaCentavos = 4000 },
            new CartaPrecoHistorico { ProductId = carta.Id, Dia = hoje.AddDays(-31), MercadoUsd = 6, Cotacao = 5, ReferenciaCentavos = 3000 });
        await db.SaveChangesAsync();
        var (servico, _) = Servico(db, new CatalogoFalso(), new CotacaoFixa(5m));

        var v = (await servico.VariacoesAsync()).Should().ContainSingle().Subject;

        v.ReferenciaCentavos.Should().Be(5000);
        v.Ha7Dias.Should().Be(4000);
        v.Ha30Dias.Should().Be(3000);
    }

    [Fact]
    public async Task Variacoes_SoPrecoAntigoDemais_NaoViraVariacaoDe7Dias()
    {
        var db = CreateDb();
        var carta = Carta("Charizard ex", 502558);
        carta.CartaRefCentavos = 5000;
        db.Products.Add(carta);
        var hoje = DateTime.SpecifyKind(Brasilia.Hoje(), DateTimeKind.Utc);
        db.CartaPrecoHistorico.Add(
            new CartaPrecoHistorico { ProductId = carta.Id, Dia = hoje.AddDays(-31), MercadoUsd = 6, Cotacao = 5, ReferenciaCentavos = 3000 });
        await db.SaveChangesAsync();
        var (servico, _) = Servico(db, new CatalogoFalso(), new CotacaoFixa(5m));

        var v = (await servico.VariacoesAsync()).Should().ContainSingle().Subject;

        v.Ha7Dias.Should().BeNull("o único preço é de 31 dias — não é a variação da semana");
        v.Ha30Dias.Should().Be(3000);
    }

    // ── Robô ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void Robo_RodaUmaVezDepoisDaPublicacaoDoDia()
    {
        var dia = new DateTime(2026, 11, 19, 0, 0, 0, DateTimeKind.Utc);
        PrecoCartasBackgroundService.Devido(dia.AddHours(21), null).Should().BeTrue("nunca rodou");
        PrecoCartasBackgroundService.Devido(dia.AddHours(21), dia.AddHours(20.6)).Should().BeFalse("já rodou depois das 20h30");
        PrecoCartasBackgroundService.Devido(dia.AddHours(21), dia.AddHours(-2)).Should().BeTrue("última foi ontem");
        PrecoCartasBackgroundService.Devido(dia.AddHours(10), dia.AddDays(-1).AddHours(21)).Should().BeFalse("hoje ainda não publicou");
        PrecoCartasBackgroundService.Devido(dia.AddHours(10), dia.AddDays(-1).AddHours(19)).Should().BeTrue("perdeu a de ontem");
    }

    // ── Catálogo (tcgcsv) ────────────────────────────────────────────────────────

    private sealed class RespostasFixas(Dictionary<string, string> respostas) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
        {
            var caminho = req.RequestUri!.AbsolutePath.TrimStart('/');
            return Task.FromResult(respostas.TryGetValue(caminho, out var corpo)
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") }
                : new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }

    private sealed class Fabrica(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("https://tcgcsv.com/") };
    }

    [Fact]
    public async Task Catalogo_LeCartasComPreco_PulaSelado_TraduzRaridade()
    {
        var respostas = new Dictionary<string, string>
        {
            ["tcgplayer/3/23237/products"] = """
                {"success":true,"results":[
                  {"productId":502558,"name":"Charizard ex - 006/165","imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/502558_200w.jpg",
                   "extendedData":[{"name":"Number","value":"006/165"},{"name":"Rarity","value":"Double Rare"}]},
                  {"productId":1,"name":"Booster Box","imageUrl":null,"extendedData":[]},
                  {"productId":2,"name":"Code Card - Booster Box","imageUrl":null,"extendedData":[]}
                ]}
                """,
            ["tcgplayer/3/23237/prices"] = """
                {"success":true,"results":[
                  {"productId":502558,"lowPrice":5.5,"midPrice":8.92,"highPrice":154.41,"marketPrice":8.21,"subTypeName":"Holofoil"},
                  {"productId":502559,"marketPrice":0.39,"subTypeName":"Reverse Holofoil"},
                  {"productId":502559,"marketPrice":0.25,"subTypeName":"Normal"}
                ]}
                """,
            ["tcgplayer/3/groups"] = """
                {"success":true,"results":[
                  {"groupId":23237,"name":"SV: Scarlet & Violet 151","abbreviation":"MEW","publishedOn":"2023-09-22T00:00:00"},
                  {"groupId":24955,"name":"ME07: Flowing Fists","abbreviation":"FLO","publishedOn":"2027-02-06T00:00:00"}
                ]}
                """,
            ["tcgplayer/85/groups"] = """{"success":true,"results":[]}""",
        };
        var catalogo = new CatalogoCartasService(new Fabrica(new RespostasFixas(respostas)), new MemoryCache(new MemoryCacheOptions()),
            NullLogger<CatalogoCartasService>.Instance);

        var cartas = await catalogo.CartasAsync(3, 23237);
        var c = cartas.Should().ContainSingle().Subject;
        c.Nome.Should().Be("Charizard ex");
        c.Numero.Should().Be("006/165");
        c.Raridade.Should().Be("Rara Dupla");
        c.Imagem.Should().EndWith("502558_400w.jpg");
        c.Precos.Should().ContainSingle().Which.Referencia.Should().Be(8.21m);

        var colecoes = await catalogo.ColecoesAsync("Pokémon");
        colecoes.Select(x => x.Nome).Should().Equal("Flowing Fists", "Scarlet & Violet 151");
        colecoes[1].Sigla.Should().Be("MEW");
        (await catalogo.ColecoesAsync("Outro")).Should().BeEmpty();
        (await catalogo.CartasAsync(999, 1)).Should().BeEmpty("categoria fora da lista não sai pra rede");
        // O que não tem número é selado: vai pro Estoque (v1.94.0)
        (await catalogo.SeladosAsync(3, 23237)).Should().ContainSingle().Which.Nome.Should().Be("Booster Box");

        // Sem acabamento escolhido vale o Normal, não o Reverse Holo (o tcgcsv manda em qualquer ordem)
        var precos = await catalogo.PrecosAsync(3, 23237);
        precos[502559].Select(p => p.Variante).Should().Equal("Normal", "Reverse Holofoil");
        PrecoCartasService.PrecoDaVariante(precos[502559], null)!.Referencia.Should().Be(0.25m);
    }

    // ── Produtos do Estoque (v1.94.0, chave "preco-referencia-estoque") ───────────

    private static Product Selado(string nome, int tcgId, int precoCentavos = 20000, bool automatico = false) => new()
    {
        Name = nome, Category = "Pokémon", PriceInCents = precoCentavos, StockQuantity = 3, MinimumStock = 1,
        CartaTcgProdutoId = tcgId, CartaTcgCategoria = 3, CartaTcgGrupo = 23237, CartaPrecoAutomatico = automatico,
    };

    [Fact]
    public async Task Rodada_ProdutoDoEstoqueLigado_GanhaReferencia()
    {
        var db = CreateDb();
        var box = Selado("Booster Box 151", 502000);
        db.Products.Add(box);
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [502000] = [Preco("Normal", 150m)] };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5m));

        var r = await servico.AtualizarAsync();

        r.Atualizadas.Should().Be(1);
        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(box.Id))!.CartaRefCentavos.Should().Be(75000);
        (await servico.VariacoesAsync()).Should().ContainSingle(v => v.ProductId == box.Id);
    }

    [Fact]
    public async Task Rodada_ChaveDoEstoqueDesligada_SoAsCartas()
    {
        var db = CreateDb();
        var box = Selado("Booster Box 151", 502000, automatico: true);
        var carta = Carta("Charizard ex", 502558);
        db.Products.AddRange(box, carta);
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [502000] = [Preco("Normal", 150m)], [502558] = [Preco("Holofoil", 8m)] };
        var (servico, chaves) = Servico(db, catalogo, new CotacaoFixa(5m));
        await chaves.DefinirAsync(Funcionalidades.PrecoReferenciaEstoque, false, Guid.NewGuid());

        var r = await servico.AtualizarAsync();

        r.Atualizadas.Should().Be(1);
        db.ChangeTracker.Clear();
        var b = await db.Products.FindAsync(box.Id);
        b!.CartaRefCentavos.Should().BeNull();
        b.PriceInCents.Should().Be(20000, "com a chave desligada o robô não mexe no Estoque");
        (await db.Products.FindAsync(carta.Id))!.CartaRefCentavos.Should().Be(4000);
    }

    [Fact]
    public async Task Ligar_GravaALigacaoELeAReferencia_EDesligarLimpa()
    {
        var db = CreateDb();
        var box = new Product { Name = "Elite Trainer Box", Category = "Pokémon", PriceInCents = 40000, StockQuantity = 2, MinimumStock = 1 };
        db.Products.Add(box);
        await db.SaveChangesAsync();
        var catalogo = new CatalogoFalso();
        catalogo.Precos[(3, 23237)] = new() { [503000] = [Preco("Normal", 60m)] };
        var (servico, _) = Servico(db, catalogo, new CotacaoFixa(5m));

        var ligado = await servico.LigarAsync(box.Id, 503000, 3, 23237, null, automatico: false);

        ligado!.CartaTcgProdutoId.Should().Be(503000);
        ligado.CartaRefCentavos.Should().Be(30000, "já lê a referência de hoje ao ligar");
        ligado.PriceInCents.Should().Be(40000, "ligar só sugere");

        var desligado = await servico.LigarAsync(box.Id, null, null, null, null, automatico: true);

        desligado!.CartaTcgProdutoId.Should().BeNull();
        desligado.CartaTcgGrupo.Should().BeNull();
        desligado.CartaRefCentavos.Should().BeNull();
        desligado.CartaPrecoAutomatico.Should().BeFalse();

        var semColecao = () => servico.LigarAsync(box.Id, 503000, null, null, null, false);
        await semColecao.Should().ThrowAsync<ArgumentException>();
        (await servico.LigarAsync(Guid.NewGuid(), null, null, null, null, false)).Should().BeNull();
    }

    [Fact]
    public async Task SalvarProdutoDoEstoque_SemOsCamposDoCatalogo_NaoApagaALigacao()
    {
        // O formulário do Estoque pode vir da busca por código de barras (dados públicos, sem a ligação)
        var db = CreateDb();
        var box = Selado("Booster Box 151", 502000, automatico: true);
        box.CartaRefCentavos = 75000;
        db.Products.Add(box);
        await db.SaveChangesAsync();
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        var produtos = new ProductService(db, new Mock<CardGameStore.Services.Interfaces.IPushService>().Object,
            new Mock<CardGameStore.Services.Interfaces.IEmailService>().Object, new Mock<ILogger<ProductService>>().Object, chaves);

        await produtos.UpdateAsync(new Product
        {
            Id = box.Id, Name = "Booster Box 151 (36 boosters)", Category = "Pokémon", PriceInCents = 21000, StockQuantity = 3, MinimumStock = 1,
        });

        db.ChangeTracker.Clear();
        var salvo = await db.Products.FindAsync(box.Id);
        salvo!.Name.Should().Be("Booster Box 151 (36 boosters)");
        salvo.CartaTcgProdutoId.Should().Be(502000);
        salvo.CartaRefCentavos.Should().Be(75000);
        salvo.CartaPrecoAutomatico.Should().BeTrue();
    }
}
