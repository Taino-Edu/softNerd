// =============================================================================
// AuthDtos.cs — DTOs de Autenticação
// Separa os dados de entrada/saída da API dos Models internos.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using CardGameStore.Validation;

namespace CardGameStore.DTOs;

// -------------------------------------------------------------------------
// Validação de CPF (dígitos verificadores)
// -------------------------------------------------------------------------

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class ValidCpfAttribute : ValidationAttribute
{
    public ValidCpfAttribute() : base("CPF inválido.") { }

    protected override ValidationResult? IsValid(object? value, ValidationContext ctx)
    {
        if (value is not string bruto || string.IsNullOrWhiteSpace(bruto))
            return ValidationResult.Success; // campo opcional

        // Aceita com máscara: quem digita "529.982.247-25" está mandando um CPF certo,
        // e recusar isso com "CPF inválido" era mentira na cara do cliente. O serviço
        // grava só os dígitos. Algoritmo único, em Validation/CpfValidAttribute.
        var digitos = Identificadores.SomenteDigitos(bruto);
        return digitos is not null && CpfValidAttribute.ValidarCpf(digitos)
            ? ValidationResult.Success
            : new ValidationResult(ErrorMessage);
    }
}

// -------------------------------------------------------------------------
// Requests (entrada)
// -------------------------------------------------------------------------

/// <summary>Login completo: Admin e clientes de Campeonatos.</summary>
public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)] string Password
);

/// <summary>
/// Login Rápido via QR Code: apenas para Customers da comanda.
/// CPF é opcional — quando ausente, identifica pelo WhatsApp.
/// </summary>
public record QuickLoginRequest(
    [Required, MaxLength(150)]  string  Name,
    [ValidCpf, MaxLength(14)]   string? Cpf,              // Opcional — aceita com máscara, grava só dígitos
    [Required, MaxLength(20)]   string  WhatsApp,
    [MaxLength(50)]             string? TableIdentifier = null
);

/// <summary>Renovação de token usando o Refresh Token.</summary>
public record RefreshTokenRequest(
    [Required] string RefreshToken
);

/// <summary>Busca cliente por CPF — primeiro acesso pelo site.</summary>
public record CpfLookupRequest(
    [Required, ValidCpf] string Cpf
);

/// <summary>Ativa a conta de um cliente existente (CPF + email + senha).</summary>
public record SetupAccountRequest(
    [Required, ValidCpf]        string Cpf,
    [Required, EmailAddress]    string Email,
    [Required, MinLength(8)]    string Password
);

/// <summary>Completa o perfil da conta logada (conta semi-criada de quick-login) — e-mail + senha.
/// Diferente do setup-account (que acha a conta pelo CPF), aqui o usuário já está autenticado.</summary>
public record CompleteProfileRequest(
    [Required, EmailAddress]    string Email,
    [Required, MinLength(8)]    string Password
);

/// <summary>Cria uma conta nova de cliente pelo site — não depende de CPF pré-cadastrado
/// (diferente de SetupAccountRequest, que só ativa contas já existentes vinda de compra em loja).</summary>
public record RegisterRequest(
    [Required, MaxLength(150)]  string  Name,
    [Required, EmailAddress]    string  Email,
    [Required, MinLength(8)]    string  Password,
    [MaxLength(20)]             string? WhatsApp = null,
    // 14 = CPF com máscara ("529.982.247-25"). O serviço grava só os dígitos; recusar
    // aqui devolvia "CPF inválido" pra um CPF certo, só porque veio pontuado.
    [ValidCpf, MaxLength(14)]   string? Cpf      = null
);

/// <summary>Login de cliente pelo site (email + senha).</summary>
public record ClientLoginRequest(
    [Required, EmailAddress]    string Email,
    [Required]                  string Password
);

/// <summary>Resposta da busca por CPF.</summary>
public record CpfLookupResponse(
    string Name,
    bool   HasPassword
);

/// <summary>Solicita envio de email para redefinição de senha.</summary>
public record ForgotPasswordRequest(
    [Required, EmailAddress] string Email
);

/// <summary>Redefine a senha usando o token recebido por email.</summary>
public record ResetPasswordRequest(
    [Required] string Token,
    [Required, MinLength(8)] string NewPassword
);

/// <summary>Solicita envio de um email de teste para diagnóstico.</summary>
public record TestEmailRequest(
    [Required, EmailAddress] string Email
);

// -------------------------------------------------------------------------
// Responses (saída)
// -------------------------------------------------------------------------

/// <summary>Resposta interna de autenticação — inclui tokens para uso nos cookies.</summary>
public record AuthResponse(
    string   AccessToken,
    string   RefreshToken,
    DateTime ExpiresAt,
    string   Role,
    string   UserName,
    Guid     UserId,
    /// <summary>
    /// ID da comanda ativa — preenchido apenas no quick-login (cliente via QR Code).
    /// Null no login completo do Admin.
    /// </summary>
    Guid?    ComandaId   = null,
    /// <summary>Permissões do Operator. Null para Admin e Customer.</summary>
    string[]? Permissions = null
);

/// <summary>
/// Resposta de auth enviada ao cliente via JSON — sem tokens.
/// Os tokens trafegam exclusivamente como cookies HttpOnly (proteção XSS).
/// </summary>
public record SafeAuthResponse(
    DateTime  ExpiresAt,
    string    Role,
    string    UserName,
    Guid      UserId,
    Guid?     ComandaId   = null,
    string[]? Permissions = null
);
