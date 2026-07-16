using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Reserva de produto feita pelo cliente via site/marketplace.
/// Não é usada no PDV/comanda — apenas para pedidos antecipados online.
/// Status: "active" | "fulfilled" | "cancelled" | "expired"
/// </summary>
[Table("product_reservations")]
public class ProductReservation
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Agrupa várias reservas feitas numa mesma "compra" (carrinho de reserva) — o cliente pode
    /// reservar vários produtos de uma vez, cada um vira uma linha aqui com o mesmo GroupId.
    /// Reservas antigas (de antes do carrinho) têm GroupId == Id (grupo de 1 item só).
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

    [MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "active";

    [MaxLength(500)]
    [Column("notes")]
    public string? Notes { get; set; }

    [Column("reserved_at")]
    public DateTime ReservedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Reserva expira em 48h por padrão. Admin pode prorrogar.</summary>
    [Column("expires_at")]
    public DateTime ExpiresAt { get; set; }

    [Column("fulfilled_at")]
    public DateTime? FulfilledAt { get; set; }

    [Column("cancelled_at")]
    public DateTime? CancelledAt { get; set; }

    [NotMapped]
    public bool IsExpired => Status == "active" && DateTime.UtcNow > ExpiresAt;
}
