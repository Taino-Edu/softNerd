using CardGameStore.Services.Implementations;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;

namespace CardGameStore.Tests.Services;

/// <summary>Miniatura WebP das fotos de /uploads (FotosLeves.cs).</summary>
public sealed class FotosLevesTests : IDisposable
{
    private readonly string _uploads = Path.Combine(Path.GetTempPath(), "fotos-leves-" + Guid.NewGuid().ToString("N"));
    private readonly FotosLeves _fotos;

    public FotosLevesTests()
    {
        Directory.CreateDirectory(_uploads);
        _fotos = new FotosLeves(_uploads, NullLogger<FotosLeves>.Instance);
    }

    public void Dispose()
    {
        try { Directory.Delete(_uploads, recursive: true); } catch { /* temp */ }
    }

    private string Png(string nome, int largura, int altura)
    {
        using var bmp = new SKBitmap(largura, altura);
        using (var tela = new SKCanvas(bmp)) tela.Clear(SKColors.OrangeRed);
        var caminho = Path.Combine(_uploads, nome);
        Directory.CreateDirectory(Path.GetDirectoryName(caminho)!);
        using var img = SKImage.FromBitmap(bmp);
        using var dados = img.Encode(SKEncodedImageFormat.Png, 100);
        using var f = File.Create(caminho);
        dados.SaveTo(f);
        return caminho;
    }

    private static SKImageInfo Info(string caminho)
    {
        using var codec = SKCodec.Create(caminho);
        return codec.Info;
    }

    [Fact]
    public async Task FotoGrande_SaiWebpNaLarguraPedida_ComAMesmaProporcao()
    {
        Png("produto.png", 1600, 800);

        var mini = await _fotos.MiniaturaAsync("/uploads/produto.png", 480);

        mini.Should().NotBeNull();
        mini!.Should().EndWith(".w480.webp");
        using (var codec = SKCodec.Create(mini)) codec.EncodedFormat.Should().Be(SKEncodedImageFormat.Webp);
        Info(mini).Width.Should().Be(480);
        Info(mini).Height.Should().Be(240);
        new FileInfo(mini).Length.Should().BeLessThan(new FileInfo(Path.Combine(_uploads, "produto.png")).Length);
    }

    [Theory]
    [InlineData(1, 160)]
    [InlineData(300, 320)]
    [InlineData(480, 480)]
    [InlineData(500, 640)]
    [InlineData(99999, 1280)]
    public void LarguraForaDaLista_SobeProProximoTamanho(int pedida, int servida) =>
        FotosLeves.LarguraServida(pedida).Should().Be(servida);

    [Fact]
    public async Task FotoMenorQueOPedido_NaoAumenta_SoTrocaOFormato()
    {
        Png("pequena.png", 200, 100);

        var mini = await _fotos.MiniaturaAsync("/uploads/pequena.png", 960);

        Info(mini!).Width.Should().Be(200);
    }

    [Fact]
    public async Task SegundoPedido_UsaAMiniaturaGuardada()
    {
        Png("x.png", 1000, 1000);
        var primeira = await _fotos.MiniaturaAsync("/uploads/x.png", 320);
        var gravadaEm = File.GetLastWriteTimeUtc(primeira!);

        var segunda = await _fotos.MiniaturaAsync("/uploads/x.png", 300); // mesma largura servida

        segunda.Should().Be(primeira);
        File.GetLastWriteTimeUtc(segunda!).Should().Be(gravadaEm);
    }

    [Fact]
    public async Task FotoEmSubpasta_Funciona()
    {
        Png(Path.Combine("marketplace", "carta.png"), 900, 1200);

        var mini = await _fotos.MiniaturaAsync("/uploads/marketplace/carta.png", 320);

        Info(mini!).Width.Should().Be(320);
    }

    [Theory]
    [InlineData("/uploads/../segredo.png")]          // sai da pasta
    [InlineData("/uploads/..%2fsegredo.png")]
    [InlineData("/uploads/nao-existe.png")]
    [InlineData("/uploads/arquivo.txt")]              // não é foto
    [InlineData("/outra-pasta/produto.png")]
    [InlineData("/uploads/")]
    public async Task CaminhoInvalido_DevolveNull_EServeAOriginal(string caminho)
    {
        Png("produto.png", 800, 800);
        File.WriteAllText(Path.Combine(_uploads, "arquivo.txt"), "oi");
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(_uploads)!, "segredo.png"), "não é pra sair");

        (await _fotos.MiniaturaAsync(caminho, 480)).Should().BeNull();
    }

    [Fact]
    public async Task MiniaturaDeMiniatura_NaoExiste()
    {
        Png("produto.png", 1000, 1000);
        await _fotos.MiniaturaAsync("/uploads/produto.png", 480);

        (await _fotos.MiniaturaAsync("/uploads/.leves/produto.png.w480.webp", 160)).Should().BeNull();
    }

    [Fact]
    public async Task ArquivoQueNaoEImagem_ComExtensaoDeFoto_DevolveNull()
    {
        File.WriteAllText(Path.Combine(_uploads, "falsa.png"), "isto não é um PNG");

        (await _fotos.MiniaturaAsync("/uploads/falsa.png", 480)).Should().BeNull();
    }

    [Fact]
    public async Task FotoTrocadaNoMesmoNome_RefazAMiniatura()
    {
        var original = Png("troca.png", 1000, 500);
        var mini = await _fotos.MiniaturaAsync("/uploads/troca.png", 480);
        Info(mini!).Height.Should().Be(240);

        Png("troca.png", 1000, 1000);
        File.SetLastWriteTimeUtc(original, DateTime.UtcNow.AddMinutes(1));
        var refeita = await _fotos.MiniaturaAsync("/uploads/troca.png", 480);

        Info(refeita!).Height.Should().Be(480);
    }

    /// <summary>
    /// As 8 orientações do EXIF, pixel a pixel numa foto 3×2 com uma cor por pixel:
    /// (x, y) da foto gravada → (x, y) de como ela tem que aparecer.
    /// </summary>
    [Theory]
    [InlineData(SKEncodedOrigin.TopLeft)]
    [InlineData(SKEncodedOrigin.TopRight)]
    [InlineData(SKEncodedOrigin.BottomRight)]
    [InlineData(SKEncodedOrigin.BottomLeft)]
    [InlineData(SKEncodedOrigin.LeftTop)]
    [InlineData(SKEncodedOrigin.RightTop)]
    [InlineData(SKEncodedOrigin.RightBottom)]
    [InlineData(SKEncodedOrigin.LeftBottom)]
    public void FotoDeCelular_GiradaOuEspelhada_FicaComoONavegadorMostra(SKEncodedOrigin origem)
    {
        const int W = 3, H = 2;
        using var gravada = new SKBitmap(new SKImageInfo(W, H, SKColorType.Rgba8888, SKAlphaType.Premul));
        SKColor Cor(int x, int y) => new((byte)(40 + x * 60), (byte)(40 + y * 120), 200);
        for (var y = 0; y < H; y++)
            for (var x = 0; x < W; x++)
                gravada.SetPixel(x, y, Cor(x, y));

        Func<int, int, (int X, int Y)> destino = origem switch
        {
            SKEncodedOrigin.TopRight    => (x, y) => (W - 1 - x, y),
            SKEncodedOrigin.BottomRight => (x, y) => (W - 1 - x, H - 1 - y),
            SKEncodedOrigin.BottomLeft  => (x, y) => (x, H - 1 - y),
            SKEncodedOrigin.LeftTop     => (x, y) => (y, x),                 // transposta
            SKEncodedOrigin.RightTop    => (x, y) => (H - 1 - y, x),         // 90° horário
            SKEncodedOrigin.RightBottom => (x, y) => (H - 1 - y, W - 1 - x), // transversa
            SKEncodedOrigin.LeftBottom  => (x, y) => (y, W - 1 - x),         // 270° horário
            _                           => (x, y) => (x, y),
        };

        using var certa = FotosLeves.Endireitar(gravada, origem);
        var resultado = certa ?? gravada;

        var deitada = origem is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
                              or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        resultado.Width.Should().Be(deitada ? H : W);
        resultado.Height.Should().Be(deitada ? W : H);
        for (var y = 0; y < H; y++)
            for (var x = 0; x < W; x++)
            {
                var (dx, dy) = destino(x, y);
                resultado.GetPixel(dx, dy).Should().Be(Cor(x, y), $"pixel ({x},{y}) da foto gravada vai pra ({dx},{dy})");
            }
    }

    [Fact]
    public async Task VariosPedidosAoMesmoTempo_GeramUmArquivoInteiro()
    {
        Png("concorrida.png", 1600, 1600);

        var resultados = await Task.WhenAll(Enumerable.Range(0, 8)
            .Select(_ => _fotos.MiniaturaAsync("/uploads/concorrida.png", 640)));

        resultados.Should().OnlyContain(r => r != null && r.EndsWith(".w640.webp"));
        Info(resultados[0]!).Width.Should().Be(640);
        Directory.GetFiles(Path.Combine(_uploads, ".leves"), "*.tmp").Should().BeEmpty();
    }
}
