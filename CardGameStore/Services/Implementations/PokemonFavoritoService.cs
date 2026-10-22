// =============================================================================
// PokemonFavoritoService.cs — "Qual o seu Pokémon preferido?" (v1.65.0)
//
// O cliente escolhe um Pokémon de estimação pro perfil (não é o deck do torneio). Guarda só o
// id do sprite do Pokémon Showdown ("pikachu", "raichu-alola", "charizard-megax") e se é a
// versão brilhante (shiny); a lista pra escolher fica no front (public/pokedex.json, gerada por
// scripts/gerar-pokedex.py). Chave: pokemon-preferido.
// =============================================================================

using System.Text.RegularExpressions;
using CardGameStore.Configuration;
using CardGameStore.Data;

namespace CardGameStore.Services.Implementations;

public class PokemonFavoritoException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}

public partial class PokemonFavoritoService(AppDbContext db, FuncionalidadesService funcionalidades)
{
    /// <summary>
    /// Formato do id de sprite do Showdown: letras/números, com no máximo uma forma depois do hífen.
    /// Vai direto numa URL de imagem no front — nada fora disso entra no banco.
    /// </summary>
    [GeneratedRegex("^[a-z0-9]{2,30}(-[a-z0-9]{1,12})?$")]
    private static partial Regex IdValido();

    public static bool Valido(string? id) => id is not null && IdValido().IsMatch(id);

    /// <summary>Escolhe, troca ou tira (pokemon null/vazio) o Pokémon preferido do próprio usuário.</summary>
    public async Task<(string? Pokemon, bool Shiny)> DefinirAsync(Guid userId, string? pokemon, bool shiny)
    {
        if (!await funcionalidades.LigadaAsync(Funcionalidades.PokemonPreferido))
            throw new PokemonFavoritoException("O Pokémon preferido está desligado nesta loja.", 409);

        var id = string.IsNullOrWhiteSpace(pokemon) ? null : pokemon.Trim().ToLowerInvariant();
        if (id is not null && !Valido(id))
            throw new PokemonFavoritoException("Pokémon inválido.");

        var user = await db.Users.FindAsync(userId)
            ?? throw new PokemonFavoritoException("Usuário não encontrado.", 404);
        user.PokemonFavorito      = id;
        user.PokemonFavoritoShiny = id is not null && shiny;
        user.UpdatedAt            = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return (user.PokemonFavorito, user.PokemonFavoritoShiny);
    }
}
