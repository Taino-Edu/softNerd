// =============================================================================
// MaisVendidos — ranking público dos produtos que mais saem (seção "Mais vendidos" da home)
//
// Pedido do Maikon (17/11): a home precisa mostrar os mais vendidos e as novidades. Conta o que
// saiu de verdade nos últimos 90 dias: itens de comanda FECHADA (estornada/cancelada não conta) e
// vendas do Frente de Caixa não canceladas. Pedido do site entra quando vira venda no balcão.
//
// Só devolve a ORDEM dos produtos (ids), nunca quantidade nem receita: o endpoint é público e
// faturamento por produto é dado da loja. O site cruza os ids com a vitrine que já carregou.
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

        var doBalcao = (await vendas.GetRecentAsync(5000, desde))
            .Where(v => !v.Cancelada)
            .SelectMany(v => v.Items.Select(i => new { i.ProductId, i.Quantity, v.SoldAt }))
            .Where(i => i.ProductId != Guid.Empty)
            .GroupBy(i => i.ProductId)
            .Select(g => new { Id = g.Key, Qtd = g.Sum(i => i.Quantity), Ultima = (DateTime?)g.Max(i => i.SoldAt) });

        return daComanda.Concat(doBalcao)
            .GroupBy(x => x.Id)
            .Select(g => new { Id = g.Key, Qtd = g.Sum(x => x.Qtd), Ultima = g.Max(x => x.Ultima) })
            .Where(x => x.Qtd > 0)
            .OrderByDescending(x => x.Qtd)
            .ThenByDescending(x => x.Ultima)
            .Take(limite)
            .Select(x => x.Id)
            .ToList();
    }
}
