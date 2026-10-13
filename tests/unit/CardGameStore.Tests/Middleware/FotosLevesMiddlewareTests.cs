// =============================================================================
// FotosLevesMiddlewareTests.cs — "/uploads/x.png?w=480" e a chave fotos-leves
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Middleware;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;

namespace CardGameStore.Tests.Middleware;

public sealed class FotosLevesMiddlewareTests : IDisposable
{
    private readonly string _uploads = Path.Combine(Path.GetTempPath(), "fotos-mw-" + Guid.NewGuid().ToString("N"));
    private readonly FotosLeves _fotos;
    private readonly FuncionalidadesService _funcionalidades;

    public FotosLevesMiddlewareTests()
    {
        Directory.CreateDirectory(_uploads);
        using var bmp = new SKBitmap(1200, 600);
        using (var tela = new SKCanvas(bmp)) tela.Clear(SKColors.SteelBlue);
        using var img = SKImage.FromBitmap(bmp);
        using var dados = img.Encode(SKEncodedImageFormat.Png, 100);
        using (var f = File.Create(Path.Combine(_uploads, "banner.png"))) dados.SaveTo(f);

        _fotos = new FotosLeves(_uploads, NullLogger<FotosLeves>.Instance);
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        _funcionalidades = new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions()));
    }

    public void Dispose()
    {
        try { Directory.Delete(_uploads, recursive: true); } catch { /* temp */ }
    }

    /// <summary>Roda o middleware; devolve o contexto e se ele passou adiante (pra servir a original).</summary>
    private async Task<(HttpContext Ctx, bool PassouAdiante)> Pedir(string caminho, string? query)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "GET";
        ctx.Request.Path = caminho;
        if (query is not null) ctx.Request.QueryString = new QueryString(query);
        ctx.Response.Body = new MemoryStream();
        var passou = false;
        var mw = new FotosLevesMiddleware(_ => { passou = true; return Task.CompletedTask; });
        await mw.InvokeAsync(ctx, _fotos, _funcionalidades);
        return (ctx, passou);
    }

    [Fact]
    public async Task ComW_ChaveLigada_ServeAMiniaturaWebp()
    {
        var (ctx, passou) = await Pedir("/uploads/banner.png", "?w=480");

        passou.Should().BeFalse();
        ctx.Response.ContentType.Should().Be("image/webp");
        ctx.Response.Headers["X-Foto-Leve"].ToString().Should().Be("480");
        ctx.Response.Body.Length.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task ChaveDesligada_IgnoraOW_EServeAOriginal()
    {
        await _funcionalidades.DefinirAsync(Funcionalidades.FotosLeves, false, Guid.NewGuid());

        var (ctx, passou) = await Pedir("/uploads/banner.png", "?w=480");

        passou.Should().BeTrue();
        ctx.Response.ContentType.Should().BeNull();
    }

    [Theory]
    [InlineData("/uploads/banner.png", null)]        // sem ?w: a original
    [InlineData("/uploads/banner.png", "?w=abc")]
    [InlineData("/uploads/banner.png", "?w=0")]
    [InlineData("/uploads/nao-existe.png", "?w=480")] // foto que não dá: a original (404 do static files)
    [InlineData("/api/product", "?w=480")]            // fora de /uploads
    public async Task SemMiniatura_PassaAdiante(string caminho, string? query)
    {
        var (_, passou) = await Pedir(caminho, query);

        passou.Should().BeTrue();
    }
}
