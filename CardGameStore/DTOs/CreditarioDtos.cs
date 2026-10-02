// =============================================================================
// CreditarioDtos.cs — DTOs do módulo de Crediário
// =============================================================================

using System.ComponentModel.DataAnnotations;

namespace CardGameStore.DTOs;

/// <summary>Resposta de um crediário (admin e cliente).</summary>
public class CrediariosDto
{
    public Guid      Id                    { get; set; }
    public Guid      UserId                { get; set; }
    public string    UserName              { get; set; } = string.Empty;
    public string?   UserEmail             { get; set; }
    public Guid?     ComandaId             { get; set; }
    public decimal   ValorEmReais          { get; set; }
    public decimal   ValorPagoEmReais      { get; set; }
    public decimal   SaldoRestanteEmReais  { get; set; }
    public DateTime  DataAbertura          { get; set; }
    public DateTime  DataVencimento        { get; set; }
    public DateTime? DataPagamento         { get; set; }
    public string    Status                { get; set; } = string.Empty;
    public string?   Observacao            { get; set; }

    /// <summary>True se Status == Aberto e DataVencimento &lt; agora.</summary>
    public bool Vencido { get; set; }

    /// <summary>Dias restantes para vencer (negativo se já venceu).</summary>
    public int DiasRestantes { get; set; }

    /// <summary>Histórico de pagamentos parciais registrados.</summary>
    public List<PagamentoCrediarioDto> Pagamentos { get; set; } = new();

    /// <summary>
    /// Quanto foi pago ACIMA do valor da conta — acontece quando um Pix antigo é pago
    /// depois de a conta já ter sido acertada por outro meio. O excedente vira crédito
    /// (cashback) do cliente.
    /// </summary>
    public decimal ValorExcedenteEmReais { get; set; }

    /// <summary>Lembretes de vencimento enviados, mais recente primeiro.</summary>
    public List<AvisoCrediarioDto> Avisos { get; set; } = new();

    /// <summary>Compras que entraram na conta, mais antiga primeiro (inclui as estornadas).</summary>
    public List<LancamentoCrediarioDto> Lancamentos { get; set; } = new();

    /// <summary>Todos os itens das compras não estornadas, em lista corrida (impressão e edição).</summary>
    public List<ItemCrediarioDto> ItensComanda { get; set; } = new();
}

/// <summary>Uma compra dentro da conta de crediário.</summary>
public class LancamentoCrediarioDto
{
    public Guid      Id            { get; set; }
    /// <summary>Comanda | VendaAvulsa | Manual | Ajuste | Legado</summary>
    public string    Origem        { get; set; } = string.Empty;
    public Guid?     ComandaId     { get; set; }
    public string?   VendaAvulsaId { get; set; }
    public string?   Descricao     { get; set; }
    public decimal   ValorEmReais  { get; set; }
    public DateTime  CreatedAt     { get; set; }
    public DateTime? EstornadoEm   { get; set; }
    public List<ItemCrediarioDto> Itens { get; set; } = new();
}

/// <summary>Item de uma compra do crediário.</summary>
public class ItemCrediarioDto
{
    /// <summary>
    /// Compra a que o item pertence. Na edição, é o que diz em qual compra o item fica;
    /// item novo (null) vai pra um bloco de ajuste manual.
    /// </summary>
    public Guid?   LancamentoId    { get; set; }
    public string  ItemName        { get; set; } = string.Empty;
    public int     Quantity        { get; set; }
    public decimal UnitPriceInReais { get; set; }
    public decimal SubtotalInReais  { get; set; }
}

/// <summary>DTO de um pagamento parcial do crediário.</summary>
public class PagamentoCrediarioDto
{
    public Guid     Id             { get; set; }
    public decimal  ValorEmReais   { get; set; }
    public string   FormaPagamento { get; set; } = string.Empty;
    public string?  Observacao     { get; set; }
    public DateTime CreatedAt      { get; set; }
}

/// <summary>Dívidas abertas de um cliente específico — usado em GET /api/crediarios/por-cliente.</summary>
public class CrediariosClienteDto
{
    public Guid     UserId            { get; set; }
    public string   UserName          { get; set; } = string.Empty;
    public string?  UserEmail         { get; set; }
    public string?  UserWhatsApp      { get; set; }
    public decimal  SaldoTotal        { get; set; }
    public int      TotalDividas      { get; set; }
    public bool     TemVencido        { get; set; }
    public DateTime ProximoVencimento { get; set; }
    public List<CrediariosDto> Dividas { get; set; } = new();
}

/// <summary>Body do endpoint POST /api/crediarios (criação manual — dívidas anteriores ao sistema).</summary>
public class CriarCrediarioManualRequest
{
    /// <summary>ID do cliente que tem a dívida.</summary>
    [Required]
    public Guid UserId { get; set; }

    /// <summary>Valor da dívida em centavos.</summary>
    [Required]
    [Range(1, int.MaxValue, ErrorMessage = "O valor deve ser maior que zero.")]
    public int ValorEmCentavos { get; set; }

    /// <summary>Observação (ex: "Dívida de torneio 12/04/2025").</summary>
    [MaxLength(500)]
    public string? Observacao { get; set; }

    /// <summary>Data de abertura da dívida. Se null, usa a data atual.</summary>
    public DateTime? DataAbertura { get; set; }

    /// <summary>Vencimento customizado. Se null, usa DataAbertura + 30 dias.</summary>
    public DateTime? DataVencimento { get; set; }

    /// <summary>
    /// Lista de itens que compõem a dívida (opcional).
    /// Vira o lançamento manual que abre a conta.
    /// </summary>
    public List<ItemCrediarioDto>? Itens { get; set; }
}

/// <summary>Body do endpoint PATCH /api/crediarios/{id} (edição de crediário em aberto).</summary>
public class EditarCrediarioRequest
{
    /// <summary>Novo valor total em centavos. Se null, mantém o atual.</summary>
    [Range(1, int.MaxValue, ErrorMessage = "O valor deve ser maior que zero.")]
    public int? ValorEmCentavos { get; set; }

    /// <summary>Nova observação. Se null, mantém a atual.</summary>
    [MaxLength(500)]
    public string? Observacao { get; set; }

    /// <summary>Nova data de vencimento. Se null, mantém a atual.</summary>
    public DateTime? DataVencimento { get; set; }

    /// <summary>
    /// Lista de itens editada manualmente pelo admin. Quando não-null, substitui os itens
    /// de cada compra pelos itens que chegaram com o LancamentoId dela; itens sem
    /// LancamentoId vão pro bloco de ajuste manual. Null = não altera itens.
    /// </summary>
    public List<ItemCrediarioDto>? Itens { get; set; }
}

/// <summary>Body do endpoint POST /api/crediarios/{id}/pagamento (pagamento parcial).</summary>
public class RegistrarPagamentoRequest
{
    /// <summary>Valor pago nesta parcela, em centavos.</summary>
    [Required]
    [Range(1, int.MaxValue, ErrorMessage = "O valor do pagamento deve ser maior que zero.")]
    public int ValorEmCentavos { get; set; }

    /// <summary>Forma de pagamento usada (Dinheiro, Pix, CartaoCredito, CartaoDebito).</summary>
    [MaxLength(50)]
    public string FormaPagamento { get; set; } = "Dinheiro";

    /// <summary>Segundo método de pagamento (split). Null = não tem split.</summary>
    [MaxLength(50)]
    public string? SecondFormaPagamento { get; set; }

    /// <summary>Valor do segundo método em centavos. Zero = sem split.</summary>
    [Range(0, int.MaxValue)]
    public int SecondValorEmCentavos { get; set; } = 0;

    /// <summary>Observação opcional.</summary>
    [MaxLength(500)]
    public string? Observacao { get; set; }
}

/// <summary>Um lembrete de vencimento que saiu pra conta.</summary>
public class AvisoCrediarioDto
{
    public DateTime     EnviadoEm  { get; set; }
    /// <summary>Dias em relação ao vencimento; null = enviado à mão.</summary>
    public int?         Marco      { get; set; }
    public bool         Automatico { get; set; }
    public List<string> Canais     { get; set; } = new();
    public string?      Falhas     { get; set; }
}

/// <summary>Configuração dos lembretes automáticos (GET/PUT /api/crediarios/avisos/config).</summary>
public class CrediarioAvisoConfigDto
{
    public bool      Ativo         { get; set; }
    [Range(6, 19, ErrorMessage = "A hora de envio vai das 6h às 19h.")]
    public int       HoraEnvio     { get; set; }
    /// <summary>Dias em relação ao vencimento: negativo = antes, 0 = no dia, positivo = atraso.</summary>
    public List<int> Marcos        { get; set; } = new();
    public bool      CanalApp      { get; set; }
    public bool      CanalEmail    { get; set; }
    public bool      CanalWhatsApp { get; set; }
    public bool      ResumoAdmin   { get; set; }
    [MaxLength(300)]
    public string?   MensagemExtra { get; set; }

    /// <summary>Somente leitura: o WhatsApp da loja está pareado agora?</summary>
    public bool      WhatsAppConectado { get; set; }
}
