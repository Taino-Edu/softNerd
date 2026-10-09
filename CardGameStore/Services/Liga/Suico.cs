// =============================================================================
// Suico.cs — Motor do torneio suíço (puro: sem banco, sem relógio)
//
// Pontos 3/1/0. Bye vale vitória e vai pro pior colocado que ainda não teve bye.
// Rodada 1 sorteada; depois, quem tem a mesma pontuação joga entre si, sem
// repetir oponente (backtracking; se não houver saída, aceita a revanche).
// Desempate padrão Play! Pokémon: OWP, depois OOWP, com piso de 25%.
// Bye não entra no aproveitamento de ninguém (não é oponente de verdade).
// =============================================================================

using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.Services.Liga;

/// <summary>Partida já criada. B nulo = bye. Resultado nulo = ainda não fechou.</summary>
public sealed record PartidaSuico(Guid A, Guid? B, ResultadoPartida? Resultado);

/// <summary>Par de uma rodada nova. B nulo = bye.</summary>
public sealed record ParSuico(Guid A, Guid? B);

public sealed record LinhaClassificacao(
    Guid Id, int Posicao, int Pontos, int Vitorias, int Empates, int Derrotas,
    decimal Owp, decimal Oowp);

public static class Suico
{
    public const int PontosVitoria = 3;
    public const int PontosEmpate  = 1;
    private const decimal PisoAproveitamento = 0.25m;
    private const int LimiteTentativas = 200_000;

    /// <summary>Rodadas sugeridas: o suficiente pra sobrar um invicto (log2 dos jogadores).</summary>
    public static int RodadasSugeridas(int jogadores) =>
        jogadores < 2 ? 0 : (int)Math.Ceiling(Math.Log2(jogadores));

    // =========================================================================
    // CLASSIFICAÇÃO
    // =========================================================================

    /// <param name="participantes">Todos os jogadores, na ordem de desempate final (nº do jogador).</param>
    /// <param name="partidas">Partidas de todas as rodadas; as sem resultado são ignoradas.</param>
    public static List<LinhaClassificacao> Classificar(IReadOnlyList<Guid> participantes, IEnumerable<PartidaSuico> partidas)
    {
        var fechadas = partidas.Where(p => p.Resultado is not null).ToList();
        var stats = participantes.ToDictionary(id => id, _ => new Acumulado());

        foreach (var p in fechadas)
        {
            if (!stats.TryGetValue(p.A, out var a)) continue;
            if (p.B is null) { a.Pontos += PontosVitoria; a.Vitorias++; a.Byes++; continue; }
            if (!stats.TryGetValue(p.B.Value, out var b)) continue;

            a.Oponentes.Add(p.B.Value);
            b.Oponentes.Add(p.A);
            switch (p.Resultado)
            {
                case ResultadoPartida.VitoriaA: a.Vitorias++; b.Derrotas++; a.Pontos += PontosVitoria; break;
                case ResultadoPartida.VitoriaB: b.Vitorias++; a.Derrotas++; b.Pontos += PontosVitoria; break;
                default:                        a.Empates++;  b.Empates++;  a.Pontos += PontosEmpate; b.Pontos += PontosEmpate; break;
            }
        }

        decimal Aproveitamento(Guid id)
        {
            var s = stats[id];
            var jogos = s.Vitorias - s.Byes + s.Empates + s.Derrotas;
            if (jogos == 0) return PisoAproveitamento;
            var pct = (s.Vitorias - s.Byes + s.Empates * 0.5m) / jogos;
            return Math.Max(PisoAproveitamento, pct);
        }

        var owp = participantes.ToDictionary(id => id, id =>
            stats[id].Oponentes.Count == 0 ? 0m : stats[id].Oponentes.Average(Aproveitamento));
        var oowp = participantes.ToDictionary(id => id, id =>
            stats[id].Oponentes.Count == 0 ? 0m : stats[id].Oponentes.Average(o => owp[o]));

        var ordem = participantes.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i);
        return participantes
            .OrderByDescending(id => stats[id].Pontos)
            .ThenByDescending(id => owp[id])
            .ThenByDescending(id => oowp[id])
            .ThenBy(id => ordem[id])
            .Select((id, i) => new LinhaClassificacao(
                id, i + 1, stats[id].Pontos, stats[id].Vitorias, stats[id].Empates, stats[id].Derrotas,
                Math.Round(owp[id] * 100, 2), Math.Round(oowp[id] * 100, 2)))
            .ToList();
    }

    // =========================================================================
    // EMPARELHAMENTO
    // =========================================================================

    /// <param name="ativos">Quem joga a próxima rodada (check-in feito, não desistiu), na ordem do nº do jogador.</param>
    /// <param name="todos">Todos os participantes (desistentes contam pros pontos e pro histórico).</param>
    /// <param name="historico">Partidas das rodadas anteriores.</param>
    public static List<ParSuico> Emparelhar(
        IReadOnlyList<Guid> ativos, IReadOnlyList<Guid> todos, IReadOnlyCollection<PartidaSuico> historico, Random sorteio)
    {
        if (ativos.Count == 0) return [];
        if (ativos.Count == 1) return [new ParSuico(ativos[0], null)];

        var jaJogaram = new HashSet<(Guid, Guid)>();
        var tiveramBye = new HashSet<Guid>();
        foreach (var p in historico)
        {
            if (p.B is null) { tiveramBye.Add(p.A); continue; }
            jaJogaram.Add((p.A, p.B.Value));
            jaJogaram.Add((p.B.Value, p.A));
        }

        // Ordem de emparelhamento: pontuação (sorteio dentro do mesmo grupo de pontos)
        var pontos = Classificar(todos, historico).ToDictionary(l => l.Id, l => l.Pontos);
        var ordenados = ativos
            .Select(id => (id, chave: sorteio.Next()))
            .OrderByDescending(x => pontos.GetValueOrDefault(x.id))
            .ThenBy(x => x.chave)
            .Select(x => x.id)
            .ToList();

        // Bye: do pior pro melhor. Prioridade: bye inédito sem revanche > bye inédito com revanche >
        // bye repetido sem revanche > o resto. Repetir bye pesa mais que repetir oponente.
        var porBaixo = ordenados.AsEnumerable().Reverse().ToList();
        var gruposBye = ordenados.Count % 2 == 0
            ? new List<List<Guid?>> { new() { null } }
            : new List<List<Guid?>>
              {
                  porBaixo.Where(id => !tiveramBye.Contains(id)).Select(id => (Guid?)id).ToList(),
                  porBaixo.Where(id =>  tiveramBye.Contains(id)).Select(id => (Guid?)id).ToList(),
              };

        foreach (var candidatosBye in gruposBye)
        foreach (var permitirRevanche in new[] { false, true })
        {
            foreach (var bye in candidatosBye)
            {
                var resto = ordenados.Where(id => id != bye).ToList();
                var tentativas = 0;
                var pares = EmparelharGrupo(resto, jaJogaram, permitirRevanche, ref tentativas);
                if (pares is null) continue;
                if (bye is not null) pares.Add(new ParSuico(bye.Value, null));
                return pares;
            }
        }

        // Inalcançável na prática (com revanche liberada sempre há solução), mas não trava o torneio
        var fallback = new List<ParSuico>();
        for (var i = 0; i + 1 < ordenados.Count; i += 2) fallback.Add(new ParSuico(ordenados[i], ordenados[i + 1]));
        if (ordenados.Count % 2 == 1) fallback.Add(new ParSuico(ordenados[^1], null));
        return fallback;
    }

    /// <summary>Backtracking: o primeiro da lista pega o adversário mais próximo em pontos que ainda não enfrentou.</summary>
    private static List<ParSuico>? EmparelharGrupo(
        List<Guid> restantes, HashSet<(Guid, Guid)> jaJogaram, bool permitirRevanche, ref int tentativas)
    {
        if (restantes.Count == 0) return [];
        if (++tentativas > LimiteTentativas) return null;

        var primeiro = restantes[0];
        for (var i = 1; i < restantes.Count; i++)
        {
            var oponente = restantes[i];
            if (!permitirRevanche && jaJogaram.Contains((primeiro, oponente))) continue;

            var proximos = new List<Guid>(restantes.Count - 2);
            for (var j = 1; j < restantes.Count; j++) if (j != i) proximos.Add(restantes[j]);

            var resto = EmparelharGrupo(proximos, jaJogaram, permitirRevanche, ref tentativas);
            if (resto is null) continue;
            resto.Insert(0, new ParSuico(primeiro, oponente));
            return resto;
        }
        return null;
    }

    private sealed class Acumulado
    {
        public int Pontos, Vitorias, Empates, Derrotas, Byes;
        public List<Guid> Oponentes { get; } = [];
    }
}
