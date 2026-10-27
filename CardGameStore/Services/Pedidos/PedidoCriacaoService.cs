// =============================================================================
// PedidoCriacaoService.cs — nascimento dos pedidos do site.
//
// PRÉ-VENDA / RESERVA ONLINE (kind=pre_venda): item EM ESTOQUE. Baixa o estoque no
// ato. Fica "active" até o admin cancelar (o estoque volta) ou o Pix confirmar (vira
// venda, aguardando retirada). O cliente declara a intenção de pagamento: "pix" ou
// "retirada".
//
// FILA (kind=fila): LEGADA — o site NÃO cria mais fila (sem estoque = 409). O admin
// ainda registra fila à mão (pedido do WhatsApp), e a conversão fila→pré-venda segue
// em ProductService.ProcessarChegadaFilaAsync.
// =============================================================================

using System.Text.Json;
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

public interface IPedidoCriacaoService
{
    /// <summary>Um item avulso do site (vira um pedido de 1 item).</summary>
    Task<PedidoItemDto> CriarAsync(Guid userId, CreateReservationRequest req);

    /// <summary>Carrinho do site: um pedido com todos os itens, ou nenhum.</summary>
    Task<CarrinhoCriadoDto> CriarCarrinhoAsync(Guid userId, CreateReservationCartRequest req);

    /// <summary>Admin registra o pedido em nome do cliente (WhatsApp, balcão).</summary>
    Task<PedidoAdminCriadoDto> CriarPeloAdminAsync(AdminCreateReservationRequest req);
}

public class PedidoCriacaoService(
    AppDbContext db, IPedidoCobrancaService cobranca, IPushService push, IAuditService audit,
    IHubContext<ComandaHub> hub, FuncionalidadesService? funcionalidades = null) : IPedidoCriacaoService
{
    /// <summary>Por que um item não pôde ser criado (vira a resposta de quem chamou).</summary>
    private sealed record Recusa(int Status, string Mensagem);

    public async Task<PedidoItemDto> CriarAsync(Guid userId, CreateReservationRequest req)
    {
        // Mesmo padrão do carrinho: o insert e a baixa de estoque na mesma transação — a baixa do
        // ExecuteUpdateAsync some se o SaveChangesAsync falhar depois (era o bug do "estoque some e
        // a pré-venda não vincula"). Sem estoque vira erro em vez de fila (o site não cria fila).
        var criadas = await CriarEPersistirAsync(userId, [(req.ProductId, req.VariantId, Math.Max(1, req.Quantity))],
            req.Notes, permitirFila: false, Pedido.FormaDePagamento(req.PaymentMethod), umPorPedido: true);
        var r = criadas[0];

        if (r.Kind == "pre_venda") await Pedido.AvisarEstoqueMudouAsync(hub); // fila não mexe em estoque
        await Pedido.CarregarProdutoAsync(db, r);
        return Pedido.ParaDto(r);
    }

    // Transação única: se qualquer item falhar, o estoque já baixado dos anteriores volta (rollback
    // no Dispose). Item sem estoque não vira fila sozinho: com AllowFilaFallback=false o carrinho
    // inteiro é recusado com 409 + a lista dos itens.
    public async Task<CarrinhoCriadoDto> CriarCarrinhoAsync(Guid userId, CreateReservationCartRequest req)
    {
        if (req.Items is null || req.Items.Count == 0)
            throw new PedidoException("Carrinho vazio.");

        var formaDePagamento = Pedido.FormaDePagamento(req.PaymentMethod);

        // Chave "pedido-pix-junto": quem já tem pedido de pré-venda sem pagar soma os itens novos
        // nele (um Pix só). O pedido ABERTO é escolhido agora, mas nada nele muda antes de o carrinho
        // novo dar certo — os itens nascem num pedido próprio e só depois são movidos (JuntarAsync).
        var juntar = await LigadaAsync(Funcionalidades.PedidoPixJunto)
            ? await PedidoAbertoParaJuntarAsync(userId, formaDePagamento)
            : null;

        var criadas = await CriarEPersistirAsync(userId,
            req.Items.Select(i => (i.ProductId, i.VariantId, Math.Max(1, i.Quantity))).ToList(),
            notes: null, permitirFila: true, formaDePagamento, recusarFila: !req.AllowFilaFallback, recusaComo400: true);

        foreach (var r in criadas) await Pedido.CarregarProdutoAsync(db, r);
        if (criadas.Any(r => r.Kind == "pre_venda")) await Pedido.AvisarEstoqueMudouAsync(hub);

        var groupId = criadas[0].ReservationGroupId;
        var juntou = false;
        if (juntar is not null && await JuntarAsync(juntar.Value, userId, formaDePagamento, criadas))
        {
            groupId = juntar.Value;
            juntou  = true;
            await audit.LogAsync("JuntouItensNoPedido", "ProductReservation", groupId.ToString(),
                details: $"{{\"itens\":{criadas.Count}}}");
        }

        return new CarrinhoCriadoDto(groupId, juntou, criadas.Select(r => Pedido.ParaDto(r)));
    }

    // Mesmas regras da criação normal: em estoque vira pré-venda com baixa na hora; não chegou
    // vira fila. Vários itens viram UM pedido só, igual ao carrinho do site.
    public async Task<PedidoAdminCriadoDto> CriarPeloAdminAsync(AdminCreateReservationRequest req)
    {
        if (!await db.Users.AnyAsync(u => u.Id == req.UserId))
            throw new PedidoException("Cliente não encontrado.", 404);

        // Compat: chamada antiga manda o item solto nos campos de cima; a tela nova manda Items.
        var itens = req.Items is { Count: > 0 }
            ? req.Items
            : [new AdminCreateReservationItem { ProductId = req.ProductId, VariantId = req.VariantId, Quantity = req.Quantity }];

        var criadas = await CriarEPersistirAsync(req.UserId,
            itens.Select(i => (i.ProductId, i.VariantId, Math.Max(1, i.Quantity))).ToList(),
            req.Notes, permitirFila: true, formaDePagamento: null);

        if (criadas.Any(r => r.Kind == "pre_venda")) await Pedido.AvisarEstoqueMudouAsync(hub);

        // Reserva manual movimenta estoque em nome de terceiro — registra quem fez
        foreach (var r in criadas)
            await audit.LogAsync("CriouReservaManual", "ProductReservation", r.Id.ToString(),
                details: JsonSerializer.Serialize(new { clienteId = req.UserId, produtoId = r.ProductId, quantidade = r.Quantity, r.Kind }));

        foreach (var r in criadas) await Pedido.CarregarProdutoAsync(db, r);

        await AvisarClienteAsync(req.UserId, criadas);

        return new PedidoAdminCriadoDto(criadas[0].ReservationGroupId, criadas.Select(r => Pedido.ParaDto(r)));
    }

    /// <summary>Notificação in-app + push, uma só pro pedido inteiro. Melhor-esforço: o pedido já vale.</summary>
    private async Task AvisarClienteAsync(Guid userId, List<ProductReservation> criadas)
    {
        try
        {
            var primeira = criadas[0];
            var soFila   = criadas.All(r => r.Kind == "fila");
            var titulo   = soFila ? "Você entrou na fila 📋" : "Pré-venda registrada ✅";
            var corpo = criadas.Count == 1
                ? soFila
                    ? $"A loja te colocou na fila de \"{primeira.Product?.Name}\". A gente avisa quando chegar."
                    : $"A loja registrou \"{primeira.Product?.Name}\" pra você — pague no Pix ou na retirada."
                : soFila
                    ? $"A loja te colocou na fila de {criadas.Count} itens. A gente avisa quando chegarem."
                    : $"A loja registrou {criadas.Count} itens pra você — pague no Pix ou na retirada.";

            db.Notifications.Add(new Notification
            {
                UserId = userId, Title = titulo, Body = corpo,
                Link = "/cliente/perfil", ImageUrl = primeira.Product?.ImageUrl,
            });
            await db.SaveChangesAsync();
            await push.SendToManyAsync([userId], titulo, corpo, "/cliente/perfil", primeira.Product?.ImageUrl);
        }
        catch { /* notificação é melhor-esforço — a reserva já está valendo */ }
    }

    /// <summary>
    /// Cria os itens num único pedido e persiste tudo na mesma transação: se um item falhar, o
    /// estoque já baixado dos anteriores volta no rollback. O Npgsql roda com EnableRetryOnFailure
    /// (Program.cs), que rejeita transação manual solta: o bloco inteiro roda dentro da execution
    /// strategy — numa falha transitória ela reexecuta tudo.
    /// umPorPedido: o pedido avulso usa o próprio Id como grupo. recusarFila: item que só caberia
    /// na fila recusa o carrinho inteiro (409 com a lista dos itens sem estoque). recusaComo400: o
    /// carrinho responde qualquer item recusado com 400.
    /// </summary>
    private async Task<List<ProductReservation>> CriarEPersistirAsync(
        Guid userId, List<(Guid ProductId, Guid? VariantId, int Qty)> itens, string? notes,
        bool permitirFila, string? formaDePagamento, bool umPorPedido = false, bool recusarFila = false, bool recusaComo400 = false)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        List<ProductReservation>? criadas = null;
        PedidoException? falha = null;

        await strategy.ExecuteAsync(async () =>
        {
            // Numa reexecução, as reservas da tentativa anterior continuam "Added" no tracker e
            // seriam inseridas DE NOVO — reserva duplicada e estoque baixado duas vezes.
            db.ChangeTracker.Clear();
            criadas = null;
            falha   = null;

            var groupId   = Guid.NewGuid();
            var toCreate  = new List<ProductReservation>();
            var virouFila = new List<Guid>();

            await using var tx = await db.Database.BeginTransactionAsync();

            foreach (var (productId, variantId, qty) in itens)
            {
                var (r, recusa) = await CriarItemAsync(userId, groupId, productId, variantId, qty, notes, permitirFila, formaDePagamento);
                if (recusa is not null)
                {
                    falha = new PedidoException(recusa.Mensagem, recusaComo400 ? 400 : recusa.Status);
                    return; // sem Commit: rollback no Dispose devolve o estoque baixado
                }
                if (umPorPedido) r!.ReservationGroupId = r.Id; // avulsa = grupo de 1 item só
                if (recusarFila && r!.Kind == "fila") virouFila.Add(r.ProductId);
                toCreate.Add(r!);
            }

            if (virouFila.Count > 0)
            {
                // Sem Commit: o estoque baixado deste carrinho volta com o rollback
                var semEstoque = await db.Products
                    .Where(p => virouFila.Contains(p.Id))
                    .Select(p => new { productId = p.Id, p.Name })
                    .ToListAsync();
                falha = new PedidoException(
                    "Alguns itens ficaram sem estoque enquanto você montava a reserva. Escolha entrar na fila de espera ou removê-los.",
                    409, new Dictionary<string, object?> { ["semEstoque"] = semEstoque });
                return;
            }

            db.ProductReservations.AddRange(toCreate);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            criadas = toCreate;
        });

        if (falha is not null) throw falha;
        return criadas!;
    }

    /// <summary>
    /// Núcleo da criação: decide pré-venda × fila e já aplica o efeito de estoque.
    /// Pré-venda: decremento atômico (falha = sem estoque → vira fila se aceitar).
    /// Fila: só se o produto aceita fila (IsPreVenda) e o cliente ainda não está nela.
    /// </summary>
    private async Task<(ProductReservation? Reservation, Recusa? Recusa)> CriarItemAsync(
        Guid userId, Guid groupId, Guid productId, Guid? variantId, int qty, string? notes,
        bool permitirFila, string? formaDePagamento)
    {
        var product = await db.Products
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == productId && p.IsActive);
        if (product is null)
            return (null, new Recusa(404, "Produto não encontrado."));

        ProductVariant? variant = null;
        if (product.HasVariants)
        {
            if (!variantId.HasValue)
                return (null, new Recusa(400, $"\"{product.Name}\" tem grade — selecione tamanho/cor."));
            variant = product.Variants.FirstOrDefault(v => v.Id == variantId.Value);
            if (variant is null)
                return (null, new Recusa(400, $"Variante não encontrada para \"{product.Name}\"."));
        }

        // ── Tenta PRÉ-VENDA: baixa o estoque na hora (atômico, sem corrida) ──
        int baixado;
        if (variant is not null)
            baixado = await db.ProductVariants
                .Where(v => v.Id == variant.Id && v.StockQuantity >= qty)
                .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - qty));
        else
            baixado = await db.Products
                .Where(p => p.Id == product.Id && p.StockQuantity >= qty)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity - qty));

        if (baixado > 0)
        {
            // ExpiresAt marca "ainda não paga" (some quando o Pix confirma, em
            // PixReconciliationService.BaixarReservaAsync) — não expira mais sozinha.
            return (new ProductReservation
            {
                ReservationGroupId = groupId,
                UserId = userId, ProductId = productId, VariantId = variant?.Id,
                Quantity = qty, Notes = notes,
                Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
                PaymentMethod = formaDePagamento,
                // Preço congelado: o que o cliente viu é o que paga, mesmo se o preço mudar depois
                UnitPriceInCents = variant?.PriceInCents
                    ?? (product.IsOnPromo ? product.DiscountPriceInCents!.Value : product.PriceInCents),
            }, null);
        }

        // ── Sem estoque: vira FILA só se quem chamou permite E o produto aceita ──
        if (!permitirFila || !product.IsPreVenda)
            return (null, new Recusa(400, $"\"{product.Name}\" está sem estoque no momento."));

        var jaNaFila = await db.ProductReservations.AnyAsync(r =>
            r.UserId == userId && r.ProductId == productId && r.VariantId == variantId
            && r.Kind == "fila" && r.Status == "waiting");
        if (jaNaFila)
            return (null, new Recusa(409, $"Você já está na fila de \"{product.Name}\"."));

        return (new ProductReservation
        {
            ReservationGroupId = groupId,
            UserId = userId, ProductId = productId, VariantId = variant?.Id,
            Quantity = qty, Notes = notes,
            Kind = "fila", Status = "waiting", ExpiresAt = null,
        }, null);
    }

    /// <summary>
    /// Move os itens recém-criados (já num pedido próprio, válido) pro pedido aberto do cliente.
    /// Tudo sob a trava do pedido que o "Gerar Pix" usa: derruba o Pix ativo dele (conferindo se não
    /// foi pago) e move os itens antes de alguém gerar um Pix novo — que então sai com o total.
    /// Não dá (pago agora, Inter fora, deixou de estar aberto)? Os itens ficam no pedido próprio.
    /// </summary>
    private async Task<bool> JuntarAsync(Guid alvo, Guid userId, string? formaDePagamento, List<ProductReservation> novos)
    {
        using var trava = await ReservationPixService.TravarPedidoAsync(alvo);

        // Pode ter sido pago ou cancelado desde a escolha: confere de novo, já com a trava
        if (await PedidoAbertoParaJuntarAsync(userId, formaDePagamento, exceto: novos[0].ReservationGroupId) != alvo)
            return false;
        if (!await cobranca.DerrubarParaJuntarAsync(alvo))
            return false;

        var ids = novos.Select(r => r.Id).ToList();
        await db.ProductReservations.Where(r => ids.Contains(r.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ReservationGroupId, alvo));
        foreach (var r in novos) r.ReservationGroupId = alvo;
        return true;
    }

    /// <summary>
    /// Pedido de pré-venda do cliente que ainda aceita itens: tudo ativo, sem pagar (ExpiresAt
    /// marcado), sem venda registrada e na mesma forma de pagamento. O mais recente.
    /// </summary>
    private async Task<Guid?> PedidoAbertoParaJuntarAsync(Guid userId, string? formaDePagamento, Guid? exceto = null)
    {
        // Poucos itens por cliente: agrupa em memória (All dentro de GroupBy não traduz pra SQL)
        var itens = await db.ProductReservations.AsNoTracking()
            .Where(r => r.UserId == userId && r.Status != "cancelled")
            .Select(r => new { r.ReservationGroupId, r.ReservedAt, r.Kind, r.Status, r.ExpiresAt, r.VendaAvulsaId, r.PaymentMethod })
            .ToListAsync();
        return itens
            .Where(r => r.ReservationGroupId != exceto)
            .GroupBy(r => r.ReservationGroupId)
            .Where(g => g.All(r => r.Kind == "pre_venda" && r.Status == "active" && r.ExpiresAt != null
                                   && r.VendaAvulsaId == null && r.PaymentMethod == formaDePagamento))
            .OrderByDescending(g => g.Max(r => r.ReservedAt))
            .Select(g => (Guid?)g.Key)
            .FirstOrDefault();
    }

    private async Task<bool> LigadaAsync(string codigo) =>
        funcionalidades is null ? Funcionalidades.Buscar(codigo)!.Padrao : await funcionalidades.LigadaAsync(codigo);
}
