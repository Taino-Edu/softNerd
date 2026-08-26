using System.Net;
using System.Net.Http.Headers;
using System.Text;
using CardGameStore.Configuration;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CardGameStore.Tests.Services;

public sealed class TenantErpApiClientTests
{
    [Fact]
    public async Task ReusesTokenAcrossReadRequests()
    {
        var tokenCalls = 0;
        var apiCalls = 0;
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath == "/api/integrations/token")
            {
                tokenCalls++;
                return Json(HttpStatusCode.OK, """{"access_token":"token-1","expires_in":900}""");
            }

            apiCalls++;
            request.Headers.Authorization.Should().Be(new AuthenticationHeaderValue("Bearer", "token-1"));
            return Json(HttpStatusCode.OK, """{"ok":true}""");
        });
        var client = CreateClient(handler);

        await client.GetFinanceiroAsync(null, null, default);
        await client.GetFiscalSaudeAsync(default);

        tokenCalls.Should().Be(1);
        apiCalls.Should().Be(2);
    }

    [Fact]
    public async Task UnauthorizedResponse_RefreshesTokenAndRetriesOnce()
    {
        var tokenCalls = 0;
        var apiCalls = 0;
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath == "/api/integrations/token")
            {
                tokenCalls++;
                return Json(HttpStatusCode.OK,
                    $$"""{"access_token":"token-{{tokenCalls}}","expires_in":900}""");
            }

            apiCalls++;
            return apiCalls == 1
                ? new HttpResponseMessage(HttpStatusCode.Unauthorized)
                : Json(HttpStatusCode.OK, """{"ok":true}""");
        });
        var client = CreateClient(handler);

        await client.GetFiscalSaudeAsync(default);

        tokenCalls.Should().Be(2);
        apiCalls.Should().Be(2);
        handler.LastAuthorization.Should().Be("Bearer token-2");
    }

    [Fact]
    public async Task ForbiddenResponse_IsReportedWithoutLeakingUpstreamBody()
    {
        var handler = new StubHandler(request => request.RequestUri!.AbsolutePath.EndsWith("/token")
            ? Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""")
            : Json(HttpStatusCode.Forbidden, """{"secret":"upstream detail"}"""));
        var client = CreateClient(handler);

        var action = () => client.GetFiscalSaudeAsync(default);

        var error = await action.Should().ThrowAsync<TenantErpApiException>();
        error.Which.StatusCode.Should().Be(403);
        error.Which.Message.Should().NotContain("upstream detail");
    }

    [Fact]
    public async Task DisabledIntegration_DoesNotCallNetwork()
    {
        var handler = new StubHandler(_ => throw new InvalidOperationException("network should not be called"));
        var client = CreateClient(handler, enabled: false);

        var result = await client.ProbeAsync(default);

        result.Configured.Should().BeFalse();
        handler.CallCount.Should().Be(0);
    }

    [Fact]
    public async Task Probe_ValidatesCatalogCapabilitiesWithoutReadingCentralTenantSchema()
    {
        var requestedPaths = new List<string>();
        var handler = new StubHandler(request =>
        {
            requestedPaths.Add(request.RequestUri!.AbsolutePath);
            return request.RequestUri.AbsolutePath == "/api/integrations/token"
                ? Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""")
                : Json(HttpStatusCode.OK, """{"dataResidency":"ExternalSystem"}""");
        });
        var client = CreateClient(handler);

        var result = await client.ProbeAsync(default);

        result.Authenticated.Should().BeTrue();
        result.Financeiro.Success.Should().BeTrue();
        result.Fiscal.Success.Should().BeTrue();
        requestedPaths.Should().Contain("/api/integrations/capabilities/financeiro");
        requestedPaths.Should().Contain("/api/integrations/capabilities/fiscal");
        requestedPaths.Should().NotContain("/api/analytics/financeiro");
        requestedPaths.Should().NotContain("/api/fiscal/saude");
    }

    [Fact]
    public async Task ConcurrentUnauthorizedResponses_ShareSingleTokenRefresh()
    {
        var tokenCalls = 0;
        var rejectFirstToken = false;
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath == "/api/integrations/token")
            {
                var number = Interlocked.Increment(ref tokenCalls);
                return Json(HttpStatusCode.OK,
                    $$"""{"access_token":"token-{{number}}","expires_in":900}""");
            }

            return rejectFirstToken && request.Headers.Authorization?.Parameter == "token-1"
                ? new HttpResponseMessage(HttpStatusCode.Unauthorized)
                : Json(HttpStatusCode.OK, """{"ok":true}""");
        });
        var client = CreateClient(handler);

        await client.GetFinanceiroAsync(null, null, default);
        rejectFirstToken = true;
        var calls = Enumerable.Range(0, 12).Select(_ => client.GetFiscalSaudeAsync(default));
        await Task.WhenAll(calls);

        tokenCalls.Should().Be(2);
    }

    [Fact]
    public async Task FinancialAnalysis_SendsAggregatedSnapshotToIntegrationEndpoint()
    {
        string? body = null;
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/token"))
                return Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""");

            request.Method.Should().Be(HttpMethod.Post);
            request.RequestUri.AbsolutePath.Should().Be("/api/integrations/services/financeiro/analisar");
            body = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.OK, """{"formulaVersion":"2026.08.1"}""");
        });
        var client = CreateClient(handler);

        await client.AnalyzeFinanceiroAsync(new TenantErpFinancialAnalysisRequest(
            null, null, 1_000m, 600m, 50m, 100m, 200m, 20m, 35m,
            [new TenantErpFinancialProductRequest("Produto A", 2, 200m, 120m)]), default);

        body.Should().Contain("\"receita\":1000");
        body.Should().Contain("\"nome\":\"Produto A\"");
        body.Should().NotContain("cliente");
    }

    [Fact]
    public async Task IbptLookup_SendsNcmUfAndOriginToFiscalEndpoint()
    {
        Uri? requestedUri = null;
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/token"))
                return Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""");

            requestedUri = request.RequestUri;
            return Json(HttpStatusCode.OK, """{"ncm":"95044000"}""");
        });
        var client = CreateClient(handler);

        await client.GetIbptAsync("9504.40.00", "SP", true, default);

        requestedUri!.AbsolutePath.Should().Be("/api/integrations/services/fiscal/ibpt/9504.40.00");
        requestedUri.Query.Should().Contain("uf=SP").And.Contain("importado=true");
    }

    [Fact]
    public async Task IbptLookup_WhenCatalogHasNoMatch_ReturnsUsefulMessage()
    {
        var handler = new StubHandler(request => request.RequestUri!.AbsolutePath.EndsWith("/token")
            ? Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""")
            : new HttpResponseMessage(HttpStatusCode.NotFound));
        var client = CreateClient(handler);

        var action = () => client.GetIbptAsync("95044000", "SP", false, default);

        var error = await action.Should().ThrowAsync<TenantErpApiException>();
        error.Which.StatusCode.Should().Be(404);
        error.Which.Message.Should().Contain("NCM nao encontrado");
    }

    [Fact]
    public async Task FiscalEmission_SendsIdempotentSnapshotToCentralEngine()
    {
        string? body = null;
        var id = Guid.NewGuid();
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/token"))
                return Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""");

            request.Method.Should().Be(HttpMethod.Post);
            request.RequestUri.AbsolutePath.Should().Be("/api/integrations/services/fiscal/nfce");
            body = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.OK,
                $$"""{"id":"{{id}}","source":"softnerd","externalDocumentId":"comanda:1","status":"PendenteEmissao","totalInCents":1000,"series":null,"number":null,"accessKey":null,"protocol":null,"rejectionReason":null,"issuedAt":null,"authorizedAt":null,"cancelledAt":null,"createdAt":"2026-08-26T12:00:00Z"}""");
        });
        var client = CreateClient(handler);

        var result = await client.EmitFiscalNoteAsync(new TenantErpFiscalEmissionRequest(
            "softnerd", "comanda:1", "softnerd:comanda:1",
            [new TenantErpFiscalItemRequest("Produto", "95044000", "5102", "102", null, 1, 1000, 1000, 0, null, null)],
            "Pix", null, 0, 0, null, 0, null), default);

        result.Id.Should().Be(id);
        body.Should().Contain("\"idempotencyKey\":\"softnerd:comanda:1\"");
        body.Should().Contain("\"ncm\":\"95044000\"");
    }

    [Fact]
    public async Task CertificateUpload_UsesAuthenticatedMultipartWithoutLoggingSecret()
    {
        string? contentType = null;
        string? body = null;
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/token"))
                return Json(HttpStatusCode.OK, """{"access_token":"token","expires_in":900}""");

            request.RequestUri.AbsolutePath.Should().Be("/api/integrations/services/fiscal/certificate");
            request.Headers.Authorization.Should().Be(new AuthenticationHeaderValue("Bearer", "token"));
            contentType = request.Content!.Headers.ContentType!.MediaType;
            body = request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.OK, """{"message":"ok"}""");
        });
        var client = CreateClient(handler);

        await client.UploadFiscalCertificateAsync([1, 2, 3], "loja.pfx", "senha-forte", default);

        contentType.Should().Be("multipart/form-data");
        body.Should().Contain("name=password").And.Contain("senha-forte");
        body.Should().Contain("filename=loja.pfx");
    }

    private static TenantErpApiClient CreateClient(StubHandler handler, bool enabled = true)
    {
        var httpClient = new HttpClient(handler);
        var options = Options.Create(new TenantErpIntegrationOptions
        {
            Enabled = enabled,
            BaseUrl = "https://loja.tenant-erp.test",
            ClientId = "ti_softnerd",
            ClientSecret = "secret",
            TimeoutSeconds = 15,
        });
        return new TenantErpApiClient(
            new StubHttpClientFactory(httpClient), options, NullLogger<TenantErpApiClient>.Instance);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string json) => new(status)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json"),
    };

    private sealed class StubHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> response) : HttpMessageHandler
    {
        public int CallCount { get; private set; }
        public string? LastAuthorization { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            LastAuthorization = request.Headers.Authorization?.ToString();
            return Task.FromResult(response(request));
        }
    }
}
