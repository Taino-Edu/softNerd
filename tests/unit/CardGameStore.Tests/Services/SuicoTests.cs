// =============================================================================
// SuicoTests.cs — Motor do torneio suíço (Services/Liga/Suico.cs)
// =============================================================================

using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Liga;

namespace CardGameStore.Tests.Services;

public class SuicoTests
{
    private static List<Guid> Jogadores(int n) => Enumerable.Range(0, n).Select(_ => Guid.NewGuid()).ToList();

    [Theory]
    [InlineData(2, 1)]
    [InlineData(8, 3)]
    [InlineData(9, 4)]
    [InlineData(16, 4)]
    [InlineData(17, 5)]
    public void RodadasSugeridas_SeguemLog2(int jogadores, int rodadas) =>
        Suico.RodadasSugeridas(jogadores).Should().Be(rodadas);

    [Fact]
    public void Rodada1_ParDeJogadores_TodoMundoJogaUmaVez()
    {
        var js = Jogadores(8);

        var pares = Suico.Emparelhar(js, js, [], new Random(1));

        pares.Should().HaveCount(4);
        pares.SelectMany(p => new[] { p.A, p.B!.Value }).Should().BeEquivalentTo(js);
    }

    [Fact]
    public void Rodada1_Impar_UmByeSo()
    {
        var js = Jogadores(7);

        var pares = Suico.Emparelhar(js, js, [], new Random(1));

        pares.Should().HaveCount(4);
        pares.Count(p => p.B is null).Should().Be(1);
        pares.SelectMany(p => p.B is null ? new[] { p.A } : new[] { p.A, p.B.Value }).Should().BeEquivalentTo(js);
    }

    [Theory]
    [InlineData(8, 3)]
    [InlineData(11, 4)]
    [InlineData(16, 4)]
    [InlineData(6, 5)] // 6 jogadores, 5 rodadas: todo mundo enfrenta todo mundo, sem repetir
    public void VariasRodadas_NinguemEnfrentaOMesmoDuasVezes(int n, int rodadas)
    {
        var js = Jogadores(n);
        var historico = new List<PartidaSuico>();
        var sorteio = new Random(42);

        for (var r = 0; r < rodadas; r++)
        {
            var pares = Suico.Emparelhar(js, js, historico, sorteio);
            foreach (var p in pares)
                historico.Add(new PartidaSuico(p.A, p.B,
                    p.B is null ? ResultadoPartida.VitoriaA : (ResultadoPartida)sorteio.Next(3)));
        }

        var confrontos = historico.Where(p => p.B is not null)
            .Select(p => p.A.CompareTo(p.B!.Value) < 0 ? (p.A, p.B!.Value) : (p.B!.Value, p.A))
            .ToList();
        confrontos.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void Bye_NaoRepeteEnquantoHouverQuemNaoTeve()
    {
        var js = Jogadores(5);
        var historico = new List<PartidaSuico>();
        var sorteio = new Random(7);

        for (var r = 0; r < 4; r++)
            foreach (var p in Suico.Emparelhar(js, js, historico, sorteio))
                historico.Add(new PartidaSuico(p.A, p.B, p.B is null ? ResultadoPartida.VitoriaA : ResultadoPartida.VitoriaA));

        historico.Where(p => p.B is null).Select(p => p.A).Should().OnlyHaveUniqueItems().And.HaveCount(4);
    }

    [Fact]
    public void Bye_VaiProPiorColocado()
    {
        var js = Jogadores(3);
        var (a, b, c) = (js[0], js[1], js[2]);
        // Rodada 1: A venceu B, C teve bye. Rodada 2: B (0 pts) é o pior e ainda não teve bye.
        var historico = new List<PartidaSuico>
        {
            new(a, b, ResultadoPartida.VitoriaA),
            new(c, null, ResultadoPartida.VitoriaA),
        };

        var pares = Suico.Emparelhar(js, js, historico, new Random(1));

        pares.Single(p => p.B is null).A.Should().Be(b);
    }

    [Fact]
    public void Emparelha_PorPontuacao()
    {
        var js = Jogadores(4);
        var (a, b, c, d) = (js[0], js[1], js[2], js[3]);
        var historico = new List<PartidaSuico>
        {
            new(a, b, ResultadoPartida.VitoriaA),
            new(c, d, ResultadoPartida.VitoriaA),
        };

        var pares = Suico.Emparelhar(js, js, historico, new Random(1));

        // Os dois que venceram (A e C) se enfrentam; os dois que perderam também
        pares.Should().ContainSingle(p => (p.A == a && p.B == c) || (p.A == c && p.B == a));
        pares.Should().ContainSingle(p => (p.A == b && p.B == d) || (p.A == d && p.B == b));
    }

    [Fact]
    public void Classificar_Pontos_E_Desempate_PorOwp()
    {
        var js = Jogadores(4);
        var (a, b, c, d) = (js[0], js[1], js[2], js[3]);
        // R1: A vence B, C vence D. R2: A vence C, B vence D. R3: B vence C, D vence A.
        // A: 2V (6 pts) · B: 2V (6 pts) · C: 1V · D: 1V. Desempate A x B pelo OWP.
        var partidas = new List<PartidaSuico>
        {
            new(a, b, ResultadoPartida.VitoriaA), new(c, d, ResultadoPartida.VitoriaA),
            new(a, c, ResultadoPartida.VitoriaA), new(b, d, ResultadoPartida.VitoriaA),
            new(b, c, ResultadoPartida.VitoriaA), new(d, a, ResultadoPartida.VitoriaA),
        };

        var tabela = Suico.Classificar(js, partidas);

        tabela.Select(l => l.Pontos).Should().Equal(6, 6, 3, 3);
        tabela.Single(l => l.Id == a).Vitorias.Should().Be(2);
        tabela.Single(l => l.Id == a).Derrotas.Should().Be(1);
        // Oponentes de A: B (2/3), C (1/3), D (1/3) → 44,44%. Oponentes de B: A (2/3), D, C → 44,44%. Empata no OWP;
        // aí vai pro OOWP e, se ainda empatar, pelo nº do jogador. A fica na frente.
        tabela[0].Id.Should().Be(a);
        tabela[0].Owp.Should().Be(44.44m);
    }

    [Fact]
    public void Classificar_Empate_ValeUmPonto_E_PartidaAbertaNaoConta()
    {
        var js = Jogadores(2);
        var partidas = new List<PartidaSuico>
        {
            new(js[0], js[1], ResultadoPartida.Empate),
            new(js[0], js[1], null),
        };

        var tabela = Suico.Classificar(js, partidas);

        tabela.Should().OnlyContain(l => l.Pontos == 1 && l.Empates == 1);
    }

    [Fact]
    public void Classificar_ByeNaoEntraNoAproveitamentoDosOponentes()
    {
        var js = Jogadores(3);
        var (a, b, c) = (js[0], js[1], js[2]);
        // B só teve bye e uma derrota pra C: aproveitamento real de B é 0% → piso de 25%.
        var partidas = new List<PartidaSuico>
        {
            new(b, null, ResultadoPartida.VitoriaA),
            new(c, b, ResultadoPartida.VitoriaA),
        };

        var tabela = Suico.Classificar(js, partidas);

        tabela.Single(l => l.Id == c).Owp.Should().Be(25m);
        tabela.Single(l => l.Id == b).Pontos.Should().Be(3);
    }
}
