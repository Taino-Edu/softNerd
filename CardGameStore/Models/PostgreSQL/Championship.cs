// =============================================================================
// Championship.cs — Entidade de Campeonato/Torneio (PostgreSQL)
// Requer login completo (e-mail + senha) para participação.
// Comandas de jogadores podem ser atreladas a um campeonato.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Campeonato organizado na loja.
/// Exemplos: "Torneio Pokémon — Semana 01", "Draft Magic Pré-Release"
/// </summary>
[Table("championships")]
public class Championship
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // -------------------------------------------------------------------------
    // Identificação
    // -------------------------------------------------------------------------

    [Required, MaxLength(200)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    [Column("description")]
    public string? Description { get; set; }

    /// <summary>Jogo do torneio: "Pokemon", "Magic", "Yu-Gi-Oh", etc.</summary>
    [Required, MaxLength(100)]
    [Column("game")]
    public string Game { get; set; } = string.Empty;

    // -------------------------------------------------------------------------
    // Datas
    // -------------------------------------------------------------------------

    [Column("start_date")]
    public DateTime StartDate { get; set; }

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    [Column("registration_deadline")]
    public DateTime? RegistrationDeadline { get; set; }

    // -------------------------------------------------------------------------
    // Configuração
    // -------------------------------------------------------------------------

    /// <summary>Número máximo de jogadores (nulo = sem limite).</summary>
    [Column("max_participants")]
    public int? MaxParticipants { get; set; }

    /// <summary>Taxa de inscrição em centavos (0 = gratuito).</summary>
    [Column("entry_fee_in_cents")]
    public int EntryFeeInCents { get; set; }

    /// <summary>
    /// Minutos que a vaga fica segurada esperando o pagamento da inscrição. Passado o
    /// prazo sem pagar, a vaga volta a valer pra outra pessoa (a linha do participante
    /// continua lá, só não ocupa mais vaga). Só vale quando há taxa.
    /// </summary>
    [Column("minutos_para_pagar")]
    public int MinutosParaPagar { get; set; } = 30;

    [Column("status")]
    public ChampionshipStatus Status { get; set; } = ChampionshipStatus.Planejado;

    // -------------------------------------------------------------------------
    // Auditoria
    // -------------------------------------------------------------------------

    /// <summary>URL pública da imagem de capa (salva em /uploads/).</summary>
    [MaxLength(500)]
    [Column("image_url")]
    public string? ImageUrl { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("created_by_admin_id")]
    public Guid CreatedByAdminId { get; set; }

    /// <summary>JSON do pódio após finalização: [{"lugar":1,"nome":"João"},{"lugar":2,"nome":"Maria"},{"lugar":3,"nome":"Pedro"}]</summary>
    [MaxLength(1000)]
    [Column("podio_json")]
    public string? PodioJson { get; set; }

    // -------------------------------------------------------------------------
    // Navegação
    // -------------------------------------------------------------------------

    public ICollection<ChampionshipParticipant> Participants { get; set; } = new List<ChampionshipParticipant>();
    public ICollection<Comanda> Comandas { get; set; } = new List<Comanda>();
    public ICollection<ChampionshipPreInscricao> PreInscricoes { get; set; } = new List<ChampionshipPreInscricao>();
}

/// <summary>Pré-inscrição vinda da landing page (sem conta de usuário).</summary>
[Table("championship_preinscricoes")]
public class ChampionshipPreInscricao
{
    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required] [Column("championship_id")]
    public Guid ChampionshipId { get; set; }

    [ForeignKey(nameof(ChampionshipId))]
    public Championship Championship { get; set; } = null!;

    [Required, MaxLength(200)] [Column("nome")]
    public string Nome { get; set; } = string.Empty;

    [Required, MaxLength(30)] [Column("whatsapp")]
    public string WhatsApp { get; set; } = string.Empty;

    [Column("deck_id")]
    public Guid? DeckId { get; set; }

    [MaxLength(200)]
    [Column("deck_name")]
    public string? DeckName { get; set; }

    [Column("is_lista_espera")]
    public bool IsListaEspera { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Relacionamento N:M entre Usuário e Campeonato, com dados adicionais.
/// Registra resultado, deck utilizado, etc.
/// </summary>
[Table("championship_participants")]
public class ChampionshipParticipant
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("championship_id")]
    public Guid ChampionshipId { get; set; }

    [ForeignKey(nameof(ChampionshipId))]
    public Championship Championship { get; set; } = null!;

    [Required]
    [Column("user_id")]
    public Guid UserId { get; set; }

    [ForeignKey(nameof(UserId))]
    public User User { get; set; } = null!;

    /// <summary>Número do jogador no torneio (gerado pelo sistema).</summary>
    [Column("player_number")]
    public int PlayerNumber { get; set; }

    /// <summary>Nome do deck registrado (opcional, para formatos que exigem decklist).</summary>
    [MaxLength(200)]
    [Column("deck_name")]
    public string? DeckName { get; set; }

    /// <summary>ID do deck salvo na conta do jogador (nullable).</summary>
    [Column("deck_id")]
    public Guid? DeckId { get; set; }

    /// <summary>Colocação final (preenchida após o torneio).</summary>
    [Column("placement")]
    public int? Placement { get; set; }

    [Column("registered_at")]
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

    /// <summary>Quando a taxa de inscrição foi paga — null = ainda não pagou.</summary>
    [Column("entry_fee_paid_at")]
    public DateTime? EntryFeePaidAt { get; set; }

    /// <summary>
    /// Até quando esta inscrição segura a vaga esperando pagamento.
    /// Null = vaga firme, não expira: inscrição gratuita, já paga, ou feita antes de
    /// o pagamento passar a ser obrigatório (ninguém perde vaga por causa do deploy).
    /// Passado o prazo a linha não some — ela deixa de contar como vaga ocupada, e o
    /// admin ainda consegue cobrar ou remover. Sem robô: quem lê é que desconsidera.
    /// </summary>
    [Column("inscricao_expira_em")]
    public DateTime? InscricaoExpiraEm { get; set; }

    /// <summary>Inscrição em pé: pagou, ou o prazo pra pagar ainda não venceu.</summary>
    [NotMapped]
    public bool VagaVale => EntryFeePaidAt is not null
                         || InscricaoExpiraEm is null
                         || InscricaoExpiraEm > DateTime.UtcNow;

    /// <summary>"Pix" (confirmado pelo Inter) ou "Balcao" (marcado manualmente pelo admin).</summary>
    [MaxLength(20)]
    [Column("entry_fee_payment_method")]
    public string? EntryFeePaymentMethod { get; set; }

    /// <summary>Comanda do jogador durante o campeonato (para lanche, acessórios, etc.).</summary>
    [Column("comanda_id")]
    public Guid? ComandaId { get; set; }

    [ForeignKey(nameof(ComandaId))]
    public Comanda? Comanda { get; set; }
}

/// <summary>Estados possíveis de um campeonato.</summary>
public enum ChampionshipStatus
{
    Planejado,
    Inscricoes,   // Inscrições abertas
    EmAndamento,
    Finalizado,
    Cancelado
}
