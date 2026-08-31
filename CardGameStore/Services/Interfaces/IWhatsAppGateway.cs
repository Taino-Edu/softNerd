namespace CardGameStore.Services.Interfaces;

public interface IWhatsAppGateway
{
    Task<WhatsAppGatewayStatus> GetStatusAsync(CancellationToken cancellationToken = default);
    Task<WhatsAppGatewaySendResult> SendTextAsync(string phone, string text, CancellationToken cancellationToken = default);
    Task<WhatsAppGatewayQrResult> GetQrCodeAsync(CancellationToken cancellationToken = default);
}

public sealed record WhatsAppGatewayStatus(bool Configured, bool Connected, string State, string? Error = null);
public sealed record WhatsAppGatewaySendResult(bool Success, string? MessageId = null, string? Error = null);
public sealed record WhatsAppGatewayQrResult(bool Success, string? Base64 = null, string? PairingCode = null, string? Error = null);
