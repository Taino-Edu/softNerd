// =============================================================================
// LigaMensalDtos.cs — DTOs da Liga Mensal (Services/Liga/LigaMensalService.cs)
// =============================================================================

using System.ComponentModel.DataAnnotations;

namespace CardGameStore.DTOs;

public class LigaMensalDto
{
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string MesLabel { get; init; } = string.Empty;
    public List<LigaMensalRankingDto> Ranking { get; init; } = new();
}

public class LigaMensalRankingDto
{
    /// <summary>Id do jogador; numa linha só de lançamento manual, o id do lançamento.</summary>
    public Guid UserId { get; init; }
    public string PlayerName { get; init; } = string.Empty;
    public int TotalPoints { get; set; }
    public int EventsPlayed { get; init; }
    /// <summary>Melhor colocação em campeonato; 0 = só tem lançamento manual.</summary>
    public int BestPlacement { get; init; }
    public List<string> Decks { get; set; } = new();
}

public class LigaMensalMesDto
{
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string MesLabel { get; init; } = string.Empty;
}

public class LigaMensalManualEntryDto
{
    public Guid Id { get; init; }
    public int Ano { get; init; }
    public int Mes { get; init; }
    public string PlayerName { get; init; } = string.Empty;
    public int TotalPoints { get; init; }
    public string? Decks { get; init; }
    public string? Observacao { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

/// <summary>Request pra criar/editar lançamento manual.</summary>
public class SaveLigaMensalManualEntryRequest
{
    public int Ano { get; init; }
    public int Mes { get; init; }

    [Required, MaxLength(200)]
    public string PlayerName { get; init; } = string.Empty;

    public int TotalPoints { get; init; }

    [MaxLength(500)]
    public string? Decks { get; init; }

    [MaxLength(500)]
    public string? Observacao { get; init; }
}
