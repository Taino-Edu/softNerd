// =============================================================================
// ProdutoPublicoDto.cs — o produto como o cliente e o visitante podem ver
//
// GET /api/product, /api/product/{id}, /store e /barcode devolviam a entidade inteira,
// com o PREÇO DE CUSTO e a MARGEM de cada item (97 de 105 produtos com custo preenchido),
// abertos pra qualquer visitante — achado na revisão de SEO (06/11). Quem não é admin nem
// operador recebe este formato: tudo o que a loja mostra, sem custo, margem e estoque mínimo.
// Admin/operador continuam recebendo a entidade (o PDV e o estoque usam o custo).
// =============================================================================

using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.DTOs;

public sealed record VariantePublicaDto(
    Guid Id, Guid ProductId, string? Size, string? Color, int StockQuantity, int? PriceInCents,
    string? Sku, string Label);

public sealed record ProdutoPublicoDto(
    Guid Id,
    string Name,
    string? Description,
    string Category,
    string? Barcode,
    int PriceInCents,
    int StockQuantity,
    string? ImageUrl,
    string[] ImageUrls,
    string? FullDescription,
    bool IsActive,
    bool IsFeatured,
    bool ShowOnSite,
    bool ShowOnMarketplace,
    int? DiscountPriceInCents,
    bool IsPreVenda,
    int? MaxInstallments,
    decimal? PixDiscountPercent,
    bool HasVariants,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    decimal PriceInReais,
    decimal? DiscountPriceInReais,
    bool IsOnPromo,
    // "Últimas unidades" na vitrine — só o sim/não, sem o estoque mínimo
    bool IsLowStock,
    DateTime? PreVendaReleaseDate,
    IReadOnlyList<VariantePublicaDto> Variants)
{
    public static ProdutoPublicoDto De(Product p) => new(
        p.Id, p.Name, p.Description, p.Category, p.Barcode, p.PriceInCents, p.StockQuantity,
        p.ImageUrl, p.ImageUrls, p.FullDescription, p.IsActive, p.IsFeatured, p.ShowOnSite,
        p.ShowOnMarketplace, p.DiscountPriceInCents, p.IsPreVenda, p.MaxInstallments,
        p.PixDiscountPercent, p.HasVariants, p.CreatedAt, p.UpdatedAt, p.PriceInReais,
        p.DiscountPriceInReais, p.IsOnPromo, p.IsLowStock, p.PreVendaReleaseDate,
        p.Variants.Select(v => new VariantePublicaDto(
            v.Id, v.ProductId, v.Size, v.Color, v.StockQuantity, v.PriceInCents, v.Sku, v.Label)).ToList());
}
