// =============================================================================
// VazamentosTests.cs — achados do teste de vazamentos (04/11)
// - a lista de inscritos de um campeonato (com quem pagou, como e quanto) era aberta a qualquer
//   cliente logado; só o admin/operador usa
// (o e-mail saiu do log do servidor: conferido pelo CodeQL no CI, não por teste)
// =============================================================================

using System.Reflection;
using CardGameStore.Controllers;
using Microsoft.AspNetCore.Authorization;

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
}
