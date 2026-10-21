// =============================================================================
// PedidoVendaService.cs — Pedido do site vira venda NO PAGAMENTO (chave
// "pedido-venda-no-pagamento"), no padrão de e-commerce: pagou o Pix, é venda do dia
// no Financeiro, como Pix e pelo valor cobrado (preço congelado no pedido). A retirada
// só registra a entrega.
//
// Roda DEPOIS do commit da baixa do Pix (PixReconciliationService): a venda mora no
// Mongo e não entra na transação do Postgres. Idempotência pelo campo VendaAvulsaId
// dos itens: um claim atômico ("registrando:<txid>") garante uma venda só, mesmo com
// robô e tela conciliando juntos; se o registro falhar, o claim volta e os admins são
// avisados — o "Homologar" de sempre continua resolvendo.
// =============================================================================

using System.Text.Json;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class PedidoVendaService
{
    /// <summary>Prefixo do claim enquanto a venda está sendo gravada no Mongo.</summary>
    public const string Registrando = "registrando:";

    private readonly AppDbContext _db;
    private readonly IVendaAvulsaService _vendas;
    private readonly FuncionalidadesService _funcionalidades;
    private readonly ILogger<PedidoVendaService> _logger;

    public PedidoVendaService(AppDbContext db, IVendaAvulsaService vendas, FuncionalidadesService funcionalidades,
        ILogger<PedidoVendaService> logger)
    {
        _db = db;
        _vendas = vendas;
        _funcionalidades = funcionalidades;
        _logger = logger;
    }

    public Task<bool> LigadaAsync() => _funcionalidades.LigadaAsync(Funcionalidades.PedidoVendaNoPagamento);

    /// <summary>Venda já gravada (id do Mongo), sem contar o claim em andamento.</summary>
    public static bool TemVenda(ProductReservation r) =>
        r.VendaAvulsaId is { Length: > 0 } id && !id.StartsWith(Registrando, StringComparison.Ordinal);

    /// <summary>Preço que vale pro pedido: o congelado na criação; pedido antigo cai no preço atual.</summary>
    public static int PrecoDoPedido(ProductReservation r) =>
        r.UnitPriceInCents
        ?? r.Variant?.PriceInCents
        ?? (r.Product.IsOnPromo ? r.Product.DiscountPriceInCents!.Value : r.Product.PriceInCents);

    /// <summary>
    /// Pix do pedido confirmado: registra UMA venda (Pix, sem baixar estoque de novo) com os
    /// itens que esta cobrança pagou. Devolve o id da venda, ou null se não havia o que vender.
    /// </summary>
    public async Task<string?> RegistrarVendaDoPagamentoAsync(PixCobranca pix)
    {
        if (pix.ReservationGroupId is not { } groupId || !await LigadaAsync()) return null;

        HashSet<Guid>? snapshot = null;
        if (!string.IsNullOrWhiteSpace(pix.ReservationItemIdsJson))
        {
            try { snapshot = JsonSerializer.Deserialize<List<Guid>>(pix.ReservationItemIdsJson!)?.ToHashSet(); }
            catch (JsonException) { /* legado: grupo inteiro */ }
        }

        var candidatos = await _db.ProductReservations
            .Where(r => r.ReservationGroupId == groupId && r.Kind == "pre_venda" && r.Status == "active"
                        && r.ExpiresAt == null && r.VendaAvulsaId == null)
            .Select(r => r.Id)
            .ToListAsync();
        var ids = candidatos.Where(id => snapshot is null || snapshot.Contains(id)).ToList();
        if (ids.Count == 0) return null;

        var marca = Registrando + pix.TxId;
        // Só item ainda ativo e pago: o Homologar fecha o item (status) e exige VendaAvulsaId nulo
        // no mesmo UPDATE — um dos dois perde a corrida, nunca saem duas vendas.
        var claimed = await _db.ProductReservations
            .Where(r => ids.Contains(r.Id) && r.VendaAvulsaId == null && r.Status == "active" && r.ExpiresAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, marca));
        if (claimed != ids.Count)
        {
            // Outro fluxo pegou parte dos itens no meio do caminho: devolve o que é nosso e deixa pra ele
            await LiberarAsync(ids, marca);
            return null;
        }

        var itens = await _db.ProductReservations.AsNoTracking()
            .Include(r => r.Product).Include(r => r.Variant).Include(r => r.User)
            .Where(r => ids.Contains(r.Id))
            .OrderBy(r => r.ReservedAt)
            .ToListAsync();
        var primeiro = itens[0];
        var inicio = DateTime.UtcNow.AddSeconds(-5); // folga de relógio entre API e Mongo

        try
        {
            var venda = await _vendas.RegisterAsync(new VendaAvulsaRequest
            {
                ClientName         = primeiro.User?.Name,
                UserId             = primeiro.UserId,
                PaymentMethod      = Models.MongoDB.PaymentMethod.Pix,
                SkipStockDecrement = true, // estoque saiu na criação do pedido
                Origem             = "Reserva",
                ReservationId      = primeiro.Id,
                ReservationGroupId = groupId,
                ProductIsPreVenda  = itens.All(r => r.Product?.IsPreVenda ?? false),
                Items = itens.Select(r => new VendaAvulsaItemRequest
                {
                    ProductId = r.ProductId, VariantId = r.VariantId, Quantity = r.Quantity,
                    UnitPriceInCents = PrecoDoPedido(r),
                }).ToList(),
            }, pix.CriadoPorAdminId, "Site (Pix)");

            await _db.ProductReservations
                .Where(r => ids.Contains(r.Id) && r.VendaAvulsaId == marca)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, venda.Id));

            if (venda.TotalInCents != pix.ValorEmCentavos)
                _logger.LogWarning("Venda {VendaId} do pedido {Grupo} saiu com {Venda} centavos e o Pix {TxId} cobrou {Pix}.",
                    venda.Id, groupId, venda.TotalInCents, pix.TxId, pix.ValorEmCentavos);
            return venda.Id;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Pix {TxId} pago, mas a venda do pedido {Grupo} não foi registrada.", pix.TxId, groupId);

            // O RegisterAsync grava no Mongo antes de outras etapas (e o UPDATE acima pode falhar
            // depois): se a venda chegou a ser gravada, ela vale — liberar o claim faria o Homologar
            // vender de novo. Sem conseguir conferir, o claim fica (Homologar recusa) e os admins conferem.
            VendaAvulsaDto? gravada;
            try { gravada = await _vendas.BuscarVendaDoPedidoAsync(groupId, primeiro.Id, inicio); }
            catch (Exception ex2)
            {
                _logger.LogError(ex2, "Não deu pra conferir se a venda do pedido {Grupo} foi gravada; claim mantido.", groupId);
                await AvisarAdminsAsync("Pedido pago: conferir a venda",
                    $"{primeiro.User?.Name ?? "Um cliente"} pagou o Pix do pedido e não deu pra confirmar se a venda entrou no Financeiro. " +
                    "Confira em Vendas antes de mexer no pedido.");
                return null;
            }
            if (gravada is not null)
            {
                await _db.ProductReservations
                    .Where(r => ids.Contains(r.Id) && r.VendaAvulsaId == marca)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, gravada.Id));
                return gravada.Id;
            }

            await LiberarAsync(ids, marca);
            await AvisarAdminsAsync("Pedido pago sem venda registrada",
                $"{primeiro.User?.Name ?? "Um cliente"} pagou o Pix do pedido, mas a venda não entrou no Financeiro. " +
                "Abra Pedidos e use \"Homologar\" pra registrar.");
            return null;
        }
    }

    private async Task LiberarAsync(List<Guid> ids, string marca) =>
        await _db.ProductReservations
            .Where(r => ids.Contains(r.Id) && r.VendaAvulsaId == marca)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, (string?)null));

    private async Task AvisarAdminsAsync(string titulo, string corpo)
    {
        var admins = await _db.Users.Where(u => u.Role == UserRole.Admin && u.IsActive).Select(u => u.Id).ToListAsync();
        foreach (var id in admins)
            _db.Notifications.Add(new Notification { UserId = id, Title = titulo, Body = corpo, Link = "/admin/reservas" });
        await _db.SaveChangesAsync();
    }
}
