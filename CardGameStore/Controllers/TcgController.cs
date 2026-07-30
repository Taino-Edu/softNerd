// =============================================================================
// TcgController.cs — Busca de Cartas TCG (Cache-First via MongoDB)
// GET /api/tcg/search?name=pikachu&game=Pokemon             → por nome
// GET /api/tcg/search?set=PAL&num=058&game=Pokemon          → por código
// GET /api/tcg/search?artist=kenji&game=Pokemon             → por artista
// GET /api/tcg/search?regulationMark=G&legality=standard    → por mark/legalidade
// GET /api/tcg/cards/{id}                                   → por ID
// GET /api/tcg/sets?game=Pokemon                            → lista sets
// GET /api/tcg/brl-rate                                     → cotação USD/BRL
// =============================================================================

using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class TcgController : ControllerBase
{
    private readonly ITcgService     _tcgService;
    private readonly CurrencyService _currency;
    private readonly ILogger<TcgController> _logger;

    public TcgController(ITcgService tcgService, CurrencyService currency, ILogger<TcgController> logger)
    {
        _tcgService = tcgService;
        _currency   = currency;
        _logger     = logger;
    }

    /// <summary>
    /// Pesquisa cartas por nome OU por código (set + número).
    /// Exemplos:
    ///   ?name=pikachu&amp;game=Pokemon
    ///   ?set=SV8PT5&amp;num=1&amp;game=Pokemon
    ///   ?set=PAL&amp;num=058&amp;game=Pokemon
    /// </summary>
    [HttpGet("search")]
    [Authorize]
    [ProducesResponseType(200)]
    public async Task<IActionResult> Search(
        [FromQuery] string? name           = null,
        [FromQuery] string? set            = null,
        [FromQuery] string? num            = null,
        [FromQuery] string? setId          = null,
        [FromQuery] string? rarity         = null,
        [FromQuery] string? cardType       = null,
        [FromQuery] string? game           = "Pokemon",
        [FromQuery] int     page           = 1,
        [FromQuery] int     pageSize       = 30,
        // Pokémon TCG extended filters
        [FromQuery] string? artist         = null,
        [FromQuery] string? supertype      = null,
        [FromQuery] string? subtype        = null,
        [FromQuery] string? energyType     = null,
        [FromQuery] string? regulationMark = null,
        [FromQuery] string? legality       = null,
        [FromQuery] string? evolvesFrom    = null,
        [FromQuery] string? setSeries      = null,
        [FromQuery] string? ptcgoCode      = null,
        [FromQuery] string? releaseDateFrom = null,
        [FromQuery] string? releaseDateTo  = null,
        [FromQuery] int?    pokedexNumber  = null,
        [FromQuery] int?    hpMin          = null,
        [FromQuery] int?    hpMax          = null)
    {
        pageSize = Math.Clamp(pageSize, 1, 250);

        // Busca por código (set + número) — sintaxe adaptada por jogo
        if (!string.IsNullOrWhiteSpace(set) && !string.IsNullOrWhiteSpace(num))
        {
            var gameNorm = game?.ToLowerInvariant() ?? "pokemon";
            string q;

            if (gameNorm.Contains("mtg") || gameNorm.Contains("magic"))
                q = $"s:{set.ToLower()} cn:{num.ToLower()}";
            else if (gameNorm.Contains("yu-gi-oh") || gameNorm.Contains("yugioh"))
                q = $"{set.ToUpper()}-{num.PadLeft(3, '0')}";
            else if (gameNorm.Contains("riftbound") || gameNorm.Contains("lol"))
                q = $"{set.ToUpper()}-{num}";
            else
                // Pokémon: ptcgoCode (≤6 chars) → set.ptcgoCode; set.id longo → set.id
                q = set.Length <= 6
                    ? $"set.ptcgoCode:{set.ToUpper()} number:{num}"
                    : $"set.id:{set.ToLower()} number:{num}";

            var byCode = await _tcgService.SearchCardsByNameAsync(q, game, 1, 10);
            return Ok(byCode);
        }

        // Permite busca apenas por filtros sem nome (ex: buscar todas as cartas Rare Holo do Artista X)
        var hasFilters = !string.IsNullOrWhiteSpace(artist) || !string.IsNullOrWhiteSpace(supertype)
            || !string.IsNullOrWhiteSpace(subtype) || !string.IsNullOrWhiteSpace(energyType)
            || !string.IsNullOrWhiteSpace(regulationMark) || !string.IsNullOrWhiteSpace(legality)
            || !string.IsNullOrWhiteSpace(evolvesFrom) || !string.IsNullOrWhiteSpace(setSeries)
            || !string.IsNullOrWhiteSpace(ptcgoCode) || !string.IsNullOrWhiteSpace(rarity)
            || !string.IsNullOrWhiteSpace(setId) || pokedexNumber.HasValue
            || hpMin.HasValue || hpMax.HasValue;

        if (string.IsNullOrWhiteSpace(name) && !hasFilters)
            return BadRequest(new { Message = "Informe ao menos 'name' ou um filtro para busca." });

        var result = await _tcgService.SearchCardsByNameAsync(
            name ?? string.Empty, game, page, pageSize, setId, rarity, cardType,
            artist, supertype, subtype, energyType, regulationMark, legality,
            evolvesFrom, setSeries, ptcgoCode, releaseDateFrom, releaseDateTo,
            pokedexNumber, hpMin, hpMax);
        return Ok(result);
    }

    /// <summary>Busca uma carta específica pelo ID (ex: pokemon:sv8pt5-1).</summary>
    [HttpGet("cards/{tcgCardId}")]
    [Authorize]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetCard(string tcgCardId)
    {
        var card = await _tcgService.GetCardByIdAsync(tcgCardId);
        return card == null ? NotFound(new { Message = $"Carta '{tcgCardId}' não encontrada." }) : Ok(card);
    }

    /// <summary>Retorna a cotação USD/BRL atual (cache de 1h).</summary>
    [HttpGet("brl-rate")]
    [AllowAnonymous]
    public async Task<IActionResult> GetBrlRate()
    {
        var c = await _currency.GetCotacaoAsync();
        // UpdatedAt era DateTime.UtcNow — ou seja, a hora da REQUISIÇÃO, não a hora em
        // que a cotação foi lida. Sempre parecia recém-atualizada, mesmo travada no
        // fallback. Agora vem a hora real da leitura (null = nunca conseguiu ler).
        return Ok(new
        {
            UsdToBrl  = c.Valor,
            UpdatedAt = c.ObtidaEm,
            Degradada = c.Degradada,
            Aviso     = c.Aviso,
            Fonte     = c.Fonte,
        });
    }

    /// <summary>Lista os sets disponíveis para um jogo.</summary>
    [HttpGet("sets")]
    [Authorize]
    public async Task<IActionResult> GetSets([FromQuery] string game = "Pokemon")
    {
        var sets = await _tcgService.GetAvailableSetsAsync(game);
        return Ok(sets);
    }

    /// <summary>Força atualização do cache de uma carta. Apenas Admin.</summary>
    [HttpPost("cards/{tcgCardId}/refresh")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> RefreshCache(string tcgCardId)
    {
        var card = await _tcgService.RefreshCardCacheAsync(tcgCardId);
        return card == null ? NotFound() : Ok(card);
    }

    /// <summary>Remove uma carta do cache. Apenas Admin.</summary>
    [HttpDelete("cards/{tcgCardId}/cache")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> InvalidateCache(string tcgCardId)
    {
        await _tcgService.InvalidateCacheAsync(tcgCardId);
        return NoContent();
    }

    /// <summary>Remove todos os documentos expirados do cache MongoDB. Apenas Admin.</summary>
    [HttpPost("purge-cache")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PurgeCache()
    {
        var count = await _tcgService.PurgeExpiredCacheAsync();
        return Ok(new { RemovedCount = count, Message = $"{count} cartas expiradas removidas do cache." });
    }

    /// <summary>
    /// Sincroniza todos os cards de um set específico com a API pokemontcg.io.
    /// Dispara em background — retorna imediatamente.
    /// Admin apenas.
    /// </summary>
    [HttpPost("sync")]
    [Authorize(Policy = "AdminOnly")]
    public IActionResult SyncSet([FromQuery] string setId, [FromQuery] string game = "Pokemon")
    {
        if (string.IsNullOrWhiteSpace(setId))
            return BadRequest(new { Message = "Informe o 'setId' do set (ex: sv8pt5)." });

        _ = Task.Run(async () =>
        {
            try
            {
                int page = 1; const int batchSize = 250;
                while (true)
                {
                    var result = await _tcgService.SearchCardsByNameAsync($"set.id:{setId}", game, page, batchSize);
                    if (result.Items.Count == 0) break;
                    _logger.LogInformation("Sync set {SetId} página {Page}: {Count} cartas", setId, page, result.Items.Count);
                    if (result.Items.Count < batchSize) break;
                    page++;
                    await Task.Delay(500); // Rate limiting suave
                }
                _logger.LogInformation("Sync do set {SetId} concluído.", setId);
            }
            catch (Exception ex) { _logger.LogError(ex, "Erro no sync do set {SetId}", setId); }
        });

        return Accepted(new { Message = $"Sync do set '{setId}' disparado em background." });
    }
}
