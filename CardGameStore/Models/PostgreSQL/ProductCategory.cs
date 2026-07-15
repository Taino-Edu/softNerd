using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("product_categories")]
public class ProductCategory
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>Emoji exibido na interface do cliente (ex: "🥤").</summary>
    [MaxLength(10)]
    [Column("emoji")]
    public string? Emoji { get; set; }

    [Column("display_order")]
    public int DisplayOrder { get; set; } = 0;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Categoria pai (ex: "Card Game"), quando esta é uma subcategoria (ex: "One Piece").
    /// Null = categoria principal. Só um nível de aninhamento é suportado de propósito —
    /// uma categoria que já tem pai não pode virar pai de outra (ver CategoryService).
    /// </summary>
    [Column("parent_category_id")]
    public Guid? ParentCategoryId { get; set; }

    public ProductCategory? ParentCategory { get; set; }
    public ICollection<ProductCategory> Children { get; set; } = new List<ProductCategory>();

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
