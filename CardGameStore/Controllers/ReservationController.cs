using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace CardGameStore.Controllers;

// =============================================================================
// ReservationController.cs — Pedidos online unificados (pré-venda e venda-reserva)
//
// PRÉ-VENDA / RESERVA ONLINE (kind=pre_venda): item EM ESTOQUE. Baixa o estoque
// no ato, data de rua opcional. Não expira sozinha — fica "active" até o admin
// cancelar manualmente (o estoque volta e passa pro próximo da fila legada) ou
// o Pix confirmar (vira venda feita aguardando retirada). O cliente declara a
// intenção de pagamento na criação: "pix" (pagar agora) ou "retirada" (balcão).
//
// FILA (kind=fila): LEGADA — o site NÃO cria mais fila (sem estoque = 409).
// As linhas waiting antigas seguem legíveis e a conversão fila→pré-venda
// (ProductService.ProcessarChegadaFilaAsync) continua funcionando pra elas;
// o admin também pode registrar fila manualmente (admin-create, pedido WhatsApp).
// =============================================================================

[ApiController]
[Route("api/reservations")]
[Produces("application/json")]
public class ReservationController : ControllerBase
{
    private readonly AppDbContext        _db;
    private readonly IVendaAvulsaService _vendaService;
    private readonly InterSyncService    _inter;
    private readonly IPixReconciliationService _pixReconciliation;
    private readonly IPushService        _push;
    private readonly IAuditService       _audit;
    private readonly IHubContext<ComandaHub> _hub;

    public ReservationController(
        AppDbContext db, IVendaAvulsaService vendaService,
        InterSyncService inter, IPixReconciliationService pixReconciliation, IPushService push,
        IAuditService audit, IHubContext<ComandaHub> hub)
    {
        _db                = db;
        _vendaService      = vendaService;
        _inter             = inter;
        _pixReconciliation = pixReconciliation;
        _push              = push;
        _audit             = audit;
        _hub               = hub;
    }

    // Avisa o admin (grupo do hub) que o estoque mudou — a tela de estoque
    // recarrega sozinha, sem F5, quando cliente reserva/cancela no site.
    private async Task AvisarEstoqueMudouAsync() =>
        await _hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("StockChanged", new { });

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id)) throw new UnauthorizedAccessException();
        return id;
    }

    // GET /api/reservations/mine — pré-vendas e fila do usuário logado
    [HttpGet("mine")]
    [Authorize]
    public async Task<IActionResult> GetMine()
    {
        var userId = GetUserId();
        var list = await _db.ProductReservations
            .Where(r => r.UserId == userId)
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .OrderByDescending(r => r.ReservedAt)
            .ToListAsync();

        var result = new List<object>();
        foreach (var r in list)
        {
            int? posicao = null;
            if (r.Kind == "fila" && r.Status == "waiting")
                posicao = 1 + await _db.ProductReservations
                    .CountAsync(w => w.ProductId == r.ProductId && w.Kind == "fila"
                                  && w.Status == "waiting" && w.ReservedAt < r.ReservedAt);
            result.Add(ToDto(r, posicao));
        }
        return Ok(result);
    }

    // POST /api/reservations — cria pré-venda/reserva online (item EM ESTOQUE).
    // Sem estoque = 409 (o site não cria mais fila — fila é só legada/manual).
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateReservationRequest req)
    {
        var userId = GetUserId();
        var (r, falha) = await CriarEPersistirAsync(userId, req.ProductId, req.VariantId,
                                                     req.Quantity < 1 ? 1 : req.Quantity, req.Notes,
                                                     permitirFila: false, NormalizarPaymentMethod(req.PaymentMethod));
        if (falha is not null) return falha;

        if (r!.Kind == "pre_venda") await AvisarEstoqueMudouAsync(); // fila não mexe em estoque

        await _db.Entry(r).Reference(x => x.Product).LoadAsync();
        await _db.Entry(r).Reference(x => x.Variant).LoadAsync();
        return Ok(ToDto(r));
    }

    /// <summary>Só "pix" e "retirada" são válidos — qualquer outra coisa vira null (não declarado).</summary>
    private static string? NormalizarPaymentMethod(string? pm) =>
        pm is "pix" or "retirada" ? pm : null;

    /// <summary>
    /// Cria o item (CriarItemAsync) e persiste dentro da mesma transação: a baixa de
    /// estoque do ExecuteUpdateAsync some do banco se o SaveChangesAsync falhar depois
    /// (era o bug do "estoque some e a pré-venda não vincula" — o insert e a baixa
    /// rodavam soltos, sem transação, então uma falha no insert não desfazia a baixa).
    /// Mesmo padrão do CreateCart: bloco inteiro dentro da execution strategy do Npgsql.
    /// permitirFila=false (site): sem estoque vira erro "sem_estoque" (409) em vez de fila.
    /// </summary>
    private async Task<(ProductReservation? Reservation, IActionResult? Error)> CriarEPersistirAsync(
        Guid userId, Guid productId, Guid? variantId, int qty, string? notes,
        bool permitirFila = true, string? paymentMethod = null)
    {
        var strategy = _db.Database.CreateExecutionStrategy();

        ProductReservation? reservation = null;
        IActionResult?      falha       = null;

        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            var created = await CriarItemAsync(userId, Guid.NewGuid(), productId, variantId, qty, notes,
                                               permitirFila, paymentMethod);
            if (created.Error is not null)
            {
                falha = created.Error switch
                {
                    "not_found"   => NotFound(new { created.Message }),
                    "conflict"    => Conflict(new { created.Message }),
                    "sem_estoque" => Conflict(new { created.Message }),
                    _             => BadRequest(new { created.Message }),
                };
                return; // sem Commit: rollback no Dispose devolve o estoque baixado
            }

            var r = created.Reservation!;
            r.ReservationGroupId = r.Id; // avulsa = grupo de 1 item só
            _db.ProductReservations.Add(r);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            reservation = r;
        });

        return (reservation, falha);
    }

    // POST /api/reservations/cart — cria várias de uma vez (carrinho), mesmo ReservationGroupId.
    // Transação única: se qualquer item falhar, o estoque já baixado dos anteriores volta
    // (rollback no Dispose) — sem vazamento. Item sem estoque não vira fila silenciosamente:
    // com AllowFilaFallback=false o carrinho inteiro é recusado com 409 + a lista dos itens.
    [HttpPost("cart")]
    [Authorize]
    public async Task<IActionResult> CreateCart([FromBody] CreateReservationCartRequest req)
    {
        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { Message = "Carrinho vazio." });

        var userId  = GetUserId();
        var groupId = Guid.NewGuid();

        // O Npgsql roda com EnableRetryOnFailure (Program.cs), que rejeita transação manual
        // solta ("user-initiated transactions are not supported"): o bloco inteiro precisa
        // rodar dentro da execution strategy — numa falha transitória ela reexecuta tudo.
        var strategy = _db.Database.CreateExecutionStrategy();

        IActionResult? falha = null;
        List<ProductReservation>? criadas = null;

        await strategy.ExecuteAsync(async () =>
        {
            var toCreate  = new List<ProductReservation>();
            var virouFila = new List<Guid>();

            await using var tx = await _db.Database.BeginTransactionAsync();

            var paymentMethod = NormalizarPaymentMethod(req.PaymentMethod);
            foreach (var item in req.Items)
            {
                // permitirFila sempre true aqui: deixa o item virar "fila" internamente
                // (se o produto aceitar) pra decidir DEPOIS se aceita ou recusa o carrinho
                // inteiro com base em AllowFilaFallback — ver bloco virouFila abaixo.
                var created = await CriarItemAsync(userId, groupId, item.ProductId, item.VariantId,
                                                   item.Quantity < 1 ? 1 : item.Quantity, null,
                                                   permitirFila: true, paymentMethod: paymentMethod);
                if (created.Error is not null)
                {
                    falha = BadRequest(new { created.Message });
                    return; // sem Commit: rollback no Dispose devolve o estoque baixado
                }

                if (created.Reservation!.Kind == "fila" && !req.AllowFilaFallback)
                    virouFila.Add(created.Reservation.ProductId);

                toCreate.Add(created.Reservation!);
            }

            if (virouFila.Count > 0)
            {
                // Sem Commit: o estoque baixado deste carrinho volta com o rollback.
                var semEstoque = await _db.Products
                    .Where(p => virouFila.Contains(p.Id))
                    .Select(p => new { productId = p.Id, p.Name })
                    .ToListAsync();

                falha = Conflict(new
                {
                    Message = "Alguns itens ficaram sem estoque enquanto você montava a reserva. Escolha entrar na fila de espera ou removê-los.",
                    SemEstoque = semEstoque,
                });
                return;
            }

            _db.ProductReservations.AddRange(toCreate);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            criadas = toCreate;
        });

        if (falha is not null) return falha;

        foreach (var r in criadas!)
        {
            await _db.Entry(r).Reference(x => x.Product).LoadAsync();
            await _db.Entry(r).Reference(x => x.Variant).LoadAsync();
        }

        if (criadas!.Any(r => r.Kind == "pre_venda")) await AvisarEstoqueMudouAsync();

        return Ok(new { groupId, items = criadas!.Select(r => ToDto(r)) });
    }

    // POST /api/reservations/admin-create — admin registra pré-venda/fila em nome do
    // cliente (pedido chegou pelo WhatsApp ou no balcão). Mesmas regras da criação
    // normal: em estoque vira pré-venda com baixa na hora; não chegou vira fila.
    [HttpPost("admin-create")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> AdminCreate([FromBody] AdminCreateReservationRequest req)
    {
        var clienteExiste = await _db.Users.AnyAsync(u => u.Id == req.UserId);
        if (!clienteExiste) return NotFound(new { Message = "Cliente não encontrado." });

        var (r, falha) = await CriarEPersistirAsync(req.UserId, req.ProductId, req.VariantId,
                                                     req.Quantity < 1 ? 1 : req.Quantity, req.Notes);
        if (falha is not null) return falha;

        if (r!.Kind == "pre_venda") await AvisarEstoqueMudouAsync();

        // Auditoria: reserva manual movimenta estoque em nome de terceiro — registra quem fez.
        await _audit.LogAsync("CriouReservaManual", "ProductReservation", r.Id.ToString(),
            details: JsonSerializer.Serialize(new { clienteId = req.UserId, produtoId = r.ProductId, quantidade = r.Quantity, r.Kind }),
            httpContext: HttpContext);

        await _db.Entry(r).Reference(x => x.Product).LoadAsync();
        await _db.Entry(r).Reference(x => x.Variant).LoadAsync();

        // Avisa o cliente (melhor-esforço): notificação in-app + push
        try
        {
            var titulo = r.Kind == "fila" ? "Você entrou na fila 📋" : "Pré-venda registrada ✅";
            var corpo  = r.Kind == "fila"
                ? $"A loja te colocou na fila de \"{r.Product?.Name}\". A gente avisa quando chegar."
                : $"A loja registrou \"{r.Product?.Name}\" pra você — pague no Pix ou na retirada.";
            _db.Notifications.Add(new Notification
            {
                UserId = r.UserId, Title = titulo, Body = corpo,
                Link = "/cliente/perfil", ImageUrl = r.Product?.ImageUrl,
            });
            await _db.SaveChangesAsync();
            await _push.SendToManyAsync([r.UserId], titulo, corpo, "/cliente/perfil", r.Product?.ImageUrl);
        }
        catch { /* notificação é melhor-esforço — a reserva já está valendo */ }

        return Ok(ToDto(r));
    }

    /// <summary>
    /// Núcleo da criação: decide pré-venda × fila e já aplica o efeito de estoque.
    /// Pré-venda: decremento atômico (falha = sem estoque → vira fila se aceitar).
    /// Fila: só se o produto aceita fila (IsPreVenda) e o cliente ainda não está nela.
    /// </summary>
    private async Task<(ProductReservation? Reservation, string? Error, string? Message)> CriarItemAsync(
        Guid userId, Guid groupId, Guid productId, Guid? variantId, int qty, string? notes,
        bool permitirFila = true, string? paymentMethod = null)
    {
        var product = await _db.Products
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == productId && p.IsActive);
        if (product is null)
            return (null, "not_found", "Produto não encontrado.");

        ProductVariant? variant = null;
        if (product.HasVariants)
        {
            if (!variantId.HasValue)
                return (null, "bad_request", $"\"{product.Name}\" tem grade — selecione tamanho/cor.");
            variant = product.Variants.FirstOrDefault(v => v.Id == variantId.Value);
            if (variant is null)
                return (null, "bad_request", $"Variante não encontrada para \"{product.Name}\".");
        }

        // ── Tenta PRÉ-VENDA: baixa o estoque na hora (atômico, sem corrida) ──
        int baixado;
        if (variant is not null)
            baixado = await _db.ProductVariants
                .Where(v => v.Id == variant.Id && v.StockQuantity >= qty)
                .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - qty));
        else
            baixado = await _db.Products
                .Where(p => p.Id == product.Id && p.StockQuantity >= qty)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity - qty));

        if (baixado > 0)
        {
            // ExpiresAt marca "ainda não paga" (some quando o Pix confirma, em
            // PixReconciliationService.BaixarReservaAsync) — não expira mais sozinha.
            // Quem devolve o estoque de uma pré-venda não retirada é o admin, cancelando
            // manualmente pela tela de reservas.
            return (new ProductReservation
            {
                ReservationGroupId = groupId,
                UserId = userId, ProductId = productId, VariantId = variant?.Id,
                Quantity = qty, Notes = notes,
                Kind = "pre_venda", Status = "active", ExpiresAt = DateTime.UtcNow,
                PaymentMethod = paymentMethod,
            }, null, null);
        }

        // ── Sem estoque: vira FILA só se quem chamou permite E o produto aceita ──
        if (!permitirFila || !product.IsPreVenda)
            return (null, "bad_request", $"\"{product.Name}\" está sem estoque no momento.");

        var jaNaFila = await _db.ProductReservations.AnyAsync(r =>
            r.UserId == userId && r.ProductId == productId && r.VariantId == variantId
            && r.Kind == "fila" && r.Status == "waiting");
        if (jaNaFila)
            return (null, "conflict", $"Você já está na fila de \"{product.Name}\".");

        return (new ProductReservation
        {
            ReservationGroupId = groupId,
            UserId = userId, ProductId = productId, VariantId = variant?.Id,
            Quantity = qty, Notes = notes,
            Kind = "fila", Status = "waiting", ExpiresAt = null,
        }, null, null);
    }

    /// <summary>Devolve o estoque de uma pré-venda (cancelamento/expiração).</summary>
    private async Task DevolverEstoqueAsync(ProductReservation r)
    {
        if (r.VariantId.HasValue)
            await _db.ProductVariants
                .Where(v => v.Id == r.VariantId.Value)
                .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + r.Quantity));
        else
            await _db.Products
                .Where(p => p.Id == r.ProductId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + r.Quantity));
    }

    // DELETE /api/reservations/{id} — cancela pré-venda (estoque volta) ou sai da fila.
    // Transação + claim atômico de status: sem isso, duas chamadas concorrentes (ex: cliente
    // clica cancelar duas vezes, ou cliente cancela no mesmo instante que o admin homologa)
    // podiam ambas devolver o estoque, duplicando-o (era o bug A2 da auditoria).
    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var userId = GetUserId();
        var res = await _db.ProductReservations.FirstOrDefaultAsync(r => r.Id == id);

        if (res is null) return NotFound();
        if (res.UserId != userId && !User.IsInRole("Admin")) return Forbid();
        if (res.Status is not ("active" or "waiting"))
            return BadRequest(new { Message = "Esta reserva já foi encerrada." });

        // M4: pré-venda já paga (ExpiresAt nulo = Pix confirmado) só pode ser cancelada
        // pelo admin — o pagamento não é estornado automaticamente, precisa de acompanhamento.
        var jaPaga = res.Status == "active" && res.Kind == "pre_venda" && res.ExpiresAt is null;
        if (jaPaga && !User.IsInRole("Admin"))
            return BadRequest(new { Message = "Esta pré-venda já foi paga — fale com a loja pra cancelar e combinar o estorno." });

        var statusOriginal  = res.Status;
        var devolveuEstoque = false;

        var strategy = _db.Database.CreateExecutionStrategy();
        IActionResult? falha = null;
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            var claimed = await _db.ProductReservations
                .Where(r => r.Id == id && r.Status == statusOriginal)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.Status, "cancelled")
                    .SetProperty(r => r.CancelledAt, DateTime.UtcNow));
            if (claimed == 0)
            {
                falha = BadRequest(new { Message = "Esta reserva já foi encerrada." });
                return;
            }

            if (statusOriginal == "active" && res.Kind == "pre_venda")
            {
                await DevolverEstoqueAsync(res);
                devolveuEstoque = true;
            }

            await tx.CommitAsync();
        });

        if (falha is not null) return falha;

        if (jaPaga)
            await _audit.LogAsync("CancelouPreVendaPaga", "ProductReservation", res.Id.ToString(),
                details: $"{{\"produtoId\":\"{res.ProductId}\",\"valorPago\":true,\"observacao\":\"estorno manual pendente\"}}",
                httpContext: HttpContext);

        // Sobrou estoque? Puxa o próximo da fila.
        if (devolveuEstoque)
        {
            await ProcessarFilaSeguroAsync(res.ProductId);
            await AvisarEstoqueMudouAsync();
        }

        return Ok(new { jaPaga });
    }

    private async Task ProcessarFilaSeguroAsync(Guid productId)
    {
        try
        {
            var svc = HttpContext.RequestServices.GetRequiredService<IProductService>();
            await svc.ProcessarChegadaFilaAsync(productId);
        }
        catch { /* melhor-esforço — o próximo reestoque/job cobre */ }
    }

    // GET /api/reservations — lista todas [AdminOnly]
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status    = null,
        [FromQuery] string? kind      = null,
        [FromQuery] Guid?   userId    = null,
        [FromQuery] Guid?   productId = null,
        [FromQuery] int     page      = 1,
        [FromQuery] int     pageSize  = 30)
    {
        var q = _db.ProductReservations
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

        // Posição na fila (só kind=fila/waiting): quantos entraram antes no mesmo produto.
        var posicoes = new Dictionary<Guid, int>();
        foreach (var r in items.Where(r => r.Kind == "fila" && r.Status == "waiting"))
            posicoes[r.Id] = 1 + await _db.ProductReservations
                .CountAsync(w => w.ProductId == r.ProductId && w.Kind == "fila"
                              && w.Status == "waiting" && w.ReservedAt < r.ReservedAt);

        return Ok(new
        {
            items = items.Select(r => ToDto(r, posicoes.TryGetValue(r.Id, out var pos) ? pos : null)),
            total,
            totalPages = (int)Math.Ceiling(total / (double)pageSize),
        });
    }

    // PUT /api/reservations/{id}/status — admin atualiza status
    // fulfilled = retirado (estoque JÁ foi baixado na pré-venda — não baixa de novo)
    // cancelled = devolve o estoque se era pré-venda vigente
    // Transação + claim atômico (mesmo motivo do Cancel — ver comentário lá).
    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateReservationStatusRequest req)
    {
        if (req.Status is not ("fulfilled" or "cancelled"))
            return BadRequest(new { Message = "Status inválido. Use 'fulfilled' ou 'cancelled'." });

        var res = await _db.ProductReservations
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (res is null) return NotFound();
        if (res.Status is not ("active" or "waiting"))
            return BadRequest(new { Message = "Esta reserva já foi encerrada." });
        if (req.Status == "fulfilled" && res.Status != "active")
            return BadRequest(new { Message = "Só pré-vendas ativas podem ser marcadas como retiradas." });

        var jaPaga = req.Status == "cancelled" && res.Status == "active" && res.Kind == "pre_venda" && res.ExpiresAt is null;
        var statusOriginal  = res.Status;
        var devolveuEstoque = false;

        var strategy = _db.Database.CreateExecutionStrategy();
        IActionResult? falha = null;
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            int claimed;
            if (req.Status == "fulfilled")
            {
                claimed = await _db.ProductReservations
                    .Where(r => r.Id == id && r.Status == "active")
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(r => r.Status, "fulfilled")
                        .SetProperty(r => r.FulfilledAt, DateTime.UtcNow));
            }
            else
            {
                claimed = await _db.ProductReservations
                    .Where(r => r.Id == id && r.Status == statusOriginal)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(r => r.Status, "cancelled")
                        .SetProperty(r => r.CancelledAt, DateTime.UtcNow));
            }
            if (claimed == 0)
            {
                falha = BadRequest(new { Message = "Esta reserva já foi encerrada." });
                return;
            }

            if (req.Status == "cancelled" && statusOriginal == "active" && res.Kind == "pre_venda")
            {
                await DevolverEstoqueAsync(res);
                devolveuEstoque = true;
            }

            await tx.CommitAsync();
        });

        if (falha is not null) return falha;

        res.Status = req.Status;
        if (req.Status == "fulfilled") res.FulfilledAt = DateTime.UtcNow;
        else res.CancelledAt = DateTime.UtcNow;

        if (jaPaga)
            await _audit.LogAsync("CancelouPreVendaPaga", "ProductReservation", res.Id.ToString(),
                details: $"{{\"produtoId\":\"{res.ProductId}\",\"valorPago\":true,\"observacao\":\"estorno manual pendente\"}}",
                httpContext: HttpContext);

        if (devolveuEstoque)
        {
            await ProcessarFilaSeguroAsync(res.ProductId);
            await AvisarEstoqueMudouAsync();
        }

        return Ok(ToDto(res));
    }

    // PUT /api/reservations/{id}/quantity — admin corrige a quantidade de uma reserva em
    // aberto (ex: lançou 1 unidade errado e precisa ajustar). Pré-venda: a diferença mexe
    // no estoque (atômico, mesmo padrão do Cancel/UpdateStatus); fila: só troca o número.
    [HttpPut("{id:guid}/quantity")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateQuantity(Guid id, [FromBody] UpdateReservationQuantityRequest req)
    {
        if (req.Quantity < 1) return BadRequest(new { Message = "Quantidade precisa ser pelo menos 1." });

        var res = await _db.ProductReservations.FirstOrDefaultAsync(r => r.Id == id);
        if (res is null) return NotFound();
        if (res.Status is not ("active" or "waiting"))
            return BadRequest(new { Message = "Só é possível alterar a quantidade de reservas em aberto." });

        var quantidadeAntiga = res.Quantity;
        var delta = req.Quantity - quantidadeAntiga;
        if (delta == 0)
        {
            await _db.Entry(res).Reference(x => x.Product).LoadAsync();
            await _db.Entry(res).Reference(x => x.Variant).LoadAsync();
            await _db.Entry(res).Reference(x => x.User).LoadAsync();
            return Ok(ToDto(res));
        }

        // Pix já gerado trava o valor cobrado — mudar a quantidade agora deixaria a
        // cobrança desalinhada do novo total. Pede pra cancelar o Pix antes.
        if (res.Kind == "pre_venda")
        {
            var temPixAtivo = await _db.PixCobrancas.AnyAsync(p =>
                p.ReservationGroupId == res.ReservationGroupId && p.Status == "ATIVA");
            if (temPixAtivo)
                return Conflict(new { Message = "Esta reserva já tem um Pix ativo — cancele o Pix antes de mudar a quantidade." });
        }

        var strategy = _db.Database.CreateExecutionStrategy();
        IActionResult? falha = null;
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            var claimed = await _db.ProductReservations
                .Where(r => r.Id == id && r.Status == res.Status && r.Quantity == quantidadeAntiga)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Quantity, req.Quantity));
            if (claimed == 0)
            {
                falha = BadRequest(new { Message = "Esta reserva foi alterada por outra ação — recarregue e tente de novo." });
                return;
            }

            if (res.Kind == "pre_venda")
            {
                if (delta > 0)
                {
                    int baixado;
                    if (res.VariantId.HasValue)
                        baixado = await _db.ProductVariants
                            .Where(v => v.Id == res.VariantId.Value && v.StockQuantity >= delta)
                            .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - delta));
                    else
                        baixado = await _db.Products
                            .Where(p => p.Id == res.ProductId && p.StockQuantity >= delta)
                            .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity - delta));

                    if (baixado == 0)
                    {
                        falha = Conflict(new { Message = "Estoque insuficiente pra aumentar a quantidade." });
                        return; // rollback desfaz o claim de quantidade também
                    }
                }
                else
                {
                    var devolver = -delta;
                    if (res.VariantId.HasValue)
                        await _db.ProductVariants.Where(v => v.Id == res.VariantId.Value)
                            .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + devolver));
                    else
                        await _db.Products.Where(p => p.Id == res.ProductId)
                            .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + devolver));
                }
            }

            await tx.CommitAsync();
        });

        if (falha is not null) return falha;

        res.Quantity = req.Quantity;
        if (res.Kind == "pre_venda") await AvisarEstoqueMudouAsync();

        await _audit.LogAsync("AlterouQuantidadeReserva", "ProductReservation", res.Id.ToString(),
            details: $"{{\"de\":{quantidadeAntiga},\"para\":{req.Quantity}}}", httpContext: HttpContext);

        await _db.Entry(res).Reference(x => x.Product).LoadAsync();
        await _db.Entry(res).Reference(x => x.Variant).LoadAsync();
        await _db.Entry(res).Reference(x => x.User).LoadAsync();

        return Ok(ToDto(res));
    }

    // POST /api/reservations/{id}/homologar — admin homologa pré-venda → lança no PDV.
    // Sempre PDV: homologar por comanda misturava o valor com outros itens do cliente e
    // ficava impossível separar "Pré-venda" de "Comanda" no Financeiro com segurança.
    // SkipStockDecrement: o estoque JÁ saiu no ato da pré-venda; aqui só se registra a venda.
    [HttpPost("{id:guid}/homologar")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Homologar(Guid id, [FromBody] HomologarRequest req)
    {
        var res = await _db.ProductReservations
            .Include(r => r.User)
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (res is null) return NotFound();
        if (res.Status != "active" || res.Kind != "pre_venda")
            return BadRequest(new { Message = "Só pré-vendas ativas podem ser homologadas." });

        var adminId   = GetUserId();
        var adminName = User.FindFirst(ClaimTypes.Name)?.Value
                     ?? User.FindFirst("name")?.Value
                     ?? "Admin";

        // Claim atômico + registro da venda/comanda na MESMA transação (mesmo motivo do
        // Cancel/UpdateStatus — era o M9 da auditoria: duas homologações concorrentes, ou
        // uma homologação correndo com um cancelamento, podiam lançar a venda duas vezes
        // ou lançar em cima de uma pré-venda já cancelada).
        var strategy = _db.Database.CreateExecutionStrategy();
        IActionResult? falha = null;
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            var claimed = await _db.ProductReservations
                .Where(r => r.Id == id && r.Status == "active" && r.Kind == "pre_venda")
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.Status, "fulfilled")
                    .SetProperty(r => r.FulfilledAt, DateTime.UtcNow));
            if (claimed == 0)
            {
                falha = BadRequest(new { Message = "Esta pré-venda já foi processada." });
                return;
            }

            try
            {
                var vendaReq = new VendaAvulsaRequest
                {
                    ClientName                 = res.User?.Name,
                    UserId                     = res.UserId,
                    PaymentMethod              = req.PaymentMethod ?? "Dinheiro",
                    SecondPaymentMethod        = req.SecondPaymentMethod,
                    SecondPaymentAmountInCents = req.SecondPaymentAmountInCents ?? 0,
                    SkipStockDecrement         = true, // estoque já baixado na pré-venda
                    // Marca a origem pra o Financeiro separar "Pré-venda" de venda de balcão comum.
                    Origem                     = "Reserva",
                    ReservationId              = res.Id,
                    Items                      = [new VendaAvulsaItemRequest { ProductId = res.ProductId, VariantId = res.VariantId, Quantity = res.Quantity }],
                };
                await _vendaService.RegisterAsync(vendaReq, adminId, adminName);
            }
            catch (InvalidOperationException ex)
            {
                falha = BadRequest(new { Message = ex.Message });
                return; // sem Commit: rollback desfaz o claim de status também
            }

            await tx.CommitAsync();
        });

        if (falha is not null) return falha;

        return Ok(new { message = "Pré-venda homologada com sucesso.", reservationId = id });
    }

    // -------------------------------------------------------------------------
    // PAGAMENTO — Pix do carrinho de pré-venda (mesmo padrão da inscrição de
    // campeonato: gerar cobrança + verificar sob demanda, sem webhook).
    // Pago = ExpiresAt vira null (só marcava "ainda não paga") — venda feita.
    // -------------------------------------------------------------------------

    /// <summary>Gera cobrança Pix do total das PRÉ-VENDAS do grupo (itens de fila não cobram).</summary>
    [HttpPost("group/{groupId:guid}/pix")]
    [Authorize]
    public async Task<IActionResult> GerarPixReserva(Guid groupId)
    {
        var userId = GetUserId();

        var items = await _db.ProductReservations
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .Include(r => r.User)
            .Where(r => r.ReservationGroupId == groupId)
            .ToListAsync();

        if (items.Count == 0) return NotFound(new { Message = "Reserva não encontrada." });
        // Dono gera o próprio Pix; admin gera pra enviar o código pelo WhatsApp/balcão.
        if (items[0].UserId != userId && !User.IsInRole("Admin")) return Forbid();

        var preVendas = items.Where(r => r.Kind == "pre_venda" && r.Status == "active").ToList();
        if (preVendas.Count == 0)
            return BadRequest(new { Message = "Itens de fila não cobram — o Pix é gerado quando o produto chegar." });
        if (items.Any(r => r.Kind == "pre_venda" && r.Status != "active"))
            return BadRequest(new { Message = "Só é possível gerar Pix para pré-vendas ativas." });

        // Reaproveita cobrança ATIVA já existente pra este grupo em vez de gerar uma nova
        // toda vez que o cliente reabre a tela do Pix (evita cobranças órfãs no Inter).
        var pixAtivo = await _db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (pixAtivo is not null)
            return Ok(new { pixAtivo.TxId, pixAtivo.Status, pixAtivo.PixCopiaCola, pixAtivo.ImagemQrCode, pixAtivo.ExpiraEm, pixAtivo.ValorEmReais });

        var valorEmCentavos = preVendas.Sum(r =>
        {
            var precoUnit = r.Variant?.PriceInCents
                ?? (r.Product.IsOnPromo ? r.Product.DiscountPriceInCents!.Value : r.Product.PriceInCents);
            return precoUnit * r.Quantity;
        });

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null)
            return BadRequest(new { Message = "Pagamento Pix indisponível no momento — pague na retirada." });

        var user = items[0].User;
        var cpf  = user?.Cpf?.Length == 11 ? user.Cpf : null;
        var result = await _inter.CriarCobrancaAsync(
            cfg, valorEmCentavos, user?.Name, cpf, $"Pré-venda — {preVendas.Count} item(ns)");

        if (result.Error is not null)
            return StatusCode(422, new { message = result.Error });

        var pix = new PixCobranca
        {
            Origem                 = PixCobrancaOrigem.Reserva,
            ReservationGroupId     = groupId,
            // Trava exatamente quais itens essa cobrança cobre — se o carrinho mudar depois
            // (item cancelado, novo item adicionado ao grupo), a confirmação só baixa estes.
            ReservationItemIdsJson = JsonSerializer.Serialize(preVendas.Select(r => r.Id)),
            TxId                   = result.TxId!,
            ValorEmCentavos        = valorEmCentavos,
            Status                 = result.Status ?? "ATIVA",
            PixCopiaCola           = result.PixCopiaCola,
            ImagemQrCode           = result.ImagemQrCode,
            NomeDevedor            = user?.Name,
            CriadoPorAdminId       = userId, // gerada pelo próprio cliente
            ExpiraEm               = result.ExpiraEm,
        };
        _db.PixCobrancas.Add(pix);
        await _db.SaveChangesAsync();

        return Ok(new { pix.TxId, pix.Status, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais });
    }

    /// <summary>Verifica no Inter se o Pix caiu; se sim, marca pago e as pré-vendas do
    /// grupo deixam de expirar (venda feita, aguardando retirada).</summary>
    [HttpPost("group/{groupId:guid}/pix/verificar")]
    [Authorize]
    public async Task<IActionResult> VerificarPixReserva(Guid groupId)
    {
        var userId = GetUserId();

        var pertenceAoUsuario = await _db.ProductReservations
            .AnyAsync(r => r.ReservationGroupId == groupId && (r.UserId == userId || User.IsInRole("Admin")));
        if (!pertenceAoUsuario) return NotFound(new { Message = "Reserva não encontrada." });

        var pix = await _db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva && p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (pix is null) return NotFound(new { Message = "Nenhuma cobrança Pix ativa para esta reserva." });

        // A baixa mora no PixReconciliationService — mesmo caminho do robô e da
        // verificação final da expiração (pago = ExpiresAt zerado, não expira mais).
        var result = await _pixReconciliation.ReconciliarAsync(pix);
        if (result.Error is not null) return StatusCode(422, new { message = result.Error });

        return Ok(new { status = pix.Status, pagoEm = pix.PagoEm });
    }

    // GET /api/reservations/group/{groupId}/pix — status atual do pagamento
    [HttpGet("group/{groupId:guid}/pix")]
    [Authorize]
    public async Task<IActionResult> GetPixReserva(Guid groupId)
    {
        var userId = GetUserId();
        var pertenceAoUsuario = await _db.ProductReservations
            .AnyAsync(r => r.ReservationGroupId == groupId && (r.UserId == userId || User.IsInRole("Admin")));
        if (!pertenceAoUsuario) return NotFound();

        var pix = await _db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva)
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();

        if (pix is null) return Ok(new { hasPix = false });

        if (pix.Status == "ATIVA")
        {
            // Falha na consulta ao Inter não derruba o GET — devolve o último status conhecido.
            await _pixReconciliation.ReconciliarAsync(pix);
        }

        return Ok(new { hasPix = true, pix.Status, pix.PagoEm, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais });
    }

    private static object ToDto(ProductReservation r, int? posicaoFila = null)
    {
        // Preço unitário no momento da consulta — mesma regra do GerarPixReserva
        // (variante tem prioridade; senão preço promocional se ativo).
        int? precoUnitario = r.Product is null ? null
            : r.Variant?.PriceInCents
              ?? (r.Product.IsOnPromo ? r.Product.DiscountPriceInCents!.Value : r.Product.PriceInCents);

        return new
        {
            r.Id,
            r.ReservationGroupId,
            r.UserId,
            userName       = r.User?.Name,
            userWhatsApp   = r.User?.WhatsApp,
            r.ProductId,
            productName    = r.Product?.Name,
            productImageUrl= r.Product?.ImageUrl,
            // Kanban admin: "Vendas" (tag desligada) × "Pré-vendas" (produto marcado como
            // pré-venda) — não é o mesmo conceito de Kind (que só distingue se baixou estoque
            // na hora ou entrou na fila legada).
            productIsPreVenda = r.Product?.IsPreVenda ?? false,
            r.VariantId,
            variantLabel   = r.Variant?.Label,
            r.Quantity,
            r.Kind,
            r.Status,
            r.Notes,
            r.PaymentMethod,
            r.ReservedAt,
            r.ExpiresAt,
            r.FulfilledAt,
            r.CancelledAt,
            posicaoFila,
            preVendaReleaseDate = r.Product?.PreVendaReleaseDate,
            precoUnitarioEmReais = precoUnitario.HasValue ? precoUnitario.Value / 100m : (decimal?)null,
            subtotalEmReais      = precoUnitario.HasValue ? precoUnitario.Value * r.Quantity / 100m : (decimal?)null,
        };
    }
}

public class CreateReservationRequest
{
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
    public string? Notes   { get; init; }

    /// <summary>Intenção de pagamento declarada pelo cliente: "pix" ou "retirada".</summary>
    public string? PaymentMethod { get; init; }
}

public class CreateReservationCartItem
{
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
}

public class CreateReservationCartRequest
{
    public List<CreateReservationCartItem> Items { get; init; } = [];

    /// <summary>
    /// false (padrão): item que ficou sem estoque NÃO vira fila sozinho — o carrinho
    /// inteiro é recusado com 409 e o cliente escolhe (entrar na fila ou remover).
    /// true: conversão explícita pra fila (o cliente já consentiu na tela).
    /// </summary>
    public bool AllowFilaFallback { get; init; } = false;

    /// <summary>Intenção de pagamento declarada pelo cliente para o carrinho inteiro: "pix" ou "retirada".</summary>
    public string? PaymentMethod { get; init; }
}

public class AdminCreateReservationRequest
{
    public Guid  UserId    { get; init; }
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
    public string? Notes   { get; init; }
}

public class UpdateReservationStatusRequest
{
    public string Status { get; init; } = "";
}

public class UpdateReservationQuantityRequest
{
    public int Quantity { get; init; }
}

public class HomologarRequest
{
    /// <summary>Forma de pagamento. Padrão: Dinheiro.</summary>
    public string? PaymentMethod { get; init; }

    /// <summary>Segundo método de pagamento, quando o cliente divide o pagamento.</summary>
    public string? SecondPaymentMethod { get; init; }

    /// <summary>Valor em centavos cobrado no segundo método.</summary>
    public int? SecondPaymentAmountInCents { get; init; }
}
