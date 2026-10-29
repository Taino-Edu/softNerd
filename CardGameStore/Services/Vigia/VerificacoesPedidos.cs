// =============================================================================
// VerificacoesPedidos.cs — gatilhos dos pedidos do site, estoque e Pix (Vigia)
// Cada classe responde UMA pergunta sobre o banco. Lógica de negócio fica onde já mora
// (PedidoVendaService, PixReconciliationService); aqui só se procura o que ficou torto.
// =============================================================================

using System.Text.Json;
using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Vigia;

internal static class VigiaPedidos
{
    public const string LinkPedidos = "/admin/reservas";
    public static readonly TimeSpan Janela = TimeSpan.FromDays(60);

    public static HashSet<Guid>? Snapshot(PixCobranca pix)
    {
        if (string.IsNullOrWhiteSpace(pix.ReservationItemIdsJson)) return null;
        try { return JsonSerializer.Deserialize<List<Guid>>(pix.ReservationItemIdsJson!)?.ToHashSet(); }
        catch (JsonException) { return null; }
    }

    public static string Reais(int centavos) =>
        (centavos / 100m).ToString("C", new System.Globalization.CultureInfo("pt-BR"));
}

/// <summary>Pix pago de pedido que está todo cancelado: o dinheiro entrou e não há o que entregar.</summary>
public class VerificacaoPixPagoPedidoCancelado(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "pix-pago-pedido-cancelado";
    public string Nome => "Pix pago de pedido cancelado";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var desde = DateTime.UtcNow - VigiaPedidos.Janela;
        var pagos = await db.PixCobrancas.AsNoTracking()
            .Where(p => p.Origem == PixCobrancaOrigem.Reserva && p.PagoEm != null && p.PagoEm >= desde && p.ReservationGroupId != null)
            .ToListAsync(ct);
        var grupos = pagos.Select(p => p.ReservationGroupId!.Value).Distinct().ToList();
        var itens = await db.ProductReservations.AsNoTracking().Include(r => r.User)
            .Where(r => grupos.Contains(r.ReservationGroupId) && r.Kind == "pre_venda")
            .ToListAsync(ct);

        var achados = new List<Achado>();
        foreach (var pix in pagos)
        {
            var snap = VigiaPedidos.Snapshot(pix);
            var doPix = itens.Where(r => r.ReservationGroupId == pix.ReservationGroupId && (snap is null || snap.Contains(r.Id))).ToList();
            if (doPix.Count == 0 || doPix.Any(r => r.Status != "cancelled")) continue;
            achados.Add(new Achado(pix.TxId, VigiaGravidade.Critico,
                "Pix pago de pedido cancelado: reembolso pendente",
                $"{doPix[0].User?.Name ?? "Cliente"} pagou {VigiaPedidos.Reais(pix.ValorEmCentavos)} em {Brasilia.Formatar(pix.PagoEm!.Value)} " +
                $"e o pedido ({doPix.Count} item/itens) está cancelado. Devolva o valor pelo Inter ou refaça o pedido. Pix {pix.TxId}.",
                VigiaPedidos.LinkPedidos));
        }
        return achados;
    }
}

/// <summary>Pedido pago no Pix que não virou venda (registro falhou, ou pago antes da venda no pagamento).</summary>
public class VerificacaoPedidoPagoSemVenda(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "pedido-pago-sem-venda";
    public string Nome => "Pedido pago sem venda no Financeiro";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var limite = DateTime.UtcNow.AddMinutes(-15); // dá tempo do registro normal terminar
        var desde = DateTime.UtcNow - VigiaPedidos.Janela;
        var pagos = await db.PixCobrancas.AsNoTracking()
            .Where(p => p.Origem == PixCobrancaOrigem.Reserva && p.PagoEm != null && p.PagoEm < limite && p.PagoEm >= desde && p.ReservationGroupId != null)
            .Select(p => new { Grupo = p.ReservationGroupId!.Value, p.ValorEmCentavos, p.PagoEm })
            .ToListAsync(ct);
        var grupos = pagos.Select(p => p.Grupo).Distinct().ToList();
        var semVenda = await db.ProductReservations.AsNoTracking().Include(r => r.User).Include(r => r.Product)
            .Where(r => grupos.Contains(r.ReservationGroupId) && r.Kind == "pre_venda" && r.Status == "active"
                        && r.ExpiresAt == null && r.VendaAvulsaId == null)
            .ToListAsync(ct);

        return semVenda.GroupBy(r => r.ReservationGroupId).Select(g =>
        {
            var pix = pagos.Where(p => p.Grupo == g.Key).OrderByDescending(p => p.PagoEm).First();
            return new Achado(g.Key.ToString(), VigiaGravidade.Aviso,
                $"Pedido pago sem venda: {g.First().User?.Name ?? "cliente"}",
                $"Pix de {VigiaPedidos.Reais(pix.ValorEmCentavos)} pago em {Brasilia.Formatar(pix.PagoEm!.Value)}, " +
                $"mas {g.Count()} item(ns) ({string.Join(", ", g.Select(r => r.Product?.Name).Where(n => n != null).Take(3))}) " +
                "não entrou no Financeiro. Abra Pedidos e use \"Homologar\" (já vem com Pix).",
                VigiaPedidos.LinkPedidos);
        }).ToList();
    }
}

/// <summary>Venda de pedido presa no meio do registro ("registrando:…"): o Homologar recusa até resolver.</summary>
public class VerificacaoVendaTravada(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "venda-travada";
    public string Nome => "Venda de pedido travada no registro";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var travados = await db.ProductReservations.AsNoTracking().Include(r => r.User)
            .Where(r => r.VendaAvulsaId != null && r.VendaAvulsaId.StartsWith(PedidoVendaService.Registrando) && r.Status == "active")
            .ToListAsync(ct);
        return travados.GroupBy(r => r.ReservationGroupId).Select(g => new Achado(g.Key.ToString(), VigiaGravidade.Critico,
            $"Venda travada no pedido de {g.First().User?.Name ?? "cliente"}",
            $"O registro da venda (Pix {g.First().VendaAvulsaId![PedidoVendaService.Registrando.Length..]}) não terminou. " +
            "Confira em Vendas se ela entrou; se não, fale com o suporte antes de homologar.",
            VigiaPedidos.LinkPedidos)).ToList();
    }
}

/// <summary>Valor do Pix diferente do total do pedido (preço congelado) — só pedidos com preço congelado.</summary>
public class VerificacaoValorPixDiferente(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "pix-valor-diferente";
    public string Nome => "Pix com valor diferente do pedido";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var desde = DateTime.UtcNow - VigiaPedidos.Janela;
        var pagos = await db.PixCobrancas.AsNoTracking()
            .Where(p => p.Origem == PixCobrancaOrigem.Reserva && p.PagoEm != null && p.PagoEm >= desde
                        && p.ReservationGroupId != null && p.ReservationItemIdsJson != null)
            .ToListAsync(ct);
        var grupos = pagos.Select(p => p.ReservationGroupId!.Value).Distinct().ToList();
        var itens = await db.ProductReservations.AsNoTracking().Include(r => r.User)
            .Where(r => grupos.Contains(r.ReservationGroupId) && r.Kind == "pre_venda")
            .ToListAsync(ct);

        var achados = new List<Achado>();
        foreach (var pix in pagos)
        {
            var snap = VigiaPedidos.Snapshot(pix);
            if (snap is null) continue;
            var doPix = itens.Where(r => snap.Contains(r.Id)).ToList();
            // Sem preço congelado (pedido antigo) não dá pra comparar; cancelado é outro gatilho
            if (doPix.Count != snap.Count || doPix.Any(r => r.UnitPriceInCents is null || r.Status == "cancelled")) continue;
            var total = doPix.Sum(r => r.UnitPriceInCents!.Value * r.Quantity);
            if (total == pix.ValorEmCentavos) continue;
            achados.Add(new Achado(pix.TxId, VigiaGravidade.Aviso,
                $"Pix com valor diferente do pedido: {doPix[0].User?.Name ?? "cliente"}",
                $"O cliente pagou {VigiaPedidos.Reais(pix.ValorEmCentavos)} e o pedido soma {VigiaPedidos.Reais(total)} " +
                $"(diferença de {VigiaPedidos.Reais(Math.Abs(pix.ValorEmCentavos - total))}). Pix {pix.TxId}.",
                VigiaPedidos.LinkPedidos));
        }
        return achados;
    }
}

/// <summary>
/// Pix do pedido venceu (1h) sem pagamento e o pedido segue aberto. O código antigo não paga mais
/// ("O QR Code não é válido" no banco) — foi o que aconteceu com o pedido de R$ 800 de 27/10, e nada
/// acusou porque nenhuma tela deu erro. Some sozinho quando o cliente paga, o Pix é trocado
/// (abrir o pagamento gera outro) ou o pedido é cancelado. Depois de 3 dias vira "pedido parado".
/// </summary>
public class VerificacaoPixPedidoVencido(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "pix-pedido-vencido";
    public string Nome => "Pix do pedido venceu sem pagamento";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var agora = DateTime.UtcNow;
        var desde = agora - VerificacaoPedidoParado.Prazo;
        var vencidos = await db.PixCobrancas.AsNoTracking()
            .Where(p => p.Origem == PixCobrancaOrigem.Reserva && p.Status == "ATIVA" && p.PagoEm == null
                        && p.ReservationGroupId != null && p.ExpiraEm != null && p.ExpiraEm < agora && p.ExpiraEm >= desde)
            .ToListAsync(ct);
        var grupos = vencidos.Select(p => p.ReservationGroupId!.Value).Distinct().ToList();
        // Pedido ainda aberto: pré-venda ativa e não paga
        var abertos = await db.ProductReservations.AsNoTracking().Include(r => r.User)
            .Where(r => grupos.Contains(r.ReservationGroupId) && r.Kind == "pre_venda" && r.Status == "active" && r.ExpiresAt != null)
            .ToListAsync(ct);
        // Pedido que já tem um Pix novo no prazo não precisa de nada
        var comPixVivo = await db.PixCobrancas.AsNoTracking()
            .Where(p => p.ReservationGroupId != null && grupos.Contains(p.ReservationGroupId.Value)
                        && p.Status == "ATIVA" && (p.ExpiraEm == null || p.ExpiraEm >= agora))
            .Select(p => p.ReservationGroupId!.Value).Distinct().ToListAsync(ct);

        return vencidos
            .Where(p => !comPixVivo.Contains(p.ReservationGroupId!.Value))
            .Select(p => (Pix: p, Itens: abertos.Where(r => r.ReservationGroupId == p.ReservationGroupId).ToList()))
            .Where(x => x.Itens.Count > 0)
            .Select(x => new Achado(x.Pix.TxId, VigiaGravidade.Aviso,
                $"Pix vencido sem pagamento: {x.Itens[0].User?.Name ?? "cliente"}",
                $"O Pix de {VigiaPedidos.Reais(x.Pix.ValorEmCentavos)} venceu em {Brasilia.Formatar(x.Pix.ExpiraEm!.Value)} sem pagamento " +
                "e o pedido segue aberto. O código antigo não funciona mais: se o cliente ainda vai pagar, " +
                "abra o Pix do pedido em Pedidos (sai um código novo) e mande pra ele.",
                VigiaPedidos.LinkPedidos))
            .ToList();
    }
}

/// <summary>Produto ou variante com estoque negativo: alguma baixa passou do que havia.</summary>
public class VerificacaoEstoqueNegativo(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "estoque-negativo";
    public string Nome => "Estoque negativo";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var produtos = await db.Products.AsNoTracking().Where(p => p.StockQuantity < 0)
            .Select(p => new { p.Id, p.Name, p.StockQuantity }).ToListAsync(ct);
        var variantes = await db.ProductVariants.AsNoTracking().Where(v => v.StockQuantity < 0)
            .Select(v => new { v.Id, v.Label, v.StockQuantity, Produto = v.Product.Name }).ToListAsync(ct);
        return produtos.Select(p => new Achado(p.Id.ToString(), VigiaGravidade.Critico,
                    $"Estoque negativo: {p.Name}", $"{p.Name} está com {p.StockQuantity} no estoque. Confira a contagem e as últimas vendas.", "/admin/estoque"))
            .Concat(variantes.Select(v => new Achado(v.Id.ToString(), VigiaGravidade.Critico,
                    $"Estoque negativo: {v.Produto} — {v.Label}", $"{v.Produto} ({v.Label}) está com {v.StockQuantity} no estoque.", "/admin/estoque")))
            .ToList();
    }
}

/// <summary>Pedido do site sem pagamento há mais de 3 dias segurando estoque (só registra, não vai pro sininho).</summary>
public class VerificacaoPedidoParado(AppDbContext db) : IVerificacaoVigia
{
    public static readonly TimeSpan Prazo = TimeSpan.FromDays(3);
    public string Codigo => "pedido-parado";
    public string Nome => "Pedido sem pagamento há mais de 3 dias";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var limite = DateTime.UtcNow - Prazo;
        var parados = await db.ProductReservations.AsNoTracking().Include(r => r.User).Include(r => r.Product)
            .Where(r => r.Kind == "pre_venda" && r.Status == "active" && r.ExpiresAt != null && r.ReservedAt < limite)
            .ToListAsync(ct);
        return parados.GroupBy(r => r.ReservationGroupId).Select(g =>
        {
            var desde = g.Min(r => r.ReservedAt);
            return new Achado(g.Key.ToString(), VigiaGravidade.Info,
                $"Pedido parado há {(int)(DateTime.UtcNow - desde).TotalDays} dias: {g.First().User?.Name ?? "cliente"}",
                $"{g.Sum(r => r.Quantity)} unidade(s) presa(s) no estoque ({string.Join(", ", g.Select(r => r.Product?.Name).Where(n => n != null).Take(3))}) " +
                $"desde {Brasilia.Formatar(desde)}, sem pagamento. Cobre o cliente ou cancele pra liberar o estoque.",
                VigiaPedidos.LinkPedidos);
        }).ToList();
    }
}
