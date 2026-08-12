// =============================================================================
// Identificadores.cs — normalização de CPF, WhatsApp e e-mail
//
// O cadastro duplicado acontecia porque a checagem comparava o texto cru: quem
// digitava "123.456.789-00" passava batido por cima de um cadastro com
// "12345678900", e "(17) 99112-2890" não era o mesmo que "17991122890".
// Toda comparação de duplicidade passa por aqui — e as consultas ao banco também
// limpam a coluna, porque os cadastros antigos foram salvos formatados.
// =============================================================================

namespace CardGameStore.Validation;

public static class Identificadores
{
    /// <summary>Só os dígitos; null quando não sobra nada.</summary>
    public static string? SomenteDigitos(string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor)) return null;
        var digitos = new string(valor.Where(char.IsAsciiDigit).ToArray());
        return digitos.Length == 0 ? null : digitos;
    }

    /// <summary>CPF só com dígitos (11 posições quando válido).</summary>
    public static string? NormalizarCpf(string? cpf) => SomenteDigitos(cpf);

    /// <summary>
    /// WhatsApp só com dígitos, sem o 55 do país — "+55 (17) 99112-2890",
    /// "17991122890" e "5517991122890" viram o mesmo número.
    /// </summary>
    public static string? NormalizarWhatsApp(string? whatsApp)
    {
        var digitos = SomenteDigitos(whatsApp);
        if (digitos is null) return null;
        if (digitos.Length > 11 && digitos.StartsWith("55")) digitos = digitos[2..];
        return digitos;
    }

    public static string? NormalizarEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();
}

/// <summary>
/// Cadastro barrado porque o identificador já pertence a alguém. Carrega o campo
/// pra tela conseguir apontar exatamente onde está o problema, em vez de jogar um
/// "erro ao criar conta" genérico no rosto de quem está cadastrando.
/// </summary>
public class CadastroDuplicadoException : InvalidOperationException
{
    /// <summary>"email" | "cpf" | "whatsapp"</summary>
    public string Campo { get; }

    public CadastroDuplicadoException(string campo, string mensagem) : base(mensagem) => Campo = campo;
}
