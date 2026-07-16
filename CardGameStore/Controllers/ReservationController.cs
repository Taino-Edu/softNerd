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

[ApiController]
[Route("api/reservations")]
[Produces("application/json")]
public class ReservationController : ControllerBase
{
    private readonly AppDbContext        _db;
    private readonly IVendaAvulsaService _vendaService;
    private readonly IComandaService     _comandaService;
    private readonly InterSyncService    _inter;

    public ReservationController(
        AppDbContext db, IVendaAvulsaService vendaService, IComandaService comandaService, InterSyncService inter)
    {
        _db             = db;
        _vendaService   = vendaService;
        _comandaService = comandaService;
        _inter          = inter;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id)) throw new UnauthorizedAccessException();
        return id;
    }

    // GET /api/reservations/mine — reservas do usuário logado
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

        return Ok(list.Select(r => ToDto(r)));
    }

    // POST /api/reservations — cria reserva (somente via site)
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateReservationRequest req)
    {
        var userId = GetUserId();

        var product = await _db.Products
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == req.ProductId && p.IsActive);

        if (product is null) return NotFound(new { Message = "Produto não encontrado." });

        var qty = req.Quantity < 1 ? 1 : req.Quantity;

        // Calcula estoque disponível descontando reservas ativas
        int stockBase;
        if (req.VariantId.HasValue)
        {
            var variant = product.Variants.FirstOrDefault(v => v.Id == req.VariantId.Value);
            if (variant is null) return BadRequest(new { Message = "Variante não encontrada." });
            stockBase = variant.StockQuantity;
        }
        else
        {
            stockBase = product.StockQuantity;
        }

        var activeReservedQty = await _db.ProductReservations
            .Where(r => r.ProductId == req.ProductId
                     && r.VariantId == req.VariantId
                     && r.Status == "active"
                     && r.ExpiresAt > DateTime.UtcNow)
            .SumAsync(r => r.Quantity);

        if (stockBase - activeReservedQty < qty)
            return BadRequest(new { Message = $"Estoque insuficiente. Disponível para reserva: {Math.Max(0, stockBase - activeReservedQty)}." });

        var reservation = new ProductReservation
        {
            UserId    = userId,
            ProductId = req.ProductId,
            VariantId = req.VariantId,
            Quantity  = qty,
            Notes     = req.Notes,
            ExpiresAt = DateTime.UtcNow.AddHours(48),
        };
        reservation.ReservationGroupId = reservation.Id; // reserva avulsa = grupo de 1 item só

        _db.ProductReservations.Add(reservation);
        await _db.SaveChangesAsync();

        await _db.Entry(reservation).Reference(r => r.Product).LoadAsync();
        await _db.Entry(reservation).Reference(r => r.Variant).LoadAsync();

        return Ok(ToDto(reservation));
    }

    // POST /api/reservations/cart — cria várias reservas de uma vez (carrinho), todas com o
    // mesmo ReservationGroupId. Tudo ou nada: se um item não tem estoque, nenhuma é criada.
    [HttpPost("cart")]
    [Authorize]
    public async Task<IActionResult> CreateCart([FromBody] CreateReservationCartRequest req)
    {
        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { Message = "Carrinho de reserva vazio." });

        var userId  = GetUserId();
        var groupId = Guid.NewGuid();
        var toCreate = new List<ProductReservation>();

        foreach (var item in req.Items)
        {
            var qty = item.Quantity < 1 ? 1 : item.Quantity;

            var product = await _db.Products
                .Include(p => p.Variants)
                .FirstOrDefaultAsync(p => p.Id == item.ProductId && p.IsActive);
            if (product is null)
                return BadRequest(new { Message = $"Produto {item.ProductId} não encontrado." });

            int stockBase;
            if (item.VariantId.HasValue)
            {
                var variant = product.Variants.FirstOrDefault(v => v.Id == item.VariantId.Value);
                if (variant is null)
                    return BadRequest(new { Message = $"Variante não encontrada para \"{product.Name}\"." });
                stockBase = variant.StockQuantity;
            }
            else
            {
                stockBase = product.StockQuantity;
            }

            var activeReservedQty = await _db.ProductReservations
                .Where(r => r.ProductId == item.ProductId
                         && r.VariantId == item.VariantId
                         && r.Status == "active"
                         && r.ExpiresAt > DateTime.UtcNow)
                .SumAsync(r => r.Quantity);

            if (stockBase - activeReservedQty < qty)
                return BadRequest(new {
                    Message = $"Estoque insuficiente para \"{product.Name}\". Disponível para reserva: {Math.Max(0, stockBase - activeReservedQty)}.",
                });

            toCreate.Add(new ProductReservation
            {
                ReservationGroupId = groupId,
                UserId    = userId,
                ProductId = item.ProductId,
                VariantId = item.VariantId,
                Quantity  = qty,
                ExpiresAt = DateTime.UtcNow.AddHours(48),
            });
        }

        // Só grava depois de validar TODOS os itens — nenhuma reserva parcial fica no banco
        // se um item qualquer do carrinho não tiver estoque suficiente.
        _db.ProductReservations.AddRange(toCreate);
        await _db.SaveChangesAsync();

        foreach (var r in toCreate)
        {
            await _db.Entry(r).Reference(x => x.Product).LoadAsync();
            await _db.Entry(r).Reference(x => x.Variant).LoadAsync();
        }

        return Ok(new { groupId, items = toCreate.Select(ToDto) });
    }

    // DELETE /api/reservations/{id} — cancela reserva própria
    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var userId = GetUserId();
        var res = await _db.ProductReservations.FirstOrDefaultAsync(r => r.Id == id);

        if (res is null) return NotFound();
        if (res.UserId != userId && !User.IsInRole("Admin")) return Forbid();
        if (res.Status != "active") return BadRequest(new { Message = "Reserva não está ativa." });

        res.Status      = "cancelled";
        res.CancelledAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // GET /api/reservations — lista todas [AdminOnly]
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status = null,
        [FromQuery] Guid?   userId = null,
        [FromQuery] int     page   = 1)
    {
        var q = _db.ProductReservations
            .Include(r => r.User)
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(r => r.Status == status);
        if (userId.HasValue)                    q = q.Where(r => r.UserId == userId.Value);

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(r => r.ReservedAt)
            .Skip((page - 1) * 30).Take(30)
            .ToListAsync();

        return Ok(new { items = items.Select(ToDto), total, totalPages = (int)Math.Ceiling(total / 30.0) });
    }

    // PUT /api/reservations/{id}/status — admin atualiza status
    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateReservationStatusRequest req)
    {
        var res = await _db.ProductReservations
            .Include(r => r.Product).ThenInclude(p => p.Variants)
            .Include(r => r.Variant)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (res is null) return NotFound();
        if (res.Status != "active") return BadRequest(new { Message = "Reserva não está ativa." });

        res.Status = req.Status;

        if (req.Status == "fulfilled")
        {
            res.FulfilledAt = DateTime.UtcNow;
            // Decrementa estoque ao confirmar
            if (res.VariantId.HasValue && res.Variant is not null)
            {
                res.Variant.StockQuantity = Math.Max(0, res.Variant.StockQuantity - res.Quantity);
                res.Variant.UpdatedAt     = DateTime.UtcNow;
            }
            else
            {
                res.Product.StockQuantity = Math.Max(0, res.Product.StockQuantity - res.Quantity);
                res.Product.UpdatedAt     = DateTime.UtcNow;
            }
        }
        else if (req.Status == "cancelled")
        {
            res.CancelledAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Ok(ToDto(res));
    }

    // GET /api/reservations/product/{productId} — quantidade reservada (público)
    [HttpGet("product/{productId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetProductReservedQty(Guid productId, [FromQuery] Guid? variantId = null)
    {
        var reserved = await _db.ProductReservations
            .Where(r => r.ProductId == productId
                     && r.VariantId == variantId
                     && r.Status == "active"
                     && r.ExpiresAt > DateTime.UtcNow)
            .SumAsync(r => r.Quantity);

        return Ok(new { productId, variantId, reservedQuantity = reserved });
    }

    // POST /api/reservations/{id}/homologar — admin homologa reserva → lança no PDV ou comanda
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
        if (res.Status != "active") return BadRequest(new { Message = "Reserva não está ativa." });

        var adminId   = GetUserId();
        var adminName = User.FindFirst(ClaimTypes.Name)?.Value
                     ?? User.FindFirst("name")?.Value
                     ?? "Admin";

        if (req.Mode == "pdv")
        {
            var vendaReq = new VendaAvulsaRequest
            {
                ClientName    = res.User?.Name,
                UserId        = res.UserId,
                PaymentMethod = req.PaymentMethod ?? "Dinheiro",
                Items         = [new VendaAvulsaItemRequest { ProductId = res.ProductId, Quantity = res.Quantity }],
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
                    new AddItemToComandaRequest { ProductId = res.ProductId, Quantity = res.Quantity });
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

        return Ok(new { message = "Reserva homologada com sucesso.", reservationId = id, mode = req.Mode });
    }

    // PUT /api/reservations/{id}/extend — admin estende prazo +48h
    [HttpPut("{id:guid}/extend")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Extend(Guid id)
    {
        var res = await _db.ProductReservations.FindAsync(id);
        if (res is null) return NotFound();
        if (res.Status != "active") return BadRequest(new { Message = "Reserva não está ativa." });

        res.ExpiresAt = res.ExpiresAt.AddHours(48);
        await _db.SaveChangesAsync();
        return Ok(ToDto(res));
    }

    // -------------------------------------------------------------------------
    // PAGAMENTO DO CARRINHO DE RESERVA — Pix opcional (mesmo padrão da inscrição
    // de campeonato: gerar cobrança + verificar sob demanda, sem webhook).
    // -------------------------------------------------------------------------

    /// <summary>Gera cobrança Pix do valor total do carrinho de reserva. Pagamento é opcional —
    /// a reserva já vale sem pagar, só é finalizada de verdade quando o produto chega.</summary>
    [HttpPost("group/{groupId:guid}/pix")]
    [Authorize]
    public async Task<IActionResult> GerarPixReserva(Guid groupId)
    {
        var userId = GetUserId();

        var items = await _db.ProductReservations
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .Include(r => r.User)
            .Where(r => r.ReservationGroupId == groupId && r.UserId == userId)
            .ToListAsync();

        if (items.Count == 0) return NotFound(new { Message = "Reserva não encontrada." });
        if (items.Any(r => r.Status != "active"))
            return BadRequest(new { Message = "Só é possível gerar Pix para reservas ativas." });

        var valorEmCentavos = items.Sum(r => (r.Variant?.PriceInCents ?? r.Product.PriceInCents) * r.Quantity);

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null)
            return BadRequest(new { Message = "Pagamento Pix indisponível no momento — pague na retirada." });

        var user = items[0].User;
        var cpf  = user?.Cpf?.Length == 11 ? user.Cpf : null;
        var result = await _inter.CriarCobrancaAsync(
            cfg, valorEmCentavos, user?.Name, cpf, $"Reserva — {items.Count} item(ns)");

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

    /// <summary>Verifica no Inter se o Pix do carrinho de reserva caiu; se sim, marca a cobrança como paga.</summary>
    [HttpPost("group/{groupId:guid}/pix/verificar")]
    [Authorize]
    public async Task<IActionResult> VerificarPixReserva(Guid groupId)
    {
        var userId = GetUserId();

        var pertenceAoUsuario = await _db.ProductReservations
            .AnyAsync(r => r.ReservationGroupId == groupId && r.UserId == userId);
        if (!pertenceAoUsuario) return NotFound(new { Message = "Reserva não encontrada." });

        var pix = await _db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva && p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (pix is null) return NotFound(new { Message = "Nenhuma cobrança Pix ativa para esta reserva." });

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null) return BadRequest(new { Message = "Integração com o Inter não configurada." });

        var result = await _inter.ConsultarCobrancaAsync(cfg, pix.TxId);
        if (result.Error is not null) return StatusCode(422, new { message = result.Error });

        pix.Status = result.Status ?? pix.Status;
        if (pix.Status == "CONCLUIDA" && pix.PagoEm is null)
        {
            pix.PagoEm = DateTime.UtcNow;
            
            var tx = new ExternalTransaction
            {
                Source = "inter",
                ExternalId = pix.TxId,
                Type = "income",
                Amount = pix.ValorEmCentavos / 100m,
                Description = $"Pix Reserva Grupo {groupId.ToString().Substring(0,8)}",
                DueDate = pix.ExpiraEm,
                PaidAt = pix.PagoEm,
                Status = "paid",
                Notes = $"Pagamento via Pix da Reserva {groupId}"
            };
            _db.ExternalTransactions.Add(tx);
        }

        await _db.SaveChangesAsync();
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
            var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
            if (cfg is not null)
            {
                var result = await _inter.ConsultarCobrancaAsync(cfg, pix.TxId);
                if (result.Error is null && result.Status != null)
                {
                    pix.Status = result.Status;
                    if (pix.Status == "CONCLUIDA" && pix.PagoEm is null)
                    {
                        pix.PagoEm = DateTime.UtcNow;
                        var tx = new ExternalTransaction
                        {
                            Source = "inter",
                            ExternalId = pix.TxId,
                            Type = "income",
                            Amount = pix.ValorEmCentavos / 100m,
                            Description = $"Pix Reserva Grupo {groupId.ToString().Substring(0,8)}",
                            DueDate = pix.ExpiraEm,
                            PaidAt = pix.PagoEm,
                            Status = "paid",
                            Notes = $"Pagamento via Pix da Reserva {groupId}"
                        };
                        _db.ExternalTransactions.Add(tx);
                    }
                    await _db.SaveChangesAsync();
                }
            }
        }

        return Ok(new { hasPix = true, pix.Status, pix.PagoEm, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais });
    }

    private static object ToDto(ProductReservation r) => new
    {
        r.Id,
        r.ReservationGroupId,
        r.UserId,
        userName       = r.User?.Name,
        r.ProductId,
        productName    = r.Product?.Name,
        productImageUrl= r.Product?.ImageUrl,
        r.VariantId,
        variantLabel   = r.Variant?.Label,
        r.Quantity,
        r.Status,
        r.Notes,
        r.ReservedAt,
        r.ExpiresAt,
        r.FulfilledAt,
        r.CancelledAt,
        isExpired      = r.IsExpired,
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
