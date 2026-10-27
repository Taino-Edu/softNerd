using CardGameStore.Services.Implementations;

namespace CardGameStore.Middleware;

/// <summary>
/// "/uploads/foto.png?w=480" devolve a miniatura WebP da foto (Services/Implementations/FotosLeves.cs).
/// Sem "?w", ou com a foto que não dá pra reduzir, segue pro UseStaticFiles e sai a original.
/// </summary>
public class FotosLevesMiddleware
{
    private readonly RequestDelegate _next;

    public FotosLevesMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, FotosLeves fotos)
    {
        var req = context.Request;
        if ((HttpMethods.IsGet(req.Method) || HttpMethods.IsHead(req.Method))
            && req.Path.StartsWithSegments("/uploads")
            && int.TryParse(req.Query["w"], out var largura) && largura > 0)
        {
            var miniatura = await fotos.MiniaturaAsync(req.Path.Value!, largura, context.RequestAborted);
            if (miniatura is not null)
            {
                context.Response.ContentType = "image/webp";
                // 1 h no navegador / 1 dia na Cloudflare: foto trocada no mesmo nome aparece logo
                context.Response.Headers.CacheControl = "public, max-age=3600, s-maxage=86400";
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
