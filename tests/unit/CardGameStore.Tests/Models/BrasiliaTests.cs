// =============================================================================
// BrasiliaTests.cs — Fuso de Brasília (Common/Brasilia.cs)
// =============================================================================

using CardGameStore.Common;

namespace CardGameStore.Tests.Models;

public class BrasiliaTests
{
    [Fact]
    public void DiaUtc_UmDiaDeBrasilia_VaiDas3hUtcAteAs3hDoDiaSeguinte()
    {
        var (inicio, fim) = Brasilia.DiaUtc(new DateTime(2026, 5, 29));

        inicio.Should().Be(new DateTime(2026, 5, 29, 3, 0, 0, DateTimeKind.Utc));
        fim.Should().Be(new DateTime(2026, 5, 30, 3, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void ParaBrasilia_23h30DeBrasiliaEmUtc_ContinuaNoMesmoDia()
    {
        // 23:30 em Brasília = 02:30 UTC do dia seguinte — o dia certo é o de Brasília
        var br = Brasilia.ParaBrasilia(new DateTime(2026, 10, 7, 2, 30, 0, DateTimeKind.Utc));

        br.Date.Should().Be(new DateTime(2026, 10, 6));
        br.Hour.Should().Be(23);
    }
}
