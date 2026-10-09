// =============================================================================
// TorneioService.cs — Liguinha: preparar, check-in, rodadas, resultados, encerrar
//
// Camada em cima do campeonato (docs/liguinha.md). Inscrição e pagamento seguem
// no ChampionshipController; aqui entram rodadas e partidas. Ao encerrar, a
// classificação vira Placement + pódio e a Liga Mensal soma como sempre.
//
// Concorrência (mesma linha do Pix/crediário):
//   - gerar rodada: índice único (championship_id, numero) → dois cliques, uma rodada
//   - lançar resultado: ExecuteUpdate condicionado a "ainda aberta" → dois reports
//     simultâneos não se sobrescrevem, e a partida fecha uma vez só
// =============================================================================

using System.Security.Cryptography;
using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Liga;

/// <summary>Regra do torneio violada — vira 400/404/409 com a mensagem pro usuário.</summary>
public class TorneioException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>Resultado lançado pelo jogador, do ponto de vista dele.</summary>
[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
public enum ResultadoJogador { Venci, Perdi, Empatei }

public class TorneioService
{
    // Sem 0/O/1/I/L: código lido em voz alta e digitado no celular
    private const string AlfabetoCodigo = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private readonly AppDbContext _db;
    private readonly IHubContext<TorneioHub> _hub;
    private readonly ILogger<TorneioService> _logger;

    public TorneioService(AppDbContext db, IHubContext<TorneioHub> hub, ILogger<TorneioService> logger)
    {
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    // =========================================================================
    // ORGANIZADOR
    // =========================================================================

    /// <summary>Liga o modo suíço e gera o código de entrada. Pode ser chamado de novo pra mudar a configuração.</summary>
    public async Task<Championship> PrepararAsync(Guid championshipId, int melhorDe, int minutosRodada)
    {
        if (melhorDe is not (1 or 3)) throw new TorneioException("Melhor de 1 ou de 3.");
        if (minutosRodada is < 5 or > 180) throw new TorneioException("Tempo de rodada entre 5 e 180 minutos.");

        var ch = await CampeonatoAsync(championshipId);
        if (ch.Status is ChampionshipStatus.Finalizado or ChampionshipStatus.Cancelado)
            throw new TorneioException("Campeonato encerrado.");

        ch.Formato = FormatoTorneio.Suico;
        ch.MelhorDe = melhorDe;
        ch.MinutosRodada = minutosRodada;
        ch.CodigoEntrada ??= await NovoCodigoAsync();
        await _db.SaveChangesAsync();
        await AvisarAsync(championshipId, "checkin");
        return ch;
    }

    /// <summary>Troca o código (se vazou). Quem já fez check-in continua dentro.</summary>
    public async Task<string> NovoCodigoDeEntradaAsync(Guid championshipId)
    {
        var ch = await CampeonatoAsync(championshipId);
        ch.CodigoEntrada = await NovoCodigoAsync();
        await _db.SaveChangesAsync();
        return ch.CodigoEntrada;
    }

    /// <summary>Organizador marca/desmarca o check-in de alguém (jogador sem celular).</summary>
    public async Task CheckInManualAsync(Guid championshipId, Guid participantId, bool presente)
    {
        var p = await _db.ChampionshipParticipants
            .FirstOrDefaultAsync(x => x.Id == participantId && x.ChampionshipId == championshipId)
            ?? throw new TorneioException("Participante não encontrado.", 404);
        p.CheckInEm = presente ? (p.CheckInEm ?? DateTime.UtcNow) : null;
        await _db.SaveChangesAsync();
        await AvisarAsync(championshipId, "checkin");
    }

    /// <summary>
    /// Gera a próxima rodada (a primeira também). Exige a rodada anterior toda fechada.
    /// Joga quem fez check-in; se ninguém fez, todos os inscritos com vaga valendo.
    /// </summary>
    public async Task<TorneioRodada> GerarRodadaAsync(Guid championshipId, int? numeroRodadas = null)
    {
        var ch = await CampeonatoAsync(championshipId);
        if (ch.Formato != FormatoTorneio.Suico) throw new TorneioException("Prepare o torneio antes (formato suíço).");
        if (ch.Status is ChampionshipStatus.Finalizado or ChampionshipStatus.Cancelado)
            throw new TorneioException("Campeonato encerrado.");

        if (ch.RodadaAtual > 0)
        {
            var abertas = await _db.TorneioPartidas
                .CountAsync(p => p.Rodada.ChampionshipId == championshipId
                              && p.Rodada.Numero == ch.RodadaAtual && p.Resultado == null);
            if (abertas > 0)
                throw new TorneioException($"Ainda há {abertas} partida(s) sem resultado na rodada {ch.RodadaAtual}.", 409);
        }

        var participantes = await ParticipantesQueJogamAsync(ch);
        var ativos = participantes.Where(p => p.DesistiuNaRodada is null).ToList();
        if (ativos.Count < 2) throw new TorneioException("São precisos pelo menos 2 jogadores presentes.");

        var historico = await HistoricoAsync(championshipId);
        var todos = participantes.OrderBy(p => p.PlayerNumber).Select(p => p.Id).ToList();
        var pares = Suico.Emparelhar(
            ativos.OrderBy(p => p.PlayerNumber).Select(p => p.Id).ToList(), todos, historico, Random.Shared);

        var porId = participantes.ToDictionary(p => p.Id);
        var numero = ch.RodadaAtual + 1;
        var agora = DateTime.UtcNow;
        var rodada = new TorneioRodada { ChampionshipId = championshipId, Numero = numero, IniciadaEm = agora };
        var mesa = 1;
        foreach (var par in pares.OrderBy(p => p.B is null ? 1 : 0))
        {
            var a = porId[par.A];
            var b = par.B is null ? null : porId[par.B.Value];
            rodada.Partidas.Add(new TorneioPartida
            {
                Mesa = mesa++,
                ParticipanteAId = a.Id, DeckAId = a.DeckId, DeckANome = a.DeckName,
                ParticipanteBId = b?.Id, DeckBId = b?.DeckId, DeckBNome = b?.DeckName,
                // Bye: A ganha sem jogar
                Resultado = b is null ? ResultadoPartida.VitoriaA : null,
                FechadaEm = b is null ? agora : null,
            });
        }

        _db.TorneioRodadas.Add(rodada);
        if (numero == 1)
        {
            ch.NumeroRodadas = numeroRodadas ?? ch.NumeroRodadas ?? Suico.RodadasSugeridas(ativos.Count);
            ch.Status = ChampionshipStatus.EmAndamento;
        }
        else if (numeroRodadas is not null) ch.NumeroRodadas = numeroRodadas;
        ch.RodadaAtual = numero;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            // Índice único (championship_id, numero): outro clique gerou essa rodada primeiro
            _logger.LogInformation(ex, "Rodada {Numero} do campeonato {Id} já gerada por outra requisição.", numero, championshipId);
            throw new TorneioException("Essa rodada acabou de ser gerada. Atualize a tela.", 409);
        }

        await ReiniciarTimerAsync(ch, numero);
        await AvisarAsync(championshipId, "rodada");
        return rodada;
    }

    /// <summary>Organizador define ou corrige o resultado (vale até o torneio encerrar).</summary>
    public async Task ResolverAsync(Guid championshipId, Guid partidaId, ResultadoPartida resultado, Guid adminId,
        int? vitoriasA = null, int? vitoriasB = null)
    {
        var partida = await PartidaAsync(championshipId, partidaId);
        if (partida.EhBye) throw new TorneioException("Bye não tem resultado pra mudar.");
        var ch = await CampeonatoAsync(championshipId);
        if (ch.Status == ChampionshipStatus.Finalizado) throw new TorneioException("Torneio encerrado.");

        partida.Resultado = resultado;
        partida.ResolvidoPorAdminId = adminId;
        partida.FechadaEm ??= DateTime.UtcNow;
        if (vitoriasA is not null) partida.VitoriasA = vitoriasA.Value;
        if (vitoriasB is not null) partida.VitoriasB = vitoriasB.Value;
        await _db.SaveChangesAsync();

        await FecharRodadaSeCompletaAsync(partida.RodadaId);
        await AvisarAsync(championshipId, "partida");
    }

    /// <summary>Desistência: sai das próximas rodadas, mas continua contando no desempate de quem jogou com ele.</summary>
    public async Task DesistenciaAsync(Guid championshipId, Guid participantId)
    {
        var ch = await CampeonatoAsync(championshipId);
        var p = await _db.ChampionshipParticipants
            .FirstOrDefaultAsync(x => x.Id == participantId && x.ChampionshipId == championshipId)
            ?? throw new TorneioException("Participante não encontrado.", 404);
        p.DesistiuNaRodada ??= Math.Max(ch.RodadaAtual, 1);
        await _db.SaveChangesAsync();
        await AvisarAsync(championshipId, "checkin");
    }

    /// <summary>
    /// Encerra: classificação final vira Placement (e pódio), status Finalizado.
    /// A Liga Mensal lê o Placement — nada mais a fazer pra ela.
    /// </summary>
    public async Task<List<LinhaTabela>> EncerrarAsync(Guid championshipId)
    {
        var ch = await CampeonatoAsync(championshipId);
        if (ch.RodadaAtual == 0) throw new TorneioException("Nenhuma rodada foi jogada.");
        var abertas = await _db.TorneioPartidas.CountAsync(p => p.Rodada.ChampionshipId == championshipId && p.Resultado == null);
        if (abertas > 0) throw new TorneioException($"Ainda há {abertas} partida(s) sem resultado.", 409);

        var tabela = await ClassificacaoAsync(championshipId);
        var jogaram = tabela.Select(l => l.ParticipanteId).ToHashSet();
        var participantes = await _db.ChampionshipParticipants.Where(p => p.ChampionshipId == championshipId).ToListAsync();
        foreach (var p in participantes)
            if (jogaram.Contains(p.Id)) p.Placement = tabela.First(l => l.ParticipanteId == p.Id).Posicao;

        ch.PodioJson = JsonSerializer.Serialize(
            tabela.Take(3).Select(l => new { lugar = l.Posicao, nome = l.Nome }));
        ch.Status = ChampionshipStatus.Finalizado;
        ch.EndDate ??= DateTime.UtcNow;

        // Timer só PARA. "Finished" é "o tempo acabou" e o widget do admin toca o alarme em
        // loop até alguém silenciar — encerrar o torneio deixava todas as telas apitando.
        var timer = await _db.Timers.FirstOrDefaultAsync(t => t.ChampionshipId == championshipId);
        if (timer is not null)
        {
            timer.State = TimerState.Stopped;
            timer.StartedAt = null;
            timer.PausedRemaining = null;
            timer.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        await AvisarAsync(championshipId, "encerrado");
        return tabela;
    }

    // =========================================================================
    // JOGADOR
    // =========================================================================

    /// <summary>
    /// Check-in pelo código. Já inscrito: marca presença e troca o deck se mandou outro.
    /// Não inscrito: inscreve na hora se for gratuito e houver vaga; pago, manda pagar pelo site.
    /// </summary>
    public async Task<Championship> EntrarAsync(Guid userId, string codigo, Guid? deckId, string? deckNome)
    {
        codigo = (codigo ?? "").Trim().ToUpperInvariant();
        var ch = await _db.Championships.FirstOrDefaultAsync(c => c.CodigoEntrada == codigo)
            ?? throw new TorneioException("Código não encontrado. Confira com o organizador.", 404);
        if (ch.Status is ChampionshipStatus.Finalizado or ChampionshipStatus.Cancelado)
            throw new TorneioException("Esse torneio já foi encerrado.");

        if (deckId is not null)
        {
            var deck = await _db.Decks.FirstOrDefaultAsync(d => d.Id == deckId && d.UserId == userId)
                ?? throw new TorneioException("Deck não encontrado na sua conta.");
            deckNome = deck.Name;
        }
        deckNome = string.IsNullOrWhiteSpace(deckNome) ? null : deckNome.Trim()[..Math.Min(deckNome.Trim().Length, 200)];

        var p = await _db.ChampionshipParticipants.FirstOrDefaultAsync(x => x.ChampionshipId == ch.Id && x.UserId == userId);
        if (p is null)
        {
            if (ch.EntryFeeInCents > 0)
                throw new TorneioException("Esse torneio tem inscrição paga. Inscreva-se e pague pela página do campeonato primeiro.", 402);
            if (ch.MaxParticipants is int max)
            {
                var vagas = await _db.ChampionshipParticipants.CountAsync(x => x.ChampionshipId == ch.Id);
                if (vagas >= max) throw new TorneioException("O torneio está lotado.");
            }
            var ultimo = await _db.ChampionshipParticipants.Where(x => x.ChampionshipId == ch.Id)
                .Select(x => (int?)x.PlayerNumber).MaxAsync();
            p = new ChampionshipParticipant
            {
                ChampionshipId = ch.Id,
                UserId = userId,
                PlayerNumber = (ultimo ?? 0) + 1,
            };
            _db.ChampionshipParticipants.Add(p);
        }
        else if (ch.EntryFeeInCents > 0 && p.EntryFeePaidAt is null)
        {
            throw new TorneioException("Sua inscrição ainda não está paga. Pague pela página do campeonato ou no balcão.", 402);
        }

        if (p.DesistiuNaRodada is not null) throw new TorneioException("Você desistiu deste torneio. Fale com o organizador.");
        if (deckNome is not null) { p.DeckId = deckId; p.DeckName = deckNome; }
        p.CheckInEm ??= DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await AvisarAsync(ch.Id, "checkin");
        return ch;
    }

    /// <summary>Jogador lança o próprio resultado. Se o oponente já lançou o mesmo, a partida fecha.</summary>
    public async Task LancarResultadoAsync(Guid userId, Guid championshipId, Guid partidaId, ResultadoJogador meu)
    {
        var partida = await _db.TorneioPartidas
            .Include(p => p.ParticipanteA).Include(p => p.ParticipanteB).Include(p => p.Rodada)
            .FirstOrDefaultAsync(p => p.Id == partidaId && p.Rodada.ChampionshipId == championshipId)
            ?? throw new TorneioException("Partida não encontrada.", 404);

        var souA = partida.ParticipanteA.UserId == userId;
        var souB = partida.ParticipanteB?.UserId == userId;
        if (!souA && !souB) throw new TorneioException("Essa partida não é sua.", 403);
        if (partida.Resultado is not null) throw new TorneioException("Essa partida já está fechada. Se tiver erro, fale com o organizador.", 409);

        // Converte "venci/perdi" pro ponto de vista do jogador A
        var resultado = (meu, souA) switch
        {
            (ResultadoJogador.Empatei, _)    => ResultadoPartida.Empate,
            (ResultadoJogador.Venci, true)   => ResultadoPartida.VitoriaA,
            (ResultadoJogador.Venci, false)  => ResultadoPartida.VitoriaB,
            (ResultadoJogador.Perdi, true)   => ResultadoPartida.VitoriaB,
            (ResultadoJogador.Perdi, false)  => ResultadoPartida.VitoriaA,
            _ => throw new TorneioException("Resultado inválido."),
        };

        var gravou = souA
            ? await _db.TorneioPartidas.Where(p => p.Id == partidaId && p.Resultado == null)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.ReportA, resultado))
            : await _db.TorneioPartidas.Where(p => p.Id == partidaId && p.Resultado == null)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.ReportB, resultado));
        if (gravou == 0) throw new TorneioException("Essa partida acabou de ser fechada.", 409);

        // Fecha só se os dois lançaram a mesma coisa — e só uma vez, mesmo com os dois chegando juntos
        var agora = DateTime.UtcNow;
        var fechou = await _db.TorneioPartidas
            .Where(p => p.Id == partidaId && p.Resultado == null && p.ReportA != null && p.ReportA == p.ReportB)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Resultado, p => p.ReportA)
                .SetProperty(p => p.FechadaEm, agora));

        if (fechou > 0) await FecharRodadaSeCompletaAsync(partida.RodadaId);
        await AvisarAsync(championshipId, "partida");
    }

    /// <summary>O próprio jogador sai do torneio.</summary>
    public async Task DesistirAsync(Guid userId, Guid championshipId)
    {
        var p = await _db.ChampionshipParticipants.FirstOrDefaultAsync(x => x.ChampionshipId == championshipId && x.UserId == userId)
            ?? throw new TorneioException("Você não está neste torneio.", 404);
        await DesistenciaAsync(championshipId, p.Id);
    }

    // =========================================================================
    // CONSULTAS
    // =========================================================================

    public async Task<List<LinhaTabela>> ClassificacaoAsync(Guid championshipId)
    {
        var participantes = await _db.ChampionshipParticipants
            .Where(p => p.ChampionshipId == championshipId)
            .Select(p => new { p.Id, p.PlayerNumber, p.User.Name, p.UserId, p.DesistiuNaRodada, p.DeckName })
            .ToListAsync();
        var historico = await HistoricoAsync(championshipId);

        // Só aparece na tabela quem jogou pelo menos uma partida
        var jogaram = historico.SelectMany(h => h.B is null ? new[] { h.A } : new[] { h.A, h.B.Value }).ToHashSet();
        var ordem = participantes.Where(p => jogaram.Contains(p.Id)).OrderBy(p => p.PlayerNumber).ToList();
        var porId = ordem.ToDictionary(p => p.Id);

        return Suico.Classificar(ordem.Select(p => p.Id).ToList(), historico)
            .Select(l => new LinhaTabela(
                l.Posicao, l.Id, porId[l.Id].UserId, porId[l.Id].Name, porId[l.Id].DeckName,
                l.Pontos, l.Vitorias, l.Empates, l.Derrotas, l.Owp, l.Oowp, porId[l.Id].DesistiuNaRodada))
            .ToList();
    }

    public async Task<List<MesaDto>> MesasAsync(Guid championshipId, int numero, bool comReports)
    {
        var partidas = await _db.TorneioPartidas
            .Where(p => p.Rodada.ChampionshipId == championshipId && p.Rodada.Numero == numero)
            .OrderBy(p => p.Mesa)
            .Select(p => new
            {
                p.Id, p.Mesa,
                A = new JogadorMesa(p.ParticipanteAId, p.ParticipanteA.UserId, p.ParticipanteA.User.Name, p.DeckANome),
                B = p.ParticipanteB == null ? null
                    : new JogadorMesa(p.ParticipanteB.Id, p.ParticipanteB.UserId, p.ParticipanteB.User.Name, p.DeckBNome),
                p.ReportA, p.ReportB, p.Resultado,
            })
            .ToListAsync();

        return partidas.Select(p => new MesaDto(
            p.Id, p.Mesa, p.A, p.B,
            comReports ? p.ReportA : null, comReports ? p.ReportB : null,
            p.Resultado,
            Divergente: p.ReportA != null && p.ReportB != null && p.ReportA != p.ReportB && p.Resultado == null))
            .ToList();
    }

    /// <summary>Tudo que o telão e o jogador precisam numa chamada (público: sem reports nem contato).</summary>
    public async Task<TorneioPublicoDto> PublicoAsync(Guid championshipId)
    {
        var ch = await CampeonatoAsync(championshipId);
        var timer = await _db.Timers.AsNoTracking().FirstOrDefaultAsync(t => t.ChampionshipId == championshipId);
        return new TorneioPublicoDto(
            ch.Id, ch.Name, ch.Game, ch.Status.ToString(), ch.Formato.ToString(), ch.MelhorDe, ch.MinutosRodada,
            ch.NumeroRodadas, ch.RodadaAtual,
            ch.RodadaAtual > 0 ? await MesasAsync(championshipId, ch.RodadaAtual, comReports: false) : [],
            await ClassificacaoAsync(championshipId),
            TimerDto.De(timer));
    }

    public async Task<PainelDto> PainelAsync(Guid championshipId)
    {
        var ch = await CampeonatoAsync(championshipId);
        var participantes = await _db.ChampionshipParticipants
            .Where(p => p.ChampionshipId == championshipId)
            .OrderBy(p => p.PlayerNumber)
            .Select(p => new ParticipantePainel(
                p.Id, p.UserId, p.PlayerNumber, p.User.Name, p.DeckName, p.CheckInEm, p.DesistiuNaRodada,
                ch.EntryFeeInCents == 0 || p.EntryFeePaidAt != null))
            .ToListAsync();
        var timer = await _db.Timers.AsNoTracking().FirstOrDefaultAsync(t => t.ChampionshipId == championshipId);

        return new PainelDto(
            ch.Id, ch.Name, ch.Status.ToString(), ch.Formato.ToString(), ch.CodigoEntrada, ch.MelhorDe, ch.MinutosRodada,
            ch.NumeroRodadas, ch.RodadaAtual, Suico.RodadasSugeridas(participantes.Count(p => p.CheckInEm != null && p.DesistiuNaRodada == null)),
            participantes,
            ch.RodadaAtual > 0 ? await MesasAsync(championshipId, ch.RodadaAtual, comReports: true) : [],
            await ClassificacaoAsync(championshipId),
            TimerDto.De(timer));
    }

    /// <summary>Tela do jogador: torneio, minha mesa na rodada atual, o que cada um lançou.</summary>
    public async Task<MinhaMesaDto> MinhaMesaAsync(Guid userId, Guid championshipId)
    {
        var publico = await PublicoAsync(championshipId);
        var eu = await _db.ChampionshipParticipants
            .Where(p => p.ChampionshipId == championshipId && p.UserId == userId)
            .Select(p => new { p.Id, p.CheckInEm, p.DesistiuNaRodada, p.DeckName })
            .FirstOrDefaultAsync();

        MesaDto? minha = null;
        string? meuReport = null, reportOponente = null;
        if (eu is not null && publico.RodadaAtual > 0)
        {
            var completa = (await MesasAsync(championshipId, publico.RodadaAtual, comReports: true))
                .FirstOrDefault(m => m.A.ParticipanteId == eu.Id || m.B?.ParticipanteId == eu.Id);
            if (completa is not null)
            {
                var souA = completa.A.ParticipanteId == eu.Id;
                meuReport = DoMeuPontoDeVista(souA ? completa.ReportA : completa.ReportB, souA);
                reportOponente = DoMeuPontoDeVista(souA ? completa.ReportB : completa.ReportA, souA);
                minha = completa with { ReportA = null, ReportB = null };
            }
        }

        return new MinhaMesaDto(publico, eu?.Id, eu?.CheckInEm is not null, eu?.DesistiuNaRodada, eu?.DeckName,
            minha, meuReport, reportOponente);
    }

    /// <summary>Torneios em andamento (ou com check-in aberto) em que o usuário está.</summary>
    public Task<List<TorneioResumoDto>> MeusAtivosAsync(Guid userId) =>
        _db.ChampionshipParticipants
            .Where(p => p.UserId == userId && p.Championship.Formato == FormatoTorneio.Suico
                     && (p.Championship.Status == ChampionshipStatus.EmAndamento || p.Championship.Status == ChampionshipStatus.Inscricoes))
            .Select(p => new TorneioResumoDto(p.ChampionshipId, p.Championship.Name, p.Championship.Status.ToString(),
                p.Championship.RodadaAtual, p.Championship.NumeroRodadas, p.CheckInEm != null))
            .ToListAsync();

    // =========================================================================
    // INTERNOS
    // =========================================================================

    private async Task<Championship> CampeonatoAsync(Guid id) =>
        await _db.Championships.FirstOrDefaultAsync(c => c.Id == id)
        ?? throw new TorneioException("Campeonato não encontrado.", 404);

    private async Task<TorneioPartida> PartidaAsync(Guid championshipId, Guid partidaId) =>
        await _db.TorneioPartidas.Include(p => p.Rodada)
            .FirstOrDefaultAsync(p => p.Id == partidaId && p.Rodada.ChampionshipId == championshipId)
        ?? throw new TorneioException("Partida não encontrada.", 404);

    /// <summary>Quem joga: check-in feito; se ninguém fez check-in, todos com vaga valendo (e pagos, se houver taxa).</summary>
    private async Task<List<ChampionshipParticipant>> ParticipantesQueJogamAsync(Championship ch)
    {
        var todos = await _db.ChampionshipParticipants.Where(p => p.ChampionshipId == ch.Id).ToListAsync();
        var comCheckIn = todos.Where(p => p.CheckInEm != null).ToList();
        if (comCheckIn.Count > 0)
        {
            // Quem já jogou alguma rodada continua na lista (pros pontos), mesmo sem check-in
            var jaJogaram = (await HistoricoAsync(ch.Id))
                .SelectMany(h => h.B is null ? new[] { h.A } : new[] { h.A, h.B.Value }).ToHashSet();
            return todos.Where(p => p.CheckInEm != null || jaJogaram.Contains(p.Id)).ToList();
        }
        return todos.Where(p => p.VagaVale && (ch.EntryFeeInCents == 0 || p.EntryFeePaidAt != null)).ToList();
    }

    private async Task<List<PartidaSuico>> HistoricoAsync(Guid championshipId) =>
        await _db.TorneioPartidas
            .Where(p => p.Rodada.ChampionshipId == championshipId)
            .Select(p => new PartidaSuico(p.ParticipanteAId, p.ParticipanteBId, p.Resultado))
            .ToListAsync();

    private async Task FecharRodadaSeCompletaAsync(Guid rodadaId)
    {
        var agora = DateTime.UtcNow;
        await _db.TorneioRodadas
            .Where(r => r.Id == rodadaId && r.Status == StatusRodada.Aberta && r.Partidas.All(p => p.Resultado != null))
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, StatusRodada.Fechada).SetProperty(r => r.FechadaEm, agora));
    }

    /// <summary>
    /// Timer do campeonato: reinicia com o tempo da rodada e já sai contando.
    /// Sem timer ligado ao campeonato, cria um — o organizador não precisa lembrar.
    /// </summary>
    private async Task ReiniciarTimerAsync(Championship ch, int rodada)
    {
        var timer = await _db.Timers.FirstOrDefaultAsync(t => t.ChampionshipId == ch.Id);
        if (timer is null)
        {
            timer = new TimerEntity { Name = ch.Name.Length > 80 ? ch.Name[..80] : ch.Name, ChampionshipId = ch.Id };
            _db.Timers.Add(timer);
        }
        timer.DurationSeconds = ch.MinutosRodada * 60;
        timer.Rodada = rodada;
        timer.State = TimerState.Running;
        timer.StartedAt = DateTime.UtcNow;
        timer.PausedRemaining = null;
        timer.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    private async Task<string> NovoCodigoAsync()
    {
        for (var tentativa = 0; tentativa < 20; tentativa++)
        {
            var codigo = new string(Enumerable.Range(0, 5)
                .Select(_ => AlfabetoCodigo[RandomNumberGenerator.GetInt32(AlfabetoCodigo.Length)]).ToArray());
            if (!await _db.Championships.AnyAsync(c => c.CodigoEntrada == codigo)) return codigo;
        }
        throw new TorneioException("Não consegui gerar um código livre. Tente de novo.", 500);
    }

    private static string? DoMeuPontoDeVista(ResultadoPartida? r, bool souA) => r switch
    {
        null => null,
        ResultadoPartida.Empate => nameof(ResultadoJogador.Empatei),
        ResultadoPartida.VitoriaA => souA ? nameof(ResultadoJogador.Venci) : nameof(ResultadoJogador.Perdi),
        _ => souA ? nameof(ResultadoJogador.Perdi) : nameof(ResultadoJogador.Venci),
    };

    /// <summary>Avisa as telas abertas (telão, celulares, painel). Falha no aviso não desfaz nada.</summary>
    private async Task AvisarAsync(Guid championshipId, string motivo)
    {
        try
        {
            await _hub.Clients.Group(TorneioHub.Grupo(championshipId))
                .SendAsync("TorneioAtualizado", new { championshipId, motivo });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Liguinha: não consegui avisar as telas do campeonato {Id}.", championshipId);
        }
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

public sealed record LinhaTabela(
    int Posicao, Guid ParticipanteId, Guid UserId, string Nome, string? Deck,
    int Pontos, int Vitorias, int Empates, int Derrotas, decimal Owp, decimal Oowp, int? DesistiuNaRodada);

public sealed record JogadorMesa(Guid ParticipanteId, Guid UserId, string Nome, string? Deck);

public sealed record MesaDto(
    Guid PartidaId, int Mesa, JogadorMesa A, JogadorMesa? B,
    ResultadoPartida? ReportA, ResultadoPartida? ReportB, ResultadoPartida? Resultado, bool Divergente);

public sealed record TimerDto(Guid Id, string State, int DurationSeconds, int? PausedRemaining, DateTime? StartedAt, int? Rodada)
{
    public static TimerDto? De(TimerEntity? t) => t is null ? null
        : new TimerDto(t.Id, t.State.ToString().ToLowerInvariant(), t.DurationSeconds, t.PausedRemaining, t.StartedAt, t.Rodada);
}

public sealed record TorneioPublicoDto(
    Guid Id, string Nome, string Jogo, string Status, string Formato, int MelhorDe, int MinutosRodada,
    int? NumeroRodadas, int RodadaAtual, List<MesaDto> Mesas, List<LinhaTabela> Classificacao, TimerDto? Timer);

public sealed record ParticipantePainel(
    Guid Id, Guid UserId, int PlayerNumber, string Nome, string? Deck, DateTime? CheckInEm, int? DesistiuNaRodada, bool Pago);

public sealed record PainelDto(
    Guid Id, string Nome, string Status, string Formato, string? CodigoEntrada, int MelhorDe, int MinutosRodada,
    int? NumeroRodadas, int RodadaAtual, int RodadasSugeridas,
    List<ParticipantePainel> Participantes, List<MesaDto> Mesas, List<LinhaTabela> Classificacao, TimerDto? Timer);

public sealed record MinhaMesaDto(
    TorneioPublicoDto Torneio, Guid? ParticipanteId, bool CheckIn, int? DesistiuNaRodada, string? Deck,
    MesaDto? Mesa, string? MeuReport, string? ReportOponente);

public sealed record TorneioResumoDto(Guid Id, string Nome, string Status, int RodadaAtual, int? NumeroRodadas, bool CheckIn);
