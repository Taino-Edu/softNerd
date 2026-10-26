using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Configuração de integração financeira (Inter PJ, Mercado Pago).
/// Source: "inter" | "mercadopago"
/// </summary>
[Table("integration_configs")]
public class IntegrationConfig
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(30)]
    [Column("source")]
    public string Source { get; set; } = "";

    [MaxLength(2000)]
    [Column("access_token")]
    public string? AccessToken { get; set; }

    [MaxLength(2000)]
    [Column("refresh_token")]
    public string? RefreshToken { get; set; }

    [MaxLength(200)]
    [Column("client_id")]
    public string? ClientId { get; set; }

    [MaxLength(200)]
    [Column("client_secret")]
    public string? ClientSecret { get; set; }

    [Column("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>CNPJ do estabelecimento (usado na consulta SEFAZ NF-e).</summary>
    [MaxLength(18)]
    [Column("cnpj")]
    public string? Cnpj { get; set; }

    /// <summary>Chave Pix cadastrada na conta (usada para emitir cobrança via API do Inter).</summary>
    [MaxLength(100)]
    [Column("pix_key")]
    public string? PixKey { get; set; }

    [Column("last_sync_at")]
    public DateTime? LastSyncAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
