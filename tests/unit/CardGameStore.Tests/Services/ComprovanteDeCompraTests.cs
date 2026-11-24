// =============================================================================
// ComprovanteDeCompraTests.cs — comprovante de compra por e-mail (v1.99.0, chave "comprovante-compra").
// Services/Comprovantes/ComprovanteDeCompra.cs: quem recebe, o que vai e a comanda fechada mandando de verdade.
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Hubs;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Comprovantes;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace CardGameStore.Tests.Services;

public class ComprovanteDeCompraTests
{
    private static AppDbContext CriarDb()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static User Cliente(AppDbContext db, string? preferencias = null, string? email = "ana@teste.local", bool emailUnico = false)
    {
        var u = new User { Id = Guid.NewGuid(), Name = "Ana", Email = emailUnico && email is not null ? $"{Guid.NewGuid():N}@teste.local" : email, PasswordHash = "x", Role = UserRole.Customer, PreferencesJson = preferencias };
        db.Users.Add(u);
        db.SaveChanges();
        return u;
    }

    private static VendaAvulsa Venda(Guid? userId, string origem = "PDV") => new()
    {
        Id = "6743a1b2c3d4e5f6a7b8c9d0", UserId = userId, Origem = origem,
        SoldAt = new DateTime(2026, 11, 24, 23, 10, 0, DateTimeKind.Utc), // 20h10 em Brasília
        PaymentMethod = PaymentMethod.Pix, SecondPaymentMethod = PaymentMethod.Dinheiro, SecondPaymentAmountInCents = 1000,
        DiscountInCents = 500, TotalInCents = 3500,
        Items = [new VendaAvulsaItem { ProductName = "Booster", Quantity = 2, UnitPriceInCents = 2000, SubtotalInCents = 4000 }],
    };

    [Fact]
    public async Task DaVenda_MontaOComprovante()
    {
        var db = CriarDb();
        var ana = Cliente(db);

        var pronto = await ComprovanteDeCompra.DaVendaAsync(db, Venda(ana.Id));

        pronto.Should().NotBeNull();
        pronto!.Email.Should().Be("ana@teste.local");
        var c = pronto.Dados;
        c.Loja.Should().Be("Santuário Nerd");
        c.Origem.Should().Be("Compra no balcão");
        c.Quando.Should().Be("24/11/2026 às 20:10");
        c.Itens.Should().ContainSingle().Which.Should().Be(new ItemDoComprovante("Booster", 2, "R$ 40,00"));
        c.Desconto.Should().Be("R$ 5,00");
        c.Total.Should().Be("R$ 35,00");
        c.Pagamento.Should().Equal("Pix — R$ 25,00", "Dinheiro — R$ 10,00");
        c.Codigo.Should().Be("A7B8C9D0", "o fim do id: o começo do id do Mongo é a hora e repete");
    }

    [Fact]
    public async Task DaVenda_PedidoDoSite()
    {
        var db = CriarDb();
        var pronto = await ComprovanteDeCompra.DaVendaAsync(db, Venda(Cliente(db).Id, origem: "Reserva"));
        pronto!.Dados.Origem.Should().Be("Pedido do site");
    }

    [Fact]
    public async Task DaVenda_SemCliente_ChaveDesligada_OuClienteDesligou_NaoManda()
    {
        var db = CriarDb();
        (await ComprovanteDeCompra.DaVendaAsync(db, Venda(null))).Should().BeNull("venda sem cliente cadastrado");

        var desligou = Cliente(db, preferencias: """{"notifications":{"emailsCompra":false}}""", emailUnico: true);
        (await ComprovanteDeCompra.DaVendaAsync(db, Venda(desligou.Id))).Should().BeNull("o cliente desligou em Configurações");

        var semEmail = Cliente(db, email: null);
        (await ComprovanteDeCompra.DaVendaAsync(db, Venda(semEmail.Id))).Should().BeNull();

        db.FuncionalidadesEstado.Add(new FuncionalidadeEstado { Codigo = Funcionalidades.ComprovanteCompra, Ligada = false });
        db.SaveChanges();
        (await ComprovanteDeCompra.DaVendaAsync(db, Venda(Cliente(db, emailUnico: true).Id))).Should().BeNull("chave desligada");
    }

    [Fact]
    public async Task FecharComanda_MandaOComprovantePorEmail()
    {
        var db = CriarDb();
        var ana = Cliente(db);
        var produto = new Product { Name = "Refrigerante", Category = "Bebida", PriceInCents = 500, StockQuantity = 10, IsActive = true };
        var comanda = new Comanda { UserId = ana.Id, User = ana, Status = ComandaStatus.Aberta, TableIdentifier = "4" };
        db.Products.Add(produto);
        db.Comandas.Add(comanda);
        db.SaveChanges();

        var enviado = new TaskCompletionSource<ComprovanteCompraEmail>();
        var email = new Mock<IEmailService>();
        email.Setup(e => e.SendComprovanteCompraAsync(It.IsAny<string>(), It.IsAny<ComprovanteCompraEmail>()))
             .Callback<string, ComprovanteCompraEmail>((_, c) => enviado.TrySetResult(c))
             .Returns(Task.CompletedTask);
        var servico = new ComandaService(db, email.Object, NullLogger<ComandaService>.Instance,
            new Mock<IServiceScopeFactory>().Object, Hub());

        await servico.AddItemAsync(ana.Id, new CardGameStore.DTOs.AddItemToComandaRequest { ProductId = produto.Id, Quantity = 2 });
        await servico.CloseComandaAsync(comanda.Id, Guid.NewGuid(), PaymentMethod.Pix);

        var c = await enviado.Task.WaitAsync(TimeSpan.FromSeconds(5)); // o envio sai em segundo plano
        c.Origem.Should().Be("Comanda · Mesa 4");
        c.Total.Should().Be("R$ 10,00");
        c.Pagamento.Should().Equal("Pix");
        c.Itens.Should().ContainSingle().Which.Nome.Should().Be("Refrigerante");
    }

    [Fact]
    public void Codigo_PegaOsUltimosOitoHexadecimais()
    {
        ComprovanteDeCompra.Codigo("cc6cc505-81d7-4988-b3b0-81fe78124b61").Should().Be("78124B61");
        ComprovanteDeCompra.Codigo("6743a1b2c3d4e5f6a7b8c9d0").Should().Be("A7B8C9D0");
    }

    private static IHubContext<ComandaHub> Hub()
    {
        var proxy = new Mock<IClientProxy>();
        proxy.Setup(p => p.SendCoreAsync(It.IsAny<string>(), It.IsAny<object[]>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        var clients = new Mock<IHubClients>();
        clients.Setup(c => c.Group(It.IsAny<string>())).Returns(proxy.Object);
        var hub = new Mock<IHubContext<ComandaHub>>();
        hub.Setup(h => h.Clients).Returns(clients.Object);
        return hub.Object;
    }
}
