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
        await ApplyReservedStockAsync(list);
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
        await ApplyReservedStockAsync(list);
        return list;
    }

    public async Task<IEnumerable<Product>> GetByCategoryAsync(string category)
    {
        var list = await _db.Products
            .Where(p => p.IsActive && p.ShowOnMarketplace && p.Category == category)
            .AsNoTracking()
            .ToListAsync();
        await ApplyVariantStockAsync(list);
        await ApplyReservedStockAsync(list);
        return list;
    }

    public async Task<Product?> GetByIdAsync(Guid id)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
        if (p is null) return null;
        if (p.HasVariants)
            p.StockQuantity = await _db.Set<ProductVariant>()
                .Where(v => v.ProductId == id)
                .SumAsync(v => v.StockQuantity);
        await ApplyReservedStockAsync([p]);
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

    // Soma reservas ativas (não expiradas) por produto numa query agrupada só — mesma ideia
    // do ApplyVariantStockAsync. Reserva com variante também conta contra o total do produto,
    // assim como o estoque exibido é a soma das variantes.
    private async Task ApplyReservedStockAsync(List<Product> products)
    {
        var ids = products.Select(p => p.Id).ToList();
        if (ids.Count == 0) return;

        var agora = DateTime.UtcNow;
        var sums = await _db.ProductReservations
            .Where(r => ids.Contains(r.ProductId) && r.Status == "active" && r.ExpiresAt > agora)
            .GroupBy(r => r.ProductId)
            .Select(g => new { g.Key, Total = g.Sum(r => r.Quantity) })
            .ToDictionaryAsync(x => x.Key, x => x.Total);

        foreach (var p in products)
            p.ReservedQuantity = sums.TryGetValue(p.Id, out var sum) ? sum : 0;
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
        existing.UpdatedAt            = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Reestoque (0 → positivo): avisa quem está na fila de espera. Nunca
        // derruba o update do produto — notificação é melhor-esforço.
        if (estoqueAntes <= 0 && existing.StockQuantity > 0)
        {
            try { await NotificarFilaDeEsperaAsync(existing); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao notificar fila de espera do produto {ProductId}", existing.Id);
            }
        }

        return existing;
    }

    /// <summary>
    /// Notifica todos da fila que ainda não foram avisados (in-app + push + email)
    /// e marca NotifiedAt — quem entrar na fila depois é avisado no próximo reestoque.
    /// </summary>
    private async Task NotificarFilaDeEsperaAsync(Product p)
    {
        var fila = await _db.ProductWaitLists
            .Include(w => w.User)
            .Where(w => w.ProductId == p.Id && w.NotifiedAt == null)
            .OrderBy(w => w.Position)
            .ToListAsync();
        if (fila.Count == 0) return;

        var titulo = "Chegou! 🎉";
        var corpo  = $"{p.Name} está disponível — você estava na fila de espera. Garanta o seu!";
        var link   = $"/produtos/{p.Id}";

        foreach (var w in fila)
        {
            if (w.UserId is Guid uid)
                _db.Notifications.Add(new Notification
                {
                    UserId = uid, Title = titulo, Body = corpo, Link = link, ImageUrl = p.ImageUrl,
                });
            w.NotifiedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();

        var userIds = fila.Where(w => w.UserId != null).Select(w => w.UserId!.Value).Distinct().ToList();
        if (userIds.Count > 0)
            await _push.SendToManyAsync(userIds, titulo, corpo, link, p.ImageUrl);

        var comEmail = fila
            .Where(w => !string.IsNullOrWhiteSpace(w.User?.Email))
            .Select(w => (w.User!.Email!, w.User.Name))
            .Distinct()
            .ToList();
        if (comEmail.Count > 0)
            await _email.SendAnuncioAsync(comEmail, $"Chegou: {p.Name}", corpo, p.ImageUrl, link);

        _logger.LogInformation("Fila de espera de {Produto}: {Qtd} pessoa(s) avisada(s) do reestoque.", p.Name, fila.Count);
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

        // UPDATE atômico — garante que estoque nunca fica negativo mesmo sob carga concorrente.
        // Retorna 0 rows se o produto não existe, não está ativo ou o delta resultaria em negativo.
        var rows = await _db.Products
            .Where(p => p.Id == id && p.IsActive && p.StockQuantity + quantityDelta >= 0)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.StockQuantity, p => p.StockQuantity + quantityDelta)
                .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));

        return rows > 0;
    }
}
