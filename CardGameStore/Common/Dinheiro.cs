// =============================================================================
// Dinheiro.cs — "R$ 1.234,56" em texto pra pessoas (e-mail, WhatsApp, mensagens)
//
// O servidor de produção (Linux, container) roda sem idioma configurado: o .NET usa
// a cultura invariante e "{valor:N2}" vira "1,234.56" — o cliente recebia "R$ 30.00"
// no WhatsApp do crediário. Achado pelo CI (testes rodando no Linux).
//
// NÃO mudamos a cultura global de propósito: Pix (Inter) e XML da NFC-e exigem
// ponto decimal. Use isto só em texto que uma pessoa vai ler. Logs podem ficar como estão.
// Espelho no front: frontend/lib/format.ts (brl).
// =============================================================================

using System.Globalization;

namespace CardGameStore.Common;

public static class Dinheiro
{
    public static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    /// <summary>Reais → "R$ 1.234,56".</summary>
    public static string Brl(decimal reais) => "R$ " + reais.ToString("N2", PtBr);

    /// <summary>Centavos → "R$ 1.234,56".</summary>
    public static string BrlDeCentavos(long centavos) => Brl(centavos / 100m);
}
