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
    /// Se true, NÃO valida nem decrementa estoque — usado na homologação de pré-venda,
    /// onde o estoque já foi baixado no ato da reserva (a venda só registra a saída).
    /// Uso interno do backend; o PDV nunca envia.
    /// </summary>
    public bool SkipStockDecrement { get; set; } = false;

    /// <summary>"Reserva" quando vem da homologação de um pedido do site. Uso interno do
    /// backend; o PDV nunca envia — fica null pra venda de balcão comum.</summary>
    public string? Origem { get; set; }

    /// <summary>Id da ProductReservation de origem, quando Origem == "Reserva".</summary>
    public Guid? ReservationId { get; set; }

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
