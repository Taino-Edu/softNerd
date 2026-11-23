// =============================================================================
// CotacaoMercadoTests.cs — dólar de mercado pro preço de referência (v1.95.0, chave "dolar-tempo-real-cartas").
// Mercado (AwesomeAPI) primeiro, com cache de 10 min; falhou → PTAX oficial com aviso, sem bater de novo no
// mercado por 10 min (o 429 de 30/07); resposta fora da faixa não vira cotação; chave desligada → PTAX direto.
// =============================================================================

using System.Net;
using System.Text;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Services.Implementations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class CotacaoMercadoTests
{
    private sealed class Mercado(HttpStatusCode status, string corpo) : HttpMessageHandler
    {
        public int Chamadas { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
        {
            Chamadas++;
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") });
        }
    }

    private sealed class Fabrica(HttpMessageHandler h) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(h, false) { BaseAddress = new Uri("https://economia.awesomeapi.com.br/") };
    }

    private sealed class Ptax : ICotacaoOficial
    {
        public int Chamadas { get; private set; }
        public Task<CotacaoUsdBrl> GetCotacaoAsync()
        {
            Chamadas++;
            return Task.FromResult(new CotacaoUsdBrl(5.8889m, DateTime.UtcNow.AddDays(-3), "BCB PTAX", false, null));
        }
    }

    private const string Resposta = """
        {"USDBRL":{"code":"USD","codein":"BRL","bid":"5.977","ask":"5.9775","timestamp":"1795436864","create_date":"2026-11-23 09:27:44"}}
        """;

    private static (CotacaoMercadoService servico, Ptax ptax, FuncionalidadesService chaves) Montar(Mercado mercado)
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        var ptax = new Ptax();
        var servico = new CotacaoMercadoService(new Fabrica(mercado), new MemoryCache(new MemoryCacheOptions()), ptax, chaves,
            NullLogger<CotacaoMercadoService>.Instance);
        return (servico, ptax, chaves);
    }

    [Fact]
    public async Task Mercado_Responde_UsaODolarDeAgora_ECacheia()
    {
        var mercado = new Mercado(HttpStatusCode.OK, Resposta);
        var (servico, ptax, _) = Montar(mercado);

        var c = await servico.GetCotacaoAsync();
        await servico.GetCotacaoAsync();

        c.Valor.Should().Be(5.977m);
        c.Fonte.Should().Contain("Mercado");
        c.Degradada.Should().BeFalse();
        c.ObtidaEm.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1795436864).UtcDateTime);
        mercado.Chamadas.Should().Be(1, "cache de 10 min: no máximo 6 leituras por hora");
        ptax.Chamadas.Should().Be(0);
    }

    [Fact]
    public async Task Mercado_429_CaiNaPtaxComAviso_ENaoInsiste()
    {
        var mercado = new Mercado(HttpStatusCode.TooManyRequests, "{}");
        var (servico, ptax, _) = Montar(mercado);

        var c = await servico.GetCotacaoAsync();
        await servico.GetCotacaoAsync();

        c.Valor.Should().Be(5.8889m);
        c.Aviso.Should().Contain("PTAX");
        mercado.Chamadas.Should().Be(1, "depois de falhar, espera 10 min antes de bater de novo");
        ptax.Chamadas.Should().Be(2);
    }

    [Fact]
    public async Task Mercado_ValorAbsurdo_NaoViraCotacao()
    {
        var mercado = new Mercado(HttpStatusCode.OK, """{"USDBRL":{"bid":"0.0001","timestamp":"1795436864"}}""");
        var (servico, _, _) = Montar(mercado);

        (await servico.GetCotacaoAsync()).Valor.Should().Be(5.8889m);
    }

    [Fact]
    public async Task ChaveDesligada_PtaxComoAntes_SemBaterNoMercado()
    {
        var mercado = new Mercado(HttpStatusCode.OK, Resposta);
        var (servico, ptax, chaves) = Montar(mercado);
        await chaves.DefinirAsync(Funcionalidades.DolarTempoRealCartas, false, Guid.NewGuid());

        var c = await servico.GetCotacaoAsync();

        c.Valor.Should().Be(5.8889m);
        c.Aviso.Should().BeNull("desligada é o jeito normal da v1.92, não falha");
        mercado.Chamadas.Should().Be(0);
        ptax.Chamadas.Should().Be(1);
    }
}
