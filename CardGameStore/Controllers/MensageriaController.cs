// =============================================================================
// MensageriaController.cs — Sistema de mensagens/marketing (Admin)
// POST /api/admin/mensageria/send     → envia notificação in-app e/ou email
// GET  /api/admin/mensageria/clients  → lista clientes para seleção de alvos
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/admin/mensageria")]
[Authorize(Policy = "AdminOnly")]
[Produces("application/json")]
public class MensageriaController : ControllerBase
{
    private readonly AppDbContext  _db;
    private readonly IEmailService _email;
    private readonly IPushService  _push;
    private readonly ILogger<MensageriaController> _log;

    public MensageriaController(AppDbContext db, IEmailService email, IPushService push, ILogger<MensageriaController> log)
    { _db = db; _email = email; _push = push; _log = log; }

    // ── Listar clientes disponíveis para alvo ──────────────────────────────────

    [HttpGet("clients")]
    public async Task<IActionResult> GetClients()
    {
        var clients = await _db.Users
            .Where(u => u.IsActive && u.Role == "Customer")
            .OrderBy(u => u.Name)
            .Select(u => new { u.Id, u.Name, u.Email, u.WhatsApp, u.PointsBalance })
            .ToListAsync();

        return Ok(clients);
    }

    // ── Segmentos pré-definidos ────────────────────────────────────────────────

    [HttpGet("segments")]
    public async Task<IActionResult> GetSegments()
    {
        var now = DateTime.UtcNow;
        return Ok(new[]
        {
            new { id = "all",         label = "Todos os clientes" },
            new { id = "with_email",  label = "Clientes com e-mail" },
            new { id = "crediario",   label = "Clientes com crediário aberto" },
            new { id = "waitlist",    label = "Clientes em lista de espera" },
            new { id = "top_points",  label = "Top 20 em pontos" },
        });
    }

    // ── Enviar mensagem ────────────────────────────────────────────────────────

    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] MensageriaRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Body))
            return BadRequest(new { Message = "Título e corpo são obrigatórios." });

        // Resolve destinatários
        var userIds = await ResolveTargetsAsync(req);
        if (userIds.Count == 0)
            return BadRequest(new { Message = "Nenhum destinatário encontrado para os alvos selecionados." });

        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Name, u.Email })
            .ToListAsync();

        int inAppSent = 0, emailSent = 0;

        // ── In-app ───────────────────────────────────────────────────────────────
        if (req.Channel is "inapp" or "both")
        {
            var notifications = users.Select(u => new Notification
            {
                UserId    = u.Id,
                Title     = req.Title,
                Body      = req.Body,
                Link      = req.Link,
                ImageUrl  = req.ImageUrl,
                CreatedAt = DateTime.UtcNow,
            }).ToList();

            _db.Notifications.AddRange(notifications);
            await _db.SaveChangesAsync();
            inAppSent = notifications.Count;

            // Dispara push browser (silencioso se VAPID não configurado)
            await _push.SendToManyAsync(
                notifications.Select(n => n.UserId),
                req.Title, req.Body, req.Link, req.ImageUrl);
        }

        // ── Email ─────────────────────────────────────────────────────────────────
        if (req.Channel is "email" or "both")
        {
            var withEmail = users.Where(u => !string.IsNullOrWhiteSpace(u.Email)).ToList();
            emailSent = await _email.SendAnuncioAsync(
                withEmail.Select(u => (u.Email!, u.Name)),
                req.Title,
                req.Body,
                req.ImageUrl,
                req.Link);
        }

        _log.LogInformation(
            "Mensageria: '{Title}' enviado — {InApp} in-app, {Email} emails",
            req.Title, inAppSent, emailSent);

        return Ok(new
        {
            Message  = "Mensagem enviada com sucesso.",
            InApp    = inAppSent,
            Emails   = emailSent,
            Total    = users.Count,
        });
    }

    // ── Resolução de alvos ────────────────────────────────────────────────────

    private async Task<List<Guid>> ResolveTargetsAsync(MensageriaRequest req)
    {
        if (req.UserIds is { Count: > 0 })
            return req.UserIds;

        IQueryable<Guid> query = req.Segment switch
        {
            "all" => _db.Users
                .Where(u => u.IsActive && u.Role == "Customer")
                .Select(u => u.Id),

            "with_email" => _db.Users
                .Where(u => u.IsActive && u.Role == "Customer" && u.Email != null)
                .Select(u => u.Id),

            "crediario" => _db.Crediarios
                .Where(c => c.Status == CrediariosStatus.Aberto)
                .Select(c => c.UserId),

            // Fila de pré-venda (kind "fila"). Antes lia product_waitlist, que a migração
            // "waitlist_to_fila" esvaziou — o filtro mandava mensagem pra ninguém.
            "waitlist" => _db.ProductReservations
                .Where(r => r.Kind == "fila" && r.Status == "waiting"
                         && r.Product!.IsPreVenda && r.Product!.IsActive)
                .Select(r => r.UserId)
                .Distinct(),

            "top_points" => _db.Users
                .Where(u => u.IsActive && u.Role == "Customer")
                .OrderByDescending(u => u.PointsBalance)
                .Take(20)
                .Select(u => u.Id),

            _ => _db.Users
                .Where(u => u.IsActive && u.Role == "Customer")
                .Select(u => u.Id),
        };

        return await query.Distinct().ToListAsync();
    }
}

public class MensageriaRequest
{
    public string       Title    { get; set; } = string.Empty;
    public string       Body     { get; set; } = string.Empty;
    public string?      Link     { get; set; }
    /// <summary>URL da imagem/banner exibida na notificação, push e e-mail.</summary>
    public string?      ImageUrl { get; set; }
    /// <summary>"inapp" | "email" | "both"</summary>
    public string       Channel  { get; set; } = "inapp";
    /// <summary>Se preenchido, sobrepõe Segment.</summary>
    public List<Guid>?  UserIds  { get; set; }
    /// <summary>"all" | "with_email" | "crediario" | "waitlist" | "top_points"</summary>
    public string?      Segment  { get; set; } = "all";
}
