// =============================================================================
// Cnpj.cs — Formato e dígito verificador do CNPJ, nos dois modelos.
//
// A partir de 31/07/2026 a Receita passa a emitir CNPJ alfanumérico (IN RFB
// 2.229/2024): as 12 primeiras posições podem conter letras, os 2 dígitos
// verificadores continuam numéricos. Os CNPJs numéricos já existentes NÃO
// mudam e não têm o DV recalculado — os dois formatos convivem por tempo
// indeterminado, e o numérico segue sendo a esmagadora maioria.
//
// O cálculo do DV é o mesmo módulo 11 de sempre, com os mesmos pesos. Muda só
// o valor de cada caractere, que passa a ser o código ASCII menos 48:
// '0'..'9' seguem valendo 0..9 (por isso a conta do CNPJ numérico é idêntica
// à anterior), 'A'=17, 'B'=18, ... 'Z'=42.
// =============================================================================

using System.Text.RegularExpressions;

namespace CardGameStore.Common;

public static class Cnpj
{
    public const int Tamanho = 14;

    /// <summary>12 posições alfanuméricas + 2 dígitos verificadores numéricos.</summary>
    private const string Formato = "^[0-9A-Z]{12}[0-9]{2}$";

    /// <summary>Mesma expressão, para varrer um texto maior (Subject de certificado).</summary>
    internal const string FormatoEmTexto = @"(?<![0-9A-Z])([0-9A-Z]{12}[0-9]{2})(?![0-9A-Z])";

    private static readonly int[] Pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    private static readonly int[] Pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    /// <summary>
    /// Tira máscara e espaços preservando letras, e devolve em maiúsculas.
    /// Filtrar só dígitos mutilaria o CNPJ novo — "12ABC34501DE35" viraria
    /// "1234501" com 7 posições e nunca mais bateria com nada.
    /// </summary>
    public static string Normalizar(string? valor) =>
        string.IsNullOrWhiteSpace(valor)
            ? string.Empty
            : new string(valor.ToUpperInvariant().Where(char.IsAsciiLetterOrDigit).ToArray());

    /// <summary>True se o valor (já normalizado ou com máscara) é um CNPJ bem formado
    /// e com os dois dígitos verificadores corretos, em qualquer um dos dois modelos.</summary>
    public static bool EhValido(string? valor)
    {
        var cnpj = Normalizar(valor);
        if (!Regex.IsMatch(cnpj, Formato)) return false;
        // 00000000000000, AAAAAAAAAAAA00... fecham a conta mas não existem.
        if (cnpj.Distinct().Count() == 1) return false;

        var raiz = cnpj[..12];
        return Valor(cnpj[12]) == Digito(raiz, Pesos1) &&
               Valor(cnpj[13]) == Digito(raiz + Digito(raiz, Pesos1), Pesos2);
    }

    /// <summary>Varre um texto e devolve o primeiro CNPJ com DV válido, ou null.
    /// Percorre todas as ocorrências do formato em vez de parar na primeira porque
    /// o texto pode ter número de série e OIDs do mesmo tamanho — casar com o
    /// primeiro apontaria para um valor que não é CNPJ nenhum.</summary>
    public static string? ExtrairDeTexto(string? texto)
    {
        if (string.IsNullOrWhiteSpace(texto)) return null;

        foreach (Match m in Regex.Matches(texto.ToUpperInvariant(), FormatoEmTexto))
            if (EhValido(m.Groups[1].Value))
                return m.Groups[1].Value;

        return null;
    }

    /// <summary>Aplica a máscara 00.000.000/0000-00 para exibição.</summary>
    public static string Formatar(string? valor)
    {
        var cnpj = Normalizar(valor);
        return cnpj.Length == Tamanho
            ? $"{cnpj[..2]}.{cnpj[2..5]}.{cnpj[5..8]}/{cnpj[8..12]}-{cnpj[12..]}"
            : cnpj;
    }

    private static int Valor(char c) => c - 48;

    private static int Digito(string parcial, int[] pesos)
    {
        var soma = parcial.Select((c, i) => Valor(c) * pesos[i]).Sum();
        var resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    }
}
