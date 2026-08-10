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

    /// <summary>Teto de estoque de um produto. Sem ele um produto podia nascer com
    /// int.MaxValue e o primeiro ajuste de +1 estourar o `integer` do Postgres
    /// ("22003: integer out of range", que virava um 500 genérico).</summary>
    internal const int MaxEstoque = 100_000_000;

    /// <summary>Teto do delta de um único ajuste de estoque.</summary>
    private const int MaxAjusteEstoque = 1_000_000;

    public async Task<Product> CreateAsync(Product product)
    {
        ValidarDadosComerciais(product);
        NormalizarDadosFiscais(product);

        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return product;
    }

    public async Task<Product> UpdateAsync(Product updated)
    {
        ValidarDadosComerciais(updated);
        NormalizarDadosFiscais(updated);

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
        // Null aqui é decisão do lojista ("não parcelar este item"), não campo omitido.
        existing.MaxInstallments      = updated.MaxInstallments;
        existing.Ncm                  = updated.Ncm;
        existing.Cest                 = updated.Cest;
        existing.NaturezaOperacaoId   = updated.NaturezaOperacaoId;
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
        if (Math.Abs((long)quantityDelta) > MaxAjusteEstoque)
            throw new ArgumentException(
                $"Ajuste de estoque limitado a {MaxAjusteEstoque:N0} unidades por vez — " +
                $"valor informado: {quantityDelta:N0}.");

        var estoqueAntes = await _db.Products
            .Where(p => p.Id == id)
            .Select(p => (int?)p.StockQuantity)
            .FirstOrDefaultAsync();

        // Os dois limites viram comparação contra um valor já calculado aqui, em vez de
        // somar dentro do SQL: `estoque + delta` no WHERE é justamente a conta que
        // estourava o `integer` do Postgres antes de qualquer filtro. Com o WHERE
        // garantindo estoque <= teto - delta, a soma do SET nunca passa de MaxEstoque.
        var estoqueMinimoNecessario = -(long)quantityDelta;              // estoque + delta >= 0
        var estoqueMaximoPermitido  = MaxEstoque - (long)quantityDelta;

        // UPDATE atômico — garante que estoque nunca fica negativo mesmo sob carga concorrente.
        // Retorna 0 rows se o produto não existe, não está ativo ou o delta sairia do intervalo.
        var rows = await _db.Products
            .Where(p => p.Id == id && p.IsActive &&
                        p.StockQuantity >= estoqueMinimoNecessario &&
                        p.StockQuantity <= estoqueMaximoPermitido)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.StockQuantity, p => p.StockQuantity + quantityDelta)
                .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));

        // 0 linhas engloba "não existe", "estoque insuficiente" e "passou do teto", e quem
        // chama traduz tudo pra "Estoque insuficiente" — que seria mentira no caso do teto.
        // A leitura extra só acontece nesse caminho de falha.
        if (rows == 0 && quantityDelta > 0)
        {
            var estoqueAtual = await _db.Products
                .Where(p => p.Id == id && p.IsActive)
                .Select(p => (int?)p.StockQuantity)
                .FirstOrDefaultAsync();

            if (estoqueAtual is int atual && atual > estoqueMaximoPermitido)
                throw new ArgumentException(
                    $"Estoque ficaria em {atual + (long)quantityDelta:N0}, acima do limite de {MaxEstoque:N0} unidades.");
        }

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

    // -------------------------------------------------------------------------
    // Validação e normalização (portadas do Tenant-ERP_Model — ver FISCAL-CHANGELOG.md)
    // -------------------------------------------------------------------------

    /// <summary>
    /// Sem isto a API aceitava preço negativo e a venda avulsa registrava um total
    /// negativo no caixa (produto de -R$ 999 vendido ⇒ totalInCents -99900). O frontend
    /// já avisava, mas quem chama a API direto (import, integração) passava reto.
    /// </summary>
    private static void ValidarDadosComerciais(Product product)
    {
        if (product.PriceInCents < 0)
            throw new ArgumentException("Preço de venda não pode ser negativo.");
        if (product.CostPriceInCents < 0)
            throw new ArgumentException("Preço de custo não pode ser negativo.");
        if (product.DiscountPriceInCents is < 0)
            throw new ArgumentException("Preço promocional não pode ser negativo.");
        if (product.StockQuantity < 0)
            throw new ArgumentException("Estoque não pode ser negativo.");
        if (product.MinimumStock < 0)
            throw new ArgumentException("Estoque mínimo não pode ser negativo.");
        if (product.StockQuantity > MaxEstoque)
            throw new ArgumentException($"Estoque limitado a {MaxEstoque:N0} unidades.");
        if (product.MinimumStock > MaxEstoque)
            throw new ArgumentException($"Estoque mínimo limitado a {MaxEstoque:N0} unidades.");
        if (product.MaxInstallments is < 1 or > 24)
            throw new ArgumentException("Parcelamento deve ficar entre 1x e 24x (ou vazio, pra não parcelar).");
    }

    /// <summary>
    /// Tira a pontuação de NCM/CEST antes de persistir ("1905.90.90" → "19059090") e
    /// valida o tamanho aqui, no service — não via [MaxLength] no modelo, que dispararia
    /// a validação do ApiController no model binding e devolveria a mensagem genérica
    /// do .NET em vez desta, em português.
    /// </summary>
    private static void NormalizarDadosFiscais(Product product)
    {
        product.Ncm  = SomenteDigitosOuNull(product.Ncm);
        product.Cest = SomenteDigitosOuNull(product.Cest);

        if (product.Ncm is not null && product.Ncm.Length != 8)
            throw new ArgumentException(
                $"NCM deve conter exatamente 8 dígitos — foram informados {product.Ncm.Length}. " +
                "Digite só os números, sem pontos.");
        if (product.Cest is not null && product.Cest.Length != 7)
            throw new ArgumentException(
                $"CEST deve conter exatamente 7 dígitos — foram informados {product.Cest.Length}. " +
                "Digite só os números, sem pontos.");
    }

    private static string? SomenteDigitosOuNull(string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor)) return null;
        return new string(valor.Where(char.IsDigit).ToArray());
    }
}
