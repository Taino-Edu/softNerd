using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

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

    /// <summary>
    /// [JsonIgnore] é essencial aqui: sem isso, o EF liga automaticamente ParentCategory ↔
    /// Children entre entidades já carregadas no mesmo DbContext (mesmo sem .Include()), e o
    /// System.Text.Json entra num ciclo infinito ao serializar (categoria → pai → filhos →
    /// a própria categoria de novo → ...), derrubando o endpoint inteiro com 500. O frontend
    /// só precisa do ParentCategoryId (escalar) pra montar a árvore, nunca desses objetos.
    /// </summary>
    [JsonIgnore]
    public ProductCategory? ParentCategory { get; set; }

    [JsonIgnore]
    public ICollection<ProductCategory> Children { get; set; } = new List<ProductCategory>();

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
