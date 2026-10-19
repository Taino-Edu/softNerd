// =============================================================================
// LigaEstatisticasServiceTests.cs — métricas da Liga (Services/Liga/LigaEstatisticasService.cs)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Liga;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Tests.Services;

public class LigaEstatisticasServiceTests
{
    private static readonly Guid AdminId = Guid.NewGuid();

    private sealed class Amb
    {
        public required AppDbContext Db { get; init; }
        public required LigaEstatisticasService Stats { get; init; }

        public User Jogador(string nome)
        {
            var u = new User { Name = nome, Role = UserRole.Customer };
            Db.Users.Add(u); Db.SaveChanges();
            return u;
        }

        /// <summary>Etapa encerrada com colocação (ordem = 1º, 2º, ...).</summary>
        public (Championship Ch, List<ChampionshipParticipant> Parts) Etapa(DateTime inicioUtc, params (User U, string? Deck)[] ordem)
        {
            var ch = new Championship { Name = $"Etapa {inicioUtc:dd/MM}", Game = "Pokemon", StartDate = inicioUtc, Status = ChampionshipStatus.Finalizado };
            Db.Championships.Add(ch);
            var parts = ordem.Select((x, i) => new ChampionshipParticipant
            {
                ChampionshipId = ch.Id, UserId = x.U.Id, PlayerNumber = i + 1, Placement = i + 1, DeckName = x.Deck,
            }).ToList();
            Db.ChampionshipParticipants.AddRange(parts);
            Db.SaveChanges();
            return (ch, parts);
        }

        /// <summary>Uma rodada do suíço com as partidas (B null = bye).</summary>
        public void Rodada(Championship ch, params (ChampionshipParticipant A, ChampionshipParticipant? B, ResultadoPartida R)[] mesas)
        {
            ch.Formato = FormatoTorneio.Suico;
            var rodada = new TorneioRodada { ChampionshipId = ch.Id, Numero = 1, Status = StatusRodada.Fechada };
            var n = 1;
            foreach (var (a, b, r) in mesas)
                rodada.Partidas.Add(new TorneioPartida
                {
                    Mesa = n++, ParticipanteAId = a.Id, ParticipanteBId = b?.Id, DeckANome = a.DeckName, DeckBNome = b?.DeckName,
                    Resultado = r, FechadaEm = DateTime.UtcNow,
                });
            Db.TorneioRodadas.Add(rodada);
            Db.SaveChanges();
        }
    }

    private static Amb Criar()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        var funcionalidades = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        return new Amb { Db = db, Stats = new LigaEstatisticasService(db, funcionalidades) };
    }

    /// <summary>Brasília (UTC−3) → UTC.</summary>
    private static DateTime Br(int ano, int mes, int dia, int hora = 14) => new DateTime(ano, mes, dia, hora, 0, 0, DateTimeKind.Utc).AddHours(3);

    [Fact]
    public async Task Mes_RankingComTitulosTop4EDecks_EResumo()
    {
        var a = Criar();
        var ana = a.Jogador("Ana"); var beto = a.Jogador("Beto"); var caio = a.Jogador("Caio");
        a.Etapa(Br(2026, 10, 3), (ana, "Dragapult ex"), (beto, "Gardevoir ex"), (caio, " dragapult EX "));
        a.Etapa(Br(2026, 10, 10), (beto, "Gardevoir ex"), (ana, "Dragapult ex"));

        var r = await a.Stats.EstatisticasAsync("mes", 2026, 10, null);

        r.Ranking.Select(l => (l.Nome, l.Pontos, l.Etapas, l.Titulos, l.Top4)).Should().Equal(
            ("Ana", 17, 2, 1, 2), ("Beto", 17, 2, 1, 2), ("Caio", 5, 1, 0, 1));
        r.Ranking.Select(l => l.Posicao).Should().Equal(1, 2, 3);
        r.Resumo.Etapas.Should().Be(2);
        r.Resumo.JogadoresUnicos.Should().Be(3);
        r.Resumo.MediaPorEtapa.Should().Be(2.5);
        r.Resumo.Novatos.Should().Be(3);
        r.Resumo.MaiorEtapa.Should().Be(3);
        r.Etapas.Select(e => e.Campeao).Should().Equal("Ana", "Beto");
        var dragapult = r.Decks.Single(d => d.Deck == "Dragapult ex");
        (dragapult.Usos, dragapult.Jogadores, dragapult.Titulos).Should().Be((3, 2, 1));
    }

    [Fact]
    public async Task VED_ContaPartidasDoSuico_SemBye_EPorDeck()
    {
        var a = Criar();
        var ana = a.Jogador("Ana"); var beto = a.Jogador("Beto"); var caio = a.Jogador("Caio");
        var (ch, p) = a.Etapa(Br(2026, 10, 3), (ana, "Dragapult ex"), (beto, "Gardevoir ex"), (caio, "Lugia"));
        a.Rodada(ch, (p[0], p[1], ResultadoPartida.VitoriaA), (p[2], null, ResultadoPartida.VitoriaA));

        var r = await a.Stats.EstatisticasAsync("mes", 2026, 10, null);

        var linha = r.Ranking.Single(l => l.Nome == "Ana");
        (linha.Vitorias, linha.Empates, linha.Derrotas, linha.PctVitoria).Should().Be((1, 0, 0, 100.0));
        r.Ranking.Single(l => l.Nome == "Caio").PctVitoria.Should().BeNull("bye não é partida");
        r.Decks.Single(d => d.Deck == "Gardevoir ex").PctVitoria.Should().Be(0);
        r.Resumo.Partidas.Should().Be(1);
    }

    [Fact]
    public async Task Semana_SoSegundaADomingo_SemLancamentoManual()
    {
        var a = Criar();
        var ana = a.Jogador("Ana"); var beto = a.Jogador("Beto");
        a.Etapa(Br(2026, 10, 17), (ana, null), (beto, null));    // sábado
        a.Etapa(Br(2026, 10, 19), (beto, null), (ana, null));    // segunda seguinte
        a.Db.LigaMensalManualEntries.Add(new LigaMensalManualEntry { Ano = 2026, Mes = 10, PlayerName = "Zé", TotalPoints = 50, CreatedByAdminId = AdminId });
        a.Db.SaveChanges();

        var r = await a.Stats.EstatisticasAsync("semana", null, null, new DateTime(2026, 10, 15));

        r.Inicio.Should().Be(new DateTime(2026, 10, 12));
        r.Fim.Should().Be(new DateTime(2026, 10, 18));
        r.Etapas.Should().ContainSingle().Which.Campeao.Should().Be("Ana");
        r.Ranking.Should().NotContain(l => l.Nome == "Zé");
    }

    [Fact]
    public async Task CampeonatoAvulso_NaoEntra()
    {
        var a = Criar();
        var ana = a.Jogador("Ana"); var beto = a.Jogador("Beto");
        a.Etapa(Br(2026, 10, 3), (ana, null), (beto, null));
        var (avulso, _) = a.Etapa(Br(2026, 10, 10), (beto, null), (ana, null));
        avulso.Modalidade = ModalidadeTorneio.Campeonato;
        a.Db.SaveChanges();

        var r = await a.Stats.EstatisticasAsync("mes", 2026, 10, null);

        r.Resumo.Etapas.Should().Be(1);
        r.Ranking.First().Nome.Should().Be("Ana");
    }

    [Fact]
    public async Task Ano_SomaOsMeses_ComLancamentoManual_ENovatoSoNaPrimeiraVez()
    {
        var a = Criar();
        var ana = a.Jogador("Ana"); var beto = a.Jogador("Beto");
        a.Etapa(Br(2025, 12, 6), (beto, null), (ana, null));
        a.Etapa(Br(2026, 3, 7), (ana, null), (beto, null));
        a.Etapa(Br(2026, 10, 3), (ana, null), (beto, null));
        a.Db.LigaMensalManualEntries.Add(new LigaMensalManualEntry { Ano = 2026, Mes = 5, PlayerName = "Beto", TotalPoints = 10, CreatedByAdminId = AdminId });
        a.Db.SaveChanges();

        var r = await a.Stats.EstatisticasAsync("ano", 2026, null, null);

        r.Ranking.Select(l => (l.Nome, l.Pontos)).Should().Equal(("Beto", 24), ("Ana", 20));
        r.Resumo.Novatos.Should().Be(0, "os dois já jogavam em 2025");
    }

    [Theory]
    [InlineData("dia", null)]
    [InlineData("mes", 13)]
    public async Task PeriodoInvalido_Recusa(string periodo, int? mes)
    {
        var a = Criar();
        await FluentActions.Invoking(() => a.Stats.EstatisticasAsync(periodo, 2026, mes, null))
            .Should().ThrowAsync<LigaMensalException>();
    }
}
