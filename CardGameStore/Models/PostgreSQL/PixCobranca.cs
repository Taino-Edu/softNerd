// =============================================================================
// PixCobranca.cs — Cobrança Pix imediata emitida via API do Inter (PostgreSQL)
// Pode se originar de um Crediário, uma Comanda ou uma Venda Avulsa (Origem +
// FKs opcionais, mesmo padrão de multi-origem usado em NotaFiscalEmitida).
// Consultada sob demanda pelo Admin para saber se o cliente já pagou
// (sem webhook — polling manual).
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

public enum PixCobrancaOrigem
{
    Crediario,
    Comanda,
    VendaAvulsa,
    Campeonato,
    Reserva,
}

[Table("pix_cobrancas")]
public class PixCobranca
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("origem")]
    public PixCobrancaOrigem Origem { get; set; }

    /// <summary>Preenchido quando Origem = Crediario.</summary>
    [Column("crediario_id")]
    public Guid? CrediarioId { get; set; }

    [ForeignKey(nameof(CrediarioId))]
    public Crediario? Crediario { get; set; }

    /// <summary>Preenchido quando Origem = Comanda.</summary>
    [Column("comanda_id")]
    public Guid? ComandaId { get; set; }

    [ForeignKey(nameof(ComandaId))]
    public Comanda? Comanda { get; set; }

    /// <summary>Preenchido quando Origem = VendaAvulsa (id do documento MongoDB — sem FK relacional).</summary>
    [MaxLength(50)]
    [Column("venda_avulsa_id")]
    public string? VendaAvulsaId { get; set; }

    /// <summary>Preenchido quando Origem = Campeonato (taxa de inscrição do participante).</summary>
    [Column("championship_participant_id")]
    public Guid? ChampionshipParticipantId { get; set; }

    [ForeignKey(nameof(ChampionshipParticipantId))]
    public ChampionshipParticipant? ChampionshipParticipant { get; set; }

    /// <summary>
    /// Preenchido quando Origem = Reserva — correlaciona com ProductReservation.ReservationGroupId.
    /// Sem FK relacional de verdade (ReservationGroupId não é PK de nenhuma tabela própria, é só um
    /// Guid compartilhado entre as linhas do carrinho de reserva), mesmo espírito do VendaAvulsaId.
    /// </summary>
    [Column("reservation_group_id")]
    public Guid? ReservationGroupId { get; set; }

    /// <summary>
    /// Snapshot (JSON array de Guids) dos itens de pré-venda cobrados nesta cobrança,
    /// gravado no momento da geração (Origem = Reserva). A baixa só quita itens que
    /// estão neste snapshot E continuam ativos: item que entra no grupo depois (fila
    /// legada convertida) não sai "pago de graça", e item cancelado depois da geração
    /// é sinalizado no lançamento financeiro em vez de baixado.
    /// Null em cobranças antigas → a baixa usa o comportamento legado (grupo inteiro).
    /// </summary>
    [Column("reservation_item_ids", TypeName = "text")]
    public string? ReservationItemIdsJson { get; set; }

    /// <summary>Identificador único da transação Pix (gerado por nós, enviado ao Inter).</summary>
    [Required, MaxLength(35)]
    [Column("tx_id")]
    public string TxId { get; set; } = "";

    [Column("valor_em_centavos")]
    public int ValorEmCentavos { get; set; }

    /// <summary>ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP</summary>
    [Required, MaxLength(40)]
    [Column("status")]
    public string Status { get; set; } = "ATIVA";

    /// <summary>Código "Pix Copia e Cola" (BR Code) para o cliente pagar.</summary>
    [Column("pix_copia_cola", TypeName = "text")]
    public string? PixCopiaCola { get; set; }

    /// <summary>Imagem do QR Code em base64 (data URI), pronta pra exibir num &lt;img&gt;.</summary>
    [Column("imagem_qrcode", TypeName = "text")]
    public string? ImagemQrCode { get; set; }

    [MaxLength(200)]
    [Column("nome_devedor")]
    public string? NomeDevedor { get; set; }

    [Column("criado_por_admin_id")]
    public Guid CriadoPorAdminId { get; set; }

    [Column("criado_em")]
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;

    [Column("expira_em")]
    public DateTime? ExpiraEm { get; set; }

    [Column("pago_em")]
    public DateTime? PagoEm { get; set; }

    [NotMapped]
    public decimal ValorEmReais => ValorEmCentavos / 100m;
}
