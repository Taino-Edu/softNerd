// =============================================================================
// FiscalController.cs — Configuração fiscal, certificado A1, naturezas de
// operação e exportação de XMLs de NFC-e pro contador.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/fiscal")]
[Authorize(Policy = "AdminOnly")]
[Produces("application/json")]
public class FiscalController : ControllerBase
{
    private readonly AppDbContext              _db;
    private readonly EncryptionService         _enc;
    private readonly FiscalCertificadoService  _certificado;
    private readonly FiscalXmlExportService    _export;
    private readonly INfceEmissionService      _emissao;

    public FiscalController(
        AppDbContext db, EncryptionService enc, FiscalCertificadoService certificado,
        FiscalXmlExportService export, INfceEmissionService emissao)
    {
        _db          = db;
        _enc         = enc;
        _certificado = certificado;
        _export      = export;
        _emissao     = emissao;
    }

    // ── GET /api/fiscal/config ────────────────────────────────────────────────
    [HttpGet("config")]
    public async Task<IActionResult> GetConfig()
    {
        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        return Ok(ToDto(cfg));
    }

    // ── PUT /api/fiscal/config ────────────────────────────────────────────────
    [HttpPut("config")]
    public async Task<IActionResult> SaveConfig([FromBody] SaveFiscalConfigRequest req)
    {
        var cfg = await GetOrCreateConfigAsync();

        if (req.Cnpj is not null)
            cfg.Cnpj = req.Cnpj.Replace(".", "").Replace("/", "").Replace("-", "");
        if (req.RazaoSocial       is not null) cfg.RazaoSocial       = req.RazaoSocial;
        if (req.InscricaoEstadual is not null) cfg.InscricaoEstadual = req.InscricaoEstadual;
        if (req.EmailContador     is not null) cfg.EmailContador     = req.EmailContador;
        if (req.SerieNfce.HasValue)            cfg.SerieNfce         = req.SerieNfce.Value;

        if (req.Logradouro          is not null) cfg.Logradouro          = req.Logradouro;
        if (req.Numero              is not null) cfg.Numero              = req.Numero;
        if (req.Complemento         is not null) cfg.Complemento         = req.Complemento;
        if (req.Bairro              is not null) cfg.Bairro              = req.Bairro;
        if (req.CodigoMunicipioIbge is not null) cfg.CodigoMunicipioIbge = req.CodigoMunicipioIbge;
        if (req.Municipio           is not null) cfg.Municipio           = req.Municipio;
        if (req.Uf                  is not null) cfg.Uf                  = req.Uf.ToUpperInvariant();
        if (req.Cep                 is not null) cfg.Cep                 = req.Cep.Replace("-", "");
        if (req.CscId               is not null) cfg.CscId               = req.CscId;
        if (req.CscToken            is not null) cfg.CscToken            = req.CscToken;

        if (req.RegimeTributario is not null &&
            Enum.TryParse<RegimeTributario>(req.RegimeTributario, out var regime))
            cfg.RegimeTributario = regime;

        if (req.Ambiente is not null &&
            Enum.TryParse<AmbienteFiscal>(req.Ambiente, out var ambiente))
            cfg.Ambiente = ambiente;

        if (req.ModoSimulacao.HasValue)
            cfg.ModoSimulacao = req.ModoSimulacao.Value;

        if (req.FormasPagamentoAutoEmissao is not null)
        {
            var invalidas = req.FormasPagamentoAutoEmissao.Where(f => !PaymentMethod.IsValid(f)).ToList();
            if (invalidas.Count > 0)
                return BadRequest(new { Message = $"Forma(s) de pagamento inválida(s): {string.Join(", ", invalidas)}." });

            cfg.FormasPagamentoAutoEmissao = string.Join(",", req.FormasPagamentoAutoEmissao.Distinct());
        }

        cfg.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(ToDto(cfg));
    }

    // ── POST /api/fiscal/certificado — upload do .pfx + senha ────────────────
    [HttpPost("certificado")]
    [RequestSizeLimit(2 * 1024 * 1024)] // 2 MB — certificados .pfx são pequenos
    public async Task<IActionResult> UploadCertificado(IFormFile file, [FromForm] string senha)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { Message = "Arquivo de certificado (.pfx) inválido ou vazio." });
        if (string.IsNullOrWhiteSpace(senha))
            return BadRequest(new { Message = "Informe a senha do certificado." });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var pfxBytes = ms.ToArray();

        CertificadoInfo info;
        try
        {
            info = _certificado.Validar(pfxBytes, senha);
        }
        catch (CertificadoInvalidoException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }

        var cfg = await GetOrCreateConfigAsync();

        cfg.CertificadoPfxEncrypted        = _enc.Encrypt(Convert.ToBase64String(pfxBytes));
        cfg.CertificadoSenhaEncrypted      = _enc.Encrypt(senha);
        cfg.CertificadoValidade            = info.NotAfter;
        cfg.CertificadoUploadedAt          = DateTime.UtcNow;
        cfg.CertificadoUltimoAlertaLimiar  = null; // reseta o ciclo de alertas pro novo certificado
        cfg.UpdatedAt                      = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            Message   = "Certificado validado e salvo com sucesso.",
            Validade  = info.NotAfter,
            DiasRestantes = (int)(info.NotAfter.Date - DateTime.UtcNow.Date).TotalDays,
        });
    }

    // ── GET /api/fiscal/naturezas-operacao ────────────────────────────────────
    [HttpGet("naturezas-operacao")]
    public async Task<IActionResult> ListNaturezas()
    {
        var naturezas = await _db.NaturezasOperacao
            .OrderByDescending(n => n.IsPadrao)
            .ThenBy(n => n.Descricao)
            .ToListAsync();

        return Ok(naturezas);
    }

    /// <summary>CSOSN que o motor de emissão sabe montar sozinho — ver
    /// NfceEmissionService.MontarIcmsSimplesNacional. 201/202/203 exigem ICMS-ST como
    /// substituto (MVA, base reduzida) que ninguém aqui calcula, por isso ficam de fora.</summary>
    private static readonly string[] CsosnSuportados = { "101", "102", "103", "300", "400", "500", "900" };

    private BadRequestObjectResult? ValidarCsosn(string? csosn)
    {
        if (string.IsNullOrWhiteSpace(csosn)) return null;
        if (!CsosnSuportados.Contains(csosn))
            return BadRequest(new
            {
                Message = csosn is "201" or "202" or "203"
                    ? $"CSOSN {csosn} exige ICMS-ST como substituto tributário (MVA, base reduzida) — este sistema não calcula isso sozinho. Consulte o contador ou use um CSOSN sem ICMS-ST."
                    : $"CSOSN \"{csosn}\" não é suportado. Use um destes: {string.Join(", ", CsosnSuportados)}."
            });
        return null;
    }

    // ── POST /api/fiscal/naturezas-operacao ───────────────────────────────────
    [HttpPost("naturezas-operacao")]
    public async Task<IActionResult> CreateNatureza([FromBody] SaveNaturezaRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (ValidarCsosn(req.Csosn) is BadRequestObjectResult erro) return erro;

        var natureza = new NaturezaOperacao
        {
            Descricao = req.Descricao,
            Cfop      = req.Cfop,
            Csosn     = req.Csosn,
            PercentualCreditoIcmsSn = req.Csosn == "101" ? req.PercentualCreditoSn : null,
            IsPadrao  = req.IsPadrao,
        };

        // Trocar o padrão (limpar os outros + gravar este) precisa ser atômico:
        // duas requisições concorrentes marcando padrão=true só podem ter uma vencedora
        // graças ao índice único parcial ix_naturezas_operacao_unica_padrao.
        // Transação manual precisa rodar dentro da execution strategy
        // (EnableRetryOnFailure do Npgsql rejeita transação solta).
        IActionResult? conflito = null;
        await _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                if (natureza.IsPadrao)
                    await _db.NaturezasOperacao.Where(n => n.IsPadrao)
                        .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsPadrao, false));

                _db.NaturezasOperacao.Add(natureza);
                await _db.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch (DbUpdateException)
            {
                await tx.RollbackAsync();
                conflito = Conflict(new { Message = "Outra natureza foi marcada como padrão ao mesmo tempo. Tente novamente." });
            }
        });

        if (conflito is not null) return conflito;

        return Ok(natureza);
    }

    // ── PUT /api/fiscal/naturezas-operacao/{id} ───────────────────────────────
    [HttpPut("naturezas-operacao/{id:guid}")]
    public async Task<IActionResult> UpdateNatureza(Guid id, [FromBody] SaveNaturezaRequest req)
    {
        if (ValidarCsosn(req.Csosn) is BadRequestObjectResult erro) return erro;

        var natureza = await _db.NaturezasOperacao.FindAsync(id);
        if (natureza is null) return NotFound();

        natureza.Descricao = req.Descricao;
        natureza.Cfop      = req.Cfop;
        natureza.Csosn     = req.Csosn;
        natureza.PercentualCreditoIcmsSn = req.Csosn == "101" ? req.PercentualCreditoSn : null;
        natureza.UpdatedAt = DateTime.UtcNow;

        IActionResult? conflito = null;
        await _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                if (req.IsPadrao && !natureza.IsPadrao)
                    await _db.NaturezasOperacao.Where(n => n.IsPadrao && n.Id != id)
                        .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsPadrao, false));
                natureza.IsPadrao = req.IsPadrao;

                await _db.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch (DbUpdateException)
            {
                await tx.RollbackAsync();
                conflito = Conflict(new { Message = "Outra natureza foi marcada como padrão ao mesmo tempo. Tente novamente." });
            }
        });

        if (conflito is not null) return conflito;

        return Ok(natureza);
    }

    // ── DELETE /api/fiscal/naturezas-operacao/{id} ────────────────────────────
    [HttpDelete("naturezas-operacao/{id:guid}")]
    public async Task<IActionResult> DeleteNatureza(Guid id)
    {
        var natureza = await _db.NaturezasOperacao.FindAsync(id);
        if (natureza is null) return NotFound();

        _db.NaturezasOperacao.Remove(natureza);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── GET /api/fiscal/notas?status=&page=&pageSize= ─────────────────────────
    [HttpGet("notas")]
    public async Task<IActionResult> ListNotas(
        [FromQuery] string? status = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 30)
    {
        var q = _db.NotasFiscaisEmitidas.AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<NotaFiscalStatus>(status, out var statusEnum))
            q = q.Where(n => n.Status == statusEnum);

        var total = await q.CountAsync();
        var itens = await q.OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(n => new
            {
                n.Id,
                Origem = n.Origem.ToString(),
                n.ComandaId,
                n.VendaAvulsaId,
                Status = n.Status.ToString(),
                n.ValorTotalEmCentavos,
                n.Serie,
                n.Numero,
                n.ChaveAcesso,
                n.Protocolo,
                n.MotivoRejeicao,
                n.EmitidoEm,
                n.CanceladoEm,
                n.InutilizadoEm,
                n.TentativasReprocessamento,
                n.CreatedAt,
            })
            .ToListAsync();

        // Visibilidade pro admin: quantas notas estão paradas esperando o retry automático
        // (pendentes de verdade + em contingência aguardando retransmissão) e há quanto
        // tempo a mais antiga está parada — sinal de que algo precisa de atenção.
        var pendentesQuery = _db.NotasFiscaisEmitidas.Where(n =>
            n.Status == NotaFiscalStatus.PendenteEmissao || n.Status == NotaFiscalStatus.AutorizadaContingencia);
        var pendentesCount = await pendentesQuery.CountAsync();
        var pendenteMaisAntiga = pendentesCount > 0
            ? await pendentesQuery.OrderBy(n => n.CreatedAt).Select(n => n.CreatedAt).FirstAsync()
            : (DateTime?)null;

        return Ok(new
        {
            items = itens, total, totalPages = (int)Math.Ceiling(total / (double)pageSize),
            pendentesCount, pendenteMaisAntiga,
        });
    }

    // ── POST /api/fiscal/emitir/comanda/{id} ──────────────────────────────────
    // Emissão manual tardia — usada quando o admin optou por NÃO emitir no fechamento
    // (checkbox desmarcado) e decidiu emitir depois pelo histórico.
    [HttpPost("emitir/comanda/{id:guid}")]
    public async Task<IActionResult> EmitirNotaComanda(Guid id)
    {
        var jaExiste = await _db.NotasFiscaisEmitidas.AnyAsync(n => n.Origem == NotaFiscalOrigem.Comanda && n.ComandaId == id);
        if (jaExiste)
            return Conflict(new { Message = "Já existe uma nota fiscal para esta comanda. Use reprocessar/cancelar em vez de emitir de novo." });

        var nota = await _emissao.EmitirParaComandaAsync(id);
        return Ok(new { nota.Id, Status = nota.Status.ToString(), nota.MotivoRejeicao });
    }

    // ── POST /api/fiscal/emitir/venda-avulsa/{id} ─────────────────────────────
    [HttpPost("emitir/venda-avulsa/{id}")]
    public async Task<IActionResult> EmitirNotaVendaAvulsa(string id)
    {
        var jaExiste = await _db.NotasFiscaisEmitidas.AnyAsync(n => n.Origem == NotaFiscalOrigem.VendaAvulsa && n.VendaAvulsaId == id);
        if (jaExiste)
            return Conflict(new { Message = "Já existe uma nota fiscal para esta venda. Use reprocessar/cancelar em vez de emitir de novo." });

        var nota = await _emissao.EmitirParaVendaAvulsaAsync(id);
        return Ok(new { nota.Id, Status = nota.Status.ToString(), nota.MotivoRejeicao });
    }

    // ── POST /api/fiscal/notas/{id}/reprocessar ───────────────────────────────
    [HttpPost("notas/{id:guid}/reprocessar")]
    public async Task<IActionResult> ReprocessarNota(Guid id)
    {
        var nota = await _emissao.ReprocessarAsync(id);
        return Ok(new { nota.Id, Status = nota.Status.ToString(), nota.MotivoRejeicao });
    }

    // ── POST /api/fiscal/notas/{id}/cancelar ──────────────────────────────────
    [HttpPost("notas/{id:guid}/cancelar")]
    public async Task<IActionResult> CancelarNota(Guid id, [FromBody] CancelarNotaRequest req)
    {
        try
        {
            var nota = await _emissao.CancelarAsync(id, req.Justificativa);
            return Ok(new { nota.Id, Status = nota.Status.ToString() });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    // ── GET /api/fiscal/notas/{id}/cupom ──────────────────────────────────────
    [HttpGet("notas/{id:guid}/cupom")]
    public async Task<IActionResult> ObterCupom(Guid id)
    {
        var cupom = await _emissao.ObterCupomAsync(id);
        return cupom is null ? NotFound() : Ok(cupom);
    }

    // ── GET /api/fiscal/exportar-xmls?inicio=&fim= ────────────────────────────
    // "Fim" no formulário é o ÚLTIMO DIA a incluir (inclusivo) — GerarZipAsync espera
    // um limite EXCLUSIVO, então soma 1 dia aqui. Sem isso, selecionar o mesmo dia nos
    // dois campos (o caso mais comum: "baixar só hoje") tanto era rejeitado (fim <= inicio)
    // quanto, mesmo se passasse, devolvia o ZIP vazio (fim à meia-noite exclui o dia inteiro).
    [HttpGet("exportar-xmls")]
    public async Task<IActionResult> ExportarXmls([FromQuery] DateTime inicio, [FromQuery] DateTime fim)
    {
        if (fim < inicio)
            return BadRequest(new { Message = "O período final não pode ser antes do inicial." });

        var inicioUtc       = inicio.Date.ToUniversalTime();
        var fimExclusivoUtc = fim.Date.AddDays(1).ToUniversalTime();

        var zipBytes = await _export.GerarZipAsync(inicioUtc, fimExclusivoUtc);
        var fileName = $"xmls-fiscais-{inicio:yyyy-MM-dd}-a-{fim:yyyy-MM-dd}.zip";

        return File(zipBytes, "application/zip", fileName);
    }

    // ── POST /api/fiscal/test-emissao-sefaz (DEBUG — herda AdminOnly da classe) ─
    [HttpPost("test-emissao-sefaz")]
    public async Task<IActionResult> TestEmissaoSefaz()
    {
        // Verificar config fiscal
        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        if (cfg is null || !cfg.CertificadoConfigurado)
            return BadRequest(new { Message = "Certificado digital não configurado em Admin > Fiscal" });

        // Buscar comanda com itens
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .ThenInclude(i => i.Product)
            .ThenInclude(p => p!.NaturezaOperacao)
            .FirstOrDefaultAsync(c => c.Items.Count > 0);

        if (comanda is null)
            return BadRequest(new { Message = "Nenhuma comanda com itens encontrada pra teste" });

        // Tentar emissão
        var nota = await _emissao.EmitirParaComandaAsync(comanda.Id);

        return Ok(new
        {
            notaId = nota.Id,
            status = nota.Status.ToString(),
            protocolo = nota.Protocolo,
            chaveAcesso = nota.ChaveAcesso,
            motivo = nota.MotivoRejeicao,
            qrCode = nota.UrlQrCode,
            mensagem = nota.Status switch
            {
                NotaFiscalStatus.Autorizada => "✅ Nota autorizada! Funcionou!",
                NotaFiscalStatus.AutorizadaContingencia => "⚠️ Emitida em contingência (SEFAZ inalcançável — vai retransmitir sozinho)",
                NotaFiscalStatus.Rejeitada => $"❌ Rejeitada: {nota.MotivoRejeicao}",
                NotaFiscalStatus.PendenteEmissao => $"⏳ Pendente: {nota.MotivoRejeicao}",
                _ => $"? Status desconhecido: {nota.Status}"
            }
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Busca a linha única de configuração fiscal pelo ID fixo, criando-a se necessário.
    /// Como o ID é fixo, uma segunda inserção concorrente vira uma violação de PK —
    /// nesse caso, descarta a tentativa local e relê a linha que a outra requisição criou.
    /// </summary>
    private async Task<FiscalConfig> GetOrCreateConfigAsync()
    {
        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        if (cfg is not null) return cfg;

        cfg = new FiscalConfig();
        _db.FiscalConfigs.Add(cfg);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            _db.Entry(cfg).State = EntityState.Detached;
            cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId)
                ?? throw new InvalidOperationException("Falha ao obter configuração fiscal após conflito de concorrência.");
        }

        return cfg;
    }

    private static object ToDto(FiscalConfig? cfg)
    {
        cfg ??= new FiscalConfig();

        int? diasParaVencer = cfg.CertificadoValidade.HasValue
            ? (int)(cfg.CertificadoValidade.Value.Date - DateTime.UtcNow.Date).TotalDays
            : null;

        return new
        {
            cfg.Cnpj,
            cfg.RazaoSocial,
            cfg.InscricaoEstadual,
            cfg.Logradouro,
            cfg.Numero,
            cfg.Complemento,
            cfg.Bairro,
            cfg.CodigoMunicipioIbge,
            cfg.Municipio,
            cfg.Uf,
            cfg.Cep,
            CscConfigurado = !string.IsNullOrWhiteSpace(cfg.CscId) && !string.IsNullOrWhiteSpace(cfg.CscToken),
            cfg.CscId, // não sensível isoladamente; o token nunca é retornado
            RegimeTributario = cfg.RegimeTributario.ToString(),
            Ambiente         = cfg.Ambiente.ToString(),
            cfg.ModoSimulacao,
            cfg.SerieNfce,
            cfg.ProximoNumeroNfce,
            cfg.EmailContador,
            cfg.CertificadoConfigurado,
            cfg.CertificadoValidade,
            DiasParaVencer = diasParaVencer,
            FormasPagamentoAutoEmissao = string.IsNullOrWhiteSpace(cfg.FormasPagamentoAutoEmissao)
                ? Array.Empty<string>()
                : cfg.FormasPagamentoAutoEmissao.Split(',', StringSplitOptions.RemoveEmptyEntries),
        };
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public class SaveFiscalConfigRequest
{
    public string? Cnpj              { get; init; }
    public string? RazaoSocial       { get; init; }
    public string? InscricaoEstadual { get; init; }
    public string? Logradouro          { get; init; }
    public string? Numero              { get; init; }
    public string? Complemento         { get; init; }
    public string? Bairro              { get; init; }
    public string? CodigoMunicipioIbge { get; init; }
    public string? Municipio           { get; init; }
    public string? Uf                  { get; init; }
    public string? Cep                 { get; init; }
    public string? CscId               { get; init; }
    public string? CscToken            { get; init; }
    public string? RegimeTributario  { get; init; }
    public string? Ambiente          { get; init; }
    public bool?   ModoSimulacao     { get; init; }
    public int?    SerieNfce         { get; init; }
    public string? EmailContador     { get; init; }

    /// <summary>Formas de pagamento que emitem NFC-e automaticamente ao fechar a venda, sem perguntar. Null = não altera.</summary>
    public string[]? FormasPagamentoAutoEmissao { get; init; }
}

public class CancelarNotaRequest
{
    [Required, MinLength(15)]
    public string Justificativa { get; init; } = "";
}

public class SaveNaturezaRequest
{
    [Required, MaxLength(150)]
    public string Descricao { get; init; } = "";

    [Required, MaxLength(4)]
    public string Cfop { get; init; } = "";

    [MaxLength(3)]
    public string? Csosn { get; init; }

    /// <summary>% de crédito de ICMS (pCredSN) — só considerado quando Csosn = "101".</summary>
    [Range(0, 100)]
    public decimal? PercentualCreditoSn { get; init; }

    public bool IsPadrao { get; init; }
}
