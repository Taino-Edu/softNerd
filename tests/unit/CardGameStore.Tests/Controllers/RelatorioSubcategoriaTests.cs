using CardGameStore.Controllers;
using CardGameStore.DTOs;
using FluentAssertions;
using Xunit;
using Cat = CardGameStore.Controllers.RelatoriosController.CategoriaCadastrada;

namespace CardGameStore.Tests.Controllers;

/// <summary>
/// Pedido do Maikon: vendas por subcategoria (Pokémon, One Piece…) com o total da
/// categoria-pai. O produto guarda só o nome da folha; o pai sai do cadastro.
/// </summary>
public class RelatorioSubcategoriaTests
{
    private static readonly Guid Cartas = Guid.NewGuid();
    private static readonly Guid Acessorios = Guid.NewGuid();

    private static RelatorioCategoria Linha(string nome, int qtd, decimal total) =>
        new() { Categoria = nome, QuantidadeVendida = qtd, TotalEmReais = total };

    [Fact]
    public void Subcategorias_FicamDebaixoDoPai_EOPaiEASomaDasFilhas()
    {
        var cadastro = new List<Cat>
        {
            new(Cartas, "Cartas", "🃏", null),
            new(Guid.NewGuid(), "Pokémon", "⚡", Cartas),
            new(Guid.NewGuid(), "One Piece", "🏴‍☠️", Cartas),
        };

        var grupos = RelatoriosController.AgruparPorCategoriaPai(
            [Linha("Pokémon", 10, 300m), Linha("One Piece", 4, 120m), Linha("Cartas", 1, 15m)], cadastro);

        var cartas = grupos.Should().ContainSingle().Subject;
        cartas.Categoria.Should().Be("Cartas");
        cartas.Emoji.Should().Be("🃏");
        cartas.QuantidadeVendida.Should().Be(15);
        cartas.TotalEmReais.Should().Be(435m, "o pai é sempre a soma das filhas, incluindo o vendido direto nele");
        cartas.Subcategorias.Select(s => s.Categoria).Should().Equal("Pokémon", "One Piece", "Cartas");
    }

    [Fact]
    public void ForaDoCadastro_EOProprioGrupo()
    {
        var grupos = RelatoriosController.AgruparPorCategoriaPai(
            [Linha("Outros", 2, 20m), Linha("Cartas TCG", 1, 5m)], []);

        grupos.Select(g => g.Categoria).Should().Equal("Outros", "Cartas TCG");
        grupos.Should().OnlyContain(g => g.Subcategorias.Count == 1);
    }

    [Fact]
    public void MesmoNomeEmDuasFamilias_NaoSomaNoPaiErrado()
    {
        var cadastro = new List<Cat>
        {
            new(Cartas, "Cartas", null, null),
            new(Acessorios, "Acessórios", null, null),
            new(Guid.NewGuid(), "Lançamentos", null, Cartas),
            new(Guid.NewGuid(), "Lançamentos", null, Acessorios),
        };

        var grupos = RelatoriosController.AgruparPorCategoriaPai([Linha("Lançamentos", 3, 90m)], cadastro);

        grupos.Should().ContainSingle().Which.Categoria.Should().Be("Lançamentos");
    }

    [Fact]
    public void NomeComOutraCaixa_AindaAchaOPai()
    {
        var cadastro = new List<Cat> { new(Cartas, "Cartas", null, null), new(Guid.NewGuid(), "Pokémon", null, Cartas) };

        var grupos = RelatoriosController.AgruparPorCategoriaPai([Linha("pokémon", 1, 10m)], cadastro);

        grupos.Should().ContainSingle().Which.Categoria.Should().Be("Cartas");
    }
}
