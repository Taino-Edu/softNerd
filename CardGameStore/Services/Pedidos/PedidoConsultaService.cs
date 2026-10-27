// =============================================================================
// PedidoConsultaService.cs — leitura dos pedidos do site: os do cliente, a lista
// do admin (com a posição de quem está na fila legada) e o contador do painel.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Pedidos;

public interface IPedidoConsultaService
{
    /// <summary>Quantos clientes esperam na fila de pré-venda (contador do painel).</summary>
    Task<int> ContarFilaPendenteAsync();

    /// <summary>Pré-vendas e fila do cliente, do mais novo pro mais antigo.</summary>
    Task<List<PedidoItemDto>> DoClienteAsync(Guid userId);

    /// <summary>Lista do admin, com filtros e paginação.</summary>
    Task<PedidosPaginaDto> ListarAsync(string? status, string? kind, Guid? userId, Guid? productId, int page, int pageSize);
}

public class PedidoConsultaService(AppDbContext db) : IPedidoConsultaService
{
    public Task<int> ContarFilaPendenteAsync() =>
        // Só produto que ainda existe/está ativo — senão o número do painel "mente" contando fila
        // de produto que já saiu de pré-venda ou foi desativado.
        db.ProductReservations
            .Where(r => r.Kind == "fila" && r.Status == "waiting" && r.Product!.IsPreVenda && r.Product!.IsActive)
            .CountAsync();

    public async Task<List<PedidoItemDto>> DoClienteAsync(Guid userId)
    {
        var lista = await db.ProductReservations
            .Where(r => r.UserId == userId)
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .OrderByDescending(r => r.ReservedAt)
            .ToListAsync();

        var result = new List<PedidoItemDto>();
        foreach (var r in lista)
            result.Add(Pedido.ParaDto(r, r.Kind == "fila" && r.Status == "waiting" ? await PosicaoNaFilaAsync(r) : null));
        return result;
    }

    public async Task<PedidosPaginaDto> ListarAsync(string? status, string? kind, Guid? userId, Guid? productId, int page, int pageSize)
    {
        var q = db.ProductReservations
            .Include(r => r.User)
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(r => r.Status == status);
        if (!string.IsNullOrWhiteSpace(kind))   q = q.Where(r => r.Kind == kind);
        if (userId.HasValue)                    q = q.Where(r => r.UserId == userId.Value);
        if (productId.HasValue)                 q = q.Where(r => r.ProductId == productId.Value);

        pageSize = Math.Clamp(pageSize, 1, 200);
        var total = await q.CountAsync();
        var items = await q.OrderByDescending(r => r.ReservedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync();

        var dtos = new List<PedidoItemDto>();
        foreach (var r in items)
            dtos.Add(Pedido.ParaDto(r, r.Kind == "fila" && r.Status == "waiting" ? await PosicaoNaFilaAsync(r) : null));

        return new PedidosPaginaDto(dtos, total, (int)Math.Ceiling(total / (double)pageSize));
    }

    /// <summary>Posição na fila: quantos entraram antes no mesmo produto, mais 1.</summary>
    private async Task<int> PosicaoNaFilaAsync(ProductReservation r) =>
        1 + await db.ProductReservations.CountAsync(w => w.ProductId == r.ProductId && w.Kind == "fila"
                                                         && w.Status == "waiting" && w.ReservedAt < r.ReservedAt);
}
