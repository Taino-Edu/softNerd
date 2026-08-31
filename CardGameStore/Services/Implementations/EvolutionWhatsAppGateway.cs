using System.Net.Http.Json;
using System.Text.Json;
using CardGameStore.Services.Interfaces;

namespace CardGameStore.Services.Implementations;

public sealed class EvolutionWhatsAppGateway : IWhatsAppGateway
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EvolutionWhatsAppGateway> _logger;

    public EvolutionWhatsAppGateway(
        IHttpClientFactory http,
        IConfiguration configuration,
        ILogger<EvolutionWhatsAppGateway> logger)
    {
        _http = http;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<WhatsAppGatewayStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        if (!TryGetSettings(out var instance, out var error))
            return new(false, false, "not_configured", error);

        try
        {
            using var response = await Client().GetAsync($"instance/connectionState/{Uri.EscapeDataString(instance)}", cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new(true, false, "unavailable", SafeError(response.StatusCode, body));

            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var state = ReadString(root, "state")
                ?? (root.TryGetProperty("instance", out var nested) ? ReadString(nested, "state") : null)
                ?? "unknown";
            return new(true, state.Equals("open", StringComparison.OrdinalIgnoreCase), state);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Evolution API indisponível ao consultar estado");
            return new(true, false, "unavailable", "Evolution API indisponível.");
        }
    }

    public async Task<WhatsAppGatewaySendResult> SendTextAsync(
        string phone, string text, CancellationToken cancellationToken = default)
    {
        if (!TryGetSettings(out var instance, out var error))
            return new(false, Error: error);

        try
        {
            using var response = await Client().PostAsJsonAsync(
                $"message/sendText/{Uri.EscapeDataString(instance)}",
                new { number = phone.StartsWith("55", StringComparison.Ordinal) ? phone : $"55{phone}", text, delay = 500, linkPreview = false }, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new(false, Error: SafeError(response.StatusCode, body));

            using var json = JsonDocument.Parse(body);
            var id = json.RootElement.TryGetProperty("key", out var key) ? ReadString(key, "id") : null;
            return new(true, id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha ao enviar WhatsApp para {Phone}", phone);
            return new(false, Error: "Não foi possível falar com a Evolution API.");
        }
    }

    public async Task<WhatsAppGatewayQrResult> GetQrCodeAsync(CancellationToken cancellationToken = default)
    {
        if (!TryGetSettings(out var instance, out var error))
            return new(false, Error: error);

        try
        {
            var client = Client();
            using var response = await client.GetAsync($"instance/connect/{Uri.EscapeDataString(instance)}", cancellationToken);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                using var created = await client.PostAsJsonAsync("instance/create", new
                {
                    instanceName = instance,
                    qrcode = true,
                    integration = "WHATSAPP-BAILEYS",
                    groupsIgnore = true,
                    readMessages = false,
                    readStatus = false,
                    syncFullHistory = false,
                }, cancellationToken);
                return await ParseQrResponseAsync(created, cancellationToken);
            }

            return await ParseQrResponseAsync(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Evolution API indisponível ao obter QR Code");
            return new(false, Error: "Evolution API indisponível.");
        }
    }

    private static async Task<WhatsAppGatewayQrResult> ParseQrResponseAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new(false, Error: SafeError(response.StatusCode, body));

            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var base64 = ReadString(root, "base64")
                ?? (root.TryGetProperty("qrcode", out var qr) ? ReadString(qr, "base64") : null);
            var pairing = ReadString(root, "pairingCode") ?? ReadString(root, "code");
            return new(!string.IsNullOrWhiteSpace(base64) || !string.IsNullOrWhiteSpace(pairing), base64, pairing,
                string.IsNullOrWhiteSpace(base64) && string.IsNullOrWhiteSpace(pairing) ? "QR Code não retornado." : null);
    }

    private HttpClient Client()
    {
        var client = _http.CreateClient("evolution");
        client.DefaultRequestHeaders.Remove("apikey");
        client.DefaultRequestHeaders.Add("apikey", _configuration["Evolution:ApiKey"]);
        return client;
    }

    private bool TryGetSettings(out string instance, out string? error)
    {
        instance = _configuration["Evolution:InstanceName"] ?? string.Empty;
        var key = _configuration["Evolution:ApiKey"];
        if (string.IsNullOrWhiteSpace(instance) || string.IsNullOrWhiteSpace(key))
        {
            error = "Evolution API ainda não configurada.";
            return false;
        }
        error = null;
        return true;
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static string SafeError(System.Net.HttpStatusCode status, string body) =>
        $"Evolution respondeu {(int)status}: {body[..Math.Min(body.Length, 240)]}";
}
