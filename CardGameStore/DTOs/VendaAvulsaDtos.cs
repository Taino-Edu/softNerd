using System.ComponentModel.DataAnnotations;
using CardGameStore.Models.MongoDB;

namespace CardGameStore.DTOs;

public class VendaAvulsaRequest
{
    [MaxLength(150)]
    public string? ClientName { get; set; }

    /// <summary>
    /// ID do cliente cadastrado. Obrigatório para Crediario, Pontos e Cashback.
    /// </summary>
    public Guid? UserId { get; set; }

    [Required]
    public string PaymentMethod { get; set; } = Models.MongoDB.PaymentMethod.Pix;

    [Range(0, 100)]
    public int DiscountPercent { get; set; } = 0;

    /// <summary>Se preenchido, sobrepõe DiscountPercent — desconto direto em centavos.</summary>
    [Range(0, int.MaxValue)]
    public int? DiscountInCents { get; set; }

    [Required, MinLength(1)]
    public List<VendaAvulsaItemRequest> Items { get; set; } = new();

    public string? SecondPaymentMethod { get; set; }

    [Range(0, int.MaxValue)]
    public int SecondPaymentAmountInCents { get; set; } = 0;

    /// <summary>Se true, emite a NFC-e desta venda automaticamente. Ver CloseComandaRequest.EmitirNotaFiscal.</summary>
    public bool EmitirNotaFiscal { get; set; } = false;

    /// <summary>
    /// Conta de crediário onde lançar a venda, quando o cliente tem mais de uma aberta.
    /// Null + AbrirNovoCrediario=false mantém o comportamento antigo (acumula na conta
    /// aberta que existir). Mesma escolha que o fechamento de comanda já oferecia.
    /// </summary>
    public Guid? CrediarioExistenteId { get; set; }

    /// <summary>Força abrir uma conta NOVA, com prazo próprio, mesmo já existindo outra aberta.</summary>
    public bool AbrirNovoCrediario { get; set; } = false;

    /// <summary>
    /// Vencimento da conta NOVA de crediário. Null = 30 dias. Ignorado quando a venda é
    /// acumulada numa conta existente — o prazo dela não muda.
    /// </summary>
    public DateTime? CrediarioVencimento { get; set; }

    /// <summary>
    /// Se true, NÃO valida nem decrementa estoque — usado na homologação de pré-venda,
    /// onde o estoque já foi baixado no ato da reserva (a venda só registra a saída).
    /// Uso interno do backend; o PDV nunca envia.
    /// </summary>
    public bool SkipStockDecrement { get; set; } = false;

    /// <summary>"Reserva" quando vem da homologação de um pedido do site. Uso interno do
    /// backend; o PDV nunca envia — fica null pra venda de balcão comum.</summary>
    public string? Origem { get; set; }

    /// <summary>Id da ProductReservation de origem, quando Origem == "Reserva".
    /// Num carrinho homologado de uma vez, é o primeiro item — quem identifica a venda
    /// inteira é o ReservationGroupId.</summary>
    public Guid? ReservationId { get; set; }

    /// <summary>Grupo (carrinho) de origem, quando Origem == "Reserva". Uma venda por grupo,
    /// mesmo que o cliente tenha reservado vários itens de uma vez.</summary>
    public Guid? ReservationGroupId { get; set; }

    /// <summary>Snapshot de Product.IsPreVenda no momento da homologação — separa "Site" de
    /// "Pré-venda" no Financeiro. Só relevante quando Origem == "Reserva".</summary>
    public bool ProductIsPreVenda { get; set; }

    public bool IsPaymentMethodValid() =>
        Models.MongoDB.PaymentMethod.IsValid(PaymentMethod) &&
        (SecondPaymentMethod == null || Models.MongoDB.PaymentMethod.IsValid(SecondPaymentMethod));
}

public class VendaAvulsaItemRequest
{
    [Required]
    public Guid  ProductId { get; set; }

    /// <summary>Preenchido quando o produto tem grade (HasVariants=true). Obrigatório nesse caso.</summary>
    public Guid? VariantId { get; set; }

    [Range(1, 999)]
    public int Quantity { get; set; } = 1;
}

public class VendaAvulsaDto
{
    public string              Id                         { get; set; } = string.Empty;
    public string?             ClientName                 { get; set; }

    /// <summary>Cliente cadastrado vinculado à venda, quando houve identificação no PDV.
    /// Null em venda de balcão anônima. Usado pelo Top Clientes pra somar o gasto do PDV
    /// ao das comandas — sem isso a venda avulsa não é atribuível a ninguém.</summary>
    public Guid?               UserId                     { get; set; }
    public string              PaymentMethod              { get; set; } = string.Empty;
    public string?             SecondPaymentMethod        { get; set; }
    public int                 SecondPaymentAmountInCents { get; set; }
    public decimal             TotalInReais               { get; set; }
    public int                 TotalInCents               => (int)(TotalInReais * 100);
    public DateTime            SoldAt                     { get; set; }
    public string              SoldByAdminName            { get; set; } = string.Empty;
    public int                 DiscountPercent            { get; set; }
    public decimal             DiscountInReais            { get; set; }
    public List<VendaAvulsaItemDto> Items                 { get; set; } = new();
    public string?              Origem                    { get; set; }
    public bool                 ProductIsPreVenda         { get; set; }

    /// <summary>Preenchidos só quando o registro pediu emissão de NFC-e (EmitirNotaFiscal=true) —
    /// permite o front abrir o cupom automaticamente quando autoriza, ou avisar o motivo se não.</summary>
    public Guid?   NotaFiscalId             { get; set; }
    public string? NotaFiscalStatus         { get; set; }
    public string? NotaFiscalMotivoRejeicao { get; set; }

    // ── Estorno ───────────────────────────────────────────────────────────────
    /// <summary>Crediário que esta venda gerou (quando o pagamento foi no crediário).</summary>
    public Guid?     CrediarioId           { get; set; }
    public bool      Cancelada             { get; set; }
    public DateTime? CanceladaEm           { get; set; }
    public string?   CanceladaPorAdminNome { get; set; }
    public string?   MotivoCancelamento    { get; set; }
}

public class EstornarVendaRequest
{
    /// <summary>Por que a venda está sendo desfeita — vai pro extrato e pra auditoria.</summary>
    [Required(ErrorMessage = "Informe o motivo do estorno."), MinLength(3), MaxLength(300)]
    public string Motivo { get; set; } = string.Empty;
}

/// <summary>Totais de PDV de um cliente dentro do recorte pedido (período + forma).</summary>
public class VendaAvulsaClienteAgregadoDto
{
    public Guid     UserId       { get; set; }
    public int      Compras      { get; set; }
    /// <summary>Já com o split alocado: numa venda filtrada por forma, entra só a parte
    /// paga naquela forma, não o total da venda.</summary>
    public long     GastoCents   { get; set; }
    public DateTime UltimaCompra { get; set; }
}

public class EditarPagamentoVendaAvulsaRequest
{
    [Required]
    public string PaymentMethod { get; set; } = Models.MongoDB.PaymentMethod.Pix;

    public string? SecondPaymentMethod { get; set; }

    [Range(0, int.MaxValue)]
    public int SecondPaymentAmountInCents { get; set; } = 0;

    /// <summary>Nome do cliente (opcional). Null = mantém o atual.</summary>
    public string? ClientName { get; set; }

    /// <summary>True para limpar o nome do cliente.</summary>
    public bool ClearClientName { get; set; } = false;

    /// <summary>Desconto em centavos (opcional). Null = mantém o atual.</summary>
    [Range(0, int.MaxValue)]
    public int? DiscountInCents { get; set; }
}

public class VendaAvulsaItemDto
{
    public string  ProductName      { get; set; } = string.Empty;
    public string? ProductCategory  { get; set; }
    public int     Quantity         { get; set; }
    public decimal UnitPriceInReais { get; set; }
    public decimal SubtotalInReais  { get; set; }
    public int     UnitCostInCents  { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Venda de balcão como o próprio cliente vê no histórico dele.
// Recorte deliberado do VendaAvulsaDto: fica de fora o custo do produto
// (UnitCostInCents), quem operou o caixa e os dados fiscais/de estorno —
// o cliente precisa saber o que comprou, quanto pagou e como pagou.
// ─────────────────────────────────────────────────────────────────────────────
public class MinhaCompraDto
{
    public string   Id                         { get; set; } = string.Empty;
    public DateTime SoldAt                     { get; set; }
    public string   PaymentMethod              { get; set; } = string.Empty;
    public string?  SecondPaymentMethod        { get; set; }
    public int      SecondPaymentAmountInCents { get; set; }
    public decimal  TotalInReais               { get; set; }
    public decimal  DiscountInReais            { get; set; }
    public List<MinhaCompraItemDto> Items      { get; set; } = new();

    /// <summary>De onde veio a compra: "Balcao", "Site" ou "PreVenda" — mesma divisão que o
    /// Financeiro usa (Origem == "Reserva" separado por ProductIsPreVenda). Sem isto o pedido
    /// feito pelo site aparecia pro cliente como compra de balcão.</summary>
    public string   Origem                     { get; set; } = "Balcao";

    /// <summary>Compra desfeita pela loja. Continua na lista, marcada — some da lista seria
    /// exatamente o oposto do que o histórico serve pra provar.</summary>
    public bool      Estornada          { get; set; }
    public DateTime? EstornadaEm        { get; set; }
    public string?   MotivoEstorno      { get; set; }
}

public class MinhaCompraItemDto
{
    public string  ProductName      { get; set; } = string.Empty;
    public int     Quantity         { get; set; }
    public decimal UnitPriceInReais { get; set; }
    public decimal SubtotalInReais  { get; set; }
}
