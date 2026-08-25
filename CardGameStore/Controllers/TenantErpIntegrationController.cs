using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/integrations/tenant-erp")]
[Authorize(Policy = "AdminOnly")]
[Produces("application/json")]
public sealed class TenantErpIntegrationController : ControllerBase
{
    private readonly ITenantErpApiClient _client;

    public TenantErpIntegrationController(ITenantErpApiClient client) => _client = client;

    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        enabled = _client.IsConfigured,
        endpoint = _client.EndpointHost,
    });

    [HttpPost("test")]
    public async Task<IActionResult> Test(CancellationToken ct) =>
        Ok(await _client.ProbeAsync(ct));

    [HttpGet("financeiro")]
    public async Task<IActionResult> Financeiro(
        [FromQuery] DateTime? inicio, [FromQuery] DateTime? fim, CancellationToken ct)
    {
        try { return Ok(await _client.GetFinanceiroAsync(inicio, fim, ct)); }
        catch (TenantErpApiException ex) { return IntegrationFailure(ex); }
    }

    [HttpGet("fiscal/saude")]
    public async Task<IActionResult> FiscalSaude(CancellationToken ct)
    {
        try { return Ok(await _client.GetFiscalSaudeAsync(ct)); }
        catch (TenantErpApiException ex) { return IntegrationFailure(ex); }
    }

    [HttpPost("financeiro/analisar")]
    public async Task<IActionResult> AnalisarFinanceiro(
        [FromBody] TenantErpFinancialAnalysisRequest request, CancellationToken ct)
    {
        try { return Ok(await _client.AnalyzeFinanceiroAsync(request, ct)); }
        catch (TenantErpApiException ex) { return IntegrationFailure(ex); }
    }

    [HttpGet("fiscal/ibpt/{ncm}")]
    public async Task<IActionResult> Ibpt(
        string ncm, [FromQuery] string uf, [FromQuery] bool importado = false,
        CancellationToken ct = default)
    {
        try { return Ok(await _client.GetIbptAsync(ncm, uf, importado, ct)); }
        catch (TenantErpApiException ex) { return IntegrationFailure(ex); }
    }

    private ObjectResult IntegrationFailure(TenantErpApiException ex) => StatusCode(
        ex.StatusCode is >= 400 and < 500 ? ex.StatusCode.Value : StatusCodes.Status502BadGateway,
        new { Message = ex.Message });
}
