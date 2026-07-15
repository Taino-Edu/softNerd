// =============================================================================
// ProductWaitListController.cs — Lista de espera para produtos em pré-venda
// POST   /api/products/{id}/waitlist           → entrar na lista (cliente autenticado)
// DELETE /api/products/{id}/waitlist           → sair da lista (cliente autenticado)
// GET    /api/products/{id}/waitlist           → ver lista completa (Admin)
// DELETE /api/products/{id}/waitlist/{entryId} → remover entrada (Admin)
// GET    /api/products/{id}/waitlist/my        → posição do cliente logado
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/products/{productId:guid}/waitlist")]
[Produces("application/json")]
public class ProductWaitListController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEmailService _email;
    private readonly IConfiguration _config;
    private readonly ILogger<ProductWaitListController> _logger;

    public ProductWaitListController(AppDbContext db, IEmailService email, IConfiguration config, ILogger<ProductWaitListController> logger)
    { _db = db; _email = email; _config = config; _logger = logger; }

    private Guid? TryGetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : null;
    }

    // ── Posição do cliente logado ──────────────────────────────────────────────

    [HttpGet("my")]
    [Authorize]
    public async Task<IActionResult> MyPosition(Guid productId)
    {
        var userId = TryGetUserId();
        if (userId == null) return Unauthorized();

        var entry = await _db.ProductWaitLists
            .Where(w => w.ProductId == productId && w.UserId == userId)
            .FirstOrDefaultAsync();

        if (entry == null) return Ok(new { InList = false });
        return Ok(new { InList = true, Position = entry.Position, EntryId = entry.Id });
    }

    // ── Entrar na lista ────────────────────────────────────────────────────────

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Join(Guid productId)
    {
        var userId = TryGetUserId();
        if (userId == null) return Unauthorized();

        var product = await _db.Products.FindAsync(productId);
        if (product == null) return NotFound(new { Message = "Produto não encontrado." });
        if (!product.IsPreVenda && product.StockQuantity > 0)
            return BadRequest(new { Message = "Produto disponível em estoque — lista de espera não necessária." });

        var already = await _db.ProductWaitLists.AnyAsync(w => w.ProductId == productId && w.UserId == userId);
        if (already) return Conflict(new { Message = "Você já está na lista de espera." });

        var user = await _db.Users.FindAsync(userId);
        if (user == null) return Unauthorized();

        var position = await _db.ProductWaitLists.CountAsync(w => w.ProductId == productId) + 1;

        var entry = new ProductWaitList
        {
            ProductId = productId,
            UserId    = userId,
            Name      = user.Name,
            WhatsApp  = user.WhatsApp ?? string.Empty,
            Position  = position,
        };
        _db.ProductWaitLists.Add(entry);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Usuário {UserId} entrou na lista de espera do produto {ProductId} na posição {Pos}", userId, productId, position);
        return StatusCode(201, new WaitListEntryDto(entry));
    }

    // ── Sair da lista ──────────────────────────────────────────────────────────

    [HttpDelete]
    [Authorize]
    public async Task<IActionResult> Leave(Guid productId)
    {
        var userId = TryGetUserId();
        if (userId == null) return Unauthorized();

        var entry = await _db.ProductWaitLists.FirstOrDefaultAsync(w => w.ProductId == productId && w.UserId == userId);
        if (entry == null) return NotFound(new { Message = "Você não está na lista de espera." });

        var removedPosition = entry.Position;
        _db.ProductWaitLists.Remove(entry);

        // Reordena posições subsequentes
        var after = await _db.ProductWaitLists
            .Where(w => w.ProductId == productId && w.Position > removedPosition)
            .ToListAsync();
        foreach (var w in after) w.Position--;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Cliente: todas as filas de espera em que estou (perfil) ────────────────

    [HttpGet("/api/products/waitlist/mine")]
    [Authorize]
    public async Task<IActionResult> GetMine()
    {
        var userId = TryGetUserId();
        if (userId == null) return Unauthorized();

        var entries = await _db.ProductWaitLists
            .Include(w => w.Product)
            .Where(w => w.UserId == userId)
            .OrderByDescending(w => w.CreatedAt)
            .ToListAsync();

        return Ok(entries.Select(e => new
        {
            e.Id,
            e.ProductId,
            ProductName     = e.Product?.Name ?? "Produto removido",
            ProductImageUrl = e.Product?.ImageUrl,
            e.Position,
            e.CreatedAt,
            e.NotifiedAt,
        }));
    }

    // ── Admin: contagem agregada de pendentes em pré-venda (dashboard) ─────────

    [HttpGet("/api/products/waitlist/pre-venda/pendentes")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CountPreVendaPendentes()
    {
        // Só conta produto que ainda existe/está ativo — senão o número no dashboard fica
        // "mentindo" pro Maikon contando fila de produto que já saiu de pré-venda ou foi desativado.
        var count = await _db.ProductWaitLists
            .Where(w => w.NotifiedAt == null && w.Product!.IsPreVenda && w.Product!.IsActive)
            .CountAsync();

        return Ok(new { Count = count });
    }

    // ── Admin: ver lista completa ──────────────────────────────────────────────

    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetList(Guid productId)
    {
        var product = await _db.Products.FindAsync(productId);
        if (product == null) return NotFound(new { Message = "Produto não encontrado." });

        var list = await _db.ProductWaitLists
            .Where(w => w.ProductId == productId)
            .OrderBy(w => w.Position)
            .ToListAsync();

        return Ok(new
        {
            ProductId   = productId,
            ProductName = product.Name,
            Total       = list.Count,
            Entries     = list.Select(e => new WaitListEntryDto(e)),
        });
    }

    // ── Admin: notificar próximo da fila ──────────────────────────────────────

    [HttpPost("{entryId:guid}/notify")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> NotifyEntry(Guid productId, Guid entryId)
    {
        var entry = await _db.ProductWaitLists
            .Include(w => w.User)
            .FirstOrDefaultAsync(w => w.Id == entryId && w.ProductId == productId);
        if (entry == null) return NotFound(new { Message = "Entrada não encontrada." });

        var product = await _db.Products.FindAsync(productId);
        if (product == null) return NotFound(new { Message = "Produto não encontrado." });

        var appUrl  = _config["EmailSettings:AppUrl"] ?? "https://santuarionerd.tech";
        var url     = $"{appUrl}/produtos/{productId}";
        var email   = entry.User?.Email ?? string.Empty;
        var name    = entry.Name;

        if (!string.IsNullOrWhiteSpace(email))
            await _email.SendWaitListNotifiedAsync(email, name, product.Name, url);

        entry.NotifiedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Entrada {EntryId} da lista de espera de {ProductId} notificada", entryId, productId);
        return Ok(new { Message = "Notificação enviada.", NotifiedAt = entry.NotifiedAt });
    }

    // ── Admin: remover entrada ─────────────────────────────────────────────────

    [HttpDelete("{entryId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> RemoveEntry(Guid productId, Guid entryId)
    {
        var entry = await _db.ProductWaitLists.FirstOrDefaultAsync(w => w.Id == entryId && w.ProductId == productId);
        if (entry == null) return NotFound(new { Message = "Entrada não encontrada." });

        var removedPosition = entry.Position;
        _db.ProductWaitLists.Remove(entry);

        var after = await _db.ProductWaitLists
            .Where(w => w.ProductId == productId && w.Position > removedPosition)
            .ToListAsync();
        foreach (var w in after) w.Position--;

        await _db.SaveChangesAsync();
        return NoContent();
    }
}

// ── DTO ───────────────────────────────────────────────────────────────────────

public class WaitListEntryDto
{
    public Guid      Id          { get; init; }
    public Guid      ProductId   { get; init; }
    public Guid?     UserId      { get; init; }
    public string    Name        { get; init; }
    public string    WhatsApp    { get; init; }
    public int       Position    { get; init; }
    public DateTime  CreatedAt   { get; init; }
    public DateTime? NotifiedAt  { get; init; }

    public WaitListEntryDto(ProductWaitList e)
    {
        Id = e.Id; ProductId = e.ProductId; UserId = e.UserId;
        Name = e.Name; WhatsApp = e.WhatsApp; Position = e.Position;
        CreatedAt = e.CreatedAt; NotifiedAt = e.NotifiedAt;
    }
}
