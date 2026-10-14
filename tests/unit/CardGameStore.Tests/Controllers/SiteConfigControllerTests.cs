// =============================================================================
// SiteConfigControllerTests.cs — Personalizar Site: imagem, cor e etiqueta do topo
// =============================================================================

using CardGameStore.Controllers;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Tests.Controllers;

public class SiteConfigControllerTests
{
    private static (AppDbContext Db, SiteConfigController Controller) Criar()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return (db, new SiteConfigController(db));
    }

    private static async Task<SiteConfig> Salvar(SiteConfigController c, SaveSiteConfigRequest req) =>
        (SiteConfig)((OkObjectResult)await c.Save(req)).Value!;

    [Fact]
    public async Task SemNinguemMexer_TopoNasceNoPadraoDoMockup()
    {
        var (_, c) = Criar();

        var cfg = (SiteConfig)((OkObjectResult)await c.Get()).Value!;

        cfg.ColorHero.Should().Be("#1E4FD6");
        cfg.HeroEyebrow.Should().Be("O ponto de encontro da comunidade TCG");
        cfg.HeroImageUrl.Should().BeNull();
    }

    [Fact]
    public async Task SalvaImagemCorEEtiquetaDoTopo()
    {
        var (_, c) = Criar();

        var cfg = await Salvar(c, new SaveSiteConfigRequest
        {
            HeroImageUrl = "/uploads/mascote.png", ColorHero = "#2244AA", HeroEyebrow = "  Bem-vindo  ",
        });

        cfg.HeroImageUrl.Should().Be("/uploads/mascote.png");
        cfg.ColorHero.Should().Be("#2244AA");
        cfg.HeroEyebrow.Should().Be("Bem-vindo");
    }

    [Fact]
    public async Task EtiquetaVazia_SomeDoTopo_ENullNaoMexe()
    {
        var (_, c) = Criar();
        await Salvar(c, new SaveSiteConfigRequest { HeroEyebrow = "" });

        var cfg = await Salvar(c, new SaveSiteConfigRequest { HeroEyebrow = null, SiteName = "Loja" });

        cfg.HeroEyebrow.Should().BeEmpty("vazio é escolha do admin: sem etiqueta");
        cfg.SiteName.Should().Be("Loja");
    }

    [Fact]
    public async Task RemoverImagemDoTopo_VoltaPraLogo()
    {
        var (_, c) = Criar();
        await Salvar(c, new SaveSiteConfigRequest { HeroImageUrl = "/uploads/mascote.png" });

        // Como os ícones: a tela manda tudo, e null aqui é "remover"
        var cfg = await Salvar(c, new SaveSiteConfigRequest { HeroImageUrl = null });

        cfg.HeroImageUrl.Should().BeNull();
    }
}
