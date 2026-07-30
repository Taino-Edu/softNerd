// =============================================================================
// CurrencyService.cs — Cotação USD/BRL
//
// Duas fontes, nesta ordem:
//   1. Banco Central (PTAX) — oficial, pública, sem chave, sem limite prático.
//   2. AwesomeAPI          — cotação de mercado em tempo real, como reserva.
//
// O BCB é o primário desde 30/07/2026. A AwesomeAPI era a única fonte e passou a
// devolver HTTP 429 pro IP do VPS: o código antigo batia nela a CADA requisição
// (não cacheava falha) e o IP acabou bloqueado. Daí também o cache negativo abaixo.
//
// Regra desta classe: NUNCA devolver um número inventado como se fosse cotação
// real sem dizer que é. Preço de carta é convertido direto por esse valor —
// errar aqui é errar o preço de venda de todo o catálogo TCG.
// =============================================================================

using Microsoft.Extensions.Caching.Memory;
using System.Globalization;
using System.Text.Json;

namespace CardGameStore.Services.Implementations;

/// <summary>
/// Cotação com procedência: além do valor, diz QUANDO foi obtida de verdade, de qual
/// fonte, e se está degradada. Sem isso a tela mostra um número com cara de atual que
/// pode ser de dias atrás — foi assim que a cotação ficou presa em 5,80 sem ninguém ver.
/// </summary>
public record CotacaoUsdBrl(decimal Valor, DateTime? ObtidaEm, string? Fonte, bool Degradada, string? Aviso);

public class CurrencyService
{
    private readonly IHttpClientFactory       _factory;
    private readonly IMemoryCache             _cache;
    private readonly ILogger<CurrencyService> _logger;

    private const string CacheKey      = "usd_brl_rate";
    private const string CacheKeyFalha = "usd_brl_rate_falha";

    /// <summary>
    /// Piso de emergência — só entra se nenhuma fonte respondeu desde que o processo
    /// subiu. Deliberadamente NÃO é uma "estimativa conservadora": qualquer valor fixo
    /// aqui envelhece e vira preço errado silencioso. Ele existe só pra não quebrar a
    /// tela, e vem sempre acompanhado de Degradada=true.
    /// </summary>
    private const decimal UltimoRecurso = 5.00m;

    /// <summary>Depois de falhar em todas as fontes, espera isto antes de tentar de novo.
    /// Sem esse freio, cada carregamento da tela virava uma requisição nova — foi o que
    /// queimou o IP na AwesomeAPI. Bater mais em quem já respondeu 429 só prolonga o bloqueio.</summary>
    private static readonly TimeSpan EsperaAposFalha = TimeSpan.FromMinutes(10);

    /// <summary>Última cotação REAL obtida neste processo. Sobrevive ao TTL do cache de
    /// propósito: queda temporária das fontes deve cair pra cotação de ontem, não pra uma
    /// constante escrita no código. Volatile porque o serviço é Singleton.</summary>
    private volatile Cotacao? _ultimaBoa;

    private sealed record Cotacao(decimal Valor, DateTime ObtidaEm, string Fonte);

    /// <summary>Fuso de Brasília — funciona em Linux (IANA) e Windows (ID legado).</summary>
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

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
            return Ok(emCache);

        // Falhou faz pouco tempo: não bate nas fontes de novo, vai direto pro degradado.
        if (_cache.TryGetValue(CacheKeyFalha, out bool _))
            return Degradado("em nova tentativa daqui a pouco");

        var nova = await TentarBcbAsync() ?? await TentarAwesomeApiAsync();

        if (nova is not null)
        {
            _cache.Set(CacheKey, nova, TimeSpan.FromHours(1));
            _cache.Remove(CacheKeyFalha);
            _ultimaBoa = nova;
            _logger.LogInformation("Cotação USD/BRL atualizada: {Rate} (fonte: {Fonte})", nova.Valor, nova.Fonte);
            return Ok(nova);
        }

        _cache.Set(CacheKeyFalha, true, EsperaAposFalha);
        _logger.LogError("Nenhuma fonte de cotação USD/BRL respondeu. Nova tentativa em {Min} min.",
            EsperaAposFalha.TotalMinutes);

        return Degradado($"nova tentativa em até {EsperaAposFalha.TotalMinutes:0} min");
    }

    private static CotacaoUsdBrl Ok(Cotacao c) => new(c.Valor, c.ObtidaEm, c.Fonte, false, null);

    private CotacaoUsdBrl Degradado(string sufixo)
    {
        var boa = _ultimaBoa;
        if (boa is not null)
        {
            var horas = (int)(DateTime.UtcNow - boa.ObtidaEm).TotalHours;
            return new CotacaoUsdBrl(boa.Valor, boa.ObtidaEm, boa.Fonte, true,
                $"Cotação desatualizada — última leitura real há {horas}h ({sufixo}). Confira antes de precificar.");
        }

        return new CotacaoUsdBrl(UltimoRecurso, null, null, true,
            $"Não foi possível obter a cotação do dólar ({sufixo}). O valor exibido NÃO é a cotação real — " +
            "não use para precificar até normalizar.");
    }

    // -------------------------------------------------------------------------
    // Fontes
    // -------------------------------------------------------------------------

    /// <summary>
    /// PTAX do Banco Central. Usa o endpoint de PERÍODO (últimos 10 dias) em vez do de
    /// dia: a PTAX só é publicada em dia útil, então pedir "hoje" devolve lista vazia em
    /// fim de semana e feriado. Uma janela de 10 dias cobre até feriado prolongado com
    /// uma requisição só, e o mais recente é o primeiro da lista.
    /// </summary>
    private async Task<Cotacao?> TentarBcbAsync()
    {
        try
        {
            var hoje  = DateTime.UtcNow.Date;
            var desde = hoje.AddDays(-10);
            // A API espera MM-dd-yyyy entre aspas simples.
            string Fmt(DateTime d) => d.ToString("MM-dd-yyyy", CultureInfo.InvariantCulture);

            var url = "olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo" +
                      $"(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
                      $"?@dataInicial='{Fmt(desde)}'&@dataFinalCotacao='{Fmt(hoje)}'" +
                      "&$top=10&$format=json&$select=cotacaoVenda,dataHoraCotacao" +
                      "&$orderby=dataHoraCotacao%20desc";

            var client   = _factory.CreateClient("BcbPtax");
            var response = await client.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            if (doc.RootElement.TryGetProperty("value", out var value) &&
                value.ValueKind == JsonValueKind.Array &&
                value.GetArrayLength() > 0)
            {
                var item = value[0];
                if (item.TryGetProperty("cotacaoVenda", out var venda) &&
                    venda.TryGetDecimal(out var rate) && rate > 0)
                {
                    // dataHoraCotacao é o momento oficial da PTAX, em horário de BRASÍLIA
                    // (ex: "2026-07-29 13:08:43.534984") — não é UTC. Tratar como UTC
                    // jogaria a idade mostrada na tela 3h pra trás.
                    var obtidaEm = item.TryGetProperty("dataHoraCotacao", out var dh) &&
                                   DateTime.TryParse(dh.GetString(), CultureInfo.InvariantCulture,
                                       DateTimeStyles.None, out var d)
                        ? TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(d, DateTimeKind.Unspecified), BrazilZone)
                        : DateTime.UtcNow;

                    return new Cotacao(rate, obtidaEm, "Banco Central (PTAX)");
                }
            }

            _logger.LogWarning("PTAX respondeu sem cotação utilizável no período consultado.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha ao buscar cotação USD/BRL no Banco Central (PTAX)");
        }

        return null;
    }

    private async Task<Cotacao?> TentarAwesomeApiAsync()
    {
        try
        {
            var client   = _factory.CreateClient("AwesomeApi");
            var response = await client.GetAsync("/json/last/USD-BRL");
            response.EnsureSuccessStatusCode();

            var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            if (doc.RootElement.TryGetProperty("USDBRL", out var usdBrl) &&
                usdBrl.TryGetProperty("bid", out var bid) &&
                decimal.TryParse(bid.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var rate) &&
                rate > 0)
            {
                return new Cotacao(rate, DateTime.UtcNow, "AwesomeAPI");
            }

            _logger.LogWarning("AwesomeAPI respondeu sem USDBRL.bid utilizável.");
        }
        catch (Exception ex)
        {
            // Error, não Warning: enquanto durar, todo preço de carta convertido sai
            // errado na tela. Não é ruído — é algo pra alguém ir olhar.
            _logger.LogError(ex, "Falha ao buscar cotação USD/BRL na AwesomeAPI");
        }

        return null;
    }
}
