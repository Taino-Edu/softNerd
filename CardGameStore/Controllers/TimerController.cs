using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/timers")]
// Operador com permissão de campeonatos também roda a mesa: o widget lateral de
// timer precisa funcionar pra ele, não só pro dono da loja.
[Authorize(Roles = "Admin,Operator")]
public class TimerController : ControllerBase
{
    private readonly AppDbContext _db;
    public TimerController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await _db.Timers.OrderBy(t => t.CreatedAt).Select(t => ToDto(t)).ToListAsync());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TimerCreateRequest req)
    {
        var t = new TimerEntity
        {
            Name            = req.Name,
            DurationSeconds = req.DurationSeconds,
            SoundPreset     = req.SoundPreset,
            WarnAtSeconds   = req.WarnAtSeconds,
        };

        // "É de campeonato?": liga ao campeonato do dia (Brasília). A liguinha reinicia
        // esse timer a cada rodada gerada, com o tempo de rodada do campeonato.
        if (req.DeCampeonato)
        {
            Championship? ch;
            if (req.ChampionshipId is Guid escolhido)
            {
                ch = await _db.Championships.FindAsync(escolhido);
                if (ch is null) return NotFound(new { message = "Campeonato não encontrado." });
            }
            else
            {
                var (inicio, fim) = Common.Brasilia.DiaUtc();
                var doDia = await _db.Championships
                    .Where(c => c.StartDate >= inicio && c.StartDate < fim
                             && (c.Status == ChampionshipStatus.Inscricoes || c.Status == ChampionshipStatus.EmAndamento
                                 || c.Status == ChampionshipStatus.Planejado))
                    .OrderBy(c => c.StartDate)
                    .Select(c => new { c.Id, c.Name })
                    .ToListAsync();
                if (doDia.Count == 0)
                    return BadRequest(new { message = "Nenhum campeonato marcado pra hoje." });
                if (doDia.Count > 1)
                    return Conflict(new { message = "Tem mais de um campeonato hoje. Escolha qual.", opcoes = doDia });
                ch = await _db.Championships.FindAsync(doDia[0].Id);
            }

            if (await _db.Timers.AnyAsync(x => x.ChampionshipId == ch!.Id))
                return Conflict(new { message = "Esse campeonato já tem um timer." });

            t.ChampionshipId = ch!.Id;
            ch.MinutosRodada = Math.Clamp(req.DurationSeconds / 60, 5, 180);
        }

        _db.Timers.Add(t);
        await _db.SaveChangesAsync();
        return StatusCode(201, ToDto(t));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] TimerUpdateRequest req)
    {
        var t = await _db.Timers.FindAsync(id);
        if (t == null) return NotFound();

        var nowRemaining = CalcRemaining(t);

        switch (req.Action)
        {
            case "start":
                t.State           = TimerState.Running;
                t.PausedRemaining = null;
                // Se retomando de pausa, ajusta StartedAt para que remaining = fromRemaining
                var fromSec = req.FromRemaining ?? nowRemaining;
                t.StartedAt = DateTime.UtcNow.AddSeconds(-(t.DurationSeconds - fromSec));
                break;

            case "pause":
                t.PausedRemaining = nowRemaining;
                t.State           = TimerState.Paused;
                t.StartedAt       = null;
                break;

            case "reset":
                t.State           = TimerState.Stopped;
                t.StartedAt       = null;
                t.PausedRemaining = null;
                break;

            case "finish":
                t.State           = TimerState.Finished;
                t.StartedAt       = null;
                t.PausedRemaining = 0;
                break;

            case "rename":
                if (!string.IsNullOrWhiteSpace(req.Name)) t.Name = req.Name;
                break;

            case "config":
                if (req.DurationSeconds.HasValue) t.DurationSeconds = req.DurationSeconds.Value;
                if (req.SoundPreset   != null)    t.SoundPreset     = req.SoundPreset;
                if (req.WarnAtSeconds .HasValue)  t.WarnAtSeconds   = req.WarnAtSeconds.Value;
                break;
        }

        t.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(t));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var t = await _db.Timers.FindAsync(id);
        if (t == null) return NotFound();
        _db.Timers.Remove(t);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static int CalcRemaining(TimerEntity t)
    {
        if (t.State == TimerState.Paused && t.PausedRemaining.HasValue)
            return t.PausedRemaining.Value;
        if (t.State == TimerState.Running && t.StartedAt.HasValue)
        {
            var elapsed = (int)(DateTime.UtcNow - t.StartedAt.Value).TotalSeconds;
            return Math.Max(0, t.DurationSeconds - elapsed);
        }
        return t.DurationSeconds;
    }

    private static object ToDto(TimerEntity t) => new
    {
        id              = t.Id,
        name            = t.Name,
        durationSeconds = t.DurationSeconds,
        pausedRemaining = t.PausedRemaining,
        state           = t.State.ToString().ToLower(),
        startedAt       = t.StartedAt,
        soundPreset     = t.SoundPreset,
        warnAtSeconds   = t.WarnAtSeconds,
        createdAt       = t.CreatedAt,
        championshipId  = t.ChampionshipId,
        rodada          = t.Rodada,
    };
}

public record TimerCreateRequest(
    string Name,
    int    DurationSeconds,
    string SoundPreset   = "bell",
    int    WarnAtSeconds = 60,
    bool   DeCampeonato  = false,
    Guid?  ChampionshipId = null);

public record TimerUpdateRequest(
    string  Action,
    string? Name            = null,
    int?    DurationSeconds = null,
    string? SoundPreset     = null,
    int?    WarnAtSeconds   = null,
    int?    FromRemaining   = null);
