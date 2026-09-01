// =============================================================================
// IChampionshipService.cs — Interface do serviço de Campeonatos
// =============================================================================

using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.Services.Interfaces;

/// <summary>Contrato para gestão de torneios e participantes.</summary>
public interface IChampionshipService
{
    Task<Championship>              CreateAsync(Championship championship);
    Task<Championship?>             GetByIdAsync(Guid id);
    Task<Championship>              UpdateAsync(Championship championship);
    Task<IEnumerable<Championship>> GetUpcomingAsync();
    Task<IEnumerable<Championship>> GetAllAsync(string? search = null);
    Task<Championship>              UpdateStatusAsync(Guid id, ChampionshipStatus newStatus);
    Task                            DeleteAsync(Guid id);

    /// <param name="vagaFirme">Balcão ou campeonato gratuito: entra sem prazo de pagamento.</param>
    Task<ChampionshipParticipant>   RegisterParticipantAsync(Guid championshipId, Guid userId, string? deckName = null, Guid? deckId = null, bool vagaFirme = false);
    Task                            LinkComandaToParticipantAsync(Guid participantId, Guid comandaId);
    Task<IEnumerable<ChampionshipParticipant>> GetParticipantsAsync(Guid championshipId);
    Task<IEnumerable<ChampionshipParticipant>> GetUserParticipationsAsync(Guid userId);
    Task                            SetPlacementAsync(Guid participantId, int placement);
    Task                            RemoveParticipantAsync(Guid participantId);

    Task<(ChampionshipPreInscricao PreInscricao, int Numero)> AddPreInscricaoAsync(Guid championshipId, string nome, string whatsApp, Guid? deckId = null, string? deckName = null);
    Task<IEnumerable<ChampionshipPreInscricao>> GetPreInscricoesAsync(Guid championshipId);
    Task                                        DeletePreInscricaoAsync(Guid preInscricaoId);
    Task                                        SetPodioAsync(Guid championshipId, string podioJson);
}
