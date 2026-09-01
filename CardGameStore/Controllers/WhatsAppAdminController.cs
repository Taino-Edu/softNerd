using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using CardGameStore.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/admin/whatsapp")]
[Authorize(Policy = "AdminOnly")]
public sealed class WhatsAppAdminController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly IWhatsAppGateway _gateway;

    public WhatsAppAdminController(AppDbContext db, IWhatsAppGateway gateway)
    {
        _db = db;
        _gateway = gateway;
    }

    // O inbox enxerga só o que o n8n entrega — a Evolution não é consultada para
    // listar conversa. Por isso a data do último evento recebido acompanha o
    // status: sem nenhum evento, lista vazia quer dizer "fluxo desligado", não
    // "ninguém falou com a loja". Sem esse dado a tela não sabe a diferença.
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken cancellationToken)
    {
        var gateway = await _gateway.GetStatusAsync(cancellationToken);
        var lastInboundAt = await _db.WhatsAppInboundEvents.AsNoTracking()
            .OrderByDescending(e => e.ReceivedAt)
            .Select(e => (DateTime?)e.ReceivedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return Ok(new WhatsAppStatusDto(
            gateway.Configured, gateway.Connected, gateway.State, gateway.Error, lastInboundAt));
    }

    [HttpGet("qr-code")]
    public async Task<IActionResult> QrCode(CancellationToken cancellationToken)
    {
        var result = await _gateway.GetQrCodeAsync(cancellationToken);
        return result.Success ? Ok(result) : StatusCode(503, result);
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> Conversations(
        [FromQuery] string? search,
        [FromQuery] bool unreadOnly = false,
        CancellationToken cancellationToken = default)
    {
        var conversations = await _db.WhatsAppConversations.AsNoTracking()
            .OrderByDescending(c => c.LastInboundAt)
            .Take(150)
            .ToListAsync(cancellationToken);

        var userIds = conversations.Where(c => c.UserId.HasValue).Select(c => c.UserId!.Value).Distinct().ToList();
        var users = await _db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Name, u.PointsBalance, u.ProfileImageUrl })
            .ToDictionaryAsync(u => u.Id, cancellationToken);

        var phones = conversations.Select(c => c.Phone).ToList();
        var inbound = await _db.WhatsAppInboundEvents.AsNoTracking()
            .Where(e => phones.Contains(e.Phone))
            .OrderByDescending(e => e.ReceivedAt)
            .Select(e => new { e.Phone, e.MessageText, e.ReceivedAt })
            .ToListAsync(cancellationToken);

        var latest = inbound.GroupBy(e => e.Phone).ToDictionary(g => g.Key, g => g.First());
        var unread = conversations.ToDictionary(
            c => c.Phone,
            c => inbound.Count(e => e.Phone == c.Phone && (!c.LastReadAt.HasValue || e.ReceivedAt > c.LastReadAt.Value)));

        var reservationCounts = userIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await _db.ProductReservations.AsNoTracking()
                .Where(r => userIds.Contains(r.UserId) && (r.Status == "active" || r.Status == "waiting"))
                .GroupBy(r => r.UserId)
                .Select(g => new { UserId = g.Key, Count = g.Select(r => r.ReservationGroupId).Distinct().Count() })
                .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var normalizedSearch = search?.Trim().ToLowerInvariant();
        var result = conversations.Select(c =>
        {
            var user = c.UserId.HasValue && users.TryGetValue(c.UserId.Value, out var found) ? found : null;
            latest.TryGetValue(c.Phone, out var last);
            var count = unread.GetValueOrDefault(c.Phone);
            return new WhatsAppConversationDto(
                c.Phone, user?.Name ?? c.Phone, user?.Id, user?.PointsBalance ?? 0,
                user?.ProfileImageUrl, reservationCounts.GetValueOrDefault(user?.Id ?? Guid.Empty),
                last?.MessageText, last?.ReceivedAt ?? c.LastInboundAt, count,
                c.BotPausedUntil > DateTime.UtcNow, c.BotPausedUntil, c.BotDisabled);
        })
        .Where(c => !unreadOnly || c.UnreadCount > 0)
        .Where(c => string.IsNullOrWhiteSpace(normalizedSearch)
            || c.DisplayName.ToLowerInvariant().Contains(normalizedSearch)
            || c.Phone.Contains(normalizedSearch))
        .OrderByDescending(c => c.LastMessageAt)
        .ToList();

        return Ok(result);
    }

    [HttpGet("conversations/{phone}/messages")]
    public async Task<IActionResult> Messages(string phone, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(phone);
        if (normalized is null) return BadRequest(new { Message = "Telefone inválido." });

        var inbound = await _db.WhatsAppInboundEvents.AsNoTracking()
            .Where(e => e.Phone == normalized)
            .OrderBy(e => e.ReceivedAt)
            .Take(300)
            .ToListAsync(cancellationToken);
        var manual = await _db.WhatsAppOutboundMessages.AsNoTracking()
            .Where(e => e.Phone == normalized)
            .OrderBy(e => e.SentAt)
            .Take(300)
            .ToListAsync(cancellationToken);

        var messages = new List<WhatsAppMessageDto>();
        foreach (var item in inbound)
        {
            if (!string.IsNullOrWhiteSpace(item.MessageText))
                messages.Add(new(item.Id.ToString(), "inbound", "customer", item.MessageText!, item.ReceivedAt, item.Status));

            if (string.IsNullOrWhiteSpace(item.ResponseJson)) continue;
            try
            {
                var response = JsonSerializer.Deserialize<WhatsAppAutomationResponse>(item.ResponseJson, JsonOptions);
                for (var index = 0; index < (response?.Replies.Count ?? 0); index++)
                {
                    var reply = response!.Replies[index];
                    if (!string.IsNullOrWhiteSpace(reply.Text))
                        messages.Add(new($"{item.Id}:bot:{index}", "outbound", "bot", reply.Text,
                            item.ProcessedAt ?? item.ReceivedAt, item.Status));
                }
            }
            catch (JsonException) { }
        }

        messages.AddRange(manual.Select(m => new WhatsAppMessageDto(
            m.Id.ToString(), "outbound", m.Author, m.MessageText, m.SentAt, m.Status)));

        return Ok(messages.OrderBy(m => m.SentAt).ToList());
    }

    [HttpPost("conversations/{phone}/read")]
    public async Task<IActionResult> MarkRead(string phone, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(phone);
        if (normalized is null) return BadRequest(new { Message = "Telefone inválido." });
        var conversation = await _db.WhatsAppConversations.FirstOrDefaultAsync(c => c.Phone == normalized, cancellationToken);
        if (conversation is null) return NotFound();
        conversation.LastReadAt = DateTime.UtcNow;
        conversation.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("conversations/{phone}/mode")]
    public async Task<IActionResult> SetMode(
        string phone, [FromBody] WhatsAppModeRequest request, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(phone);
        if (normalized is null) return BadRequest(new { Message = "Telefone inválido." });
        var conversation = await _db.WhatsAppConversations.FirstOrDefaultAsync(c => c.Phone == normalized, cancellationToken);
        if (conversation is null) return NotFound();
        conversation.BotPausedUntil = request.BotEnabled ? null : DateTime.UtcNow.AddHours(4);
        conversation.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new { botEnabled = request.BotEnabled, conversation.BotPausedUntil });
    }

    // Marca permanente, separada do handoff de 4 horas do /mode: aqui o robô nunca
    // responde este contato, e só o admin desfaz.
    [HttpPost("conversations/{phone}/bot-disabled")]
    public async Task<IActionResult> SetBotDisabled(
        string phone, [FromBody] WhatsAppBotDisabledRequest request, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(phone);
        if (normalized is null) return BadRequest(new { Message = "Telefone inválido." });
        var conversation = await _db.WhatsAppConversations.FirstOrDefaultAsync(c => c.Phone == normalized, cancellationToken);
        if (conversation is null) return NotFound();
        conversation.BotDisabled = request.BotDisabled;
        conversation.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new { botDisabled = conversation.BotDisabled });
    }

    [HttpPost("conversations/{phone}/send")]
    public async Task<IActionResult> Send(
        string phone, [FromBody] WhatsAppSendRequest request, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(phone);
        var text = request.Text?.Trim();
        if (normalized is null || string.IsNullOrWhiteSpace(text))
            return BadRequest(new { Message = "Telefone e mensagem são obrigatórios." });
        if (text.Length > 2000) return BadRequest(new { Message = "A mensagem pode ter no máximo 2.000 caracteres." });

        var sent = await _gateway.SendTextAsync(normalized, text, cancellationToken);
        if (!sent.Success) return StatusCode(503, new { Message = sent.Error ?? "Falha ao enviar WhatsApp." });

        _db.WhatsAppOutboundMessages.Add(new WhatsAppOutboundMessage
        {
            Phone = normalized,
            MessageText = text,
            Author = "admin",
            ExternalMessageId = sent.MessageId,
        });
        var conversation = await _db.WhatsAppConversations.FirstOrDefaultAsync(c => c.Phone == normalized, cancellationToken);
        if (conversation is not null)
        {
            conversation.BotPausedUntil = DateTime.UtcNow.AddHours(4);
            conversation.LastReadAt = DateTime.UtcNow;
            conversation.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new { sent = true, messageId = sent.MessageId, botPausedUntil = conversation?.BotPausedUntil });
    }

    private static string? NormalizePhone(string phone)
    {
        var normalized = Identificadores.NormalizarWhatsApp(phone);
        return normalized is { Length: >= 10 and <= 11 } ? normalized : null;
    }
}

public sealed record WhatsAppStatusDto(
    bool Configured, bool Connected, string State, string? Error, DateTime? LastInboundAt);

public sealed record WhatsAppConversationDto(
    string Phone, string DisplayName, Guid? UserId, int PointsBalance, string? ProfileImageUrl,
    int ActiveReservations, string? LastMessage, DateTime LastMessageAt, int UnreadCount,
    bool HumanMode, DateTime? BotPausedUntil, bool BotDisabled);

public sealed record WhatsAppMessageDto(
    string Id, string Direction, string Author, string Text, DateTime SentAt, string Status);

public sealed class WhatsAppSendRequest { public string? Text { get; init; } }
public sealed class WhatsAppModeRequest { public bool BotEnabled { get; init; } }
public sealed class WhatsAppBotDisabledRequest { public bool BotDisabled { get; init; } }
