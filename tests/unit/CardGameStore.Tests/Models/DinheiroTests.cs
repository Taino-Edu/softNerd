// =============================================================================
// DinheiroTests.cs — "R$ 1.234,56" mesmo com o servidor sem idioma (Common/Dinheiro.cs)
// =============================================================================

using System.Globalization;
using CardGameStore.Common;

namespace CardGameStore.Tests.Models;

public class DinheiroTests
{
    [Theory]
    [InlineData(30, "R$ 30,00")]
    [InlineData(1234.5, "R$ 1.234,50")]
    [InlineData(0.05, "R$ 0,05")]
    public void Brl_NoServidorSemIdioma_SaiEmPortugues(decimal valor, string esperado)
    {
        // Produção roda sem LANG: o .NET usa a cultura invariante ("1,234.50")
        var antes = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        try
        {
            Dinheiro.Brl(valor).Should().Be(esperado);
        }
        finally
        {
            CultureInfo.CurrentCulture = antes;
        }
    }

    [Fact]
    public void BrlDeCentavos_ConverteCentavos() =>
        Dinheiro.BrlDeCentavos(123456).Should().Be("R$ 1.234,56");
}
