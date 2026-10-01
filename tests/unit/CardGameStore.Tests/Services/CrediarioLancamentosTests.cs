// =============================================================================
// CrediarioLancamentosTests.cs — Conversão das contas antigas em lançamentos
// =============================================================================

using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Tests.Services;

public class CrediarioLancamentosTests
{
    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return db;
    }

    [Fact]
    public async Task ConverterContasAntigas_CriaUmLancamentoPorContaEENaoRepete()
    {
        var db   = CreateDb();
        var user = new User { Id = Guid.NewGuid(), Name = "Pietro", PasswordHash = "h", Role = UserRole.Customer };
        db.Users.Add(user);

        var acumulada = new Crediario
        {
            UserId          = user.Id,
            ValorEmCentavos = 3000,
            DataVencimento  = DateTime.UtcNow.AddDays(30),
            ItensJson       = JsonSerializer.Serialize(new List<ItemCrediarioDto>
            {
                new() { ItemName = "Booster", Quantity = 2, UnitPriceInReais = 10, SubtotalInReais = 20 },
                new() { ItemName = "Sleeve",  Quantity = 1, UnitPriceInReais = 10, SubtotalInReais = 10 },
            }),
        };
        var manual = new Crediario
        {
            UserId          = user.Id,
            ValorEmCentavos = 5000,
            DataVencimento  = DateTime.UtcNow.AddDays(30),
            Observacao      = "Dívida de torneio",
        };
        db.Crediarios.AddRange(acumulada, manual);
        await db.SaveChangesAsync();

        (await CrediarioLancamentos.ConverterContasAntigasAsync(db)).Should().Be(2);
        (await CrediarioLancamentos.ConverterContasAntigasAsync(db)).Should().Be(0, "conta que já tem lançamento não é convertida de novo");

        db.ChangeTracker.Clear();
        var legado = await db.CrediarioLancamentos.SingleAsync(l => l.CrediarioId == acumulada.Id);
        legado.Origem.Should().Be(CrediarioLancamentoOrigem.Legado);
        legado.ValorEmCentavos.Should().Be(3000);
        CrediarioLancamentos.LerItens(legado.ItensJson).Should().HaveCount(2);

        var lancManual = await db.CrediarioLancamentos.SingleAsync(l => l.CrediarioId == manual.Id);
        lancManual.Origem.Should().Be(CrediarioLancamentoOrigem.Manual);
        lancManual.Descricao.Should().Be("Dívida de torneio");
    }

    [Fact]
    public void VencimentoFimDoDia_ValeODiaInteiroNoHorarioDeBrasilia()
    {
        // 15/10 escolhido = até 15/10 23:59:59 em Brasília = 16/10 02:59:59 UTC
        var venc = CrediarioLancamentos.VencimentoFimDoDia(new DateTime(2026, 10, 15));

        venc.Should().Be(new DateTime(2026, 10, 16, 2, 59, 59, DateTimeKind.Utc));
    }
}
