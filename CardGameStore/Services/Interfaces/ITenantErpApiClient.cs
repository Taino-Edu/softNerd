using System.Text.Json;

namespace CardGameStore.Services.Interfaces;

public interface ITenantErpApiClient
{
    bool IsConfigured { get; }
    string? EndpointHost { get; }
    Task<JsonElement> GetFinanceiroAsync(DateTime? inicio, DateTime? fim, CancellationToken ct);
    Task<JsonElement> GetFiscalSaudeAsync(CancellationToken ct);
    Task<JsonElement> AnalyzeFinanceiroAsync(TenantErpFinancialAnalysisRequest request, CancellationToken ct);
    Task<JsonElement> GetIbptAsync(string ncm, string uf, bool importado, CancellationToken ct);
    Task<TenantErpProbeResult> ProbeAsync(CancellationToken ct);
}

public sealed record TenantErpFinancialAnalysisRequest(
    DateTime? Inicio,
    DateTime? Fim,
    decimal Receita,
    decimal CustoProdutos,
    decimal DespesasVariaveis,
    decimal DespesasFixas,
    decimal RecebiveisEmAberto,
    decimal RecebiveisVencidos,
    decimal MargemAlvoPercent,
    IReadOnlyList<TenantErpFinancialProductRequest> Produtos);

public sealed record TenantErpFinancialProductRequest(
    string Nome,
    int QuantidadeVendida,
    decimal Receita,
    decimal Custo);

public sealed record TenantErpProbeResult(
    bool Configured,
    bool Authenticated,
    TenantErpEndpointProbe Financeiro,
    TenantErpEndpointProbe Fiscal,
    long DurationMs);

public sealed record TenantErpEndpointProbe(bool Success, int? StatusCode, string Message);
