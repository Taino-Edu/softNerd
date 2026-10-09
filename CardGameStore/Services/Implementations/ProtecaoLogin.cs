// =============================================================================
// ProtecaoLogin.cs — Bloqueio de conta por senha errada + dispositivo conhecido
//
// Por CONTA, não por IP: a loja inteira sai pelo mesmo wi-fi, então travar o IP
// travava todo mundo. Aqui quem erra a senha trava só a conta que está tentando.
//
//   5ª senha errada seguida → 1 min · 6ª → 5 min · 7ª → 15 min · 8ª em diante → 1 h
//   Acertou → zera. Redefiniu a senha (por e-mail ou pelo admin) → zera.
//
// Dispositivo conhecido: quem já entrou neste aparelho recebe um cookie assinado
// ("dispositivo"). Nele a conta NUNCA fica travada — senão qualquer um que soubesse
// o e-mail do Maikon travava o PDV dele de propósito errando a senha 5 vezes. Trocar
// a senha invalida todos os aparelhos (a assinatura inclui o hash da senha).
// O limite por IP continua só como teto contra robô (Program.cs, política "login").
// =============================================================================

using System.Security.Cryptography;
using System.Text;

namespace CardGameStore.Services.Implementations;

/// <summary>Conta travada por senha errada repetida (vira 429 com a mensagem pro usuário).</summary>
public class ContaBloqueadaException(DateTime ateUtc)
    : Exception("Muitas tentativas com senha errada.")
{
    public DateTime AteUtc { get; } = ateUtc;

    public string MensagemParaUsuario()
    {
        var minutos = Math.Max(1, (int)Math.Ceiling((AteUtc - DateTime.UtcNow).TotalMinutes));
        return $"Muitas tentativas com senha errada. Por segurança, a conta ficou bloqueada por {minutos} min " +
               "neste aparelho. Se esqueceu a senha, use \"Esqueci minha senha\".";
    }
}

/// <summary>QR Code da mesa recusado (conta com senha, dados que não batem...). Código pro front decidir o próximo passo.</summary>
public class QuickLoginRecusadoException(string message, string codigo) : Exception(message)
{
    /// <summary>"precisaSenha" | "precisaCpf" | "naoBate" | "balcao"</summary>
    public string Codigo { get; } = codigo;
}

public static class ProtecaoLogin
{
    public const int FalhasAntesDoBloqueio = 5;
    public const string CookieDispositivo = "dispositivo";
    public static readonly TimeSpan ValidadeDispositivo = TimeSpan.FromDays(180);

    /// <summary>Hash de verdade pra comparar quando o e-mail não existe: mesmo tempo de resposta, não revela quem tem conta.</summary>
    public static readonly string HashFalso = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString(), workFactor: 11);

    /// <summary>Quanto tempo trava depois de N senhas erradas seguidas (zero = não trava).</summary>
    public static TimeSpan Bloqueio(int falhas) => falhas switch
    {
        < FalhasAntesDoBloqueio => TimeSpan.Zero,
        FalhasAntesDoBloqueio   => TimeSpan.FromMinutes(1),
        6                       => TimeSpan.FromMinutes(5),
        7                       => TimeSpan.FromMinutes(15),
        _                       => TimeSpan.FromHours(1),
    };

    // ── Dispositivo conhecido ────────────────────────────────────────────────
    // Formato: {userId:N}.{aleatório}.{HMAC-SHA256(userId.aleatório.hashDaSenha)}

    public static string GerarDispositivo(Guid userId, string? passwordHash, string chave)
    {
        var aleatorio = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        return $"{userId:N}.{aleatorio}.{Assinar(userId, aleatorio, passwordHash, chave)}";
    }

    public static bool DispositivoValido(string? valor, Guid userId, string? passwordHash, string chave)
    {
        if (string.IsNullOrEmpty(valor)) return false;
        var partes = valor.Split('.');
        if (partes.Length != 3 || partes[0] != userId.ToString("N")) return false;
        var esperado = Assinar(userId, partes[1], passwordHash, chave);
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(esperado), Encoding.ASCII.GetBytes(partes[2]));
    }

    private static string Assinar(Guid userId, string aleatorio, string? passwordHash, string chave)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes("dispositivo:" + chave));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{userId:N}.{aleatorio}.{passwordHash}")));
    }
}
