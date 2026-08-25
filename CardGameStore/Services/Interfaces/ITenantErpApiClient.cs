using System.Text.Json;

namespace CardGameStore.Services.Interfaces;

public interface ITenantErpApiClient
{
    bool IsConfigured { get; }
    string? EndpointHost { get; }
    Task<JsonElement> GetFinanceiroAsync(DateTime? inicio, DateTime? fim, CancellationToken ct);
    Task<JsonElement> GetFiscalSaudeAsync(CancellationToken ct);
    Task<TenantErpProbeResult> ProbeAsync(CancellationToken ct);
}

public sealed record TenantErpProbeResult(
    bool Configured,
    bool Authenticated,
    TenantErpEndpointProbe Financeiro,
    TenantErpEndpointProbe Fiscal,
    long DurationMs);

public sealed record TenantErpEndpointProbe(bool Success, int? StatusCode, string Message);
