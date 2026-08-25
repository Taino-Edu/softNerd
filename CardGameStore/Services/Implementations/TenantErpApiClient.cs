using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using CardGameStore.Configuration;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace CardGameStore.Services.Implementations;

public sealed class TenantErpApiClient : ITenantErpApiClient
{
    public const string HttpClientName = "TenantErp";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TenantErpIntegrationOptions _options;
    private readonly ILogger<TenantErpApiClient> _logger;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _accessToken;
    private DateTimeOffset _accessTokenExpiresAt;

    public TenantErpApiClient(
        IHttpClientFactory httpClientFactory,
        IOptions<TenantErpIntegrationOptions> options,
        ILogger<TenantErpApiClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public bool IsConfigured => _options.IsConfigured;

    public string? EndpointHost =>
        Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out var uri) ? uri.Host : null;

    public Task<JsonElement> GetFinanceiroAsync(DateTime? inicio, DateTime? fim, CancellationToken ct)
    {
        var query = new Dictionary<string, string?>();
        if (inicio.HasValue) query["inicio"] = inicio.Value.ToString("yyyy-MM-dd");
        if (fim.HasValue) query["fim"] = fim.Value.ToString("yyyy-MM-dd");
        var path = QueryHelpers.AddQueryString("api/analytics/financeiro", query);
        return GetJsonAsync(path, ct);
    }

    public Task<JsonElement> GetFiscalSaudeAsync(CancellationToken ct) =>
        GetJsonAsync("api/fiscal/saude", ct);

    public async Task<TenantErpProbeResult> ProbeAsync(CancellationToken ct)
    {
        if (!IsConfigured)
        {
            var disabled = new TenantErpEndpointProbe(false, null, "Integracao nao configurada.");
            return new TenantErpProbeResult(false, false, disabled, disabled, 0);
        }

        var stopwatch = Stopwatch.StartNew();
        try
        {
            await GetAccessTokenAsync(false, null, ct);
        }
        catch (TenantErpApiException ex)
        {
            stopwatch.Stop();
            var failed = new TenantErpEndpointProbe(false, ex.StatusCode, ex.Message);
            return new TenantErpProbeResult(true, false, failed, failed, stopwatch.ElapsedMilliseconds);
        }

        // Tenant externo mantém os dados operacionais no Soft Nerd. O teste da
        // conexão valida autenticação e escopos sem consultar um schema central
        // vazio nem sugerir que vendas/estoque foram sincronizados.
        var financeiro = await ProbeEndpointAsync(() =>
            GetJsonAsync("api/integrations/capabilities/financeiro", ct));
        var fiscal = await ProbeEndpointAsync(() =>
            GetJsonAsync("api/integrations/capabilities/fiscal", ct));
        stopwatch.Stop();
        return new TenantErpProbeResult(true, true, financeiro, fiscal, stopwatch.ElapsedMilliseconds);
    }

    private async Task<TenantErpEndpointProbe> ProbeEndpointAsync(Func<Task<JsonElement>> request)
    {
        try
        {
            await request();
            return new TenantErpEndpointProbe(true, (int)HttpStatusCode.OK, "Acesso confirmado.");
        }
        catch (TenantErpApiException ex)
        {
            return new TenantErpEndpointProbe(false, ex.StatusCode, ex.Message);
        }
    }

    private async Task<JsonElement> GetJsonAsync(string relativePath, CancellationToken ct)
    {
        EnsureConfigured();
        var attempt = await SendAuthenticatedAsync(relativePath, false, null, ct);
        if (attempt.Response.StatusCode == HttpStatusCode.Unauthorized)
        {
            attempt.Response.Dispose();
            attempt = await SendAuthenticatedAsync(relativePath, true, attempt.Token, ct);
        }

        using (attempt.Response)
        {
            if (!attempt.Response.IsSuccessStatusCode)
                throw UpstreamFailure(attempt.Response.StatusCode);

            await using var stream = await attempt.Response.Content.ReadAsStreamAsync(ct);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            return document.RootElement.Clone();
        }
    }

    private async Task<(HttpResponseMessage Response, string Token)> SendAuthenticatedAsync(
        string relativePath, bool forceRefresh, string? rejectedToken, CancellationToken ct)
    {
        var token = await GetAccessTokenAsync(forceRefresh, rejectedToken, ct);
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildUri(relativePath));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        try
        {
            var response = await _httpClientFactory.CreateClient(HttpClientName)
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            return (response, token);
        }
        catch (HttpRequestException ex)
        {
            throw new TenantErpApiException("Tenant-ERP indisponivel ou inacessivel.", innerException: ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new TenantErpApiException("Tempo limite ao acessar o Tenant-ERP.", innerException: ex);
        }
    }

    private async Task<string> GetAccessTokenAsync(
        bool forceRefresh, string? rejectedToken, CancellationToken ct)
    {
        EnsureConfigured();
        if (!forceRefresh && TokenIsValid()) return _accessToken!;

        await _tokenLock.WaitAsync(ct);
        try
        {
            if (TokenIsValid() && (!forceRefresh || !string.Equals(_accessToken, rejectedToken, StringComparison.Ordinal)))
                return _accessToken!;

            using var response = await _httpClientFactory.CreateClient(HttpClientName).PostAsJsonAsync(
                BuildUri("api/integrations/token"),
                new TenantErpTokenRequest("client_credentials", _options.ClientId, _options.ClientSecret),
                ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Tenant-ERP recusou a autenticacao do cliente {ClientId} com HTTP {StatusCode}",
                    _options.ClientId, (int)response.StatusCode);
                throw response.StatusCode == HttpStatusCode.Unauthorized
                    ? new TenantErpApiException("Credencial ou tenant recusado pelo Tenant-ERP.", 401)
                    : UpstreamFailure(response.StatusCode);
            }

            var token = await response.Content.ReadFromJsonAsync<TenantErpTokenResponse>(cancellationToken: ct);
            if (token is null || string.IsNullOrWhiteSpace(token.AccessToken) || token.ExpiresIn <= 0)
                throw new TenantErpApiException("Resposta de autenticacao invalida do Tenant-ERP.");

            _accessToken = token.AccessToken;
            _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(token.ExpiresIn);
            return _accessToken;
        }
        catch (HttpRequestException ex)
        {
            throw new TenantErpApiException("Tenant-ERP indisponivel ou inacessivel.", innerException: ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new TenantErpApiException("Tempo limite ao acessar o Tenant-ERP.", innerException: ex);
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private bool TokenIsValid() =>
        !string.IsNullOrWhiteSpace(_accessToken) &&
        _accessTokenExpiresAt > DateTimeOffset.UtcNow.AddSeconds(30);

    private void EnsureConfigured()
    {
        if (!IsConfigured)
            throw new TenantErpApiException("Integracao Tenant-ERP nao configurada.");
    }

    private Uri BuildUri(string relativePath)
    {
        var baseUri = new Uri(_options.BaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, relativePath.TrimStart('/'));
    }

    private static TenantErpApiException UpstreamFailure(HttpStatusCode statusCode) => statusCode switch
    {
        HttpStatusCode.Forbidden => new("Escopo ou modulo recusado pelo Tenant-ERP.", 403),
        HttpStatusCode.NotFound => new("Tenant ou rota nao encontrado no Tenant-ERP.", 404),
        _ => new("Tenant-ERP retornou uma falha temporaria.", (int)statusCode),
    };

    private sealed record TenantErpTokenRequest(
        [property: JsonPropertyName("grant_type")] string GrantType,
        [property: JsonPropertyName("client_id")] string ClientId,
        [property: JsonPropertyName("client_secret")] string ClientSecret);

    private sealed record TenantErpTokenResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn);
}

public sealed class TenantErpApiException : Exception
{
    public TenantErpApiException(string message, int? statusCode = null, Exception? innerException = null)
        : base(message, innerException) => StatusCode = statusCode;

    public int? StatusCode { get; }
}
