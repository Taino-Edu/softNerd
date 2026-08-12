using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CardGameStore.Models.MongoDB;

/// <summary>
/// Evento de caixa — venda imediata no balcão sem QR Code.
/// Documento autocontido: todos os dados são snapshot no momento da venda.
/// Nenhuma FK para PostgreSQL — propositalmente desacoplado.
/// </summary>
[BsonIgnoreExtraElements]
public class VendaAvulsa
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public List<VendaAvulsaItem> Items { get; set; } = new();

    public int TotalInCents { get; set; }

    /// <summary>Pix | Dinheiro | CartaoCredito | CartaoDebito | Crediario | Pontos | Cashback</summary>
    public string PaymentMethod { get; set; } = CardGameStore.Models.MongoDB.PaymentMethod.Pix;

    /// <summary>Segundo método (Cashback ou Pontos) quando o pagamento é dividido. Nullable.</summary>
    public string? SecondPaymentMethod { get; set; }

    /// <summary>Valor pago no segundo método em centavos. Zero quando não há divisão.</summary>
    public int SecondPaymentAmountInCents { get; set; } = 0;

    public string? ClientName { get; set; }

    public DateTime SoldAt { get; set; } = DateTime.UtcNow;

    // Snapshot do admin no momento da venda
    public Guid   SoldByAdminId   { get; set; }
    public string SoldByAdminName { get; set; } = string.Empty;

    /// <summary>Cliente identificado no momento da venda (nullable — vendas anônimas não têm UserId).</summary>
    public Guid?   UserId   { get; set; }
    public string? UserName { get; set; }

    public int DiscountPercent { get; set; } = 0;
    public int DiscountInCents { get; set; } = 0;

    /// <summary>"Reserva" quando a venda vem da homologação de um pedido do site (kanban de
    /// Pedidos); null/vazio = venda de balcão comum. O Financeiro ainda subdivide isso em
    /// "Site" × "Pré-venda" via ProductIsPreVenda, mesma tag que separa as colunas do kanban.</summary>
    public string? Origem { get; set; }

    /// <summary>Id da ProductReservation de origem, quando Origem == "Reserva". Num carrinho
    /// homologado de uma vez, é o primeiro item — a venda inteira é identificada pelo grupo.</summary>
    public Guid? ReservationId { get; set; }

    /// <summary>Grupo (carrinho) de origem, quando Origem == "Reserva" — uma venda por grupo,
    /// mesmo com vários itens reservados juntos.</summary>
    public Guid? ReservationGroupId { get; set; }

    /// <summary>Snapshot de Product.IsPreVenda no momento da homologação. Só relevante quando
    /// Origem == "Reserva" — decide se cai em "Site" ou "Pré-venda" no Financeiro.</summary>
    public bool ProductIsPreVenda { get; set; }

    /// <summary>Crediário criado (ou acumulado) por esta venda, quando o pagamento foi no
    /// crediário. Sem isto não dava pra saber qual dívida baixar ao estornar a venda — nem
    /// qual venda desfazer ao mexer no crediário (o Crediario só aponta pra comanda).</summary>
    public Guid? CrediarioId { get; set; }

    // ── Estorno ───────────────────────────────────────────────────────────────
    // Venda não se apaga: se foi lançada errada, é estornada e some das contas, mas
    // continua no extrato com o motivo. Toda leitura do financeiro filtra CanceladaEm.

    /// <summary>Preenchido no estorno — null = venda vale normalmente.</summary>
    public DateTime? CanceladaEm { get; set; }

    public Guid?   CanceladaPorAdminId   { get; set; }
    public string? CanceladaPorAdminNome { get; set; }

    /// <summary>Motivo digitado pelo admin no estorno (obrigatório).</summary>
    public string? MotivoCancelamento { get; set; }

    [BsonIgnore]
    public bool Cancelada => CanceladaEm.HasValue;

    [BsonIgnore]
    public decimal TotalInReais => TotalInCents / 100m;

    [BsonIgnore]
    public decimal DiscountInReais => DiscountInCents / 100m;
}

public class VendaAvulsaItem
{
    public Guid    ProductId        { get; set; }
    public string  ProductName      { get; set; } = string.Empty;
    public string? ProductCategory  { get; set; }
    public int     Quantity         { get; set; }
    public int     UnitPriceInCents { get; set; }
    public int     SubtotalInCents  { get; set; }
    public int     UnitCostInCents  { get; set; }

    /// <summary>ID da variante escolhida (tamanho/cor). Null para produtos sem grade.</summary>
    public Guid?   VariantId    { get; set; }
    /// <summary>Snapshot do label da variante, ex: "M / Preto".</summary>
    public string? VariantLabel { get; set; }

    [BsonIgnore]
    public decimal SubtotalInReais => SubtotalInCents / 100m;
    [BsonIgnore]
    public decimal TotalCostInReais => UnitCostInCents * Quantity / 100m;
}

/// <summary>Constantes de forma de pagamento aceitas no sistema.</summary>
public static class PaymentMethod
{
    public const string Pix           = "Pix";
    public const string Dinheiro      = "Dinheiro";
    public const string CartaoCredito = "CartaoCredito";
    public const string CartaoDebito  = "CartaoDebito";
    public const string Crediario     = "Crediario";
    public const string Pontos        = "Pontos";
    public const string Cashback      = "Cashback";

    public static readonly string[] All = [Pix, Dinheiro, CartaoCredito, CartaoDebito, Crediario, Pontos, Cashback];
    public static bool IsValid(string? method) => All.Contains(method);
}
