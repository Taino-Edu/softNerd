// =============================================================================
// NotaFiscalEmitida.cs — Registro de NFC-e emitida (ou pendente de emissão)
// vinculada a uma Comanda ou Venda Avulsa.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

public enum NotaFiscalOrigem
{
    Comanda,
    VendaAvulsa
}

public enum NotaFiscalStatus
{
    PendenteEmissao,
    Autorizada,
    Rejeitada,
    Cancelada,

    /// <summary>Emitida em contingência offline (tpEmis=9) porque a SEFAZ estava
    /// inalcançável — já vale pro cliente (cupom liberado), mas ainda precisa ser
    /// retransmitida à SEFAZ (o retry automático faz isso) pra virar Autorizada de fato.</summary>
    AutorizadaContingencia,
}

/// <summary>
/// Uma NFC-e emitida (ou em tentativa de emissão) referente ao fechamento
/// de uma Comanda ou registro de Venda Avulsa. Guarda o XML autorizado
/// para exportação posterior ao contador.
/// </summary>
[Table("notas_fiscais_emitidas")]
public class NotaFiscalEmitida
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("origem")]
    public NotaFiscalOrigem Origem { get; set; }

    /// <summary>Id da Comanda de origem (quando Origem == Comanda).</summary>
    [Column("comanda_id")]
    public Guid? ComandaId { get; set; }

    /// <summary>ObjectId (string) da VendaAvulsa no MongoDB (quando Origem == VendaAvulsa).</summary>
    [MaxLength(50)]
    [Column("venda_avulsa_id")]
    public string? VendaAvulsaId { get; set; }

    /// <summary>Identificador da nota no motor fiscal central. Null em documentos historicos locais.</summary>
    [Column("central_fiscal_note_id")]
    public Guid? CentralFiscalNoteId { get; set; }

    /// <summary>Outbox temporaria; apagada quando o motor central aceita o snapshot.</summary>
    [Column("central_fiscal_payload_json")]
    public string? CentralFiscalPayloadJson { get; set; }

    [Column("status")]
    public NotaFiscalStatus Status { get; set; } = NotaFiscalStatus.PendenteEmissao;

    [Column("valor_total_em_centavos")]
    public int ValorTotalEmCentavos { get; set; }

    [Column("serie")]
    public int? Serie { get; set; }

    [Column("numero")]
    public int? Numero { get; set; }

    /// <summary>Chave de acesso de 44 dígitos, preenchida após autorização.</summary>
    [MaxLength(44)]
    [Column("chave_acesso")]
    public string? ChaveAcesso { get; set; }

    /// <summary>Protocolo de autorização retornado pela SEFAZ.</summary>
    [MaxLength(30)]
    [Column("protocolo")]
    public string? Protocolo { get; set; }

    [Column("motivo_rejeicao")]
    public string? MotivoRejeicao { get; set; }

    /// <summary>XML autorizado (com protNFe anexado) — usado na exportação ao contador.</summary>
    [Column("xml_autorizado")]
    public string? XmlAutorizado { get; set; }

    /// <summary>URL do QR Code (com hash do CSC), calculada pela lib fiscal no momento da
    /// autorização e persistida aqui — evita recalcular (e evita fórmula desatualizada) toda
    /// vez que o cupom é exibido.</summary>
    [Column("url_qrcode")]
    public string? UrlQrCode { get; set; }

    [Column("emitido_em")]
    public DateTime? EmitidoEm { get; set; }

    [Column("cancelado_em")]
    public DateTime? CanceladoEm { get; set; }

    /// <summary>Justificativa usada no evento de cancelamento (mín. 15 caracteres exigidos pela SEFAZ).</summary>
    [Column("justificativa_cancelamento")]
    public string? JustificativaCancelamento { get; set; }

    /// <summary>Preenchido quando o número desta nota foi formalmente inutilizado (nota rejeitada).</summary>
    [Column("inutilizado_em")]
    public DateTime? InutilizadoEm { get; set; }

    [MaxLength(30)]
    [Column("protocolo_inutilizacao")]
    public string? ProtocoloInutilizacao { get; set; }

    /// <summary>Quantas vezes o reprocessamento (manual ou automático) já foi tentado — limita retries.</summary>
    [Column("tentativas_reprocessamento")]
    public int TentativasReprocessamento { get; set; } = 0;

    // ── Contingência offline (tpEmis=9) ────────────────────────────────────────
    // Persistidos na primeira tentativa em contingência pra reconstruir a MESMA chave
    // de acesso (já mostrada ao cliente no cupom) quando a retransmissão acontecer depois
    // — cNf/dhCont/tpEmis entram na fórmula da chave, então não podem mudar entre tentativas.

    /// <summary>Código numérico aleatório (cNf) usado no cálculo da chave — fixado na
    /// primeira tentativa em contingência pra a retransmissão gerar a chave idêntica.</summary>
    [Column("cnf_contingencia")]
    public int? CnfContingencia { get; set; }

    /// <summary>Momento (UTC) em que a contingência foi acionada — vira dhCont no XML.</summary>
    [Column("dh_contingencia")]
    public DateTime? DhContingencia { get; set; }

    /// <summary>Justificativa (xJust) da entrada em contingência, exigida pela SEFAZ.</summary>
    [Column("justificativa_contingencia")]
    public string? JustificativaContingencia { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
