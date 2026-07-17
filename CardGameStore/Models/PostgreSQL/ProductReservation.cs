using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Reserva de produto feita pelo cliente via site/marketplace.
/// Não é usada no PDV/comanda — apenas para pedidos antecipados online.
///
/// Kind:
///  - "pre_venda": item EM ESTOQUE — baixa o estoque na hora da criação.
///    Não paga expira (48h, ou data de rua + 48h) e o estoque volta.
///  - "fila": item que AINDA NÃO CHEGOU — não mexe em estoque, não expira.
///    Quando o estoque chega, vira "pre_venda" na ordem da fila.
///
/// Status: "waiting" (fila) | "active" (pré-venda vigente) | "fulfilled" | "cancelled" | "expired"
/// </summary>
[Table("product_reservations")]
public class ProductReservation
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Agrupa várias reservas feitas numa mesma "compra" (carrinho) — o cliente pode
    /// reservar vários produtos de uma vez, cada um vira uma linha aqui com o mesmo GroupId.
    /// </summary>
    [Column("reservation_group_id")]
    public Guid ReservationGroupId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [ForeignKey(nameof(UserId))]
    public User User { get; set; } = null!;

    [Column("product_id")]
    public Guid ProductId { get; set; }

    [ForeignKey(nameof(ProductId))]
    public Product Product { get; set; } = null!;

    /// <summary>Variante reservada (tamanho/cor). Null se produto sem grade.</summary>
    [Column("variant_id")]
    public Guid? VariantId { get; set; }

    [ForeignKey(nameof(VariantId))]
    public ProductVariant? Variant { get; set; }

    [Column("quantity")]
    public int Quantity { get; set; } = 1;

    /// <summary>"pre_venda" (em estoque, baixa na hora) | "fila" (não chegou, espera).</summary>
    [MaxLength(20)]
    [Column("kind")]
    public string Kind { get; set; } = "pre_venda";

    [MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "active";

    [MaxLength(500)]
    [Column("notes")]
    public string? Notes { get; set; }

    [Column("reserved_at")]
    public DateTime ReservedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Expiração da pré-venda NÃO paga (48h ou data de rua + 48h). Null enquanto
    /// está na fila (fila não expira) ou depois de paga (venda feita).
    /// </summary>
    [Column("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    [Column("fulfilled_at")]
    public DateTime? FulfilledAt { get; set; }

    [Column("cancelled_at")]
    public DateTime? CancelledAt { get; set; }

    [NotMapped]
    public bool IsExpired => Status == "active" && ExpiresAt.HasValue && DateTime.UtcNow > ExpiresAt.Value;
}
