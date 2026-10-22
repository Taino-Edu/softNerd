// =============================================================================
// PokemonFavoritoServiceTests.cs — "Qual o seu Pokémon preferido?" (v1.65.0)
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Tests.Services;

public class PokemonFavoritoServiceTests
{
    private static (AppDbContext Db, PokemonFavoritoService Servico, FuncionalidadesService Chaves, User Cliente) Criar()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        var cliente = new User { Name = "Lucas", Role = UserRole.Customer };
        db.Users.Add(cliente);
        db.SaveChanges();
        var chaves = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
        return (db, new PokemonFavoritoService(db, chaves), chaves, cliente);
    }

    [Theory]
    [InlineData("pikachu")]
    [InlineData("raichu-alola")]
    [InlineData("charizard-megax")]
    [InlineData("porygonz")]
    public async Task Escolhe_GuardaOIdDoSprite_EOShiny(string pokemon)
    {
        var (db, servico, _, cliente) = Criar();

        var (salvo, shiny) = await servico.DefinirAsync(cliente.Id, " " + pokemon.ToUpperInvariant() + " ", shiny: true);

        salvo.Should().Be(pokemon, "id normalizado: sem espaço e minúsculo, igual ao arquivo do sprite");
        shiny.Should().BeTrue();
        db.ChangeTracker.Clear();
        var u = db.Users.Single(x => x.Id == cliente.Id);
        u.PokemonFavorito.Should().Be(pokemon);
        u.PokemonFavoritoShiny.Should().BeTrue();
    }

    [Theory]
    [InlineData("../../evil")]
    [InlineData("pikachu.png")]
    [InlineData("https://x.com/a")]
    [InlineData("a")]
    [InlineData("pika chu")]
    [InlineData("raichu-alola-extra")]
    [InlineData("<script>")]
    public async Task IdForaDoFormato_Recusa_ENaoGrava(string pokemon)
    {
        var (db, servico, _, cliente) = Criar();

        var acao = () => servico.DefinirAsync(cliente.Id, pokemon, false);

        (await acao.Should().ThrowAsync<PokemonFavoritoException>()).Which.Status.Should().Be(400,
            "o id vai direto numa URL de imagem no front — só o formato do Showdown entra");
        db.ChangeTracker.Clear();
        db.Users.Single(x => x.Id == cliente.Id).PokemonFavorito.Should().BeNull();
    }

    [Fact]
    public async Task Tirar_LimpaOPokemonEOShiny()
    {
        var (_, servico, _, cliente) = Criar();
        await servico.DefinirAsync(cliente.Id, "eevee", shiny: true);

        var (salvo, shiny) = await servico.DefinirAsync(cliente.Id, null, shiny: true);

        salvo.Should().BeNull();
        shiny.Should().BeFalse("sem Pokémon não existe versão brilhante");
    }

    [Fact]
    public async Task ChaveDesligada_Recusa_EGuardaOQueJaEstava()
    {
        var (db, servico, chaves, cliente) = Criar();
        await servico.DefinirAsync(cliente.Id, "gengar", shiny: false);
        await chaves.DefinirAsync(Funcionalidades.PokemonPreferido, false, Guid.NewGuid());

        var acao = () => servico.DefinirAsync(cliente.Id, "mew", false);

        (await acao.Should().ThrowAsync<PokemonFavoritoException>()).Which.Status.Should().Be(409);
        db.ChangeTracker.Clear();
        db.Users.Single(x => x.Id == cliente.Id).PokemonFavorito.Should().Be("gengar",
            "desligar esconde, não apaga: ligando de novo o Pokémon volta");
    }
}
