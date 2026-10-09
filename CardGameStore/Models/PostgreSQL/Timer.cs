using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

public enum TimerState { Stopped, Running, Paused, Finished }

[Table("timers")]
public class TimerEntity
{
    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100)] [Column("name")]
    public string Name { get; set; } = "Timer";

    [Column("duration_seconds")]
    public int DurationSeconds { get; set; } = 1800;

    [Column("paused_remaining")]
    public int? PausedRemaining { get; set; }

    [Column("state")]
    public TimerState State { get; set; } = TimerState.Stopped;

    [Column("started_at")]
    public DateTime? StartedAt { get; set; }

    [MaxLength(50)] [Column("sound_preset")]
    public string SoundPreset { get; set; } = "bell";

    [Column("warn_at_seconds")]
    public int WarnAtSeconds { get; set; } = 60;

    /// <summary>Timer de campeonato: reinicia sozinho a cada rodada gerada (liguinha).</summary>
    [Column("championship_id")]
    public Guid? ChampionshipId { get; set; }

    /// <summary>Rodada que este timer está contando.</summary>
    [Column("rodada")]
    public int? Rodada { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
