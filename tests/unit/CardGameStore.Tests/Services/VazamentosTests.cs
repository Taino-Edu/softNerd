// =============================================================================
// VazamentosTests.cs — achados do teste de vazamentos (04/11)
// - a lista de inscritos de um campeonato (com quem pagou, como e quanto) era aberta a qualquer
//   cliente logado; só o admin/operador usa
// - login, cadastro e falha de envio gravavam o e-mail inteiro no log
// =============================================================================

using System.Reflection;
using CardGameStore.Common;
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

    [Theory]
    [InlineData("maikon@gmail.com", "m***@gmail.com")]
    [InlineData("ab@x.com", "a*@x.com")]
    [InlineData("a@x.com", "*@x.com")]
    [InlineData("sem-arroba", "***")]
    [InlineData("", "***")]
    [InlineData(null, "***")]
    public void EmailNoLog_SaiMascarado(string? email, string esperado) =>
        Mascara.Email(email).Should().Be(esperado);
}
