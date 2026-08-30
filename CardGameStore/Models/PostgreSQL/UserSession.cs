using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

/// <summary>
/// Sessão de login — um refresh token por dispositivo/navegador.
///
/// Antes disso o refresh token morava numa única coluna do usuário: entrar no
/// celular derrubava o PDV, e duas abas renovando ao mesmo tempo derrubavam as
/// duas (a segunda chegava com o token que a primeira acabou de rotacionar).
/// Aqui cada dispositivo tem a sua linha e a rotação mantém o token antigo
/// válido por uma janela curta (<see cref="RotatedAt"/>), então corrida entre
/// abas não desloga ninguém.
/// </summary>
[Table("user_sessions")]
public class UserSession
{
    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("user_id")]
    public Guid UserId { get; set; }

    /// <summary>SHA-256 hex do refresh token. O token cru só existe no cookie HttpOnly.</summary>
    [Required, MaxLength(64)] [Column("token_hash")]
    public string TokenHash { get; set; } = string.Empty;

    [Column("expires_at")]
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// Quando este token foi trocado por um novo. Continua aceito por uma janela
    /// de graça depois disso — é o que salva a aba que perdeu a corrida.
    /// </summary>
    [Column("rotated_at")]
    public DateTime? RotatedAt { get; set; }

    /// <summary>Logout explícito nesta sessão. Não derruba os outros dispositivos.</summary>
    [Column("revoked_at")]
    public DateTime? RevokedAt { get; set; }

    /// <summary>Pra mostrar "onde você está logado" e ajudar no suporte.</summary>
    [MaxLength(300)] [Column("user_agent")]
    public string? UserAgent { get; set; }

    [MaxLength(45)] [Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("last_used_at")]
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
