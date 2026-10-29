// =============================================================================
// ReservationPixServiceTests.cs — Pix do carrinho do site
// Carrinho com um item cancelado travava o Pix do resto ("Só é possível gerar Pix
// para pré-vendas ativas"). Agora o Pix sai só dos
// itens ativos e ainda não pagos.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using CardGameStore.Services.Pedidos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class ReservationPixServiceTests
{
    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static Mock<InterSyncService> CreateInterMock()
    {
        var env = new Mock<IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object),
            config,
            NullLogger<InterSyncService>.Instance);
        inter.Setup(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { TxId = Guid.NewGuid().ToString("N"), Status = "ATIVA" });
        return inter;
    }

    /// <summary>Carrinho de 3 itens de R$ 15: um cancelado, um ativo não pago, um ativo já pago.</summary>
    private static async Task<(Guid GroupId, User Cliente)> SeedCarrinhoAsync(AppDbContext db)
    {
        var cliente = new User
        {
            Id = Guid.NewGuid(), Name = "Cliente", Email = "c@test.com", PasswordHash = "hash", Role = UserRole.Customer,
        };
        db.Users.Add(cliente);
        db.IntegrationConfigs.Add(new IntegrationConfig { Source = "inter" });
        var groupId = Guid.NewGuid();
        foreach (var (status, expira) in new (string, DateTime?)[]
                 { ("cancelled", DateTime.UtcNow), ("active", DateTime.UtcNow), ("active", null) })
        {
            var p = new Product { Name = "Booster", Category = "TCG", PriceInCents = 1500, StockQuantity = 5, IsActive = true };
            db.Products.Add(p);
            db.ProductReservations.Add(new ProductReservation
            {
                ReservationGroupId = groupId, UserId = cliente.Id, ProductId = p.Id, Quantity = 1,
                Kind = "pre_venda", Status = status, ExpiresAt = expira,
            });
        }
        await db.SaveChangesAsync();
        return (groupId, cliente);
    }

    [Fact]
    public async Task Gerar_CarrinhoComItemCancelado_CobraSoOAtivoNaoPago()
    {
        var db = CreateDb();
        var (groupId, cliente) = await SeedCarrinhoAsync(db);
        var inter = CreateInterMock();

        var r = await new ReservationPixService(db, inter.Object).GerarAsync(groupId, cliente.Id);

        r.Success.Should().BeTrue(r.Error);
        r.Pix!.ValorEmCentavos.Should().Be(1500, "o cancelado não cobra e o pago não cobra de novo");
        inter.Verify(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), 1500,
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()), Times.Once);
    }

    /// <summary>
    /// Pix vencido segue "ATIVA" no Inter, mas o banco do cliente recusa o QR. Era ele que voltava
    /// pra quem pagava depois do prazo (ex.: código mandado no WhatsApp e pago no dia seguinte).
    /// </summary>
    [Theory]
    [InlineData(-120, false)] // venceu há 2 horas
    [InlineData(3, false)]    // vence em 3 min: não dá tempo de pagar
    [InlineData(40, true)]    // ainda no prazo
    public async Task Gerar_PixAtivoSoEReaproveitadoNoPrazo(int minutosParaVencer, bool reaproveita)
    {
        var db = CreateDb();
        var (groupId, cliente) = await SeedCarrinhoAsync(db);
        var antigo = new PixCobranca
        {
            Origem = PixCobrancaOrigem.Reserva, ReservationGroupId = groupId, TxId = "txantigo",
            ValorEmCentavos = 1500, Status = "ATIVA", PixCopiaCola = "000201antigo",
            ExpiraEm = DateTime.UtcNow.AddMinutes(minutosParaVencer),
        };
        db.PixCobrancas.Add(antigo);
        await db.SaveChangesAsync();
        var inter = CreateInterMock();

        var r = await new ReservationPixService(db, inter.Object).GerarAsync(groupId, cliente.Id);

        r.Success.Should().BeTrue(r.Error);
        r.Reused.Should().Be(reaproveita);
        if (reaproveita) r.Pix!.TxId.Should().Be("txantigo");
        else r.Pix!.TxId.Should().NotBe("txantigo", "o QR vencido não pode voltar pro cliente");
        inter.Verify(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()), reaproveita ? Times.Never() : Times.Once());
    }

    // ── Troca pelo PedidoCobrancaService (caminho da tela) ─────────────────────
    // Codex no PR #125: o que vence em 3 min ainda é pagável, e o vencido pode ter sido pago no fim
    // do prazo. Trocar sem conferir e derrubar deixava dois QRs pagáveis no mesmo pedido.

    private static async Task<(AppDbContext Db, Guid GroupId, User Cliente)> SeedComPixVencendoAsync(int minutosParaVencer)
    {
        var db = CreateDb();
        var (groupId, cliente) = await SeedCarrinhoAsync(db);
        db.PixCobrancas.Add(new PixCobranca
        {
            Origem = PixCobrancaOrigem.Reserva, ReservationGroupId = groupId, TxId = "txantigo",
            ValorEmCentavos = 1500, Status = "ATIVA", PixCopiaCola = "000201antigo",
            ExpiraEm = DateTime.UtcNow.AddMinutes(minutosParaVencer),
        });
        await db.SaveChangesAsync();
        return (db, groupId, cliente);
    }

    private static PedidoCobrancaService Cobranca(AppDbContext db, Mock<InterSyncService> inter, PixReconciliationResult conferencia)
    {
        var reconciliacao = new Mock<IPixReconciliationService>();
        reconciliacao.Setup(r => r.ReconciliarAsync(It.IsAny<PixCobranca>(), It.IsAny<Guid?>())).ReturnsAsync(conferencia);
        return new PedidoCobrancaService(db, new ReservationPixService(db, inter.Object), reconciliacao.Object,
            inter.Object, new Mock<IAuditService>().Object, NullLogger<PedidoCobrancaService>.Instance);
    }

    [Theory]
    [InlineData(3)]    // ainda pagável
    [InlineData(-120)] // vencido
    public async Task GerarPelaTela_PixVencendo_DerrubaOAntigoAntesDoNovo(int minutosParaVencer)
    {
        var (db, groupId, cliente) = await SeedComPixVencendoAsync(minutosParaVencer);
        var inter = CreateInterMock();
        inter.Setup(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), "txantigo"))
             .ReturnsAsync(new PixCobrancaResult { Status = "REMOVIDA_PELO_USUARIO_RECEBEDOR" });

        var novo = await Cobranca(db, inter, new PixReconciliationResult { Status = "ATIVA" })
            .GerarAsync(groupId, new Ator(cliente.Id, cliente.Name, false));

        novo.TxId.Should().NotBe("txantigo");
        inter.Verify(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), "txantigo"), Times.Once);
        (await db.PixCobrancas.AsNoTracking().SingleAsync(p => p.TxId == "txantigo")).Status
            .Should().Be("REMOVIDA_PELO_USUARIO_RECEBEDOR");
        (await db.PixCobrancas.CountAsync(p => p.Status == "ATIVA")).Should().Be(1, "um QR pagável por pedido");
    }

    [Fact]
    public async Task GerarPelaTela_PixVencidoMasPago_NaoGeraOutro()
    {
        var (db, groupId, cliente) = await SeedComPixVencendoAsync(-2);
        var inter = CreateInterMock();

        var gerar = () => Cobranca(db, inter, new PixReconciliationResult { Status = "CONCLUIDA", PagoEm = DateTime.UtcNow })
            .GerarAsync(groupId, new Ator(cliente.Id, cliente.Name, false));

        (await gerar.Should().ThrowAsync<PedidoException>()).Which.Status.Should().Be(409);
        inter.Verify(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()), Times.Never, "o cliente pagaria duas vezes");
    }

    [Fact]
    public async Task GerarPelaTela_InterRecusaDerrubarOQueAindaVale_NaoGeraOutro()
    {
        var (db, groupId, cliente) = await SeedComPixVencendoAsync(3);
        var inter = CreateInterMock();
        inter.Setup(i => i.RemoverCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<string>()))
             .ReturnsAsync(new PixCobrancaResult { Error = "timeout" });

        var gerar = () => Cobranca(db, inter, new PixReconciliationResult { Status = "ATIVA" })
            .GerarAsync(groupId, new Ator(cliente.Id, cliente.Name, false));

        (await gerar.Should().ThrowAsync<PedidoException>()).Which.Status.Should().Be(502);
        inter.Verify(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()), Times.Never);
    }
}
