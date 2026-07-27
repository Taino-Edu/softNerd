using System.Net;
using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace CardGameStore.Services.Implementations;

public class PushService : IPushService
{
    private readonly AppDbContext          _db;
    private readonly IConfiguration       _config;
    private readonly ILogger<PushService> _logger;

    public PushService(AppDbContext db, IConfiguration config, ILogger<PushService> logger)
    { _db = db; _config = config; _logger = logger; }

    public Task SendAsync(Guid userId, string title, string body, string? link = null, string? imageUrl = null)
        => SendToManyAsync([userId], title, body, link, imageUrl);

    public async Task SendToManyAsync(IEnumerable<Guid> userIds, string title, string body, string? link = null, string? imageUrl = null)
    {
        var publicKey  = _config["Vapid:PublicKey"];
        var privateKey = _config["Vapid:PrivateKey"];
        var subject    = _config["Vapid:Subject"] ?? "mailto:contato@santuarionerd.com.br";

        if (string.IsNullOrWhiteSpace(publicKey) || string.IsNullOrWhiteSpace(privateKey))
        {
            _logger.LogDebug("VAPID não configurado — push browser desativado.");
            return;
        }

        var ids  = userIds.ToList();
        var subs = await _db.PushSubscriptions.Where(s => ids.Contains(s.UserId)).ToListAsync();
        if (subs.Count == 0) return;

        var client   = new WebPushClient();
        var vapid    = new VapidDetails(subject, publicKey, privateKey);
        var payload  = JsonSerializer.Serialize(new { title, body, link, image = imageUrl });
        var toRemove = new List<Models.PostgreSQL.PushSubscription>();

        foreach (var s in subs)
        {
            try
            {
                var pushSub = new WebPush.PushSubscription(s.Endpoint, s.P256dh, s.Auth);
                await client.SendNotificationAsync(pushSub, payload, vapid);
            }
            catch (WebPushException ex) when (
                ex.StatusCode == HttpStatusCode.Gone ||
                ex.StatusCode == HttpStatusCode.NotFound)
            {
                toRemove.Add(s);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Push falhou para endpoint {E}", s.Endpoint[..Math.Min(40, s.Endpoint.Length)]);
            }
        }

        if (toRemove.Count > 0)
        {
            _db.PushSubscriptions.RemoveRange(toRemove);
            await _db.SaveChangesAsync();
        }
    }
}
