using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/contas-receber")]
[Authorize(Policy = "AdminOnly")]
[Produces("application/json")]
public class ContasReceberController : ControllerBase
{
    private readonly AppDbContext       _db;
    private readonly OfxParserService   _ofx;
    private readonly SefazNfeService    _sefaz;
    private readonly EncryptionService  _enc;
    private readonly InterSyncService   _inter;
    private readonly IConfiguration     _config;

    public ContasReceberController(AppDbContext db, OfxParserService ofx, SefazNfeService sefaz, EncryptionService enc, InterSyncService inter, IConfiguration config)
    {
        _db     = db;
        _ofx    = ofx;
        _sefaz  = sefaz;
        _enc    = enc;
        _inter  = inter;
        _config = config;
    }

    // ── GET /api/contas-receber — lista com filtros ────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? type     = null,   // "income" | "expense"
        [FromQuery] string? status   = null,   // "pending" | "paid" | "overdue" | "cancelled"
        [FromQuery] string? source   = null,
        [FromQuery] string? search   = null,
        [FromQuery] string? from     = null,
        [FromQuery] string? to       = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
    {
        var q = _db.ExternalTransactions.AsQueryable();

        if (!string.IsNullOrWhiteSpace(type))   q = q.Where(t => t.Type   == type);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(t => t.Status == status);
        if (!string.IsNullOrWhiteSpace(source)) q = q.Where(t => t.Source == source);
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(t => t.Description.Contains(search) ||
                              (t.Supplier != null && t.Supplier.Contains(search)));

        if (DateTime.TryParse(from, out var dtFrom)) q = q.Where(t => t.DueDate >= dtFrom || t.CreatedAt >= dtFrom);
        if (DateTime.TryParse(to,   out var dtTo))   q = q.Where(t => t.DueDate <= dtTo   || t.CreatedAt <= dtTo);

        // Auto-marca como overdue antes de retornar
        var today = DateTime.UtcNow.Date;
        await _db.ExternalTransactions
            .Where(t => t.Status == "pending" && t.DueDate.HasValue && t.DueDate.Value.Date < today)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.Status, "overdue"));

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(t => t.DueDate ?? t.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync();

        return Ok(new { items = items.Select(ToDto), total, totalPages = (int)Math.Ceiling(total / (double)pageSize) });
    }

    // ── GET /api/contas-receber/summary ───────────────────────────────────────
    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var today   = DateTime.UtcNow.Date;
        var em7dias = today.AddDays(7);

        var all = await _db.ExternalTransactions
            .Where(t => t.Status != "cancelled")
            .ToListAsync();

        return Ok(new
        {
            aPagar = new
            {
                total     = all.Where(t => t.Type == "expense" && t.Status != "paid").Sum(t => t.Amount),
                atrasado  = all.Where(t => t.Type == "expense" && t.Status == "overdue").Sum(t => t.Amount),
                vence7d   = all.Where(t => t.Type == "expense" && t.Status == "pending" &&
                                           t.DueDate.HasValue && t.DueDate.Value.Date <= em7dias).Sum(t => t.Amount),
                qtd       = all.Count(t => t.Type == "expense" && t.Status is "pending" or "overdue"),
            },
            aReceber = new
            {
                total   = all.Where(t => t.Type == "income" && t.Status != "paid").Sum(t => t.Amount),
                qtd     = all.Count(t => t.Type == "income" && t.Status is "pending" or "overdue"),
            },
            pagoMes = all.Where(t => t.PaidAt.HasValue &&
                                      t.PaidAt.Value.Year  == today.Year &&
                                      t.PaidAt.Value.Month == today.Month)
                         .Sum(t => t.Type == "income" ? t.Amount : -t.Amount),
            // Recebido automaticamente via Pix pelo próprio sistema (Inter) — reservas pagas,
            // taxas de inscrição de campeonato, etc. Separado do resto porque não passou por
            // lançamento manual nenhum, é o dinheiro que "caiu sozinho".
            pixRecebido = new
            {
                total = all.Where(t => t.Source == "inter" && t.Type == "income" && t.Status == "paid").Sum(t => t.Amount),
                qtd   = all.Count(t => t.Source == "inter" && t.Type == "income" && t.Status == "paid"),
            },
        });
    }

    // ── POST /api/contas-receber — entrada manual ──────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransactionRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var tx = new ExternalTransaction
        {
            Source      = "manual",
            Type        = req.Type,
            Amount      = req.Amount,
            Description = req.Description,
            DueDate     = req.DueDate?.ToUniversalTime(),
            Status      = "pending",
            Category    = req.Category,
            Supplier    = req.Supplier,
            Notes       = req.Notes,
        };

        _db.ExternalTransactions.Add(tx);
        await _db.SaveChangesAsync();
        return Ok(ToDto(tx));
    }

    // ── PUT /api/contas-receber/{id} — atualizar (marcar pago, editar) ─────────
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTransactionRequest req)
    {
        var tx = await _db.ExternalTransactions.FindAsync(id);
        if (tx is null) return NotFound();

        if (req.Description is not null) tx.Description = req.Description;
        if (req.Amount.HasValue)         tx.Amount      = req.Amount.Value;
        if (req.DueDate.HasValue)        tx.DueDate     = req.DueDate.Value.ToUniversalTime();
        if (req.Category is not null)    tx.Category    = req.Category;
        if (req.Supplier is not null)    tx.Supplier    = req.Supplier;
        if (req.Notes    is not null)    tx.Notes       = req.Notes;

        if (req.Status is not null)
        {
            tx.Status = req.Status;
            if (req.Status == "paid" && tx.PaidAt is null)
                tx.PaidAt = DateTime.UtcNow;
            else if (req.Status != "paid")
                tx.PaidAt = null;
        }

        tx.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(tx));
    }

    // ── DELETE /api/contas-receber/{id} ───────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var tx = await _db.ExternalTransactions.FindAsync(id);
        if (tx is null) return NotFound();
        _db.ExternalTransactions.Remove(tx);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── POST /api/contas-receber/import-ofx — upload arquivo OFX ─────────────
    [HttpPost("import-ofx")]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5 MB
    public async Task<IActionResult> ImportOfx(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { Message = "Arquivo OFX inválido ou vazio." });

        using var stream = file.OpenReadStream();
        var parsed = _ofx.Parse(stream);

        int imported = 0, skipped = 0;
        foreach (var p in parsed)
        {
            // Deduplicação por external_id
            if (p.ExternalId is not null)
            {
                var exists = await _db.ExternalTransactions
                    .AnyAsync(t => t.Source == "ofx" && t.ExternalId == p.ExternalId);
                if (exists) { skipped++; continue; }
            }

            var isIncome = p.TrnType.Equals("CREDIT", StringComparison.OrdinalIgnoreCase);
            var tx = new ExternalTransaction
            {
                Source      = "ofx",
                ExternalId  = p.ExternalId,
                Type        = isIncome ? "income" : "expense",
                Amount      = p.Amount,
                Description = p.Description ?? p.Memo ?? "Transação OFX",
                DueDate     = p.Date,
                PaidAt      = p.Date,       // OFX = já executada
                Status      = "paid",
            };
            _db.ExternalTransactions.Add(tx);
            imported++;
        }

        await _db.SaveChangesAsync();
        return Ok(new { imported, skipped, total = parsed.Count });
    }

    // ── GET /api/contas-receber/integracoes ───────────────────────────────────
    [HttpGet("integracoes")]
    public async Task<IActionResult> GetIntegracoes()
    {
        var configs = await _db.IntegrationConfigs.ToListAsync();
        var sources = new[] { "inter", "mercadopago", "sefaz" };

        return Ok(sources.Select(src =>
        {
            var cfg = configs.FirstOrDefault(c => c.Source == src);
            return new
            {
                source      = src,
                isActive    = cfg?.IsActive ?? false,
                isConnected = cfg is not null && cfg.IsActive,
                cnpj        = cfg?.Cnpj,
                pixKey      = cfg?.PixKey,
                lastSyncAt  = cfg?.LastSyncAt,
                expiresAt   = cfg?.ExpiresAt,
                // Nunca expõe tokens
            };
        }));
    }

    // ── PUT /api/contas-receber/integracoes/{source} — salvar config ──────────
    [HttpPut("integracoes/{source}")]
    public async Task<IActionResult> SaveIntegracao(string source, [FromBody] SaveIntegracaoRequest req)
    {
        var allowed = new[] { "inter", "mercadopago", "sefaz" };
        if (!allowed.Contains(source)) return BadRequest(new { Message = "Source inválido." });

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == source);
        if (cfg is null)
        {
            cfg = new IntegrationConfig { Source = source };
            _db.IntegrationConfigs.Add(cfg);
        }

        // ClientId não é secreto — guarda em claro
        if (req.ClientId is not null) cfg.ClientId = req.ClientId;

        // ClientSecret, AccessToken e RefreshToken → AES-256-GCM
        if (req.ClientSecret is not null) cfg.ClientSecret = _enc.Encrypt(req.ClientSecret);

        if (req.Cnpj      is not null) cfg.Cnpj     = req.Cnpj.Replace(".", "").Replace("/", "").Replace("-", "");
        if (req.PixKey    is not null) cfg.PixKey   = req.PixKey.Trim();
        if (req.IsActive.HasValue)     cfg.IsActive  = req.IsActive.Value;

        cfg.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { source, saved = true });
    }

    // ── POST /api/contas-receber/integracoes/{source}/token — salva tokens OAuth (uso interno)
    [HttpPost("integracoes/{source}/token")]
    public async Task<IActionResult> SaveToken(string source, [FromBody] SaveTokenRequest req)
    {
        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == source);
        if (cfg is null) return NotFound(new { Message = "Integração não configurada." });

        cfg.AccessToken  = _enc.EncryptNullable(req.AccessToken);
        cfg.RefreshToken = _enc.EncryptNullable(req.RefreshToken);
        cfg.ExpiresAt    = req.ExpiresAt;
        cfg.LastSyncAt   = DateTime.UtcNow;
        cfg.UpdatedAt    = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { source, tokenSaved = true });
    }

    // ── GET /api/contas-receber/sefaz-status ──────────────────────────────────
    [HttpGet("sefaz-status")]
    public async Task<IActionResult> SefazStatus()
    {
        var fiscal     = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        var integracao = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "sefaz");

        var porStatus = await _db.NotasDestinadas
            .GroupBy(n => n.Status)
            .Select(g => new { Status = g.Key, Qtd = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Qtd);

        return Ok(new
        {
            configured  = await _sefaz.IsConfiguredAsync(),
            ativa       = integracao?.IsActive ?? false,
            ambiente    = fiscal?.Ambiente.ToString(),
            ultimoNsu   = fiscal?.DistUltimoNsu ?? 0,
            lastSyncAt  = integracao?.LastSyncAt,
            proximaConsultaEm = fiscal?.DistProximaConsultaEm,
            notas = new
            {
                resumo        = porStatus.GetValueOrDefault(NotaDestinadaStatus.Resumo),
                ciencia       = porStatus.GetValueOrDefault(NotaDestinadaStatus.Ciencia),
                xmlBaixado    = porStatus.GetValueOrDefault(NotaDestinadaStatus.XmlBaixado),
                contasGeradas = porStatus.GetValueOrDefault(NotaDestinadaStatus.ContasGeradas),
                canceladas    = porStatus.GetValueOrDefault(NotaDestinadaStatus.Cancelada),
            },
        });
    }

    // ── POST /api/contas-receber/sefaz/sync — sincronização manual ────────────
    [HttpPost("sefaz/sync")]
    public async Task<IActionResult> SefazSync(CancellationToken ct)
    {
        var result = await _sefaz.SincronizarAsync(ct);
        if (!result.Executado)
        {
            var payload = new
            {
                message = result.Mensagem,
                proximaTentativaEm = result.ProximaTentativaEm,
            };
            if (result.CooldownAtivo)
                return StatusCode(StatusCodes.Status429TooManyRequests, payload);
            if (result.SincronizacaoEmAndamento)
                return Conflict(payload);
            return BadRequest(payload);
        }
        if (result.BloqueadoPorConsumoIndevido)
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = result.Mensagem,
                proximaTentativaEm = result.ProximaTentativaEm,
            });
        return Ok(new
        {
            novasNotas    = result.NovasNotas,
            manifestadas  = result.Manifestadas,
            xmlsBaixados  = result.XmlsBaixados,
            contasCriadas = result.ContasCriadas,
            mensagem      = result.Mensagem,
        });
    }

    // ── GET /api/contas-receber/notas-destinadas — NF-e recebidas ─────────────
    [HttpGet("notas-destinadas")]
    public async Task<IActionResult> NotasDestinadas([FromQuery] string? status = null)
    {
        var q = _db.NotasDestinadas.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(n => n.Status == status);

        var notas = await q
            .OrderByDescending(n => n.DataEmissao ?? n.CreatedAt)
            .Take(200)
            .Select(n => new
            {
                n.Id, n.ChaveAcesso, n.EmitenteCnpj, n.EmitenteNome,
                n.Valor, n.DataEmissao, n.Status, n.ContasGeradas,
                n.CienciaEm, n.Erro, n.CreatedAt,
            })
            .ToListAsync();

        return Ok(notas);
    }

    // ── POST /api/contas-receber/integracoes/inter/sync — sincronização manual ─
    [HttpPost("integracoes/inter/sync")]
    public async Task<IActionResult> InterSync([FromQuery] int days = 7)
    {
        var result = await _inter.SyncAsync(days);
        if (result.Skipped)
            return BadRequest(new { Message = result.Reason });
        if (result.Error is not null)
            return StatusCode(422, new { message = result.Error });
        return Ok(new { result.Imported, result.Duplicates });
    }

    // ── GET /api/contas-receber/integracoes/inter/status ──────────────────────
    [HttpGet("integracoes/inter/status")]
    public async Task<IActionResult> InterStatus()
    {
        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        return Ok(new
        {
            configured      = cfg is not null && _inter.IsConfigured(cfg),
            certificateOk   = _inter.CertificateExists(),
            hasCredentials  = !string.IsNullOrWhiteSpace(cfg?.ClientId) && !string.IsNullOrWhiteSpace(cfg?.ClientSecret),
            lastSyncAt      = cfg?.LastSyncAt,
        });
    }

    // ── POST /api/contas-receber/integracoes/inter/certificado — upload mTLS ────
    [HttpPost("integracoes/inter/certificado")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadCertificado(IFormFile crt, IFormFile key)
    {
        const long maxBytes = 64 * 1024; // 64 KB
        if (crt.Length > maxBytes || key.Length > maxBytes)
            return BadRequest(new { message = "Arquivo muito grande (máx 64 KB)." });

        var certPath = _config["Inter:CertificatePath"]
            ?? throw new InvalidOperationException("Inter:CertificatePath não configurado.");
        var keyPath  = _config["Inter:KeyPath"]
            ?? throw new InvalidOperationException("Inter:KeyPath não configurado.");

        Directory.CreateDirectory(Path.GetDirectoryName(certPath)!);
        Directory.CreateDirectory(Path.GetDirectoryName(keyPath)!);

        await using (var fs = System.IO.File.Create(certPath))
            await crt.CopyToAsync(fs);

        await using (var fs = System.IO.File.Create(keyPath))
            await key.CopyToAsync(fs);

        return Ok(new { message = "Certificado instalado com sucesso.", certificateOk = true });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static object ToDto(ExternalTransaction t) => new
    {
        t.Id,
        t.Source,
        t.ExternalId,
        t.Type,
        t.Amount,
        t.Description,
        t.DueDate,
        t.PaidAt,
        t.Status,
        t.Category,
        t.Supplier,
        t.NfeKey,
        t.Notes,
        t.CreatedAt,
        t.UpdatedAt,
    };
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public class CreateTransactionRequest
{
    [Required, MaxLength(10)]
    public string Type { get; init; } = "expense";

    [Required, Range(0.01, 9999999)]
    public decimal Amount { get; init; }

    [Required, MaxLength(500)]
    public string Description { get; init; } = "";

    public DateTime? DueDate  { get; init; }
    public string?   Category { get; init; }
    public string?   Supplier { get; init; }
    public string?   Notes    { get; init; }
}

public class UpdateTransactionRequest
{
    public string?   Description { get; init; }
    public decimal?  Amount      { get; init; }
    public DateTime? DueDate     { get; init; }
    public string?   Status      { get; init; }
    public string?   Category    { get; init; }
    public string?   Supplier    { get; init; }
    public string?   Notes       { get; init; }
}

public class SaveIntegracaoRequest
{
    public string? ClientId     { get; init; }
    public string? ClientSecret { get; init; }
    public string? Cnpj         { get; init; }
    public string? PixKey       { get; init; }
    public bool?   IsActive     { get; init; }
}

public class SaveTokenRequest
{
    public string?   AccessToken  { get; init; }
    public string?   RefreshToken { get; init; }
    public DateTime? ExpiresAt    { get; init; }
}
