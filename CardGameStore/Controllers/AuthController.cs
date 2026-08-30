// =============================================================================
// AuthController.cs — Endpoints de Autenticação
//
// POST /api/auth/login         → Login do Admin (email + senha)
// POST /api/auth/quick-login   → Login do Cliente via QR Code (CPF + WhatsApp)
// POST /api/auth/refresh       → Renovar o access token usando o refresh token
// POST /api/auth/logout        → Invalidar o refresh token (encerrar sessão)
// =============================================================================

using CardGameStore.DTOs;
using CardGameStore.Services.Interfaces;
using CardGameStore.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using CardGameStore.Configuration;
using System.Text.Json;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public class AuthController : ControllerBase
{
    private readonly IAuthService            _authService;
    private readonly ILogger<AuthController> _logger;
    private readonly JwtSettings             _jwt;
    private readonly IWebHostEnvironment     _env;
    private readonly IEmailService           _emailService;
    private readonly IAuditService           _audit;

    public AuthController(
        IAuthService        authService,
        ILogger<AuthController> logger,
        IOptions<JwtSettings>   jwt,
        IWebHostEnvironment     env,
        IEmailService       emailService,
        IAuditService       audit)
    {
        _authService  = authService;
        _logger       = logger;
        _jwt          = jwt.Value;
        _audit        = audit;
        _env          = env;
        _emailService = emailService;
    }

    // =========================================================================
    // HELPERS — Cookies HttpOnly (LGPD / Segurança)
    // =========================================================================

    /// <summary>
    /// Grava accessToken e refreshToken como cookies HttpOnly,
    /// impedindo acesso via JavaScript (proteção contra XSS).
    /// </summary>
    private void SetAuthCookies(string accessToken, string refreshToken)
    {
        // Secure = true em produção (HTTPS via Cloudflare). Em desenvolvimento HTTP local, false.
        var secureCookies = !_env.IsDevelopment();

        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure   = secureCookies,
            SameSite = SameSiteMode.Lax, // Lax permite redirecionamentos cross-page
            Path     = "/",
        };

        Response.Cookies.Append("accessToken", accessToken, new CookieOptions
        {
            HttpOnly = cookieOptions.HttpOnly,
            Secure   = cookieOptions.Secure,
            SameSite = cookieOptions.SameSite,
            Path     = cookieOptions.Path,
            MaxAge   = TimeSpan.FromMinutes(_jwt.AccessTokenExpirationMinutes)
        });

        Response.Cookies.Append("refreshToken", refreshToken, new CookieOptions
        {
            HttpOnly = cookieOptions.HttpOnly,
            Secure   = cookieOptions.Secure,
            SameSite = cookieOptions.SameSite,
            Path     = cookieOptions.Path,
            MaxAge   = TimeSpan.FromDays(_jwt.RefreshTokenExpirationDays)
        });
    }

    /// <summary>Remove os cookies de autenticação no logout.</summary>
    private void ClearAuthCookies()
    {
        // Apagar cookie exige os MESMOS atributos usados pra gravar — com Secure/SameSite
        // diferentes o browser ignora o Set-Cookie de remoção e a sessão "volta".
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure   = !_env.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path     = "/",
        };

        Response.Cookies.Delete("accessToken",  options);
        Response.Cookies.Delete("refreshToken", options);
    }

    // =========================================================================
    // LOGIN COMPLETO — Admin (email + senha)
    // =========================================================================

    /// <summary>
    /// Login com e-mail e senha. Utilizado pelo Admin (Maikon).
    /// Retorna um access token JWT (60 min) e um refresh token (30 dias).
    /// </summary>
    /// <response code="200">Login realizado com sucesso.</response>
    /// <response code="401">Credenciais inválidas.</response>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), 200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        try
        {
            var response = await _authService.LoginAsync(request);
            _logger.LogInformation("Login bem-sucedido para {Email}", request.Email);
            await _audit.LogAsync("LoginSucesso", "Auth", response.UserId.ToString(),
                details: JsonSerializer.Serialize(new { email = request.Email, role = response.Role }),
                httpContext: HttpContext);
            SetAuthCookies(response.AccessToken, response.RefreshToken);
            return Ok(new SafeAuthResponse(response.ExpiresAt, response.Role, response.UserName, response.UserId, Permissions: response.Permissions));
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning("Tentativa de login inválida para {Email}: {Msg}", request.Email, ex.Message);
            await _audit.LogAsync("LoginFalhou", "Auth", null,
                details: JsonSerializer.Serialize(new { email = request.Email, motivo = ex.Message }),
                httpContext: HttpContext);
            return Unauthorized(new { Message = "E-mail ou senha incorretos." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro inesperado no login para {Email}", request.Email);
            return StatusCode(500, new { Message = "Erro interno. Tente novamente." });
        }
    }

    // =========================================================================
    // LOGIN RÁPIDO — Cliente via QR Code (CPF + WhatsApp)
    // =========================================================================

    /// <summary>
    /// Login rápido para clientes via QR Code nas mesas.
    /// Cria o usuário automaticamente se for a primeira visita (identificado pelo CPF).
    /// Abre (ou reutiliza) a comanda da mesa automaticamente.
    /// Retorna o access token + o ID da comanda aberta.
    /// </summary>
    /// <response code="200">Login e comanda abertura realizados com sucesso.</response>
    /// <response code="400">Dados inválidos.</response>
    [HttpPost("quick-login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), 200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> QuickLogin([FromBody] QuickLoginRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        try
        {
            var response = await _authService.QuickLoginAsync(request);
            // LGPD: CPF removido do log — apenas nome e mesa são necessários para auditoria
            _logger.LogInformation(
                "Quick-login realizado: {Name} | Mesa: {Table} | Comanda: {ComandaId}",
                request.Name, request.TableIdentifier, response.ComandaId);
            SetAuthCookies(response.AccessToken, response.RefreshToken);
            return Ok(new SafeAuthResponse(response.ExpiresAt, response.Role, response.UserName, response.UserId, response.ComandaId, response.Permissions));
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning("Quick-login com dados inválidos: {Msg}", ex.Message);
            return BadRequest(new { Message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("Erro de operação no quick-login: {Msg}", ex.Message);
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro inesperado no quick-login");
            return StatusCode(500, new { Message = "Erro interno. Tente novamente." });
        }
    }

    // =========================================================================
    // REFRESH TOKEN — Renovar o access token sem novo login
    // =========================================================================

    /// <summary>
    /// Renova o access token usando o refresh token.
    /// Use quando o access token expirar (após 60 minutos).
    /// O refresh token é válido por 30 dias.
    /// </summary>
    /// <response code="200">Novo access token gerado.</response>
    /// <response code="401">Refresh token inválido ou expirado.</response>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), 200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest? request)
    {
        // Cookie HttpOnly tem prioridade; fallback para o body (compatibilidade)
        var refreshToken = Request.Cookies["refreshToken"]
                           ?? request?.RefreshToken;

        if (string.IsNullOrEmpty(refreshToken))
            return Unauthorized(new { Message = "Refresh token não encontrado." });

        try
        {
            var tokenRequest = new RefreshTokenRequest(refreshToken);
            var response = await _authService.RefreshTokenAsync(tokenRequest);
            // Renova os cookies com os novos tokens
            SetAuthCookies(response.AccessToken, response.RefreshToken);
            return Ok(new SafeAuthResponse(response.ExpiresAt, response.Role, response.UserName, response.UserId, Permissions: response.Permissions));
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning("Refresh token inválido ou expirado: {Msg}", ex.Message);
            ClearAuthCookies();
            return Unauthorized(new { Message = "Refresh token inválido ou expirado. Faça login novamente." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro inesperado no refresh de token");
            return StatusCode(500, new { Message = "Erro interno. Tente novamente." });
        }
    }

    // =========================================================================
    // ACESSO DO CLIENTE PELO SITE
    // =========================================================================

    [HttpPost("cpf-lookup")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> CpfLookup([FromBody] CpfLookupRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var result = await _authService.LookupByCpfAsync(request.Cpf);
            return Ok(result);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { Message = ex.Message }); }
    }

    [HttpPost("setup-account")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SetupAccount([FromBody] SetupAccountRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var response = await _authService.SetupAccountAsync(request);
            SetAuthCookies(response.AccessToken, response.RefreshToken);
            return Ok(new SafeAuthResponse(response.ExpiresAt, response.Role, response.UserName, response.UserId));
        }
        catch (KeyNotFoundException ex)    { return NotFound(new { Message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { Message = ex.Message }); }
    }

    [HttpPost("client-login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ClientLogin([FromBody] ClientLoginRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var response = await _authService.ClientLoginAsync(request);
            SetAuthCookies(response.AccessToken, response.RefreshToken);
            return Ok(new SafeAuthResponse(response.ExpiresAt, response.Role, response.UserName, response.UserId));
        }
        catch (UnauthorizedAccessException) { return Unauthorized(new { Message = "E-mail ou senha inválidos." }); }
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var response = await _authService.RegisterAsync(request);
            SetAuthCookies(response.AccessToken, response.RefreshToken);
            return Ok(new SafeAuthResponse(response.ExpiresAt, response.Role, response.UserName, response.UserId));
        }
        // Campo vai junto pra tela marcar exatamente o dado repetido (e-mail, CPF ou
        // WhatsApp) em vez de mostrar um "erro ao criar conta" solto.
        catch (CadastroDuplicadoException ex) { return Conflict(new { Message = ex.Message, Campo = ex.Campo }); }
        catch (InvalidOperationException ex)  { return Conflict(new { Message = ex.Message }); }
    }

    // =========================================================================
    // COMPLETE PROFILE — conta semi-criada (quick-login) ganha e-mail + senha
    // =========================================================================

    /// <summary>
    /// Completa o perfil da conta logada. O site exige esta etapa no primeiro
    /// acesso de contas criadas via quick-login — sem e-mail, a redefinição de
    /// senha não funciona.
    /// </summary>
    /// <response code="204">Perfil completado.</response>
    /// <response code="409">Conta já completa ou e-mail em uso.</response>
    [HttpPost("complete-profile")]
    [Authorize]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(204)]
    [ProducesResponseType(409)]
    public async Task<IActionResult> CompleteProfile([FromBody] CompleteProfileRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim == null || !Guid.TryParse(claim.Value, out var userId))
            return Unauthorized();

        try
        {
            await _authService.CompleteProfileAsync(userId, request);
            _logger.LogInformation("Perfil completado para usuário {UserId}", userId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)      { return NotFound(new { Message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { Message = ex.Message }); }
    }

    // =========================================================================
    // FORGOT PASSWORD — Solicitar reset por email
    // =========================================================================

    /// <summary>
    /// Envia email com link de redefinição de senha.
    /// Sempre retorna 204 para não revelar se o email existe.
    /// </summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        await _authService.ForgotPasswordAsync(request);
        return NoContent();
    }

    // =========================================================================
    // RESET PASSWORD — Redefinir senha com token do email
    // =========================================================================

    /// <summary>
    /// Redefine a senha usando o token recebido por email.
    /// O token expira em 2 horas e é de uso único.
    /// </summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(204)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            await _authService.ResetPasswordAsync(request);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { Message = ex.Message });
        }
    }

    // =========================================================================
    // LOGOUT — Invalidar o refresh token
    // =========================================================================

    /// <summary>
    /// Encerra a sessão do usuário autenticado.
    /// Invalida o refresh token — o próximo acesso exige novo login.
    /// </summary>
    /// <response code="204">Logout realizado com sucesso.</response>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(204)]
    public async Task<IActionResult> Logout()
    {
        var claim  = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim == null || !Guid.TryParse(claim.Value, out var userId))
            return Unauthorized();

        await _authService.LogoutAsync(userId, Request.Cookies["refreshToken"]);
        ClearAuthCookies();
        _logger.LogInformation("Logout realizado para usuário {UserId}", userId);
        return NoContent();
    }

    // =========================================================================
    // DIAGNÓSTICO — Teste de Email
    // =========================================================================

    /// <summary>
    /// Envia um email de teste para verificar as configurações de SMTP.
    /// Apenas Admin pode disparar este teste.
    /// </summary>
    [HttpPost("test-email")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> TestEmail([FromBody] TestEmailRequest request)
    {
        var success = await _emailService.SendDiagnosticEmailAsync(request.Email);
        
        return success 
            ? Ok(new { Message = $"Email de teste enviado com sucesso para {request.Email}. Verifique sua caixa de entrada e SPAM." })
            : BadRequest(new { Message = "Falha ao enviar email. Verifique os logs do servidor para detalhes do erro de SMTP." });
    }
}
