// =============================================================================
// VigiaBackgroundService.cs — roda o Vigia a cada 10 minutos (chave "vigia-sistema")
// Espera 2 min antes da 1ª volta: na troca sem queda a API velha e a nova ficam no ar
// juntas por até 1 min (RobosNaTrocaSemQuedaTests).
// =============================================================================

namespace CardGameStore.Services.Vigia;

public class VigiaBackgroundService(IServiceScopeFactory scopeFactory, ILogger<VigiaBackgroundService> logger) : BackgroundService
{
    public static readonly TimeSpan Intervalo = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var novos = await scope.ServiceProvider.GetRequiredService<VigiaService>().RodarAsync(ct);
                if (novos > 0) logger.LogWarning("Vigia: {Novos} alerta(s) novo(s).", novos);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Vigia: a volta falhou.");
            }

            await Task.Delay(Intervalo, ct);
        }
    }
}
