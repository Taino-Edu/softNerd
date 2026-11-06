// =============================================================================
// ComandaPixDescontoTests.cs — QR Pix da comanda com o desconto do fechamento.
// Bug do cliente: ao dar 5% de desconto e gerar o QR Pix, o valor do QR saía sem
// o desconto. Aqui: (1) o valor enviado ao Inter já vem descontado; (2) a baixa do
// Pix fecha a comanda com o mesmo desconto, de ponta a ponta (serviço real).
// =============================================================================

using System.Security.Claims;
using CardGameStore.Configuration;
using CardGameStore.Controllers;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CardGameStore.Tests.Controllers;

public class ComandaPixDescontoTests
{
    private static AppDbContext CreateDb()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static IHubContext<ComandaHub> CreateHubMock()
    {
        var proxy = new Mock<IClientProxy>();
        proxy.Setup(p => p.SendCoreAsync(It.IsAny<string>(), It.IsAny<object[]>(), It.IsAny<CancellationToken>()))
             .Returns(Task.CompletedTask);
        var clients = new Mock<IHubClients>();
        clients.Setup(c => c.Group(It.IsAny<string>())).Returns(proxy.Object);
        var hub = new Mock<IHubContext<ComandaHub>>();
        hub.Setup(h => h.Clients).Returns(clients.Object);
        return hub.Object;
    }

    private static Mock<InterSyncService> CreateInterMock(string statusConsulta = "CONCLUIDA")
    {
        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);

        inter.Setup(i => i.CriarCobrancaAsync(
                It.IsAny<IntegrationConfig>(), It.IsAny<int>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { TxId = Guid.NewGuid().ToString("N"), Status = "ATIVA", PixCopiaCola = "000201..." });
        inter.Setup(i => i.ConsultarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Status = statusConsulta });
        return inter;
    }

    private static ComandaController CreateController(AppDbContext db, InterSyncService inter, Guid adminId)
    {
        var controller = new ComandaController(
            new Mock<IComandaService>().Object, db, inter,
            new Mock<IPixReconciliationService>().Object,
            CreateHubMock(), new Mock<IPushService>().Object, new Mock<IAuditService>().Object,
            NullLogger<ComandaController>.Instance);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    new[] { new Claim(ClaimTypes.NameIdentifier, adminId.ToString()) }, "test")),
            },
        };
        return controller;
    }

    /// <summary>Comanda aberta de R$ 100,00 (sem pontos) + config do Inter.</summary>
    private static async Task<Comanda> SeedComandaAsync(AppDbContext db, int totalInCents = 10000, int pontos = 0)
    {
        var user = new User
        {
            Id = Guid.NewGuid(), Name = "Cliente Teste", Email = "c@test.com",
            PasswordHash = "hash", Role = UserRole.Customer,
        };
        db.Users.Add(user);
        db.IntegrationConfigs.Add(new IntegrationConfig { Source = "inter" });
        var comanda = new Comanda
        {
            UserId = user.Id, Status = ComandaStatus.Aberta,
            TotalInCents = totalInCents, PointsApplied = pontos,
        };
        db.Comandas.Add(comanda);
        await db.SaveChangesAsync();
        return comanda;
    }

    private static int ValorEnviadoAoInter(Mock<InterSyncService> inter) =>
        (int)inter.Invocations.Single(i => i.Method.Name == nameof(InterSyncService.CriarCobrancaAsync)).Arguments[1];

    // ── Geração do QR ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GerarPix_Com5PorCentoDeDesconto_QrSaiComValorDescontado()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);          // R$ 100,00
        var inter = CreateInterMock();
        var controller = CreateController(db, inter.Object, Guid.NewGuid());

        var res = await controller.GerarCobrancaPix(comanda.Id, new GerarPixComandaRequest { DiscountInCents = 500 });

        res.Should().BeOfType<OkObjectResult>();
        ValorEnviadoAoInter(inter).Should().Be(9500);       // R$ 95,00, não R$ 100,00
        (await db.PixCobrancas.SingleAsync()).ValorEmCentavos.Should().Be(9500);
    }

    [Fact]
    public async Task GerarPix_SemCorpo_ContinuaCobrandoOTotalCheio()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);
        var inter = CreateInterMock();
        var controller = CreateController(db, inter.Object, Guid.NewGuid());

        var res = await controller.GerarCobrancaPix(comanda.Id);

        res.Should().BeOfType<OkObjectResult>();
        ValorEnviadoAoInter(inter).Should().Be(10000);
    }

    [Fact]
    public async Task GerarPix_DescontoSomaComPontos()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db, totalInCents: 10000, pontos: 1000); // restam R$ 90,00
        var inter = CreateInterMock();
        var controller = CreateController(db, inter.Object, Guid.NewGuid());

        await controller.GerarCobrancaPix(comanda.Id, new GerarPixComandaRequest { DiscountInCents = 500 });

        ValorEnviadoAoInter(inter).Should().Be(8500);
    }

    [Fact]
    public async Task GerarPix_DescontoMaiorQueOTotal_RecusaENaoChamaOInter()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);
        var inter = CreateInterMock();
        var controller = CreateController(db, inter.Object, Guid.NewGuid());

        var res = await controller.GerarCobrancaPix(comanda.Id, new GerarPixComandaRequest { DiscountInCents = 10001 });

        res.Should().BeOfType<BadRequestObjectResult>();
        inter.Invocations.Should().NotContain(i => i.Method.Name == nameof(InterSyncService.CriarCobrancaAsync));
        (await db.PixCobrancas.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GerarPix_DescontoIgualAoTotal_RecusaPorNaoTerValorACobrar()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);
        var inter = CreateInterMock();
        var controller = CreateController(db, inter.Object, Guid.NewGuid());

        var res = await controller.GerarCobrancaPix(comanda.Id, new GerarPixComandaRequest { DiscountInCents = 10000 });

        res.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GerarPix_DescontoNegativo_EhIgnorado()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);
        var inter = CreateInterMock();
        var controller = CreateController(db, inter.Object, Guid.NewGuid());

        await controller.GerarCobrancaPix(comanda.Id, new GerarPixComandaRequest { DiscountInCents = -500 });

        ValorEnviadoAoInter(inter).Should().Be(10000);      // nunca cobra a mais
    }

    // ── Baixa do Pix: ponta a ponta com o ComandaService de verdade ──────────

    [Fact]
    public async Task BaixaDoPix_FechaAComandaComOMesmoDescontoDoQr()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);          // R$ 100,00
        var admin = Guid.NewGuid();
        var inter = CreateInterMock("CONCLUIDA");
        var controller = CreateController(db, inter.Object, admin);

        await controller.GerarCobrancaPix(comanda.Id, new GerarPixComandaRequest { DiscountInCents = 500 });
        var pix = await db.PixCobrancas.SingleAsync();

        var comandaSvc = new ComandaService(
            db, new Mock<IEmailService>().Object, NullLogger<ComandaService>.Instance,
            new Mock<IServiceScopeFactory>().Object, CreateHubMock());
        var reconciliacao = new PixReconciliationService(
            db, inter.Object, comandaSvc, new Mock<IEmailService>().Object,
            new Mock<IPushService>().Object, NullLogger<PixReconciliationService>.Instance);

        var result = await reconciliacao.ReconciliarAsync(pix, admin);

        result.BaixaEfetuada.Should().BeTrue();
        var fechada = await db.Comandas.AsNoTracking().SingleAsync(c => c.Id == comanda.Id);
        fechada.Status.Should().Be(ComandaStatus.Fechada);
        fechada.DiscountInCents.Should().Be(500);           // o desconto de 5% ficou registrado
    }

    [Fact]
    public async Task BaixaDoPix_SemDesconto_FechaSemDesconto()
    {
        var db = CreateDb();
        var comanda = await SeedComandaAsync(db);
        var admin = Guid.NewGuid();
        var inter = CreateInterMock("CONCLUIDA");
        var controller = CreateController(db, inter.Object, admin);

        await controller.GerarCobrancaPix(comanda.Id);
        var pix = await db.PixCobrancas.SingleAsync();

        var comandaSvc = new ComandaService(
            db, new Mock<IEmailService>().Object, NullLogger<ComandaService>.Instance,
            new Mock<IServiceScopeFactory>().Object, CreateHubMock());
        var reconciliacao = new PixReconciliationService(
            db, inter.Object, comandaSvc, new Mock<IEmailService>().Object,
            new Mock<IPushService>().Object, NullLogger<PixReconciliationService>.Instance);

        await reconciliacao.ReconciliarAsync(pix, admin);

        var fechada = await db.Comandas.AsNoTracking().SingleAsync(c => c.Id == comanda.Id);
        fechada.Status.Should().Be(ComandaStatus.Fechada);
        fechada.DiscountInCents.Should().Be(0);
    }
}
