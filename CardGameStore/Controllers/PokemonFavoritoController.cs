// =============================================================================
// PokemonFavoritoController.cs — PUT /api/user/me/pokemon (v1.65.0)
// O próprio cliente escolhe o Pokémon preferido do perfil (Services/Implementations/PokemonFavoritoService.cs).
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

public record PokemonFavoritoRequest([MaxLength(45)] string? Pokemon, bool Shiny = false);

[ApiController]
[Route("api/user/me/pokemon")]
[Authorize(Policy = "CustomerOrAdmin")]
[Produces("application/json")]
public class PokemonFavoritoController(PokemonFavoritoService service) : ControllerBase
{
    [HttpPut]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(409)]
    public async Task<IActionResult> Definir([FromBody] PokemonFavoritoRequest request)
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var userId))
            return Unauthorized();
        try
        {
            var (pokemon, shiny) = await service.DefinirAsync(userId, request.Pokemon, request.Shiny);
            return Ok(new { pokemon, shiny });
        }
        catch (PokemonFavoritoException ex)
        {
            return StatusCode(ex.Status, new { message = ex.Message });
        }
    }
}
