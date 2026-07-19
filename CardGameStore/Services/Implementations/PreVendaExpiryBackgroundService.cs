// =============================================================================
// PreVendaExpiryBackgroundService.cs — Expira pré-vendas NÃO pagas cujo prazo
// venceu (48h, ou data de rua + 48h): devolve o estoque e puxa o próximo da
// fila. Pré-venda paga (Pix CONCLUIDA) não expira — é venda feita.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class PreVendaExpiryBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PreVendaExpiryBackgroundService> _logger;

    public PreVendaExpiryBackgroundService(IServiceScopeFactory scopeFactory, ILogger<PreVendaExpiryBackgroundService> logger)
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
                await ExpirarVencidasAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao expirar pré-vendas vencidas");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), ct);
        }
    }

    private async Task ExpirarVencidasAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db         = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var productSvc = scope.ServiceProvider.GetRequiredService<IProductService>();

        var agora = DateTime.UtcNow;

        var vencidas = await db.ProductReservations
            .Where(r => r.Kind == "pre_venda" && r.Status == "active"
                     && r.ExpiresAt != null && r.ExpiresAt < agora)
            .Take(100)
            .ToListAsync();

        if (vencidas.Count == 0) return;

        // Grupos com Pix pago — pré-venda paga não expira, só limpa o prazo.
        var groupIds = vencidas.Select(r => r.ReservationGroupId).Distinct().ToList();
        var gruposPagos = await db.PixCobrancas
            .Where(p => groupIds.Contains(p.ReservationGroupId!.Value) && p.Status == "CONCLUIDA")
            .Select(p => p.ReservationGroupId!.Value)
            .Distinct()
            .ToListAsync();

        // Verificação dupla: grupo com cobrança ainda ATIVA no banco local pode ter
        // sido pago sem ninguém de tela aberta — última consulta ao Inter antes de
        // devolver o estoque. Se pagou, a baixa limpa o ExpiresAt e o item não expira.
        var gruposSemBaixa = groupIds.Except(gruposPagos).ToList();
        if (gruposSemBaixa.Count > 0)
        {
            var pixAtivas = await db.PixCobrancas
                .Where(p => p.ReservationGroupId != null
                         && gruposSemBaixa.Contains(p.ReservationGroupId.Value)
                         && p.Status == "ATIVA")
                .ToListAsync();

            if (pixAtivas.Count > 0)
            {
                var reconciliation = scope.ServiceProvider.GetRequiredService<IPixReconciliationService>();
                foreach (var pix in pixAtivas)
                {
                    try
                    {
                        var resultado = await reconciliation.ReconciliarAsync(pix);
                        if (resultado.Status == "CONCLUIDA")
                            gruposPagos.Add(pix.ReservationGroupId!.Value);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Verificação final do Pix {TxId} falhou — grupo segue o fluxo normal de expiração", pix.TxId);
                    }
                }
            }
        }

        var produtosAfetados = new HashSet<Guid>();
        var expiradas = 0;

        foreach (var r in vencidas)
        {
            if (gruposPagos.Contains(r.ReservationGroupId))
            {
                r.ExpiresAt = null; // paga — venda feita, aguardando retirada
                continue;
            }

            r.Status      = "expired";
            r.CancelledAt = agora;

            // Devolve o estoque (produto ou variante)
            if (r.VariantId.HasValue)
                await db.ProductVariants
                    .Where(v => v.Id == r.VariantId.Value)
                    .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + r.Quantity));
            else
                await db.Products
                    .Where(p => p.Id == r.ProductId)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + r.Quantity));

            produtosAfetados.Add(r.ProductId);
            expiradas++;
        }

        await db.SaveChangesAsync();

        // Estoque voltou → puxa o próximo da fila de cada produto.
        foreach (var productId in produtosAfetados)
        {
            try { await productSvc.ProcessarChegadaFilaAsync(productId); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao puxar fila do produto {ProductId} após expiração", productId);
            }
        }

        if (expiradas > 0)
        {
            _logger.LogInformation("Expiração de pré-vendas: {Qtd} expirada(s) e estoque devolvido.", expiradas);

            // Avisa o admin (estoque aberto) que os números mudaram — recarrega sem F5.
            var hub = scope.ServiceProvider.GetRequiredService<IHubContext<ComandaHub>>();
            await hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("StockChanged", new { });
        }
    }
}
