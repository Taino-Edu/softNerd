// =============================================================================
// FiscalRetryBackgroundService.cs — Contingência: reprocessa periodicamente
// notas PendenteEmissao (ex: SEFAZ estava fora do ar na tentativa original).
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class FiscalRetryBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FiscalRetryBackgroundService> _logger;

    public FiscalRetryBackgroundService(IServiceScopeFactory scopeFactory, ILogger<FiscalRetryBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMinutes(5), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ReprocessarPendentesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro no reprocessamento automático de notas fiscais pendentes");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), ct);
        }
    }

    private async Task ReprocessarPendentesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db      = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var emissao = scope.ServiceProvider.GetRequiredService<INfceEmissionService>();

        var moduloAtivo = await db.FiscalConfigs
            .Where(c => c.Id == FiscalConfig.SingletonId)
            .Select(c => (bool?)c.ModuloFiscalAtivo)
            .FirstOrDefaultAsync();
        if (moduloAtivo == false)
        {
            _logger.LogDebug("Reprocessamento fiscal ignorado: módulo bloqueado.");
            return;
        }

        var pendentesIds = await db.NotasFiscaisEmitidas
            .Where(n => n.Status == NotaFiscalStatus.PendenteEmissao || n.Status == NotaFiscalStatus.AutorizadaContingencia)
            .OrderBy(n => n.CreatedAt)
            .Take(50) // não tenta reprocessar milhares de uma vez
            .Select(n => n.Id)
            .ToListAsync();

        if (pendentesIds.Count == 0) return;

        int autorizadas = 0;
        foreach (var id in pendentesIds)
        {
            var nota = await emissao.ReprocessarAsync(id);
            if (nota.Status == NotaFiscalStatus.Autorizada) autorizadas++;
        }

        _logger.LogInformation(
            "Reprocessamento automático: {Total} pendente(s) verificada(s), {Autorizadas} autorizada(s) agora.",
            pendentesIds.Count, autorizadas);
    }
}
