// =============================================================================
// LigaMensalController.cs — Ranking mensal da liga de campeonatos semanais
//
// Duas fontes de pontos, mescladas por nome do jogador (case-insensitive):
//   1. Championship + ChampionshipParticipant.Placement (já existia no sistema)
//   2. LigaMensalManualEntry — lançamento manual do admin, pra migrar o
//      histórico anotado à mão (a loja existe muito antes deste sistema) ou
//      pra corrigir pontuação sem precisar cadastrar um campeonato inteiro.
//
// Pontuação por colocação: 1º=10, 2º=7, 3º=5, 4º=3, demais colocados=1.
//
// GET    /api/liga-mensal              → ranking do mês, já mesclado (público)
// GET    /api/liga-mensal/meses        → meses com dados (público)
// GET    /api/liga-mensal/manual       → lançamentos manuais brutos do mês (Admin)
// POST   /api/liga-mensal/manual       → cria lançamento manual (Admin)
// PUT    /api/liga-mensal/manual/{id}  → edita lançamento manual (Admin)
// DELETE /api/liga-mensal/manual/{id}  → remove lançamento manual (Admin)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/liga-mensal")]
[Produces("application/json")]
public class LigaMensalController : ControllerBase
{
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    private static DateTime BrDateToUtcStart(DateTime brDate) =>
        TimeZoneInfo.ConvertTimeToUtc(
            DateTime.SpecifyKind(brDate.Date, DateTimeKind.Unspecified), BrazilZone);

    private static readonly string[] MesesPtBr =
    {
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    };

    /// <summary>Pontos por colocação: 1º=10, 2º=7, 3º=5, 4º=3, demais=1.</summary>
    private static int PontosPorColocacao(int placement) => placement switch
    {
        1 => 10,
        2 => 7,
        3 => 5,
        4 => 3,
        _ => 1,
    };

    private readonly AppDbContext _db;

    public LigaMensalController(AppDbContext db) => _db = db;

    // -------------------------------------------------------------------------
    // LEITURA — público (consulta)
    // -------------------------------------------------------------------------

    /// <summary>Ranking consolidado da Liga Mensal (campeonatos + lançamentos manuais, mesclados por nome).</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LigaMensalDto), 200)]
    public async Task<IActionResult> GetRanking([FromQuery] int? ano, [FromQuery] int? mes)
    {
        var agoraBr = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        var anoAlvo = ano ?? agoraBr.Year;
        var mesAlvo = mes ?? agoraBr.Month;

        if (mesAlvo < 1 || mesAlvo > 12)
            return BadRequest(new { Message = "Mês inválido. Use um valor entre 1 e 12." });

        var inicioUtc = BrDateToUtcStart(new DateTime(anoAlvo, mesAlvo, 1));
        var fimUtc    = inicioUtc.AddMonths(1);

        var participantesDoMes = await _db.ChampionshipParticipants
            .Include(p => p.User)
            .Include(p => p.Championship)
            .Where(p => p.Placement != null
                        && p.Championship.StartDate >= inicioUtc
                        && p.Championship.StartDate < fimUtc)
            .ToListAsync();

        var manuaisDoMes = await _db.LigaMensalManualEntries
            .Where(e => e.Ano == anoAlvo && e.Mes == mesAlvo)
            .ToListAsync();

        // Mescla por nome normalizado (lower + trim) — evita duplicar "Cabral" em duas linhas
        // quando ele tem pontos vindos de campeonato E um lançamento manual no mesmo mês.
        var acumulado = new Dictionary<string, LigaMensalRankingDto>();

        foreach (var g in participantesDoMes.GroupBy(p => p.UserId))
        {
            var nome = g.First().User?.Name ?? "Jogador";
            var key  = nome.Trim().ToLowerInvariant();
            acumulado[key] = new LigaMensalRankingDto
            {
                UserId        = g.Key,
                PlayerName    = nome,
                TotalPoints   = g.Sum(p => PontosPorColocacao(p.Placement!.Value)),
                EventsPlayed  = g.Count(),
                BestPlacement = g.Min(p => p.Placement!.Value),
                Decks = g.Select(p => p.DeckName)
                    .Where(d => !string.IsNullOrWhiteSpace(d))
                    .Select(d => d!)
                    .Distinct()
                    .OrderBy(d => d)
                    .ToList(),
            };
        }

        foreach (var m in manuaisDoMes)
        {
            var key = m.PlayerName.Trim().ToLowerInvariant();
            var decksManual = (m.Decks ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();

            if (acumulado.TryGetValue(key, out var existente))
            {
                existente.TotalPoints += m.TotalPoints;
                existente.Decks = existente.Decks.Concat(decksManual).Distinct().OrderBy(d => d).ToList();
            }
            else
            {
                acumulado[key] = new LigaMensalRankingDto
                {
                    UserId        = m.Id, // sem usuário real do sistema — usa o id do próprio lançamento
                    PlayerName    = m.PlayerName,
                    TotalPoints   = m.TotalPoints,
                    EventsPlayed  = 0,
                    BestPlacement = 0,
                    Decks         = decksManual,
                };
            }
        }

        var ranking = acumulado.Values
            .OrderByDescending(r => r.TotalPoints)
            .ThenByDescending(r => r.EventsPlayed)
            .ThenBy(r => r.PlayerName)
            .ToList();

        return Ok(new LigaMensalDto
        {
            Ano      = anoAlvo,
            Mes      = mesAlvo,
            MesLabel = $"{MesesPtBr[mesAlvo - 1]} de {anoAlvo}",
            Ranking  = ranking,
        });
    }

    /// <summary>Lista os meses que já têm dados (campeonatos com colocação OU lançamento manual).</summary>
    [HttpGet("meses")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<LigaMensalMesDto>), 200)]
    public async Task<IActionResult> GetMesesDisponiveis()
    {
        var datasChampionship = await _db.ChampionshipParticipants
            .Where(p => p.Placement != null)
            .Select(p => p.Championship.StartDate)
            .ToListAsync();

        var mesesChampionship = datasChampionship
            .Select(d => TimeZoneInfo.ConvertTimeFromUtc(d, BrazilZone))
            .Select(d => (Ano: d.Year, Mes: d.Month));

        var mesesManuais = await _db.LigaMensalManualEntries
            .Select(e => new { e.Ano, e.Mes })
            .Distinct()
            .ToListAsync();

        var meses = mesesChampionship
            .Concat(mesesManuais.Select(m => (Ano: m.Ano, Mes: m.Mes)))
            .Distinct()
            .OrderByDescending(m => m.Ano).ThenByDescending(m => m.Mes)
            .Select(m => new LigaMensalMesDto
            {
                Ano      = m.Ano,
                Mes      = m.Mes,
                MesLabel = $"{MesesPtBr[m.Mes - 1]} de {m.Ano}",
            })
            .ToList();

        return Ok(meses);
    }

    // -------------------------------------------------------------------------
    // LANÇAMENTO MANUAL — apenas Admin, apenas no painel admin
    // -------------------------------------------------------------------------

    /// <summary>Lista os lançamentos manuais de um mês (bruto, pra edição no admin).</summary>
    [HttpGet("manual")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<LigaMensalManualEntryDto>), 200)]
    public async Task<IActionResult> GetManualEntries([FromQuery] int ano, [FromQuery] int mes)
    {
        var entries = await _db.LigaMensalManualEntries
            .Where(e => e.Ano == ano && e.Mes == mes)
            .OrderBy(e => e.PlayerName)
            .ToListAsync();

        return Ok(entries.Select(ToDto));
    }

    /// <summary>Cria um lançamento manual de pontos. Apenas Admin.</summary>
    [HttpPost("manual")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(LigaMensalManualEntryDto), 201)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> CreateManualEntry([FromBody] SaveLigaMensalManualEntryRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (request.Mes < 1 || request.Mes > 12)
            return BadRequest(new { Message = "Mês inválido. Use um valor entre 1 e 12." });

        var entry = new LigaMensalManualEntry
        {
            Ano              = request.Ano,
            Mes              = request.Mes,
            PlayerName       = request.PlayerName.Trim(),
            TotalPoints      = request.TotalPoints,
            Decks            = string.IsNullOrWhiteSpace(request.Decks) ? null : request.Decks.Trim(),
            Observacao       = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim(),
            CreatedByAdminId = GetUserId(),
        };

        _db.LigaMensalManualEntries.Add(entry);
        await _db.SaveChangesAsync();

        return StatusCode(201, ToDto(entry));
    }

    /// <summary>Edita um lançamento manual. Apenas Admin.</summary>
    [HttpPut("manual/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(LigaMensalManualEntryDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> UpdateManualEntry(Guid id, [FromBody] SaveLigaMensalManualEntryRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (request.Mes < 1 || request.Mes > 12)
            return BadRequest(new { Message = "Mês inválido. Use um valor entre 1 e 12." });

        var entry = await _db.LigaMensalManualEntries.FindAsync(id);
        if (entry is null) return NotFound(new { Message = "Lançamento não encontrado." });

        entry.Ano         = request.Ano;
        entry.Mes         = request.Mes;
        entry.PlayerName  = request.PlayerName.Trim();
        entry.TotalPoints = request.TotalPoints;
        entry.Decks       = string.IsNullOrWhiteSpace(request.Decks) ? null : request.Decks.Trim();
        entry.Observacao  = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim();
        entry.UpdatedAt   = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToDto(entry));
    }

    /// <summary>Remove um lançamento manual. Apenas Admin.</summary>
    [HttpDelete("manual/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> DeleteManualEntry(Guid id)
    {
        var entry = await _db.LigaMensalManualEntries.FindAsync(id);
        if (entry is null) return NotFound(new { Message = "Lançamento não encontrado." });

        _db.LigaMensalManualEntries.Remove(entry);
        await _db.SaveChangesAsync();
        return Ok(new { Message = "Lançamento removido." });
    }

    // -------------------------------------------------------------------------
    // Helpers privados
    // -------------------------------------------------------------------------

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }

    private static LigaMensalManualEntryDto ToDto(LigaMensalManualEntry e) => new()
    {
        Id          = e.Id,
        Ano         = e.Ano,
        Mes         = e.Mes,
        PlayerName  = e.PlayerName,
        TotalPoints = e.TotalPoints,
        Decks       = e.Decks,
        Observacao  = e.Observacao,
        CreatedAt   = e.CreatedAt,
        UpdatedAt   = e.UpdatedAt,
    };
}

// =============================================================================
// DTOs
// =============================================================================

public class LigaMensalDto
{
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string MesLabel { get; init; } = string.Empty;
    public List<LigaMensalRankingDto> Ranking { get; init; } = new();
}

public class LigaMensalRankingDto
{
    public Guid UserId { get; init; }
    public string PlayerName { get; init; } = string.Empty;
    public int TotalPoints { get; set; }
    public int EventsPlayed { get; init; }
    public int BestPlacement { get; init; }
    public List<string> Decks { get; set; } = new();
}

public class LigaMensalMesDto
{
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string MesLabel { get; init; } = string.Empty;
}

public class LigaMensalManualEntryDto
{
    public Guid Id { get; init; }
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string PlayerName { get; init; } = string.Empty;
    public int TotalPoints { get; init; }
    public string? Decks { get; init; }
    public string? Observacao { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

/// <summary>Request pra criar/editar lançamento manual.</summary>
public class SaveLigaMensalManualEntryRequest
{
    public int Ano { get; init; }
    public int Mes { get; init; }

    [System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.MaxLength(200)]
    public string PlayerName { get; init; } = string.Empty;

    public int TotalPoints { get; init; }

    [System.ComponentModel.DataAnnotations.MaxLength(500)]
    public string? Decks { get; init; }

    [System.ComponentModel.DataAnnotations.MaxLength(500)]
    public string? Observacao { get; init; }
}
