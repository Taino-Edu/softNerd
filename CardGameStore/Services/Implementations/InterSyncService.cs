using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CardGameStore.Services.Implementations;

public class InterSyncService
{
    private readonly IServiceScopeFactory     _scopeFactory;
    private readonly EncryptionService        _enc;
    private readonly IConfiguration           _config;
    private readonly IMemoryCache              _cache;
    private readonly ILogger<InterSyncService> _logger;

    // O botão manual e o serviço em background podem disparar ao mesmo tempo. O Inter
    // limita tanto OAuth quanto extrato, então só uma sincronização roda por processo.
    private static readonly SemaphoreSlim _syncGate = new(1, 1);
    private static readonly SemaphoreSlim _tokenGate = new(1, 1);
    private static DateTimeOffset? _cooldownUntil;
    private static readonly TimeSpan _rateLimitCooldown = TimeSpan.FromMinutes(5);

    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    public InterSyncService(
        IServiceScopeFactory scopeFactory,
        EncryptionService enc,
        IConfiguration config,
        ILogger<InterSyncService> logger)
        : this(scopeFactory, enc, config, logger, new MemoryCache(new MemoryCacheOptions()))
    {
    }

    [Microsoft.Extensions.DependencyInjection.ActivatorUtilitiesConstructor]
    public InterSyncService(
        IServiceScopeFactory scopeFactory,
        EncryptionService enc,
        IConfiguration config,
        ILogger<InterSyncService> logger,
        IMemoryCache cache)
    {
        _scopeFactory = scopeFactory;
        _enc          = enc;
        _config       = config;
        _cache        = cache;
        _logger       = logger;
    }

    public bool IsConfigured(IntegrationConfig cfg) =>
        !string.IsNullOrWhiteSpace(cfg.ClientId) &&
        !string.IsNullOrWhiteSpace(cfg.ClientSecret) &&
        CertificateExists();

    public bool CertificateExists()
    {
        var crt = _config["Inter:CertificatePath"];
        var key = _config["Inter:KeyPath"];
        return File.Exists(crt) && File.Exists(key);
    }

    // ── Sincroniza extrato dos últimos N dias ─────────────────────────────────
    public async Task<InterSyncResult> SyncAsync(int days = 7)
    {
        if (!await _syncGate.WaitAsync(0))
            return new InterSyncResult
            {
                Skipped = true,
                InProgress = true,
                Reason = "Uma atualização do Banco Inter já está em andamento. Aguarde alguns segundos."
            };

        try
        {
            var now = DateTimeOffset.UtcNow;
            if (_cooldownUntil is { } cooldown && cooldown > now)
                return RateLimitedResult(cooldown);

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var cfg = await db.IntegrationConfigs
                .FirstOrDefaultAsync(c => c.Source == "inter");

            if (cfg is null || !IsConfigured(cfg))
                return new InterSyncResult { Skipped = true, Reason = "Inter não configurado (Client ID, Client Secret ou certificado ausente)." };

            try
            {
                var clientSecret = _enc.Decrypt(cfg.ClientSecret!);
                var token        = await GetTokenAsync(cfg.ClientId!, clientSecret, "extrato.read");

                var fim    = DateOnly.FromDateTime(DateTime.Now);
                var inicio = fim.AddDays(-days);

                var transactions = await FetchExtratoCompletoAsync(token, inicio, fim);
                var saldo        = await FetchSaldoAsync(token);

                int imported = 0, skipped = 0;
                foreach (var t in transactions)
                {
                    // Sem idTransacao não há como deduplicar com segurança — pula em vez de
                    // importar algo que voltaria duplicado a cada sync.
                    if (string.IsNullOrWhiteSpace(t.IdTransacao)) { skipped++; continue; }

                    var exists = await db.ExternalTransactions
                        .AnyAsync(x => x.Source == "inter" && x.ExternalId == t.IdTransacao);

                    if (exists) { skipped++; continue; }

                    var isIncome = t.TipoOperacao == "C"; // C = Crédito, D = Débito
                    var data     = ParseData(t.DataEntrada) ?? ParseData(t.DataTransacao) ?? DateTime.UtcNow;
                    var titulo   = string.IsNullOrWhiteSpace(t.Titulo) ? null : t.Titulo.Trim();
                    var detalhe  = string.IsNullOrWhiteSpace(t.Descricao) ? null : t.Descricao.Trim();

                    db.ExternalTransactions.Add(new ExternalTransaction
                    {
                        Source      = "inter",
                        ExternalId  = t.IdTransacao,
                        Type        = isIncome ? "income" : "expense",
                        Amount      = Math.Abs(t.Valor),
                        Description = titulo is not null && detalhe is not null ? $"{titulo} — {detalhe}"
                                      : titulo ?? detalhe ?? t.TipoTransacao ?? "Transação Inter",
                        DueDate     = data,
                        PaidAt      = data, // extrato = transação já executada
                        Status      = "paid",
                        Category    = t.TipoTransacao,
                    });
                    imported++;
                }

                await db.SaveChangesAsync();

                cfg.LastSyncAt = DateTime.UtcNow;
                cfg.UpdatedAt  = DateTime.UtcNow;
                await db.SaveChangesAsync();

                return new InterSyncResult
                {
                    Imported   = imported,
                    Duplicates = skipped,
                    Saldo      = saldo,
                    LastSyncAt = cfg.LastSyncAt,
                };
            }
            catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
            {
                _cooldownUntil = DateTimeOffset.UtcNow.Add(_rateLimitCooldown);
                _logger.LogWarning(ex, "Banco Inter limitou a sincronização; nova tentativa após {Cooldown}", _cooldownUntil);
                return RateLimitedResult(_cooldownUntil.Value);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao sincronizar extrato Inter");
                return new InterSyncResult { Error = ex.Message };
            }
        }
        finally
        {
            _syncGate.Release();
        }
    }

    private static InterSyncResult RateLimitedResult(DateTimeOffset retryAt) => new()
    {
        Skipped = true,
        RateLimited = true,
        RetryAt = retryAt,
        Reason = "O Banco Inter limitou as consultas. Aguarde cerca de 5 minutos antes de atualizar novamente."
    };

    // ── OAuth2 Client Credentials com mTLS ───────────────────────────────────
    private async Task<string> GetTokenAsync(string clientId, string clientSecret, string scope)
    {
        var cacheKey = $"inter-oauth:{clientId}:{scope}";
        if (_cache.TryGetValue<string>(cacheKey, out var cachedToken) && !string.IsNullOrWhiteSpace(cachedToken))
            return cachedToken;

        await _tokenGate.WaitAsync();
        try
        {
            if (_cache.TryGetValue<string>(cacheKey, out cachedToken) && !string.IsNullOrWhiteSpace(cachedToken))
                return cachedToken;

            using var http = BuildMtlsClient();

            var body = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"]     = clientId,
                ["client_secret"] = clientSecret,
                ["grant_type"]    = "client_credentials",
                ["scope"]         = scope,
            });

            var resp = await http.PostAsync("https://cdpj.partners.bancointer.com.br/oauth/v2/token", body);
            resp.EnsureSuccessStatusCode();

            var json = await resp.Content.ReadFromJsonAsync<InterTokenResponse>(_json)
                ?? throw new InvalidOperationException("Resposta de token inválida.");

            if (string.IsNullOrWhiteSpace(json.AccessToken))
                throw new InvalidOperationException("O Banco Inter retornou um token vazio.");

            // Renova um minuto antes do vencimento. Isso reduz drasticamente chamadas ao
            // endpoint OAuth, inclusive entre extrato, geração e consulta de Pix.
            var ttl = TimeSpan.FromSeconds(Math.Max(30, json.ExpiresIn - 60));
            _cache.Set(cacheKey, json.AccessToken, ttl);
            return json.AccessToken;
        }
        finally
        {
            _tokenGate.Release();
        }
    }

    // ── Pix Cobrança Imediata — gera cobrança pra qualquer origem (Crediário,
    // Comanda ou Venda Avulsa). Segue a API Pix padrão do Banco Central (mesmos
    // endpoints /pix/v2/cob e /pix/v2/cob/{txid} usados por todos os PSPs),
    // hospedada pelo Inter em cdpj.partners.bancointer.com.br.
    public async Task<PixCobrancaResult> CriarCobrancaAsync(
        IntegrationConfig cfg, int valorEmCentavos, string? nomeDevedor, string? cpfDevedor,
        string descricao = "Cobrança Santuário Nerd")
    {
        if (!IsConfigured(cfg))
            return new PixCobrancaResult { Error = "Inter não configurado (Client ID, Client Secret ou certificado ausente)." };

        if (string.IsNullOrWhiteSpace(cfg.PixKey))
            return new PixCobrancaResult { Error = "Chave Pix não configurada em Integrações → Inter." };

        try
        {
            var clientSecret = _enc.Decrypt(cfg.ClientSecret!);
            var token        = await GetTokenAsync(cfg.ClientId!, clientSecret, "cob.write cob.read");

            var txid = Guid.NewGuid().ToString("N"); // 32 chars alfanuméricos — dentro do range 26-35 exigido

            object? devedor = null;
            if (!string.IsNullOrWhiteSpace(cpfDevedor) && cpfDevedor.Length == 11 && !string.IsNullOrWhiteSpace(nomeDevedor))
                devedor = new { cpf = cpfDevedor, nome = nomeDevedor };

            var payload = new
            {
                calendario = new { expiracao = 3600 },
                devedor,
                valor = new { original = (valorEmCentavos / 100m).ToString("F2", System.Globalization.CultureInfo.InvariantCulture) },
                chave = cfg.PixKey,
                solicitacaoPagador = descricao,
            };

            using var http = BuildMtlsClient();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var resp = await http.PutAsJsonAsync(
                $"https://cdpj.partners.bancointer.com.br/pix/v2/cob/{txid}", payload, _json);

            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync();
                _logger.LogError("Erro ao criar cobrança Pix Inter: {Status} {Body}", resp.StatusCode, body);
                return new PixCobrancaResult { Error = $"Inter recusou a cobrança ({(int)resp.StatusCode})." };
            }

            var rawBody = await resp.Content.ReadAsStringAsync();
            var cob     = JsonSerializer.Deserialize<InterCobResponse>(rawBody, _json)
                ?? throw new InvalidOperationException("Resposta de cobrança inválida.");

            // O copia-e-cola já vem na resposta da criação (campo pixCopiaECola);
            // o endpoint /loc/{id}/qrcode é só fallback pra respostas antigas sem ele.
            var pixCopiaCola = cob.PixCopiaECola;
            string? imagemQrCode = null;
            if (string.IsNullOrWhiteSpace(pixCopiaCola) && cob.Loc?.Id is not null)
                (pixCopiaCola, imagemQrCode) = await FetchQrCodeAsync(http, cob.Loc.Id.Value);

            if (string.IsNullOrWhiteSpace(pixCopiaCola))
                _logger.LogWarning("Cobrança Pix {TxId} criada mas sem pixCopiaECola. Resposta do Inter: {Body}", txid, rawBody);

            imagemQrCode = NormalizarOuGerarQrCode(imagemQrCode, pixCopiaCola);

            return new PixCobrancaResult
            {
                TxId         = txid,
                Status       = cob.Status ?? "ATIVA",
                PixCopiaCola = pixCopiaCola,
                ImagemQrCode = imagemQrCode,
                ExpiraEm     = DateTime.UtcNow.AddSeconds(cob.Calendario?.Expiracao ?? 3600),
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao criar cobrança Pix via Inter");
            return new PixCobrancaResult { Error = ex.Message };
        }
    }

    // ── Consulta status de uma cobrança existente ──────────────────────────────
    // virtual pra permitir mock nos testes da reconciliação (PixReconciliationService).
    public virtual async Task<PixCobrancaResult> ConsultarCobrancaAsync(IntegrationConfig cfg, string txid)
    {
        if (!IsConfigured(cfg))
            return new PixCobrancaResult { Error = "Inter não configurado." };

        try
        {
            var clientSecret = _enc.Decrypt(cfg.ClientSecret!);
            var token        = await GetTokenAsync(cfg.ClientId!, clientSecret, "cob.read");

            using var http = BuildMtlsClient();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var resp = await http.GetAsync($"https://cdpj.partners.bancointer.com.br/pix/v2/cob/{txid}");
            if (!resp.IsSuccessStatusCode)
                return new PixCobrancaResult { Error = $"Erro ao consultar cobrança ({(int)resp.StatusCode})." };

            var cob = await resp.Content.ReadFromJsonAsync<InterCobResponse>(_json)
                ?? throw new InvalidOperationException("Resposta de cobrança inválida.");

            return new PixCobrancaResult { TxId = txid, Status = cob.Status ?? "ATIVA" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao consultar cobrança Pix via Inter (txid={TxId})", txid);
            return new PixCobrancaResult { Error = ex.Message };
        }
    }

    // ── Remove uma cobrança no PSP ────────────────────────────────────────────
    /// <summary>
    /// Marca a cobrança como removida pelo recebedor no Inter (PATCH da API Pix do BCB).
    /// Sem isso, "cancelar" só no nosso banco deixaria o QR Code vivo no PSP: o cliente
    /// ainda conseguiria pagar uma cobrança que pra loja não existe mais, e o dinheiro
    /// cairia sem nada pra reconciliar.
    /// </summary>
    public virtual async Task<PixCobrancaResult> RemoverCobrancaAsync(IntegrationConfig cfg, string txid)
    {
        if (!IsConfigured(cfg))
            return new PixCobrancaResult { Error = "Inter não configurado." };

        try
        {
            var clientSecret = _enc.Decrypt(cfg.ClientSecret!);
            var token        = await GetTokenAsync(cfg.ClientId!, clientSecret, "cob.write");

            using var http = BuildMtlsClient();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var body = new StringContent(
                """{"status":"REMOVIDA_PELO_USUARIO_RECEBEDOR"}""",
                Encoding.UTF8, "application/json");

            var resp = await http.PatchAsync($"https://cdpj.partners.bancointer.com.br/pix/v2/cob/{txid}", body);
            if (!resp.IsSuccessStatusCode)
            {
                var detalhe = await resp.Content.ReadAsStringAsync();
                _logger.LogWarning("Inter recusou remover a cobrança {TxId} ({Status}): {Detalhe}",
                    txid, (int)resp.StatusCode, detalhe);
                return new PixCobrancaResult { Error = $"O Inter recusou remover a cobrança ({(int)resp.StatusCode})." };
            }

            var cob = await resp.Content.ReadFromJsonAsync<InterCobResponse>(_json);
            return new PixCobrancaResult { TxId = txid, Status = cob?.Status ?? "REMOVIDA_PELO_USUARIO_RECEBEDOR" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao remover cobrança Pix via Inter (txid={TxId})", txid);
            return new PixCobrancaResult { Error = ex.Message };
        }
    }

    /// <summary>
    /// Garante uma imagem de QR Code em formato data URI (o &lt;img&gt; do frontend espera isso).
    /// Se o Inter não mandou imagem, gera localmente a partir do copia-e-cola — o QR do Pix
    /// é só o próprio BR Code em texto, qualquer gerador produz um QR válido.
    /// </summary>
    private string? NormalizarOuGerarQrCode(string? imagemDoInter, string? pixCopiaCola)
    {
        if (!string.IsNullOrWhiteSpace(imagemDoInter))
            return imagemDoInter.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
                ? imagemDoInter
                : $"data:image/png;base64,{imagemDoInter}";

        if (string.IsNullOrWhiteSpace(pixCopiaCola)) return null;

        try
        {
            using var generator = new QRCoder.QRCodeGenerator();
            using var data      = generator.CreateQrCode(pixCopiaCola, QRCoder.QRCodeGenerator.ECCLevel.M);
            var png = new QRCoder.PngByteQRCode(data).GetGraphic(10);
            return $"data:image/png;base64,{Convert.ToBase64String(png)}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Falha ao gerar QR Code local — cobrança segue só com copia-e-cola.");
            return null;
        }
    }

    private async Task<(string? copiaCola, string? imagem)> FetchQrCodeAsync(HttpClient http, int locId)
    {
        // Falha ao buscar QR Code nunca deve abortar a cobrança — o Pix Copia e Cola já basta para o cliente pagar.
        try
        {
            var resp = await http.GetAsync($"https://cdpj.partners.bancointer.com.br/pix/v2/loc/{locId}/qrcode");
            if (!resp.IsSuccessStatusCode) return (null, null);

            var body = await resp.Content.ReadFromJsonAsync<InterLocQrCodeResponse>(_json);
            return (body?.QrCode, body?.ImagemQrcode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Falha ao buscar QR Code Pix (loc {LocId}) — cobrança continua válida, sem imagem.", locId);
            return (null, null);
        }
    }

    // ── Extrato ───────────────────────────────────────────────────────────────
    // Usa o /extrato/completo (não o /extrato simples) porque só ele devolve o
    // idTransacao — sem ele não há deduplicação confiável entre syncs. É paginado.
    private async Task<List<InterLancamento>> FetchExtratoCompletoAsync(string token, DateOnly inicio, DateOnly fim)
    {
        using var http = BuildMtlsClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var todas = new List<InterLancamento>();
        for (var pagina = 0; pagina < 30; pagina++) // guarda: 30 páginas ≈ 1.500+ transações em 7 dias
        {
            var url = $"https://cdpj.partners.bancointer.com.br/banking/v2/extrato/completo" +
                      $"?dataInicio={inicio:yyyy-MM-dd}&dataFim={fim:yyyy-MM-dd}&pagina={pagina}";
            var resp = await http.GetAsync(url);
            resp.EnsureSuccessStatusCode();

            var body = await resp.Content.ReadFromJsonAsync<InterExtratoResponse>(_json);
            if (body?.Transacoes is { Count: > 0 })
                todas.AddRange(body.Transacoes);

            if (body is null || body.UltimaPagina || body.Transacoes is null or { Count: 0 })
                break;
        }
        return todas;
    }

    // ── Saldo ─────────────────────────────────────────────────────────────────
    /// <summary>
    /// Saldo atual da conta PJ. Puxado junto do extrato pra tela mostrar o número do
    /// banco na hora do sync, sem ninguém precisar conferir no app do Inter.
    /// Falha aqui nunca derruba o sync: o extrato é o que importa, o saldo é enfeite.
    /// </summary>
    public async Task<decimal?> ConsultarSaldoAsync(IntegrationConfig cfg)
    {
        if (!IsConfigured(cfg)) return null;
        try
        {
            var clientSecret = _enc.Decrypt(cfg.ClientSecret!);
            var token        = await GetTokenAsync(cfg.ClientId!, clientSecret, "extrato.read");
            return await FetchSaldoAsync(token);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Falha ao consultar saldo do Inter");
            return null;
        }
    }

    private async Task<decimal?> FetchSaldoAsync(string token)
    {
        try
        {
            using var http = BuildMtlsClient();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var resp = await http.GetAsync("https://cdpj.partners.bancointer.com.br/banking/v2/saldo");
            if (!resp.IsSuccessStatusCode) return null;

            var body = await resp.Content.ReadFromJsonAsync<InterSaldoResponse>(_json);
            return body?.Disponivel;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Falha ao ler saldo do Inter — sync segue sem o saldo.");
            return null;
        }
    }

    /// <summary>Datas do extrato vêm como "yyyy-MM-dd" — armazenadas como meia-noite UTC (data pura).</summary>
    private static DateTime? ParseData(string? s) =>
        DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                          System.Globalization.DateTimeStyles.None, out var d)
            ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc)
            : null;

    // ── HttpClient com certificado mTLS do Inter ──────────────────────────────
    private HttpClient BuildMtlsClient()
    {
        var certPath = _config["Inter:CertificatePath"]!;
        var keyPath  = _config["Inter:KeyPath"]!;

        var cert    = X509Certificate2.CreateFromPemFile(certPath, keyPath);
        var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(cert);

        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };
    }
}

// ── Background service — sincroniza a cada 15 min ─────────────────────────────
// Era de hora em hora, e o lojista via dado velho até mandar sincronizar na mão.
// 15 min mantém o extrato perto do tempo real sem chegar perto do limite do Inter
// (uma chamada de token + páginas de extrato por ciclo).
public class InterSyncBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<InterSyncBackgroundService> _logger;

    public InterSyncBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<InterSyncBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // aguarda 2 min após startup para não competir com EnsureCreated
        await Task.Delay(TimeSpan.FromMinutes(2), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var svc         = scope.ServiceProvider.GetRequiredService<InterSyncService>();
                var result      = await svc.SyncAsync(days: 7);

                if (!result.Skipped)
                    _logger.LogInformation(
                        "Inter sync: {imported} importadas, {dup} duplicatas, erro={error}",
                        result.Imported, result.Duplicates, result.Error ?? "-");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro no background sync do Inter");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), ct);
        }
    }
}

// ── DTOs internos da API Inter ────────────────────────────────────────────────
internal record InterTokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("expires_in")]   int    ExpiresIn);

internal record InterSaldoResponse(
    [property: JsonPropertyName("disponivel")] decimal? Disponivel);

internal record InterExtratoResponse(
    [property: JsonPropertyName("transacoes")]   List<InterLancamento>? Transacoes,
    [property: JsonPropertyName("ultimaPagina")] bool                   UltimaPagina);

// Campos conforme o schema real do GET /banking/v2/extrato/completo:
// idTransacao (único, só no /completo), dataEntrada, tipoOperacao ("C"|"D"),
// tipoTransacao (PIX, PAGAMENTO...), titulo, descricao, valor (string).
internal record InterLancamento(
    [property: JsonPropertyName("idTransacao")]   string?  IdTransacao,
    [property: JsonPropertyName("dataEntrada")]   string?  DataEntrada,
    [property: JsonPropertyName("dataTransacao")] string?  DataTransacao,
    [property: JsonPropertyName("tipoOperacao")]  string?  TipoOperacao,
    [property: JsonPropertyName("tipoTransacao")] string?  TipoTransacao,
    [property: JsonPropertyName("titulo")]        string?  Titulo,
    [property: JsonPropertyName("descricao")]     string?  Descricao,
    [property: JsonPropertyName("valor")]         decimal  Valor);

public record InterSyncResult
{
    public bool    Skipped    { get; init; }
    public bool    InProgress { get; init; }
    public bool    RateLimited { get; init; }
    public DateTimeOffset? RetryAt { get; init; }
    public string? Reason     { get; init; }
    public int     Imported   { get; init; }
    public int     Duplicates { get; init; }
    public string? Error      { get; init; }
    /// <summary>Saldo disponível lido no mesmo ciclo. Null = o Inter não respondeu.</summary>
    public decimal?  Saldo      { get; init; }
    public DateTime? LastSyncAt { get; init; }
}

// ── DTOs da API Pix (padrão Banco Central, usado pelo Inter) ──────────────────
internal record InterCobResponse(
    [property: JsonPropertyName("txid")]          string?              TxId,
    [property: JsonPropertyName("status")]        string?              Status,
    [property: JsonPropertyName("calendario")]    InterCobCalendario?  Calendario,
    [property: JsonPropertyName("loc")]           InterCobLoc?         Loc,
    [property: JsonPropertyName("pixCopiaECola")] string?              PixCopiaECola);

internal record InterCobCalendario(
    [property: JsonPropertyName("expiracao")] int Expiracao);

internal record InterCobLoc(
    [property: JsonPropertyName("id")] int? Id);

internal record InterLocQrCodeResponse(
    [property: JsonPropertyName("qrcode")]       string? QrCode,
    [property: JsonPropertyName("imagemQrcode")] string? ImagemQrcode);

public record PixCobrancaResult
{
    public string?   TxId         { get; init; }
    public string?   Status       { get; init; }
    public string?   PixCopiaCola { get; init; }
    public string?   ImagemQrCode { get; init; }
    public DateTime? ExpiraEm     { get; init; }
    public string?   Error        { get; init; }
}
