using System.Net;
using System.Net.Http.Headers;
using System.Text;
using CardGameStore.Configuration;
using CardGameStore.Services.Implementations;
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
