// =============================================================================
// LigaMensalController.cs — Ranking mensal da liga de campeonatos semanais
//
// Não é uma entidade nova: agrega Championship + ChampionshipParticipant
// (campo Placement, já usado pelo admin em /admin/campeonatos) por mês.
// Pontuação: 1º=10, 2º=7, 3º=5, 4º=3, demais colocados=1.
//
// GET /api/liga-mensal        → ranking do mês (público, só leitura)
// GET /api/liga-mensal/meses  → meses com campeonatos já pontuados (público)
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
[AllowAnonymous]
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

    /// <summary>Ranking consolidado da Liga Mensal (soma de pontos + decks usados no mês).</summary>
    [HttpGet]
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

        var ranking = participantesDoMes
            .GroupBy(p => p.UserId)
            .Select(g => new LigaMensalRankingDto
            {
                UserId       = g.Key,
                PlayerName   = g.First().User?.Name ?? "Jogador",
                TotalPoints  = g.Sum(p => PontosPorColocacao(p.Placement!.Value)),
                EventsPlayed = g.Count(),
                BestPlacement = g.Min(p => p.Placement!.Value),
                Decks = g
                    .Select(p => p.DeckName)
                    .Where(d => !string.IsNullOrWhiteSpace(d))
                    .Select(d => d!)
                    .Distinct()
                    .OrderBy(d => d)
                    .ToList(),
            })
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

    /// <summary>Lista os meses que já têm campeonatos com colocação definida (para o seletor de mês).</summary>
    [HttpGet("meses")]
    [ProducesResponseType(typeof(IEnumerable<LigaMensalMesDto>), 200)]
    public async Task<IActionResult> GetMesesDisponiveis()
    {
        var datas = await _db.ChampionshipParticipants
            .Where(p => p.Placement != null)
            .Select(p => p.Championship.StartDate)
            .ToListAsync();

        var meses = datas
            .Select(d => TimeZoneInfo.ConvertTimeFromUtc(d, BrazilZone))
            .Select(d => new { d.Year, d.Month })
            .Distinct()
            .OrderByDescending(m => m.Year).ThenByDescending(m => m.Month)
            .Select(m => new LigaMensalMesDto
            {
                Ano      = m.Year,
                Mes      = m.Month,
                MesLabel = $"{MesesPtBr[m.Month - 1]} de {m.Year}",
            })
            .ToList();

        return Ok(meses);
    }
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
    public int TotalPoints { get; init; }
    public int EventsPlayed { get; init; }
    public int BestPlacement { get; init; }
    public List<string> Decks { get; init; } = new();
}

public class LigaMensalMesDto
{
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string MesLabel { get; init; } = string.Empty;
}
