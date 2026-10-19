// =============================================================================
// EtapaExternaServiceTests.cs — "Lançar etapa de fora" (Services/Liga/EtapaExternaService.cs)
//
// Etapa jogada fora do sistema vira campeonato encerrado com colocação → Liga Mensal.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Liga;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Tests.Services;

public class EtapaExternaServiceTests
{
    private static readonly Guid AdminId = Guid.NewGuid();

    private static (AppDbContext Db, EtapaExternaService Etapa, LigaMensalService Liga) Criar()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        var funcionalidades = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        return (db, new EtapaExternaService(db), new LigaMensalService(db, funcionalidades));
    }

    private static User Cliente(AppDbContext db, string nome)
    {
        var u = new User { Name = nome, Role = UserRole.Customer };
        db.Users.Add(u);
        db.SaveChanges();
        return u;
    }

    private static EtapaExternaRequest Etapa(DateTime data, params string[] nomes) =>
        new("Liguinha 3ª etapa", data, "Pokemon", nomes.Select(n => new EtapaExternaJogador(n)).ToList());

    [Fact]
    public async Task Simular_LigaAoClienteDeMesmoNome_SemLigarParaAcentoOuMaiuscula_ENaoGrava()
    {
        var (db, etapa, _) = Criar();
        var luan = Cliente(db, "Luan Patrick Camargo");
        Cliente(db, "Bruno Correia");
        Cliente(db, "bruno correia");   // homônimo: não dá pra saber de quem é

        var r = await etapa.SimularAsync(Etapa(new DateTime(2026, 10, 17), "  luan  patrick CAMARGO ", "Bruno Correia", "Benjamin"));

        r.ChampionshipId.Should().BeNull();
        r.Linhas.Select(l => l.Situacao).Should().Equal("existente", "homonimos", "novo");
        r.Linhas[0].UserId.Should().Be(luan.Id);
        r.Linhas.Select(l => l.Pontos).Should().Equal(10, 7, 5);
        (await db.Championships.CountAsync()).Should().Be(0);
        (await db.Users.CountAsync()).Should().Be(3);
    }

    [Fact]
    public async Task Lancar_CriaCampeonatoEncerradoComColocacao_ESomaNaLigaMensal()
    {
        var (db, etapa, liga) = Criar();
        var luan = Cliente(db, "Luan Patrick Camargo");

        var r = await etapa.LancarAsync(Etapa(new DateTime(2026, 10, 17),
            "Luan Patrick Camargo", "Pedro Henrique", "Caique Santiago", "Leonardo Pereira", "Gabriel Restivo"), AdminId);

        var ch = await db.Championships.Include(c => c.Participants).SingleAsync();
        ch.Id.Should().Be(r.ChampionshipId!.Value);
        ch.Status.Should().Be(ChampionshipStatus.Finalizado);
        ch.Participants.OrderBy(p => p.Placement).Select(p => p.Placement).Should().Equal(1, 2, 3, 4, 5);
        ch.Participants.Single(p => p.Placement == 1).UserId.Should().Be(luan.Id);
        (await db.Users.CountAsync()).Should().Be(5, "só cria quem não tinha cadastro");

        var ranking = await liga.RankingAsync(2026, 10);
        ranking.Ranking.Select(l => (l.PlayerName, l.TotalPoints))
            .Should().Equal(("Luan Patrick Camargo", 10), ("Pedro Henrique", 7), ("Caique Santiago", 5),
                            ("Leonardo Pereira", 3), ("Gabriel Restivo", 1));
        ranking.Ranking.Should().OnlyContain(l => l.EventsPlayed == 1);
    }

    [Fact]
    public async Task Lancar_CaiNoMesDoDiaDeBrasilia()
    {
        var (db, etapa, liga) = Criar();

        await etapa.LancarAsync(Etapa(new DateTime(2026, 9, 30), "Ana", "Bia"), AdminId);

        (await liga.RankingAsync(2026, 9)).Ranking.Should().HaveCount(2);
        (await liga.RankingAsync(2026, 10)).Ranking.Should().BeEmpty();
    }

    [Fact]
    public async Task Lancar_MesmaEtapaDuasVezes_Recusa_PraNaoSomarEmDobro()
    {
        var (db, etapa, liga) = Criar();
        await etapa.LancarAsync(Etapa(new DateTime(2026, 10, 17), "Ana", "Bia"), AdminId);

        await FluentActions.Invoking(() => etapa.SimularAsync(Etapa(new DateTime(2026, 10, 17), "Ana", "Bia")))
            .Should().ThrowAsync<TorneioException>().WithMessage("*já foi lançada*");
        await FluentActions.Invoking(() => etapa.LancarAsync(Etapa(new DateTime(2026, 10, 17), "Ana", "Bia"), AdminId))
            .Should().ThrowAsync<TorneioException>();

        (await db.Championships.CountAsync()).Should().Be(1);
        (await liga.RankingAsync(2026, 10)).Ranking.First().TotalPoints.Should().Be(10);
    }

    [Fact]
    public async Task Lancar_MesmoClienteDuasVezes_Recusa_ENaoGravaNada()
    {
        var (db, etapa, _) = Criar();
        Cliente(db, "Ana Souza");

        var acao = () => etapa.LancarAsync(Etapa(new DateTime(2026, 10, 17), "Ana Souza", "Bia", "ana souza"), AdminId);

        await acao.Should().ThrowAsync<TorneioException>().WithMessage("*mais de uma vez*");
        (await db.Championships.CountAsync()).Should().Be(0);
    }

    [Theory]
    [InlineData("")]
    [InlineData("Só um")]
    public async Task Lancar_PoucosJogadores_Recusa(string nomes)
    {
        var (_, etapa, _) = Criar();
        var lista = nomes.Length == 0 ? Array.Empty<string>() : new[] { nomes };

        await FluentActions.Invoking(() => etapa.LancarAsync(Etapa(new DateTime(2026, 10, 17), lista), AdminId))
            .Should().ThrowAsync<TorneioException>();
    }

    [Theory]
    [InlineData(1)]   // amanhã: ainda não foi jogada, não pode dar pontos adiantado
    [InlineData(10)]
    public async Task Lancar_EtapaNoFuturo_Recusa(int dias)
    {
        var (_, etapa, _) = Criar();

        await FluentActions.Invoking(() => etapa.LancarAsync(Etapa(Brasilia.Hoje().AddDays(dias), "Ana", "Bia"), AdminId))
            .Should().ThrowAsync<TorneioException>().WithMessage("*futuro*");
    }

    [Fact]
    public async Task Lancar_EtapaDeHoje_Aceita()
    {
        var (db, etapa, _) = Criar();

        await etapa.LancarAsync(Etapa(Brasilia.Hoje(), "Ana", "Bia"), AdminId);

        (await db.Championships.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Lancar_NovoCadastroPedidoPelaTela_NaoLigaAoClienteDeMesmoNome()
    {
        var (db, etapa, _) = Criar();
        var outro = Cliente(db, "Lucas Tommy");

        var req = new EtapaExternaRequest("Etapa", new DateTime(2026, 10, 17), null,
            [new EtapaExternaJogador("Lucas Tommy", NovoCadastro: true), new EtapaExternaJogador("Ana")]);
        var r = await etapa.LancarAsync(req, AdminId);

        r.Linhas[0].UserId.Should().NotBe(outro.Id);
        (await db.Users.CountAsync(u => u.Name == "Lucas Tommy")).Should().Be(2);
    }

    [Fact]
    public async Task Lancar_ClienteEscolhidoPelaTela_VenceOHomonimo()
    {
        var (db, etapa, _) = Criar();
        Cliente(db, "Bruno Correia");
        var certo = Cliente(db, "Bruno Correia");

        var req = new EtapaExternaRequest("Etapa", new DateTime(2026, 10, 17), null,
            [new EtapaExternaJogador("Bruno Correia", "Lucario", certo.Id), new EtapaExternaJogador("Ana")]);
        await etapa.LancarAsync(req, AdminId);

        var p = await db.ChampionshipParticipants.SingleAsync(x => x.Placement == 1);
        p.UserId.Should().Be(certo.Id);
        p.DeckName.Should().Be("Lucario");
    }
}
