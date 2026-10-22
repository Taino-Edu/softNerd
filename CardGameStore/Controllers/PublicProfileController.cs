// =============================================================================
// PublicProfileController.cs — Perfil público de um usuário
//
// GET /api/profile/{userId} — público, sem autenticação
//
// Retorna dados públicos do usuário: nome, avatar, data de cadastro,
// decks públicos e participações em campeonatos com colocação registrada.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/profile")]
[Produces("application/json")]
public class PublicProfileController : ControllerBase
{
    private readonly AppDbContext _db;

    public PublicProfileController(AppDbContext db) => _db = db;

    // ── GET /api/profile/{userId} ─────────────────────────────────────────────

    [HttpGet("{userId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicProfile(Guid userId)
    {
        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive && u.DeletedAt == null);

        if (user is null)
            return NotFound(new { Message = "Usuário não encontrado." });

        // Decks públicos
        var publicDecks = await _db.Decks
            .AsNoTracking()
            .Where(d => d.UserId == userId && d.IsPublic)
            .OrderByDescending(d => d.UpdatedAt)
            .Select(d => new PublicDeckDto
            {
                Id        = d.Id,
                Name      = d.Name,
                Game      = d.Game,
                Format    = d.Format,
                CardsJson = d.CardsJson,
                UpdatedAt = d.UpdatedAt,
            })
            .ToListAsync();

        // Calcula CardCount a partir do JSON para cada deck
        var publicDeckDtos = publicDecks.Select(d => new
        {
            d.Id,
            d.Name,
            d.Game,
            d.Format,
            cardCount = CountCards(d.CardsJson),
            d.UpdatedAt,
        }).ToList();

        // Participações em campeonatos com colocação registrada
        var championships = await _db.ChampionshipParticipants
            .AsNoTracking()
            .Include(p => p.Championship)
            .Where(p => p.UserId == userId && p.Placement != null)
            .OrderBy(p => p.Placement)
            .Select(p => new ChampionshipResultDto
            {
                ChampionshipId   = p.ChampionshipId,
                ChampionshipName = p.Championship.Name,
                Game             = p.Championship.Game,
                StartDate        = p.Championship.StartDate,
                Placement        = p.Placement!.Value,
                PlayerNumber     = p.PlayerNumber,
                DeckName         = p.DeckName,
            })
            .ToListAsync();

        var result = new
        {
            id             = user.Id,
            name           = user.Name,
            profileImageUrl = user.ProfileImageUrl,
            pokemonFavorito      = user.PokemonFavorito,
            pokemonFavoritoShiny = user.PokemonFavoritoShiny,
            memberSince    = user.CreatedAt.Date,
            publicDecks    = publicDeckDtos,
            championships,
        };

        return Ok(result);
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private static int CountCards(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return 0;
        try
        {
            var doc = JsonDocument.Parse(json);
            return doc.RootElement.EnumerateArray()
                .Sum(e => e.TryGetProperty("quantity", out var q) && q.ValueKind == JsonValueKind.Number
                    ? q.GetInt32() : 1);
        }
        catch { return 0; }
    }
}

// ── DTOs internos ─────────────────────────────────────────────────────────────

file class PublicDeckDto
{
    public Guid     Id        { get; init; }
    public string   Name      { get; init; } = "";
    public string   Game      { get; init; } = "";
    public string   Format    { get; init; } = "";
    public string   CardsJson { get; init; } = "[]";
    public DateTime UpdatedAt { get; init; }
}

file class ChampionshipResultDto
{
    public Guid     ChampionshipId   { get; init; }
    public string   ChampionshipName { get; init; } = "";
    public string   Game             { get; init; } = "";
    public DateTime StartDate        { get; init; }
    public int      Placement        { get; init; }
    public int      PlayerNumber     { get; init; }
    public string?  DeckName         { get; init; }
}
