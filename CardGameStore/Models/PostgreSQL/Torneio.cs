// =============================================================================
// Torneio.cs — Rodadas e partidas da liguinha (torneio suíço em cima do campeonato)
//
// O campeonato continua dono da inscrição, do pagamento e da colocação final.
// Aqui ficam só as rodadas e as partidas; ao encerrar, a classificação vira
// ChampionshipParticipant.Placement e a Liga Mensal soma como sempre.
// Arquitetura: docs/liguinha.md.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>Formato do campeonato. Livre = como sempre foi (só colocação final).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FormatoTorneio { Livre, Suico }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum StatusRodada { Aberta, Fechada }

/// <summary>Resultado do ponto de vista do jogador A.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ResultadoPartida { VitoriaA, VitoriaB, Empate }

[Table("torneio_rodadas")]
public class TorneioRodada
{
    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("championship_id")]
    public Guid ChampionshipId { get; set; }

    [ForeignKey(nameof(ChampionshipId))]
    public Championship Championship { get; set; } = null!;

    [Column("numero")]
    public int Numero { get; set; }

    [Column("status")]
    public StatusRodada Status { get; set; } = StatusRodada.Aberta;

    [Column("iniciada_em")]
    public DateTime IniciadaEm { get; set; } = DateTime.UtcNow;

    [Column("fechada_em")]
    public DateTime? FechadaEm { get; set; }

    public ICollection<TorneioPartida> Partidas { get; set; } = new List<TorneioPartida>();
}

[Table("torneio_partidas")]
public class TorneioPartida
{
    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("rodada_id")]
    public Guid RodadaId { get; set; }

    [ForeignKey(nameof(RodadaId))]
    public TorneioRodada Rodada { get; set; } = null!;

    /// <summary>Número da mesa (1, 2, 3...). Bye fica no fim.</summary>
    [Column("mesa")]
    public int Mesa { get; set; }

    [Column("participante_a_id")]
    public Guid ParticipanteAId { get; set; }

    [ForeignKey(nameof(ParticipanteAId))]
    public ChampionshipParticipant ParticipanteA { get; set; } = null!;

    /// <summary>Null = bye (A ganha sem jogar).</summary>
    [Column("participante_b_id")]
    public Guid? ParticipanteBId { get; set; }

    [ForeignKey(nameof(ParticipanteBId))]
    public ChampionshipParticipant? ParticipanteB { get; set; }

    // Foto do deck naquele dia: editar ou apagar o deck depois não muda a estatística.
    [Column("deck_a_id")]  public Guid? DeckAId { get; set; }
    [MaxLength(200)] [Column("deck_a_nome")] public string? DeckANome { get; set; }
    [Column("deck_b_id")]  public Guid? DeckBId { get; set; }
    [MaxLength(200)] [Column("deck_b_nome")] public string? DeckBNome { get; set; }

    /// <summary>O que o jogador A lançou (null = ainda não lançou).</summary>
    [Column("report_a")]
    public ResultadoPartida? ReportA { get; set; }

    /// <summary>O que o jogador B lançou.</summary>
    [Column("report_b")]
    public ResultadoPartida? ReportB { get; set; }

    /// <summary>Resultado valendo (os dois bateram, o organizador decidiu, ou bye).</summary>
    [Column("resultado")]
    public ResultadoPartida? Resultado { get; set; }

    /// <summary>Jogos ganhos por A e por B (melhor de 3). Melhor de 1: 1x0, 0x1 ou 0x0.</summary>
    [Column("vitorias_a")] public int VitoriasA { get; set; }
    [Column("vitorias_b")] public int VitoriasB { get; set; }

    [Column("resolvido_por_admin_id")]
    public Guid? ResolvidoPorAdminId { get; set; }

    [Column("fechada_em")]
    public DateTime? FechadaEm { get; set; }

    [NotMapped]
    public bool EhBye => ParticipanteBId is null;

    [NotMapped]
    public bool Divergente => ReportA is not null && ReportB is not null && ReportA != ReportB && Resultado is null;
}
