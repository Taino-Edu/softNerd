namespace CardGameStore.Services.Interfaces;

public interface IWhatsAppAutomationService
{
    Task<WhatsAppAutomationResponse> ProcessarAsync(
        WhatsAppAutomationRequest request,
        CancellationToken cancellationToken = default);
}

public sealed class WhatsAppAutomationRequest
{
    public string MessageId { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public string Text { get; init; } = string.Empty;
    public string? PushName { get; init; }
}

public sealed class WhatsAppAutomationResponse
{
    public bool Handled { get; init; } = true;
    public string Phone { get; init; } = string.Empty;
    public Guid? UserId { get; init; }
    public List<WhatsAppReply> Replies { get; init; } = [];
}

public sealed class WhatsAppReply
{
    public string Type { get; init; } = "text";
    public string Text { get; init; } = string.Empty;
}
