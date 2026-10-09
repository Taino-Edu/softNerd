// =============================================================================
// LigaMensalServiceTests.cs — ranking da Liga Mensal (Services/Liga/LigaMensalService.cs)
//
// Cobre o caminho novo (chave "liga-mensal-por-jogador" ligada) e o fallback
// (desligada), que precisa reproduzir o cálculo de antes da v1.41.0.
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Liga;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Tests.Services;

public class LigaMensalServiceTests
{
    private static readonly Guid AdminId = Guid.NewGuid();

    private sealed class Ambiente
    {
        public required AppDbContext Db { get; init; }
        public required FuncionalidadesService Funcionalidades { get; init; }
        public required LigaMensalService Liga { get; init; }

        public User Jogador(string nome)
        {
            var u = new User { Name = nome, Email = $"{Guid.NewGuid():N}@test.com", PasswordHash = "h", Role = UserRole.Customer };
            Db.Users.Add(u);
            Db.SaveChanges();
            return u;
        }

        /// <param name="inicioUtc">Começo do campeonato, em UTC (como fica no banco).</param>
        public Championship Campeonato(DateTime inicioUtc, ChampionshipStatus status = ChampionshipStatus.Finalizado,
                                       params (User Jogador, int Colocacao, string? Deck)[] resultado)
        {
            var ch = new Championship { Name = "Semanal", Game = "Pokemon", StartDate = inicioUtc, Status = status };
            Db.Championships.Add(ch);
            var numero = 1;
            foreach (var (jogador, colocacao, deck) in resultado)
                Db.ChampionshipParticipants.Add(new ChampionshipParticipant
                {
                    ChampionshipId = ch.Id, UserId = jogador.Id, PlayerNumber = numero++,
                    Placement = colocacao, DeckName = deck,
                });
            Db.SaveChanges();
            return ch;
        }

        public void Manual(int ano, int mes, string nome, int pontos, string? decks = null)
        {
            Db.LigaMensalManualEntries.Add(new LigaMensalManualEntry
            {
                Ano = ano, Mes = mes, PlayerName = nome, TotalPoints = pontos, Decks = decks, CreatedByAdminId = AdminId,
            });
            Db.SaveChanges();
        }
    }

    private static Ambiente Criar(bool porJogador = true)
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();

        var funcionalidades = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        if (!porJogador)
            funcionalidades.DefinirAsync(Funcionalidades.LigaMensalPorJogador, false, AdminId).GetAwaiter().GetResult();

        return new Ambiente { Db = db, Funcionalidades = funcionalidades, Liga = new LigaMensalService(db, funcionalidades) };
    }

    /// <summary>Instante em Brasília (UTC−3, sem horário de verão desde 2019) → UTC.</summary>
    private static DateTime Br(int ano, int mes, int dia, int hora = 19) =>
        new DateTime(ano, mes, dia, hora, 0, 0, DateTimeKind.Utc).AddHours(3);

    // -------------------------------------------------------------------------
    // Pontuação
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(1, 10)]
    [InlineData(2, 7)]
    [InlineData(3, 5)]
    [InlineData(4, 3)]
    [InlineData(5, 1)]
    [InlineData(32, 1)]
    public void PontosPorColocacao_SegueATabelaDaLoja(int colocacao, int pontos) =>
        LigaMensalService.PontosPorColocacao(colocacao).Should().Be(pontos);

    [Fact]
    public async Task Ranking_SomaOsCampeonatosDoMes_EOrdenaPorPontos()
    {
        var amb = Criar();
        var ana = amb.Jogador("Ana");
        var beto = amb.Jogador("Beto");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(ana, 1, "Charizard"), (beto, 2, "Gardevoir")]);
        amb.Campeonato(Br(2026, 10, 10), resultado: [(beto, 1, "Gardevoir"), (ana, 3, "Lugia")]);

        var r = await amb.Liga.RankingAsync(2026, 10);

        r.MesLabel.Should().Be("Outubro de 2026");
        r.Ranking.Select(l => (l.PlayerName, l.TotalPoints, l.EventsPlayed, l.BestPlacement)).Should().Equal(
            ("Beto", 17, 2, 1),
            ("Ana", 15, 2, 1));
        r.Ranking[1].Decks.Should().Equal("Charizard", "Lugia");
    }

    [Fact]
    public async Task Ranking_UsaOMesDeBrasilia_NaoODoServidor()
    {
        var amb = Criar();
        var ana = amb.Jogador("Ana");
        // 31/10 às 22h em Brasília já é 01/11 em UTC — tem que contar em outubro
        amb.Campeonato(Br(2026, 10, 31, hora: 22), resultado: [(ana, 1, null)]);
        // 01/11 às 00h30 em Brasília — novembro
        amb.Campeonato(Br(2026, 11, 1, hora: 0).AddMinutes(30), resultado: [(ana, 2, null)]);

        (await amb.Liga.RankingAsync(2026, 10)).Ranking.Single().TotalPoints.Should().Be(10);
        (await amb.Liga.RankingAsync(2026, 11)).Ranking.Single().TotalPoints.Should().Be(7);
    }

    [Fact]
    public async Task Ranking_EmpateDePontos_DesempataPorEventosEDepoisNome()
    {
        var amb = Criar();
        var carla = amb.Jogador("Carla");
        var bia = amb.Jogador("Bia");
        var davi = amb.Jogador("Davi");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(davi, 2, null), (carla, 1, null)]);  // Davi 7, Carla 10
        amb.Campeonato(Br(2026, 10, 10), resultado: [(bia, 1, null)]);                    // Bia 10
        amb.Campeonato(Br(2026, 10, 17), resultado: [(davi, 4, null)]);                   // Davi 10, 2 eventos

        var r = await amb.Liga.RankingAsync(2026, 10);

        r.Ranking.Select(l => l.PlayerName).Should().Equal("Davi", "Bia", "Carla");
    }

    // -------------------------------------------------------------------------
    // O que mudou na v1.41.0 (chave ligada)
    // -------------------------------------------------------------------------

    [Fact]
    public async Task Ranking_DoisJogadoresComOMesmoNome_CadaUmComOsSeusPontos()
    {
        var amb = Criar();
        var joao1 = amb.Jogador("João Silva");
        var joao2 = amb.Jogador("João Silva");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(joao1, 1, null), (joao2, 2, null)]);

        var r = await amb.Liga.RankingAsync(2026, 10);

        r.Ranking.Should().HaveCount(2);
        r.Ranking.Select(l => l.UserId).Should().BeEquivalentTo([joao1.Id, joao2.Id]);
        r.Ranking.Sum(l => l.TotalPoints).Should().Be(17);
    }

    [Fact]
    public async Task Ranking_CampeonatoCancelado_NaoSoma()
    {
        var amb = Criar();
        var ana = amb.Jogador("Ana");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(ana, 1, null)]);
        amb.Campeonato(Br(2026, 10, 10), ChampionshipStatus.Cancelado, (ana, 1, null));

        var r = await amb.Liga.RankingAsync(2026, 10);

        r.Ranking.Single().Should().Match<LigaMensalRankingDto>(l => l.TotalPoints == 10 && l.EventsPlayed == 1);
    }

    [Fact]
    public async Task Manual_EntraNaLinhaDoJogadorComOMesmoNome_IgnorandoMaiusculasEEspacos()
    {
        var amb = Criar();
        var ana = amb.Jogador("Ana Souza");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(ana, 1, "Charizard")]);
        amb.Manual(2026, 10, "  ana   SOUZA ", 5, "Lugia, Charizard");

        var linha = (await amb.Liga.RankingAsync(2026, 10)).Ranking.Single();

        linha.UserId.Should().Be(ana.Id);
        linha.TotalPoints.Should().Be(15);
        linha.Decks.Should().Equal("Charizard", "Lugia");
    }

    [Fact]
    public async Task Manual_SemJogadorNoSistema_ViraLinhaPropria_EOsDoMesmoNomeSomam()
    {
        var amb = Criar();
        amb.Manual(2026, 10, "Cabral", 10);
        amb.Manual(2026, 10, "cabral", 7);

        var linha = (await amb.Liga.RankingAsync(2026, 10)).Ranking.Single();

        linha.Should().Match<LigaMensalRankingDto>(l =>
            l.PlayerName == "Cabral" && l.TotalPoints == 17 && l.EventsPlayed == 0 && l.BestPlacement == 0);
    }

    [Fact]
    public async Task Manual_ComHomonimosNoSistema_NaoChutaDeQuemE()
    {
        var amb = Criar();
        var joao1 = amb.Jogador("João");
        var joao2 = amb.Jogador("João");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(joao1, 1, null), (joao2, 2, null)]);
        amb.Manual(2026, 10, "João", 3);

        var r = await amb.Liga.RankingAsync(2026, 10);

        r.Ranking.Should().HaveCount(3);
        r.Ranking.Single(l => l.UserId == joao1.Id).TotalPoints.Should().Be(10);
        r.Ranking.Single(l => l.UserId == joao2.Id).TotalPoints.Should().Be(7);
    }

    [Fact]
    public async Task Manual_DeOutroMes_NaoEntra()
    {
        var amb = Criar();
        amb.Manual(2026, 9, "Cabral", 10);

        (await amb.Liga.RankingAsync(2026, 10)).Ranking.Should().BeEmpty();
    }

    // -------------------------------------------------------------------------
    // Fallback (chave desligada) — tem que ser o cálculo de antes, defeitos inclusos
    // -------------------------------------------------------------------------

    [Fact]
    public async Task Fallback_JuntaPorNome_ComoAntes()
    {
        var amb = Criar(porJogador: false);
        var joao1 = amb.Jogador("João Silva");
        var joao2 = amb.Jogador("João Silva");
        amb.Campeonato(Br(2026, 10, 3), resultado: [(joao1, 1, null), (joao2, 2, null)]);

        var r = await amb.Liga.RankingAsync(2026, 10);

        // Defeito conhecido do jeito antigo: o segundo sobrescreve o primeiro
        r.Ranking.Should().ContainSingle();
    }

    [Fact]
    public async Task Fallback_CampeonatoCancelado_Soma_ComoAntes()
    {
        var amb = Criar(porJogador: false);
        var ana = amb.Jogador("Ana");
        amb.Campeonato(Br(2026, 10, 10), ChampionshipStatus.Cancelado, (ana, 1, null));

        (await amb.Liga.RankingAsync(2026, 10)).Ranking.Single().TotalPoints.Should().Be(10);
    }

    [Fact]
    public async Task CaminhoNovoEFallback_DaoOMesmoResultado_NoCasoComum()
    {
        // Sem homônimo e sem cancelado, desligar a chave não pode mudar o ranking
        async Task<List<LigaMensalRankingDto>> Rodar(bool porJogador)
        {
            var amb = Criar(porJogador);
            var ana = amb.Jogador("Ana");
            var beto = amb.Jogador("Beto");
            amb.Campeonato(Br(2026, 10, 3), resultado: [(ana, 1, "Charizard"), (beto, 3, null)]);
            amb.Manual(2026, 10, "Beto", 4, "Gardevoir");
            amb.Manual(2026, 10, "Cabral", 6);
            return (await amb.Liga.RankingAsync(2026, 10)).Ranking;
        }

        var novo = await Rodar(true);
        var antigo = await Rodar(false);

        novo.Select(l => (l.PlayerName, l.TotalPoints, l.EventsPlayed, l.BestPlacement, string.Join(",", l.Decks)))
            .Should().Equal(antigo.Select(l => (l.PlayerName, l.TotalPoints, l.EventsPlayed, l.BestPlacement, string.Join(",", l.Decks))));
    }

    // -------------------------------------------------------------------------
    // Validação, meses e lançamentos manuais
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(2026, 0)]
    [InlineData(2026, 13)]
    [InlineData(0, 10)]
    [InlineData(99999, 10)]
    public async Task Ranking_MesOuAnoInvalido_Recusa400(int ano, int mes)
    {
        var amb = Criar();

        var acao = () => amb.Liga.RankingAsync(ano, mes);

        (await acao.Should().ThrowAsync<LigaMensalException>()).Which.Status.Should().Be(400);
    }

    [Fact]
    public async Task Meses_ListaOsQueTemDados_DoMaisNovo_NoMesDeBrasilia()
    {
        var amb = Criar();
        var ana = amb.Jogador("Ana");
        amb.Campeonato(Br(2026, 8, 31, hora: 22), resultado: [(ana, 1, null)]); // agosto em Brasília
        amb.Manual(2026, 10, "Cabral", 5);
        amb.Manual(2026, 10, "Bia", 5);

        var meses = await amb.Liga.MesesComDadosAsync();

        meses.Select(m => m.MesLabel).Should().Equal("Outubro de 2026", "Agosto de 2026");
    }

    [Fact]
    public async Task Manual_CriarEditarRemover()
    {
        var amb = Criar();
        var req = new SaveLigaMensalManualEntryRequest { Ano = 2026, Mes = 10, PlayerName = "  Cabral ", TotalPoints = 5, Decks = " " };

        var criado = await amb.Liga.CriarManualAsync(req, AdminId);
        criado.PlayerName.Should().Be("Cabral");
        criado.Decks.Should().BeNull();

        var editado = await amb.Liga.EditarManualAsync(criado.Id,
            new SaveLigaMensalManualEntryRequest { Ano = 2026, Mes = 10, PlayerName = "Cabral", TotalPoints = 8 });
        editado.TotalPoints.Should().Be(8);

        await amb.Liga.RemoverManualAsync(criado.Id);
        (await amb.Liga.ListarManuaisAsync(2026, 10)).Should().BeEmpty();
    }

    [Fact]
    public async Task Manual_EditarOuRemoverInexistente_404()
    {
        var amb = Criar();
        var req = new SaveLigaMensalManualEntryRequest { Ano = 2026, Mes = 10, PlayerName = "X" };

        (await FluentActions.Awaiting(() => amb.Liga.EditarManualAsync(Guid.NewGuid(), req))
            .Should().ThrowAsync<LigaMensalException>()).Which.Status.Should().Be(404);
        (await FluentActions.Awaiting(() => amb.Liga.RemoverManualAsync(Guid.NewGuid()))
            .Should().ThrowAsync<LigaMensalException>()).Which.Status.Should().Be(404);
    }

    [Fact]
    public async Task Manual_MesInvalido_NaoGrava()
    {
        var amb = Criar();
        var req = new SaveLigaMensalManualEntryRequest { Ano = 2026, Mes = 13, PlayerName = "X" };

        await FluentActions.Awaiting(() => amb.Liga.CriarManualAsync(req, AdminId))
            .Should().ThrowAsync<LigaMensalException>();
        amb.Db.LigaMensalManualEntries.Should().BeEmpty();
    }
}
