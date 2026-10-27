// =============================================================================
// PedidoAndamentoService.cs — o que acontece com o pedido depois de criado:
// cancelar (estoque volta; pago vira estorno), retirar, mudar a quantidade,
// homologar (venda na retirada) e registrar pagamento feito por fora.
//
// Toda mudança é "claim" atômico + efeito na MESMA transação: duas ações
// concorrentes (cliente cancela enquanto o admin homologa, o Pix cai no meio)
// nunca devolvem o estoque duas vezes nem lançam a venda duas vezes.
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Pedidos;

public interface IPedidoAndamentoService
{
    /// <summary>Cliente ou admin cancela (pré-venda: estoque volta; fila: sai da fila).</summary>
    Task<PedidoCanceladoDto> CancelarAsync(Guid id, Ator ator);

    /// <summary>
    /// Admin marca como retirado ("fulfilled") ou cancelado. Devolve o item atualizado
    /// (PedidoItemDto) ou, se o cancelamento estornou a venda, um PedidoCanceladoDto.
    /// </summary>
    Task<object> AtualizarStatusAsync(Guid id, string status, Ator ator);

    /// <summary>Admin corrige a quantidade de um pedido em aberto (pré-venda mexe no estoque).</summary>
    Task<PedidoItemDto> AtualizarQuantidadeAsync(Guid id, int quantidade);

    /// <summary>Homologa UM item (resolve item solto de um carrinho).</summary>
    Task<HomologacaoDto> HomologarAsync(Guid id, HomologarRequest req, Ator ator);

    /// <summary>Homologa o pedido inteiro de uma vez (a tela do admin usa este).</summary>
    Task<HomologacaoDto> HomologarPedidoAsync(Guid groupId, HomologarRequest req, Ator ator);

    /// <summary>Pagamento lançado à mão SEM retirada: vira venda e o pedido aguarda a retirada.</summary>
    Task<PagamentoRegistradoDto> RegistrarPagamentoAsync(Guid groupId, HomologarRequest req, Ator ator);
}

public class PedidoAndamentoService(
    AppDbContext db, IVendaAvulsaService vendas, IPedidoCobrancaService cobranca, IProductService produtos,
    IAuditService audit, IHubContext<ComandaHub> hub, FuncionalidadesService? funcionalidades = null) : IPedidoAndamentoService
{
    private const string EncerradaOuVirouVenda = "Esta reserva já foi encerrada ou acabou de virar venda — recarregue e tente de novo.";

    public async Task<PedidoCanceladoDto> CancelarAsync(Guid id, Ator ator)
    {
        var res = await db.ProductReservations.FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new PedidoException(null, 404);
        if (res.UserId != ator.Id && !ator.EhAdmin) throw new PedidoException(null, 403);
        if (res.Status is not ("active" or "waiting"))
            throw new PedidoException("Esta reserva já foi encerrada.");

        // Pré-venda já paga (ExpiresAt nulo = Pix confirmado) só a loja cancela — o pagamento não
        // é estornado sozinho, precisa de acompanhamento.
        var jaPaga = res.Status == "active" && res.Kind == "pre_venda" && res.ExpiresAt is null;
        if (jaPaga && !ator.EhAdmin)
            throw new PedidoException("Esta pré-venda já foi paga — fale com a loja pra cancelar e combinar o estorno.");

        if (res.Status == "active" && await CancelarComVendaAsync(res, ator) is { } estornado) return estornado;
        await cobranca.DerrubarAntesDeCancelarAsync(res);

        var statusOriginal = res.Status;
        var devolveuEstoque = await FecharAsync(res, "cancelled");

        if (jaPaga)
            await audit.LogAsync("CancelouPreVendaPaga", "ProductReservation", res.Id.ToString(),
                details: $"{{\"produtoId\":\"{res.ProductId}\",\"valorPago\":true,\"observacao\":\"estorno manual pendente\"}}");
        else
            await audit.LogAsync("CancelouPedido", "ProductReservation", res.Id.ToString(),
                details: $"{{\"produtoId\":\"{res.ProductId}\",\"status\":\"{statusOriginal}\",\"pelaLoja\":{(res.UserId != ator.Id).ToString().ToLowerInvariant()}}}");

        if (devolveuEstoque) await EstoqueVoltouAsync(res.ProductId);
        return new PedidoCanceladoDto(jaPaga);
    }

    // fulfilled = retirado (o estoque JÁ saiu na pré-venda — não baixa de novo)
    // cancelled = devolve o estoque se era pré-venda vigente
    public async Task<object> AtualizarStatusAsync(Guid id, string status, Ator ator)
    {
        if (status is not ("fulfilled" or "cancelled"))
            throw new PedidoException("Status inválido. Use 'fulfilled' ou 'cancelled'.");

        var res = await db.ProductReservations
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new PedidoException(null, 404);
        if (res.Status is not ("active" or "waiting"))
            throw new PedidoException("Esta reserva já foi encerrada.");
        if (status == "fulfilled" && res.Status != "active")
            throw new PedidoException("Só pré-vendas ativas podem ser marcadas como retiradas.");

        var jaPaga = status == "cancelled" && res.Status == "active" && res.Kind == "pre_venda" && res.ExpiresAt is null;

        if (status == "cancelled")
        {
            if (res.Status == "active" && await CancelarComVendaAsync(res, ator) is { } estornado) return estornado;
            await cobranca.DerrubarAntesDeCancelarAsync(res);
        }
        // "Retirado" sem venda perderia o faturamento
        if (status == "fulfilled" && res.Kind == "pre_venda" && !PedidoVendaService.TemVenda(res))
            throw new PedidoException("Este pedido ainda não virou venda — use \"Homologar\" pra registrar o pagamento na retirada.");

        var devolveuEstoque = await FecharAsync(res, status);

        res.Status = status;
        if (status == "fulfilled") res.FulfilledAt = DateTime.UtcNow;
        else res.CancelledAt = DateTime.UtcNow;

        if (jaPaga)
            await audit.LogAsync("CancelouPreVendaPaga", "ProductReservation", res.Id.ToString(),
                details: $"{{\"produtoId\":\"{res.ProductId}\",\"valorPago\":true,\"observacao\":\"estorno manual pendente\"}}");

        if (devolveuEstoque) await EstoqueVoltouAsync(res.ProductId);
        return Pedido.ParaDto(res);
    }

    // Pré-venda: a diferença mexe no estoque (atômico); fila: só troca o número.
    public async Task<PedidoItemDto> AtualizarQuantidadeAsync(Guid id, int quantidade)
    {
        if (quantidade < 1) throw new PedidoException("Quantidade precisa ser pelo menos 1.");

        var res = await db.ProductReservations.FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new PedidoException(null, 404);
        if (res.Status is not ("active" or "waiting"))
            throw new PedidoException("Só é possível alterar a quantidade de reservas em aberto.");
        // A venda já está no Financeiro com a quantidade do pedido: mudar aqui desalinharia venda e estoque
        if (res.VendaAvulsaId is not null)
            throw new PedidoException("Este pedido já virou venda — pra mudar a quantidade, cancele (a venda é estornada) e faça um pedido novo.", 409);

        var quantidadeAntiga = res.Quantity;
        var delta = quantidade - quantidadeAntiga;
        if (delta == 0) return await ComProdutoEClienteAsync(res);

        // Pix ainda pagável trava o valor cobrado — mudar a quantidade deixaria a cobrança desalinhada.
        // A cláusula de expiração não é detalhe: nada marca cobrança vencida como vencida, então uma
        // cobrança nunca paga ficava "ATIVA" pra sempre e travava o pedido de vez.
        if (res.Kind == "pre_venda")
        {
            var agora = DateTime.UtcNow;
            var temPixAtivo = await db.PixCobrancas.AnyAsync(p =>
                p.ReservationGroupId == res.ReservationGroupId && p.Status == "ATIVA" &&
                (p.ExpiraEm == null || p.ExpiraEm > agora));
            if (temPixAtivo)
                throw new PedidoException("Esta reserva tem um Pix aberto — cancele o Pix antes de mudar a quantidade.", 409);
        }

        await NaTransacaoAsync(async () =>
        {
            var claimed = await db.ProductReservations
                .Where(r => r.Id == id && r.Status == res.Status && r.Quantity == quantidadeAntiga)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Quantity, quantidade));
            if (claimed == 0)
                throw new PedidoException("Esta reserva foi alterada por outra ação — recarregue e tente de novo.");

            if (res.Kind != "pre_venda") return;
            if (delta > 0)
            {
                int baixado;
                if (res.VariantId.HasValue)
                    baixado = await db.ProductVariants
                        .Where(v => v.Id == res.VariantId.Value && v.StockQuantity >= delta)
                        .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - delta));
                else
                    baixado = await db.Products
                        .Where(p => p.Id == res.ProductId && p.StockQuantity >= delta)
                        .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity - delta));
                if (baixado == 0)
                    throw new PedidoException("Estoque insuficiente pra aumentar a quantidade.", 409); // rollback desfaz o claim também
            }
            else
            {
                var devolver = -delta;
                if (res.VariantId.HasValue)
                    await db.ProductVariants.Where(v => v.Id == res.VariantId.Value)
                        .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + devolver));
                else
                    await db.Products.Where(p => p.Id == res.ProductId)
                        .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + devolver));
            }
        });

        res.Quantity = quantidade;
        if (res.Kind == "pre_venda") await Pedido.AvisarEstoqueMudouAsync(hub);

        await audit.LogAsync("AlterouQuantidadeReserva", "ProductReservation", res.Id.ToString(),
            details: $"{{\"de\":{quantidadeAntiga},\"para\":{quantidade}}}");

        return await ComProdutoEClienteAsync(res);
    }

    public async Task<HomologacaoDto> HomologarAsync(Guid id, HomologarRequest req, Ator ator)
    {
        var res = await ItensComDetalhes().FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new PedidoException(null, 404);
        if (res.Status != "active" || res.Kind != "pre_venda")
            throw new PedidoException("Só pré-vendas ativas podem ser homologadas.");

        return await HomologarItensAsync([res], req, ator);
    }

    // O cliente reserva vários itens juntos (mesmo ReservationGroupId) e retira tudo junto no balcão;
    // homologar por linha deixava o resto "active" pra sempre. Reserva avulsa tem ReservationGroupId =
    // o próprio Id, então este cobre os dois casos.
    public async Task<HomologacaoDto> HomologarPedidoAsync(Guid groupId, HomologarRequest req, Ator ator) =>
        await HomologarItensAsync(await AtivosDoPedidoAsync(groupId), req, ator);

    /// <summary>
    /// Núcleo da homologação: marca os itens como retirados e lança UMA venda no PDV com o que ainda
    /// não virou venda. Sempre PDV — homologar por comanda misturava o valor com outros itens do
    /// cliente. SkipStockDecrement: o estoque JÁ saiu no ato da pré-venda. Público pros testes da
    /// corrida Homologar × Pix (itens lidos antes do outro fluxo gravar).
    /// </summary>
    public async Task<HomologacaoDto> HomologarItensAsync(List<ProductReservation> itens, HomologarRequest req, Ator ator)
    {
        var ids      = itens.Select(r => r.Id).ToList();
        var primeiro = itens[0];

        // O que já virou venda no pagamento só é entregue, senão a venda entraria duas vezes.
        // Vende só o que falta (pedido "pagar na retirada"), pelo preço congelado no pedido.
        if (itens.Any(r => r.VendaAvulsaId is not null && !PedidoVendaService.TemVenda(r)))
            throw new PedidoException(Pedido.VendaSendoRegistrada, 409);
        var aVender    = itens.Where(r => !PedidoVendaService.TemVenda(r)).ToList();
        var idsAVender = aVender.Select(r => r.Id).ToList();
        VendaAvulsaDto? venda = null;

        // Claim atômico + registro da venda na MESMA transação: duas homologações concorrentes, ou uma
        // homologação correndo com um cancelamento, lançariam a venda duas vezes ou em cima de pedido
        // cancelado. No pedido vale pro lote todo: se um item saiu do ar no meio, nenhum é homologado.
        await NaTransacaoAsync(async () =>
        {
            venda = null;
            // Item a vender só fecha se ainda não virou venda: se o Pix acabou de registrar a venda
            // dele (PedidoVendaService), a contagem não bate e nada é homologado — sem venda dupla.
            var claimed = await db.ProductReservations
                .Where(r => ids.Contains(r.Id) && r.Status == "active" && r.Kind == "pre_venda"
                            && (!idsAVender.Contains(r.Id) || r.VendaAvulsaId == null))
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.Status, "fulfilled")
                    .SetProperty(r => r.FulfilledAt, DateTime.UtcNow));
            if (claimed != ids.Count)
                throw new PedidoException(ids.Count == 1
                    ? "Esta pré-venda já foi processada."
                    : "Algum item deste pedido foi cancelado ou homologado enquanto você preenchia — abra de novo pra ver como ficou.");

            if (aVender.Count == 0) return; // tudo já vendido no pagamento: só entrega

            venda = await RegistrarVendaAsync(primeiro, aVender, req, ator);
            await db.ProductReservations.Where(r => idsAVender.Contains(r.Id) && r.VendaAvulsaId == null)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, venda.Id));
        });

        var mensagem = aVender.Count == 0
            ? (itens.Count == 1 ? "Pedido entregue." : $"{itens.Count} itens entregues.")
            : itens.Count == 1
                ? "Pré-venda homologada com sucesso."
                : $"{itens.Count} itens do carrinho homologados de uma vez.";
        // ReservationId: compatibilidade com quem já consumia o endpoint de 1 item
        return new HomologacaoDto(mensagem, aVender.Count > 0, primeiro.Id, ids, itens.Count,
            venda?.DiscountPercent ?? 0, venda?.DiscountInReais ?? 0);
    }

    // Cliente que paga adiantado por fora (dinheiro, cartão, chave da loja) fica igual a quem pagou o
    // Pix do site: a venda entra no Financeiro agora e o pedido continua ativo em "Pago · aguardando
    // retirada" — o Entregar (Homologar de pedido já vendido) só registra a retirada.
    public async Task<PagamentoRegistradoDto> RegistrarPagamentoAsync(Guid groupId, HomologarRequest req, Ator ator)
    {
        if (!await LigadaAsync(Funcionalidades.PagamentoSemRetirada))
            throw new PedidoException("Use o Homologar pra lançar o pagamento.", 404);

        var itens = await AtivosDoPedidoAsync(groupId);
        if (itens.Any(r => r.VendaAvulsaId is not null && !PedidoVendaService.TemVenda(r)))
            throw new PedidoException(Pedido.VendaSendoRegistrada, 409);

        var aVender = itens.Where(r => r.VendaAvulsaId is null).ToList();
        if (aVender.Count == 0)
            throw new PedidoException("Este pedido já está pago — falta só entregar.");

        // Pix aberto + pagamento por fora = o cliente poderia pagar duas vezes. A tela oferece o
        // botão que cancela a cobrança (conferindo no Inter).
        var temPixAberto = await db.PixCobrancas.AnyAsync(p =>
            p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva && p.Status == "ATIVA");
        if (temPixAberto)
            throw new PedidoException("Este pedido tem um Pix aberto — cancele o Pix antes de lançar o pagamento por fora.", 409,
                new Dictionary<string, object?> { ["pixAberto"] = true });

        var ids   = aVender.Select(r => r.Id).ToList();
        var marca = PedidoVendaService.Registrando + "manual-" + Guid.NewGuid().ToString("N");
        VendaAvulsaDto? venda = null;

        // Claim + venda na mesma transação, como no Homologar: o claim (VendaAvulsaId marcado e
        // ExpiresAt nulo = pago) tira os itens do alcance do Pix e de outro Homologar no meio do caminho.
        await NaTransacaoAsync(async () =>
        {
            var claimed = await db.ProductReservations
                .Where(r => ids.Contains(r.Id) && r.Status == "active" && r.VendaAvulsaId == null)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.VendaAvulsaId, marca)
                    .SetProperty(r => r.ExpiresAt, (DateTime?)null));
            if (claimed != ids.Count)
                throw new PedidoException("Algum item deste pedido mudou enquanto você preenchia — abra de novo pra ver como ficou.");

            venda = await RegistrarVendaAsync(itens[0], aVender, req, ator);
            await db.ProductReservations.Where(r => ids.Contains(r.Id) && r.VendaAvulsaId == marca)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.VendaAvulsaId, venda.Id));
        });

        return new PagamentoRegistradoDto("Pagamento registrado — o pedido fica aguardando a retirada.",
            aVender.Count, venda?.DiscountPercent ?? 0, venda?.DiscountInReais ?? 0);
    }

    /// <summary>
    /// Pedido pago que já virou venda: estorna a venda (que devolve o estoque) e cancela o pedido pago
    /// inteiro que ela cobria — uma venda por pedido, sem estorno parcial. null = não é o caso.
    /// </summary>
    private async Task<PedidoCanceladoDto?> CancelarComVendaAsync(ProductReservation res, Ator ator)
    {
        if (!PedidoVendaService.TemVenda(res))
        {
            if (res.VendaAvulsaId is not null) throw new PedidoException(Pedido.VendaSendoRegistrada, 409);
            return null;
        }
        if (!ator.EhAdmin)
            throw new PedidoException("Esta pré-venda já foi paga — fale com a loja pra cancelar e combinar o estorno.");

        var vendaId = res.VendaAvulsaId!;
        try
        {
            await vendas.EstornarAsync(vendaId, ator.Id, ator.Nome, "Pedido do site cancelado");
        }
        catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException)
        {
            throw new PedidoException($"Não deu pra estornar a venda do pedido: {ex.Message}");
        }

        // O estorno já devolveu o estoque: aqui só fecha os itens
        var doPedido = db.ProductReservations.Where(r => r.VendaAvulsaId == vendaId && r.Status == "active");
        var produtosDoPedido = await doPedido.Select(r => r.ProductId).Distinct().ToListAsync();
        var agora = DateTime.UtcNow;
        var itens = await doPedido.ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "cancelled").SetProperty(r => r.CancelledAt, agora));

        await audit.LogAsync("CancelouPedidoPagoEstornouVenda", "ProductReservation", res.Id.ToString(),
            details: $"{{\"vendaAvulsaId\":\"{vendaId}\",\"itens\":{itens},\"observacao\":\"devolver o valor pelo Inter\"}}");

        // Todo produto que voltou pro estoque puxa a fila dele, não só o da linha clicada
        foreach (var produtoId in produtosDoPedido) await ProcessarFilaAsync(produtoId);
        await Pedido.AvisarEstoqueMudouAsync(hub);
        return new PedidoCanceladoDto(JaPaga: true, VendaEstornada: true, Itens: itens);
    }

    /// <summary>
    /// Fecha o item (claim atômico pelo status de agora) e devolve o estoque se era pré-venda
    /// cancelada. Cancelar item que virou venda no meio do caminho (Pix acabou de cair) é recusado:
    /// esse caminho não estornaria a venda — o admin cancela de novo pelo caminho com estorno.
    /// </summary>
    private async Task<bool> FecharAsync(ProductReservation res, string novoStatus)
    {
        var statusOriginal = res.Status;
        var devolveu = false;
        await NaTransacaoAsync(async () =>
        {
            devolveu = false;
            var claimed = novoStatus == "fulfilled"
                ? await db.ProductReservations
                    .Where(r => r.Id == res.Id && r.Status == "active")
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "fulfilled").SetProperty(r => r.FulfilledAt, DateTime.UtcNow))
                : await db.ProductReservations
                    .Where(r => r.Id == res.Id && r.Status == statusOriginal && r.VendaAvulsaId == null)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "cancelled").SetProperty(r => r.CancelledAt, DateTime.UtcNow));
            if (claimed == 0) throw new PedidoException(EncerradaOuVirouVenda);

            if (novoStatus == "cancelled" && statusOriginal == "active" && res.Kind == "pre_venda")
            {
                await Pedido.DevolverEstoqueAsync(db, res);
                devolveu = true;
            }
        });
        return devolveu;
    }

    private async Task<VendaAvulsaDto> RegistrarVendaAsync(ProductReservation primeiro, List<ProductReservation> aVender,
        HomologarRequest req, Ator ator)
    {
        try
        {
            return await vendas.RegisterAsync(new VendaAvulsaRequest
            {
                ClientName                 = primeiro.User?.Name,
                UserId                     = primeiro.UserId,
                PaymentMethod              = req.PaymentMethod ?? Models.MongoDB.PaymentMethod.Dinheiro,
                SecondPaymentMethod        = req.SecondPaymentMethod,
                SecondPaymentAmountInCents = req.SecondPaymentAmountInCents ?? 0,
                // Decidido pelo admin só agora — o cliente nunca viu esse desconto no carrinho/Pix
                DiscountPercent            = req.DiscountPercent,
                DiscountInCents            = req.DiscountInCents,
                SkipStockDecrement         = true, // o estoque já saiu no pedido
                // Origem separa no Financeiro venda do site de Comanda/PDV; "Pré-venda" só quando
                // TODO o pedido é de item pré-venda (carrinho misturado conta como "Site")
                Origem                     = "Reserva",
                ReservationId              = primeiro.Id,
                ReservationGroupId         = primeiro.ReservationGroupId,
                ProductIsPreVenda          = aVender.All(r => r.Product?.IsPreVenda ?? false),
                Items = aVender.Select(r => new VendaAvulsaItemRequest
                {
                    ProductId = r.ProductId, VariantId = r.VariantId, Quantity = r.Quantity,
                    UnitPriceInCents = PedidoVendaService.PrecoDoPedido(r),
                }).ToList(),
            }, ator.Id, ator.Nome);
        }
        catch (InvalidOperationException ex)
        {
            throw new PedidoException(ex.Message); // sem Commit: o claim volta
        }
    }

    /// <summary>
    /// Roda o bloco numa transação dentro da execution strategy do Npgsql (EnableRetryOnFailure não
    /// aceita transação solta). PedidoException no meio = sem Commit: o rollback desfaz tudo.
    /// </summary>
    private async Task NaTransacaoAsync(Func<Task> bloco)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            await bloco();
            await tx.CommitAsync();
        });
    }

    private IQueryable<ProductReservation> ItensComDetalhes() =>
        db.ProductReservations.Include(r => r.User).Include(r => r.Product).Include(r => r.Variant);

    private async Task<List<ProductReservation>> AtivosDoPedidoAsync(Guid groupId)
    {
        var itens = await ItensComDetalhes()
            .Where(r => r.ReservationGroupId == groupId && r.Status == "active" && r.Kind == "pre_venda")
            .OrderBy(r => r.ReservedAt)
            .ToListAsync();
        if (itens.Count == 0) throw new PedidoException("Nenhuma pré-venda ativa neste pedido.", 404);
        return itens;
    }

    private async Task<PedidoItemDto> ComProdutoEClienteAsync(ProductReservation res)
    {
        await Pedido.CarregarProdutoAsync(db, res);
        await db.Entry(res).Reference(x => x.User).LoadAsync();
        return Pedido.ParaDto(res);
    }

    /// <summary>Estoque voltou: puxa o próximo da fila e avisa a tela do admin.</summary>
    private async Task EstoqueVoltouAsync(Guid produtoId)
    {
        await ProcessarFilaAsync(produtoId);
        await Pedido.AvisarEstoqueMudouAsync(hub);
    }

    private async Task ProcessarFilaAsync(Guid produtoId)
    {
        try { await produtos.ProcessarChegadaFilaAsync(produtoId); }
        catch { /* melhor-esforço — o próximo reestoque/job cobre */ }
    }

    private async Task<bool> LigadaAsync(string codigo) =>
        funcionalidades is null ? Funcionalidades.Buscar(codigo)!.Padrao : await funcionalidades.LigadaAsync(codigo);
}
