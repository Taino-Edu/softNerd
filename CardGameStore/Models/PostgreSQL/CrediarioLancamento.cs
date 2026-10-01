// =============================================================================
// CrediarioLancamento.cs — Cada compra que entrou numa conta de crediário
// Uma conta pode acumular várias compras (comanda, venda no balcão, lançamento
// manual). Antes os itens de todas viravam uma lista corrida no ItensJson da
// conta e ninguém sabia o que era de qual compra — nem o estorno, que só achava
// a comanda que ABRIU a conta. Aqui cada compra tem seu valor, seus itens e o
// vínculo com a origem, e o estorno baixa exatamente o que aquela compra somou.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("crediario_lancamentos")]
public class CrediarioLancamento
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("crediario_id")]
    public Guid CrediarioId { get; set; }

    [ForeignKey(nameof(CrediarioId))]
    public Crediario Crediario { get; set; } = null!;

    [Required]
    [Column("origem")]
    public CrediarioLancamentoOrigem Origem { get; set; }

    /// <summary>Comanda que gerou a compra (Origem = Comanda). Sem FK: é só a pista pro estorno.</summary>
    [Column("comanda_id")]
    public Guid? ComandaId { get; set; }

    /// <summary>Venda do balcão que gerou a compra (Origem = VendaAvulsa) — id do MongoDB.</summary>
    [MaxLength(50)]
    [Column("venda_avulsa_id")]
    public string? VendaAvulsaId { get; set; }

    /// <summary>Quanto esta compra somou na dívida, em centavos (já líquido de desconto e split).</summary>
    [Column("valor_em_centavos")]
    public int ValorEmCentavos { get; set; }

    /// <summary>Snapshot JSON dos itens (List&lt;ItemCrediarioDto&gt;).</summary>
    [Column("itens_json", TypeName = "text")]
    public string? ItensJson { get; set; }

    [MaxLength(500)]
    [Column("descricao")]
    public string? Descricao { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Preenchido quando a comanda/venda de origem foi estornada — o valor já saiu da conta.</summary>
    [Column("estornado_em")]
    public DateTime? EstornadoEm { get; set; }
}

public enum CrediarioLancamentoOrigem
{
    Comanda,
    VendaAvulsa,
    Manual,
    /// <summary>Itens adicionados à mão pelo admin na edição da conta.</summary>
    Ajuste,
    /// <summary>Conta anterior à separação por compra: tudo que já estava acumulado vira um bloco só.</summary>
    Legado,
}
