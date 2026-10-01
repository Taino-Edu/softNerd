// =============================================================================
// Crediario.cs — Entidade de Crediário (PostgreSQL)
// Uma conta de dívida do cliente. Nasce no fechamento de comanda, na venda do
// balcão ou no cadastro manual; o cliente pode ter várias contas abertas, cada
// uma com seu prazo. As compras que entram nela ficam em CrediarioLancamento.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("crediarios")]
public class Crediario
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Usuário ───────────────────────────────────────────────────────────────

    [Required]
    [Column("user_id")]
    public Guid UserId { get; set; }

    [ForeignKey(nameof(UserId))]
    public User User { get; set; } = null!;

    // ── Comanda de origem ─────────────────────────────────────────────────────

    /// <summary>Null para crediários criados manualmente (dívidas anteriores ao sistema).</summary>
    [Column("comanda_id")]
    public Guid? ComandaId { get; set; }

    [ForeignKey(nameof(ComandaId))]
    public Comanda? Comanda { get; set; }

    // ── Valor e datas ─────────────────────────────────────────────────────────

    /// <summary>Valor total a ser pago, em centavos (copiado do total da comanda).</summary>
    [Column("valor_em_centavos")]
    public int ValorEmCentavos { get; set; }

    /// <summary>Soma de todos os pagamentos parciais registrados, em centavos.</summary>
    [Column("valor_pago_em_centavos")]
    public int ValorPagoEmCentavos { get; set; } = 0;

    [Column("data_abertura")]
    public DateTime DataAbertura { get; set; } = DateTime.UtcNow;

    /// <summary>Vencimento automático: DataAbertura + 30 dias.</summary>
    [Column("data_vencimento")]
    public DateTime DataVencimento { get; set; }

    /// <summary>Preenchido quando o Admin marca como pago.</summary>
    [Column("data_pagamento")]
    public DateTime? DataPagamento { get; set; }

    // ── Status ────────────────────────────────────────────────────────────────

    [Required]
    [Column("status")]
    public CrediariosStatus Status { get; set; } = CrediariosStatus.Aberto;

    // ── Observações e responsáveis ────────────────────────────────────────────

    [MaxLength(500)]
    [Column("observacao")]
    public string? Observacao { get; set; }

    /// <summary>Admin que criou o crediário (fechou a comanda).</summary>
    [Column("aberto_por_admin_id")]
    public Guid AbertoPorAdminId { get; set; }

    /// <summary>Admin que registrou o pagamento.</summary>
    [Column("pago_por_admin_id")]
    public Guid? PagoPorAdminId { get; set; }

    // ── Itens (legado) ────────────────────────────────────────────────────────

    /// <summary>
    /// LEGADO — lista corrida de itens de todas as compras da conta. Não é mais
    /// escrito: os itens moram em cada CrediarioLancamento. Só é lido pela migração
    /// que converte as contas antigas em lançamentos.
    /// </summary>
    [Column("itens_json", TypeName = "text")]
    public string? ItensJson { get; set; }

    // ── Compras e pagamentos ──────────────────────────────────────────────────

    /// <summary>Cada compra que entrou nesta conta (ver CrediarioLancamento).</summary>
    public ICollection<CrediarioLancamento> Lancamentos { get; set; } = new List<CrediarioLancamento>();

    public ICollection<PagamentoCrediario> Pagamentos { get; set; } = new List<PagamentoCrediario>();

    // ── Calculado ─────────────────────────────────────────────────────────────

    [NotMapped]
    public decimal ValorEmReais => ValorEmCentavos / 100m;

    [NotMapped]
    public decimal ValorPagoEmReais => ValorPagoEmCentavos / 100m;

    [NotMapped]
    public int SaldoRestanteEmCentavos => Math.Max(0, ValorEmCentavos - ValorPagoEmCentavos);

    [NotMapped]
    public decimal SaldoRestanteEmReais => SaldoRestanteEmCentavos / 100m;

    /// <summary>True se está Aberto e já passou do vencimento.</summary>
    [NotMapped]
    public bool Vencido => Status == CrediariosStatus.Aberto && DataVencimento < DateTime.UtcNow;
}

public enum CrediariosStatus
{
    Aberto,
    Pago
}
