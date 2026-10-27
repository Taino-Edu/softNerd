// =============================================================================
// PedidoComum.cs — o que os serviços de pedido (Services/Pedidos) dividem:
// a recusa de regra (vira resposta HTTP no controller),
// o DTO do item, a devolução de estoque e o aviso de estoque pra tela do admin.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Pedidos;

/// <summary>Regra de pedido recusada (ver Common/RegraException.cs).</summary>
public class PedidoException(string? mensagem, int status = 400, IReadOnlyDictionary<string, object?>? extras = null)
    : RegraException(mensagem, status, extras);

public static class Pedido
{
    /// <summary>Mensagem do item pago cujo registro de venda ainda está em andamento.</summary>
    public const string VendaSendoRegistrada = "A venda deste pedido está sendo registrada agora — tente de novo em instantes.";

    /// <summary>Só "pix" e "retirada" são válidos — qualquer outra coisa vira null (não declarado).</summary>
    public static string? FormaDePagamento(string? pm) => pm is "pix" or "retirada" ? pm : null;

    public static PedidoItemDto ParaDto(ProductReservation r, int? posicaoFila = null)
    {
        // Preço unitário: o congelado no pedido; pedido antigo cai no preço atual
        // (variante tem prioridade; senão preço promocional se ativo)
        int? precoUnitario = r.UnitPriceInCents
            ?? (r.Product is null ? null
                : r.Variant?.PriceInCents
                  ?? (r.Product.IsOnPromo ? r.Product.DiscountPriceInCents!.Value : r.Product.PriceInCents));

        return new PedidoItemDto(
            r.Id, r.ReservationGroupId, r.UserId, r.User?.Name, r.User?.WhatsApp,
            r.ProductId, r.Product?.Name, r.Product?.ImageUrl, r.Product?.IsPreVenda ?? false,
            r.VariantId, r.Variant?.Label, r.Quantity, r.Kind, r.Status, r.Notes, r.PaymentMethod,
            r.ReservedAt, r.ExpiresAt, r.FulfilledAt, r.CancelledAt, posicaoFila,
            PedidoVendaService.TemVenda(r), r.Product?.PreVendaReleaseDate,
            precoUnitario.HasValue ? precoUnitario.Value / 100m : null,
            precoUnitario.HasValue ? precoUnitario.Value * r.Quantity / 100m : null);
    }

    /// <summary>Carrega produto e variante (o DTO mostra nome, foto e preço).</summary>
    public static async Task CarregarProdutoAsync(AppDbContext db, ProductReservation r)
    {
        await db.Entry(r).Reference(x => x.Product).LoadAsync();
        await db.Entry(r).Reference(x => x.Variant).LoadAsync();
    }

    /// <summary>Devolve o estoque de uma pré-venda (cancelamento).</summary>
    public static async Task DevolverEstoqueAsync(AppDbContext db, ProductReservation r)
    {
        if (r.VariantId.HasValue)
            await db.ProductVariants
                .Where(v => v.Id == r.VariantId.Value)
                .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + r.Quantity));
        else
            await db.Products
                .Where(p => p.Id == r.ProductId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + r.Quantity));
    }

    /// <summary>Avisa o admin (grupo do hub) que o estoque mudou — a tela de estoque recarrega
    /// sozinha, sem F5, quando cliente reserva/cancela no site.</summary>
    public static Task AvisarEstoqueMudouAsync(IHubContext<ComandaHub> hub) =>
        hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("StockChanged", new { });
}
