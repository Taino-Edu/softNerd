// =============================================================================
// FiscalXmlExportBackgroundService.cs — Todo dia 1 (fuso de Brasília), gera e
// envia por email ao contador o ZIP com os XMLs do mês anterior.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class FiscalXmlExportBackgroundService : BackgroundService
{
    // Fuso horário de Brasília — funciona em Linux (IANA) e Windows (ID legado).
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FiscalXmlExportBackgroundService> _logger;

    public FiscalXmlExportBackgroundService(IServiceScopeFactory scopeFactory, ILogger<FiscalXmlExportBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMinutes(3), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await CheckAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro no envio mensal automático de XMLs fiscais");
            }

            await Task.Delay(TimeSpan.FromHours(12), ct);
        }
    }

    private async Task CheckAsync()
    {
        var hojeBrasil = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone).Date;
        if (hojeBrasil.Day != 1) return;

        using var scope  = _scopeFactory.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email  = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var export = scope.ServiceProvider.GetRequiredService<FiscalXmlExportService>();

        var cfg = await db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        if (cfg is null || !cfg.ModuloFiscalAtivo || string.IsNullOrWhiteSpace(cfg.EmailContador)) return;

        var jaEnviouEsseMes = cfg.UltimoEnvioMensalXmls.HasValue
            && cfg.UltimoEnvioMensalXmls.Value.Year  == hojeBrasil.Year
            && cfg.UltimoEnvioMensalXmls.Value.Month == hojeBrasil.Month;
        if (jaEnviouEsseMes) return;

        var (inicio, fim, mesAnterior) = CalcularJanelaMesAnterior(hojeBrasil, BrazilZone);

        var zipBytes = await export.GerarZipAsync(inicio, fim);
        var mesRef   = mesAnterior.ToString("MM/yyyy");
        var fileName = $"xmls-fiscais-{mesAnterior:yyyy-MM}.zip";

        await email.SendXmlsMensalContadorAsync(cfg.EmailContador, mesRef, zipBytes, fileName);

        cfg.UltimoEnvioMensalXmls = DateTime.UtcNow;
        cfg.UpdatedAt             = DateTime.UtcNow;
        await db.SaveChangesAsync();

        _logger.LogInformation("ZIP mensal de XMLs fiscais ({Mes}) enviado para {Email}", mesRef, cfg.EmailContador);
    }

    /// <summary>
    /// Constrói o início/fim (em UTC) do mês anterior a partir da data local de Brasília,
    /// convertendo corretamente pelo fuso em vez de marcar o valor local como se já fosse UTC
    /// (isso deslocava a janela em 3h e misclassificava notas perto da virada do mês).
    /// </summary>
    public static (DateTime InicioUtc, DateTime FimUtc, DateTime MesAnterior) CalcularJanelaMesAnterior(
        DateTime hojeBrasil, TimeZoneInfo brazilZone)
    {
        var mesAnterior = hojeBrasil.AddMonths(-1);
        var inicioLocal = new DateTime(mesAnterior.Year, mesAnterior.Month, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var inicioUtc   = TimeZoneInfo.ConvertTimeToUtc(inicioLocal, brazilZone);
        var fimUtc      = TimeZoneInfo.ConvertTimeToUtc(inicioLocal.AddMonths(1), brazilZone);
        return (inicioUtc, fimUtc, mesAnterior);
    }
}
