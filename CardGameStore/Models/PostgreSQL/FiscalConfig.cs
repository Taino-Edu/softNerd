// =============================================================================
// FiscalConfig.cs — Configuração fiscal da loja para emissão de NFC-e
// Singleton lógico: uma única linha representa a empresa emitente (Maikon).
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

public enum RegimeTributario
{
    SimplesNacional,
    LucroPresumido,
    LucroReal
}

public enum AmbienteFiscal
{
    Homologacao,
    Producao
}

/// <summary>
/// Configuração fiscal da empresa emitente e do certificado digital A1
/// usado para assinar e transmitir NFC-e à SEFAZ via DFe.NET.
/// </summary>
[Table("fiscal_config")]
public class FiscalConfig
{
    /// <summary>
    /// ID fixo — esta tabela é um singleton lógico (uma só linha, a config da empresa emitente).
    /// Usar sempre este ID (via FindAsync) em vez de FirstOrDefaultAsync, para que a PK
    /// já rejeite qualquer segunda inserção concorrente.
    /// </summary>
    public static readonly Guid SingletonId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Key]
    [Column("id")]
    public Guid Id { get; set; } = SingletonId;

    [Required, MaxLength(18)]
    [Column("cnpj")]
    public string Cnpj { get; set; } = string.Empty;

    /// <summary>Razão social do emitente — obrigatório no XML (emit.xNome).</summary>
    [MaxLength(150)]
    [Column("razao_social")]
    public string? RazaoSocial { get; set; }

    [MaxLength(20)]
    [Column("inscricao_estadual")]
    public string? InscricaoEstadual { get; set; }

    // -------------------------------------------------------------------------
    // Endereço do estabelecimento — obrigatório no XML da NFC-e (emit.enderEmit)
    // -------------------------------------------------------------------------

    [MaxLength(150)]
    [Column("logradouro")]
    public string? Logradouro { get; set; }

    [MaxLength(20)]
    [Column("numero")]
    public string? Numero { get; set; }

    [MaxLength(100)]
    [Column("complemento")]
    public string? Complemento { get; set; }

    [MaxLength(100)]
    [Column("bairro")]
    public string? Bairro { get; set; }

    /// <summary>Código do município no padrão IBGE (7 dígitos) — exigido no XML, não o nome.</summary>
    [MaxLength(7)]
    [Column("codigo_municipio_ibge")]
    public string? CodigoMunicipioIbge { get; set; }

    [MaxLength(100)]
    [Column("municipio")]
    public string? Municipio { get; set; }

    /// <summary>Sigla da UF (ex: "SP") — convertida para o enum Estado do DFe.NET na emissão.</summary>
    [MaxLength(2)]
    [Column("uf")]
    public string? Uf { get; set; }

    [MaxLength(9)]
    [Column("cep")]
    public string? Cep { get; set; }

    /// <summary>Id do Código de Segurança do Contribuinte, cadastrado na SEFAZ — usado no QR Code da NFC-e.</summary>
    [MaxLength(10)]
    [Column("csc_id")]
    public string? CscId { get; set; }

    /// <summary>Token do CSC — nunca exposto em resposta de API, só usado internamente pra montar o QR Code.</summary>
    [MaxLength(100)]
    [Column("csc_token")]
    public string? CscToken { get; set; }

    [Column("regime_tributario")]
    public RegimeTributario RegimeTributario { get; set; } = RegimeTributario.SimplesNacional;

    [Column("ambiente")]
    public AmbienteFiscal Ambiente { get; set; } = AmbienteFiscal.Homologacao;

    /// <summary>
    /// Quando ativo, a emissão pula assinatura digital e transmissão real à SEFAZ — usado pra
    /// testar o resto do fluxo (numeração, cupom, banco) sem precisar de certificado A1
    /// configurado. A nota fica marcada como Autorizada, mas não existe pra SEFAZ nem é válida
    /// fiscalmente. Nunca deixar ativo operando com clientes de verdade.
    /// </summary>
    [Column("modo_simulacao")]
    public bool ModoSimulacao { get; set; } = false;

    [Column("serie_nfce")]
    public int SerieNfce { get; set; } = 1;

    [Column("proximo_numero_nfce")]
    public int ProximoNumeroNfce { get; set; } = 1;

    /// <summary>Email do contador — destino do ZIP mensal de XMLs autorizados/cancelados.</summary>
    [MaxLength(200)]
    [Column("email_contador")]
    public string? EmailContador { get; set; }

    /// <summary>Certificado .pfx (Base64) criptografado com EncryptionService.</summary>
    [Column("certificado_pfx_encrypted")]
    public string? CertificadoPfxEncrypted { get; set; }

    /// <summary>Senha do certificado, criptografada com EncryptionService.</summary>
    [Column("certificado_senha_encrypted")]
    public string? CertificadoSenhaEncrypted { get; set; }

    /// <summary>Data de validade (NotAfter) extraída do certificado X509 no momento do upload.</summary>
    [Column("certificado_validade")]
    public DateTime? CertificadoValidade { get; set; }

    [Column("certificado_uploaded_at")]
    public DateTime? CertificadoUploadedAt { get; set; }

    /// <summary>
    /// Menor limiar (30/15/7/1 dias) já alertado para a validade atual do certificado.
    /// Evita reenviar o mesmo alerta todo dia até o vencimento.
    /// </summary>
    [Column("certificado_ultimo_alerta_limiar")]
    public int? CertificadoUltimoAlertaLimiar { get; set; }

    /// <summary>Última vez que o ZIP mensal de XMLs foi enviado automaticamente ao contador.</summary>
    [Column("ultimo_envio_mensal_xmls")]
    public DateTime? UltimoEnvioMensalXmls { get; set; }

    /// <summary>
    /// Último NSU consumido do DFe Distribuição (notas destinadas ao CNPJ da loja).
    /// A próxima consulta continua deste ponto — nunca zerar em produção, senão a SEFAZ
    /// reenvia todo o histórico e pode bloquear por consumo indevido (cStat 656).
    /// </summary>
    [Column("dist_ultimo_nsu")]
    public long DistUltimoNsu { get; set; }

    /// <summary>
    /// Formas de pagamento (CSV: "Pix,Dinheiro,...") que emitem NFC-e automaticamente ao
    /// fechar a venda, sem perguntar. Vazio por padrão — o Maikon não quer que o sistema
    /// emita nota sem antes perguntar; o admin decide explicitamente a cada fechamento
    /// via checkbox, que só vem pré-marcado para as formas listadas aqui.
    /// </summary>
    [Column("formas_pagamento_auto_emissao")]
    public string FormasPagamentoAutoEmissao { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public bool CertificadoConfigurado => !string.IsNullOrWhiteSpace(CertificadoPfxEncrypted);
}
