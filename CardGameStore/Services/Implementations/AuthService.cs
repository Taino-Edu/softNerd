// =============================================================================
// AuthService.cs — Implementação de Autenticação
// =============================================================================
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using CardGameStore.Validation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace CardGameStore.Services.Implementations;

/// <summary>
/// Implementação do serviço de autenticação.
/// Responsável por: login completo, login rápido (QR Code), refresh tokens e logout.
/// </summary>
public class AuthService : IAuthService
{
    private readonly AppDbContext          _db;
    private readonly JwtSettings           _jwt;
    private readonly ILogger<AuthService>  _logger;
    private readonly IComandaService       _comandaService;
    private readonly IEmailService         _email;

    public AuthService(
        AppDbContext db,
        IOptions<JwtSettings> jwt,
        ILogger<AuthService> logger,
        IComandaService comandaService,
        IEmailService email)
    {
        _db             = db;
        _jwt            = jwt.Value;
        _logger         = logger;
        _comandaService = comandaService;
        _email          = email;
    }

    // =========================================================================
    // LOGIN COMPLETO — Admin e jogadores de campeonato
    // =========================================================================
    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive);

        // PasswordHash pode ser null para clientes de quick-login.
        // Verificar null antes de chamar BCrypt.Verify evita NullReferenceException.
        if (user == null || user.PasswordHash == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("E-mail ou senha inválidos.");

        return await GenerateAuthResponseAsync(user);
    }

    // =========================================================================
    // LOGIN RÁPIDO — Customer via QR Code (CPF + WhatsApp)
    // =========================================================================
    public async Task<AuthResponse> QuickLoginAsync(QuickLoginRequest request)
    {
        // Normaliza antes de procurar: o cliente digita o CPF com ponto numa visita e sem
        // ponto na outra, e a busca crua criava um cadastro novo em vez de reencontrar o dele.
        var cpf      = Identificadores.NormalizarCpf(request.Cpf);
        var whatsApp = Identificadores.NormalizarWhatsApp(request.WhatsApp);
        var hasCpf   = cpf is not null;

        // Busca por CPF (preferido) ou WhatsApp quando CPF não informado
        var user = hasCpf
            ? await _db.Users.FirstOrDefaultAsync(u => u.Cpf != null
                && u.Cpf.Replace(".", "").Replace("-", "").Replace(" ", "") == cpf)
            : await _db.Users.FirstOrDefaultAsync(u => u.IsActive && u.WhatsApp != null
                && u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                             .Replace("-", "").Replace("+", "") == whatsApp);

        if (user == null)
        {
            user = new User
            {
                Name     = request.Name,
                Cpf      = cpf,
                WhatsApp = whatsApp,
                Role     = UserRole.Customer,
                IsActive = true
            };
            _db.Users.Add(user);
            _logger.LogInformation("Novo cliente criado via QR Code: {Name}", request.Name);
        }
        else
        {
            user.Name      = request.Name;
            user.WhatsApp  = whatsApp ?? user.WhatsApp;
            // Preenche CPF caso tenha sido informado agora e estava vazio
            if (hasCpf && user.Cpf == null) user.Cpf = cpf;
            user.UpdatedAt = DateTime.UtcNow;
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            user = hasCpf
                ? await _db.Users.FirstOrDefaultAsync(u => u.IsActive && u.Cpf != null
                    && u.Cpf.Replace(".", "").Replace("-", "").Replace(" ", "") == cpf)
                : await _db.Users.FirstOrDefaultAsync(u => u.IsActive && u.WhatsApp != null
                    && u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                                 .Replace("-", "").Replace("+", "") == whatsApp);
            if (user == null) throw;
        }

        var comanda = await _comandaService.OpenComandaAsync(user.Id, request.TableIdentifier);
        _logger.LogInformation("Comanda {ComandaId} associada ao quick-login de {Name}", comanda.Id, user.Name);

        return await GenerateAuthResponseAsync(user, comanda.Id);
    }

    // =========================================================================
    // REFRESH TOKEN
    // =========================================================================
    public async Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request)
    {
        var hashedToken = HashRefreshToken(request.RefreshToken);
        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.RefreshToken == hashedToken && u.IsActive
        );

        if (user == null || user.RefreshTokenExpiry < DateTime.UtcNow)
            throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");

        return await GenerateAuthResponseAsync(user);
    }

    // =========================================================================
    // LOGOUT
    // =========================================================================
    public async Task LogoutAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user != null)
        {
            user.RefreshToken       = null;
            user.RefreshTokenExpiry = null;
            user.UpdatedAt          = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }

    // =========================================================================
    // HELPERS PRIVADOS
    // =========================================================================

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user, Guid? comandaId = null)
    {
        // Carrega perfil do Operator para incluir permissões no JWT
        string[]? permissions = null;
        if (user.Role == UserRole.Operator && user.PerfilId.HasValue)
        {
            var perfil = await _db.Perfis.FindAsync(user.PerfilId.Value);
            if (perfil != null)
            {
                try { permissions = System.Text.Json.JsonSerializer.Deserialize<string[]>(perfil.PermissoesJson); }
                catch { permissions = []; }
            }
        }

        var accessToken  = GenerateJwt(user, permissions);
        var refreshToken = GenerateRefreshToken();
        var expiresAt    = DateTime.UtcNow.AddMinutes(_jwt.AccessTokenExpirationMinutes);

        // Armazena somente o hash SHA-256 — o token bruto só sai no cookie HttpOnly.
        // Se o banco for comprometido, os hashes não são diretamente utilizáveis.
        user.RefreshToken       = HashRefreshToken(refreshToken);
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(_jwt.RefreshTokenExpirationDays);
        user.UpdatedAt          = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return new AuthResponse(accessToken, refreshToken, expiresAt, user.Role, user.Name, user.Id, comandaId, permissions);
    }

    private string GenerateJwt(User user, string[]? permissions = null)
    {
        var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SecretKey));
        var creds   = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub,   user.Id.ToString()),
            new(JwtRegisteredClaimNames.Name,  user.Name),
            new(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()),
            new(ClaimTypes.Role,               user.Role)
        };

        if (!string.IsNullOrEmpty(user.Email))
            claims.Add(new(JwtRegisteredClaimNames.Email, user.Email));

        if (permissions != null && permissions.Length > 0)
            claims.Add(new("permissions", System.Text.Json.JsonSerializer.Serialize(permissions)));

        var token = new JwtSecurityToken(
            issuer:             _jwt.Issuer,
            audience:           _jwt.Audience,
            claims:             claims,
            expires:            DateTime.UtcNow.AddMinutes(_jwt.AccessTokenExpirationMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Gera um refresh token aleatório e seguro (256 bits).</summary>
    private static string GenerateRefreshToken()
    {
        var randomBytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    /// <summary>
    /// Retorna SHA-256 hex do token — o que é persistido no banco.
    /// O token bruto trafega apenas no cookie HttpOnly.
    /// </summary>
    private static string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    // =========================================================================
    // ACESSO DO CLIENTE PELO SITE
    // =========================================================================

    public async Task<CpfLookupResponse> LookupByCpfAsync(string cpf)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Cpf == cpf && u.IsActive);
        if (user == null)
            throw new KeyNotFoundException("CPF não encontrado. Acesse a loja e escaneie o QR Code para criar sua conta.");

        return new CpfLookupResponse(user.Name, user.PasswordHash != null);
    }

    public async Task<AuthResponse> SetupAccountAsync(SetupAccountRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Cpf == request.Cpf && u.IsActive);
        if (user == null)
            throw new KeyNotFoundException("CPF não encontrado.");

        var emailInUse = await _db.Users.AnyAsync(u => u.Email == request.Email.ToLowerInvariant() && u.Id != user.Id);
        if (emailInUse)
            throw new InvalidOperationException("Este e-mail já está em uso por outra conta.");

        user.Email        = request.Email.ToLowerInvariant();
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Conta ativada para cliente {Name}", user.Name);
        return await GenerateAuthResponseAsync(user);
    }

    // Completa o perfil da conta LOGADA — quick-login cria conta semi-criada (sem
    // e-mail/senha) e o site exige esta etapa: sem e-mail a redefinição de senha
    // não chega (incidente real com cliente da loja).
    public async Task CompleteProfileAsync(Guid userId, CompleteProfileRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive)
            ?? throw new KeyNotFoundException("Usuário não encontrado.");

        if (user.PasswordHash is not null && user.Email is not null)
            throw new InvalidOperationException("Esta conta já está completa.");

        var email = request.Email.Trim().ToLowerInvariant();
        var emailInUse = await _db.Users.AnyAsync(u => u.Email == email && u.Id != userId);
        if (emailInUse)
            throw new InvalidOperationException("Este e-mail já está em uso por outra conta.");

        user.Email        = email;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Perfil completado pelo próprio cliente {UserId}", userId);
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var email    = Identificadores.NormalizarEmail(request.Email)!;
        var cpf      = Identificadores.NormalizarCpf(request.Cpf);
        var whatsApp = Identificadores.NormalizarWhatsApp(request.WhatsApp);

        await GarantirIdentificadoresLivresAsync(_db, email, cpf, whatsApp);

        var user = new User
        {
            Name         = request.Name.Trim(),
            Email        = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            WhatsApp     = whatsApp,
            Cpf          = cpf,
            Role         = UserRole.Customer,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Nova conta criada via cadastro público: {Name} ({Email})", user.Name, user.Email);
        return await GenerateAuthResponseAsync(user);
    }

    /// <summary>
    /// Barra cadastro repetido comparando os identificadores JÁ NORMALIZADOS contra a
    /// base — e limpando também a coluna, porque cadastro antigo foi salvo formatado
    /// ("123.456.789-00", "(17) 99112-2890"). Sem isso o mesmo cliente entrava de novo
    /// só mudando a pontuação. Cada campo devolve a sua própria mensagem: quem está
    /// cadastrando precisa saber QUAL dado já existe, não um "erro ao criar conta".
    /// </summary>
    internal static async Task GarantirIdentificadoresLivresAsync(
        AppDbContext db, string? email, string? cpf, string? whatsApp, Guid? ignorarUserId = null)
    {
        var outros = ignorarUserId.HasValue
            ? db.Users.Where(u => u.Id != ignorarUserId.Value)
            : db.Users;

        if (email is not null && await outros.AnyAsync(u => u.Email != null && u.Email.ToLower() == email))
            throw new CadastroDuplicadoException("email",
                "Este e-mail já tem cadastro. Faça login ou use \"Esqueci minha senha\".");

        if (cpf is not null && await outros.AnyAsync(u => u.Cpf != null
                && u.Cpf.Replace(".", "").Replace("-", "").Replace(" ", "") == cpf))
            throw new CadastroDuplicadoException("cpf",
                "Este CPF já tem cadastro. Faça login ou use \"Esqueci minha senha\" — se não reconhece, fale com a loja.");

        // Compara com e sem o 55 do país em vez de remover "55" da string — remover
        // estragaria números que têm 55 no meio (ex: 17 99155-2890).
        var whatsAppComDdi = whatsApp is null ? null : "55" + whatsApp;
        if (whatsApp is not null && await outros.AnyAsync(u => u.WhatsApp != null
                && (u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                              .Replace("-", "").Replace("+", "") == whatsApp
                 || u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                              .Replace("-", "").Replace("+", "") == whatsAppComDdi)))
            throw new CadastroDuplicadoException("whatsapp",
                "Este WhatsApp já tem cadastro. Faça login ou use \"Esqueci minha senha\".");
    }

    public async Task<AuthResponse> ClientLoginAsync(ClientLoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email == request.Email.ToLowerInvariant() && u.IsActive && u.Role == UserRole.Customer);

        if (user == null || user.PasswordHash == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("E-mail ou senha inválidos.");

        return await GenerateAuthResponseAsync(user);
    }

    // =========================================================================
    // RECUPERAÇÃO DE SENHA
    // =========================================================================

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request)
    {
        // Sempre retorna sem erro — não revelar se email existe (evita user enumeration)
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email.ToLowerInvariant() && u.IsActive);

        if (user == null)
        {
            await Task.Delay(Random.Shared.Next(200, 500)); // timing equalization
            return;
        }

        // Gera token seguro e salva com expiração de 2h
        var tokenBytes = new byte[32];
        using var rng  = RandomNumberGenerator.Create();
        rng.GetBytes(tokenBytes);
        var token = Convert.ToBase64String(tokenBytes);

        user.PasswordResetToken       = token;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(2);
        user.UpdatedAt                = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _email.SendPasswordResetAsync(user.Email!, user.Name, token);
        _logger.LogInformation("Solicitação de reset de senha para {Email}", MaskEmail(request.Email));
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.PasswordResetToken == request.Token &&
            u.PasswordResetTokenExpiry > DateTime.UtcNow &&
            u.IsActive);

        if (user == null)
            throw new UnauthorizedAccessException("Token inválido ou expirado.");

        user.PasswordHash             = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.PasswordResetToken       = null;
        user.PasswordResetTokenExpiry = null;
        user.RefreshToken             = null; // invalida sessões ativas
        user.RefreshTokenExpiry       = null;
        user.UpdatedAt                = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        _logger.LogInformation("Senha redefinida para usuário {UserId}", user.Id);
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var local = email[..at];
        var visible = local.Length > 1 ? local[0] + new string('*', Math.Min(local.Length - 1, 3)) : "*";
        return visible + email[at..];
    }
}
