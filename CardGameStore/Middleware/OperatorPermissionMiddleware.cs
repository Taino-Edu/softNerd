using CardGameStore.Configuration;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace CardGameStore.Middleware;

/// <summary>
/// Verifica se um Operator tem a permissão necessária para acessar uma rota.
/// Admin sempre passa; Customer e anônimo seguem pro [Authorize] normal.
///
/// Chave "operador-acesso-pelo-menu" (Configuration/Funcionalidades.cs):
///   ligada    → só rota de admin (AdminOnly / papel Operator) é conferida no mapa de permissões,
///               que inclui as rotas de Permissao.RotasPrefixoDesdeV141; rota pública ou de cliente
///               vale pro operador como pra qualquer pessoa logada
///   desligada → regra de antes da v1.41.0: toda rota /api fora do mapa dá 403 pro operador,
///               inclusive as públicas (Liga Mensal, site-config…)
/// </summary>
public class OperatorPermissionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<OperatorPermissionMiddleware> _logger;

    public OperatorPermissionMiddleware(RequestDelegate next, ILogger<OperatorPermissionMiddleware> logger)
    {
        _next   = next;
        _logger = logger;
    }

    internal enum Decisao { Passa, SemPermissoesConfiguradas, SemPermissao }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";

        // Só verificar rotas /api/ (exceto auth e health)
        if (!path.StartsWith("/api/") || path.StartsWith("/api/auth") || path == "/health")
        {
            await _next(context);
            return;
        }

        var user = context.User;
        if (user.FindFirst(ClaimTypes.Role)?.Value != UserRole.Operator || user.Identity?.IsAuthenticated != true)
        {
            await _next(context);
            return;
        }

        var acessoPeloMenu = await context.RequestServices.GetRequiredService<FuncionalidadesService>()
            .LigadaAsync(Funcionalidades.OperadorAcessoPeloMenu);

        var decisao = Decidir(path, user.FindFirst("permissions")?.Value, EhRotaDeAdmin(context.GetEndpoint()), acessoPeloMenu);
        if (decisao == Decisao.Passa)
        {
            await _next(context);
            return;
        }

        if (decisao == Decisao.SemPermissao)
            _logger.LogWarning("Operator {UserId} sem permissão para {Path}", user.FindFirst("sub")?.Value, path);

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new
        {
            Message = decisao == Decisao.SemPermissoesConfiguradas
                ? "Operador sem permissões configuradas."
                : "Sem permissão para esta ação.",
        });
    }

    /// <summary>Regra pura (testada em OperatorPermissionMiddlewareTests).</summary>
    internal static Decisao Decidir(string path, string? permissionsClaim, bool rotaDeAdmin, bool acessoPeloMenu)
    {
        if (acessoPeloMenu && !rotaDeAdmin) return Decisao.Passa;

        if (string.IsNullOrEmpty(permissionsClaim)) return Decisao.SemPermissoesConfiguradas;

        string[] permissoes;
        try { permissoes = System.Text.Json.JsonSerializer.Deserialize<string[]>(permissionsClaim) ?? []; }
        catch { permissoes = []; }

        // Sempre permite rotas genéricas de leitura própria
        if (path.StartsWith("/api/user/me") || path.StartsWith("/api/comanda/mesa")) return Decisao.Passa;

        return Permissao.OperadorPode(permissoes, path, comRotasDesdeV141: acessoPeloMenu)
            ? Decisao.Passa
            : Decisao.SemPermissao;
    }

    /// <summary>Rota que só a equipe usa: [Authorize(Policy = "AdminOnly")] ou papel Operator.</summary>
    internal static bool EhRotaDeAdmin(Endpoint? endpoint)
    {
        if (endpoint is null) return true; // rota desconhecida: na dúvida, confere
        if (endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null) return false;

        return endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Any(a =>
            a.Policy == "AdminOnly"
            || (a.Roles?.Split(',').Any(r => r.Trim() == UserRole.Operator) ?? false));
    }
}

public static class OperatorPermissionMiddlewareExtensions
{
    public static IApplicationBuilder UseOperatorPermissions(this IApplicationBuilder app) =>
        app.UseMiddleware<OperatorPermissionMiddleware>();
}
