// =============================================================================
// CatalogoCartasService.cs — catálogo e preço de mercado das cartas (v1.92.0, chave "preco-referencia-cartas")
//
// Fonte: tcgcsv.com — espelho público e gratuito do catálogo e dos preços do TCGplayer, sem chave,
// atualizado todo dia ~20h UTC, com todos os jogos (Pokémon, Magic, Yu-Gi-Oh!, One Piece, Digimon,
// Dragon Ball, Riftbound...). O formato é o mesmo pra todos: categoria → coleções (groups) →
// cartas (products) e preços (prices) por coleção. Por isso o cadastro escolhe jogo → coleção → carta
// e o robô lê os preços uma vez por coleção.
//
// Limites (ditos na tela): preço dos EUA em dólar, de carta em inglês, sem diferença por estado
// (NM/LP...). O Brasil (Liga) não tem API — o "Ver na Liga" continua sendo a conferência.
// =============================================================================

using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Services.Implementations;

public sealed record ColecaoCatalogo(int Categoria, int Grupo, string Nome, string NomeCompleto, string? Sigla,
    DateTime? Lancamento, bool Japonesa);

public sealed record PrecoCatalogo(string Variante, decimal? MercadoUsd, decimal? BaixoUsd, decimal? MedioUsd, decimal? AltoUsd)
{
    /// <summary>O preço que vira referência: mercado (média das vendas), senão o médio, senão o mais baixo.</summary>
    public decimal? Referencia => MercadoUsd ?? MedioUsd ?? BaixoUsd;
}

public sealed record CartaCatalogo(int ProdutoId, int Categoria, int Grupo, string Nome, string? Numero, string? Raridade,
    string? Imagem, string? ImagemGrande, IReadOnlyList<PrecoCatalogo> Precos);

/// <summary>Leitura do catálogo de cartas (interface pra os testes trocarem a rede por dados prontos).</summary>
public interface ICatalogoCartas
{
    Task<IReadOnlyList<ColecaoCatalogo>> ColecoesAsync(string jogo, CancellationToken ct = default);
    Task<IReadOnlyList<CartaCatalogo>> CartasAsync(int categoria, int grupo, CancellationToken ct = default);
    /// <summary>Preços da coleção, por produto (sem cache: o robô quer o do dia).</summary>
    Task<IReadOnlyDictionary<int, IReadOnlyList<PrecoCatalogo>>> PrecosAsync(int categoria, int grupo, CancellationToken ct = default);
}

public class CatalogoCartasService : ICatalogoCartas
{
    public const string ClienteHttp = "Tcgcsv";

    /// <summary>
    /// Jogo do Mercado (lib/cartasAvulsas.ts → JOGOS_DE_CARTA) → categorias do TCGplayer. A segunda de Pokémon é a
    /// japonesa; Dragon Ball tem o Fusion World e o Super antigo.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, int[]> CategoriasDoJogo = new Dictionary<string, int[]>
    {
        ["Pokémon"]     = [3, 85],
        ["Magic"]       = [1],
        ["Yu-Gi-Oh!"]   = [2],
        ["One Piece"]   = [68],
        ["Dragon Ball"] = [80, 27],
        ["Digimon"]     = [63],
        ["Riftbound"]   = [89],
    };

    private static readonly HashSet<int> CategoriasConhecidas = CategoriasDoJogo.Values.SelectMany(c => c).ToHashSet();
    private static readonly HashSet<int> CategoriasJaponesas = [85];

    private readonly IHttpClientFactory _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<CatalogoCartasService> _logger;

    public CatalogoCartasService(IHttpClientFactory http, IMemoryCache cache, ILogger<CatalogoCartasService> logger)
    {
        _http = http; _cache = cache; _logger = logger;
    }

    public static bool CategoriaConhecida(int categoria) => CategoriasConhecidas.Contains(categoria);

    public async Task<IReadOnlyList<ColecaoCatalogo>> ColecoesAsync(string jogo, CancellationToken ct = default)
    {
        if (!CategoriasDoJogo.TryGetValue(jogo, out var categorias)) return [];
        var todas = new List<ColecaoCatalogo>();
        foreach (var categoria in categorias)
        {
            var lista = await _cache.GetOrCreateAsync($"tcgcsv:grupos:{categoria}", async e =>
            {
                e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);
                using var doc = await LerAsync($"tcgplayer/{categoria}/groups", ct);
                return doc.RootElement.GetProperty("results").EnumerateArray().Select(g =>
                {
                    var nome = g.GetProperty("name").GetString() ?? "";
                    return new ColecaoCatalogo(categoria, g.GetProperty("groupId").GetInt32(), NomeDaColecao(nome), nome,
                        Texto(g, "abbreviation"), Data(g, "publishedOn"), CategoriasJaponesas.Contains(categoria));
                }).ToList();
            });
            todas.AddRange(lista ?? []);
        }
        // Mais nova primeiro: é o que chega na loja
        return todas.OrderByDescending(c => c.Lancamento ?? DateTime.MinValue).ThenBy(c => c.Nome).ToList();
    }

    public async Task<IReadOnlyList<CartaCatalogo>> CartasAsync(int categoria, int grupo, CancellationToken ct = default)
    {
        if (!CategoriaConhecida(categoria) || grupo <= 0) return [];
        var cartas = await _cache.GetOrCreateAsync($"tcgcsv:cartas:{categoria}:{grupo}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6);
            var precos = await PrecosAsync(categoria, grupo, ct);
            using var doc = await LerAsync($"tcgplayer/{categoria}/{grupo}/products", ct);
            var lista = new List<CartaCatalogo>();
            foreach (var p in doc.RootElement.GetProperty("results").EnumerateArray())
            {
                var extra = Extra(p);
                // Sem número = produto selado (booster, caixa) — não é carta avulsa
                if (!extra.TryGetValue("Number", out var numero) || string.IsNullOrWhiteSpace(numero)) continue;
                var id = p.GetProperty("productId").GetInt32();
                var img = Texto(p, "imageUrl");
                lista.Add(new CartaCatalogo(id, categoria, grupo, NomeDaCarta(Texto(p, "name") ?? "", numero), numero,
                    TraduzirRaridade(extra.GetValueOrDefault("Rarity")),
                    img?.Replace("_200w.jpg", "_400w.jpg"), img?.Replace("_200w.jpg", "_in_1000x1000.jpg"),
                    precos.GetValueOrDefault(id) ?? []));
            }
            return lista;
        });
        return cartas ?? [];
    }

    public async Task<IReadOnlyDictionary<int, IReadOnlyList<PrecoCatalogo>>> PrecosAsync(int categoria, int grupo, CancellationToken ct = default)
    {
        if (!CategoriaConhecida(categoria) || grupo <= 0) return new Dictionary<int, IReadOnlyList<PrecoCatalogo>>();
        using var doc = await LerAsync($"tcgplayer/{categoria}/{grupo}/prices", ct);
        return doc.RootElement.GetProperty("results").EnumerateArray()
            .GroupBy(p => p.GetProperty("productId").GetInt32())
            .ToDictionary(g => g.Key, g => (IReadOnlyList<PrecoCatalogo>)g.Select(p => new PrecoCatalogo(
                Texto(p, "subTypeName") ?? "Normal", Numero(p, "marketPrice"), Numero(p, "lowPrice"),
                Numero(p, "midPrice"), Numero(p, "highPrice")))
                .OrderBy(p => OrdemDaVariante(p.Variante)).ThenBy(p => p.Variante).ToList());
    }

    /// <summary>
    /// Acabamento que vale quando ninguém escolheu: Normal, depois Holofoil, depois os outros (Reverse, 1ª edição...).
    /// O tcgcsv manda em qualquer ordem — e o Bulbasaur comum não pode sair pelo preço do Reverse Holo.
    /// </summary>
    public static int OrdemDaVariante(string variante) => variante switch
    {
        "Normal" => 0,
        "Holofoil" => 1,
        _ => 2,
    };

    private async Task<JsonDocument> LerAsync(string caminho, CancellationToken ct)
    {
        var cliente = _http.CreateClient(ClienteHttp);
        using var resp = await cliente.GetAsync(caminho, ct);
        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogWarning("tcgcsv respondeu {Status} em {Caminho}", (int)resp.StatusCode, caminho);
            throw new HttpRequestException($"Catálogo de cartas fora do ar ({(int)resp.StatusCode}).");
        }
        await using var corpo = await resp.Content.ReadAsStreamAsync(ct);
        return await JsonDocument.ParseAsync(corpo, cancellationToken: ct);
    }

    // ── Textos ─────────────────────────────────────────────────────────────────

    /// <summary>"SV: Scarlet &amp; Violet 151" → "Scarlet &amp; Violet 151"; "ME07: Flowing Fists" → "Flowing Fists".</summary>
    public static string NomeDaColecao(string nome) => Regex.Replace(nome, @"^[A-Za-z0-9\-]{1,8}:\s+", "").Trim();

    /// <summary>"Charizard ex - 006/165" → "Charizard ex" (o número fica no campo dele).</summary>
    public static string NomeDaCarta(string nome, string? numero)
    {
        var limpo = numero is null ? nome : nome.Replace($" - {numero}", "", StringComparison.Ordinal);
        return limpo.Trim();
    }

    /// <summary>Raridades do TCGplayer (inglês) → as do cadastro (lib/cartasAvulsas.ts → RARIDADES_DE_CARTA).</summary>
    private static readonly Dictionary<string, string> Raridades = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Common"] = "Comum", ["Uncommon"] = "Incomum", ["Rare"] = "Rara", ["Holo Rare"] = "Rara Holo",
        ["Rare Holo"] = "Rara Holo", ["Double Rare"] = "Rara Dupla", ["Ultra Rare"] = "Ultra Rara",
        ["Illustration Rare"] = "Rara Ilustração", ["Special Illustration Rare"] = "Rara Ilustração Especial",
        ["Hyper Rare"] = "Hiper Rara", ["Promo"] = "Promo", ["Secret Rare"] = "Secreta", ["Super Rare"] = "Super Rara",
        ["Mythic"] = "Mítica", ["Mythic Rare"] = "Mítica", ["Special"] = "Especial", ["Leader"] = "Líder",
        ["Starlight Rare"] = "Starlight", ["Ultimate Rare"] = "Ultimate", ["Epic"] = "Épica", ["Legendary"] = "Lendária",
    };

    public static string? TraduzirRaridade(string? raridade) =>
        string.IsNullOrWhiteSpace(raridade) ? null : Raridades.GetValueOrDefault(raridade.Trim(), raridade.Trim());

    private static Dictionary<string, string> Extra(JsonElement p)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (p.TryGetProperty("extendedData", out var ext) && ext.ValueKind == JsonValueKind.Array)
            foreach (var e in ext.EnumerateArray())
                if (Texto(e, "name") is { } n && Texto(e, "value") is { } v) d[n] = v;
        return d;
    }

    private static string? Texto(JsonElement e, string campo) =>
        e.TryGetProperty(campo, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static decimal? Numero(JsonElement e, string campo) =>
        e.TryGetProperty(campo, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;

    private static DateTime? Data(JsonElement e, string campo) =>
        Texto(e, campo) is { } t && DateTime.TryParse(t, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var d)
            ? d : null;
}
