// =============================================================================
// ProductService.cs — Implementação de Produtos (estoque físico)
// =============================================================================
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class ProductService : IProductService
{
    private readonly AppDbContext  _db;
    private readonly IPushService  _push;
    private readonly IEmailService _email;
    private readonly ILogger<ProductService> _logger;

    public ProductService(AppDbContext db, IPushService push, IEmailService email, ILogger<ProductService> logger)
    { _db = db; _push = push; _email = email; _logger = logger; }

    public async Task<IEnumerable<Product>> GetAllActiveAsync()
    {
        var list = await _db.Products
            .Where(p => p.IsActive && p.ShowOnMarketplace)
            .OrderBy(p => p.Name)
            .AsNoTracking()
            .ToListAsync();
        await ApplyVariantStockAsync(list);
        return list;
    }

    public async Task<IEnumerable<Product>> GetAllForAdminAsync()
    {
        var list = await _db.Products
            .Where(p => p.IsActive)
            .OrderBy(p => p.Name)
            .AsNoTracking()
            .ToListAsync();
        await ApplyVariantStockAsync(list);
        return list;
    }

    public async Task<IEnumerable<Product>> GetByCategoryAsync(string category)
    {
        var list = await _db.Products
            .Where(p => p.IsActive && p.ShowOnMarketplace && p.Category == category)
            .AsNoTracking()
            .ToListAsync();
        await ApplyVariantStockAsync(list);
        return list;
    }

    public async Task<Product?> GetByIdAsync(Guid id)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
        if (p?.HasVariants == true)
            p.StockQuantity = await _db.Set<ProductVariant>()
                .Where(v => v.ProductId == id)
                .SumAsync(v => v.StockQuantity);
        return p;
    }

    // Busca soma de estoque por variante em query agrupada — evita Include que causaria
    // referência circular ProductVariant→Product→Variants na serialização JSON.
    private async Task ApplyVariantStockAsync(List<Product> products)
    {
        var ids = products.Where(p => p.HasVariants).Select(p => p.Id).ToList();
        if (ids.Count == 0) return;

        var sums = await _db.Set<ProductVariant>()
            .Where(v => ids.Contains(v.ProductId))
            .GroupBy(v => v.ProductId)
            .Select(g => new { g.Key, Total = g.Sum(v => v.StockQuantity) })
            .ToDictionaryAsync(x => x.Key, x => x.Total);

        foreach (var p in products.Where(p => p.HasVariants))
            if (sums.TryGetValue(p.Id, out var sum))
                p.StockQuantity = sum;
    }

    public async Task<Product> CreateAsync(Product product)
    {
        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return product;
    }

    public async Task<Product> UpdateAsync(Product updated)
    {
        var existing = await _db.Products.FindAsync(updated.Id)
            ?? throw new KeyNotFoundException($"Produto {updated.Id} não encontrado.");

        var estoqueAntes = existing.StockQuantity;

        // Atualização campo a campo — evita sobrescrever com null/0 campos não enviados pelo frontend.
        existing.Name                 = updated.Name;
        existing.Description          = updated.Description;
        existing.Category             = updated.Category;
        existing.Barcode              = updated.Barcode;
        existing.CostPriceInCents     = updated.CostPriceInCents;
        existing.PriceInCents         = updated.PriceInCents;
        existing.DiscountPriceInCents = updated.DiscountPriceInCents;
        existing.StockQuantity        = updated.StockQuantity;
        existing.MinimumStock         = updated.MinimumStock;
        existing.ImageUrl             = updated.ImageUrl;
        existing.ImageUrls            = updated.ImageUrls;
        existing.FullDescription      = updated.FullDescription;
        existing.IsActive             = updated.IsActive;
        existing.IsFeatured           = updated.IsFeatured;
        existing.ShowOnSite           = updated.ShowOnSite;
        existing.ShowOnMarketplace    = updated.ShowOnMarketplace;
        existing.IsPreVenda           = updated.IsPreVenda;
        existing.PreVendaReleaseDate  = updated.PreVendaReleaseDate;
        existing.UpdatedAt            = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Reestoque (0 → positivo): converte a fila em pré-venda na ordem.
        // Nunca derruba o update do produto — conversão é melhor-esforço.
        if (estoqueAntes <= 0 && existing.StockQuantity > 0)
        {
            try { await ProcessarChegadaFilaAsync(existing.Id); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao processar fila de espera do produto {ProductId}", existing.Id);
            }
        }

        return existing;
    }

    /// <summary>
    /// Chegada de estoque: converte a fila (kind=fila, status=waiting — LEGADA, o
    /// site não cria mais fila) em pré-venda na ordem de entrada, baixando o estoque
    /// de cada convertido, até onde o estoque cobrir. Cada convertido vira
    /// status=active (ExpiresAt marca só "ainda não paga") e é notificado
    /// (in-app + push + email). Quem não couber no lote segue na fila.
    ///
    /// Robustez:
    ///  • Tudo dentro de transação na execution strategy — falha no meio não deixa
    ///    estoque baixado sem conversão (era o bug do "estoque some").
    ///  • Reserva com VariantId baixa o estoque DA VARIANTE (ProductVariants),
    ///    não do produto-pai.
    ///  • Claim condicional da reserva (UPDATE ... WHERE status='waiting') impede
    ///    dupla conversão quando duas execuções rodam ao mesmo tempo (restock
    ///    manual + puxada de fila pós-cancelamento): quem perde o claim estorna
    ///    o decremento dentro da mesma transação.
    /// </summary>
    public async Task ProcessarChegadaFilaAsync(Guid productId)
    {
        var p = await _db.Products.FindAsync(productId);
        if (p is null) return;

        // Leitura da fila fora da transação — o claim condicional resolve a corrida.
        var fila = await _db.ProductReservations
            .Where(r => r.ProductId == productId && r.Kind == "fila" && r.Status == "waiting")
            .OrderBy(r => r.ReservedAt)
            .Select(r => new { r.Id, r.VariantId, r.Quantity })
            .ToListAsync();
        if (fila.Count == 0) return;

        var convertidosIds = new List<Guid>();

        var strategy = _db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            foreach (var item in fila)
            {
                // 1) Decremento atômico COM guarda de saldo — na variante quando houver.
                int baixado;
                if (item.VariantId.HasValue)
                    baixado = await _db.ProductVariants
                        .Where(v => v.Id == item.VariantId.Value && v.StockQuantity >= item.Quantity)
                        .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - item.Quantity));
                else
                    baixado = await _db.Products
                        .Where(x => x.Id == productId && x.StockQuantity >= item.Quantity)
                        .ExecuteUpdateAsync(s => s.SetProperty(x => x.StockQuantity, x => x.StockQuantity - item.Quantity));

                if (baixado == 0) break; // lote acabou — resto da fila espera o próximo reestoque

                // 2) Claim atômico da reserva: só converte se AINDA está waiting.
                var agora = DateTime.UtcNow;
                var claimed = await _db.ProductReservations
                    .Where(r => r.Id == item.Id && r.Kind == "fila" && r.Status == "waiting")
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(r => r.Kind, "pre_venda")
                        .SetProperty(r => r.Status, "active")
                        .SetProperty(r => r.ExpiresAt, agora));

                if (claimed == 0)
                {
                    // Outra execução converteu/cancelou esta linha primeiro — estorna
                    // o decremento (mesma transação) e segue pra próxima da fila.
                    if (item.VariantId.HasValue)
                        await _db.ProductVariants
                            .Where(v => v.Id == item.VariantId.Value)
                            .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + item.Quantity));
                    else
                        await _db.Products
                            .Where(x => x.Id == productId)
                            .ExecuteUpdateAsync(s => s.SetProperty(x => x.StockQuantity, x => x.StockQuantity + item.Quantity));
                    continue;
                }

                convertidosIds.Add(item.Id);
            }

            await tx.CommitAsync();
        });

        if (convertidosIds.Count == 0) return;

        // ── Notificações fora da transação (melhor-esforço) ─────────────────
        var convertidos = await _db.ProductReservations
            .Include(r => r.User)
            .Where(r => convertidosIds.Contains(r.Id))
            .ToListAsync();

        var titulo = "Chegou! 🎉";
        var corpo  = $"{p.Name} chegou e sua unidade já está separada! Pague no Pix ou na retirada.";
        var link   = "/cliente/perfil";

        foreach (var r in convertidos)
            _db.Notifications.Add(new Notification
            {
                UserId = r.UserId, Title = titulo, Body = corpo, Link = link, ImageUrl = p.ImageUrl,
            });
        await _db.SaveChangesAsync();

        var userIds = convertidos.Select(r => r.UserId).Distinct().ToList();
        await _push.SendToManyAsync(userIds, titulo, corpo, link, p.ImageUrl);

        var comEmail = convertidos
            .Where(r => !string.IsNullOrWhiteSpace(r.User?.Email))
            .Select(r => (r.User!.Email!, r.User.Name))
            .Distinct()
            .ToList();
        if (comEmail.Count > 0)
            await _email.SendAnuncioAsync(comEmail, $"Chegou: {p.Name}", corpo, p.ImageUrl, link);

        _logger.LogInformation(
            "Fila de {Produto}: {Convertidos} convertidos em pré-venda, {Restantes} seguem na fila.",
            p.Name, convertidos.Count, fila.Count - convertidos.Count);
    }

    public async Task DeactivateAsync(Guid id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product != null) { product.IsActive = false; await _db.SaveChangesAsync(); }
    }

    public async Task<IEnumerable<Product>> GetLowStockAsync() =>
        await _db.Products.Where(p => p.IsActive && p.StockQuantity <= p.MinimumStock).ToListAsync();

    public async Task<Product?> GetByBarcodeAsync(string barcode) =>
        await _db.Products.FirstOrDefaultAsync(p => p.IsActive && p.Barcode == barcode);

    public async Task<bool> AdjustStockAsync(Guid id, int quantityDelta)
    {
        if (quantityDelta == 0) return true;

        var estoqueAntes = await _db.Products
            .Where(p => p.Id == id)
            .Select(p => (int?)p.StockQuantity)
            .FirstOrDefaultAsync();

        // UPDATE atômico — garante que estoque nunca fica negativo mesmo sob carga concorrente.
        // Retorna 0 rows se o produto não existe, não está ativo ou o delta resultaria em negativo.
        var rows = await _db.Products
            .Where(p => p.Id == id && p.IsActive && p.StockQuantity + quantityDelta >= 0)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.StockQuantity, p => p.StockQuantity + quantityDelta)
                .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));

        if (rows == 0) return false;

        // Reestoque (0 → positivo): converte a fila em pré-venda na ordem.
        if (estoqueAntes <= 0)
        {
            try { await ProcessarChegadaFilaAsync(id); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao processar fila de espera do produto {ProductId}", id);
            }
        }

        return true;
    }
}
