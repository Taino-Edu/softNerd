// =============================================================================
// PreVendaExpiryBackgroundService.cs — Expira pré-vendas NÃO pagas cujo prazo
// venceu (48h, ou data de rua + 48h): devolve o estoque e puxa o próximo da
// fila. Pré-venda paga (Pix CONCLUIDA) não expira — é venda feita.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
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
            _logger.LogInformation("Expiração de pré-vendas: {Qtd} expirada(s) e estoque devolvido.", expiradas);
    }
}
