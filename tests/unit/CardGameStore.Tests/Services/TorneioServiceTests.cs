// =============================================================================
// TorneioServiceTests.cs — Liguinha de ponta a ponta (Services/Liga/TorneioService.cs)
// =============================================================================

using CardGameStore.Configuration;
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
    private sealed record Ambiente(AppDbContext Db, TorneioService Torneio, Championship Ch, List<User> Jogadores,
        FuncionalidadesService Funcionalidades);

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

        var funcionalidades = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        return new(db, new TorneioService(db, hub.Object, NullLogger<TorneioService>.Instance, funcionalidades), ch, users,
            funcionalidades);
    }

    private static async Task<int> InscreverEEntrarTodosAsync(Ambiente amb, int lugares = 24)
    {
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30, lugares);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);
        return amb.Jogadores.Count;
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
    public async Task GerarRodada_TorneioPago_PresenteSemPagar_NaoEPareado()
    {
        var amb = Criar(4, taxaEmCentavos: 1500);
        await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        var agora = DateTime.UtcNow;
        var parts = amb.Jogadores.Select((u, i) => new ChampionshipParticipant
        {
            ChampionshipId = amb.Ch.Id, UserId = u.Id, PlayerNumber = i + 1, CheckInEm = agora,
            // 1 e 2 pagaram; 3 tem vaga firme (inscrito quando era grátis); 4 só tem a cobrança Pix pendente
            EntryFeePaidAt = i < 2 ? agora : null,
            InscricaoExpiraEm = i == 3 ? agora.AddMinutes(30) : null,
        }).ToList();
        amb.Db.ChampionshipParticipants.AddRange(parts);
        await amb.Db.SaveChangesAsync();

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id, 2);

        var jogam = (await amb.Db.TorneioPartidas.AsNoTracking().ToListAsync())
            .SelectMany(p => new[] { (Guid?)p.ParticipanteAId, p.ParticipanteBId }).Where(id => id != null).ToList();
        jogam.Should().BeEquivalentTo(parts.Take(3).Select(p => (Guid?)p.Id));
    }

    [Fact]
    public async Task GerarRodada_SemCheckIn_EntradaVirouPaga_VagaFirmeJoga()
    {
        var amb = Criar(3, taxaEmCentavos: 1500);
        await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 50);
        var agora = DateTime.UtcNow;
        var parts = amb.Jogadores.Select((u, i) => new ChampionshipParticipant
        {
            // ninguém fez check-in; 1 e 2 se inscreveram quando era grátis (vaga firme); 3 está devendo o Pix
            ChampionshipId = amb.Ch.Id, UserId = u.Id, PlayerNumber = i + 1,
            InscricaoExpiraEm = i == 2 ? agora.AddMinutes(30) : null,
        }).ToList();
        amb.Db.ChampionshipParticipants.AddRange(parts);
        await amb.Db.SaveChangesAsync();

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id, 2);

        var jogam = (await amb.Db.TorneioPartidas.AsNoTracking().ToListAsync())
            .SelectMany(p => new[] { (Guid?)p.ParticipanteAId, p.ParticipanteBId }).Where(id => id != null).ToList();
        jogam.Should().BeEquivalentTo(parts.Take(2).Select(p => (Guid?)p.Id));
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

        // Timer criado com o tempo da rodada, PARADO até o organizador começar a rodada
        var timer = await amb.Db.Timers.AsNoTracking().SingleAsync();
        timer.ChampionshipId.Should().Be(amb.Ch.Id);
        timer.State.Should().Be(TimerState.Stopped);
        timer.DurationSeconds.Should().Be(30 * 60);
        await amb.Torneio.ComecarRodadaAsync(amb.Ch.Id);
        timer = await amb.Db.Timers.AsNoTracking().SingleAsync();
        timer.State.Should().Be(TimerState.Running);
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

    // ── Pedidos do Maikon (13/10/2026) ───────────────────────────────────────

    [Fact]
    public async Task SoltarPareamentos_NaoLigaORelogio_SoComecarRodadaLiga()
    {
        var amb = Criar(4);
        await InscreverEEntrarTodosAsync(amb);

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        var timer = await amb.Db.Timers.AsNoTracking().SingleAsync();
        timer.Should().Match<TimerEntity>(t => t.State == TimerState.Stopped && t.StartedAt == null
                                            && t.Rodada == 1 && t.DurationSeconds == 30 * 60);

        await amb.Torneio.ComecarRodadaAsync(amb.Ch.Id);

        timer = await amb.Db.Timers.AsNoTracking().SingleAsync();
        timer.State.Should().Be(TimerState.Running);
        timer.StartedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task ComecarRodada_DuasVezes_409_ENaoReiniciaORelogio()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        await amb.Torneio.ComecarRodadaAsync(amb.Ch.Id);
        var inicio = (await amb.Db.Timers.AsNoTracking().SingleAsync()).StartedAt;

        var acao = () => amb.Torneio.ComecarRodadaAsync(amb.Ch.Id);

        (await acao.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(409);
        (await amb.Db.Timers.AsNoTracking().SingleAsync()).StartedAt.Should().Be(inicio);
    }

    [Fact]
    public async Task ComecarRodada_AntesDeSoltarPareamentos_Recusa()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);

        await FluentActions.Awaiting(() => amb.Torneio.ComecarRodadaAsync(amb.Ch.Id))
            .Should().ThrowAsync<TorneioException>();
    }

    [Fact]
    public async Task Fallback_ChaveDesligada_SoltarPareamentosLigaORelogioNaHora()
    {
        var amb = Criar(2);
        await amb.Funcionalidades.DefinirAsync(Funcionalidades.LiguinhaRelogioSeparado, false, Guid.NewGuid());
        await InscreverEEntrarTodosAsync(amb);

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        (await amb.Db.Timers.AsNoTracking().SingleAsync()).State.Should().Be(TimerState.Running);
    }

    [Fact]
    public async Task Lugares_QuemPassaDaLojaFicaAguardandoMesa_SemBarrarNinguem()
    {
        var amb = Criar(30);                      // 15 mesas de jogo
        await InscreverEEntrarTodosAsync(amb, lugares: 24);   // cabem 12

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesas = (await amb.Torneio.PainelAsync(amb.Ch.Id)).Mesas;

        mesas.Should().HaveCount(15);
        mesas.Where(m => !m.AguardandoMesa).Select(m => m.Mesa).Should().Equal(Enumerable.Range(1, 12));
        mesas.Where(m => m.AguardandoMesa).Select(m => m.Mesa).Should().Equal(13, 14, 15);
    }

    [Fact]
    public async Task Lugares_PadraoE24_EBye_NuncaFicaAguardandoMesa()
    {
        var amb = Criar(3);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);
        foreach (var u in amb.Jogadores) await amb.Torneio.EntrarAsync(u.Id, ch.CodigoEntrada!, null, null);

        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var painel = await amb.Torneio.PainelAsync(amb.Ch.Id);

        painel.Lugares.Should().Be(24);
        painel.Mesas.Should().OnlyContain(m => !m.AguardandoMesa);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(401)]
    public async Task Lugares_ForaDaFaixa_Recusa(int lugares)
    {
        var amb = Criar(2);

        await FluentActions.Awaiting(() => amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30, lugares))
            .Should().ThrowAsync<TorneioException>();
    }

    [Fact]
    public async Task CheckInProprio_InscritoFazComUmToque_SemCodigo()
    {
        var amb = Criar(1);
        await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);
        amb.Db.ChampionshipParticipants.Add(new ChampionshipParticipant
            { ChampionshipId = amb.Ch.Id, UserId = amb.Jogadores[0].Id, PlayerNumber = 1 });
        await amb.Db.SaveChangesAsync();

        await amb.Torneio.CheckInProprioAsync(amb.Jogadores[0].Id, amb.Ch.Id);

        (await amb.Db.ChampionshipParticipants.AsNoTracking().SingleAsync()).CheckInEm.Should().NotBeNull();
    }

    [Fact]
    public async Task CheckInProprio_QuemNaoEstaInscrito_404()
    {
        var amb = Criar(1);
        await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);

        (await FluentActions.Awaiting(() => amb.Torneio.CheckInProprioAsync(amb.Jogadores[0].Id, amb.Ch.Id))
            .Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(404);
    }

    [Fact]
    public async Task CheckInProprio_AntesDeAbrirOCheckIn_Recusa()
    {
        var amb = Criar(1);
        amb.Db.ChampionshipParticipants.Add(new ChampionshipParticipant
            { ChampionshipId = amb.Ch.Id, UserId = amb.Jogadores[0].Id, PlayerNumber = 1 });
        await amb.Db.SaveChangesAsync();

        await FluentActions.Awaiting(() => amb.Torneio.CheckInProprioAsync(amb.Jogadores[0].Id, amb.Ch.Id))
            .Should().ThrowAsync<TorneioException>();
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

    // ── Deck pela tela do torneio (pedido do Maikon, 20/10/2026) ────────────
    // Quem entrou pelo "Estou aqui" ou foi adicionado pelo organizador não tinha onde escolher o deck.

    [Fact]
    public async Task MeuDeck_AntesDeComecar_TrocaLivre()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);

        await amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[0].Id, amb.Ch.Id, null, "Dragapult ex");
        await amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[0].Id, amb.Ch.Id, null, " Gardevoir ex ");

        (await amb.Db.ChampionshipParticipants.AsNoTracking().SingleAsync(p => p.UserId == amb.Jogadores[0].Id))
            .DeckName.Should().Be("Gardevoir ex");
    }

    [Fact]
    public async Task MeuDeck_TorneioComecado_QuemTemDeckNaoTroca_QuemNaoTemEscolheEApareceNaMesa()
    {
        var amb = Criar(2);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);
        await amb.Torneio.EntrarAsync(amb.Jogadores[0].Id, ch.CodigoEntrada!, null, "Lugia");
        await amb.Torneio.EntrarAsync(amb.Jogadores[1].Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        var trocar = () => amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[0].Id, amb.Ch.Id, null, "Dragapult ex");
        (await trocar.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(409);

        await amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[1].Id, amb.Ch.Id, null, "Raging Bolt ex");
        var mesa = (await amb.Torneio.PainelAsync(amb.Ch.Id)).Mesas.Single();
        new[] { mesa.A.Deck, mesa.B!.Deck }.Should().BeEquivalentTo("Lugia", "Raging Bolt ex");
    }

    [Fact]
    public async Task Entrar_DeNovoComOutroDeckDepoisDeComecar_NaoTrocaODeck()
    {
        // Codex no PR #90: o código driblava a trava do meu-deck
        var amb = Criar(2);
        var ch = await amb.Torneio.PrepararAsync(amb.Ch.Id, 1, 30);
        await amb.Torneio.EntrarAsync(amb.Jogadores[0].Id, ch.CodigoEntrada!, null, "Lugia");
        await amb.Torneio.EntrarAsync(amb.Jogadores[1].Id, ch.CodigoEntrada!, null, null);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        await amb.Torneio.EntrarAsync(amb.Jogadores[0].Id, ch.CodigoEntrada!, null, "Dragapult ex");
        await amb.Torneio.EntrarAsync(amb.Jogadores[1].Id, ch.CodigoEntrada!, null, "Raging Bolt ex");

        var mesa = (await amb.Torneio.PainelAsync(amb.Ch.Id)).Mesas.Single();
        new[] { mesa.A.Deck, mesa.B!.Deck }.Should().BeEquivalentTo(["Lugia", "Raging Bolt ex"],
            "quem tinha deck não troca; quem estava sem escolhe e a mesa já mostra");
        (await amb.Db.ChampionshipParticipants.AsNoTracking().Select(p => p.DeckName).ToListAsync())
            .Should().BeEquivalentTo(["Lugia", "Raging Bolt ex"]);
    }

    [Fact]
    public async Task MeuDeck_QuemDesistiu_Recusa()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.DesistirAsync(amb.Jogadores[0].Id, amb.Ch.Id);

        var acao = () => amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[0].Id, amb.Ch.Id, null, "Lugia");

        (await acao.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(409);
    }

    [Fact]
    public async Task MeuDeck_ChaveDesligada_Recusa()
    {
        var amb = Criar(2);
        await amb.Funcionalidades.DefinirAsync(Funcionalidades.LiguinhaEntradaSimples, false, Guid.NewGuid());
        await InscreverEEntrarTodosAsync(amb);

        await FluentActions.Awaiting(() => amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[0].Id, amb.Ch.Id, null, "Lugia"))
            .Should().ThrowAsync<TorneioException>();
    }

    [Fact]
    public async Task MeuDeck_DeckDeOutraConta_Recusa()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        var deckDoOutro = new Deck { UserId = amb.Jogadores[1].Id, Name = "Do outro", Game = "Pokemon" };
        amb.Db.Decks.Add(deckDoOutro);
        await amb.Db.SaveChangesAsync();

        await FluentActions.Awaiting(() => amb.Torneio.TrocarMeuDeckAsync(amb.Jogadores[0].Id, amb.Ch.Id, deckDoOutro.Id, null))
            .Should().ThrowAsync<TorneioException>();
    }

    // ── "Estou pronto" na mesa (pedido do Maikon, 20/10/2026) ────────────────
    // Pokémon: todos com os básicos em campo antes do relógio correr. Quando todas as mesas
    // estão prontas o organizador é avisado e ele mesmo começa a rodada.

    private static async Task<List<TorneioPartida>> MesasDaRodadaAsync(Ambiente amb) =>
        await amb.Db.TorneioPartidas.AsNoTracking().Include(p => p.ParticipanteA).Include(p => p.ParticipanteB)
            .Where(p => p.Rodada.ChampionshipId == amb.Ch.Id).OrderBy(p => p.Mesa).ToListAsync();

    [Fact]
    public async Task Pronto_TodasAsMesasSoQuandoOsDoisLadosDeTodasConfirmam()
    {
        var amb = Criar(4);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesas = await MesasDaRodadaAsync(amb);

        await amb.Torneio.MarcarProntoAsync(mesas[0].ParticipanteA.UserId, amb.Ch.Id, true);
        await amb.Torneio.MarcarProntoAsync(mesas[0].ParticipanteB!.UserId, amb.Ch.Id, true);
        await amb.Torneio.MarcarProntoAsync(mesas[1].ParticipanteA.UserId, amb.Ch.Id, true);
        (await amb.Torneio.TodasProntasAsync(amb.Ch.Id, 1)).Should().BeFalse("falta um jogador da mesa 2");

        await amb.Torneio.MarcarProntoAsync(mesas[1].ParticipanteB!.UserId, amb.Ch.Id, true);

        (await amb.Torneio.TodasProntasAsync(amb.Ch.Id, 1)).Should().BeTrue();
        var painel = await amb.Torneio.PainelAsync(amb.Ch.Id);
        painel.Mesas.Should().OnlyContain(m => m.ProntoA && m.ProntoB);
        (await amb.Db.Timers.AsNoTracking().SingleAsync()).State.Should().Be(TimerState.Stopped,
            "quem solta a rodada é o organizador");
    }

    [Fact]
    public async Task Pronto_Desfazer_VoltaAAguardar()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesa = (await MesasDaRodadaAsync(amb)).Single();
        await amb.Torneio.MarcarProntoAsync(mesa.ParticipanteA.UserId, amb.Ch.Id, true);

        await amb.Torneio.MarcarProntoAsync(mesa.ParticipanteA.UserId, amb.Ch.Id, false);

        (await amb.Db.TorneioPartidas.AsNoTracking().SingleAsync()).ProntoAEm.Should().BeNull();
    }

    [Fact]
    public async Task Pronto_OrganizadorMarcaAMesaDeQuemEstaSemCelular()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesa = (await MesasDaRodadaAsync(amb)).Single();

        await amb.Torneio.MarcarMesaProntaAsync(amb.Ch.Id, mesa.Id, true);

        (await amb.Torneio.TodasProntasAsync(amb.Ch.Id, 1)).Should().BeTrue();
    }

    [Fact]
    public async Task Pronto_OrganizadorComMesaDeRodadaPassada_409()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var antiga = (await MesasDaRodadaAsync(amb)).Single();
        await FecharRodadaAsync(amb, 1);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);

        var acao = () => amb.Torneio.MarcarMesaProntaAsync(amb.Ch.Id, antiga.Id, true);

        (await acao.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(409);
        (await amb.Db.TorneioPartidas.AsNoTracking().SingleAsync(p => p.Id == antiga.Id)).ProntoAEm.Should().BeNull();
    }

    [Fact]
    public async Task Pronto_DepoisQueARodadaComecou_409()
    {
        var amb = Criar(2);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        await amb.Torneio.ComecarRodadaAsync(amb.Ch.Id);
        var mesa = (await MesasDaRodadaAsync(amb)).Single();

        var acao = () => amb.Torneio.MarcarProntoAsync(mesa.ParticipanteA.UserId, amb.Ch.Id, true);

        (await acao.Should().ThrowAsync<TorneioException>()).Which.Status.Should().Be(409);
    }

    [Fact]
    public async Task Pronto_ByeNaoPrecisaENaoTravaOAviso()
    {
        var amb = Criar(3);
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesas = await MesasDaRodadaAsync(amb);
        var bye = mesas.Single(m => m.ParticipanteBId == null);
        var jogo = mesas.Single(m => m.ParticipanteBId != null);

        await FluentActions.Awaiting(() => amb.Torneio.MarcarProntoAsync(bye.ParticipanteA.UserId, amb.Ch.Id, true))
            .Should().ThrowAsync<TorneioException>();
        await amb.Torneio.MarcarMesaProntaAsync(amb.Ch.Id, jogo.Id, true);

        (await amb.Torneio.TodasProntasAsync(amb.Ch.Id, 1)).Should().BeTrue("o bye não monta setup");
    }

    [Fact]
    public async Task Pronto_MesaQueAguardaLugarNaLojaNaoTravaOAviso()
    {
        var amb = Criar(6);                                  // 3 mesas
        await InscreverEEntrarTodosAsync(amb, lugares: 4);   // cabem 2
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesas = await MesasDaRodadaAsync(amb);

        await amb.Torneio.MarcarMesaProntaAsync(amb.Ch.Id, mesas[0].Id, true);
        await amb.Torneio.MarcarMesaProntaAsync(amb.Ch.Id, mesas[1].Id, true);

        (await amb.Torneio.TodasProntasAsync(amb.Ch.Id, 1)).Should().BeTrue("a mesa 3 joga quando uma liberar");
    }

    [Fact]
    public async Task Pronto_ChaveDesligada_Recusa()
    {
        var amb = Criar(2);
        await amb.Funcionalidades.DefinirAsync(Funcionalidades.LiguinhaProntoNaMesa, false, Guid.NewGuid());
        await InscreverEEntrarTodosAsync(amb);
        await amb.Torneio.GerarRodadaAsync(amb.Ch.Id);
        var mesa = (await MesasDaRodadaAsync(amb)).Single();

        await FluentActions.Awaiting(() => amb.Torneio.MarcarProntoAsync(mesa.ParticipanteA.UserId, amb.Ch.Id, true))
            .Should().ThrowAsync<TorneioException>();
        (await amb.Db.TorneioPartidas.AsNoTracking().SingleAsync()).ProntoAEm.Should().BeNull();
    }
}
