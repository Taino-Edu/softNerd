// =============================================================================
// UserService.cs — Implementação do serviço de usuários e pontos
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class UserService : IUserService
{
    private readonly AppDbContext          _db;
    private readonly ILogger<UserService>  _logger;

    public UserService(AppDbContext db, ILogger<UserService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task<IEnumerable<UserSummaryDto>> GetAllAsync(string? search = null, string? role = null)
    {
        var query = _db.Users
            .Include(u => u.Perfil)
            .Where(u => u.IsActive && (role == null ? u.Role == UserRole.Customer : u.Role == role))
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            search = search.Trim().ToLower();
            query = query.Where(u =>
                u.Name.ToLower().Contains(search) ||
                (u.Cpf != null && u.Cpf.Contains(search)) ||
                (u.WhatsApp != null && u.WhatsApp.Contains(search)));
        }

        var users = await query
            .OrderBy(u => u.Name)
            .ToListAsync();

        return users.Select(MapToSummary);
    }

    public async Task<UserSummaryDto?> GetByIdAsync(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        return user == null ? null : MapToSummary(user);
    }

    public async Task<UserProfileDto?> GetProfileAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return null;

        return new UserProfileDto
        {
            Id              = user.Id,
            Name            = user.Name,
            Email           = user.Email,
            Cpf             = user.Cpf,
            WhatsApp        = user.WhatsApp,
            ProfileImageUrl = user.ProfileImageUrl,
            Role            = user.Role,
            PointsBalance   = GetEffectivePoints(user),
            PointsExpiresAt = user.PointsExpiresAt,
            PointsExpired   = IsExpired(user),
            BalanceInCents  = user.BalanceInCents,
            CreatedAt       = user.CreatedAt,
        };
    }

    public async Task<UserSummaryDto> AddPointsAsync(Guid userId, AddPointsRequest request, Guid adminId)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        // Expira pontos antigos se já vencidos antes de somar
        if (IsExpired(user))
            user.PointsBalance = 0;

        user.PointsBalance   += request.Points;
        user.PointsExpiresAt  = DateTime.UtcNow.AddDays(30);
        user.UpdatedAt        = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Admin {AdminId} adicionou {Points} pontos ao usuário {UserId} ({Name}). Motivo: {Reason}",
            adminId, request.Points, userId, user.Name, request.Reason ?? "não informado");

        return MapToSummary(user);
    }

    public async Task DeductPointsAsync(Guid userId, int points)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        if (IsExpired(user))
            throw new InvalidOperationException("Os pontos deste usuário estão expirados.");

        if (user.PointsBalance < points)
            throw new InvalidOperationException(
                $"Saldo insuficiente. Disponível: {user.PointsBalance} pontos, solicitado: {points}.");

        user.PointsBalance -= points;
        user.UpdatedAt      = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task<UserSummaryDto> AdjustBalanceAsync(Guid userId, AdjustBalanceRequest request, Guid adminId)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        var novoSaldo = user.BalanceInCents + request.AmountInCents;
        if (novoSaldo < 0)
            throw new InvalidOperationException(
                $"Saldo insuficiente. Disponível: R$ {user.BalanceInCents / 100m:N2}, débito solicitado: R$ {Math.Abs(request.AmountInCents) / 100m:N2}.");

        user.BalanceInCents = novoSaldo;
        user.UpdatedAt      = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Admin {AdminId} ajustou saldo do usuário {UserId}: {Amount} centavos. Motivo: {Reason}. Novo saldo: {Saldo} centavos.",
            adminId, userId, request.AmountInCents, request.Reason ?? "não informado", novoSaldo);

        return MapToSummary(user);
    }

    // ── LGPD — Direitos do titular ────────────────────────────────────────────

    public async Task<UserProfileDto> UpdateProfileImageAsync(Guid userId, string? imageUrl)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        user.ProfileImageUrl = imageUrl;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        _logger.LogInformation("Usuário {UserId} atualizou sua foto de perfil.", userId);

        return (await GetProfileAsync(userId))!;
    }

    public async Task<UserProfileDto> UpdateMeAsync(Guid userId, UpdateMeRequest request)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        // Atualiza apenas os campos fornecidos pelo titular
        if (!string.IsNullOrWhiteSpace(request.Name))
            user.Name = request.Name.Trim();

        if (request.Email is not null)
        {
            var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim().ToLowerInvariant();
            if (email is not null && email != user.Email)
            {
                var emailEmUso = await _db.Users.AnyAsync(u => u.Id != userId && u.Email == email);
                if (emailEmUso)
                    throw new InvalidOperationException($"Já existe uma conta com o e-mail {email}.");
            }
            user.Email = email;
        }

        if (request.WhatsApp is not null)
        {
            var whatsApp = string.IsNullOrWhiteSpace(request.WhatsApp) ? null : request.WhatsApp.Trim();
            if (whatsApp is not null && whatsApp != user.WhatsApp)
            {
                var whatsAppEmUso = await _db.Users.AnyAsync(u => u.Id != userId && u.WhatsApp == whatsApp);
                if (whatsAppEmUso)
                    throw new InvalidOperationException($"Já existe uma conta com o WhatsApp {whatsApp}.");
            }
            user.WhatsApp = whatsApp;
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Titular {UserId} atualizou seus dados pessoais (LGPD retificação).", userId);

        return (await GetProfileAsync(userId))!;
    }

    public async Task AnonimizarAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        // Anonimização LGPD — dados pessoais substituídos por valores neutros.
        // O registro é mantido para preservar integridade referencial com comandas e crediários.
        user.Name      = "Usuário Removido";
        user.Email     = null;
        user.Cpf       = null;
        user.WhatsApp  = null;
        user.IsActive  = false;
        user.DeletedAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        // Invalida tokens de sessão ativos
        user.RefreshToken       = null;
        user.RefreshTokenExpiry = null;

        await _db.SaveChangesAsync();

        _logger.LogInformation("Titular {UserId} anonimizado via LGPD (direito de exclusão).", userId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    public async Task<UserSummaryDto> AdminCreateUserAsync(AdminCreateUserRequest request, Guid adminId)
    {
        // Valida duplicidade de CPF
        if (!string.IsNullOrWhiteSpace(request.Cpf))
        {
            var cpfLimpo = request.Cpf.Trim();
            var existe = await _db.Users.AnyAsync(u => u.Cpf == cpfLimpo);
            if (existe)
                throw new InvalidOperationException($"Já existe um cadastro com o CPF {cpfLimpo}.");
        }

        // Valida duplicidade de e-mail
        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var email = request.Email.Trim().ToLowerInvariant();
            var existe = await _db.Users.AnyAsync(u => u.Email == email);
            if (existe)
                throw new InvalidOperationException($"Já existe um cadastro com o e-mail {request.Email}.");
        }

        var role = request.Role == UserRole.Operator ? UserRole.Operator : UserRole.Customer;

        if (role == UserRole.Operator)
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                throw new InvalidOperationException("E-mail é obrigatório para Operadores.");
            if (string.IsNullOrWhiteSpace(request.Password))
                throw new InvalidOperationException("Senha é obrigatória para Operadores.");
        }

        var user = new User
        {
            Name      = request.Name.Trim(),
            Cpf       = string.IsNullOrWhiteSpace(request.Cpf) ? null : request.Cpf.Trim(),
            WhatsApp  = string.IsNullOrWhiteSpace(request.WhatsApp) ? null : request.WhatsApp.Trim(),
            Email     = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim().ToLowerInvariant(),
            Role      = role,
            PerfilId  = role == UserRole.Operator ? request.PerfilId : null,
            IsActive  = true,
            ConsentAt = DateTime.UtcNow,
        };

        if (!string.IsNullOrWhiteSpace(request.Password))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, workFactor: 12);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Admin {AdminId} criou conta para o cliente {UserId} ({Name}).",
            adminId, user.Id, user.Name);

        return MapToSummary(user);
    }

    public async Task AdminResetPasswordAsync(Guid userId, AdminResetPasswordRequest request, Guid adminId)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        user.PasswordHash           = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, workFactor: 12);
        user.RefreshToken           = null;
        user.RefreshTokenExpiry     = null;
        user.PasswordResetToken     = null;
        user.PasswordResetTokenExpiry = null;
        user.UpdatedAt              = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Admin {AdminId} redefiniu a senha do usuário {UserId} ({Name}).",
            adminId, userId, user.Name);
    }

    public async Task<UserSummaryDto> AdminUpdateUserAsync(Guid userId, AdminUpdateUserRequest request)
    {
        var user = await _db.Users.Include(u => u.Perfil).FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        if (!string.IsNullOrWhiteSpace(request.Name))
            user.Name = request.Name.Trim();

        if (request.Email is not null)
        {
            var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim().ToLowerInvariant();
            if (email is not null && email != user.Email)
            {
                var emailEmUso = await _db.Users.AnyAsync(u => u.Id != userId && u.Email == email);
                if (emailEmUso)
                    throw new InvalidOperationException($"Já existe uma conta com o e-mail {email}.");
            }
            user.Email = email;
        }

        if (request.Cpf is not null)
        {
            var cpf = string.IsNullOrWhiteSpace(request.Cpf) ? null : request.Cpf.Trim();
            if (cpf is not null && cpf != user.Cpf)
            {
                var cpfEmUso = await _db.Users.AnyAsync(u => u.Id != userId && u.Cpf == cpf);
                if (cpfEmUso)
                    throw new InvalidOperationException($"Já existe uma conta com o CPF {cpf}.");
            }
            user.Cpf = cpf;
        }

        if (request.WhatsApp is not null)
        {
            var whatsApp = string.IsNullOrWhiteSpace(request.WhatsApp) ? null : request.WhatsApp.Trim();
            if (whatsApp is not null && whatsApp != user.WhatsApp)
            {
                var whatsAppEmUso = await _db.Users.AnyAsync(u => u.Id != userId && u.WhatsApp == whatsApp);
                if (whatsAppEmUso)
                    throw new InvalidOperationException($"Já existe uma conta com o WhatsApp {whatsApp}.");
            }
            user.WhatsApp = whatsApp;
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Admin corrigiu os dados do usuário {UserId} ({Name}).", userId, user.Name);

        return MapToSummary(user);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool IsExpired(User user) =>
        user.PointsExpiresAt.HasValue && user.PointsExpiresAt.Value < DateTime.UtcNow;

    private static int GetEffectivePoints(User user) =>
        IsExpired(user) ? 0 : user.PointsBalance;

    public static UserSummaryDto MapToSummary(User user) => new()
    {
        Id              = user.Id,
        Name            = user.Name,
        Email           = user.Email,
        Cpf             = user.Cpf,
        WhatsApp        = user.WhatsApp,
        ProfileImageUrl = user.ProfileImageUrl,
        Role            = user.Role,
        PerfilId        = user.PerfilId,
        PerfilNome      = user.Perfil?.Nome,
        PointsBalance   = IsExpired(user) ? 0 : user.PointsBalance,
        PointsExpiresAt = user.PointsExpiresAt,
        PointsExpired   = IsExpired(user),
        BalanceInCents  = user.BalanceInCents,
        IsActive        = user.IsActive,
        CreatedAt       = user.CreatedAt,
    };
}
