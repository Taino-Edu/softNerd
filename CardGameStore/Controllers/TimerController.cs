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
    };
}

public record TimerCreateRequest(
    string Name,
    int    DurationSeconds,
    string SoundPreset   = "bell",
    int    WarnAtSeconds = 60);

public record TimerUpdateRequest(
    string  Action,
    string? Name            = null,
    int?    DurationSeconds = null,
    string? SoundPreset     = null,
    int?    WarnAtSeconds   = null,
    int?    FromRemaining   = null);
