using System.Text.Json;
using System.Collections.Concurrent;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

/// <summary>
/// Regra única de geração do Pix de reserva. Controllers, WhatsApp e futuras
/// automações passam por aqui para não haver divergência de valor ou cobrança.
/// </summary>
public sealed class ReservationPixService : IReservationPixService
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> GroupLocks = new();

    private readonly AppDbContext _db;
    private readonly InterSyncService _inter;
    private readonly FuncionalidadesService? _funcionalidades;

    public ReservationPixService(AppDbContext db, InterSyncService inter, FuncionalidadesService? funcionalidades = null)
    {
        _db = db;
        _inter = inter;
        _funcionalidades = funcionalidades;
    }

    public async Task<ReservationPixResult> GerarAsync(
        Guid groupId,
        Guid solicitanteId,
        bool podeGerarParaTerceiros = false,
        CancellationToken cancellationToken = default)
    {
        // Duas mensagens "PIX" quase simultâneas não podem criar duas cobranças
        // no Inter. Há uma única instância da API em produção, então o lock por
        // grupo cobre a janela entre consultar e persistir a cobrança.
        var gate = GroupLocks.GetOrAdd(groupId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            var items = await _db.ProductReservations
                .Include(r => r.Product)
                .Include(r => r.Variant)
                .Include(r => r.User)
                .Where(r => r.ReservationGroupId == groupId)
                .ToListAsync(cancellationToken);

            if (items.Count == 0)
                return ReservationPixResult.Fail(StatusCodes.Status404NotFound, "Reserva não encontrada.");

            if (items[0].UserId != solicitanteId && !podeGerarParaTerceiros)
                return ReservationPixResult.Fail(StatusCodes.Status403Forbidden, "Esta reserva pertence a outro cliente.");

            var consistente = _funcionalidades is null
                ? Funcionalidades.Buscar(Funcionalidades.PedidoPixConsistente)!.Padrao
                : await _funcionalidades.LigadaAsync(Funcionalidades.PedidoPixConsistente);

            var preVendas = items.Where(r => r.Kind == "pre_venda" && r.Status == "active").ToList();
            if (preVendas.Count == 0)
                return ReservationPixResult.Fail(StatusCodes.Status400BadRequest,
                    "Itens de fila não cobram — o Pix é gerado quando o produto chegar.");

            if (consistente)
            {
                // Chave "pedido-pix-consistente": item cancelado do carrinho não trava o resto,
                // e o que já foi pago não entra de novo na cobrança.
                preVendas = preVendas.Where(r => r.ExpiresAt is not null).ToList();
                if (preVendas.Count == 0)
                    return ReservationPixResult.Fail(StatusCodes.Status400BadRequest, "Este pedido já está pago.");
            }
            else if (items.Any(r => r.Kind == "pre_venda" && r.Status != "active"))
                return ReservationPixResult.Fail(StatusCodes.Status400BadRequest,
                    "Só é possível gerar Pix para pré-vendas ativas.");

            // Idempotência financeira: pedir PIX novamente sempre devolve a cobrança ativa.
            var pixAtivo = await _db.PixCobrancas
                .Where(p => p.ReservationGroupId == groupId && p.Status == "ATIVA")
                .OrderByDescending(p => p.CriadoEm)
                .FirstOrDefaultAsync(cancellationToken);

            if (pixAtivo is not null)
                return ReservationPixResult.Ok(pixAtivo, reused: true);

            var congelado = _funcionalidades is null
                ? Funcionalidades.Buscar(Funcionalidades.PedidoVendaNoPagamento)!.Padrao
                : await _funcionalidades.LigadaAsync(Funcionalidades.PedidoVendaNoPagamento);
            var valorEmCentavos = preVendas.Sum(r =>
            {
                // Chave "pedido-venda-no-pagamento": cobra o preço congelado no pedido
                var precoUnit = congelado ? PedidoVendaService.PrecoDoPedido(r)
                    : r.Variant?.PriceInCents
                      ?? (r.Product.IsOnPromo ? r.Product.DiscountPriceInCents!.Value : r.Product.PriceInCents);
                return precoUnit * r.Quantity;
            });

            var cfg = await _db.IntegrationConfigs
                .FirstOrDefaultAsync(c => c.Source == "inter", cancellationToken);
            if (cfg is null)
                return ReservationPixResult.Fail(StatusCodes.Status400BadRequest,
                    "Pagamento Pix indisponível no momento — pague na retirada.");

            var user = items[0].User;
            var cpf = user?.Cpf?.Length == 11 ? user.Cpf : null;
            var result = await _inter.CriarCobrancaAsync(
                cfg, valorEmCentavos, user?.Name, cpf, $"Pré-venda — {preVendas.Count} item(ns)");

            if (result.Error is not null)
                return ReservationPixResult.Fail(StatusCodes.Status422UnprocessableEntity, result.Error);

            var pix = new PixCobranca
            {
                Origem = PixCobrancaOrigem.Reserva,
                ReservationGroupId = groupId,
                ReservationItemIdsJson = JsonSerializer.Serialize(preVendas.Select(r => r.Id)),
                TxId = result.TxId!,
                ValorEmCentavos = valorEmCentavos,
                Status = result.Status ?? "ATIVA",
                PixCopiaCola = result.PixCopiaCola,
                ImagemQrCode = result.ImagemQrCode,
                NomeDevedor = user?.Name,
                CriadoPorAdminId = solicitanteId,
                ExpiraEm = result.ExpiraEm,
            };

            _db.PixCobrancas.Add(pix);
            await _db.SaveChangesAsync(cancellationToken);
            return ReservationPixResult.Ok(pix, reused: false);
        }
        finally
        {
            gate.Release();
        }
    }
}
