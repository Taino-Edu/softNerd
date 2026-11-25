// =============================================================================
// ComandaPelaContaServiceTests.cs — cliente abre a comanda pela conta (v1.101.0, chave "comanda-pela-conta").
// Trava desligada (padrão) abre direto; ligada pede a localização e só abre dentro do raio (com folga pra
// imprecisão do GPS); já tem comanda → devolve ela sem pedir nada; chave desligada → volta a ser só o QR.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Comandas;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class ComandaPelaContaServiceTests
{
    // Um ponto em José Bonifácio/SP; 0,0009° de latitude ≈ 100 m.
    private const double LojaLat = -21.0547, LojaLng = -49.6880;
    private static readonly Guid Cliente = Guid.NewGuid();

    private sealed record Amb(AppDbContext Db, Mock<IComandaService> Comandas, ComandaPelaContaService Servico);

    private static Amb Montar(TravaLocalDto? trava = null, bool chaveLigada = true, ComandaDto? jaAberta = null)
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        if (!chaveLigada)
            db.FuncionalidadesEstado.Add(new FuncionalidadeEstado { Codigo = Funcionalidades.ComandaPelaConta, Ligada = false });
        if (trava is not null)
            db.SiteConfigs.Add(new SiteConfig
            {
                TravaLocalLigada = trava.Ligada, LojaLatitude = trava.Latitude, LojaLongitude = trava.Longitude,
                TravaLocalRaioMetros = trava.RaioMetros,
            });
        db.SaveChanges();

        var comandas = new Mock<IComandaService>();
        comandas.Setup(c => c.GetActiveComandaAsync(Cliente)).ReturnsAsync(jaAberta);
        comandas.Setup(c => c.OpenComandaAsync(Cliente, null)).ReturnsAsync(new ComandaDto { Id = Guid.NewGuid(), UserId = Cliente });
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        return new Amb(db, comandas, new ComandaPelaContaService(db, comandas.Object, chaves, NullLogger<ComandaPelaContaService>.Instance));
    }

    private static TravaLocalDto TravaLigada(int raio = 300) => new(true, LojaLat, LojaLng, raio);

    [Fact]
    public async Task TravaDesligada_Padrao_AbreSemPedirLocalizacao()
    {
        var a = Montar();

        (await a.Servico.StatusAsync()).Should().Be(new ComandaPelaContaStatus(true, false));
        var comanda = await a.Servico.AbrirAsync(Cliente, null);

        comanda.UserId.Should().Be(Cliente);
        a.Comandas.Verify(c => c.OpenComandaAsync(Cliente, null), Times.Once); // sem mesa
    }

    [Fact]
    public async Task TravaLigada_SemLocalizacao_PedeALocalizacao_ENaoAbre()
    {
        var a = Montar(TravaLigada());

        (await a.Servico.StatusAsync()).PrecisaLocalizacao.Should().BeTrue();
        var abrir = () => a.Servico.AbrirAsync(Cliente, null);

        var erro = (await abrir.Should().ThrowAsync<RegraException>()).Which;
        erro.Status.Should().Be(400);
        erro.Extras!["codigo"].Should().Be("precisa-localizacao");
        a.Comandas.Verify(c => c.OpenComandaAsync(It.IsAny<Guid>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task TravaLigada_DentroDoRaio_Abre()
    {
        var a = Montar(TravaLigada());

        await a.Servico.AbrirAsync(Cliente, new LocalDoCliente(LojaLat + 0.0009, LojaLng, 30)); // ~100 m

        a.Comandas.Verify(c => c.OpenComandaAsync(Cliente, null), Times.Once);
    }

    [Fact]
    public async Task TravaLigada_ForaDoRaio_Recusa_ComADistancia()
    {
        var a = Montar(TravaLigada());

        var abrir = () => a.Servico.AbrirAsync(Cliente, new LocalDoCliente(LojaLat + 0.018, LojaLng, 20)); // ~2 km

        var erro = (await abrir.Should().ThrowAsync<RegraException>()).Which;
        erro.Status.Should().Be(403);
        erro.Extras!["codigo"].Should().Be("fora-da-loja");
        ((int)erro.Extras["distanciaMetros"]!).Should().BeInRange(1900, 2100);
        a.Comandas.Verify(c => c.OpenComandaAsync(It.IsAny<Guid>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public void GpsImpreciso_GanhaFolgaLimitada()
    {
        var trava = TravaLigada(300);
        var a400m = new LocalDoCliente(LojaLat + 0.0036, LojaLng, null); // ~400 m

        ComandaPelaContaService.Conferir(trava, a400m, out _).Should().Be(ResultadoTrava.ForaDoRaio);
        ComandaPelaContaService.Conferir(trava, a400m with { PrecisaoMetros = 150 }, out _).Should().Be(ResultadoTrava.Liberado);
        // Precisão de 3 km (iPhone sem "localização precisa") não libera a cidade inteira: folga para em 200 m
        var a2km = new LocalDoCliente(LojaLat + 0.018, LojaLng, 3000);
        ComandaPelaContaService.Conferir(trava, a2km, out _).Should().Be(ResultadoTrava.ForaDoRaio);
    }

    [Fact]
    public async Task JaTemComandaAberta_DevolveEla_SemPedirLocalizacao()
    {
        var aberta = new ComandaDto { Id = Guid.NewGuid(), UserId = Cliente };
        var a = Montar(TravaLigada(), jaAberta: aberta);

        (await a.Servico.AbrirAsync(Cliente, null)).Id.Should().Be(aberta.Id);
        a.Comandas.Verify(c => c.OpenComandaAsync(It.IsAny<Guid>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task ChaveDesligada_VoltaASerSoOQr()
    {
        var a = Montar(chaveLigada: false);

        (await a.Servico.StatusAsync()).Disponivel.Should().BeFalse();
        var abrir = () => a.Servico.AbrirAsync(Cliente, null);

        (await abrir.Should().ThrowAsync<RegraException>()).Which.Status.Should().Be(403);
        a.Comandas.Verify(c => c.OpenComandaAsync(It.IsAny<Guid>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task TravaLigadaSemOLugarDaLoja_NaoVale()
    {
        // Linha antiga sem lugar marcado não pode trancar todo mundo
        var a = Montar(new TravaLocalDto(true, null, null, 300));

        (await a.Servico.StatusAsync()).PrecisaLocalizacao.Should().BeFalse();
        await a.Servico.AbrirAsync(Cliente, null);
        a.Comandas.Verify(c => c.OpenComandaAsync(Cliente, null), Times.Once);
    }

    [Fact]
    public async Task SalvarTrava_GuardaOLugarEORaio()
    {
        var a = Montar();

        var salva = await a.Servico.SalvarTravaAsync(TravaLigada(250));

        salva.Should().Be(TravaLigada(250));
        (await a.Servico.LerTravaAsync()).Should().Be(TravaLigada(250));
        (await a.Servico.StatusAsync()).PrecisaLocalizacao.Should().BeTrue();
    }

    [Theory]
    [InlineData(true, null, null, 300)]         // ligar sem marcar a loja
    [InlineData(false, -21.05, null, 300)]      // só latitude
    [InlineData(false, -95.0, -49.68, 300)]     // latitude impossível
    [InlineData(false, -21.05, -49.68, 10)]     // raio pequeno demais
    [InlineData(false, -21.05, -49.68, 50_000)] // raio grande demais
    public async Task SalvarTrava_Invalida_Recusa(bool ligada, double? lat, double? lng, int raio)
    {
        var a = Montar();

        var salvar = () => a.Servico.SalvarTravaAsync(new TravaLocalDto(ligada, lat, lng, raio));

        (await salvar.Should().ThrowAsync<RegraException>()).Which.Status.Should().Be(400);
    }

    [Fact]
    public void Distancia_BateComAConta()
    {
        // 0,009° de latitude ≈ 1 km em qualquer lugar
        ComandaPelaContaService.DistanciaEmMetros(LojaLat, LojaLng, LojaLat + 0.009, LojaLng)
            .Should().BeApproximately(1000, 5);
    }

    [Fact]
    public void SiteConfigPublico_NaoMostraALocalizacaoDaLoja()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(new SiteConfig { LojaLatitude = LojaLat, LojaLongitude = LojaLng, TravaLocalLigada = true });

        json.Should().NotContain("Latitude").And.NotContain("TravaLocal");
    }
}
