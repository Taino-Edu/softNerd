// =============================================================================
// SefazDistBackgroundService.cs — "DDA" fiscal: roda a Manifestação do
// Destinatário a cada 2 horas (consulta NSU → ciência → XML → contas a pagar).
//
// Intervalo de 2h respeita a regra de consumo indevido da SEFAZ (cStat 656,
// que bloqueia por 1h quem consulta repetidamente sem documentos novos).
// Só executa quando a integração "sefaz" está ativa no painel e o certificado
// A1 está configurado — caso contrário o ciclo é um no-op silencioso.
// =============================================================================

using CardGameStore.Data;
using Microsoft.EntityFrameworkCore;
using CardGameStore.Services.Vigia;

namespace CardGameStore.Services.Implementations;

public class SefazDistBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SefazDistBackgroundService> _logger;

    public SefazDistBackgroundService(IServiceScopeFactory scopeFactory, ILogger<SefazDistBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        BatimentoRobos.Iniciou("SEFAZ (notas recebidas)", TimeSpan.FromMinutes(3), TimeSpan.FromHours(2)); // Vigia: robô parado vira alerta
        await Task.Delay(TimeSpan.FromMinutes(3), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await SincronizarAsync(ct);
                BatimentoRobos.Bateu("SEFAZ (notas recebidas)");
            }
            catch (Exception ex)
            {
                BatimentoRobos.Falhou("SEFAZ (notas recebidas)", ex);
                _logger.LogError(ex, "Erro no ciclo automático de Manifestação do Destinatário");
            }

            await Task.Delay(TimeSpan.FromHours(2), ct);
        }
    }

    private async Task SincronizarAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sefaz = scope.ServiceProvider.GetRequiredService<SefazNfeService>();

        var ativa = await db.IntegrationConfigs
            .AnyAsync(c => c.Source == "sefaz" && c.IsActive, ct);
        if (!ativa) return;

        if (!await sefaz.IsConfiguredAsync()) return;

        await sefaz.SincronizarAsync(ct);
    }
}
