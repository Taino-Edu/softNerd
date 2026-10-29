// =============================================================================
// CrediariosControllerTests.cs — edição da conta do crediário
// Pedido do Maikon (29/10, conta do Pietro): o item adicionado na edição aparecia na
// lista, mas o bloco "Itens adicionados na edição" valia R$ 0 — a conta não somava.
// =============================================================================

using System.Security.Claims;
using CardGameStore.Controllers;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CardGameStore.Tests.Controllers;

public class CrediariosControllerTests
{
    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static CrediariosController CreateController(AppDbContext db)
    {
        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(
            new Mock<IServiceScopeFactory>().Object, new EncryptionService(config, env.Object),
            config, NullLogger<InterSyncService>.Instance);
        var email = new Mock<IEmailService>().Object;

        var controller = new CrediariosController(db, email,
            new CrediarioPixService(db, inter.Object, new Mock<IPixReconciliationService>().Object, config,
                NullLogger<CrediarioPixService>.Instance),
            new Mock<IAuditService>().Object,
            new CrediarioAvisoService(db, email, new Mock<IPushService>().Object, config,
                NullLogger<CrediarioAvisoService>.Instance),
            NullLogger<CrediariosController>.Instance);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", Guid.NewGuid().ToString())], "TestAuth")),
            },
        };
        return controller;
    }

    [Fact]
    public async Task Editar_ItemNovo_EntraNoBlocoDeAjusteComOValorDele()
    {
        var db = CreateDb();
        var user = new User { Id = Guid.NewGuid(), Name = "Pietro", PasswordHash = "h", Role = UserRole.Customer };
        var conta = new Crediario
        {
            UserId = user.Id, ValorEmCentavos = 24850, DataVencimento = DateTime.UtcNow.AddDays(10),
            Status = CrediariosStatus.Aberto,
        };
        var compra = new CrediarioLancamento
        {
            CrediarioId = conta.Id, Origem = CrediarioLancamentoOrigem.Manual, ValorEmCentavos = 24850,
            ItensJson = CrediarioLancamentos.SerializarItens([
                new ItemCrediarioDto { ItemName = "Booster", Quantity = 1, UnitPriceInReais = 248.50m, SubtotalInReais = 248.50m }]),
        };
        conta.Lancamentos.Add(compra);
        db.Users.Add(user);
        db.Crediarios.Add(conta);
        await db.SaveChangesAsync();

        // A tela manda o total já somado (248,50 + 49,50) e a lista com o item novo
        var r = await CreateController(db).Editar(conta.Id, new EditarCrediarioRequest
        {
            ValorEmCentavos = 29800,
            Itens =
            [
                new ItemCrediarioDto { LancamentoId = compra.Id, ItemName = "Booster", Quantity = 1, UnitPriceInReais = 248.50m, SubtotalInReais = 248.50m },
                new ItemCrediarioDto { ItemName = "Sleeve", Quantity = 1, UnitPriceInReais = 49.50m, SubtotalInReais = 49.50m },
            ],
        });

        r.Result.Should().BeOfType<OkObjectResult>();
        var salva = await db.Crediarios.AsNoTracking().Include(c => c.Lancamentos).SingleAsync();
        salva.ValorEmCentavos.Should().Be(29800);
        salva.Lancamentos.Single(l => l.Origem == CrediarioLancamentoOrigem.Ajuste).ValorEmCentavos.Should().Be(4950,
            "o bloco vale o item que tem dentro — a soma das compras bate com o total da conta");
        salva.Lancamentos.Sum(l => l.ValorEmCentavos).Should().Be(salva.ValorEmCentavos);
    }
}
