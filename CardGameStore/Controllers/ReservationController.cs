using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace CardGameStore.Controllers;

// =============================================================================
// ReservationController.cs — Pré-venda e Fila (modelo unificado da loja)
//
// PRÉ-VENDA (kind=pre_venda): item EM ESTOQUE. Baixa o estoque no ato, Pix em
// tudo, data de rua opcional. Não paga expira (48h ou data de rua + 48h) e o
// estoque volta. Paga não expira — é venda feita aguardando retirada.
//
// FILA (kind=fila): item que AINDA NÃO CHEGOU. Não mexe em estoque, não expira.
// Quando o estoque chega, ProductService.ProcessarChegadaFilaAsync converte a
// fila em pré-venda na ordem de entrada.
// =============================================================================

[ApiController]
[Route("api/reservations")]
[Produces("application/json")]
public class ReservationController : ControllerBase
{
    private readonly AppDbContext        _db;
    private readonly IVendaAvulsaService _vendaService;
    private readonly IComandaService     _comandaService;
    private readonly InterSyncService    _inter;
    private readonly IPixReconciliationService _pixReconciliation;
    private readonly IPushService        _push;

    public ReservationController(
        AppDbContext db, IVendaAvulsaService vendaService, IComandaService comandaService,
        InterSyncService inter, IPixReconciliationService pixReconciliation, IPushService push)
    {
        _db                = db;
        _vendaService      = vendaService;
        _comandaService    = comandaService;
        _inter             = inter;
        _pixReconciliation = pixReconciliation;
        _push              = push;
    }

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

    // POST /api/reservations — cria pré-venda (em estoque) ou entra na fila (não chegou)
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateReservationRequest req)
    {
        var userId  = GetUserId();
        var created = await CriarItemAsync(userId, Guid.NewGuid(), req.ProductId, req.VariantId,
                                           req.Quantity < 1 ? 1 : req.Quantity, req.Notes);
        if (created.Error is not null) return created.Error switch
        {
            "not_found" => NotFound(new { created.Message }),
            "conflict"  => Conflict(new { created.Message }),
            _           => BadRequest(new { created.Message }),
        };

        var r = created.Reservation!;
        r.ReservationGroupId = r.Id; // avulsa = grupo de 1 item só
        _db.ProductReservations.Add(r);
        await _db.SaveChangesAsync();

        await _db.Entry(r).Reference(x => x.Product).LoadAsync();
        await _db.Entry(r).Reference(x => x.Variant).LoadAsync();
        return Ok(ToDto(r));
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

        var userId   = GetUserId();
        var groupId  = Guid.NewGuid();
        var toCreate = new List<ProductReservation>();
        var virouFila = new List<Guid>();

        await using var tx = await _db.Database.BeginTransactionAsync();

        foreach (var item in req.Items)
        {
            var created = await CriarItemAsync(userId, groupId, item.ProductId, item.VariantId,
                                               item.Quantity < 1 ? 1 : item.Quantity, null);
            if (created.Error is not null)
                return BadRequest(new { created.Message });

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

            return Conflict(new
            {
                Message = "Alguns itens ficaram sem estoque enquanto você montava a reserva. Escolha entrar na fila de espera ou removê-los.",
                SemEstoque = semEstoque,
            });
        }

        _db.ProductReservations.AddRange(toCreate);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        foreach (var r in toCreate)
        {
            await _db.Entry(r).Reference(x => x.Product).LoadAsync();
            await _db.Entry(r).Reference(x => x.Variant).LoadAsync();
        }

        return Ok(new { groupId, items = toCreate.Select(r => ToDto(r)) });
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

        var created = await CriarItemAsync(req.UserId, Guid.NewGuid(), req.ProductId, req.VariantId,
                                           req.Quantity < 1 ? 1 : req.Quantity, req.Notes);
        if (created.Error is not null) return created.Error switch
        {
            "not_found" => NotFound(new { created.Message }),
            "conflict"  => Conflict(new { created.Message }),
            _           => BadRequest(new { created.Message }),
        };

        var r = created.Reservation!;
        r.ReservationGroupId = r.Id; // avulsa = grupo de 1 item só
        _db.ProductReservations.Add(r);
        await _db.SaveChangesAsync();

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
        Guid userId, Guid groupId, Guid productId, Guid? variantId, int qty, string? notes)
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
            // Não pago expira: 48h, ou data de rua + 48h quando ela está no futuro.
            var release = product.PreVendaReleaseDate;
            var expira = release.HasValue && release.Value.Date > DateTime.UtcNow.Date
                ? release.Value.Date.AddDays(2)
                : DateTime.UtcNow.AddHours(48);

            return (new ProductReservation
            {
                ReservationGroupId = groupId,
                UserId = userId, ProductId = productId, VariantId = variant?.Id,
                Quantity = qty, Notes = notes,
                Kind = "pre_venda", Status = "active", ExpiresAt = expira,
            }, null, null);
        }

        // ── Sem estoque: vira FILA se o produto aceita (flag "ainda não chegou") ──
        if (!product.IsPreVenda)
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

    // DELETE /api/reservations/{id} — cancela pré-venda (estoque volta) ou sai da fila
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

        var devolveuEstoque = res.Status == "active" && res.Kind == "pre_venda";
        if (devolveuEstoque)
            await DevolverEstoqueAsync(res);

        res.Status      = "cancelled";
        res.CancelledAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Sobrou estoque? Puxa o próximo da fila.
        if (devolveuEstoque)
            await ProcessarFilaSeguroAsync(res.ProductId);

        return NoContent();
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
    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateReservationStatusRequest req)
    {
        var res = await _db.ProductReservations
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (res is null) return NotFound();
        if (res.Status is not ("active" or "waiting"))
            return BadRequest(new { Message = "Esta reserva já foi encerrada." });

        if (req.Status == "fulfilled")
        {
            if (res.Status != "active")
                return BadRequest(new { Message = "Só pré-vendas ativas podem ser marcadas como retiradas." });
            res.Status      = "fulfilled";
            res.FulfilledAt = DateTime.UtcNow;
        }
        else if (req.Status == "cancelled")
        {
            if (res.Status == "active" && res.Kind == "pre_venda")
                await DevolverEstoqueAsync(res);
            res.Status      = "cancelled";
            res.CancelledAt = DateTime.UtcNow;
        }
        else
        {
            return BadRequest(new { Message = "Status inválido. Use 'fulfilled' ou 'cancelled'." });
        }

        await _db.SaveChangesAsync();

        if (req.Status == "cancelled" && res.Kind == "pre_venda")
            await ProcessarFilaSeguroAsync(res.ProductId);

        return Ok(ToDto(res));
    }

    // POST /api/reservations/{id}/homologar — admin homologa pré-venda → lança no PDV ou
    // comanda. SkipStockDecrement: o estoque JÁ saiu no ato da pré-venda; aqui só se
    // registra a venda (e a NFC-e, se for o caso).
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

        if (req.Mode == "pdv")
        {
            var vendaReq = new VendaAvulsaRequest
            {
                ClientName         = res.User?.Name,
                UserId             = res.UserId,
                PaymentMethod      = req.PaymentMethod ?? "Dinheiro",
                SkipStockDecrement = true, // estoque já baixado na pré-venda
                Items              = [new VendaAvulsaItemRequest { ProductId = res.ProductId, VariantId = res.VariantId, Quantity = res.Quantity }],
            };
            try { await _vendaService.RegisterAsync(vendaReq, adminId, adminName); }
            catch (InvalidOperationException ex) { return BadRequest(new { Message = ex.Message }); }
        }
        else if (req.Mode == "comanda")
        {
            if (!req.ComandaId.HasValue)
                return BadRequest(new { Message = "ComandaId é obrigatório no modo comanda." });

            try
            {
                await _comandaService.AdminAddItemAsync(req.ComandaId.Value, adminId,
                    new AddItemToComandaRequest
                    {
                        ProductId          = res.ProductId,
                        VariantId          = res.VariantId,
                        Quantity           = res.Quantity,
                        SkipStockDecrement = true, // estoque já baixado na pré-venda
                    });
            }
            catch (InvalidOperationException ex) { return BadRequest(new { Message = ex.Message }); }
        }
        else
        {
            return BadRequest(new { Message = "Mode inválido. Use 'pdv' ou 'comanda'." });
        }

        res.Status      = "fulfilled";
        res.FulfilledAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Pré-venda homologada com sucesso.", reservationId = id, mode = req.Mode });
    }

    // PUT /api/reservations/{id}/extend — admin estende prazo +48h (só pré-venda não paga)
    [HttpPut("{id:guid}/extend")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Extend(Guid id)
    {
        var res = await _db.ProductReservations.FindAsync(id);
        if (res is null) return NotFound();
        if (res.Status != "active") return BadRequest(new { Message = "Só pré-vendas ativas têm prazo a estender." });

        res.ExpiresAt = (res.ExpiresAt ?? DateTime.UtcNow).AddHours(48);
        await _db.SaveChangesAsync();
        return Ok(ToDto(res));
    }

    // -------------------------------------------------------------------------
    // PAGAMENTO — Pix do carrinho de pré-venda (mesmo padrão da inscrição de
    // campeonato: gerar cobrança + verificar sob demanda, sem webhook).
    // Pago = pré-venda não expira mais (ExpiresAt vira null — venda feita).
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

        var preVendas = items.Where(r => r.Kind == "pre_venda").ToList();
        if (preVendas.Count == 0)
            return BadRequest(new { Message = "Itens de fila não cobram — o Pix é gerado quando o produto chegar." });
        if (preVendas.Any(r => r.Status != "active"))
            return BadRequest(new { Message = "Só é possível gerar Pix para pré-vendas ativas." });

        var valorEmCentavos = preVendas.Sum(r => (r.Variant?.PriceInCents ?? r.Product.PriceInCents) * r.Quantity);

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
            Origem             = PixCobrancaOrigem.Reserva,
            ReservationGroupId = groupId,
            TxId               = result.TxId!,
            ValorEmCentavos    = valorEmCentavos,
            Status             = result.Status ?? "ATIVA",
            PixCopiaCola       = result.PixCopiaCola,
            ImagemQrCode       = result.ImagemQrCode,
            NomeDevedor        = user?.Name,
            CriadoPorAdminId   = userId, // gerada pelo próprio cliente
            ExpiraEm           = result.ExpiraEm,
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

    private static object ToDto(ProductReservation r, int? posicaoFila = null) => new
    {
        r.Id,
        r.ReservationGroupId,
        r.UserId,
        userName       = r.User?.Name,
        userWhatsApp   = r.User?.WhatsApp,
        r.ProductId,
        productName    = r.Product?.Name,
        productImageUrl= r.Product?.ImageUrl,
        r.VariantId,
        variantLabel   = r.Variant?.Label,
        r.Quantity,
        r.Kind,
        r.Status,
        r.Notes,
        r.ReservedAt,
        r.ExpiresAt,
        r.FulfilledAt,
        r.CancelledAt,
        isExpired      = r.IsExpired,
        posicaoFila,
        preVendaReleaseDate = r.Product?.PreVendaReleaseDate,
    };
}

public class CreateReservationRequest
{
    public Guid  ProductId { get; init; }
    public Guid? VariantId { get; init; }
    public int   Quantity  { get; init; } = 1;
    public string? Notes   { get; init; }
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

public class HomologarRequest
{
    /// <summary>"pdv" | "comanda"</summary>
    public string Mode { get; init; } = "pdv";

    /// <summary>Forma de pagamento para o modo PDV. Padrão: Dinheiro.</summary>
    public string? PaymentMethod { get; init; }

    /// <summary>ID da comanda aberta (obrigatório no modo comanda).</summary>
    public Guid? ComandaId { get; init; }
}
