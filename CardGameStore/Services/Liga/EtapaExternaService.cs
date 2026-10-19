// =============================================================================
// EtapaExternaService.cs — "Lançar etapa de fora" (Central da Liguinha, v1.56.0)
//
// Etapa jogada fora do sistema (papel, outro app): vira um campeonato já Finalizado
// com a colocação de cada jogador. Assim entra no histórico, soma na Liga Mensal
// (10/7/5/3/1, LigaMensalService) e nas estatísticas igual a um torneio rodado aqui.
//
// Cada linha vira um participante:
//   - UserId informado → aquele cliente (a tela escolheu)
//   - NovoCadastro → cliente novo mesmo se o nome bater (a tela disse "não é esse")
//   - nome igual (sem acento/caixa/espaço duplo) a exatamente 1 cliente → ele
//   - nenhum ou vários com o mesmo nome → cliente novo de balcão, só com o nome
//     (sem e-mail nem senha; ativa a conta depois, como quem compra no balcão)
// SimularAsync devolve o que vai acontecer sem gravar nada — a tela mostra antes.
// =============================================================================

using System.Globalization;
using System.Text;
using System.Text.Json;
using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Liga;

public record EtapaExternaJogador(string Nome, string? Deck = null, Guid? UserId = null, bool NovoCadastro = false);

public record EtapaExternaRequest(string Nome, DateTime Data, string? Jogo, List<EtapaExternaJogador> Jogadores);

public class EtapaExternaLinhaDto
{
    public int Posicao { get; init; }
    public string Nome { get; init; } = string.Empty;
    public string? Deck { get; init; }
    public int Pontos { get; init; }
    /// <summary>Cliente que vai receber a colocação (null = vai ser criado).</summary>
    public Guid? UserId { get; init; }
    public string? ClienteNome { get; init; }
    /// <summary>"existente", "novo" ou "homonimos" (vários clientes com esse nome: cria um novo, a tela avisa).</summary>
    public string Situacao { get; init; } = "novo";
}

public class EtapaExternaDto
{
    public Guid? ChampionshipId { get; init; }
    public List<EtapaExternaLinhaDto> Linhas { get; init; } = [];
}

public class EtapaExternaService(AppDbContext db)
{
    public const int MinJogadores = 2;
    public const int MaxJogadores = 128;

    public Task<EtapaExternaDto> SimularAsync(EtapaExternaRequest req) => MontarAsync(req, adminId: null);

    public Task<EtapaExternaDto> LancarAsync(EtapaExternaRequest req, Guid adminId) => MontarAsync(req, adminId);

    private async Task<EtapaExternaDto> MontarAsync(EtapaExternaRequest req, Guid? adminId)
    {
        var nomeEtapa = (req.Nome ?? "").Trim();
        if (nomeEtapa.Length == 0) throw new TorneioException("Dê um nome pra etapa.");
        if (nomeEtapa.Length > 200) throw new TorneioException("Nome da etapa muito longo (máx. 200).");

        var jogadores = (req.Jogadores ?? [])
            .Select(j => j with { Nome = string.Join(' ', (j.Nome ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries)),
                                  Deck = string.IsNullOrWhiteSpace(j.Deck) ? null : j.Deck.Trim() })
            .Where(j => j.Nome.Length > 0)
            .ToList();
        if (jogadores.Count < MinJogadores) throw new TorneioException($"Informe pelo menos {MinJogadores} jogadores.");
        if (jogadores.Count > MaxJogadores) throw new TorneioException($"No máximo {MaxJogadores} jogadores por etapa.");
        if (jogadores.Any(j => j.Nome.Length > 150)) throw new TorneioException("Nome de jogador muito longo (máx. 150).");
        if (jogadores.Any(j => j.Deck?.Length > 200)) throw new TorneioException("Nome de deck muito longo (máx. 200).");

        var dataBrasilia = req.Data.Date;
        if (dataBrasilia > Brasilia.Hoje()) throw new TorneioException("A etapa não pode ser no futuro.");

        // Lançar duas vezes somaria os pontos em dobro na Liga: mesmo nome no mesmo dia = já lançada
        var (diaInicio, diaFim) = Brasilia.DiaUtc(dataBrasilia);
        var nomesDoDia = await db.Championships.AsNoTracking()
            .Where(c => c.StartDate >= diaInicio && c.StartDate < diaFim && c.Status != ChampionshipStatus.Cancelado)
            .Select(c => c.Name).ToListAsync();
        if (nomesDoDia.Any(n => Normalizar(n) == Normalizar(nomeEtapa)))
            throw new TorneioException($"Já existe \"{nomeEtapa}\" nesse dia — essa etapa já foi lançada.", 409);

        // Clientes: poucos centenas — compara em memória, sem depender de collation do banco
        var clientes = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Customer && u.DeletedAt == null)
            .Select(u => new { u.Id, u.Name })
            .ToListAsync();
        var porNome = clientes.GroupBy(c => Normalizar(c.Name)).ToDictionary(g => g.Key, g => g.ToList());
        var porId = clientes.ToDictionary(c => c.Id);

        var linhas = new List<EtapaExternaLinhaDto>();
        for (var i = 0; i < jogadores.Count; i++)
        {
            var j = jogadores[i];
            Guid? userId = null; string? clienteNome = null; var situacao = "novo";
            if (j.UserId is { } escolhido)
            {
                if (!porId.TryGetValue(escolhido, out var c)) throw new TorneioException($"Cliente escolhido pra \"{j.Nome}\" não existe.", 404);
                (userId, clienteNome, situacao) = (c.Id, c.Name, "existente");
            }
            else if (!j.NovoCadastro && porNome.TryGetValue(Normalizar(j.Nome), out var mesmos))
            {
                if (mesmos.Count == 1) (userId, clienteNome, situacao) = (mesmos[0].Id, mesmos[0].Name, "existente");
                else situacao = "homonimos";
            }
            linhas.Add(new EtapaExternaLinhaDto
            {
                Posicao = i + 1, Nome = j.Nome, Deck = j.Deck, Pontos = LigaMensalService.PontosPorColocacao(i + 1),
                UserId = userId, ClienteNome = clienteNome, Situacao = situacao,
            });
        }

        var repetido = linhas.Where(l => l.UserId is not null).GroupBy(l => l.UserId).FirstOrDefault(g => g.Count() > 1);
        if (repetido is not null)
            throw new TorneioException($"\"{repetido.First().ClienteNome}\" aparece mais de uma vez na lista.");

        if (adminId is null) return new EtapaExternaDto { Linhas = linhas };

        // ── Grava tudo num SaveChanges só (já é uma transação): ou a etapa entra inteira, ou nada.
        // Sem BeginTransaction: a estratégia de nova tentativa do Npgsql não aceita transação aberta à mão.
        var inicioUtc = Brasilia.DiaUtc(dataBrasilia).InicioUtc.AddHours(14); // 14h de Brasília: só pra cair no dia certo
        var ch = new Championship
        {
            Name = nomeEtapa,
            Description = "Etapa jogada fora do sistema, lançada pela Central da Liguinha.",
            Game = string.IsNullOrWhiteSpace(req.Jogo) ? "Pokemon" : req.Jogo.Trim(),
            StartDate = inicioUtc,
            EndDate = inicioUtc,
            Status = ChampionshipStatus.Finalizado,
            Formato = FormatoTorneio.Livre,
            Modalidade = ModalidadeTorneio.Liga, // etapa de fora é sempre da liguinha: soma na Liga Mensal
            MaxParticipants = linhas.Count,
            EntryFeeInCents = 0,
            CreatedByAdminId = adminId.Value,
            PodioJson = JsonSerializer.Serialize(linhas.Take(3).Select(l => new { lugar = l.Posicao, nome = l.ClienteNome ?? l.Nome })),
        };
        db.Championships.Add(ch);

        var finais = new List<EtapaExternaLinhaDto>();
        foreach (var l in linhas)
        {
            var userId = l.UserId;
            if (userId is null)
            {
                var novo = new User { Name = l.Nome, Role = UserRole.Customer };
                db.Users.Add(novo);
                userId = novo.Id;
            }
            db.ChampionshipParticipants.Add(new ChampionshipParticipant
            {
                ChampionshipId = ch.Id, UserId = userId.Value, PlayerNumber = l.Posicao,
                DeckName = l.Deck, Placement = l.Posicao, CheckInEm = inicioUtc,
            });
            finais.Add(new EtapaExternaLinhaDto
            {
                Posicao = l.Posicao, Nome = l.Nome, Deck = l.Deck, Pontos = l.Pontos,
                UserId = userId, ClienteNome = l.ClienteNome ?? l.Nome, Situacao = l.Situacao,
            });
        }
        await db.SaveChangesAsync();
        return new EtapaExternaDto { ChampionshipId = ch.Id, Linhas = finais };
    }

    /// <summary>"  José   da Silva " e "jose da silva" são o mesmo nome.</summary>
    internal static string Normalizar(string nome)
    {
        var semAcento = new StringBuilder();
        foreach (var c in (nome ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) semAcento.Append(c);
        return string.Join(' ', semAcento.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();
    }
}
