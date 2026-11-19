// =============================================================================
// PrecoCartasBackgroundService.cs — robô "Preço das cartas" (v1.92.0, chave "preco-referencia-cartas")
//
// O catálogo (tcgcsv.com) publica os preços do dia por volta das 20h UTC (17h de Brasília). O robô acorda
// de hora em hora e, passadas as 20h30 UTC, roda a atualização se ainda não rodou desde então (marco
// "preco-cartas" em marcos_operacao). A regra mora no PrecoCartasService; aqui é só o relógio.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Vigia;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class PrecoCartasBackgroundService : BackgroundService
{
    public const string Nome = "Preço das cartas";
    private static readonly TimeSpan Intervalo = TimeSpan.FromHours(1);
    /// <summary>Hora (UTC) a partir da qual os preços do dia já saíram no catálogo, com folga.</summary>
    private static readonly TimeSpan HoraDosPrecos = new(20, 30, 0);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PrecoCartasBackgroundService> _logger;

    public PrecoCartasBackgroundService(IServiceScopeFactory scopeFactory, ILogger<PrecoCartasBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    /// <summary>Já é hora e a última rodada é de antes da publicação mais recente?</summary>
    public static bool Devido(DateTime agoraUtc, DateTime? ultimaRodadaUtc)
    {
        var publicacao = agoraUtc.Date + HoraDosPrecos;
        if (agoraUtc < publicacao) publicacao = publicacao.AddDays(-1);
        return ultimaRodadaUtc is null || ultimaRodadaUtc < publicacao;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        BatimentoRobos.Iniciou(Nome, TimeSpan.FromMinutes(5), Intervalo); // Vigia: robô parado vira alerta
        await Task.Delay(TimeSpan.FromMinutes(5), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var ultima = await db.MarcosOperacao.AsNoTracking().Where(m => m.Chave == PrecoCartasService.MarcoRodada)
                    .Select(m => (DateTime?)m.Quando).FirstOrDefaultAsync(ct);
                var voltaBoa = true;
                if (Devido(DateTime.UtcNow, ultima))
                {
                    var r = await scope.ServiceProvider.GetRequiredService<PrecoCartasService>().AtualizarAsync(ct: ct);
                    _logger.LogInformation("Preço das cartas: {Mensagem}", r.Mensagem);
                    // Cotação fora do ar (não rodou, mas leu cotação) não é volta boa: o Vigia avisa se repetir.
                    // Chave desligada não rodou e nem leu cotação — isso é normal.
                    if (!r.Rodou && r.Cotacao is not null) { BatimentoRobos.Falhou(Nome, r.Mensagem); voltaBoa = false; }
                }
                if (voltaBoa) BatimentoRobos.Bateu(Nome);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                BatimentoRobos.Falhou(Nome, ex);
                _logger.LogError(ex, "Erro na rodada do preço das cartas.");
            }

            await Task.Delay(Intervalo, ct);
        }
    }
}
