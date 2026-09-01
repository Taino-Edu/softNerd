using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CardGameStore.Tests.Services;

public class WhatsAppAutomationServiceTests
{
    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        var db = new AppDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private static WhatsAppAutomationService CreateService(
        AppDbContext db,
        Mock<IReservationPixService>? reservationPix = null)
        => new(
            db,
            reservationPix?.Object ?? new Mock<IReservationPixService>().Object,
            new Mock<IPixReconciliationService>().Object,
            new Mock<IWhatsAppPublicAiService>().Object,
            NullLogger<WhatsAppAutomationService>.Instance);

    [Fact]
    public async Task Pontos_IdentificaNumeroComDdiEDevolveSaldo()
    {
        await using var db = CreateDb();
        db.Users.Add(new User
        {
            Name = "Ash Ketchum",
            WhatsApp = "(17) 99999-0000",
            Role = UserRole.Customer,
            PointsBalance = 42,
            IsActive = true,
        });
        await db.SaveChangesAsync();

        var response = await CreateService(db).ProcessarAsync(new WhatsAppAutomationRequest
        {
            MessageId = "msg-pontos-1",
            Phone = "5517999990000",
            Text = "PONTOS",
        });

        response.Replies.Should().ContainSingle();
        response.Replies[0].Text.Should().Contain("42 pontos");
        (await db.WhatsAppInboundEvents.SingleAsync()).Status.Should().Be("processed");
    }

    [Fact]
    public async Task ContatoSilenciado_RegistraMensagemMasNaoResponde()
    {
        await using var db = CreateDb();
        db.WhatsAppConversations.Add(new WhatsAppConversation
        {
            Phone = "17999990000",
            BotDisabled = true,
        });
        await db.SaveChangesAsync();

        var response = await CreateService(db).ProcessarAsync(new WhatsAppAutomationRequest
        {
            MessageId = "msg-silenciado-1",
            Phone = "5517999990000",
            Text = "PONTOS",
        });

        response.Handled.Should().BeFalse();
        response.Replies.Should().BeEmpty();
        // A mensagem precisa continuar visível no inbox: silenciar o bot não é ignorar o cliente.
        (await db.WhatsAppInboundEvents.SingleAsync()).MessageText.Should().Be("PONTOS");
    }

    [Fact]
    public async Task ContatoSilenciado_ComandoBotNaoDesfazAMarcaDoAdmin()
    {
        await using var db = CreateDb();
        db.WhatsAppConversations.Add(new WhatsAppConversation
        {
            Phone = "17999990000",
            BotDisabled = true,
        });
        await db.SaveChangesAsync();

        var response = await CreateService(db).ProcessarAsync(new WhatsAppAutomationRequest
        {
            MessageId = "msg-silenciado-2",
            Phone = "5517999990000",
            Text = "BOT",
        });

        response.Replies.Should().BeEmpty();
        (await db.WhatsAppConversations.SingleAsync()).BotDisabled.Should().BeTrue();
    }

    [Fact]
    public async Task Pix_EventoRepetidoReutilizaRespostaSemExecutarRegraNovamente()
    {
        await using var db = CreateDb();
        var user = new User
        {
            Name = "Misty Waterflower",
            WhatsApp = "17988887777",
            Role = UserRole.Customer,
            IsActive = true,
        };
        var product = new Product
        {
            Name = "Booster Pokémon",
            Category = "Pokemon",
            PriceInCents = 2990,
            StockQuantity = 1,
        };
        var groupId = Guid.NewGuid();
        db.AddRange(user, product);
        db.ProductReservations.Add(new ProductReservation
        {
            ReservationGroupId = groupId,
            User = user,
            Product = product,
            Quantity = 1,
            Kind = "pre_venda",
            Status = "active",
        });
        await db.SaveChangesAsync();

        var pix = new PixCobranca
        {
            Origem = PixCobrancaOrigem.Reserva,
            ReservationGroupId = groupId,
            TxId = "01234567890123456789012345678901",
            ValorEmCentavos = 2990,
            PixCopiaCola = "000201010212TESTEPIX",
            CriadoPorAdminId = user.Id,
        };
        var reservationPix = new Mock<IReservationPixService>();
        reservationPix
            .Setup(x => x.GerarAsync(groupId, user.Id, false, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ReservationPixResult.Ok(pix, reused: false));

        var service = CreateService(db, reservationPix);
        var request = new WhatsAppAutomationRequest
        {
            MessageId = "msg-pix-idempotente",
            Phone = "5517988887777",
            Text = "pix",
        };

        var first = await service.ProcessarAsync(request);
        var retry = await service.ProcessarAsync(request);

        first.Replies.Should().HaveCount(3);
        retry.Replies.Select(x => x.Text).Should().Equal(first.Replies.Select(x => x.Text));
        reservationPix.Verify(
            x => x.GerarAsync(groupId, user.Id, false, It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
