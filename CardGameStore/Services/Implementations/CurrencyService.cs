// =============================================================================
// CurrencyService.cs — Cotação USD/BRL em tempo real (AwesomeAPI)
// Cache em memória com TTL de 1 hora para evitar calls excessivos.
// API: https://economia.awesomeapi.com.br/json/last/USD-BRL (gratuita, sem key)
//
// Regra desta classe: NUNCA devolver um número inventado como se fosse cotação
// real sem dizer que é. Preço de carta é convertido direto por esse valor —
// errar aqui é errar o preço de venda de todo o catálogo TCG.
// =============================================================================

using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;

namespace CardGameStore.Services.Implementations;

/// <summary>
/// Cotação com procedência: além do valor, diz QUANDO foi obtida de verdade e se
/// está degradada (última boa conhecida ou piso de emergência). Sem isso a tela
/// mostra um número com cara de atual que pode ser de dias atrás — foi exatamente
/// assim que a cotação ficou presa em 5,80 sem ninguém perceber.
/// </summary>
public record CotacaoUsdBrl(decimal Valor, DateTime? ObtidaEm, bool Degradada, string? Aviso);

public class CurrencyService
{
    private readonly IHttpClientFactory       _factory;
    private readonly IMemoryCache             _cache;
    private readonly ILogger<CurrencyService> _logger;

    private const string CacheKey = "usd_brl_rate";

    /// <summary>
    /// Piso de emergência — só entra em cena se a API nunca respondeu desde que o
    /// processo subiu. Deliberadamente NÃO é usado como "estimativa conservadora":
    /// qualquer valor fixo aqui envelhece e vira preço errado silencioso.
    /// </summary>
    private const decimal UltimoRecurso = 5.00m;

    /// <summary>Última cotação REAL obtida da API neste processo. Sobrevive ao TTL do
    /// cache de propósito: uma queda temporária da API deve cair pra cotação de ontem,
    /// não pra uma constante escrita no código. Volatile porque o serviço é Singleton.</summary>
    private volatile Cotacao? _ultimaBoa;

    private sealed record Cotacao(decimal Valor, DateTime ObtidaEm);

    public CurrencyService(IHttpClientFactory factory, IMemoryCache cache, ILogger<CurrencyService> logger)
    {
        _factory = factory;
        _cache   = cache;
        _logger  = logger;
    }

    /// <summary>Compatibilidade: só o valor. Prefira <see cref="GetCotacaoAsync"/>,
    /// que diz se o número é confiável.</summary>
    public async Task<decimal> GetUsdToBrlAsync() => (await GetCotacaoAsync()).Valor;

    /// <summary>Cotação USD → BRL, com cache de 1 hora e procedência explícita.</summary>
    public async Task<CotacaoUsdBrl> GetCotacaoAsync()
    {
        if (_cache.TryGetValue(CacheKey, out Cotacao? emCache) && emCache is not null)
            return new CotacaoUsdBrl(emCache.Valor, emCache.ObtidaEm, false, null);

        try
        {
            var client   = _factory.CreateClient("AwesomeApi");
            var response = await client.GetAsync("/json/last/USD-BRL");
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var doc  = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("USDBRL", out var usdBrl) &&
                usdBrl.TryGetProperty("bid", out var bid) &&
                decimal.TryParse(bid.GetString(), System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture, out var rate) &&
                rate > 0)
            {
                var nova = new Cotacao(rate, DateTime.UtcNow);
                _cache.Set(CacheKey, nova, TimeSpan.FromHours(1));
                _ultimaBoa = nova;
                _logger.LogInformation("Cotação USD/BRL atualizada: {Rate}", rate);
                return new CotacaoUsdBrl(rate, nova.ObtidaEm, false, null);
            }

            _logger.LogError("Resposta da AwesomeAPI sem USDBRL.bid utilizável: {Json}",
                json.Length > 500 ? json[..500] : json);
        }
        catch (Exception ex)
        {
            // Error, não Warning: enquanto isso durar, todo preço de carta convertido
            // sai errado na tela. Não é ruído — é algo pra alguém ir olhar.
            _logger.LogError(ex, "Falha ao buscar cotação USD/BRL na AwesomeAPI");
        }

        // Degradado 1: última cotação real que este processo conseguiu.
        var boa = _ultimaBoa;
        if (boa is not null)
        {
            var horas = (int)(DateTime.UtcNow - boa.ObtidaEm).TotalHours;
            _logger.LogWarning("Usando última cotação boa ({Rate}), obtida há {Horas}h", boa.Valor, horas);
            return new CotacaoUsdBrl(boa.Valor, boa.ObtidaEm, true,
                $"Cotação desatualizada — última leitura real há {horas}h. Confira antes de precificar.");
        }

        // Degradado 2: a API nunca respondeu desde que o processo subiu.
        _logger.LogError("Cotação USD/BRL indisponível desde o start — devolvendo piso {Piso}", UltimoRecurso);
        return new CotacaoUsdBrl(UltimoRecurso, null, true,
            "Não foi possível obter a cotação do dólar. O valor exibido NÃO é a cotação real — " +
            "não use para precificar até normalizar.");
    }
}
