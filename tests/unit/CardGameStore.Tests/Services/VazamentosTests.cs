// =============================================================================
// VazamentosTests.cs — achados do teste de vazamentos
// - (04/11) a lista de inscritos de um campeonato (com quem pagou, como e quanto) era aberta a
//   qualquer cliente logado; só o admin/operador usa
// - (06/11) o produto saía com PREÇO DE CUSTO e MARGEM pra qualquer visitante do site
// (o e-mail saiu do log do servidor: conferido pelo CodeQL no CI, não por teste)
// =============================================================================

using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using CardGameStore.Controllers;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Tests.Services;

public class VazamentosTests
{
    [Fact]
    public void InscritosDoCampeonato_SoAdmin()
    {
        var acao = typeof(ChampionshipController).GetMethod(nameof(ChampionshipController.GetParticipants))!;

        acao.GetCustomAttributes<AuthorizeAttribute>().Should().Contain(a => a.Policy == "AdminOnly",
            "a lista traz se cada jogador pagou, como e quanto — não é de outro cliente");
    }

    // ── Produto sem custo pra quem não é da loja ─────────────────────────────

    private static readonly Product Produto = new()
    {
        Name = "Booster", Category = "Pokémon", PriceInCents = 8990, CostPriceInCents = 4885,
        StockQuantity = 3, MinimumStock = 5, IsActive = true,
    };

    private static ProductController Controller(string? papel)
    {
        var servico = new Mock<IProductService>();
        servico.Setup(s => s.GetAllActiveAsync()).ReturnsAsync(new[] { Produto });
        servico.Setup(s => s.GetByIdAsync(Produto.Id)).ReturnsAsync(Produto);
        servico.Setup(s => s.GetAllForAdminAsync()).ReturnsAsync(new[] { Produto });
        var identidade = papel is null
            ? new ClaimsIdentity()
            : new ClaimsIdentity([new Claim(ClaimTypes.Role, papel), new Claim("sub", Guid.NewGuid().ToString())], "teste");
        return new ProductController(servico.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identidade) } },
        };
    }

    private static string Json(IActionResult r) =>
        JsonSerializer.Serialize(((OkObjectResult)r).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Theory]
    [InlineData(null)]        // visitante
    [InlineData("Customer")]  // cliente logado
    public async Task Produto_SemCustoNemMargem_PraQuemNaoEDaLoja(string? papel)
    {
        var c = Controller(papel);
        foreach (var json in new[]
                 {
                     Json(await c.GetAll(null)), Json(await c.GetById(Produto.Id)), Json(await c.GetAllStore()),
                 })
        {
            json.Should().NotContain("costPrice").And.NotContain("margin").And.NotContain("minimumStock",
                "custo e margem são da loja — concorrente e fornecedor não podem ver");
            json.Should().Contain("\"priceInCents\":8990").And.Contain("\"isLowStock\":true",
                "o que a vitrine usa continua lá");
        }
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Operator")]
    public async Task Produto_ComCusto_PraAdminEOperador(string papel)
    {
        var json = Json(await Controller(papel).GetById(Produto.Id));

        json.Should().Contain("\"costPriceInCents\":4885", "o PDV e o estoque usam o custo");
    }
}
