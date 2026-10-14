// =============================================================================
// PedidosNoLogMiddlewareTests.cs — o que vai pro log da API (e o que não vai)
// =============================================================================

using CardGameStore.Middleware;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

namespace CardGameStore.Tests.Middleware;

/// <summary>Logger de teste: guarda nível, texto e se veio exceção junto.</summary>
internal sealed class LogGuardado<T> : ILogger<T>
{
    public List<(LogLevel Nivel, string Texto, Exception? Erro)> Linhas { get; } = [];
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
        Func<TState, Exception?, string> formatter) => Linhas.Add((logLevel, formatter(state, exception), exception));
}

public class PedidosNoLogMiddlewareTests
{
    [Theory]
    [InlineData("/api/product", 200, 30, null)]                      // o normal: fora do log
    [InlineData("/api/product", 500, 30, LogLevel.Error)]
    [InlineData("/api/comanda/my", 503, 30, LogLevel.Error)]
    [InlineData("/api/auth/login", 429, 5, LogLevel.Warning)]
    [InlineData("/api/liga-mensal", 200, 2500, LogLevel.Warning)]    // lento
    [InlineData("/api/auth/refresh", 400, 20, LogLevel.Information)] // a "sessão morta" de 01/09
    [InlineData("/api/auth/refresh", 401, 20, LogLevel.Information)] // 401 no login/renovação importa
    [InlineData("/api/comanda/abrir-na-mesa", 409, 20, LogLevel.Information)]
    [InlineData("/api/admin/estoque", 403, 20, LogLevel.Information)] // operador sem permissão
    [InlineData("/api/comanda/my", 401, 20, null)]                   // token vencido: o site renova
    [InlineData("/wp-login.php", 404, 3, null)]                      // robô procurando página
    [InlineData("/hubs/torneio", 200, 600_000, null)]                // tempo real conectado 10 min
    [InlineData("/hubs/torneio/negotiate", 500, 10, LogLevel.Error)] // mas erro no tempo real aparece
    public void Nivel_SoOQueMereceAtencao(string caminho, int status, long ms, LogLevel? esperado) =>
        PedidosNoLogMiddleware.Nivel(caminho, status, ms).Should().Be(esperado);

    private static async Task<LogGuardado<PedidosNoLogMiddleware>> Rodar(
        string caminho, string? query, RequestDelegate proximo)
    {
        var log = new LogGuardado<PedidosNoLogMiddleware>();
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path = caminho;
        if (query is not null) ctx.Request.QueryString = new QueryString(query);
        await new PedidosNoLogMiddleware(proximo, log).InvokeAsync(ctx);
        return log;
    }

    [Fact]
    public async Task PedidoNormal_NaoEscreveNada()
    {
        var log = await Rodar("/api/product", null, ctx => { ctx.Response.StatusCode = 200; return Task.CompletedTask; });

        log.Linhas.Should().BeEmpty();
    }

    [Fact]
    public async Task Erro500_UmaLinhaComMetodoCaminhoEStatus_SemAQuery()
    {
        var log = await Rodar("/api/pagar/abc", "?token=segredo123",
            ctx => { ctx.Response.StatusCode = 500; return Task.CompletedTask; });

        log.Linhas.Should().ContainSingle();
        var (nivel, texto, _) = log.Linhas[0];
        nivel.Should().Be(LogLevel.Error);
        texto.Should().Contain("POST /api/pagar/abc").And.Contain("500");
        texto.Should().NotContain("segredo123");
    }

    [Fact]
    public async Task ExcecaoNaoTratada_RegistraComo500_EDeixaAExcecaoSeguir()
    {
        var log = new LogGuardado<PedidosNoLogMiddleware>();
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "GET";
        ctx.Request.Path = "/api/comanda/my";
        var mw = new PedidosNoLogMiddleware(_ => throw new InvalidOperationException("quebrou"), log);

        var act = () => mw.InvokeAsync(ctx);

        await act.Should().ThrowAsync<InvalidOperationException>();
        log.Linhas.Should().ContainSingle(l => l.Nivel == LogLevel.Error && l.Texto.Contains("500"));
    }
}

public class EvolutionForaDoArNoLogTests
{
    private sealed class Recusa : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            throw new HttpRequestException("Connection refused (evolution-api:8080)");
    }

    private static (EvolutionWhatsAppGateway Gateway, LogGuardado<EvolutionWhatsAppGateway> Log) Criar()
    {
        var fabrica = new Mock<IHttpClientFactory>();
        fabrica.Setup(f => f.CreateClient("evolution"))
            .Returns(() => new HttpClient(new Recusa()) { BaseAddress = new Uri("http://evolution-api:8080/") });
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Evolution:InstanceName"] = "santuarionerd",
            ["Evolution:ApiKey"] = "chave-de-teste",
        }).Build();
        var log = new LogGuardado<EvolutionWhatsAppGateway>();
        return (new EvolutionWhatsAppGateway(fabrica.Object, cfg, log), log);
    }

    [Fact]
    public async Task ConsultaDeEstado_EvolutionDesligada_UmaLinhaSemPilha()
    {
        var (gateway, log) = Criar();

        var status = await gateway.GetStatusAsync();

        status.Connected.Should().BeFalse();
        log.Linhas.Should().ContainSingle();
        log.Linhas[0].Erro.Should().BeNull("conexão recusada é esperada: sem a pilha de 30 linhas");
        log.Linhas[0].Texto.Should().Contain("fora do ar");
    }

    [Fact]
    public async Task EnvioDeMensagem_EvolutionDesligada_NaoGravaOTelefoneInteiro()
    {
        var (gateway, log) = Criar();

        var r = await gateway.SendTextAsync("17991122890", "Seu crediário vence amanhã");

        r.Success.Should().BeFalse();
        log.Linhas.Should().ContainSingle();
        log.Linhas[0].Texto.Should().Contain("…2890").And.NotContain("17991122890");
        log.Linhas[0].Erro.Should().BeNull();
    }

    [Fact]
    public void ErroQueNaoEConexao_ContinuaComAPilha() =>
        EvolutionWhatsAppGateway.ForaDoAr(new InvalidOperationException("json inesperado")).Should().BeFalse();
}
