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
    Task<TenantErpFiscalNoteResponse> EmitFiscalNoteAsync(TenantErpFiscalEmissionRequest request, CancellationToken ct);
    Task<TenantErpFiscalNoteResponse> RetryFiscalNoteAsync(Guid noteId, CancellationToken ct);
    Task<TenantErpFiscalNoteResponse> CancelFiscalNoteAsync(Guid noteId, string justification, CancellationToken ct);
    Task<JsonElement> GetFiscalReceiptAsync(Guid noteId, CancellationToken ct);
    Task<JsonElement> GetFiscalConfigAsync(CancellationToken ct);
    Task<JsonElement> UpdateFiscalConfigAsync(object request, CancellationToken ct);
    Task<JsonElement> UploadFiscalCertificateAsync(
        byte[] certificate, string fileName, string password, CancellationToken ct);
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

public sealed record TenantErpFiscalEmissionRequest(
    string Source,
    string ExternalDocumentId,
    string IdempotencyKey,
    IReadOnlyList<TenantErpFiscalItemRequest> Items,
    string PaymentMethod,
    string? SecondPaymentMethod,
    int SecondPaymentAmountInCents,
    int DiscountInCents,
    int? CashReceivedInCents,
    int ChangeInCents,
    string? CustomerCpf);

public sealed record TenantErpFiscalItemRequest(
    string Name,
    string Ncm,
    string Cfop,
    string? Csosn,
    string? Cst,
    int Quantity,
    int UnitPriceInCents,
    int SubtotalInCents,
    int Origin,
    string? Cest,
    string? Gtin,
    decimal? FederalTaxPercent = null,
    decimal? StateTaxPercent = null,
    decimal? MunicipalTaxPercent = null,
    string? TaxSource = null,
    DateTime? TaxValidUntil = null,
    string IbsCbsCst = "000",
    string IbsCbsClassTrib = "000001");

public sealed record TenantErpFiscalNoteResponse(
    Guid Id,
    string Source,
    string ExternalDocumentId,
    string Status,
    int TotalInCents,
    int? Series,
    int? Number,
    string? AccessKey,
    string? Protocol,
    string? RejectionReason,
    DateTime? IssuedAt,
    DateTime? AuthorizedAt,
    DateTime? CancelledAt,
    DateTime CreatedAt);
