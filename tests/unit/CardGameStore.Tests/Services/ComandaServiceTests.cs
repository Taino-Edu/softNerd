// =============================================================================
// ComandaServiceTests.cs — Testes unitários do ComandaService
// Chama o serviço real com InMemory database (sem mocks de lógica)
// Executar: dotnet test  (na pasta tests/unit/CardGameStore.Tests)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CardGameStore.Tests.Services;

public class ComandaServiceTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    // SQLite in-memory is used instead of EF InMemory to avoid value-converter
    // bugs (HasConversion<string> on enums breaks InMemoryTable.Update in 8.x).
    // Each test gets its own open SqliteConnection so the DB lives for the test duration.
    private static AppDbContext CreateDb(string _)
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .Options;
        var db = new AppDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    /// <summary>Cria mock de IHubContext com Clients.Group configurado para evitar NullReferenceException.</summary>
    private static IHubContext<ComandaHub> CreateHubMock()
    {
        var mockClientProxy = new Mock<IClientProxy>();
        mockClientProxy
            .Setup(p => p.SendCoreAsync(It.IsAny<string>(), It.IsAny<object[]>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var mockClients = new Mock<IHubClients>();
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockClientProxy.Object);

        var mockHub = new Mock<IHubContext<ComandaHub>>();
        mockHub.Setup(h => h.Clients).Returns(mockClients.Object);
        return mockHub.Object;
    }

    private static ComandaService CreateService(AppDbContext db) =>
        new(db,
            new Mock<IEmailService>().Object,
            NullLogger<ComandaService>.Instance,
            new Mock<IServiceScopeFactory>().Object,
            CreateHubMock());

    private static async Task<(User user, Product product, Comanda comanda)> SeedAsync(AppDbContext db)
    {
        var user = new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Cliente Teste",
            PasswordHash = "hash",
            Role         = UserRole.Customer,
        };
        var product = new Product
        {
            Id            = Guid.NewGuid(),
            Name          = "Refrigerante",
            Category      = "Bebida",
            PriceInCents  = 500,
            StockQuantity = 10,
            MinimumStock  = 2,
            IsActive      = true,
        };
        var comanda = new Comanda
        {
            Id     = Guid.NewGuid(),
            UserId = user.Id,
            User   = user,
            Status = ComandaStatus.Aberta,
        };
        db.Users.Add(user);
        db.Products.Add(product);
        db.Comandas.Add(comanda);
        await db.SaveChangesAsync();
        return (user, product, comanda);
    }

    // ── Abrir comanda ─────────────────────────────────────────────────────────

    [Fact]
    public async Task OpenComanda_PrimeiraVez_DeveCriarNovaComanda()
    {
        var db      = CreateDb(nameof(OpenComanda_PrimeiraVez_DeveCriarNovaComanda));
        var service = CreateService(db);
        var user    = new User { Id = Guid.NewGuid(), Name = "Ana", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var comanda = await service.OpenComandaAsync(user.Id, "Mesa-01");

        comanda.Should().NotBeNull();
        comanda.TableIdentifier.Should().Be("Mesa-01");
        comanda.Status.Should().Be("Aberta");
    }

    [Fact]
    public async Task OpenComanda_ComComandaAtiva_DeveReutilizarExistente()
    {
        // Agora o serviço reutiliza a comanda se houver uma aberta ou em andamento
        var db      = CreateDb(nameof(OpenComanda_ComComandaAtiva_DeveReutilizarExistente));
        var service = CreateService(db);
        var (user, _, _) = await SeedAsync(db);

        var primeira  = await service.OpenComandaAsync(user.Id, "Mesa-01");
        var segunda   = await service.OpenComandaAsync(user.Id, "Mesa-01");

        segunda.Id.Should().Be(primeira.Id, "deve reutilizar a comanda existente para evitar duplicidade");
        var totalComandas = await db.Comandas.CountAsync(c => c.UserId == user.Id);
        totalComandas.Should().Be(1, "seed já cria 1, OpenComanda reutiliza a mesma");
    }

    [Fact]
    public async Task OpenComanda_TrocaDeMesa_DeveAtualizarTableIdentifier()
    {
        var db      = CreateDb(nameof(OpenComanda_TrocaDeMesa_DeveAtualizarTableIdentifier));
        var service = CreateService(db);
        var (user, _, _) = await SeedAsync(db);

        await service.OpenComandaAsync(user.Id, "Mesa-01");
        var segunda = await service.OpenComandaAsync(user.Id, "Mesa-02");

        segunda.TableIdentifier.Should().Be("Mesa-02", "deve atualizar a mesa se o cliente trocou de lugar");
    }

    // ── Adicionar item ────────────────────────────────────────────────────────

    [Fact]
    public async Task AddItem_DeveDecrementarEstoqueEAtualizarTotal()
    {
        var db      = CreateDb(nameof(AddItem_DeveDecrementarEstoqueEAtualizarTotal));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        var resultado = await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 2,
        });

        resultado.Items.Should().ContainSingle();
        resultado.TotalInReais.Should().Be(10.00m); // 2 × R$ 5,00

        var estoqueAtual = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoqueAtual.Should().Be(8); // 10 - 2
    }

    [Fact]
    public async Task AddItem_SemEstoque_DeveLancarExcecao()
    {
        var db      = CreateDb(nameof(AddItem_SemEstoque_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        product.StockQuantity = 0;
        await db.SaveChangesAsync();

        var act = async () => await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 1,
        });

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Estoque insuficiente*");
    }

    [Fact]
    public async Task AddItem_ProdutoInativo_DeveLancarExcecao()
    {
        var db      = CreateDb(nameof(AddItem_ProdutoInativo_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        product.IsActive = false;
        await db.SaveChangesAsync();

        var act = async () => await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 1,
        });

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*inativo*");
    }

    [Fact]
    public async Task AddItem_DeveAlterarStatusParaEmAndamento()
    {
        var db      = CreateDb(nameof(AddItem_DeveAlterarStatusParaEmAndamento));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        var resultado = await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 1,
        });

        resultado.Status.Should().Be("EmAndamento");
    }

    // ── Remover item ──────────────────────────────────────────────────────────

    [Fact]
    public async Task RemoveItem_DeveRestaurarEstoque()
    {
        var db      = CreateDb(nameof(RemoveItem_DeveRestaurarEstoque));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        var comandaComItem = await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 3,
        });

        var itemId = comandaComItem.Items.First().Id;
        var resultado = await service.RemoveItemAsync(comanda.Id, itemId, user.Id);

        resultado.Items.Should().BeEmpty();
        // ExecuteUpdateAsync bypassa o change tracker — limpar cache antes de reler do banco
        db.ChangeTracker.Clear();
        var estoqueAtual = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoqueAtual.Should().Be(10); // estoque restaurado
    }

    [Fact]
    public async Task RemoveItem_UltimoItem_DeveVoltarStatusParaAberta()
    {
        var db      = CreateDb(nameof(RemoveItem_UltimoItem_DeveVoltarStatusParaAberta));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        var comandaComItem = await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 1,
        });

        var itemId    = comandaComItem.Items.First().Id;
        var resultado = await service.RemoveItemAsync(comanda.Id, itemId, user.Id);

        resultado.Status.Should().Be("Aberta");
    }

    // ── Cancelar comanda ──────────────────────────────────────────────────────

    [Fact]
    public async Task CancelComanda_DeveRestaurarEstoqueDeTodosOsItens()
    {
        var db      = CreateDb(nameof(CancelComanda_DeveRestaurarEstoqueDeTodosOsItens));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 2 });
        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 3 });

        var adminId = Guid.NewGuid();
        var resultado = await service.CancelComandaAsync(comanda.Id, adminId);

        resultado.Status.Should().Be("Cancelada");
        // ExecuteUpdateAsync bypassa o change tracker — limpar cache antes de reler do banco
        db.ChangeTracker.Clear();
        var estoqueAtual = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoqueAtual.Should().Be(10); // 10 - 5 + 5 = 10 restaurado
    }

    [Fact]
    public async Task CancelComanda_DeveRecusarQuandoComandaJaEstaFechada()
    {
        var db      = CreateDb(nameof(CancelComanda_DeveRecusarQuandoComandaJaEstaFechada));
        var service = CreateService(db);
        var (_, _, comanda) = await SeedAsync(db);

        comanda.Status = ComandaStatus.Fechada;
        await db.SaveChangesAsync();

        var adminId = Guid.NewGuid();
        var act = async () => await service.CancelComandaAsync(comanda.Id, adminId);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task CancelComanda_DeveRecusarQuandoComandaJaEstaCancelada()
    {
        var db      = CreateDb(nameof(CancelComanda_DeveRecusarQuandoComandaJaEstaCancelada));
        var service = CreateService(db);
        var (_, _, comanda) = await SeedAsync(db);

        comanda.Status = ComandaStatus.Cancelada;
        await db.SaveChangesAsync();

        var adminId = Guid.NewGuid();
        var act = async () => await service.CancelComandaAsync(comanda.Id, adminId);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    // ── Aplicar pontos ────────────────────────────────────────────────────────

    [Fact]
    public async Task ApplyPoints_DeveReduzirSaldoERegistrarNaComanda()
    {
        var db      = CreateDb(nameof(ApplyPoints_DeveReduzirSaldoERegistrarNaComanda));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        user.PointsBalance   = 100;
        user.PointsExpiresAt = DateTime.UtcNow.AddDays(20);
        await db.SaveChangesAsync();

        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 4 });
        var resultado = await service.ApplyPointsAsync(comanda.Id, user.Id, 60);

        resultado.PointsApplied.Should().Be(60);
        var saldoAtual = (await db.Users.FindAsync(user.Id))!.PointsBalance;
        saldoAtual.Should().Be(40);
    }

    [Fact]
    public async Task ApplyPoints_ComPontosExpirados_DeveLancarExcecao()
    {
        var db      = CreateDb(nameof(ApplyPoints_ComPontosExpirados_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        user.PointsBalance   = 100;
        user.PointsExpiresAt = DateTime.UtcNow.AddDays(-1); // expirado
        await db.SaveChangesAsync();
        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 1 });

        var act = async () => await service.ApplyPointsAsync(comanda.Id, user.Id, 50);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*expirados*");
    }

    [Fact]
    public async Task ApplyPoints_SaldoInsuficiente_DeveLancarExcecao()
    {
        var db      = CreateDb(nameof(ApplyPoints_SaldoInsuficiente_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        user.PointsBalance   = 10;
        user.PointsExpiresAt = DateTime.UtcNow.AddDays(30);
        await db.SaveChangesAsync();
        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 1 });

        var act = async () => await service.ApplyPointsAsync(comanda.Id, user.Id, 50);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Saldo insuficiente*");
    }

    [Fact]
    public async Task ApplyPoints_JaAplicado_DeveLancarExcecao()
    {
        var db      = CreateDb(nameof(ApplyPoints_JaAplicado_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, comanda) = await SeedAsync(db);

        user.PointsBalance   = 100;
        user.PointsExpiresAt = DateTime.UtcNow.AddDays(30);
        await db.SaveChangesAsync();
        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 4 });

        await service.ApplyPointsAsync(comanda.Id, user.Id, 30);
        var act = async () => await service.ApplyPointsAsync(comanda.Id, user.Id, 30);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*já foram aplicados*");
    }

    // ── PaymentCrediario e controle de estoque ────────────────────────────────

    [Fact]
    public async Task AddItem_EstoqueExatamenteZero_DeveLancarExcecao()
    {
        // Verifica que a constante PaymentCrediario ("Crediario") não afetou
        // a validação de estoque — estoque 0 sempre deve ser rejeitado
        var db      = CreateDb(nameof(AddItem_EstoqueExatamenteZero_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        // Produto com estoque 0
        product.StockQuantity = 0;
        await db.SaveChangesAsync();

        var act = async () => await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 1,
        });

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Estoque insuficiente*");
    }

    [Fact]
    public async Task AddItem_QuantidadeMaiorQueEstoque_DeveLancarExcecao()
    {
        // Tenta adicionar quantidade superior ao estoque disponível
        var db      = CreateDb(nameof(AddItem_QuantidadeMaiorQueEstoque_DeveLancarExcecao));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        // Estoque = 10 (do SeedAsync); tenta adicionar 11
        var act = async () => await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 11,
        });

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Estoque insuficiente*");
    }

    [Fact]
    public async Task AddItem_EstoqueExato_DeveAdicionarEZerarEstoque()
    {
        // Adiciona exatamente o estoque disponível — deve funcionar (estoque vai a 0)
        var db      = CreateDb(nameof(AddItem_EstoqueExato_DeveAdicionarEZerarEstoque));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        // Estoque inicial = 10
        var resultado = await service.AddItemAsync(user.Id, new AddItemToComandaRequest
        {
            ProductId = product.Id,
            Quantity  = 10,
        });

        resultado.Items.Should().ContainSingle();
        var estoqueAtual = (await db.Products.FindAsync(product.Id))!.StockQuantity;
        estoqueAtual.Should().Be(0, "todo o estoque foi consumido atomicamente");
    }

    // ── Estorno de comanda fechada ────────────────────────────────────────────
    // Reportado pelo Maikon: comanda/venda lançada errada sumia do crediário mas
    // continuava no faturamento e o produto não voltava pro estoque.

    [Fact]
    public async Task EstornarComandaFechada_DeveDevolverEstoqueETirarDoFaturamento()
    {
        var db      = CreateDb(nameof(EstornarComandaFechada_DeveDevolverEstoqueETirarDoFaturamento));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 3 });
        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(7);

        var comanda = await db.Comandas.FirstAsync(c => c.UserId == user.Id && c.Status != ComandaStatus.Fechada);
        await service.CloseComandaAsync(comanda.Id, Guid.NewGuid(), "Dinheiro");

        var estornada = await service.EstornarComandaFechadaAsync(comanda.Id, Guid.NewGuid(), "lançada na conta errada");

        estornada.Status.Should().Be("Estornada");

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(10,
            "o produto tem que voltar pra prateleira quando a venda é desfeita");

        var noBanco = await db.Comandas.FirstAsync(c => c.Id == comanda.Id);
        noBanco.Status.Should().Be(ComandaStatus.Estornada,
            "o financeiro só soma comanda Fechada — Estornada sai do faturamento sozinha");
        noBanco.MotivoEstorno.Should().Be("lançada na conta errada");
        noBanco.EstornadaEm.Should().NotBeNull();
    }

    [Fact]
    public async Task EstornarComandaFechada_ComCrediarioSemPagamento_DeveApagarADivida()
    {
        var db      = CreateDb(nameof(EstornarComandaFechada_ComCrediarioSemPagamento_DeveApagarADivida));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 2 });
        var comanda = await db.Comandas.FirstAsync(c => c.UserId == user.Id && c.Status != ComandaStatus.Fechada);
        await service.CloseComandaAsync(comanda.Id, Guid.NewGuid(), "Crediario");

        db.ChangeTracker.Clear();
        (await db.Crediarios.CountAsync(c => c.UserId == user.Id)).Should().Be(1);

        await service.EstornarComandaFechadaAsync(comanda.Id, Guid.NewGuid(), "cliente desistiu");

        db.ChangeTracker.Clear();
        (await db.Crediarios.CountAsync(c => c.UserId == user.Id)).Should().Be(0,
            "dívida zerada pelo estorno não pode continuar cobrando o cliente");
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(10);
    }

    [Fact]
    public async Task EstornarComandaFechada_ComPagamentoNoCrediario_DeveRecusar()
    {
        var db      = CreateDb(nameof(EstornarComandaFechada_ComPagamentoNoCrediario_DeveRecusar));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 2 });
        var comanda = await db.Comandas.FirstAsync(c => c.UserId == user.Id && c.Status != ComandaStatus.Fechada);
        await service.CloseComandaAsync(comanda.Id, Guid.NewGuid(), "Crediario");

        var crediario = await db.Crediarios.FirstAsync(c => c.ComandaId == comanda.Id);
        crediario.ValorPagoEmCentavos = 500;
        await db.SaveChangesAsync();

        var act = async () => await service.EstornarComandaFechadaAsync(comanda.Id, Guid.NewGuid(), "erro de lançamento");

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*já tem R$*");

        db.ChangeTracker.Clear();
        (await db.Products.FindAsync(product.Id))!.StockQuantity.Should().Be(8,
            "estorno recusado não pode mexer no estoque");
    }

    [Fact]
    public async Task EstornarComandaFechada_ComandaAindaAberta_DeveRecusar()
    {
        var db      = CreateDb(nameof(EstornarComandaFechada_ComandaAindaAberta_DeveRecusar));
        var service = CreateService(db);
        var (user, product, _) = await SeedAsync(db);

        await service.AddItemAsync(user.Id, new AddItemToComandaRequest { ProductId = product.Id, Quantity = 1 });
        var comanda = await db.Comandas.FirstAsync(c => c.UserId == user.Id);

        var act = async () => await service.EstornarComandaFechadaAsync(comanda.Id, Guid.NewGuid(), "teste");

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*comanda fechada*");
    }
}
