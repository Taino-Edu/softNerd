using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>Mensagens enviadas manualmente pela caixa de atendimento do admin.</summary>
[Table("whatsapp_outbound_messages")]
public class WhatsAppOutboundMessage
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(20), Column("phone")]
    public string Phone { get; set; } = string.Empty;

    [Required, MaxLength(2000), Column("message_text")]
    public string MessageText { get; set; } = string.Empty;

    [Required, MaxLength(20), Column("author")]
    public string Author { get; set; } = "admin";

    [MaxLength(200), Column("external_message_id")]
    public string? ExternalMessageId { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "sent";

    [Column("sent_at")]
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
}
