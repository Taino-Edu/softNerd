using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Idempotência e auditoria mínima dos eventos recebidos da Evolution API/n8n.
/// O corpo completo do webhook não é persistido para reduzir exposição de dados pessoais.
/// </summary>
[Table("whatsapp_inbound_events")]
public class WhatsAppInboundEvent
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(200)]
    [Column("external_message_id")]
    public string ExternalMessageId { get; set; } = string.Empty;

    [Required, MaxLength(20)]
    [Column("phone")]
    public string Phone { get; set; } = string.Empty;

    [MaxLength(1000)]
    [Column("message_text")]
    public string? MessageText { get; set; }

    [Column("response_json", TypeName = "text")]
    public string? ResponseJson { get; set; }

    [Required, MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "processing";

    [Column("received_at")]
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    [Column("processed_at")]
    public DateTime? ProcessedAt { get; set; }
}
