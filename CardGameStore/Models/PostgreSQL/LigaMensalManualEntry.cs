// =============================================================================
// LigaMensalManualEntry.cs — Lançamento manual de pontos na Liga Mensal
//
// A loja existia (com campeonatos semanais) muito antes deste sistema. Este
// registro permite ao admin digitar diretamente nome + pontos de um jogador
// num mês, sem precisar cadastrar Championship/ChampionshipParticipant —
// serve pra migrar histórico anotado à mão e pra correções pontuais.
// Somado ao ranking calculado a partir de Championship.Placement (casando
// por nome do jogador) em LigaMensalController.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("liga_mensal_manual_entries")]
public class LigaMensalManualEntry
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("ano")]
    public int Ano { get; set; }

    [Column("mes")]
    public int Mes { get; set; }

    [Required, MaxLength(200)]
    [Column("player_name")]
    public string PlayerName { get; set; } = string.Empty;

    [Column("total_points")]
    public int TotalPoints { get; set; }

    /// <summary>Decks usados no mês, texto livre separado por vírgula (ex.: "Charizard EX, Gyarados").</summary>
    [MaxLength(500)]
    [Column("decks")]
    public string? Decks { get; set; }

    [MaxLength(500)]
    [Column("observacao")]
    public string? Observacao { get; set; }

    [Column("created_by_admin_id")]
    public Guid CreatedByAdminId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
