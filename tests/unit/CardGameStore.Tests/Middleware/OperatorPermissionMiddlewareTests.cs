// =============================================================================
// OperatorPermissionMiddlewareTests.cs — o que o operador pode chamar na API
//
// Chave "operador-acesso-pelo-menu": ligada = regra nova; desligada = regra de
// antes da v1.41.0 (toda rota fora do mapa dava 403, até as públicas).
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

    // -------------------------------------------------------------------------
    // Regra nova (chave ligada)
    // -------------------------------------------------------------------------

    [Fact]
    public void RotaPublica_PassaParaOperador()
    {
        var rotaDeAdmin = OperatorPermissionMiddleware.EhRotaDeAdmin(EndpointDe<LigaMensalController>(nameof(LigaMensalController.GetRanking)));

        rotaDeAdmin.Should().BeFalse();
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal", "[]", rotaDeAdmin, acessoPeloMenu: true).Should().Be(D.Passa);
    }

    [Fact]
    public void RotaDeAdmin_DoMenuDele_Passa()
    {
        var rotaDeAdmin = OperatorPermissionMiddleware.EhRotaDeAdmin(EndpointDe<LigaMensalController>(nameof(LigaMensalController.CreateManualEntry)));

        rotaDeAdmin.Should().BeTrue();
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal/manual", SoCampeonatos, rotaDeAdmin, true).Should().Be(D.Passa);
    }

    [Fact]
    public void RotaDeAdmin_SemAPermissao_Recusa()
    {
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal/manual", "[\"pdv\"]", rotaDeAdmin: true, true)
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
    public void TelasDoMenuQueDavam403_AgoraPassam(string permissao, string path)
    {
        var claim = $"[\"{permissao}\"]";

        OperatorPermissionMiddleware.Decidir(path, claim, rotaDeAdmin: true, acessoPeloMenu: true).Should().Be(D.Passa);
        OperatorPermissionMiddleware.Decidir(path, claim, rotaDeAdmin: true, acessoPeloMenu: false).Should().Be(D.SemPermissao);
    }

    [Fact]
    public void OperadorSemPermissoes_SoNaoEntraEmRotaDeAdmin()
    {
        OperatorPermissionMiddleware.Decidir("/api/site-config", null, rotaDeAdmin: false, true).Should().Be(D.Passa);
        OperatorPermissionMiddleware.Decidir("/api/comanda", null, rotaDeAdmin: true, true).Should().Be(D.SemPermissoesConfiguradas);
    }

    [Fact]
    public void RotaDesconhecida_ContaComoDeAdmin() =>
        OperatorPermissionMiddleware.EhRotaDeAdmin(null).Should().BeTrue();

    // -------------------------------------------------------------------------
    // Fallback (chave desligada) — a regra antiga, igualzinha
    // -------------------------------------------------------------------------

    [Fact]
    public void Fallback_RotaPublicaForaDoMapa_Da403_ComoAntes()
    {
        OperatorPermissionMiddleware.Decidir("/api/liga-mensal", SoCampeonatos, rotaDeAdmin: false, acessoPeloMenu: false)
            .Should().Be(D.SemPermissao);
        OperatorPermissionMiddleware.Decidir("/api/site-config", null, rotaDeAdmin: false, false)
            .Should().Be(D.SemPermissoesConfiguradas);
    }

    [Fact]
    public void Fallback_RotasDoMapaAntigo_ContinuamPassando()
    {
        OperatorPermissionMiddleware.Decidir("/api/championship/abc", SoCampeonatos, true, false).Should().Be(D.Passa);
        OperatorPermissionMiddleware.Decidir("/api/user/me", "[]", true, false).Should().Be(D.Passa);
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
        "/api/fiscal",                      // certificado A1, emissão fiscal
        "/api/site-config",                 // personalização do site (menu "Configuração", só dono)
        "/api/admin/whatsapp",              // pareamento do WhatsApp da loja
        "/api/integrations/tenant-erp",     // integração com o ERP
        "/api/ai",                          // assistente IA do painel
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

                var abre = Permissao.Todos.Any(p => Permissao.OperadorPode([p], rota, comRotasDesdeV141: true));
                var doDono = SoODonoDeProposito.Any(r => rota.StartsWith(r));
                if (!abre && !doDono) semDono.Add($"{controller.Name}.{metodo.Name} → {rota}");
            }
        }

        semDono.Should().BeEmpty(
            "toda rota de admin precisa estar em Permissao.RotasPrefixo (Models/PostgreSQL/Perfil.cs) " +
            "ou, se for só do dono, em SoODonoDeProposito neste teste");
    }
}
