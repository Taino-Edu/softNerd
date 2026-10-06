// =============================================================================
// CrediarioPixService.cs — Cobrança Pix das contas de crediário
//
// Uma regra só pra três portas: o admin ("Cobrar via Pix"), o link público que
// vai no aviso de vencimento (/pagar/{token}) e o perfil do cliente. Reaproveita
// a cobrança ATIVA do mesmo valor em vez de abrir outra no Inter a cada clique,
// e é daqui que sai o encerramento das cobranças quando a conta muda por outro
// meio. A baixa do pagamento continua no PixReconciliationService (robô + telas).
// =============================================================================

using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public sealed record CrediarioPixResultado(PixCobranca? Pix, string? Erro, int StatusCode = 200)
{
    public static CrediarioPixResultado Falha(string erro, int status = 400) => new(null, erro, status);
}

public class CrediarioPixService
{
    /// <summary>Pix parcial menor que isso não compensa (e o Inter cobra tarifa por cobrança).</summary>
    public const int ValorMinimoEmCentavos = 100;

    /// <summary>Cobrança que vence em menos que isso não é reaproveitada — o cliente não daria tempo de pagar.</summary>
    private static readonly TimeSpan FolgaMinima = TimeSpan.FromMinutes(5);

    // Dois cliques (ou o link aberto em dois celulares) não podem abrir duas cobranças
    // no Inter. Produção roda uma instância só da API, então o lock por conta basta.
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Travas = new();

    private readonly AppDbContext     _db;
    private readonly InterSyncService _inter;
    private readonly IPixReconciliationService _reconciliacao;
    private readonly IConfiguration   _config;
    private readonly ILogger<CrediarioPixService> _logger;

    public CrediarioPixService(
        AppDbContext db, InterSyncService inter, IPixReconciliationService reconciliacao,
        IConfiguration config, ILogger<CrediarioPixService> logger)
    {
        _db            = db;
        _inter         = inter;
        _reconciliacao = reconciliacao;
        _config        = config;
        _logger        = logger;
    }

    // ── Link público ──────────────────────────────────────────────────────────

    /// <summary>128 bits aleatórios em hex — é o que dá acesso à página de pagamento, sem login.</summary>
    public static string NovoToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    public static string LinkPagamento(IConfiguration config, string token)
    {
        var appUrl = (config["SmtpSettings:AppUrl"] ?? config["EmailSettings:AppUrl"] ?? "https://santuarionerd.com.br").TrimEnd('/');
        return $"{appUrl}/pagar/{token}";
    }

    /// <summary>
    /// Dá pra cobrar por Pix? Confere só o que mora no banco (credenciais e chave);
    /// o certificado é conferido na hora de gerar, e aí o erro aparece na tela.
    /// </summary>
    public static Task<bool> PixConfiguradoAsync(AppDbContext db, CancellationToken ct = default) =>
        db.IntegrationConfigs.AnyAsync(c => c.Source == "inter"
                                         && c.IsActive
                                         && c.ClientId != null && c.ClientId != ""
                                         && c.ClientSecret != null && c.ClientSecret != ""
                                         && c.PixKey != null && c.PixKey != "", ct);

    /// <summary>Contas criadas antes do link existir ganham o token delas. Idempotente.</summary>
    public static async Task<int> GarantirTokensAsync(AppDbContext db)
    {
        var semToken = await db.Crediarios.Where(c => c.PagamentoToken == null).ToListAsync();
        foreach (var c in semToken) c.PagamentoToken = NovoToken();
        if (semToken.Count > 0) await db.SaveChangesAsync();
        return semToken.Count;
    }

    // ── Cobrança ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Devolve a cobrança ativa do saldo atual ou gera uma nova no Inter.
    /// <paramref name="criadoPor"/> = admin que pediu; no link público é null e a
    /// cobrança fica no nome de quem abriu a conta (é quem assina a baixa depois).
    /// </summary>
    /// <param name="valorEmCentavos">Valor escolhido pelo cliente (parcial); null = saldo inteiro.</param>
    /// <param name="todasDoCliente">Um Pix só pra todas as contas abertas do cliente desta conta.</param>
    public async Task<CrediarioPixResultado> ObterOuGerarAsync(
        Guid crediarioId, Guid? criadoPor, int? valorEmCentavos = null, bool todasDoCliente = false,
        bool reaproveitar = true, CancellationToken ct = default)
    {
        var trava = Travas.GetOrAdd(crediarioId, _ => new SemaphoreSlim(1, 1));
        await trava.WaitAsync(ct);
        try
        {
            var crediario = await _db.Crediarios
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == crediarioId, ct);

            if (crediario is null)
                return CrediarioPixResultado.Falha("Crediário não encontrado.", 404);
            if (crediario.Status == CrediariosStatus.Pago || crediario.SaldoRestanteEmCentavos <= 0)
                return CrediarioPixResultado.Falha("Esta conta já está quitada.");

            // "Pagar tudo": todas as contas abertas do cliente, vencimento mais antigo primeiro
            // (é a ordem em que a baixa distribui o valor).
            string? idsJson = null;
            int valor;
            if (todasDoCliente)
            {
                var contas = await _db.Crediarios
                    .Where(c => c.UserId == crediario.UserId
                             && c.Status == CrediariosStatus.Aberto
                             && c.ValorEmCentavos > c.ValorPagoEmCentavos)
                    .OrderBy(c => c.DataVencimento)
                    .ToListAsync(ct);
                valor = contas.Sum(c => c.SaldoRestanteEmCentavos);
                if (contas.Count > 1)
                    idsJson = JsonSerializer.Serialize(contas.Select(c => c.Id));
            }
            else if (valorEmCentavos is int escolhido)
            {
                if (escolhido < ValorMinimoEmCentavos)
                    return CrediarioPixResultado.Falha($"O valor mínimo pra pagar por Pix é R$ {ValorMinimoEmCentavos / 100m:N2}.");
                if (escolhido > crediario.SaldoRestanteEmCentavos)
                    return CrediarioPixResultado.Falha($"O valor passa do que falta pagar nesta conta (R$ {crediario.SaldoRestanteEmReais:N2}).");
                valor = escolhido;
            }
            else
            {
                valor = crediario.SaldoRestanteEmCentavos;
            }

            if (reaproveitar)
            {
                var limite = DateTime.UtcNow.Add(FolgaMinima);
                var ativa = await _db.PixCobrancas
                    .Where(p => p.CrediarioId == crediarioId
                             && p.Status == "ATIVA"
                             && p.PagoEm == null
                             && p.ValorEmCentavos == valor
                             && p.CrediarioIdsJson == idsJson
                             && (p.ExpiraEm == null || p.ExpiraEm > limite))
                    .OrderByDescending(p => p.CriadoEm)
                    .FirstOrDefaultAsync(ct);
                if (ativa is not null)
                    return new CrediarioPixResultado(ativa, null);
            }

            var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter", ct);
            if (cfg is null)
                return CrediarioPixResultado.Falha("Pagamento por Pix indisponível no momento.");

            var cpf = crediario.User.Cpf?.Length == 11 ? crediario.User.Cpf : null;
            var nomeLoja = await _db.SiteConfigs
                .Where(s => s.Id == SiteConfig.SingletonId)
                .Select(s => s.SiteName)
                .FirstOrDefaultAsync(ct) ?? "Santuário Nerd";

            var result = await _inter.CriarCobrancaAsync(cfg, valor, crediario.User.Name, cpf, $"{nomeLoja} — Crediário");
            if (result.Error is not null)
                return CrediarioPixResultado.Falha(result.Error, 422);

            var pix = new PixCobranca
            {
                Origem           = PixCobrancaOrigem.Crediario,
                CrediarioId      = crediario.Id,
                TxId             = result.TxId!,
                ValorEmCentavos  = valor,
                CrediarioIdsJson = idsJson,
                Status           = result.Status ?? "ATIVA",
                PixCopiaCola     = result.PixCopiaCola,
                ImagemQrCode     = result.ImagemQrCode,
                NomeDevedor      = crediario.User.Name,
                CriadoPorAdminId = criadoPor ?? crediario.AbertoPorAdminId,
                ExpiraEm         = result.ExpiraEm,
            };
            _db.PixCobrancas.Add(pix);
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation(
                "Cobrança Pix {TxId} do crediário {CrediarioId} gerada {Origem} — R$ {Valor:N2}",
                pix.TxId, crediario.Id, criadoPor is null ? "pelo link do cliente" : $"pelo admin {criadoPor}", pix.ValorEmReais);

            return new CrediarioPixResultado(pix, null);
        }
        finally
        {
            trava.Release();
        }
    }

    /// <summary>Consulta no Inter e, se pagou, dá a baixa (mesmo caminho do robô).</summary>
    public async Task<(PixCobranca? Pix, string? Erro)> VerificarAsync(
        Guid crediarioId, string txId, Guid? adminId, CancellationToken ct = default)
    {
        var pix = await _db.PixCobrancas.FirstOrDefaultAsync(p => p.CrediarioId == crediarioId && p.TxId == txId, ct);
        if (pix is null) return (null, "Cobrança não encontrada.");

        var result = await _reconciliacao.ReconciliarAsync(pix, adminId);
        return (pix, result.Error);
    }

    /// <summary>
    /// Encerra as cobranças Pix ainda ativas da conta. Antes de cancelar, confere no
    /// Inter: se o cliente acabou de pagar, a reconciliação dá a baixa e devolve a
    /// mensagem pro chamador parar. Se o Inter não deixar cancelar, a cobrança segue
    /// ativa pro robô — e, se for paga, o que passar do saldo vira crédito do cliente.
    /// </summary>
    public async Task<string?> EncerrarAtivasAsync(Guid crediarioId, Guid? adminId, CancellationToken ct = default)
    {
        var idTexto = crediarioId.ToString();
        var ativas = await _db.PixCobrancas
            .Where(p => (p.CrediarioId == crediarioId
                         || (p.CrediarioIdsJson != null && p.CrediarioIdsJson.Contains(idTexto)))
                     && p.Status == "ATIVA" && p.PagoEm == null)
            .ToListAsync(ct);
        if (ativas.Count == 0) return null;

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter", ct);
        foreach (var pix in ativas)
        {
            var vencida = pix.ExpiraEm is not null && pix.ExpiraEm <= DateTime.UtcNow;
            if (!vencida)
            {
                var conferida = await _reconciliacao.ReconciliarAsync(pix, adminId);
                if (conferida.PagoEm is not null)
                    return $"O cliente acabou de pagar R$ {pix.ValorEmReais:N2} pela cobrança Pix desta conta e o pagamento já foi registrado. Recarregue a tela antes de lançar outro.";
                if (pix.Status != "ATIVA") continue; // o Inter já encerrou por conta própria
            }

            var removida = cfg is null
                ? new PixCobrancaResult { Error = "Integração com o Inter não configurada." }
                : await _inter.RemoverCobrancaAsync(cfg, pix.TxId);

            if (removida.Error is null || vencida)
                pix.Status = "REMOVIDA_PELO_USUARIO_RECEBEDOR";
            else
                _logger.LogWarning(
                    "Cobrança Pix {TxId} do crediário {CrediarioId} não foi cancelada no Inter ({Erro}) — segue ativa pro robô conciliar.",
                    pix.TxId, crediarioId, removida.Error);
        }

        await _db.SaveChangesAsync(ct);
        return null;
    }
}
