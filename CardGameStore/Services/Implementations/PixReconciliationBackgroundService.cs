// =============================================================================
// PixReconciliationBackgroundService.cs — Robô de confirmação de Pix.
// Não existe webhook do Inter: sem este robô, a baixa só acontecia com alguém
// de tela aberta (pré-venda paga expirava, comanda paga ficava aberta, crediário
// não baixava). A cada 5 min reconcilia as cobranças ATIVA das últimas 24h,
// uma a uma — erro em uma loga e segue pras demais.
// =============================================================================

using System.Net;
using CardGameStore.Data;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class PixReconciliationBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PixReconciliationBackgroundService> _logger;

    public PixReconciliationBackgroundService(
        IServiceScopeFactory scopeFactory, ILogger<PixReconciliationBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // aguarda 1 min após startup para não competir com EnsureCreated
        await Task.Delay(TimeSpan.FromMinutes(1), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ReconciliarPendentesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro no ciclo de reconciliação de cobranças Pix");
            }

            await Task.Delay(TimeSpan.FromMinutes(5), ct);
        }
    }

    private async Task ReconciliarPendentesAsync()
    {
        // Janela de 24h: a cobrança Pix imediata expira em 1h — mais velha que isso
        // ou já foi removida pelo PSP ou nunca será paga, não vale consultar pra sempre.
        var limite = DateTime.UtcNow.AddHours(-24);

        List<Guid> pendentes;
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            pendentes = await db.PixCobrancas
                .Where(p => p.Status == "ATIVA" && p.CriadoEm >= limite)
                .OrderBy(p => p.CriadoEm)
                .Take(100)
                .Select(p => p.Id)
                .ToListAsync();
        }

        // Escopo novo por cobrança: se uma falhar, o DbContext das demais não fica sujo.
        foreach (var id in pendentes)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db  = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var svc = scope.ServiceProvider.GetRequiredService<IPixReconciliationService>();

                var pix = await db.PixCobrancas.FindAsync(id);
                // A tela pode ter confirmado no meio do ciclo — relê o status antes de consultar o Inter.
                if (pix is null || pix.Status != "ATIVA") continue;

                var result = await svc.ReconciliarAsync(pix);
                if (result.BaixaEfetuada)
                    _logger.LogInformation("Pix {TxId} ({Origem}) confirmado pelo robô — baixa efetuada.", pix.TxId, pix.Origem);
            }
            // 429 = o Inter cortou por excesso de requisição. Insistir nas cobranças
            // restantes só prolonga o bloqueio (a mesma lição do 429 da AwesomeAPI em
            // 30/07/2026): aborta o ciclo e tenta tudo de novo daqui a 5 minutos.
            catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
            {
                _logger.LogWarning(
                    "Inter respondeu 429 (excesso de requisições) ao reconciliar Pix {Id}. " +
                    "Ciclo interrompido com {Restantes} cobrança(s) na fila — retomando no próximo ciclo.",
                    id, pendentes.Count - pendentes.IndexOf(id) - 1);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao reconciliar cobrança Pix {Id} — seguindo para as demais", id);
            }

            // Espaçamento entre chamadas: o lote pode ter até 100 cobranças e antes disso
            // elas saíam em rajada, sem intervalo nenhum — foi o que derrubou o Inter em
            // 429 durante os testes de 30/07/2026. 250ms distribui o lote cheio em ~25s,
            // bem dentro da janela de 5 min do ciclo.
            await Task.Delay(TimeSpan.FromMilliseconds(250));
        }
    }
}
