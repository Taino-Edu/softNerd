// =============================================================================
// LigaEstatisticasService.cs — métricas da Liga por semana, mês ou ano (v1.58.0)
//
// Pedido do Maikon (08/10 e 19/10/2026): posição, pontuação, V/E/D, decks mais usados,
// % de vitória por deck, campeões da semana/mês/ano e as informações pra decidir prêmios.
// Tudo calculado na hora, sem tabela nova:
//   - etapas = campeonatos da modalidade Liga (chave "liga-modalidades") com colocação,
//     não cancelados, no período em Brasília (semana seg–dom, mês, ano)
//   - pontos = mesma regra e mesmo ranking da Liga Mensal (LigaMensalService), inclusive
//     os lançamentos manuais (só mês e ano: o manual não tem dia)
//   - V/E/D e % de vitória = partidas do suíço (bye não conta como partida); etapa lançada
//     de fora só tem colocação, então entra nos pontos e nos decks, não no V/E/D
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Liga;

public class LigaEstatisticasDto
{
    public string Periodo { get; init; } = "mes";
    public string Rotulo { get; init; } = string.Empty;
    public DateTime Inicio { get; init; }
    public DateTime Fim { get; init; }
    public LigaResumoDto Resumo { get; init; } = new();
    public List<LigaJogadorStatsDto> Ranking { get; init; } = [];
    public List<LigaEtapaDto> Etapas { get; init; } = [];
    public List<LigaDeckStatsDto> Decks { get; init; } = [];
}

public class LigaResumoDto
{
    public int Etapas { get; init; }
    public int JogadoresUnicos { get; init; }
    public double MediaPorEtapa { get; init; }
    /// <summary>Quem jogou a primeira etapa da Liga dentro do período.</summary>
    public int Novatos { get; init; }
    public int Partidas { get; init; }
    public int MaiorEtapa { get; init; }
}

public class LigaJogadorStatsDto
{
    public int Posicao { get; set; }
    public Guid UserId { get; init; }
    public string Nome { get; init; } = string.Empty;
    public int Pontos { get; init; }
    public int Etapas { get; init; }
    public int Titulos { get; init; }
    public int Top4 { get; init; }
    /// <summary>0 = só tem lançamento manual.</summary>
    public int MelhorColocacao { get; init; }
    public int Vitorias { get; init; }
    public int Empates { get; init; }
    public int Derrotas { get; init; }
    /// <summary>% de vitória nas partidas jogadas (sem bye); null = sem partida registrada.</summary>
    public double? PctVitoria { get; init; }
    public string? DeckPrincipal { get; init; }
    public List<string> Decks { get; init; } = [];
}

public class LigaEtapaDto
{
    public Guid Id { get; init; }
    public string Nome { get; init; } = string.Empty;
    public DateTime Data { get; init; }
    public int Jogadores { get; init; }
    public bool Suico { get; init; }
    public string? Campeao { get; init; }
    public string? DeckCampeao { get; init; }
}

public class LigaDeckStatsDto
{
    public string Deck { get; init; } = string.Empty;
    /// <summary>Quantas vezes foi jogado (uma por jogador por etapa).</summary>
    public int Usos { get; init; }
    public int Jogadores { get; init; }
    public int Titulos { get; init; }
    public int Top4 { get; init; }
    public int Partidas { get; init; }
    public int Vitorias { get; init; }
    public int Empates { get; init; }
    public int Derrotas { get; init; }
    public double? PctVitoria { get; init; }
}

public class LigaEstatisticasService(AppDbContext db, FuncionalidadesService funcionalidades)
{
    public async Task<LigaEstatisticasDto> EstatisticasAsync(string? periodo, int? ano, int? mes, DateTime? dia)
    {
        var hoje = Brasilia.Hoje();
        var p = (periodo ?? "mes").ToLowerInvariant();
        DateTime inicio, fim; string rotulo;
        switch (p)
        {
            case "semana":
            {
                var ref_ = (dia ?? hoje).Date;
                var desdeSegunda = ((int)ref_.DayOfWeek + 6) % 7;
                inicio = ref_.AddDays(-desdeSegunda);
                fim = inicio.AddDays(7);
                rotulo = $"Semana de {inicio:dd/MM} a {fim.AddDays(-1):dd/MM/yyyy}";
                break;
            }
            case "ano":
            {
                var a = ano ?? hoje.Year;
                if (a < 2020 || a > 2100) throw new LigaMensalException("Ano inválido.");
                inicio = new DateTime(a, 1, 1); fim = inicio.AddYears(1);
                rotulo = $"Temporada {a}";
                break;
            }
            case "mes":
            {
                var a = ano ?? hoje.Year; var m = mes ?? hoje.Month;
                if (a < 2020 || a > 2100 || m < 1 || m > 12) throw new LigaMensalException("Mês inválido.");
                inicio = new DateTime(a, m, 1); fim = inicio.AddMonths(1);
                rotulo = LigaMensalService.RotuloDoMes(a, m);
                break;
            }
            default: throw new LigaMensalException("Período deve ser semana, mes ou ano.");
        }
        var inicioUtc = Brasilia.DiaUtc(inicio).InicioUtc;
        var fimUtc = Brasilia.DiaUtc(fim).InicioUtc;

        var soLiga = await funcionalidades.LigadaAsync(Funcionalidades.LigaModalidades);
        // Chave "liga-mensal-por-jogador" desligada = cálculo antigo da Liga Mensal, que também somava
        // campeonato cancelado; as métricas seguem o mesmo pra mostrar os mesmos pontos
        var porJogador = await funcionalidades.LigadaAsync(Funcionalidades.LigaMensalPorJogador);
        var participantes = await db.ChampionshipParticipants.AsNoTracking()
            .Include(x => x.User).Include(x => x.Championship)
            .Where(x => x.Placement != null
                        && (!porJogador || x.Championship.Status != ChampionshipStatus.Cancelado)
                        && x.Championship.StartDate >= inicioUtc && x.Championship.StartDate < fimUtc
                        && (!soLiga || x.Championship.Modalidade == ModalidadeTorneio.Liga))
            .ToListAsync();

        // Lançamento manual não tem dia: entra no mês e no ano, não na semana
        List<LigaMensalManualEntry> manuais = p == "semana" ? [] : await db.LigaMensalManualEntries.AsNoTracking()
            .Where(e => e.Ano == inicio.Year && (p == "ano" || e.Mes == inicio.Month))
            .ToListAsync();

        // Ranking: o mesmo da Liga Mensal (pontos 10/7/5/3/1, mesmo jogador = mesma linha, manual pelo nome),
        // inclusive a volta da chave "liga-mensal-por-jogador" pro cálculo antigo por nome
        var ranking = LigaMensalService.Ordenar(porJogador
            ? LigaMensalService.RankingPorJogador(participantes, manuais)
            : LigaMensalService.RankingLegadoPorNome(participantes, manuais));

        // Partidas do suíço dessas etapas (bye não é partida)
        var etapaIds = participantes.Select(x => x.ChampionshipId).Distinct().ToList();
        var partidas = await db.TorneioPartidas.AsNoTracking()
            .Where(x => etapaIds.Contains(x.Rodada.ChampionshipId) && x.ParticipanteBId != null && x.Resultado != null)
            .Select(x => new
            {
                A = x.ParticipanteA.UserId, B = x.ParticipanteB!.UserId,
                PA = x.ParticipanteAId, PB = x.ParticipanteBId!.Value,
                x.DeckANome, x.DeckBNome, x.Resultado,
            })
            .ToListAsync();

        // Deck de cada inscrição: o da inscrição + os que ele usou nas partidas (o jogador pode trocar de
        // deck no meio do torneio; a partida guarda o deck daquela rodada)
        var decksDaInscricao = participantes.ToDictionary(x => x.Id, x =>
        {
            var s = new HashSet<string>();
            if (ChaveDeck(x.DeckName) is { } k) s.Add(k);
            return s;
        });
        var nomesDoDeck = new Dictionary<string, List<string>>();
        void Nome(string? deck) { if (ChaveDeck(deck) is { } k) (nomesDoDeck.TryGetValue(k, out var l) ? l : nomesDoDeck[k] = []).Add(deck!.Trim()); }
        foreach (var x in participantes) Nome(x.DeckName);
        foreach (var x in partidas)
        {
            if (ChaveDeck(x.DeckANome) is { } ka && decksDaInscricao.TryGetValue(x.PA, out var sa)) sa.Add(ka);
            if (ChaveDeck(x.DeckBNome) is { } kb && decksDaInscricao.TryGetValue(x.PB, out var sb)) sb.Add(kb);
            Nome(x.DeckANome); Nome(x.DeckBNome);
        }

        var vedJogador = new Dictionary<Guid, (int V, int E, int D)>();
        var vedDeck = new Dictionary<string, (int V, int E, int D)>();
        void Somar<T>(Dictionary<T, (int V, int E, int D)> d, T chave, int v, int e, int dr) where T : notnull
        {
            var atual = d.GetValueOrDefault(chave);
            d[chave] = (atual.V + v, atual.E + e, atual.D + dr);
        }
        foreach (var x in partidas)
        {
            var (va, vb) = x.Resultado switch
            {
                ResultadoPartida.VitoriaA => (1, 0),
                ResultadoPartida.VitoriaB => (0, 1),
                _ => (0, 0),
            };
            var empate = x.Resultado == ResultadoPartida.Empate ? 1 : 0;
            Somar(vedJogador, x.A, va, empate, vb);
            Somar(vedJogador, x.B, vb, empate, va);
            if (ChaveDeck(x.DeckANome) is { } da) Somar(vedDeck, da, va, empate, vb);
            if (ChaveDeck(x.DeckBNome) is { } db_) Somar(vedDeck, db_, vb, empate, va);
        }

        static double? Pct(int v, int e, int d) => v + e + d == 0 ? null : Math.Round(100.0 * v / (v + e + d), 1);

        var porUsuario = participantes.GroupBy(x => x.UserId).ToDictionary(g => g.Key, g => g.ToList());
        var linhas = ranking.Select((r, i) =>
        {
            porUsuario.TryGetValue(r.UserId, out var minhas);
            var ved = vedJogador.GetValueOrDefault(r.UserId);
            var deckPrincipal = (minhas ?? []).Where(x => !string.IsNullOrWhiteSpace(x.DeckName))
                .GroupBy(x => ChaveDeck(x.DeckName)!).OrderByDescending(g => g.Count()).Select(g => g.First().DeckName!.Trim())
                .FirstOrDefault();
            return new LigaJogadorStatsDto
            {
                Posicao = i + 1, UserId = r.UserId, Nome = r.PlayerName, Pontos = r.TotalPoints,
                Etapas = r.EventsPlayed, MelhorColocacao = r.BestPlacement, Decks = r.Decks,
                Titulos = minhas?.Count(x => x.Placement == 1) ?? 0,
                Top4 = minhas?.Count(x => x.Placement <= 4) ?? 0,
                Vitorias = ved.V, Empates = ved.E, Derrotas = ved.D, PctVitoria = Pct(ved.V, ved.E, ved.D),
                DeckPrincipal = deckPrincipal,
            };
        }).ToList();

        // Por id (sem rastreamento, cada linha traz a sua cópia do campeonato)
        var etapas = participantes.GroupBy(x => x.ChampionshipId)
            .Select(g =>
            {
                var ch = g.First().Championship;
                var campeao = g.FirstOrDefault(x => x.Placement == 1);
                return new LigaEtapaDto
                {
                    Id = ch.Id, Nome = ch.Name, Data = ch.StartDate, Jogadores = g.Count(),
                    Suico = ch.Formato == FormatoTorneio.Suico,
                    Campeao = campeao?.User?.Name, DeckCampeao = campeao?.DeckName,
                };
            })
            .OrderBy(e => e.Data).ToList();

        // Uso = inscrições que jogaram com o deck (na inscrição ou em alguma partida); título e top 4 pela
        // colocação dessas inscrições; V/E/D pelas partidas jogadas com ele
        var decks = nomesDoDeck.Keys
            .Select(chave =>
            {
                var g = participantes.Where(x => decksDaInscricao[x.Id].Contains(chave)).ToList();
                var ved = vedDeck.GetValueOrDefault(chave);
                // Nome como mais gente escreveu
                var nome = nomesDoDeck[chave].GroupBy(n => n).OrderByDescending(n => n.Count()).First().Key;
                return new LigaDeckStatsDto
                {
                    Deck = nome, Usos = g.Count, Jogadores = g.Select(x => x.UserId).Distinct().Count(),
                    Titulos = g.Count(x => x.Placement == 1), Top4 = g.Count(x => x.Placement <= 4),
                    Partidas = ved.V + ved.E + ved.D, Vitorias = ved.V, Empates = ved.E, Derrotas = ved.D,
                    PctVitoria = Pct(ved.V, ved.E, ved.D),
                };
            })
            .OrderByDescending(d => d.Usos).ThenByDescending(d => d.Titulos).ThenBy(d => d.Deck)
            .ToList();

        // Novato = primeira etapa da Liga de toda a vida dele caiu dentro do período
        var usuarios = participantes.Select(x => x.UserId).Distinct().ToList();
        var primeiras = await db.ChampionshipParticipants.AsNoTracking()
            .Where(x => usuarios.Contains(x.UserId) && x.Placement != null
                        && x.Championship.Status != ChampionshipStatus.Cancelado
                        && (!soLiga || x.Championship.Modalidade == ModalidadeTorneio.Liga))
            .GroupBy(x => x.UserId)
            .Select(g => g.Min(x => x.Championship.StartDate))
            .ToListAsync();

        return new LigaEstatisticasDto
        {
            Periodo = p, Rotulo = rotulo, Inicio = inicio, Fim = fim.AddDays(-1),
            Resumo = new LigaResumoDto
            {
                Etapas = etapas.Count,
                JogadoresUnicos = usuarios.Count,
                MediaPorEtapa = etapas.Count == 0 ? 0 : Math.Round((double)participantes.Count / etapas.Count, 1),
                Novatos = primeiras.Count(d => d >= inicioUtc),
                Partidas = partidas.Count,
                MaiorEtapa = etapas.Count == 0 ? 0 : etapas.Max(e => e.Jogadores),
            },
            Ranking = linhas, Etapas = etapas, Decks = decks,
        };
    }

    /// <summary>"Dragapult ex", " dragapult EX " e "Dragapult  ex" são o mesmo deck.</summary>
    internal static string? ChaveDeck(string? deck) =>
        string.IsNullOrWhiteSpace(deck) ? null : EtapaExternaService.Normalizar(deck);
}
