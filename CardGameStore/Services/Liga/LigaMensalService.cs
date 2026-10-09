// =============================================================================
// LigaMensalService.cs — ranking mensal dos campeonatos semanais
//
// Duas fontes de pontos:
//   1. Championship + ChampionshipParticipant.Placement (inclui a liguinha, que
//      grava o Placement ao encerrar — TorneioService.EncerrarAsync)
//   2. LigaMensalManualEntry — lançamento manual do admin, pra migrar o histórico
//      anotado à mão ou corrigir pontuação sem cadastrar um campeonato inteiro.
//
// Pontuação por colocação: 1º=10, 2º=7, 3º=5, 4º=3, demais colocados=1.
// O mês é o do calendário de Brasília (campeonato às 22h do dia 31 é do mês 31).
//
// Chave de funcionalidade "liga-mensal-por-jogador" (Configuration/Funcionalidades.cs):
//   ligada    → RankingPorJogador: uma linha por jogador, campeonato cancelado não soma
//   desligada → RankingLegadoPorNome: o cálculo de antes da v1.41.0, que juntava por nome
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Liga;

/// <summary>Pedido inválido ou lançamento inexistente — vira 400/404 com a mensagem pro usuário.</summary>
public class LigaMensalException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}

public class LigaMensalService
{
    private static readonly string[] MesesPtBr =
    {
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    };

    private readonly AppDbContext _db;
    private readonly FuncionalidadesService _funcionalidades;

    public LigaMensalService(AppDbContext db, FuncionalidadesService funcionalidades)
    {
        _db              = db;
        _funcionalidades = funcionalidades;
    }

    /// <summary>Pontos por colocação: 1º=10, 2º=7, 3º=5, 4º=3, demais=1.</summary>
    public static int PontosPorColocacao(int colocacao) => colocacao switch
    {
        1 => 10,
        2 => 7,
        3 => 5,
        4 => 3,
        _ => 1,
    };

    public static string RotuloDoMes(int ano, int mes) => $"{MesesPtBr[mes - 1]} de {ano}";

    // -------------------------------------------------------------------------
    // Ranking
    // -------------------------------------------------------------------------

    /// <summary>Ranking do mês (padrão: mês atual de Brasília), campeonatos + lançamentos manuais.</summary>
    public async Task<LigaMensalDto> RankingAsync(int? ano, int? mes)
    {
        var hoje = Brasilia.Hoje();
        var anoAlvo = ano ?? hoje.Year;
        var mesAlvo = mes ?? hoje.Month;
        ValidarMes(anoAlvo, mesAlvo);

        var primeiroDia = new DateTime(anoAlvo, mesAlvo, 1);
        var inicioUtc   = Brasilia.DiaUtc(primeiroDia).InicioUtc;
        var fimUtc      = Brasilia.DiaUtc(primeiroDia.AddMonths(1)).InicioUtc;

        var participantes = await _db.ChampionshipParticipants
            .AsNoTracking()
            .Include(p => p.User)
            .Include(p => p.Championship)
            .Where(p => p.Placement != null
                        && p.Championship.StartDate >= inicioUtc
                        && p.Championship.StartDate < fimUtc)
            .ToListAsync();

        var manuais = await _db.LigaMensalManualEntries
            .AsNoTracking()
            .Where(e => e.Ano == anoAlvo && e.Mes == mesAlvo)
            .ToListAsync();

        var ranking = await _funcionalidades.LigadaAsync(Funcionalidades.LigaMensalPorJogador)
            ? RankingPorJogador(participantes, manuais)
            : RankingLegadoPorNome(participantes, manuais);

        return new LigaMensalDto
        {
            Ano      = anoAlvo,
            Mes      = mesAlvo,
            MesLabel = RotuloDoMes(anoAlvo, mesAlvo),
            Ranking  = Ordenar(ranking),
        };
    }

    /// <summary>
    /// Uma linha por jogador do sistema (pelo id, não pelo nome). Lançamento manual entra
    /// na linha do jogador com o mesmo nome se houver exatamente um; com homônimos não dá
    /// pra saber de quem é, então vira linha própria. Campeonato cancelado não soma.
    /// </summary>
    internal static List<LigaMensalRankingDto> RankingPorJogador(
        IEnumerable<ChampionshipParticipant> participantes, IEnumerable<LigaMensalManualEntry> manuais)
    {
        var porJogador = participantes
            .Where(p => p.Championship.Status != ChampionshipStatus.Cancelado)
            .GroupBy(p => p.UserId)
            .Select(g => new LigaMensalRankingDto
            {
                UserId        = g.Key,
                PlayerName    = g.First().User?.Name ?? "Jogador",
                TotalPoints   = g.Sum(p => PontosPorColocacao(p.Placement!.Value)),
                EventsPlayed  = g.Count(),
                BestPlacement = g.Min(p => p.Placement!.Value),
                Decks         = DecksOrdenados(g.Select(p => p.DeckName)),
            })
            .ToList();

        // Linhas que só têm lançamento manual: o mesmo nome em dois lançamentos é a mesma pessoa
        var soManual = new Dictionary<string, LigaMensalRankingDto>();

        foreach (var m in manuais)
        {
            var nome = NomeNormalizado(m.PlayerName);
            var mesmoNome = porJogador.Where(l => NomeNormalizado(l.PlayerName) == nome).ToList();

            var linha = mesmoNome.Count == 1 ? mesmoNome[0] : soManual.GetValueOrDefault(nome);
            if (linha is null)
            {
                soManual[nome] = new LigaMensalRankingDto
                {
                    UserId     = m.Id, // sem usuário no sistema: usa o id do lançamento
                    PlayerName = m.PlayerName,
                    TotalPoints = m.TotalPoints,
                    Decks      = DecksOrdenados(DecksDoLancamento(m)),
                };
                continue;
            }

            linha.TotalPoints += m.TotalPoints;
            linha.Decks = DecksOrdenados(linha.Decks.Concat(DecksDoLancamento(m)));
        }

        return porJogador.Concat(soManual.Values).ToList();
    }

    // FALLBACK da chave "liga-mensal-por-jogador" — cálculo de antes da v1.41.0, copiado
    // sem mudança. Apagar junto com a chave (Configuration/Funcionalidades.cs → RevisarEm).
    // Defeitos conhecidos, mantidos de propósito pra volta ser fiel: dois jogadores com o
    // mesmo nome viram uma linha só e o primeiro perde os pontos; campeonato cancelado soma.
    internal static List<LigaMensalRankingDto> RankingLegadoPorNome(
        IEnumerable<ChampionshipParticipant> participantes, IEnumerable<LigaMensalManualEntry> manuais)
    {
        var acumulado = new Dictionary<string, LigaMensalRankingDto>();

        foreach (var g in participantes.GroupBy(p => p.UserId))
        {
            var nome = g.First().User?.Name ?? "Jogador";
            var key  = nome.Trim().ToLowerInvariant();
            acumulado[key] = new LigaMensalRankingDto
            {
                UserId        = g.Key,
                PlayerName    = nome,
                TotalPoints   = g.Sum(p => PontosPorColocacao(p.Placement!.Value)),
                EventsPlayed  = g.Count(),
                BestPlacement = g.Min(p => p.Placement!.Value),
                Decks = g.Select(p => p.DeckName)
                    .Where(d => !string.IsNullOrWhiteSpace(d))
                    .Select(d => d!)
                    .Distinct()
                    .OrderBy(d => d)
                    .ToList(),
            };
        }

        foreach (var m in manuais)
        {
            var key = m.PlayerName.Trim().ToLowerInvariant();
            var decksManual = (m.Decks ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();

            if (acumulado.TryGetValue(key, out var existente))
            {
                existente.TotalPoints += m.TotalPoints;
                existente.Decks = existente.Decks.Concat(decksManual).Distinct().OrderBy(d => d).ToList();
            }
            else
            {
                acumulado[key] = new LigaMensalRankingDto
                {
                    UserId        = m.Id,
                    PlayerName    = m.PlayerName,
                    TotalPoints   = m.TotalPoints,
                    EventsPlayed  = 0,
                    BestPlacement = 0,
                    Decks         = decksManual,
                };
            }
        }

        return acumulado.Values.ToList();
    }

    /// <summary>Mais pontos primeiro; empate: quem jogou mais eventos; depois o nome.</summary>
    private static List<LigaMensalRankingDto> Ordenar(IEnumerable<LigaMensalRankingDto> linhas) => linhas
        .OrderByDescending(r => r.TotalPoints)
        .ThenByDescending(r => r.EventsPlayed)
        .ThenBy(r => r.PlayerName)
        .ToList();

    /// <summary>Meses que têm campeonato com colocação ou lançamento manual, do mais novo pro mais antigo.</summary>
    public async Task<List<LigaMensalMesDto>> MesesComDadosAsync()
    {
        var datasCampeonatos = await _db.ChampionshipParticipants
            .Where(p => p.Placement != null)
            .Select(p => p.Championship.StartDate)
            .ToListAsync();

        var mesesManuais = await _db.LigaMensalManualEntries
            .Select(e => new { e.Ano, e.Mes })
            .Distinct()
            .ToListAsync();

        return datasCampeonatos
            .Select(Brasilia.ParaBrasilia)
            .Select(d => (Ano: d.Year, Mes: d.Month))
            .Concat(mesesManuais.Select(m => (m.Ano, m.Mes)))
            .Distinct()
            .OrderByDescending(m => m.Ano).ThenByDescending(m => m.Mes)
            .Select(m => new LigaMensalMesDto { Ano = m.Ano, Mes = m.Mes, MesLabel = RotuloDoMes(m.Ano, m.Mes) })
            .ToList();
    }

    // -------------------------------------------------------------------------
    // Lançamentos manuais (admin)
    // -------------------------------------------------------------------------

    public async Task<List<LigaMensalManualEntryDto>> ListarManuaisAsync(int ano, int mes)
    {
        var lancamentos = await _db.LigaMensalManualEntries
            .AsNoTracking()
            .Where(e => e.Ano == ano && e.Mes == mes)
            .OrderBy(e => e.PlayerName)
            .ToListAsync();
        return lancamentos.Select(ParaDto).ToList();
    }

    public async Task<LigaMensalManualEntryDto> CriarManualAsync(SaveLigaMensalManualEntryRequest req, Guid adminId)
    {
        ValidarMes(req.Ano, req.Mes);
        var lancamento = new LigaMensalManualEntry { CreatedByAdminId = adminId };
        Preencher(lancamento, req);

        _db.LigaMensalManualEntries.Add(lancamento);
        await _db.SaveChangesAsync();
        return ParaDto(lancamento);
    }

    public async Task<LigaMensalManualEntryDto> EditarManualAsync(Guid id, SaveLigaMensalManualEntryRequest req)
    {
        ValidarMes(req.Ano, req.Mes);
        var lancamento = await _db.LigaMensalManualEntries.FindAsync(id)
            ?? throw new LigaMensalException("Lançamento não encontrado.", 404);

        Preencher(lancamento, req);
        lancamento.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ParaDto(lancamento);
    }

    public async Task RemoverManualAsync(Guid id)
    {
        var lancamento = await _db.LigaMensalManualEntries.FindAsync(id)
            ?? throw new LigaMensalException("Lançamento não encontrado.", 404);

        _db.LigaMensalManualEntries.Remove(lancamento);
        await _db.SaveChangesAsync();
    }

    // -------------------------------------------------------------------------
    // Ajudantes
    // -------------------------------------------------------------------------

    private static void ValidarMes(int ano, int mes)
    {
        if (mes is < 1 or > 12)
            throw new LigaMensalException("Mês inválido. Use um valor entre 1 e 12.");
        // Sem limite, um ano 0 ou 99999 virava erro 500 ao montar a data
        if (ano is < 2000 or > 2100)
            throw new LigaMensalException("Ano inválido. Use um valor entre 2000 e 2100.");
    }

    private static void Preencher(LigaMensalManualEntry lancamento, SaveLigaMensalManualEntryRequest req)
    {
        lancamento.Ano         = req.Ano;
        lancamento.Mes         = req.Mes;
        lancamento.PlayerName  = req.PlayerName.Trim();
        lancamento.TotalPoints = req.TotalPoints;
        lancamento.Decks       = string.IsNullOrWhiteSpace(req.Decks) ? null : req.Decks.Trim();
        lancamento.Observacao  = string.IsNullOrWhiteSpace(req.Observacao) ? null : req.Observacao.Trim();
    }

    /// <summary>"  Ana   Souza " e "ana souza" são o mesmo nome.</summary>
    private static string NomeNormalizado(string nome) =>
        string.Join(' ', nome.Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();

    private static IEnumerable<string?> DecksDoLancamento(LigaMensalManualEntry m) =>
        (m.Decks ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static List<string> DecksOrdenados(IEnumerable<string?> decks) => decks
        .Where(d => !string.IsNullOrWhiteSpace(d))
        .Select(d => d!.Trim())
        .Distinct()
        .OrderBy(d => d)
        .ToList();

    private static LigaMensalManualEntryDto ParaDto(LigaMensalManualEntry e) => new()
    {
        Id          = e.Id,
        Ano         = e.Ano,
        Mes         = e.Mes,
        PlayerName  = e.PlayerName,
        TotalPoints = e.TotalPoints,
        Decks       = e.Decks,
        Observacao  = e.Observacao,
        CreatedAt   = e.CreatedAt,
        UpdatedAt   = e.UpdatedAt,
    };
}
