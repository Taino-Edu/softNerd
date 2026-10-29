using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace CardGameStore.DTOs;

// =============================================================================
// PedidosDtos.cs — entrada e saída dos pedidos do site (pré-venda e fila legada).
// Quem usa: Controllers/ReservationController.cs e Services/Pedidos/*.
// =============================================================================

public class CreateReservationRequest
{
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
    public string? Notes   { get; init; }

    /// <summary>Intenção de pagamento declarada pelo cliente: "pix" ou "retirada".</summary>
    public string? PaymentMethod { get; init; }
}

public class CreateReservationCartItem
{
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
}

public class CreateReservationCartRequest
{
    public List<CreateReservationCartItem> Items { get; init; } = [];

    /// <summary>
    /// false (padrão): item que ficou sem estoque NÃO vira fila sozinho — o carrinho
    /// inteiro é recusado com 409 e o cliente escolhe (entrar na fila ou remover).
    /// true: conversão explícita pra fila (o cliente já consentiu na tela).
    /// </summary>
    public bool AllowFilaFallback { get; init; } = false;

    /// <summary>Intenção de pagamento declarada pelo cliente para o carrinho inteiro: "pix" ou "retirada".</summary>
    public string? PaymentMethod { get; init; }
}

public class AdminCreateReservationItem
{
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
}

public class AdminCreateReservationRequest
{
    public Guid  UserId    { get; init; }
    public string? Notes   { get; init; }

    /// <summary>Pedido com vários itens — vira um grupo só. Tem prioridade sobre os campos avulsos.</summary>
    public List<AdminCreateReservationItem>? Items { get; init; }

    // ── Compat: pedido de um item só (chamadas antigas) ──
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
}

public class UpdateReservationStatusRequest
{
    public string Status { get; init; } = "";
}

public class UpdateReservationQuantityRequest
{
    public int Quantity { get; init; }
}

public class HomologarRequest
{
    /// <summary>Forma de pagamento. Padrão: Dinheiro.</summary>
    public string? PaymentMethod { get; init; }

    /// <summary>Segundo método de pagamento, quando o cliente divide o pagamento.</summary>
    public string? SecondPaymentMethod { get; init; }

    /// <summary>Valor em centavos cobrado no segundo método.</summary>
    public int? SecondPaymentAmountInCents { get; init; }

    /// <summary>Desconto percentual decidido pelo admin só nesta homologação (0-100) — nunca
    /// visto pelo cliente antes disso (ele já pode ter pago o valor cheio via Pix). Ignorado
    /// se DiscountInCents vier preenchido.</summary>
    [Range(0, 100)]
    public int DiscountPercent { get; init; } = 0;

    /// <summary>Se preenchido, sobrepõe DiscountPercent — desconto direto em centavos. Mesmo
    /// padrão de VendaAvulsaRequest.</summary>
    [Range(0, int.MaxValue)]
    public int? DiscountInCents { get; init; }
}

/// <summary>Um item de pedido como as telas recebem.</summary>
public sealed record PedidoItemDto(
    Guid Id,
    Guid ReservationGroupId,
    Guid UserId,
    string? UserName,
    string? UserWhatsApp,
    Guid ProductId,
    string? ProductName,
    string? ProductImageUrl,
    // Kanban admin: "Vendas" (tag desligada) × "Pré-vendas" (produto marcado como pré-venda) —
    // não é o mesmo conceito de Kind (que só distingue se baixou estoque ou entrou na fila legada).
    bool ProductIsPreVenda,
    Guid? VariantId,
    string? VariantLabel,
    int Quantity,
    string Kind,
    string Status,
    string? Notes,
    string? PaymentMethod,
    DateTime ReservedAt,
    DateTime? ExpiresAt,
    DateTime? FulfilledAt,
    DateTime? CancelledAt,
    int? PosicaoFila,
    // Já virou venda no Financeiro (pago no Pix ou lançado à mão)
    bool VendaRegistrada,
    DateTime? PreVendaReleaseDate,
    decimal? PrecoUnitarioEmReais,
    decimal? SubtotalEmReais,
    // Último Pix do pedido, só na listagem do admin (o kanban fazia uma chamada por pedido pra isso)
    string? PixStatus = null,
    DateTime? PixExpiraEm = null);

public sealed record PedidosPaginaDto(IEnumerable<PedidoItemDto> Items, int Total, int TotalPages);

public sealed record CarrinhoCriadoDto(Guid GroupId, bool Juntou, IEnumerable<PedidoItemDto> Items);

/// <summary>Juntou: os itens entraram no pedido sem pagar que o cliente já tinha (chave pedido-pix-junto).</summary>
public sealed record PedidoAdminCriadoDto(Guid GroupId, IEnumerable<PedidoItemDto> Items, bool Juntou = false);

/// <summary>NaoJuntados: pedidos que ficaram separados (Pix pago agora ou Inter fora do ar).</summary>
public sealed record PedidosJuntadosDto(Guid GroupId, int Juntados, int NaoJuntados);

/// <summary>VendaEstornada/Itens só aparecem quando o cancelamento estornou a venda do pedido pago.</summary>
public sealed record PedidoCanceladoDto(
    bool JaPaga,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? VendaEstornada = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Itens = null);

public sealed record HomologacaoDto(
    string Message, bool VendaRegistrada, Guid ReservationId, List<Guid> ReservationIds,
    int ItemCount, int DiscountPercent, decimal DiscountInReais);

public sealed record PagamentoRegistradoDto(string Message, int ItemCount, int DiscountPercent, decimal DiscountInReais);

public sealed record PixPedidoGeradoDto(
    string TxId, string Status, string? PixCopiaCola, string? ImagemQrCode, DateTime? ExpiraEm,
    decimal ValorEmReais, bool Reutilizada);

public sealed record PixPedidoVerificadoDto(string Status, DateTime? PagoEm);

/// <summary>Último Pix do pedido. HasPix=false: nunca gerou cobrança (o resto vem nulo).</summary>
public sealed record PixPedidoStatusDto(
    bool HasPix, string? Status = null, DateTime? PagoEm = null, string? PixCopiaCola = null,
    string? ImagemQrCode = null, DateTime? ExpiraEm = null, decimal? ValorEmReais = null);
