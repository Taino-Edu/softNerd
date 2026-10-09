using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Perfil de operador criado pelo Admin.
/// Define um conjunto nomeado de permissões que pode ser atribuído a usuários Operator.
/// </summary>
[Table("perfis")]
public class Perfil
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Nome livre dado pelo Admin (ex: "Caixa", "Estoquista", "Gerente").</summary>
    [Required, MaxLength(100)]
    [Column("nome")]
    public string Nome { get; set; } = string.Empty;

    /// <summary>JSON array de chaves de permissão (ex: ["pdv","comandas","estoque"]).</summary>
    [Required]
    [Column("permissoes_json")]
    public string PermissoesJson { get; set; } = "[]";

    [Column("criado_por_admin_id")]
    public Guid CriadoPorAdminId { get; set; }

    [Column("criado_em")]
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;

    [Column("atualizado_em")]
    public DateTime AtualizadoEm { get; set; } = DateTime.UtcNow;

    public ICollection<User> Users { get; set; } = new List<User>();
}

/// <summary>Todas as permissões disponíveis no sistema.</summary>
public static class Permissao
{
    public const string Dashboard   = "dashboard";
    public const string Pdv         = "pdv";
    public const string Comandas    = "comandas";
    public const string Estoque     = "estoque";
    public const string Categorias  = "categorias";
    public const string Usuarios    = "usuarios";
    public const string Crediario   = "crediario";
    public const string Campeonatos = "campeonatos";
    public const string Financeiro  = "financeiro";
    public const string Relatorios  = "relatorios";
    public const string Anuncios    = "anuncios";
    public const string Cartas      = "cartas";
    public const string QrCodes     = "qrcodes";
    public const string Lgpd        = "lgpd";

    public static readonly string[] Todos = [
        Dashboard, Pdv, Comandas, Estoque, Categorias,
        Usuarios, Crediario, Campeonatos, Financeiro,
        Relatorios, Anuncios, Cartas, QrCodes, Lgpd,
    ];

    /// <summary>Mapeamento de permissão → prefixos de rota da API que ela protege.</summary>
    public static readonly Dictionary<string, string[]> RotasPrefixo = new()
    {
        [Dashboard]   = ["/api/analytics", "/api/relatorios/dashboard"],
        [Pdv]         = ["/api/venda-avulsa"],
        [Comandas]    = ["/api/comanda"],
        [Estoque]     = ["/api/product"],
        [Categorias]  = ["/api/category"],
        [Usuarios]    = ["/api/user"],
        [Crediario]   = ["/api/crediarios"],
        [Campeonatos] = ["/api/championship", "/api/timers"],
        [Financeiro]  = ["/api/analytics/financeiro", "/api/relatorios/financeiro", "/api/relatorios/pdv"],
        [Relatorios]  = ["/api/relatorios"],
        [Anuncios]    = ["/api/announcements"],
        [Cartas]      = ["/api/tcg"],
        [QrCodes]     = ["/api/qrcode"],
        [Lgpd]        = ["/api/lgpd", "/api/audit"],
    };

    /// <summary>
    /// Rotas de telas que já estavam no menu do operador mas ficaram fora do mapa acima
    /// (davam 403 até a v1.41.0). Só valem com a chave "operador-acesso-pelo-menu" ligada;
    /// quando a chave for apagada, juntar com RotasPrefixo.
    /// </summary>
    public static readonly Dictionary<string, string[]> RotasPrefixoDesdeV141 = new()
    {
        [Estoque]     = ["/api/reservations", "/api/marketplace", "/api/upload"],
        [Campeonatos] = ["/api/liga-mensal", "/api/torneios", "/api/deck"],
        [Anuncios]    = ["/api/admin/mensageria", "/api/upload"],
        [Financeiro]  = ["/api/contas-receber"],
    };

    /// <summary>O operador com estas permissões pode chamar esta rota de admin?</summary>
    public static bool OperadorPode(IReadOnlyCollection<string> permissoes, string path, bool comRotasDesdeV141)
    {
        var mapas = comRotasDesdeV141 ? new[] { RotasPrefixo, RotasPrefixoDesdeV141 } : new[] { RotasPrefixo };
        return mapas.Any(mapa => mapa.Any(par =>
            permissoes.Contains(par.Key) && par.Value.Any(prefixo => path.StartsWith(prefixo, StringComparison.OrdinalIgnoreCase))));
    }
}
