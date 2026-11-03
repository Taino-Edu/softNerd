// =============================================================================
// TimerControllerTests.cs — relógio da rodada (widget do balcão)
// Maikon, 03/11: "o alarme está com delay de 2 minutos no PC, aí ele começa a apitar e
// para o restante" e "liga 5 timers ao mesmo tempo". O "finish" vinha da conta do
// aparelho; agora quem decide o fim é o relógio do servidor.
// =============================================================================

using CardGameStore.Controllers;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Tests.Controllers;

public class TimerControllerTests
{
    private static AppDbContext CreateDb()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private static TimerEntity Rodando(AppDbContext db, int duracao, int passou)
    {
        var t = new TimerEntity
        {
            Name = "Rodada", DurationSeconds = duracao, State = TimerState.Running,
            StartedAt = DateTime.UtcNow.AddSeconds(-passou),
        };
        db.Timers.Add(t);
        db.SaveChanges();
        return t;
    }

    private static T Campo<T>(IActionResult r, string nome)
    {
        var corpo = r.Should().BeOfType<OkObjectResult>().Subject.Value!;
        return (T)corpo.GetType().GetProperty(nome)!.GetValue(corpo)!;
    }

    [Fact]
    public async Task Finish_ComTempoSobrandoNoServidor_NaoEncerra()
    {
        // PC com o relógio 2 min adiantado: a conta dele zerou, a do servidor ainda tem 2 min
        var db = CreateDb();
        var t = Rodando(db, duracao: 1800, passou: 1680);

        var r = await new TimerController(db).Update(t.Id, new TimerUpdateRequest("finish"));

        Campo<string>(r, "state").Should().Be("running");
        (await db.Timers.AsNoTracking().SingleAsync()).State.Should().Be(TimerState.Running,
            "um aparelho fora da hora não pode encerrar a rodada de todo mundo");
    }

    [Fact]
    public async Task Finish_NoFimDoTempo_Encerra()
    {
        var db = CreateDb();
        var t = Rodando(db, duracao: 1800, passou: 1799);

        var r = await new TimerController(db).Update(t.Id, new TimerUpdateRequest("finish"));

        Campo<string>(r, "state").Should().Be("finished");
    }

    [Fact]
    public async Task Lista_EscondeTimerDeCampeonatoEncerradoOuCancelado()
    {
        var db = CreateDb();
        Championship Ch(ChampionshipStatus s) => new() { Name = s.ToString(), Game = "Pokemon", StartDate = DateTime.UtcNow, Status = s };
        var andamento = Ch(ChampionshipStatus.EmAndamento);
        var encerrado = Ch(ChampionshipStatus.Finalizado);
        var cancelado = Ch(ChampionshipStatus.Cancelado);
        db.Championships.AddRange(andamento, encerrado, cancelado);
        db.Timers.AddRange(
            new TimerEntity { Name = "Rodada de hoje", ChampionshipId = andamento.Id },
            new TimerEntity { Name = "Liguinha passada", ChampionshipId = encerrado.Id },
            new TimerEntity { Name = "Cancelado", ChampionshipId = cancelado.Id },
            new TimerEntity { Name = "Avulso" });
        await db.SaveChangesAsync();

        var r = await new TimerController(db).List();

        var lista = ((IEnumerable<object>)r.Should().BeOfType<OkObjectResult>().Subject.Value!).ToList();
        lista.Select(x => (string)x.GetType().GetProperty("name")!.GetValue(x)!)
            .Should().BeEquivalentTo("Rodada de hoje", "Avulso");
    }
}
