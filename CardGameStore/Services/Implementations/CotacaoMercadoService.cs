// =============================================================================
// CotacaoMercadoService.cs — dólar de mercado pro preço das cartas (v1.95.0, chave "dolar-tempo-real-cartas")
//
// Pedido do Taino (23/11): "o preço das cartas deve estar em real... pareado em tempo real". A PTAX do Banco
// Central (CurrencyService) é oficial, mas sai só em dia útil — numa segunda de manhã ela ainda é a de sexta
// (R$ 5,8889 contra R$ 5,977 no mercado, 1,5% de diferença). Pro preço de referência das cartas e dos lacrados
// vale o dólar comercial de agora: AwesomeAPI (/json/last/USD-BRL, atualiza a cada poucos segundos).
//
// Ordem: mercado (AwesomeAPI) → PTAX oficial (CurrencyService, que já tem a reserva dela e nunca inventa número).
// Cache de 10 min no sucesso e espera de 10 min depois de falha: em 30/07/2026 a AwesomeAPI bloqueou o IP da
// VPS (HTTP 429) porque o código antigo batia nela a cada requisição. Assim são no máximo 6 leituras por hora.
//
// Só o preço de referência usa isto. O catálogo "Cartas TCG" antigo continua no CurrencyService (PTAX primeiro).
// =============================================================================

using System.Globalization;
using System.Text.Json;
using CardGameStore.Configuration;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Services.Implementations;

/// <summary>Cotação oficial (PTAX) — o CurrencyService implementa; reserva do dólar de mercado.</summary>
public interface ICotacaoOficial
{
    Task<CotacaoUsdBrl> GetCotacaoAsync();
}

public class CotacaoMercadoService : IFonteCotacao
{
    public const string ClienteHttp = "AwesomeApi";
    internal const string CacheOk    = "usd_brl_mercado";
    internal const string CacheFalha = "usd_brl_mercado_falha";
    private static readonly TimeSpan Validade = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan EsperaAposFalha = TimeSpan.FromMinutes(10);

    private readonly IHttpClientFactory _http;
    private readonly IMemoryCache _cache;
    private readonly ICotacaoOficial _oficial;
    private readonly FuncionalidadesService _funcionalidades;
    private readonly ILogger<CotacaoMercadoService> _logger;

    public CotacaoMercadoService(IHttpClientFactory http, IMemoryCache cache, ICotacaoOficial oficial,
        FuncionalidadesService funcionalidades, ILogger<CotacaoMercadoService> logger)
    {
        _http = http; _cache = cache; _oficial = oficial; _funcionalidades = funcionalidades; _logger = logger;
    }

    public async Task<CotacaoUsdBrl> GetCotacaoAsync()
    {
        // Chave desligada: o jeito da v1.92 (PTAX oficial)
        if (!await _funcionalidades.LigadaAsync(Funcionalidades.DolarTempoRealCartas))
            return await _oficial.GetCotacaoAsync();

        if (_cache.TryGetValue(CacheOk, out CotacaoUsdBrl? emCache) && emCache is not null) return emCache;
        if (!_cache.TryGetValue(CacheFalha, out bool _))
        {
            var mercado = await LerMercadoAsync();
            if (mercado is not null)
            {
                _cache.Set(CacheOk, mercado, Validade);
                return mercado;
            }
            _cache.Set(CacheFalha, true, EsperaAposFalha);
        }

        // Mercado fora do ar: a PTAX oficial (que também diz se está degradada)
        var oficial = await _oficial.GetCotacaoAsync();
        return oficial.Degradada ? oficial : oficial with
        {
            Aviso = "Dólar de mercado indisponível agora — usando a PTAX oficial do Banco Central (último dia útil).",
        };
    }

    private async Task<CotacaoUsdBrl?> LerMercadoAsync()
    {
        try
        {
            var cliente = _http.CreateClient(ClienteHttp);
            using var resp = await cliente.GetAsync("/json/last/USD-BRL");
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Dólar de mercado (AwesomeAPI) respondeu {Status}", (int)resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            if (!doc.RootElement.TryGetProperty("USDBRL", out var usd)) return null;
            if (!usd.TryGetProperty("bid", out var bid)
                || !decimal.TryParse(bid.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var valor)) return null;
            // Fora de qualquer faixa plausível = resposta quebrada, não cotação
            if (valor is < 1m or > 50m)
            {
                _logger.LogWarning("Dólar de mercado fora da faixa: {Valor}", valor);
                return null;
            }
            var quando = usd.TryGetProperty("timestamp", out var ts) && long.TryParse(ts.GetString(), out var seg)
                ? DateTimeOffset.FromUnixTimeSeconds(seg).UtcDateTime : DateTime.UtcNow;
            return new CotacaoUsdBrl(valor, quando, "Mercado (AwesomeAPI)", false, null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogWarning(ex, "Dólar de mercado (AwesomeAPI) não respondeu");
            return null;
        }
    }
}
