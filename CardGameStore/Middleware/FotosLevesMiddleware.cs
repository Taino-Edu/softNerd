using CardGameStore.Configuration;
using CardGameStore.Services.Implementations;

namespace CardGameStore.Middleware;

/// <summary>
/// "/uploads/foto.png?w=480" devolve a miniatura WebP da foto (Services/Implementations/FotosLeves.cs).
/// Sem "?w", ou com a foto que não dá pra reduzir, segue pro UseStaticFiles e sai a original.
///
/// Chave "fotos-leves" (Configuration/Funcionalidades.cs):
///   ligada    → serve a miniatura
///   desligada → ignora o "?w" e serve a original, como antes da v1.44.0
/// </summary>
public class FotosLevesMiddleware
{
    private readonly RequestDelegate _next;

    public FotosLevesMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, FotosLeves fotos, FuncionalidadesService funcionalidades)
    {
        var req = context.Request;
        if ((HttpMethods.IsGet(req.Method) || HttpMethods.IsHead(req.Method))
            && req.Path.StartsWithSegments("/uploads")
            && int.TryParse(req.Query["w"], out var largura) && largura > 0
            && await funcionalidades.LigadaAsync(Funcionalidades.FotosLeves))
        {
            var miniatura = await fotos.MiniaturaAsync(req.Path.Value!, largura, context.RequestAborted);
            if (miniatura is not null)
            {
                context.Response.ContentType = "image/webp";
                // O nome da miniatura muda se a foto mudar de largura servida; a foto em si
                // nunca é regravada no mesmo nome (upload gera nome novo), então pode cachear longo.
                context.Response.Headers.CacheControl = "public, max-age=2592000";
                context.Response.Headers["X-Foto-Leve"] = FotosLeves.LarguraServida(largura).ToString();
                if (HttpMethods.IsHead(req.Method))
                {
                    context.Response.ContentLength = new FileInfo(miniatura).Length;
                    return;
                }
                await context.Response.SendFileAsync(miniatura, context.RequestAborted);
                return;
            }
        }
        await _next(context);
    }
}

public static class FotosLevesMiddlewareExtensions
{
    public static IApplicationBuilder UseFotosLeves(this IApplicationBuilder app) =>
        app.UseMiddleware<FotosLevesMiddleware>();
}
