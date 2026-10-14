using System.Diagnostics;

namespace CardGameStore.Middleware;

/// <summary>
/// Uma linha no log só pro pedido que merece atenção:
///   erro do servidor (5xx)        → Error
///   barrado pelo limite (429)     → Warning
///   lento (2 s ou mais)           → Warning
///   recusado pelo servidor (4xx)  → Information — menos 404 (robô procurando página) e
///                                   401 fora de /api/auth (token vencido; o site renova sozinho)
///
/// Os 4xx ficam de propósito: a "sessão morta" de 01/09/2026 era /api/auth/refresh
/// devolvendo 400 em sequência, e só deu pra achar quando os pedidos voltaram pro log.
///
/// Antes o próprio ASP.NET narrava todo pedido em ~6 linhas ("Request starting",
/// "Route matched", "Executing endpoint"…): 1.300 linhas por hora numa manhã calma, e
/// o erro de verdade se perdia no meio. Pra voltar a ver tudo sem mexer no código:
///   LOG_ASPNETCORE=Information no deploy/.env da VPS e `bash rollout.sh api` (troca sem queda)
/// </summary>
public class PedidosNoLogMiddleware
{
    internal const int LentoMs = 2000;

    private readonly RequestDelegate _next;
    private readonly ILogger<PedidosNoLogMiddleware> _logger;

    public PedidosNoLogMiddleware(RequestDelegate next, ILogger<PedidosNoLogMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    /// <summary>Nível do registro do pedido, ou null quando ele não precisa aparecer.</summary>
    internal static LogLevel? Nivel(string caminho, int status, long ms)
    {
        if (status >= 500) return LogLevel.Error;
        if (status == StatusCodes.Status429TooManyRequests) return LogLevel.Warning;
        // Tempo real (SignalR) fica conectado por minutos: demorar é o normal dele
        var tempoReal = caminho.StartsWith("/hubs", StringComparison.OrdinalIgnoreCase);
        if (ms >= LentoMs && !tempoReal) return LogLevel.Warning;
        if (status == StatusCodes.Status404NotFound) return null;
        if (status == StatusCodes.Status401Unauthorized
            && !caminho.StartsWith("/api/auth", StringComparison.OrdinalIgnoreCase)) return null;
        if (status >= 400) return LogLevel.Information;
        return null;
    }

    /// <summary>
    /// O caminho vem de quem fez o pedido: "/x%0Ainfo: ..." viraria uma linha falsa no log
    /// (que agora é uma linha por mensagem). Quebra de linha sai antes de gravar.
    /// </summary>
    internal static string SemQuebra(string valor) => valor.Replace("\r", "").Replace("\n", "");

    public async Task InvokeAsync(HttpContext context)
    {
        var relogio = Stopwatch.StartNew();
        var estourou = false;
        try
        {
            await _next(context);
        }
        catch
        {
            estourou = true; // o ASP.NET registra a exceção em si; aqui fica o pedido que a causou
            throw;
        }
        finally
        {
            var status = estourou ? StatusCodes.Status500InternalServerError : context.Response.StatusCode;
            var ms = relogio.ElapsedMilliseconds;
            // Sem a query: link de pagamento e redefinição de senha levam token nela
            var caminho = context.Request.Path.Value ?? "/";
            if (Nivel(caminho, status, ms) is { } nivel)
                _logger.Log(nivel, "{Metodo} {Caminho} → {Status} em {Ms} ms",
                    SemQuebra(context.Request.Method), SemQuebra(caminho), status, ms);
        }
    }
}

public static class PedidosNoLogMiddlewareExtensions
{
    public static IApplicationBuilder UsePedidosNoLog(this IApplicationBuilder app) =>
        app.UseMiddleware<PedidosNoLogMiddleware>();
}
