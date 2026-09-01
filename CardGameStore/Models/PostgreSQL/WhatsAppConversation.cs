using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>Estado mínimo da conversa para handoff entre robô e atendimento humano.</summary>
[Table("whatsapp_conversations")]
public class WhatsAppConversation
{
    [Key, MaxLength(20)]
    [Column("phone")]
    public string Phone { get; set; } = string.Empty;

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("bot_paused_until")]
    public DateTime? BotPausedUntil { get; set; }

    /// <summary>
    /// Contato marcado para o robô nunca responder. Diferente de <see cref="BotPausedUntil"/>,
    /// que é handoff temporário de 4 horas: esta marca não expira e o cliente não a desfaz
    /// digitando "bot". A mensagem continua sendo registrada e aparece no inbox.
    /// </summary>
    [Column("bot_disabled")]
    public bool BotDisabled { get; set; }

    [Column("last_inbound_at")]
    public DateTime LastInboundAt { get; set; } = DateTime.UtcNow;

    [Column("last_read_at")]
    public DateTime? LastReadAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
