// =============================================================================
// IAuthService.cs — Interface do serviço de Autenticação
// =============================================================================

using CardGameStore.DTOs;

namespace CardGameStore.Services.Interfaces;

/// <summary>Contrato para autenticação, geração e renovação de tokens JWT.</summary>
public interface IAuthService
{
    /// <summary>Login completo (Admin / jogadores de campeonato).</summary>
    /// <param name="dispositivo">Cookie de dispositivo conhecido: nele a conta não fica travada por senha errada.</param>
    Task<AuthResponse> LoginAsync(LoginRequest request, string? dispositivo = null);

    /// <summary>
    /// Login rápido via QR Code (Customer).
    /// Cria o usuário se ainda não existir (baseado no CPF).
    /// </summary>
    Task<AuthResponse> QuickLoginAsync(QuickLoginRequest request);

    /// <summary>Renova o AccessToken usando o RefreshToken armazenado.</summary>
    Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request);

    /// <summary>
    /// Encerra a sessão. Com <paramref name="refreshToken"/> derruba só o dispositivo
    /// atual (sair no celular não desloga o PDV); sem ele, derruba todas.
    /// </summary>
    Task LogoutAsync(Guid userId, string? refreshToken = null);

    /// <summary>
    /// Gera token de reset, persiste no banco e dispara email.
    /// Não revela se o email existe (evita user enumeration).
    /// </summary>
    Task ForgotPasswordAsync(ForgotPasswordRequest request);

    /// <summary>Valida o token e redefine a senha.</summary>
    Task ResetPasswordAsync(ResetPasswordRequest request);

    /// <summary>Busca cliente por CPF — retorna nome e se já tem senha.</summary>
    Task<CpfLookupResponse> LookupByCpfAsync(string cpf);

    /// <summary>Ativa conta de cliente existente: define email + senha.</summary>
    Task<AuthResponse> SetupAccountAsync(SetupAccountRequest request);

    /// <summary>Login de cliente pelo site (email + senha).</summary>
    Task<AuthResponse> ClientLoginAsync(ClientLoginRequest request, string? dispositivo = null);

    /// <summary>Entrar com Google (Services/Implementations/LoginGoogle.cs). Cria ou liga a conta pelo e-mail verificado.</summary>
    Task<AuthResponse> LoginGoogleAsync(LoginGoogleRequest request);

    /// <summary>Conta do Google completa WhatsApp (obrigatório) e CPF (opcional).</summary>
    Task CompletarCadastroGoogleAsync(Guid userId, CompletarCadastroGoogleRequest request);

    /// <summary>Client ID público do Google, ou null se o login com Google está desligado.</summary>
    string? GoogleClientId { get; }

    /// <summary>Cria uma conta nova de cliente pelo site, sem depender de CPF pré-cadastrado.</summary>
    Task<AuthResponse> RegisterAsync(RegisterRequest request);

    /// <summary>Completa o perfil da conta logada (semi-criada de quick-login ganha e-mail + senha).</summary>
    Task CompleteProfileAsync(Guid userId, CompleteProfileRequest request);
}
