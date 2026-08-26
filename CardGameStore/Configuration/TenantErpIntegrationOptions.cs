namespace CardGameStore.Configuration;

public sealed class TenantErpIntegrationOptions
{
    public const string SectionName = "TenantErp";

    public bool Enabled { get; set; }
    public string BaseUrl { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 15;
    public bool UseCentralFiscalEngine { get; set; }

    public bool IsConfigured =>
        Enabled &&
        Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp) &&
        !string.IsNullOrWhiteSpace(ClientId) &&
        !string.IsNullOrWhiteSpace(ClientSecret);
}
