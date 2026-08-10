// =============================================================================
// Product.cs — Estoque fixo da loja (PostgreSQL)
// Representa itens físicos: refrigerantes, salgadinhos, acessórios, etc.
// Cartas de TCG NÃO entram aqui — elas usam o CardCache (MongoDB) + serviço TCG.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Produto do estoque físico da loja.
/// CRUD simples gerenciado pelo Admin (Maikon).
/// </summary>
[Table("products")]
public class Product
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // -------------------------------------------------------------------------
    // Identificação
    // -------------------------------------------------------------------------

    [Required, MaxLength(200)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    [Column("description")]
    public string? Description { get; set; }

    // -------------------------------------------------------------------------
    // Categorização e identificação física
    // -------------------------------------------------------------------------

    /// <summary>
    /// Categoria do produto.
    /// Exemplos: "Bebida", "Salgadinho", "Acessório", "Carta Avulsa"
    /// </summary>
    [Required, MaxLength(100)]
    [Column("category")]
    public string Category { get; set; } = string.Empty;

    /// <summary>Código de barras (EAN-8, EAN-13, QR etc.) — opcional, leitura via scanner USB ou câmera.</summary>
    [MaxLength(100)]
    [Column("barcode")]
    public string? Barcode { get; set; }

    // -------------------------------------------------------------------------
    // Precificação e Estoque
    // -------------------------------------------------------------------------

    /// <summary>Preço de custo/aquisição (em centavos). Visível só para o admin — para controle de margem.</summary>
    [Column("cost_price_in_cents")]
    public int CostPriceInCents { get; set; } = 0;

    /// <summary>Preço de venda ao cliente (em centavos, para evitar float).</summary>
    [Column("price_in_cents")]
    public int PriceInCents { get; set; }

    /// <summary>Quantidade atual no estoque.</summary>
    [Column("stock_quantity")]
    public int StockQuantity { get; set; }

    /// <summary>Quantidade mínima antes de alertar o Admin sobre reposição.</summary>
    [Column("minimum_stock")]
    public int MinimumStock { get; set; } = 5;

    // -------------------------------------------------------------------------
    // Fiscal (NFC-e)
    // -------------------------------------------------------------------------

    /// <summary>
    /// NCM (Nomenclatura Comum do Mercosul) — obrigatório na NFC-e.
    /// Sem [MaxLength] aqui de propósito: o ApiController valida DataAnnotations
    /// no model binding, ANTES do ProductService sanitizar pontuação — um NCM
    /// colado como "1905.90.90" (10 caracteres) seria rejeitado com a mensagem
    /// genérica do .NET em vez da mensagem em português do service. A largura
    /// da coluna (8) é fixada via Fluent API em AppDbContext.OnModelCreating.
    /// </summary>
    [Column("ncm")]
    public string? Ncm { get; set; }

    /// <summary>CEST do produto, com 7 dígitos. Obrigatório nas operações sujeitas a
    /// ICMS-ST (CSOSN 201/202/203/500). Mesmo motivo do Ncm acima pra não ter [MaxLength].</summary>
    [Column("cest")]
    public string? Cest { get; set; }

    /// <summary>Natureza de operação (CFOP/CSOSN) aplicada na emissão da NFC-e deste produto.</summary>
    [Column("natureza_operacao_id")]
    public Guid? NaturezaOperacaoId { get; set; }

    // -------------------------------------------------------------------------
    // Metadados
    // -------------------------------------------------------------------------

    /// <summary>URL da imagem do produto (pode ser local ou CDN).</summary>
    [MaxLength(500)]
    [Column("image_url")]
    public string? ImageUrl { get; set; }

    /// <summary>Imagens adicionais do produto (galeria). Armazenadas como array de URLs.</summary>
    [Column("image_urls", TypeName = "text[]")]
    public string[] ImageUrls { get; set; } = Array.Empty<string>();

    /// <summary>Descrição longa do produto — exibida na página de detalhe (estilo ML).</summary>
    [Column("full_description")]
    public string? FullDescription { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>Se true, o produto aparece em destaque na landing page (escolha manual do admin).</summary>
    [Column("is_featured")]
    public bool IsFeatured { get; set; } = false;

    /// <summary>Se true, o produto aparece no site público. Consumíveis internos devem ter false.</summary>
    [Column("show_on_site")]
    public bool ShowOnSite { get; set; } = true;

    /// <summary>Se true, o produto aparece na loja digital (marketplace). Independente do PDV/comandas.</summary>
    [Column("show_on_marketplace")]
    public bool ShowOnMarketplace { get; set; } = true;

    /// <summary>Preço promocional em centavos. Quando preenchido, exibe badge "Promoção" e preço riscado.</summary>
    [Column("discount_price_in_cents")]
    public int? DiscountPriceInCents { get; set; }

    /// <summary>Se true, exibe badge "Pré-venda" — item disponível para pedido mas entregue só no lançamento.</summary>
    [Column("is_pre_venda")]
    public bool IsPreVenda { get; set; } = false;

    /// <summary>
    /// Em quantas vezes este item pode ser parcelado no cartão, anunciado na página do produto.
    /// Null (ou 1) = não anuncia parcelamento neste item — mesma lógica dos toggles de vitrine:
    /// não marcou, não aparece. O piso da parcela (SiteConfig.MinInstallmentInCents) ainda pode
    /// reduzir o número mostrado num item barato.
    /// </summary>
    [Column("max_installments")]
    public int? MaxInstallments { get; set; }

    /// <summary>
    /// Se true, o estoque é gerenciado por variantes (ProductVariant) em vez do campo StockQuantity.
    /// Use para produtos com grade de tamanho/cor (ex: camisas).
    /// </summary>
    [Column("has_variants")]
    public bool HasVariants { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // -------------------------------------------------------------------------
    // Propriedade calculada (não mapeada no banco)
    // -------------------------------------------------------------------------

    /// <summary>Preço em reais para exibição na interface.</summary>
    [NotMapped]
    public decimal PriceInReais => PriceInCents / 100m;

    /// <summary>Preço promocional em reais (null se não houver promoção).</summary>
    [NotMapped]
    public decimal? DiscountPriceInReais => DiscountPriceInCents.HasValue ? DiscountPriceInCents.Value / 100m : null;

    /// <summary>True se o produto estiver em promoção.</summary>
    [NotMapped]
    public bool IsOnPromo => DiscountPriceInCents.HasValue && DiscountPriceInCents.Value > 0 && DiscountPriceInCents.Value < PriceInCents;

    /// <summary>Preço de custo em reais.</summary>
    [NotMapped]
    public decimal CostPriceInReais => CostPriceInCents / 100m;

    /// <summary>Margem de lucro em reais.</summary>
    [NotMapped]
    public decimal MarginInReais => PriceInReais - CostPriceInReais;

    /// <summary>Margem percentual.</summary>
    [NotMapped]
    public decimal MarginPercent => CostPriceInCents > 0
        ? Math.Round((MarginInReais / CostPriceInReais) * 100, 1)
        : 0;

    /// <summary>Verdadeiro se o estoque estiver abaixo do mínimo.</summary>
    [NotMapped]
    public bool IsLowStock => StockQuantity <= MinimumStock;

    /// <summary>
    /// "Data de rua" da pré-venda (opcional): item em estoque que só pode ser
    /// vendido/retirado a partir desta data (ex: lançamento de coleção TCG).
    /// Null = sem trava de data.
    /// </summary>
    [Column("prevenda_release_date", TypeName = "date")]
    public DateTime? PreVendaReleaseDate { get; set; }

    // -------------------------------------------------------------------------
    // Navegação
    // -------------------------------------------------------------------------

    public ICollection<ComandaItem>        ComandaItems { get; set; } = new List<ComandaItem>();
    public ICollection<ProductVariant>     Variants     { get; set; } = new List<ProductVariant>();
    public ICollection<ProductReservation> Reservations { get; set; } = new List<ProductReservation>();
    public NaturezaOperacao?               NaturezaOperacao { get; set; }
}
