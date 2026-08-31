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

    [Column("last_inbound_at")]
    public DateTime LastInboundAt { get; set; } = DateTime.UtcNow;

    [Column("last_read_at")]
    public DateTime? LastReadAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
