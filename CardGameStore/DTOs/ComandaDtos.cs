// =============================================================================
// ComandaDtos.cs — DTOs de Comanda e Itens
// =============================================================================

using System.ComponentModel.DataAnnotations;

namespace CardGameStore.DTOs;

// -------------------------------------------------------------------------
// Request: Adicionar item à comanda (usado pelo Hub e pelo Controller REST)
// -------------------------------------------------------------------------

/// <summary>Dados necessários para adicionar um item a uma comanda.</summary>
public class AddItemToComandaRequest
{
    /// <summary>ID do produto no estoque (nullable se for carta TCG).</summary>
    public Guid? ProductId { get; set; }

    /// <summary>ID da carta no cache MongoDB (nullable se for produto físico).</summary>
    public string? CardCacheId { get; set; }

    /// <summary>Variante escolhida (tamanho/cor). Obrigatório quando produto tem HasVariants=true.</summary>
    public Guid? VariantId { get; set; }

    /// <summary>Nome do item (preenchido automaticamente pelo serviço).</summary>
    [MaxLength(200)]
    public string ItemName { get; set; } = string.Empty;

    /// <summary>Preço unitário em centavos (preenchido pelo serviço a partir do estoque).</summary>
    public int UnitPriceInCents { get; set; }

    [Range(1, 100)]
    public int Quantity { get; set; } = 1;

    /// <summary>
    /// Se true, NÃO valida nem decrementa estoque — usado na homologação de pré-venda,
    /// onde o estoque já foi baixado no ato da reserva. Uso interno do backend.
    /// </summary>
    public bool SkipStockDecrement { get; set; } = false;
}

// -------------------------------------------------------------------------
// Response: Dados da comanda para o dashboard e para o cliente
// -------------------------------------------------------------------------

/// <summary>Snapshot da comanda para exibição no dashboard e confirmações.</summary>
public class ComandaDto
{
    public Guid              Id              { get; set; }
    public string            UserName        { get; set; } = string.Empty;
    public Guid              UserId          { get; set; }
    public string?           TableIdentifier { get; set; }
    public string            Status          { get; set; } = string.Empty;
    public decimal           TotalInReais    { get; set; }
    public int               PointsApplied   { get; set; }
    public int               DiscountInCents { get; set; }
    public DateTime          OpenedAt                    { get; set; }
    public DateTime?         ClosedAt                    { get; set; }
    public string?           PaymentMethod               { get; set; }
    public string?           SecondPaymentMethod         { get; set; }
    public int               SecondPaymentAmountInCents  { get; set; }
    public List<ComandaItemDto> Items                    { get; set; } = new();

    /// <summary>Saldo de pontos do cliente — exibido na modal de fechamento.</summary>
    public int  UserPointsBalance  { get; set; }
    /// <summary>Saldo de cashback do cliente em centavos — exibido na modal de fechamento.</summary>
    public int  UserBalanceInCents { get; set; }
    public string? ProfileImageUrl { get; set; }

  /// <summary>Preenchidos só quando o fechamento pediu emissão de NFC-e (EmitirNotaFiscal=true) —
  /// permite o front abrir o cupom automaticamente quando autoriza, ou avisar o motivo se não.</summary>
  public Guid?   NotaFiscalId             { get; set; }
  public string? NotaFiscalStatus         { get; set; }
  public string? NotaFiscalMotivoRejeicao { get; set; }
}

/// <summary>Request para aplicar pontos a uma comanda.</summary>
public class ApplyPointsRequest
{
    [Range(1, 100000)]
    public int Points { get; set; }
}

/// <summary>Body do endpoint PATCH /api/comanda/{id}/items/{itemId} (editar quantidade).</summary>
public class UpdateItemRequest
{
    [Range(0, 100, ErrorMessage = "Quantidade deve ser entre 0 e 100.")]
    public int Quantity { get; set; }
}

/// <summary>Body do endpoint POST /api/comanda/admin-open (admin abre comanda por um cliente).</summary>
public class AdminOpenComandaRequest
{
    [Required]
    public Guid UserId { get; set; }

    [MaxLength(50)]
    public string? TableIdentifier { get; set; }
}

/// <summary>Body do endpoint PUT /api/comanda/{id}/close.</summary>
public class CloseComandaRequest
{
    /// <summary>
    /// Forma de pagamento principal. Valores aceitos:
    /// Dinheiro | Pix | CartaoCredito | CartaoDebito | Crediario | Pontos | Cashback
    /// </summary>
    [Required]
    public string PaymentMethod { get; set; } = "Dinheiro";

    /// <summary>Observação opcional (ex: "troco de R$50,00").</summary>
    public string? Observacao { get; set; }

    /// <summary>Segundo método de pagamento para split (Cashback, Pontos, Dinheiro, Pix, etc.).</summary>
    public string? SecondPaymentMethod { get; set; }

    /// <summary>Valor pago pelo segundo método em centavos. Zero = sem split.</summary>
    public int SecondPaymentAmountInCents { get; set; } = 0;

    /// <summary>
    /// Quando PaymentMethod == Crediario, este campo indica se a dívida deve ser
    /// adicionada a um crediário aberto existente (fornece o Id do crediário)
    /// ou se deve criar uma nova conta (null = nova conta com prazo próprio de 30 dias).
    /// </summary>
    public Guid? CrediarioExistenteId { get; set; }

    /// <summary>Desconto administrativo em centavos aplicado no fechamento (opcional).</summary>
    [Range(0, int.MaxValue)]
    public int DiscountInCents { get; set; } = 0;

    /// <summary>
    /// Se true, emite a NFC-e desta venda automaticamente. O admin decide isso explicitamente
    /// no momento do fechamento (Maikon não quer nota emitida sem antes perguntar) — o valor
    /// vem pré-marcado no front conforme a forma de pagamento estar em FiscalConfig.FormasPagamentoAutoEmissao,
    /// mas é sempre sobrescrevível.
    /// </summary>
    public bool EmitirNotaFiscal { get; set; } = false;
}

public class ComandaItemDto
{
    public Guid    Id                  { get; set; }
    public Guid?   ProductId           { get; set; }
    public string  ItemNameSnapshot    { get; set; } = string.Empty;
    public int     Quantity            { get; set; }
    public int     UnitPriceInCents    { get; set; }
    public decimal UnitPriceInReais    { get; set; }
    public decimal SubtotalInReais     { get; set; }
    public DateTime AddedAt            { get; set; }
}

// -------------------------------------------------------------------------
// Edição de comanda fechada (Admin only)
// -------------------------------------------------------------------------

/// <summary>Request para editar uma comanda já fechada.</summary>
public class EditarComandaRequest
{
    public string? PaymentMethod               { get; set; }
    public string? SecondPaymentMethod         { get; set; }
    public int?    SecondPaymentAmountInCents  { get; set; }
    public Guid?   NovoClienteId              { get; set; }
    public int?    DescontoEmCentavos          { get; set; }
    public string? Notes                       { get; set; }
    public List<EditarItemRequest>? Itens      { get; set; }
}

public class EditarItemRequest
{
    /// <summary>Id do item existente. Null = novo item.</summary>
    public Guid?  ComandaItemId    { get; set; }

    /// <summary>True = remover o item (devolve estoque).</summary>
    public bool   Remover          { get; set; } = false;

    public Guid?  ProductId        { get; set; }
    public string ItemName         { get; set; } = string.Empty;
    public int    UnitPriceInCents { get; set; }
    public int    Quantity         { get; set; } = 1;
}

// -------------------------------------------------------------------------
// Resultado paginado genérico
// -------------------------------------------------------------------------

/// <summary>Wrapper genérico para resultados paginados da API.</summary>
public class PagedResult<T>
{
    public List<T> Items        { get; set; } = new();
    public int     TotalCount   { get; set; }
    public int     Page         { get; set; }
    public int     PageSize     { get; set; }
    public int     TotalPages   => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool    HasNext      => Page < TotalPages;
    public bool    HasPrev      => Page > 1;
    public string? ErrorMessage { get; set; }
}

// -------------------------------------------------------------------------
// DTOs da API TCG (pokemontcg.io, Scryfall, YGOProDeck, Riftbound)
// -------------------------------------------------------------------------

/// <summary>Resposta completa de uma carta TCG.</summary>
public class TcgApiCardResponse
{
    public string        Id                   { get; set; } = string.Empty;
    public string        Name                 { get; set; } = string.Empty;
    public string        Game                 { get; set; } = string.Empty;
    public string?       SetName              { get; set; }
    public string?       SetCode              { get; set; }
    public string?       SetSeries            { get; set; }
    public string?       SetPtcgoCode         { get; set; }
    public string?       SetReleaseDate       { get; set; }
    public string?       Number               { get; set; }
    public string?       Rarity               { get; set; }
    /// <summary>Supertype: Pokémon, Trainer, Energy, Creature, Spell…</summary>
    public string?       Type                 { get; set; }
    /// <summary>Subtypes: Basic, Stage 1, Item, Supporter, Special…</summary>
    public List<string>? Subtypes             { get; set; }
    /// <summary>Tipos de energia/cor: Fire, Water, Psychic…</summary>
    public List<string>? Types                { get; set; }
    public string?       Hp                   { get; set; }
    public string?       Artist               { get; set; }
    public string?       FlavorText           { get; set; }
    public string?       RegulationMark       { get; set; }
    public string?       EvolvesFrom          { get; set; }
    public List<string>? EvolvesTo            { get; set; }
    public List<int>?    NationalPokedexNumbers { get; set; }
    /// <summary>Legality por formato: { "standard": "Legal", "expanded": "Legal" }</summary>
    public Dictionary<string, string>? Legalities { get; set; }
    public List<TcgCardAttack>?   Attacks           { get; set; }
    public List<TcgCardWeakness>? Weaknesses        { get; set; }
    public List<TcgCardWeakness>? Resistances       { get; set; }
    public List<string>?          RetreatCost       { get; set; }
    public int?                   ConvertedRetreatCost { get; set; }
    public TcgCardImages?         Images            { get; set; }
    /// <summary>Preços TCGPlayer por variação (normal, holofoil, reverseHolofoil…).</summary>
    public TcgCardAllPrices?      AllPrices         { get; set; }
    /// <summary>Preços CardMarket (EUR).</summary>
    public CardMarketPricesApi?   CardMarket        { get; set; }
    /// <summary>Market price da variação principal (mantido para compatibilidade).</summary>
    public TcgCardPricesApi?      Prices            { get; set; }
}

public class TcgCardAttack
{
    public string       Name                { get; set; } = string.Empty;
    public List<string> Cost                { get; set; } = new();
    public int          ConvertedEnergyCost { get; set; }
    public string?      Damage              { get; set; }
    public string?      Text                { get; set; }
}

public class TcgCardWeakness
{
    public string Type  { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

public class TcgCardAllPrices
{
    public TcgCardPricesApi? Normal               { get; set; }
    public TcgCardPricesApi? Holofoil             { get; set; }
    public TcgCardPricesApi? ReverseHolofoil      { get; set; }
    public TcgCardPricesApi? FirstEditionNormal   { get; set; }
    public TcgCardPricesApi? FirstEditionHolofoil { get; set; }
    public TcgCardPricesApi? UnlimitedNormal      { get; set; }
    public TcgCardPricesApi? UnlimitedHolofoil    { get; set; }
}

/// <summary>Preços CardMarket (mercado europeu, em EUR).</summary>
public class CardMarketPricesApi
{
    public decimal? AverageSellPrice  { get; set; }
    public decimal? LowPrice          { get; set; }
    public decimal? TrendPrice        { get; set; }
    public decimal? ReverseHoloSell   { get; set; }
    public decimal? ReverseHoloLow    { get; set; }
    public decimal? ReverseHoloTrend  { get; set; }
    public decimal? LowPriceExPlus    { get; set; }
    public decimal? Avg1              { get; set; }
    public decimal? Avg7              { get; set; }
    public decimal? Avg30             { get; set; }
    public decimal? ReverseHoloAvg1   { get; set; }
    public decimal? ReverseHoloAvg7   { get; set; }
    public decimal? ReverseHoloAvg30  { get; set; }
    public string?  Url               { get; set; }
    public string?  UpdatedAt         { get; set; }
}

public class TcgCardImages
{
    public string? Small { get; set; }
    public string? Large { get; set; }
}

public class TcgCardPricesApi
{
    public decimal? Low       { get; set; }
    public decimal? Mid       { get; set; }
    public decimal? High      { get; set; }
    public decimal? Market    { get; set; }
    public decimal? DirectLow { get; set; }
}

/// <summary>Resposta de busca paginada da API TCG.</summary>
public class TcgApiSearchResponse
{
    public List<TcgApiCardResponse> Cards        { get; set; } = new();
    public int                      TotalCount   { get; set; }
    public int                      Page         { get; set; }
    public int                      PageSize     { get; set; }
    public string?                  ErrorMessage { get; set; }
}

/// <summary>Set/Expansão de um jogo TCG.</summary>
public class TcgSetDto
{
    public string    Code        { get; set; } = string.Empty;
    public string    Name        { get; set; } = string.Empty;
    public string    Game        { get; set; } = string.Empty;
    public string?   Series      { get; set; }
    public string?   LogoUrl     { get; set; }
    public int       TotalCards  { get; set; }
    public DateTime? ReleaseDate { get; set; }
}
