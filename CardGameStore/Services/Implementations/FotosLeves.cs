// =============================================================================
// FotosLeves.cs — miniatura WebP das fotos enviadas (/uploads/x.png?w=480)
//
// O Maikon sobe foto de produto do jeito que vem (PNG de 1–2 MB, 1600–2560 px) e o
// card mostra ela com 190 px: a página inicial baixava ~4 MB, 3,6 MB só de foto.
// Aqui a foto é reduzida pra largura pedida e regravada em WebP, uma vez só — fica
// guardada em uploads/.leves/ (volume persistente) e a Cloudflare guarda o resto.
// Vale pras fotos antigas também: nada muda no banco nem no endereço da foto.
//
// Quem chama: Middleware/FotosLevesMiddleware.cs.
// =============================================================================

using SkiaSharp;

namespace CardGameStore.Services.Implementations;

public sealed class FotosLeves
{
    /// <summary>Larguras servidas. Pedido fora da lista sobe pra próxima (ou a maior).</summary>
    public static readonly int[] Larguras = [160, 320, 480, 640, 960, 1280];

    /// <summary>Foto com mais pixels que isso não é reduzida (decodificar comeria a memória da API).</summary>
    private const long MaxPixels = 40_000_000;

    private const int QualidadeWebp = 80;

    private static readonly HashSet<string> Extensoes = new(StringComparer.OrdinalIgnoreCase)
        { ".png", ".jpg", ".jpeg", ".webp" };

    // 1 vCPU na VPS: uma foto reduzida por vez. As seguintes esperam (e acham pronta no disco).
    private static readonly SemaphoreSlim UmaPorVez = new(1, 1);

    private readonly string _uploads;
    private readonly string _cache;
    private readonly ILogger<FotosLeves> _logger;

    public FotosLeves(IWebHostEnvironment env, ILogger<FotosLeves> logger)
        : this(Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "uploads"), logger) { }

    /// <param name="pastaUploads">A pasta servida em /uploads (testes usam uma temporária).</param>
    public FotosLeves(string pastaUploads, ILogger<FotosLeves> logger)
    {
        _uploads = Path.GetFullPath(pastaUploads);
        _cache = Path.Combine(_uploads, ".leves");
        _logger = logger;
    }

    /// <summary>Largura da lista que atende o pedido: a primeira ≥ pedida, ou a maior.</summary>
    public static int LarguraServida(int pedida)
    {
        foreach (var largura in Larguras)
            if (largura >= pedida) return largura;
        return Larguras[^1];
    }

    /// <summary>
    /// Caminho do arquivo WebP pronto pra servir, ou null quando a foto não pode ser
    /// reduzida (não existe, caminho fora de /uploads, formato estranho, grande demais).
    /// Com null, quem chama serve a foto original — nunca quebra a imagem.
    /// </summary>
    /// <param name="caminhoUrl">O caminho da URL, ex.: "/uploads/abc.png".</param>
    public async Task<string?> MiniaturaAsync(string caminhoUrl, int larguraPedida, CancellationToken ct = default)
    {
        var original = ArquivoOriginal(caminhoUrl);
        if (original is null) return null;

        var largura = LarguraServida(larguraPedida);
        var relativo = Path.GetRelativePath(_uploads, original);
        var destino = Path.Combine(_cache, $"{relativo}.w{largura}.webp");
        if (Pronta(destino, original)) return destino;

        await UmaPorVez.WaitAsync(ct);
        try
        {
            if (Pronta(destino, original)) return destino; // outro pedido fez enquanto esperava
            return Gerar(original, destino, largura) ? destino : null;
        }
        finally
        {
            UmaPorVez.Release();
        }
    }

    /// <summary>O arquivo em disco da URL, só se estiver dentro de /uploads (fora da pasta de miniaturas).</summary>
    private string? ArquivoOriginal(string caminhoUrl)
    {
        const string prefixo = "/uploads/";
        if (!caminhoUrl.StartsWith(prefixo, StringComparison.OrdinalIgnoreCase)) return null;

        var relativo = caminhoUrl[prefixo.Length..];
        if (relativo.Length == 0 || !Extensoes.Contains(Path.GetExtension(relativo))) return null;

        var completo = Path.GetFullPath(Path.Combine(_uploads, relativo));
        var dentro = completo.StartsWith(_uploads + Path.DirectorySeparatorChar, StringComparison.Ordinal);
        var naCache = completo.StartsWith(_cache + Path.DirectorySeparatorChar, StringComparison.Ordinal);
        return dentro && !naCache && File.Exists(completo) ? completo : null;
    }

    /// <summary>Miniatura existe e é mais nova que a foto (foto trocada no mesmo nome refaz).</summary>
    private static bool Pronta(string destino, string original) =>
        File.Exists(destino) && File.GetLastWriteTimeUtc(destino) >= File.GetLastWriteTimeUtc(original);

    private bool Gerar(string original, string destino, int largura)
    {
        try
        {
            using var codec = SKCodec.Create(original);
            if (codec is null) return false;
            if ((long)codec.Info.Width * codec.Info.Height > MaxPixels) return false;

            using var lida = SKBitmap.Decode(codec);
            if (lida is null) return false;
            using var virada = Endireitar(lida, codec.EncodedOrigin);
            var foto = virada ?? lida;

            // Nunca aumenta: foto menor que a largura pedida só troca de formato
            SKBitmap? reduzida = null;
            if (foto.Width > largura)
            {
                var altura = Math.Max(1, (int)Math.Round(foto.Height * (double)largura / foto.Width));
                reduzida = foto.Resize(new SKImageInfo(largura, altura, foto.ColorType, foto.AlphaType),
                                       new SKSamplingOptions(SKCubicResampler.Mitchell));
                if (reduzida is null) return false;
            }

            using (reduzida)
            using (var imagem = SKImage.FromBitmap(reduzida ?? foto))
            using (var dados = imagem.Encode(SKEncodedImageFormat.Webp, QualidadeWebp))
            {
                if (dados is null) return false;
                Directory.CreateDirectory(Path.GetDirectoryName(destino)!);
                // Grava ao lado e troca: quem ler no meio nunca pega arquivo pela metade
                var temporario = $"{destino}.{Guid.NewGuid():N}.tmp";
                using (var arquivo = File.Create(temporario))
                    dados.SaveTo(arquivo);
                File.Move(temporario, destino, overwrite: true);
            }
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Não deu pra reduzir a foto {Foto}; vai a original.", original);
            return false;
        }
    }

    /// <summary>
    /// Foto de celular vem "deitada" com a orientação no EXIF: o navegador gira a
    /// original sozinho, mas a miniatura sai sem EXIF — então gira aqui. Null = já está em pé.
    /// </summary>
    internal static SKBitmap? Endireitar(SKBitmap foto, SKEncodedOrigin origem)
    {
        // As 8 orientações do EXIF = girar (sentido horário) e, nas espelhadas, virar na horizontal
        var (graus, espelha) = origem switch
        {
            SKEncodedOrigin.TopRight    => (0, true),
            SKEncodedOrigin.BottomRight => (180, false),
            SKEncodedOrigin.BottomLeft  => (180, true),
            SKEncodedOrigin.LeftTop     => (90, true),
            SKEncodedOrigin.RightTop    => (90, false),
            SKEncodedOrigin.RightBottom => (270, true),
            SKEncodedOrigin.LeftBottom  => (270, false),
            _                           => (0, false),
        };
        if (graus == 0 && !espelha) return null;

        var deitada = graus is 90 or 270;
        var (w, h) = deitada ? (foto.Height, foto.Width) : (foto.Width, foto.Height);
        var certa = new SKBitmap(new SKImageInfo(w, h, foto.ColorType, foto.AlphaType));
        using var tela = new SKCanvas(certa);
        tela.Clear(SKColors.Transparent);
        tela.Translate(w / 2f, h / 2f);
        if (espelha) tela.Scale(-1, 1);   // aplicado depois do giro (a ordem do canvas é inversa)
        tela.RotateDegrees(graus);
        tela.Translate(-foto.Width / 2f, -foto.Height / 2f);
        tela.DrawBitmap(foto, 0, 0);
        return certa;
    }
}
