// =============================================================================
// MaisVendidos — ranking público dos produtos que mais saem (seção "Mais vendidos" da home)
//
// Pedido do Maikon (17/11): a home precisa mostrar os mais vendidos e as novidades. Conta o que
// saiu de verdade nos últimos 90 dias: itens de comanda FECHADA (estornada/cancelada não conta) e
// vendas do Frente de Caixa não canceladas. Pedido do site entra quando vira venda no balcão.
//
// Só devolve a ORDEM dos produtos (ids), nunca quantidade nem receita: o endpoint é público e
// faturamento por produto é dado da loja. O site cruza os ids com a vitrine que já carregou.
// Só entra quem a vitrine mostra (ativo, no site e com estoque, somando as variações como o
// ProductService): senão os campeões esgotados ocupavam as vagas e a seção sumia (revisão do PR #175).
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public static class MaisVendidos
{
    public const int DiasDeJanela = 90;

    /// <summary>Ids dos produtos mais vendidos (mais unidades primeiro; empate: o que vendeu por último).</summary>
    public static async Task<List<Guid>> CalcularAsync(AppDbContext db, IVendaAvulsaService vendas, int limite, DateTime agoraUtc)
    {
        var desde = agoraUtc.AddDays(-DiasDeJanela);

        var daComanda = await db.ComandaItems.AsNoTracking()
            .Where(i => i.ProductId != null
                     && i.Comanda.Status == ComandaStatus.Fechada
                     && i.Comanda.ClosedAt >= desde)
            .GroupBy(i => i.ProductId!.Value)
            .Select(g => new { Id = g.Key, Qtd = g.Sum(i => i.Quantity), Ultima = g.Max(i => i.Comanda.ClosedAt) })
            .ToListAsync();

        // A janela inteira, sem teto de quantidade: com um teto (era 5000), loja movimentada perdia o começo
        // dos 90 dias no balcão e comparava com as comandas do período todo (revisão do PR #175)
        var doBalcao = (await vendas.GetRecentAsync(int.MaxValue, desde))
            .Where(v => !v.Cancelada)
            .SelectMany(v => v.Items.Select(i => new { i.ProductId, i.Quantity, v.SoldAt }))
            .Where(i => i.ProductId != Guid.Empty)
            .GroupBy(i => i.ProductId)
            .Select(g => new { Id = g.Key, Qtd = g.Sum(i => i.Quantity), Ultima = (DateTime?)g.Max(i => i.SoldAt) });

        var ranking = daComanda.Concat(doBalcao)
            .GroupBy(x => x.Id)
            .Select(g => new { Id = g.Key, Qtd = g.Sum(x => x.Qtd), Ultima = g.Max(x => x.Ultima) })
            .Where(x => x.Qtd > 0)
            .OrderByDescending(x => x.Qtd)
            .ThenByDescending(x => x.Ultima)
            .Select(x => x.Id)
            .ToList();

        var naVitrine = await NaVitrineAsync(db, ranking);
        return ranking.Where(naVitrine.Contains).Take(limite).ToList();
    }

    /// <summary>Dos ids pedidos, os que a vitrine do site mostra: ativo, no site e com estoque.</summary>
    private static async Task<HashSet<Guid>> NaVitrineAsync(AppDbContext db, List<Guid> ids)
    {
        if (ids.Count == 0) return [];
        var produtos = await db.Products.AsNoTracking()
            .Where(p => ids.Contains(p.Id) && p.IsActive && p.ShowOnMarketplace)
            .Select(p => new { p.Id, p.HasVariants, p.StockQuantity })
            .ToListAsync();

        var comVariacao = produtos.Where(p => p.HasVariants).Select(p => p.Id).ToList();
        var estoqueDasVariacoes = comVariacao.Count == 0 ? new Dictionary<Guid, int>() : await db.Set<ProductVariant>().AsNoTracking()
            .Where(v => comVariacao.Contains(v.ProductId))
            .GroupBy(v => v.ProductId)
            .Select(g => new { g.Key, Total = g.Sum(v => v.StockQuantity) })
            .ToDictionaryAsync(x => x.Key, x => x.Total);

        // Mesma regra do ProductService.ApplyVariantStockAsync: com variações, vale a soma delas
        return produtos
            .Where(p => (p.HasVariants && estoqueDasVariacoes.TryGetValue(p.Id, out var soma) ? soma : p.StockQuantity) > 0)
            .Select(p => p.Id)
            .ToHashSet();
    }
}
