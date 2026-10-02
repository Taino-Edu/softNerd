// =============================================================================
// CrediarioAvisoBackgroundService.cs — Roda os lembretes de vencimento do
// crediário a cada 30 minutos. A regra (hora, marcos, canais, dedupe) mora no
// CrediarioAvisoService; aqui é só o relógio.
// =============================================================================

namespace CardGameStore.Services.Implementations;

public class CrediarioAvisoBackgroundService : BackgroundService
{
    private static readonly TimeSpan Intervalo = TimeSpan.FromMinutes(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CrediarioAvisoBackgroundService> _logger;

    public CrediarioAvisoBackgroundService(
        IServiceScopeFactory scopeFactory, ILogger<CrediarioAvisoBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // Espera o startup terminar (criação de tabelas e conversões).
        await Task.Delay(TimeSpan.FromMinutes(3), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<CrediarioAvisoService>();
                await service.ExecutarRodadaAsync(DateTime.UtcNow, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro na rodada de avisos de vencimento do crediário.");
            }

            await Task.Delay(Intervalo, ct);
        }
    }
}
