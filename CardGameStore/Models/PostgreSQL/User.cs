// =============================================================================
// User.cs — Entidade de Usuário (PostgreSQL)
// Suporta dois perfis: Admin (Maikon) e Customer (clientes da loja)
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Representa um usuário do sistema.
/// Admin = dono da loja (Maikon), com acesso total ao painel.
/// Customer = cliente que entra via QR Code com login simplificado.
/// </summary>
[Table("users")]
public class User
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // -------------------------------------------------------------------------
    // Dados básicos — preenchidos por todos os usuários
    // -------------------------------------------------------------------------

    /// <summary>Nome completo do usuário.</summary>
    [Required, MaxLength(150)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// E-mail: obrigatório para Admin e para registro em Campeonatos.
    /// Para o login rápido de Customer, pode ser nulo.
    /// </summary>
    [MaxLength(255)]
    [Column("email")]
    public string? Email { get; set; }

    /// <summary>Senha com hash BCrypt. Nula para clientes de login rápido.</summary>
    [Column("password_hash")]
    public string? PasswordHash { get; set; }

    // -------------------------------------------------------------------------
    // Dados do cliente (login rápido via QR Code)
    // -------------------------------------------------------------------------

    /// <summary>WhatsApp do cliente (formato: 5511999999999).</summary>
    [MaxLength(20)]
    [Column("whatsapp")]
    public string? WhatsApp { get; set; }

    /// <summary>CPF do cliente (armazenado sem formatação: 11 dígitos).</summary>
    [MaxLength(11)]
    [Column("cpf")]
    public string? Cpf { get; set; }

    /// <summary>URL da foto de perfil do usuário (avatar).</summary>
    [MaxLength(500)]
    [Column("profile_image_url")]
    public string? ProfileImageUrl { get; set; }

    // -------------------------------------------------------------------------
    // Controle de acesso
    // -------------------------------------------------------------------------

    /// <summary>
    /// Perfil RBAC. Valores válidos: "Admin" | "Customer"
    /// Use a enum UserRole para evitar strings mágicas no código.
    /// </summary>
    [Required, MaxLength(20)]
    [Column("role")]
    public string Role { get; set; } = UserRole.Customer;

    // -------------------------------------------------------------------------
    // "Lembre-se de mim" — Refresh Token
    // -------------------------------------------------------------------------

    /// <summary>Token opaco usado para renovar o JWT sem novo login.</summary>
    [Column("refresh_token")]
    public string? RefreshToken { get; set; }

    /// <summary>Data de expiração do refresh token.</summary>
    [Column("refresh_token_expiry")]
    public DateTime? RefreshTokenExpiry { get; set; }

    // -------------------------------------------------------------------------
    // Recuperação de senha
    // -------------------------------------------------------------------------

    /// <summary>Token de uso único para redefinição de senha (2h de validade).</summary>
    [Column("password_reset_token")]
    public string? PasswordResetToken { get; set; }

    [Column("password_reset_token_expiry")]
    public DateTime? PasswordResetTokenExpiry { get; set; }

    /// <summary>Id da conta Google ligada ("sub" do token). Null = nunca entrou com Google.</summary>
    [MaxLength(64)]
    [Column("google_sub")]
    public string? GoogleSub { get; set; }

    /// <summary>Senhas erradas seguidas (zera ao acertar). Services/Implementations/ProtecaoLogin.cs.</summary>
    [Column("falhas_login")]
    public int FalhasLogin { get; set; }

    /// <summary>Até quando o login com senha está travado pra aparelhos desconhecidos.</summary>
    [Column("login_bloqueado_ate")]
    public DateTime? LoginBloqueadoAte { get; set; }

    // -------------------------------------------------------------------------
    // Sistema de Pontos
    // -------------------------------------------------------------------------

    /// <summary>Saldo de pontos do cliente. Pontos são adicionados pelo Admin.</summary>
    [Column("points_balance")]
    public int PointsBalance { get; set; } = 0;

    /// <summary>Data de expiração dos pontos (30 dias após a última adição).</summary>
    [Column("points_expires_at")]
    public DateTime? PointsExpiresAt { get; set; }

    // -------------------------------------------------------------------------
    // Sistema de Saldo Monetário
    // -------------------------------------------------------------------------

    /// <summary>
    /// Saldo monetário em centavos (crédito na loja, separado dos pontos).
    /// Pode ser carregado pelo Admin e usado no fechamento de comandas.
    /// </summary>
    [Column("balance_in_cents")]
    public int BalanceInCents { get; set; } = 0;

    /// <summary>Saldo em reais para exibição.</summary>
    [NotMapped]
    public decimal BalanceInReais => BalanceInCents / 100m;

    // -------------------------------------------------------------------------
    // Preferências do usuário (JSON livre)
    // -------------------------------------------------------------------------

    /// <summary>Configurações pessoais salvas como JSON (botão IA, sons, desconto padrão, etc.).</summary>
    [Column("preferences_json")]
    public string? PreferencesJson { get; set; }

    // -------------------------------------------------------------------------
    // Auditoria
    // -------------------------------------------------------------------------

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    // -------------------------------------------------------------------------
    // LGPD — Ciclo de vida e consentimento
    // -------------------------------------------------------------------------

    /// <summary>
    /// Data em que o titular foi anonimizado (exclusão lógica por LGPD).
    /// Null enquanto a conta está ativa.
    /// </summary>
    [Column("deleted_at")]
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Data em que o titular deu consentimento explícito ao uso de seus dados.
    /// Registrado no primeiro quick-login com checkbox de consentimento marcado.
    /// </summary>
    [Column("consent_at")]
    public DateTime? ConsentAt { get; set; }

    // -------------------------------------------------------------------------
    // Navegação (relacionamentos)
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Perfil de operador (apenas para Role == Operator)
    // -------------------------------------------------------------------------

    /// <summary>Perfil de permissões atribuído pelo Admin. Nulo para Admin e Customer.</summary>
    [Column("perfil_id")]
    public Guid? PerfilId { get; set; }

    [ForeignKey(nameof(PerfilId))]
    public Perfil? Perfil { get; set; }

    // -------------------------------------------------------------------------
    // Navegação (relacionamentos)
    // -------------------------------------------------------------------------

    /// <summary>Comandas abertas ou históricas deste usuário.</summary>
    public ICollection<Comanda> Comandas { get; set; } = new List<Comanda>();

    /// <summary>Participações em campeonatos.</summary>
    public ICollection<ChampionshipParticipant> ChampionshipParticipants { get; set; } = new List<ChampionshipParticipant>();
}

/// <summary>
/// Constantes de perfil para evitar strings mágicas no código.
/// Exemplo de uso: user.Role = UserRole.Admin
/// </summary>
public static class UserRole
{
    public const string Admin    = "Admin";
    public const string Operator = "Operator";
    public const string Customer = "Customer";
}
