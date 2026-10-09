// =============================================================================
// TorneioServiceTests.cs — Liguinha de ponta a ponta (Services/Liga/TorneioService.cs)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Liga;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class TorneioServiceTests
{
    private sealed record Ambiente(AppDbContext Db, TorneioService Torneio, Championship Ch, List<User> Jogadores);

    private static Ambiente Criar(int jogadores, int taxaEmCentavos = 0)
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();

        var users = Enumerable.Range(1, jogadores).Select(i => new User
        {
            Id = Guid.NewGuid(), Name = $"Jogador {i}", Email = $"{Guid.NewGuid():N}@test.com",
            PasswordHash = "h", Role = UserRole.Customer,
        }).ToList();
        db.Users.AddRange(users);
        var ch = new Championship
        {
            Name = "Liguinha Outubro", Game = "Pokemon", StartDate = DateTime.UtcNow,
            Status = ChampionshipStatus.Inscricoes, EntryFeeInCents = taxaEmCentavos,
        };
        db.Championships.Add(ch);
        db.SaveChanges();

        var hub = new Mock<IHubContext<TorneioHub>>();
        var clients = new Mock<IHubClients>();
        clients.Setup(c => c.Group(It.IsAny<string>())).Returns(new Mock<IClientProxy>().Object);
        hub.Setup(h => h.Clients).Returns(clients.Object);

        return new(db, new TorneioService(db, hub.Object, NullLogger<TorneioService>.Instance), ch, users);
    }

    /// <summary>Lança o mesmo resultado pelos dois lados: A sempre vence (ordem determinística).</summary>
    private static async Task FecharRodadaAsync(Ambiente amb, int numero)
    {
        var partidas = await amb.Db.TorneioPartidas.AsNoTracking()
            .Include(p => p.ParticipanteA).Include(p => p.ParticipanteB)
            .Where(p => p.Rodada.ChampionshipId == amb.Ch.Id && p.Rodada.Numero == numero && p.ParticipanteBId != null)
            .ToListAsync();
        foreach (var p in partidas)
        {
            await amb.Torneio.LancarResultadoAsync(p.ParticipanteA.UserId, amb.Ch.Id, p.Id, ResultadoJogador.Venci);
            await amb.Torneio.LancarResultadoAsync(p.ParticipanteB!.UserId, amb.Ch.Id, p.Id, ResultadoJogador.Perdi);
        }
    }

    [Fact]
    public async Task Preparar_GeraCodigoSemLetrasAmbiguas()
    {
        var amb = Criar(2);

        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, melhorDe: 3, minutosRodada: 50);

        ch.Formato.Should().Be(FormatoTorneio.Suico);
        ch.CodigoEntrada.Should().HaveLength(5).And.MatchRegex("^[A-HJ-KM-NP-Z2-9]+$");
    }

    [Fact]
    public async Task Entrar_PeloCodigo_TorneioGratuito_InscreveEFazCheckIn()
    {
        var amb = Criar(1);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);

        await amb.Torneio.EntrarAsync(amb.Jogadores[0].Id, ch.CodigoEntrada!.ToLowerInvariant(), null, "Charizard ex");

        var p = await amb.Db.ChampionshipParticipants.SingleAsync();
        p.CheckInEm.Should().NotBeNull();
        p.DeckName.Should().Be("Charizard ex");
        p.PlayerNumber.Should().Be(1);
    }

    [Fact]
    public async Task Entrar_TorneioPago_SemInscricaoPaga_Recusa()
    {
        var amb = Criar(1, taxaEmCentavos: 1500);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);

        var act = () => amb.Torneio.EntrarAsync(amb.Jogadores[0].Id, ch.CodigoEntrada!, null, null);

        (await act.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(402);
    }

    [Fact]
    public async Task Entrar_CodigoErrado_404()
    {
        var amb = Criar(1);

        var act = () => amb.Torneio.EntrarAsync(amb.Jogadores[0].Id, "ZZZZZ", null, null);

        (await act.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(404);
    }

    [Fact]
    public async Task Resultado_SoFechaQuandoOsDoisBatem_EDivergenciaFicaProOrganizador()
    {
        var amb = Criar(2);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var partida = await amb.Db.TorneioPartidas.AsNoTracking().Include(p => p.ParticipanteA).Include(p => p.ParticipanteB).SingleAsync();

        // Os dois dizem que venceram
        await amb.Torneio.LancarResultadoAsync(partida.ParticipanteA.UserId, amb.Ch.Id, partida.Id, ResultadoJogador.Venci);
        await amb.Torneio.LancarResultadoAsync(partida.ParticipanteB!.UserId, amb.Ch.Id, partida.Id, ResultadoJogador.Venci);

        var depois = await amb.Db.TorneioPartidas.AsNoTracking().SingleAsync();
        depois.Resultado.Should().BeNull();
        depois.Divergente.Should().BeTrue();

        await amb.Torneio.ResolverAsync(amb.Ch.Id, partida.Id, ResultadoPartida.VitoriaB, Guid.NewGuid());

        (await amb.Db.TorneioPartidas.AsNoTracking().SingleAsync()).Resultado.Should().Be(ResultadoPartida.VitoriaB);
        (await amb.Db.TorneioRodadas.AsNoTracking().SingleAsync()).Status.Should().Be(StatusRodada.Fechada);
    }

    [Fact]
    public async Task Resultado_DeQuemNaoEstaNaPartida_403()
    {
        var amb = Criar(3);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var partida = await amb.Db.TorneioPartidas.AsNoTracking().Include(p => p.ParticipanteA)
            .SingleAsync(p => p.ParticipanteBId != null);
        var deFora = await amb.Db.TorneioPartidas.AsNoTracking().Include(p => p.ParticipanteA)
            .SingleAsync(p => p.ParticipanteBId == null); // quem ficou com o bye

        var act = () => amb.Torneio.LancarResultadoAsync(deFora.ParticipanteA.UserId, amb.Ch.Id, partida.Id, ResultadoJogador.Venci);

        (await act.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(403);
    }

    [Fact]
    public async Task GerarRodada_ComPartidaAberta_409()
    {
        var amb = Criar(4);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        var act = () => amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        (await act.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(409);
    }

    [Fact]
    public async Task TorneioCompleto_EncerrarGravaColocacaoPodioETimer()
    {
        var amb = Criar(5);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        // Timer criado e contando com o tempo da rodada
        var timer = await amb.Db.Timers.AsNoTracking().SingleAsync();
        timer.ChampionshipId.Should().Be(amb.Ch.Id);
        timer.State.Should().Be(TimerState.Running);
        timer.DurationSeconds.Should().Be(30 * 60);
        timer.Rodada.Should().Be(1);

        var rodadas = (await amb.Db.Championships.AsNoTracking().SingleAsync()).NumeroRodadas!.Value;
        rodadas.Should().Be(3); // 5 jogadores → log2 → 3
        for (var r = 1; r <= rodadas; r++)
        {
            await FecharRodadaAsync(amb, r);
            if (r < rodadas) await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        }

        var tabela = await amb.Torneio.EncerrarAsync(amb.Ch.Id);

        tabela.Should().HaveCount(5);
        tabela.Select(l => l.Posicao).Should().Equal(1, 2, 3, 4, 5);
        tabela.Sum(l => l.Vitorias).Should().Be(rodadas * 2 + rodadas); // 2 partidas + 1 bye por rodada
        var participantes = await amb.Db.ChampionshipParticipants.AsNoTracking().ToListAsync();
        participantes.Should().OnlyContain(p => p.Placement != null);
        participantes.Select(p => p.Placement).Should().OnlyHaveUniqueItems();

        var final = await amb.Db.Championships.AsNoTracking().SingleAsync();
        final.Status.Should().Be(ChampionshipStatus.Finalizado);
        final.PodioJson.Should().Contain("\"lugar\":1").And.Contain(tabela[0].Nome);
        // Parado, não "acabou": Finished faz o widget do admin tocar o alarme em loop
        (await amb.Db.Timers.AsNoTracking().SingleAsync()).State.Should().Be(TimerState.Stopped);
    }

    [Fact]
    public async Task TorneioEncerrado_SomaNaLigaMensal_ComOsPontosDaColocacao()
    {
        var amb = Criar(4);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var rodadas = (await amb.Db.Championships.AsNoTracking().SingleAsync()).NumeroRodadas!.Value;
        for (var r = 1; r <= rodadas; r++)
        {
            await FecharRodadaAsync(amb, r);
            if (r < rodadas) await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        }

        var tabela = await amb.Torneio.EncerrarAsync(amb.Ch.Id);

        var funcionalidades = new FuncionalidadesService(amb.Db, new MemoryCache(new MemoryCacheOptions()));
        var hoje = CardGameStore.Common.Brasilia.Hoje();
        var liga = await new LigaMensalService(amb.Db, funcionalidades).RankingAsync(hoje.Year, hoje.Month);

        liga.Ranking.Select(l => (l.UserId, l.TotalPoints, l.EventsPlayed)).Should().Equal(
            tabela.Select(l => (l.UserId, LigaMensalService.PontosPorColocacao(l.Posicao), 1)));
        liga.Ranking.Select(l => l.TotalPoints).Should().Equal(10, 7, 5, 3);
    }

    [Fact]
    public async Task Desistente_NaoEhEmparelhado_MasContinuaNaTabela()
    {
        var amb = Criar(4);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        await FecharRodadaAsync(amb, 1);

        await amb.Torneio.DesistirAsync(amb.Jogadores[0].Id, amb.Ch.Id);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        var desistente = await amb.Db.ChampionshipParticipants.AsNoTracking().SingleAsync(p => p.UserId == amb.Jogadores[0].Id);
        var rodada2 = await amb.Db.TorneioPartidas.AsNoTracking().Where(p => p.Rodada.Numero == 2).ToListAsync();
        rodada2.Should().NotContain(p => p.ParticipanteAId == desistente.Id || p.ParticipanteBId == desistente.Id);
        rodada2.Should().ContainSingle(p => p.ParticipanteBId == null); // sobraram 3: um bye
        (await amb.Torneio.ClassificacaoAsync(amb.Ch.Id)).Should().Contain(l => l.ParticipanteId == desistente.Id);
    }

    [Fact]
    public async Task MinhaMesa_MostraOponenteEOQueEuLancei()
    {
        var amb = Criar(2);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var partida = await amb.Db.TorneioPartidas.AsNoTracking().Include(p => p.ParticipanteA).SingleAsync();
        await amb.Torneio.LancarResultadoAsync(partida.ParticipanteA.UserId, amb.Ch.Id, partida.Id, ResultadoJogador.Venci);

        var mesa = await amb.Torneio.MinhaMesaAsync(partida.ParticipanteA.UserId, amb.Ch.Id);

        mesa.Mesa.Should().NotBeNull();
        mesa.MeuReport.Should().Be("Venci");
        mesa.ReportOponente.Should().BeNull();
        mesa.Mesa!.ReportA.Should().BeNull(); // o detalhe cru não vaza
    }
}
