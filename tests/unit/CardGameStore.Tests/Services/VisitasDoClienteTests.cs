// =============================================================================
// VisitasDoClienteTests.cs — visita = dia (de Brasília) com comanda fechada ou compra no PDV
// =============================================================================

using CardGameStore.Services.Implementations;

namespace CardGameStore.Tests.Services;

public class VisitasDoClienteTests
{
    private static DateTime Utc(int mes, int dia, int hora, int minuto = 0) =>
        new(2026, mes, dia, hora, minuto, 0, DateTimeKind.Utc);

    [Fact]
    public void SemCompra_ZeroVisitas_SemDatas()
    {
        var r = VisitasDoCliente.Resumir([]);

        r.Should().Be(new VisitasDoCliente.Resumo(0, null, null));
    }

    [Fact]
    public void SoComprasNoCaixa_ContamComoVisitas()
    {
        // Caso do Carlos: 6 compras no PDV em 4 dias, nenhuma comanda
        var vendasPdv = new[]
        {
            Utc(10, 8, 13, 56), Utc(9, 29, 21, 44),
            Utc(9, 26, 14, 36), Utc(9, 26, 14, 36),
            Utc(9, 19, 15, 8),  Utc(9, 19, 15, 8),
        };

        var r = VisitasDoCliente.Resumir(vendasPdv);

        r.Total.Should().Be(4);
        r.Primeira.Should().Be(Utc(9, 19, 15, 8));
        r.Ultima.Should().Be(Utc(10, 8, 13, 56));
    }

    [Fact]
    public void ComandaEPdvNoMesmoDia_UmaVisita()
    {
        var r = VisitasDoCliente.Resumir([Utc(10, 8, 15), Utc(10, 8, 20)]);

        r.Total.Should().Be(1);
    }

    [Fact]
    public void ODiaEODeBrasilia()
    {
        // 08/10 22h em Brasília = 09/10 01h UTC; 08/10 10h em Brasília = 08/10 13h UTC → mesmo dia
        var r = VisitasDoCliente.Resumir([Utc(10, 9, 1), Utc(10, 8, 13)]);

        r.Total.Should().Be(1);
    }
}
