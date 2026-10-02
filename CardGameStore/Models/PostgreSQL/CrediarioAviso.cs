// =============================================================================
// CrediarioAviso.cs — Lembretes de vencimento do crediário
// CrediarioAvisoConfig: como e quando o robô avisa (linha única).
// CrediarioAviso: cada aviso que saiu pra uma conta — é o que impede o robô de
// mandar o mesmo lembrete duas vezes e o que o admin vê como "último aviso".
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("crediario_aviso_config")]
public class CrediarioAvisoConfig
{
    public static readonly Guid SingletonId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Key]
    [Column("id")]
    public Guid Id { get; set; } = SingletonId;

    [Column("ativo")]
    public bool Ativo { get; set; } = true;

    /// <summary>Hora (Brasília) a partir da qual o robô manda os avisos do dia.</summary>
    [Column("hora_envio")]
    public int HoraEnvio { get; set; } = 10;

    /// <summary>
    /// Dias em relação ao vencimento em que o cliente é avisado (JSON de int):
    /// negativo = antes (-3 = três dias antes), 0 = no dia, positivo = dias de atraso.
    /// </summary>
    [Column("marcos_json", TypeName = "text")]
    public string MarcosJson { get; set; } = "[-3,0,3,7,15,30]";

    /// <summary>Notificação no sininho + push no celular.</summary>
    [Column("canal_app")]
    public bool CanalApp { get; set; } = true;

    [Column("canal_email")]
    public bool CanalEmail { get; set; } = true;

    /// <summary>Desligado por padrão: mensagem automática no WhatsApp da loja é escolha do dono.</summary>
    [Column("canal_whatsapp")]
    public bool CanalWhatsApp { get; set; } = false;

    /// <summary>Resumo diário pros admins: quem vence hoje, quem está atrasado e quanto.</summary>
    [Column("resumo_admin")]
    public bool ResumoAdmin { get; set; } = true;

    /// <summary>Texto que vai no fim de toda mensagem (ex.: chave Pix da loja).</summary>
    [MaxLength(300)]
    [Column("mensagem_extra")]
    public string? MensagemExtra { get; set; }

    /// <summary>Dia (Brasília) do último resumo enviado aos admins — um por dia.</summary>
    [Column("ultimo_resumo_em")]
    public DateTime? UltimoResumoEm { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("crediario_avisos")]
public class CrediarioAviso
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("crediario_id")]
    public Guid CrediarioId { get; set; }

    [ForeignKey(nameof(CrediarioId))]
    public Crediario Crediario { get; set; } = null!;

    /// <summary>Marco que disparou o aviso (dias em relação ao vencimento). Null = enviado à mão pelo admin.</summary>
    [Column("marco")]
    public int? Marco { get; set; }

    /// <summary>
    /// Vencimento da conta quando o aviso saiu. Se o prazo for prorrogado, os marcos
    /// contam de novo a partir da data nova.
    /// </summary>
    [Column("vencimento_referencia")]
    public DateTime VencimentoReferencia { get; set; }

    /// <summary>Canais que entregaram, separados por vírgula: app, email, whatsapp.</summary>
    [MaxLength(60)]
    [Column("canais")]
    public string Canais { get; set; } = string.Empty;

    /// <summary>Canais que falharam e por quê (ex.: "whatsapp: desconectado").</summary>
    [MaxLength(500)]
    [Column("falhas")]
    public string? Falhas { get; set; }

    /// <summary>Admin que mandou à mão; null = robô.</summary>
    [Column("enviado_por_admin_id")]
    public Guid? EnviadoPorAdminId { get; set; }

    [Column("enviado_em")]
    public DateTime EnviadoEm { get; set; } = DateTime.UtcNow;
}
