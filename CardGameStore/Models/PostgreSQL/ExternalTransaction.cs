using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Transação financeira de fonte externa ou manual.
/// Source:  "inter" | "manual" ("sefaz"/"ofx" só em lançamento antigo, de módulos que saíram)
/// Type:    "income" | "expense"
/// Status:  "pending" | "paid" | "overdue" | "cancelled"
/// </summary>
[Table("external_transactions")]
public class ExternalTransaction
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(30)]
    [Column("source")]
    public string Source { get; set; } = "manual";

    /// <summary>ID externo para deduplicação (null em entradas manuais).</summary>
    [MaxLength(200)]
    [Column("external_id")]
    public string? ExternalId { get; set; }

    [Required, MaxLength(10)]
    [Column("type")]
    public string Type { get; set; } = "expense";

    [Column("amount", TypeName = "numeric(10,2)")]
    public decimal Amount { get; set; }

    [Required, MaxLength(500)]
    [Column("description")]
    public string Description { get; set; } = "";

    [Column("due_date")]
    public DateTime? DueDate { get; set; }

    [Column("paid_at")]
    public DateTime? PaidAt { get; set; }

    [Required, MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "pending";

    [MaxLength(100)]
    [Column("category")]
    public string? Category { get; set; }

    [MaxLength(200)]
    [Column("supplier")]
    public string? Supplier { get; set; }

    /// <summary>Chave de acesso NF-e (44 dígitos) quando source="sefaz".</summary>
    [MaxLength(44)]
    [Column("nfe_key")]
    public string? NfeKey { get; set; }

    [MaxLength(2000)]
    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
