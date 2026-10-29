// =============================================================================
// ReservationPixServiceTests.cs — Pix do carrinho do site
// Carrinho com um item cancelado travava o Pix do resto ("Só é possível gerar Pix
// para pré-vendas ativas"). Agora o Pix sai só dos
// itens ativos e ainda não pagos.
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
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
}
