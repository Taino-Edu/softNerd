// =============================================================================
// ChampionshipService.cs — Implementação de Campeonatos
// =============================================================================
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class ChampionshipService : IChampionshipService
{
    private readonly AppDbContext _db;
    public ChampionshipService(AppDbContext db) { _db = db; }

    public async Task<Championship> CreateAsync(Championship championship)
    {
        _db.Championships.Add(championship);
        await _db.SaveChangesAsync();
        return championship;
    }

    public async Task<Championship?> GetByIdAsync(Guid id) =>
        await _db.Championships
            .Include(c => c.Participants)
            .Include(c => c.PreInscricoes)
            .FirstOrDefaultAsync(c => c.Id == id);

    public async Task<Championship> UpdateAsync(Championship championship)
    {
        _db.Championships.Update(championship);
        await _db.SaveChangesAsync();
        return championship;
    }

    public async Task<IEnumerable<Championship>> GetUpcomingAsync() =>
        await _db.Championships
            .Include(c => c.Participants)
            .Include(c => c.PreInscricoes)
            .Where(c => c.Status == ChampionshipStatus.Planejado || c.Status == ChampionshipStatus.Inscricoes)
            .OrderBy(c => c.StartDate).ToListAsync();

    public async Task<IEnumerable<Championship>> GetAllAsync(string? search = null)
    {
        var query = _db.Championships.Include(c => c.Participants).Include(c => c.PreInscricoes).AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(c => c.Name.ToLower().Contains(search.ToLower()) ||
                                     c.Game.ToLower().Contains(search.ToLower()));
        return await query.OrderByDescending(c => c.StartDate).ToListAsync();
    }

    public async Task DeleteAsync(Guid id)
    {
        var ch = await _db.Championships.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new InvalidOperationException("Campeonato não encontrado.");

        if (ch.Status != ChampionshipStatus.Finalizado && ch.Status != ChampionshipStatus.Cancelado)
            throw new InvalidOperationException("Só é possível excluir campeonatos Finalizados ou Cancelados.");

        // Remove participantes antes de remover o campeonato
        _db.ChampionshipParticipants.RemoveRange(ch.Participants);
        _db.Championships.Remove(ch);
        await _db.SaveChangesAsync();
    }

    public async Task<Championship> UpdateStatusAsync(Guid id, ChampionshipStatus newStatus)
    {
        var ch = await _db.Championships.FindAsync(id) ?? throw new InvalidOperationException("Campeonato não encontrado.");
        ch.Status = newStatus;
        await _db.SaveChangesAsync();
        return ch;
    }

    public async Task<ChampionshipParticipant> RegisterParticipantAsync(
        Guid championshipId, Guid userId, string? deckName = null, Guid? deckId = null,
        bool vagaFirme = false)
    {
        // Verifica se o usuário já está inscrito para evitar duplicata
        var jaInscrito = await _db.ChampionshipParticipants
            .AnyAsync(p => p.ChampionshipId == championshipId && p.UserId == userId);
        if (jaInscrito)
            throw new InvalidOperationException("Usuário já está inscrito neste campeonato.");

        // Se veio DeckId, confirma que o deck é do próprio usuário (nunca confia em ID vindo do
        // cliente sem checar dono) e usa o nome real do deck em vez do que foi digitado.
        if (deckId.HasValue)
        {
            var deck = await _db.Decks.FirstOrDefaultAsync(d => d.Id == deckId.Value && d.UserId == userId);
            if (deck is null)
                throw new InvalidOperationException("Deck não encontrado ou não pertence a este usuário.");
            deckName = deck.Name;
        }

        // Gera número sequencial de jogador (último + 1)
        var ultimoNumero = await _db.ChampionshipParticipants
            .Where(p => p.ChampionshipId == championshipId)
            .Select(p => (int?)p.PlayerNumber)
            .MaxAsync();

        // Campeonato com taxa: a inscrição segura a vaga só até o prazo de pagamento.
        // Gratuito, ou inscrição feita pelo balcão (o admin já recebeu), entra firme.
        var campeonato = await _db.Championships
            .Select(c => new { c.Id, c.EntryFeeInCents, c.MinutosParaPagar })
            .FirstOrDefaultAsync(c => c.Id == championshipId);

        DateTime? expiraEm = null;
        if (!vagaFirme && campeonato is not null && campeonato.EntryFeeInCents > 0)
            expiraEm = DateTime.UtcNow.AddMinutes(Math.Max(1, campeonato.MinutosParaPagar));

        var participant = new ChampionshipParticipant
        {
            ChampionshipId    = championshipId,
            UserId            = userId,
            DeckName          = deckName,
            DeckId            = deckId,
            PlayerNumber      = (ultimoNumero ?? 0) + 1,
            InscricaoExpiraEm = expiraEm,
        };
        _db.ChampionshipParticipants.Add(participant);
        await _db.SaveChangesAsync();
        return participant;
    }

    public async Task LinkComandaToParticipantAsync(Guid participantId, Guid comandaId)
    {
        var p = await _db.ChampionshipParticipants.FindAsync(participantId);
        if (p != null) { p.ComandaId = comandaId; await _db.SaveChangesAsync(); }
    }

    public async Task<IEnumerable<ChampionshipParticipant>> GetParticipantsAsync(Guid championshipId) =>
        await _db.ChampionshipParticipants
            .Include(p => p.User)
            .Where(p => p.ChampionshipId == championshipId)
            .OrderBy(p => p.PlayerNumber).ToListAsync();

    public async Task<IEnumerable<ChampionshipParticipant>> GetUserParticipationsAsync(Guid userId) =>
        await _db.ChampionshipParticipants
            .Include(p => p.Championship)
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.RegisteredAt)
            .ToListAsync();

    public async Task SetPlacementAsync(Guid participantId, int placement)
    {
        var p = await _db.ChampionshipParticipants.FindAsync(participantId);
        if (p != null) { p.Placement = placement; await _db.SaveChangesAsync(); }
    }

    public async Task RemoveParticipantAsync(Guid participantId)
    {
        var p = await _db.ChampionshipParticipants.FindAsync(participantId)
            ?? throw new InvalidOperationException("Participante não encontrado.");
        _db.ChampionshipParticipants.Remove(p);
        await _db.SaveChangesAsync();
    }

    public async Task<(ChampionshipPreInscricao PreInscricao, int Numero)> AddPreInscricaoAsync(Guid championshipId, string nome, string whatsApp, Guid? deckId = null, string? deckName = null)
    {
        bool isListaEspera = false;
        int  numero        = 1;

        var ch = await _db.Championships.Include(c => c.PreInscricoes).FirstOrDefaultAsync(c => c.Id == championshipId);
        if (ch != null)
        {
            var confirmedCount  = ch.PreInscricoes.Count(p => !p.IsListaEspera);
            var waitingCount    = ch.PreInscricoes.Count(p =>  p.IsListaEspera);

            if (ch.MaxParticipants.HasValue && confirmedCount >= ch.MaxParticipants.Value)
            {
                isListaEspera = true;
                numero        = waitingCount + 1;
            }
            else
            {
                numero = confirmedCount + 1;
            }
        }

        var pi = new ChampionshipPreInscricao
        {
            ChampionshipId = championshipId,
            Nome           = nome,
            WhatsApp       = whatsApp,
            IsListaEspera  = isListaEspera,
            DeckId         = deckId,
            DeckName       = deckName,
        };
        _db.ChampionshipPreInscricoes.Add(pi);
        await _db.SaveChangesAsync();
        return (pi, numero);
    }

    public async Task<IEnumerable<ChampionshipPreInscricao>> GetPreInscricoesAsync(Guid championshipId) =>
        await _db.ChampionshipPreInscricoes
            .Where(p => p.ChampionshipId == championshipId)
            .OrderBy(p => p.CreatedAt).ToListAsync();

    public async Task DeletePreInscricaoAsync(Guid preInscricaoId)
    {
        var pi = await _db.ChampionshipPreInscricoes.FindAsync(preInscricaoId);
        if (pi != null) { _db.ChampionshipPreInscricoes.Remove(pi); await _db.SaveChangesAsync(); }
    }

    public async Task SetPodioAsync(Guid championshipId, string podioJson)
    {
        var ch = await _db.Championships.FindAsync(championshipId)
            ?? throw new InvalidOperationException("Campeonato não encontrado.");
        ch.PodioJson = podioJson;
        await _db.SaveChangesAsync();
    }
}
