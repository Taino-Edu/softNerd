// =============================================================================
// DescontoPixPedido.cs — o desconto do Pix que a loja anuncia, aplicado na cobrança do pedido
//
// A vitrine sempre mostrou "R$ 35,91 no Pix · 10% OFF" e a sacola "No Pix R$ 225,05", mas o Pix
// gerado pelo site cobrava o preço cheio (o desconto era só texto, pensado pro balcão). Achado no
// teste do fluxo do cliente (06/11, Codex no #147). Com a chave pix-pedido-com-desconto ligada, o
// QR do pedido sai com o desconto, pela MESMA regra da vitrine (frontend/lib/precoVitrine.ts):
//   percentual: o do produto → o da categoria → o da categoria pai → o padrão da loja;
//   0 no produto/categoria é "sem desconto" de verdade (só null herda);
//   preço no Pix: por unidade, centavo pra baixo (a favor do cliente), vezes a quantidade.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Pedidos;

public static class DescontoPixPedido
{
    /// <summary>Percentual do Pix de um produto — espelho de resolvePixPercent da vitrine.</summary>
    public static decimal Percentual(Product? produto, IReadOnlyList<ProductCategory> categorias, decimal padraoLoja)
    {
        if (produto?.PixDiscountPercent is { } doItem) return Limitar(doItem);

        var nome = produto?.Category;
        var cat = string.IsNullOrWhiteSpace(nome)
            ? null
            : categorias.FirstOrDefault(c => string.Equals(c.Name, nome, StringComparison.OrdinalIgnoreCase));
        if (cat is null) return Limitar(padraoLoja);
        if (cat.PixDiscountPercent is { } daCategoria) return Limitar(daCategoria);

        var pai = cat.ParentCategoryId is { } paiId ? categorias.FirstOrDefault(c => c.Id == paiId) : null;
        return Limitar(pai?.PixDiscountPercent ?? padraoLoja);
    }

    /// <summary>Preço de UMA unidade no Pix, em centavos — centavo pra baixo, como a vitrine.</summary>
    public static int PrecoNoPix(int precoUnitarioEmCentavos, decimal percentual) =>
        (int)Math.Floor(precoUnitarioEmCentavos * (100m - Limitar(percentual)) / 100m);

    /// <summary>
    /// Quanto o Pix dos itens cobra e quanto isso desconta do preço congelado do pedido.
    /// Carrega categorias e o padrão da loja do banco; os itens precisam vir com o Product.
    /// </summary>
    public static async Task<(int Cobrar, int Desconto)> CalcularAsync(
        AppDbContext db, IReadOnlyCollection<ProductReservation> itens, CancellationToken ct = default)
    {
        var categorias = await db.ProductCategories.AsNoTracking().ToListAsync(ct);
        var padrao = await db.SiteConfigs.AsNoTracking()
            .Where(s => s.Id == SiteConfig.SingletonId)
            .Select(s => (decimal?)s.PixDiscountPercent)
            .FirstOrDefaultAsync(ct) ?? new SiteConfig().PixDiscountPercent;

        int cheio = 0, cobrar = 0;
        foreach (var r in itens)
        {
            var unitario = PedidoVendaService.PrecoDoPedido(r);
            cheio  += unitario * r.Quantity;
            cobrar += PrecoNoPix(unitario, Percentual(r.Product, categorias, padrao)) * r.Quantity;
        }
        return (cobrar, cheio - cobrar);
    }

    private static decimal Limitar(decimal pct) => Math.Clamp(pct, 0m, 100m);
}
