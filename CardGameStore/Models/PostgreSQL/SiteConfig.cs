// =============================================================================
// SiteConfig.cs — Personalização da landing page (nome, textos, cores)
// Singleton lógico: uma única linha representa a configuração da loja.
// Todo campo tem um default igual ao valor hardcoded original da landing —
// enquanto o admin não mexe em nada, o site continua idêntico a hoje.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("site_config")]
public class SiteConfig
{
    public static readonly Guid SingletonId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Key]
    [Column("id")]
    public Guid Id { get; set; } = SingletonId;

    // ── Identidade ───────────────────────────────────────────────────────────
    [Required, MaxLength(100)]
    [Column("site_name")]
    public string SiteName { get; set; } = "Santuário Nerd";

    [MaxLength(400)]
    [Column("hero_subtitle")]
    public string HeroSubtitle { get; set; } =
        "Produtos, torneios e a melhor experiência TCG da região. Acumule pontos, compre na mesa e participe de campeonatos.";

    [MaxLength(150)]
    [Column("address_line")]
    public string AddressLine { get; set; } = "José Bonifácio — SP";

    /// <summary>Nome da pessoa de contato (ex: dono da loja) — usado em textos tipo "Falar com o
    /// {nome}" ou "{nome} vai confirmar...". Separado do nome do site de propósito: um é a marca,
    /// o outro é quem atende no WhatsApp/balcão.</summary>
    [MaxLength(60)]
    [Column("contact_person_name")]
    public string ContactPersonName { get; set; } = "Maikon";

    // ── Identidade visual (upload via /api/upload/image) ───────────────────────
    /// <summary>URL da logo da loja. Vazio = navbar continua mostrando só o nome em texto.</summary>
    [MaxLength(300)]
    [Column("logo_url")]
    public string? LogoUrl { get; set; }

    /// <summary>URL do favicon do site. Vazio = usa o ícone genérico padrão.</summary>
    [MaxLength(300)]
    [Column("favicon_url")]
    public string? FaviconUrl { get; set; }

    /// <summary>URL do ícone do PWA (instalar como app). Vazio = usa o ícone genérico padrão.</summary>
    [MaxLength(300)]
    [Column("pwa_icon_url")]
    public string? PwaIconUrl { get; set; }

    /// <summary>URL do ícone exibido no painel admin. Vazio = usa LogoUrl.</summary>
    [MaxLength(300)]
    [Column("admin_icon_url")]
    public string? AdminIconUrl { get; set; }

    // ── Contato ──────────────────────────────────────────────────────────────
    [MaxLength(20)]
    [Column("whatsapp_number")]
    public string WhatsappNumber { get; set; } = "5517997633103";

    [MaxLength(150)]
    [Column("contact_email")]
    public string ContactEmail { get; set; } = "santuarionerd@gmail.com";

    // ── Textos da navbar ─────────────────────────────────────────────────────
    [MaxLength(40)]
    [Column("nav_torneios_label")]
    public string NavTorneiosLabel { get; set; } = "Torneios";

    [MaxLength(40)]
    [Column("nav_produtos_label")]
    public string NavProdutosLabel { get; set; } = "Produtos";

    [MaxLength(40)]
    [Column("nav_mercado_label")]
    public string NavMercadoLabel { get; set; } = "Mercado de Cartas";

    [MaxLength(40)]
    [Column("nav_pontos_label")]
    public string NavPontosLabel { get; set; } = "Pontos";

    [MaxLength(40)]
    [Column("cta_ver_eventos_label")]
    public string CtaVerEventosLabel { get; set; } = "Ver Eventos";

    [MaxLength(40)]
    [Column("cta_ver_torneios_label")]
    public string CtaVerTorneiosLabel { get; set; } = "Ver Torneios";

    [MaxLength(40)]
    [Column("cta_ver_produtos_label")]
    public string CtaVerProdutosLabel { get; set; } = "Ver Produtos";

    // ── Textos das seções ────────────────────────────────────────────────────
    [MaxLength(60)]
    [Column("torneios_eyebrow")]
    public string TorneiosEyebrow { get; set; } = "Agenda";

    [MaxLength(80)]
    [Column("torneios_title")]
    public string TorneiosTitle { get; set; } = "Próximos Torneios";

    [MaxLength(60)]
    [Column("produtos_eyebrow")]
    public string ProdutosEyebrow { get; set; } = "Vitrine";

    [MaxLength(80)]
    [Column("produtos_title")]
    public string ProdutosTitle { get; set; } = "Em Destaque";

    [MaxLength(60)]
    [Column("pontos_eyebrow")]
    public string PontosEyebrow { get; set; } = "Programa de Fidelidade";

    [MaxLength(80)]
    [Column("pontos_title")]
    public string PontosTitle { get; set; } = "Ganhe pontos a cada visita";

    [MaxLength(400)]
    [Column("pontos_paragraph")]
    public string PontosParagraph { get; set; } =
        "Acumule pontos nas suas compras e troque por descontos. Só com CPF e WhatsApp — nada de senha ou aplicativo.";

    // ── Cores ────────────────────────────────────────────────────────────────
    [MaxLength(9)]
    [Column("color_primary")]
    public string ColorPrimary { get; set; } = "#3EC2F2";

    [MaxLength(9)]
    [Column("color_accent")]
    public string ColorAccent { get; set; } = "#FFE45E";

    [MaxLength(9)]
    [Column("color_navy")]
    public string ColorNavy { get; set; } = "#0C3D5A";

    /// <summary>Fundo da landing page — só afeta o tema claro (o tema escuro mantém a paleta
    /// própria dele, é uma escolha de tema, não de marca).</summary>
    [MaxLength(9)]
    [Column("color_background")]
    public string ColorBackground { get; set; } = "#EBF7FD";

    /// <summary>Fundo dos cards/caixas (produto, torneio, etc.) na landing page — só tema claro.</summary>
    [MaxLength(9)]
    [Column("color_card")]
    public string ColorCard { get; set; } = "#FFFFFF";

    /// <summary>
    /// Estilo de arredondamento dos cantos (cards, botões, imagens) da landing page.
    /// "Padrao" preserva o visual atual (zero mudança até o admin trocar) — as opções mais
    /// arredondadas existem porque o Maikon pediu um visual "fofo, redondo".
    /// Valores aceitos: Padrao | Suave | MuitoArredondado.
    /// </summary>
    [MaxLength(20)]
    [Column("border_radius_style")]
    public string BorderRadiusStyle { get; set; } = "Padrao";

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
