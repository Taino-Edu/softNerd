// =============================================================================
// AvisoAoCliente.cs — avisos do pedido pro CLIENTE (v1.97.0, chave "avisos-pedido-cliente").
//
// Antes o cliente só recebia aviso quando a loja registrava o pedido pra ele: o Pix confirmado ele só via
// com a tela do Pix aberta, e o cancelamento feito pela loja ele não ficava sabendo (validação dos
// critérios de aceite com o Taino, 24/11). Agora: Pix confirmado, pagamento registrado pela loja e
// pedido cancelado pela loja (ou tirado da fila). Sininho gravado junto da mudança; o push sai depois.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Pedidos;

/// <summary>Um aviso pro cliente: o sininho já foi gravado; falta o push.</summary>
public sealed record AvisoDoCliente(Guid UserId, string Titulo, string Corpo, string? Imagem)
{
    public const string Link = "/cliente/perfil"; // onde o cliente vê os pedidos
}

public static class AvisoAoCliente
{
    /// <summary>A chave "avisos-pedido-cliente" está ligada? (linha no banco, senão o padrão do catálogo)</summary>
    public static async Task<bool> LigadoAsync(AppDbContext db)
    {
        var mudada = await db.FuncionalidadesEstado.AsNoTracking()
            .Where(f => f.Codigo == Funcionalidades.AvisosPedidoCliente)
            .Select(f => (bool?)f.Ligada)
            .FirstOrDefaultAsync();
        return mudada ?? Funcionalidades.Buscar(Funcionalidades.AvisosPedidoCliente)!.Padrao;
    }

    /// <summary>Grava o sininho (quem chama faz o SaveChanges) e devolve o aviso pro push.</summary>
    public static AvisoDoCliente Gravar(AppDbContext db, Guid userId, string titulo, string corpo, string? imagem)
    {
        db.Notifications.Add(new Notification
        {
            UserId = userId, Title = titulo, Body = corpo, Link = AvisoDoCliente.Link,
            ImageUrl = imagem, CreatedAt = DateTime.UtcNow,
        });
        return new AvisoDoCliente(userId, titulo, corpo, imagem);
    }

    /// <summary>"Carta X" ou "3 itens".</summary>
    public static string OQue(IReadOnlyList<ProductReservation> itens) =>
        itens.Count == 1 ? $"\"{NomeDoItem(itens[0])}\"" : $"{itens.Count} itens";

    public static string NomeDoItem(ProductReservation r) =>
        r.Variant is { } v && !string.IsNullOrWhiteSpace(v.Label) ? $"{r.Product?.Name} — {v.Label}" : r.Product?.Name ?? "produto";

    public static (string Titulo, string Corpo) PixConfirmado(string oQue, int valorEmCentavos) =>
        ("Pagamento confirmado ✅",
         $"Recebemos o Pix de {Dinheiro.Brl(valorEmCentavos / 100m)} do seu pedido ({oQue}). Ele está guardado pra você: é só retirar na loja.");

    public static (string Titulo, string Corpo) PagamentoRegistrado(string oQue) =>
        ("Pagamento registrado ✅",
         $"A loja registrou o pagamento do seu pedido ({oQue}). Ele está guardado pra você: é só retirar na loja.");

    public static (string Titulo, string Corpo) Cancelado(string oQue, bool fila, bool pago) =>
        fila
            ? ("Fila de espera", $"A loja tirou você da fila de {oQue}. Se tiver dúvida, fale com a gente.")
            : ("Pedido cancelado",
               pago
                   ? $"A loja cancelou {oQue} do seu pedido já pago. A loja vai combinar com você a devolução do valor."
                   : $"A loja cancelou {oQue} do seu pedido. Se tiver dúvida, fale com a gente.");
}
