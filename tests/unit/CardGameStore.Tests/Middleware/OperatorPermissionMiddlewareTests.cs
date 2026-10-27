// =============================================================================
// OperatorPermissionMiddlewareTests.cs — o que o operador pode chamar na API
// =============================================================================

using System.Reflection;
using CardGameStore.Controllers;
using CardGameStore.Middleware;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using D = CardGameStore.Middleware.OperatorPermissionMiddleware.Decisao;

namespace CardGameStore.Tests.Middleware;

public class OperatorPermissionMiddlewareTests
{
    private const string SoCampeonatos = "[\"campeonatos\"]";

    /// <summary>Endpoint com os atributos de autorização da classe e do método do controller.</summary>
    private static Endpoint EndpointDe<TController>(string metodo)
    {
        var m = typeof(TController).GetMethod(metodo)!;
        var metadados = typeof(TController).GetCustomAttributes(inherit: true)
            .Concat(m.GetCustomAttributes(inherit: true))
            .ToArray();
        return new Endpoint(_ => Task.CompletedTask, new EndpointMetadataCollection(metadados), metodo);
    }

    [Fact]
    public void RotaPublica_PassaParaOperador()
    {
        var rotaDeAdmin = OperatorPermissionMiddleware.EhRotaDeAdmin(EndpointDe<LigaMensalController>(nameof(LigaMensalController.GetRanking)));

        rotaDeAdmin.Should().BeFalse();
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal", "[]", rotaDeAdmin).Should().Be(D.Passa);
    }

    [Fact]
    public void RotaDeAdmin_DoMenuDele_Passa()
    {
        var rotaDeAdmin = OperatorPermissionMiddleware.EhRotaDeAdmin(EndpointDe<LigaMensalController>(nameof(LigaMensalController.CreateManualEntry)));

        rotaDeAdmin.Should().BeTrue();
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal/manual", SoCampeonatos, rotaDeAdmin).Should().Be(D.Passa);
    }

    [Fact]
    public void RotaDeAdmin_SemAPermissao_Recusa()
    {
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal/manual", "[\"pdv\"]", rotaDeAdmin: true)
            .Should().Be(D.SemPermissao);
    }

    [Fact]
    public void RotaSoDoDono_ContinuaFechada()
    {
        // OwnerOnly não é "rota de admin" pro middleware, mas o [Authorize] recusa pelo papel
        var endpoint = EndpointDe<FuncionalidadesController>(nameof(FuncionalidadesController.Definir));
        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Should().Contain(a => a.Policy == "OwnerOnly");
    }

    [Theory]
    [InlineData("campeonatos", "/api/torneios/123/painel")]
    [InlineData("campeonatos", "/api/deck/user/123")]
    [InlineData("estoque",     "/api/reservations")]
    [InlineData("estoque",     "/api/marketplace/listings")]
    [InlineData("estoque",     "/api/upload/image")]
    [InlineData("anuncios",    "/api/admin/mensageria/enviar")]
    [InlineData("anuncios",    "/api/upload/image")]
    [InlineData("financeiro",  "/api/contas-receber")]
    public void TelasDoMenu_Passam(string permissao, string path) =>
        OperatorPermissionMiddleware.Decidir(path, $"[\"{permissao}\"]", rotaDeAdmin: true).Should().Be(D.Passa);

    [Fact]
    public void OperadorSemPermissoes_SoNaoEntraEmRotaDeAdmin()
    {
        OperatorPermissionMiddleware.Decidir("/api/site-config", null, rotaDeAdmin: false).Should().Be(D.Passa);
        OperatorPermissionMiddleware.Decidir("/api/comanda", null, rotaDeAdmin: true).Should().Be(D.SemPermissoesConfiguradas);
    }

    [Fact]
    public void RotaDesconhecida_ContaComoDeAdmin() =>
        OperatorPermissionMiddleware.EhRotaDeAdmin(null).Should().BeTrue();

    [Fact]
    public void RotasDeLeituraPropria_SemprePassam()
    {
        OperatorPermissionMiddleware.Decidir("/api/championship/abc", SoCampeonatos, true).Should().Be(D.Passa);
        OperatorPermissionMiddleware.Decidir("/api/user/me", "[]", true).Should().Be(D.Passa);
    }

    // -------------------------------------------------------------------------
    // Trava de manutenção: rota de admin nova precisa de dono no mapa
    // -------------------------------------------------------------------------

    /// <summary>
    /// Rotas AdminOnly que, de propósito, nenhuma permissão de operador abre: na prática
    /// só o dono usa. Rota nova de admin que não é pra operador entra AQUI, com o motivo.
    /// </summary>
    private static readonly string[] SoODonoDeProposito =
    [
        "/api/site-config",                 // personalização do site (menu "Configuração", só dono)
        "/api/ai",                          // assistente IA do painel
        "/api/admin/vigia",                 // alertas do sistema (Configuração → Alertas, só dono)
        "/api/auth",                        // ignorada pelo middleware
    ];

    [Fact]
    public void TodaRotaAdminOnly_TemPermissaoQueAbre_OuEstaNaListaDoDono()
    {
        var semDono = new List<string>();

        foreach (var controller in typeof(LigaMensalController).Assembly.GetTypes()
                     .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract))
        {
            var rotaClasse = controller.GetCustomAttribute<RouteAttribute>()?.Template ?? "";
            var nome = controller.Name.Replace("Controller", "").ToLowerInvariant();
            var baseRota = "/" + rotaClasse.Replace("[controller]", nome).ToLowerInvariant();

            foreach (var metodo in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var metadados = controller.GetCustomAttributes(true).Concat(metodo.GetCustomAttributes(true)).ToArray();
                var endpoint = new Endpoint(_ => Task.CompletedTask, new EndpointMetadataCollection(metadados), metodo.Name);
                if (!metodo.GetCustomAttributes<HttpMethodAttribute>().Any() || !OperatorPermissionMiddleware.EhRotaDeAdmin(endpoint))
                    continue;

                var molde = metodo.GetCustomAttributes<HttpMethodAttribute>().First().Template;
                var rota = (molde is null ? baseRota : $"{baseRota}/{molde}").ToLowerInvariant();

                var abre = Permissao.Todos.Any(p => Permissao.OperadorPode([p], rota));
                var doDono = SoODonoDeProposito.Any(r => rota.StartsWith(r));
                if (!abre && !doDono) semDono.Add($"{controller.Name}.{metodo.Name} → {rota}");
            }
        }

        semDono.Should().BeEmpty(
            "toda rota de admin precisa estar em Permissao.RotasPrefixo (Models/PostgreSQL/Perfil.cs) " +
            "ou, se for só do dono, em SoODonoDeProposito neste teste");
    }
}
