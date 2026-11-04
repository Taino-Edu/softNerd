// =============================================================================
// Mascara.cs — dado pessoal que vai pro log sai mascarado
//
// O log da API fica guardado 30 dias na VPS (deploy/logs.sh) e passa por mais gente que o banco.
// Login, cadastro e falha de envio gravavam o e-mail inteiro; agora sai "m***@gmail.com" — dá
// pra achar o caso pelo domínio e pela hora sem expor o endereço (teste de vazamentos, 04/11).
// =============================================================================

namespace CardGameStore.Common;

public static class Mascara
{
    /// <summary>"maikon@gmail.com" → "m***@gmail.com". Vazio ou sem "@" → "***".</summary>
    public static string Email(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return "***";
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var local = email[..at];
        var visivel = local.Length > 1 ? local[0] + new string('*', Math.Min(local.Length - 1, 3)) : "*";
        return visivel + email[at..];
    }
}
