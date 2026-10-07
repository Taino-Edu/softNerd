// =============================================================================
// Brasilia.cs — Fuso de Brasília num lugar só
//
// O servidor roda em UTC; a loja vive em Brasília. Toda conta de "hoje", "dia
// tal" ou "mês tal" passa por aqui. Antes eram 11 cópias (GetBrazilZone em 9
// arquivos, mais o fiscal e o e-mail), e cada uma podia divergir.
// Espelho no front: frontend/lib/format.ts.
// =============================================================================

namespace CardGameStore.Common;

public static class Brasilia
{
    /// <summary>"America/Sao_Paulo" (Linux/ICU) com alternativa pro nome do Windows.</summary>
    public static readonly TimeZoneInfo Zona = CarregarZona();

    private static TimeZoneInfo CarregarZona()
    {
        try   { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    /// <summary>Instante UTC (como vem do banco) no relógio de Brasília.</summary>
    public static DateTime ParaBrasilia(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zona);

    public static DateTime Agora() => ParaBrasilia(DateTime.UtcNow);

    /// <summary>Data de hoje no calendário de Brasília (hora zerada).</summary>
    public static DateTime Hoje() => Agora().Date;

    /// <summary>
    /// Intervalo UTC de um dia de Brasília (hoje, se não informado).
    /// Ex.: 29/05 → [29/05 03:00 UTC, 30/05 03:00 UTC).
    /// </summary>
    public static (DateTime InicioUtc, DateTime FimUtc) DiaUtc(DateTime? dia = null)
    {
        var data   = (dia ?? Hoje()).Date;
        var inicio = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(data, DateTimeKind.Unspecified), Zona);
        return (inicio, inicio.AddDays(1));
    }
}
