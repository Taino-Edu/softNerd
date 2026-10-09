// =============================================================================
// CrediariosController.cs — Gestão de crediários
//
// POST /api/crediarios                     → Admin: cria crediário manual (dívida antiga)
// GET  /api/crediarios                     → Admin: lista todos (filtro por status)
// GET  /api/crediarios/usuario/{userId}    → Admin: crediários de um cliente
// GET  /api/crediarios/meu                 → Cliente: seu crediário ativo
// POST /api/crediarios/{id}/pagamento      → Admin: registra pagamento parcial ou total
// GET  /api/crediarios/avisos/config        → Admin: config dos lembretes automáticos
// PUT  /api/crediarios/avisos/config        → Admin: salva a config
// GET  /api/crediarios/{id}/aviso/previa    → Admin: texto do lembrete, sem enviar
// POST /api/crediarios/{id}/aviso           → Admin: manda o lembrete agora
//
// Cada compra da conta é um CrediarioLancamento — o DTO devolve as compras
// separadas (Lancamentos) e a lista corrida (ItensComanda) pra impressão.
// =============================================================================

using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/crediarios")]
[Authorize]
public class CrediariosController : ControllerBase
{
    private readonly AppDbContext    _db;
    private readonly IEmailService   _email;
    private readonly CrediarioPixService _pix;
    private readonly IAuditService   _audit;
    private readonly CrediarioAvisoService _avisos;
    private readonly IWhatsAppGateway _whatsApp;
    private readonly ILogger<CrediariosController> _logger;

    public CrediariosController(AppDbContext db, IEmailService email, CrediarioPixService pix, IAuditService audit,
        CrediarioAvisoService avisos, IWhatsAppGateway whatsApp, ILogger<CrediariosController> logger)
    {
        _avisos            = avisos;
        _whatsApp          = whatsApp;
        _db                = db;
        _email             = email;
        _pix               = pix;
        _audit             = audit;
        _logger            = logger;
    }

    // -------------------------------------------------------------------------
    // POST /api/crediarios — criação manual (dívidas anteriores ao sistema)
    // -------------------------------------------------------------------------
    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(CrediariosDto), 200)]
    [ProducesResponseType(400)]
    public async Task<ActionResult<CrediariosDto>> CriarManual([FromBody] CriarCrediarioManualRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        // Verifica se o cliente existe
        var usuario = await _db.Users.FindAsync(request.UserId);
        if (usuario == null)
            return BadRequest(new { Message = "Cliente não encontrado." });

        var adminId    = GetUserId();
        var agora      = DateTime.UtcNow;
        var dataAbert  = request.DataAbertura.HasValue
                             ? request.DataAbertura.Value.ToUniversalTime()
                             : agora;

        var crediario = new Crediario
        {
            UserId           = request.UserId,
            ComandaId        = null, // dívida manual — sem comanda de origem
            ValorEmCentavos  = request.ValorEmCentavos,
            DataAbertura     = dataAbert,
            DataVencimento   = request.DataVencimento.HasValue
                                   ? CrediarioLancamentos.VencimentoFimDoDia(request.DataVencimento.Value)
                                   : dataAbert.AddDays(30),
            Status           = CrediariosStatus.Aberto,
            Observacao       = string.IsNullOrWhiteSpace(request.Observacao)
                                   ? "Dívida anterior ao sistema"
                                   : request.Observacao,
            AbertoPorAdminId = adminId,
        };
        crediario.Lancamentos.Add(new CrediarioLancamento
        {
            CrediarioId     = crediario.Id,
            Origem          = CrediarioLancamentoOrigem.Manual,
            ValorEmCentavos = request.ValorEmCentavos,
            ItensJson       = CrediarioLancamentos.SerializarItens(request.Itens ?? new List<ItemCrediarioDto>()),
            Descricao       = crediario.Observacao,
            CreatedAt       = dataAbert,
        });

        _db.Crediarios.Add(crediario);
        await _db.SaveChangesAsync();

        // Recarrega com includes para montar o DTO
        var saved = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .FirstAsync(c => c.Id == crediario.Id);

        _logger.LogInformation(
            "Crediário manual {Id} criado pelo admin {AdminId} para usuário {UserId} — R$ {Valor:N2}",
            crediario.Id, adminId, request.UserId, request.ValorEmCentavos / 100m);

        return Ok(MapToDto(saved));
    }

    // -------------------------------------------------------------------------
    // GET /api/crediarios/por-cliente — dívidas abertas agrupadas por pessoa
    // -------------------------------------------------------------------------
    [HttpGet("por-cliente")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<List<CrediariosClienteDto>>> GetPorCliente()
    {
        var crediarios = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .Where(c => c.Status == CrediariosStatus.Aberto)
            .OrderBy(c => c.DataVencimento)
            .ToListAsync();

        var agora = DateTime.UtcNow;
        var grupos = crediarios
            .GroupBy(c => c.UserId)
            .Select(g =>
            {
                var dividas = g.Select(MapToDto).ToList();
                var user    = g.First().User;
                return new CrediariosClienteDto
                {
                    UserId          = g.Key,
                    UserName        = user?.Name   ?? string.Empty,
                    UserEmail       = user?.Email,
                    UserWhatsApp    = user?.WhatsApp,
                    SaldoTotal      = dividas.Sum(d => d.SaldoRestanteEmReais),
                    TotalDividas    = dividas.Count,
                    TemVencido      = dividas.Any(d => d.Vencido),
                    ProximoVencimento = g.Min(c => c.DataVencimento),
                    Dividas         = dividas,
                };
            })
            .OrderByDescending(g => g.TemVencido)
            .ThenBy(g => g.ProximoVencimento)
            .ToList();

        return Ok(grupos);
    }

    // -------------------------------------------------------------------------
    // GET /api/crediarios?status=Aberto
    // -------------------------------------------------------------------------
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<List<CrediariosDto>>> GetAll([FromQuery] string? status)
    {
        var query = _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<CrediariosStatus>(status, ignoreCase: true, out var s))
            query = query.Where(c => c.Status == s);

        var crediarios = await query
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        return Ok(crediarios.Select(MapToDto).ToList());
    }

    // -------------------------------------------------------------------------
    // GET /api/crediarios/usuario/{userId}
    // -------------------------------------------------------------------------
    [HttpGet("usuario/{userId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<List<CrediariosDto>>> GetByUser(Guid userId)
    {
        var crediarios = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        return Ok(crediarios.Select(MapToDto).ToList());
    }

    // -------------------------------------------------------------------------
    // GET /api/crediarios/historico — todo o histórico de crediários do cliente
    // -------------------------------------------------------------------------
    [HttpGet("historico")]
    public async Task<ActionResult<List<CrediariosDto>>> GetMeuHistorico()
    {
        var userId = GetUserId();
        var lista  = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        return Ok(lista.Select(MapToDto).ToList());
    }

    // -------------------------------------------------------------------------
    // PATCH /api/crediarios/{id} — editar valor, observação ou vencimento
    // -------------------------------------------------------------------------
    [HttpPatch("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(CrediariosDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<ActionResult<CrediariosDto>> Editar(Guid id, [FromBody] EditarCrediarioRequest request)
    {
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        if (crediario.Status == CrediariosStatus.Pago)
            return BadRequest(new { Message = "Não é possível editar um crediário já quitado." });

        var antes = new { crediario.ValorEmCentavos, crediario.DataVencimento, crediario.Observacao };

        if (request.ValorEmCentavos.HasValue)
        {
            if (request.ValorEmCentavos.Value < crediario.ValorPagoEmCentavos)
                return BadRequest(new
                {
                    Message = $"O novo valor ({Common.Dinheiro.Brl(request.ValorEmCentavos.Value / 100m)}) não pode ser menor do que o valor já pago ({Common.Dinheiro.Brl(crediario.ValorPagoEmCentavos / 100m)})."
                });
            crediario.ValorEmCentavos = request.ValorEmCentavos.Value;
        }

        if (request.Observacao != null)
            crediario.Observacao = request.Observacao;

        if (request.DataVencimento.HasValue)
        {
            if (request.DataVencimento.Value.Date < CrediarioLancamentos.HojeBrasil())
                return BadRequest(new { Message = "A data de vencimento não pode ser no passado." });
            crediario.DataVencimento = CrediarioLancamentos.VencimentoFimDoDia(request.DataVencimento.Value);
        }

        // Cada item volta pra compra de onde veio (LancamentoId); item novo, sem compra,
        // vai pro bloco de ajuste manual da conta.
        if (request.Itens != null)
        {
            var ativos    = crediario.Lancamentos.Where(l => l.EstornadoEm == null).ToList();
            var idsAtivos = ativos.Select(l => l.Id).ToHashSet();

            foreach (var l in ativos)
                l.ItensJson = CrediarioLancamentos.SerializarItens(request.Itens.Where(i => i.LancamentoId == l.Id));

            var semCompra = request.Itens
                .Where(i => i.LancamentoId is null || !idsAtivos.Contains(i.LancamentoId.Value))
                .ToList();
            if (semCompra.Count > 0)
            {
                var ajuste = ativos.FirstOrDefault(l => l.Origem == CrediarioLancamentoOrigem.Ajuste);
                if (ajuste is null)
                {
                    ajuste = new CrediarioLancamento
                    {
                        CrediarioId     = crediario.Id,
                        Origem          = CrediarioLancamentoOrigem.Ajuste,
                        ValorEmCentavos = 0,
                        Descricao       = "Itens adicionados na edição da conta",
                    };
                    _db.CrediarioLancamentos.Add(ajuste);
                }
                ajuste.ItensJson = CrediarioLancamentos.SerializarItens(
                    request.Itens.Where(i => i.LancamentoId == ajuste.Id).Concat(semCompra));
            }
        }

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Crediário {Id} editado pelo admin {AdminId}", id, GetUserId());

        // Mexer no valor de uma dívida precisa deixar rastro de quem mudou e de quanto era.
        var depois = new { crediario.ValorEmCentavos, crediario.DataVencimento, crediario.Observacao };
        await _audit.LogAsync("EditouCrediario", "Crediario", id.ToString(),
            details: JsonSerializer.Serialize(new { antes, depois, itensEditados = request.Itens != null }),
            httpContext: HttpContext);

        return Ok(MapToDto(crediario));
    }

    // -------------------------------------------------------------------------
    // POST /api/crediarios/{id}/pagamento
    // -------------------------------------------------------------------------
    [HttpPost("{id:guid}/pagamento")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CrediariosDto>> RegistrarPagamento(
        Guid id, [FromBody] RegistrarPagamentoRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        // A venda avulsa já validava a forma de pagamento contra PaymentMethod.All, mas
        // aqui qualquer string entrava e virava uma linha fantasma no relatório financeiro
        // agrupado por forma de pagamento.
        // Pontos, Cashback e "Crediário" passavam aqui sem descontar nada do cliente —
        // quitar dívida com eles era dinheiro de mentira entrando no extrato.
        var formas = CrediarioLancamentos.FormasDePagamento;
        if (!formas.Contains(request.FormaPagamento))
            return BadRequest(new
            {
                Message = $"Forma de pagamento inválida. Use: {string.Join(", ", formas)}"
            });
        if (!string.IsNullOrWhiteSpace(request.SecondFormaPagamento) &&
            !formas.Contains(request.SecondFormaPagamento))
            return BadRequest(new
            {
                Message = $"Segunda forma de pagamento inválida. Use: {string.Join(", ", formas)}"
            });

        var adminId   = GetUserId();
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Include(c => c.Avisos)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        if (crediario.Status == CrediariosStatus.Pago)
            return BadRequest(new { Message = "Crediário já está quitado." });

        // Os dois métodos juntos não podem passar do saldo — antes só o primeiro era
        // conferido, e um split de 50 + 30 numa dívida de 50 registrava R$ 80 recebidos.
        var temSegundo = !string.IsNullOrWhiteSpace(request.SecondFormaPagamento) && request.SecondValorEmCentavos > 0;
        var totalPago  = (long)request.ValorEmCentavos + (temSegundo ? request.SecondValorEmCentavos : 0);
        var saldoAtual = crediario.SaldoRestanteEmCentavos;
        if (totalPago > saldoAtual)
            return BadRequest(new
            {
                Message = temSegundo
                    ? $"Os dois pagamentos somam {Common.Dinheiro.Brl(totalPago / 100m)} e passam do saldo restante de {Common.Dinheiro.Brl(saldoAtual / 100m)}."
                    : $"Pagamento de {Common.Dinheiro.Brl(request.ValorEmCentavos / 100m)} excede o saldo restante de {Common.Dinheiro.Brl(saldoAtual / 100m)}."
            });

        // O saldo vai mudar: QR Code gerado antes cobraria o valor velho. Derruba antes de
        // lançar — e se o cliente acabou de pagar por ele, para aqui pra não receber duas vezes.
        var pixPago = await _pix.EncerrarAtivasAsync(id, GetUserId());
        if (pixPago is not null)
            return Conflict(new { Message = pixPago });

        // Soma no banco, não na memória: caixa e robô do Pix lançando ao mesmo tempo
        // liam o mesmo ValorPago e um sobrescrevia o outro. A condição de saldo vai junto,
        // então dois pagamentos simultâneos também não passam do valor da conta.
        var conflito = false;
        var strategy = _db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            var total = (int)totalPago;
            var rows = await _db.Crediarios
                .Where(c => c.Id == id
                         && c.Status == CrediariosStatus.Aberto
                         && c.ValorEmCentavos - c.ValorPagoEmCentavos >= total)
                .ExecuteUpdateAsync(u => u.SetProperty(c => c.ValorPagoEmCentavos, c => c.ValorPagoEmCentavos + total));
            if (rows == 0)
            {
                conflito = true;
                await tx.RollbackAsync();
                return;
            }
            await _db.Entry(crediario).ReloadAsync();

            _db.PagamentosCrediario.Add(new PagamentoCrediario
            {
                CrediarioId     = id,
                ValorEmCentavos = request.ValorEmCentavos,
                FormaPagamento  = request.FormaPagamento,
                Observacao      = request.Observacao,
                AdminId         = adminId,
            });

            // Segundo método (split) — registra como entrada separada
            if (temSegundo)
            {
                _db.PagamentosCrediario.Add(new PagamentoCrediario
                {
                    CrediarioId     = id,
                    ValorEmCentavos = request.SecondValorEmCentavos,
                    FormaPagamento  = request.SecondFormaPagamento!,
                    Observacao      = request.Observacao,
                    AdminId         = adminId,
                });
            }

            // Quita automaticamente se saldo chegou a zero (tolerância de 1 centavo para arredondamentos)
            if (crediario.SaldoRestanteEmCentavos <= 1)
            {
                crediario.Status         = CrediariosStatus.Pago;
                crediario.DataPagamento  = DateTime.UtcNow;
                crediario.PagoPorAdminId = adminId;
            }

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        if (conflito)
            return Conflict(new { Message = "O saldo desta conta mudou enquanto o pagamento era lançado. Recarregue a tela e confira antes de lançar de novo." });

        await _db.Entry(crediario).Collection(c => c.Pagamentos).LoadAsync();

        if (crediario.Status == CrediariosStatus.Pago)
        {
            _logger.LogInformation(
                "Crediário {Id} quitado via pagamento parcial pelo admin {AdminId} — R$ {Valor:N2}",
                id, adminId, crediario.ValorEmReais);

            if (!string.IsNullOrWhiteSpace(crediario.User?.Email))
                _ = _email.SendCrediarioPagoAsync(
                    crediario.User.Email, crediario.User.Name, crediario.ValorEmReais);
        }
        else
        {
            _logger.LogInformation(
                "Crediário {Id}: pagamento de R$ {Valor:N2} registrado pelo admin {AdminId}. Saldo restante: R$ {Saldo:N2}",
                id, totalPago / 100m, adminId, crediario.SaldoRestanteEmReais);
        }

        return Ok(MapToDto(crediario));
    }

    // -------------------------------------------------------------------------
    // POST /api/crediarios/{id}/pix — gera cobrança Pix pro saldo restante
    // -------------------------------------------------------------------------
    [HttpPost("{id:guid}/pix")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GerarCobrancaPix(Guid id)
    {
        // Reaproveita a cobrança ativa do mesmo saldo (pode ter sido aberta pelo
        // link do cliente) em vez de abrir outra no Inter.
        var resultado = await _pix.ObterOuGerarAsync(id, GetUserId());
        if (resultado.Pix is null)
            return StatusCode(resultado.StatusCode, new { Message = resultado.Erro });

        var pix = resultado.Pix;
        return Ok(new
        {
            pix.TxId,
            pix.Status,
            pix.PixCopiaCola,
            pix.ImagemQrCode,
            pix.ExpiraEm,
            ValorEmReais = pix.ValorEmReais,
        });
    }

    // -------------------------------------------------------------------------
    // GET /api/crediarios/{id}/pix/{txid}/status — consulta e reconcilia pagamento
    // -------------------------------------------------------------------------
    [HttpGet("{id:guid}/pix/{txid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ConsultarCobrancaPix(Guid id, string txid)
    {
        // Reconcilia automaticamente: cobrança paga → registra pagamento no crediário.
        // A baixa mora no PixReconciliationService — mesmo caminho do robô.
        var (pix, erro) = await _pix.VerificarAsync(id, txid, GetUserId());
        if (pix is null)
            return NotFound(new { Message = erro });
        if (erro is not null)
            return StatusCode(422, new { message = erro });

        return Ok(new { pix.TxId, pix.Status, PagoEm = pix.PagoEm });
    }

    // -------------------------------------------------------------------------
    // Lembretes de vencimento
    // -------------------------------------------------------------------------
    [HttpGet("avisos/config")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CrediarioAvisoConfigDto>> GetAvisoConfig(CancellationToken ct)
    {
        var cfg    = await _avisos.ObterConfigAsync();
        var status = await _whatsApp.GetStatusAsync(ct);
        return Ok(ToConfigDto(cfg, status.Connected));
    }

    [HttpPut("avisos/config")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CrediarioAvisoConfigDto>> SalvarAvisoConfig(
        [FromBody] CrediarioAvisoConfigDto request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var marcos = request.Marcos.Where(m => m is >= -30 and <= 90).Distinct().OrderBy(m => m).ToList();
        if (request.Ativo && marcos.Count == 0)
            return BadRequest(new { Message = "Escolha pelo menos um dia de aviso." });
        if (request.Ativo && !request.CanalApp && !request.CanalEmail && !request.CanalWhatsApp)
            return BadRequest(new { Message = "Ligue pelo menos um canal de aviso." });

        var cfg = await _avisos.ObterConfigAsync();
        cfg.Ativo         = request.Ativo;
        cfg.HoraEnvio     = request.HoraEnvio;
        cfg.MarcosJson    = JsonSerializer.Serialize(marcos);
        cfg.CanalApp      = request.CanalApp;
        cfg.CanalEmail    = request.CanalEmail;
        cfg.CanalWhatsApp = request.CanalWhatsApp;
        cfg.ResumoAdmin   = request.ResumoAdmin;
        cfg.MensagemExtra = string.IsNullOrWhiteSpace(request.MensagemExtra) ? null : request.MensagemExtra.Trim();
        cfg.UpdatedAt     = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        await _audit.LogAsync("ConfigurouAvisosCrediario", "CrediarioAvisoConfig", cfg.Id.ToString(),
            details: JsonSerializer.Serialize(new { cfg.Ativo, cfg.HoraEnvio, marcos, cfg.CanalApp, cfg.CanalEmail, cfg.CanalWhatsApp }),
            httpContext: HttpContext);

        var status = await _whatsApp.GetStatusAsync(ct);
        return Ok(ToConfigDto(cfg, status.Connected));
    }

    [HttpGet("{id:guid}/aviso/previa")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PreviaAviso(Guid id, CancellationToken ct)
    {
        try
        {
            var previa = await _avisos.PreviaAsync(id, ct);
            return Ok(new
            {
                previa.Titulo,
                previa.Texto,
                previa.WhatsApp,
                previa.Email,
                previa.CanaisDisponiveis,
            });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/aviso")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> AvisarAgora(Guid id, CancellationToken ct)
    {
        try
        {
            var envio = await _avisos.AvisarAgoraAsync(id, GetUserId(), ct);
            return Ok(new { Canais = envio.Canais.Split(',', StringSplitOptions.RemoveEmptyEntries), envio.Falhas });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    private static CrediarioAvisoConfigDto ToConfigDto(CrediarioAvisoConfig cfg, bool whatsAppConectado) => new()
    {
        Ativo             = cfg.Ativo,
        HoraEnvio         = cfg.HoraEnvio,
        Marcos            = CrediarioAvisoService.LerMarcos(cfg.MarcosJson),
        CanalApp          = cfg.CanalApp,
        CanalEmail        = cfg.CanalEmail,
        CanalWhatsApp     = cfg.CanalWhatsApp,
        ResumoAdmin       = cfg.ResumoAdmin,
        MensagemExtra     = cfg.MensagemExtra,
        WhatsAppConectado = whatsAppConectado,
    };

    // -------------------------------------------------------------------------
    // DELETE /api/crediarios/{id}
    // -------------------------------------------------------------------------
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(204)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Deletar(Guid id)
    {
        var crediario = await _db.Crediarios
            .Include(c => c.Pagamentos)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        // Impede deleção se há qualquer pagamento registrado.
        // Um crediário com pagamento representa dinheiro já recebido — apagá-lo
        // removeria o histórico financeiro sem desfazer a receita original.
        if (crediario.ValorPagoEmCentavos > 0)
            return BadRequest(new
            {
                Message = $"Não é possível excluir este crediário pois já possui {Common.Dinheiro.Brl(crediario.ValorPagoEmCentavos / 100m)} registrados como pagos. " +
                          "Exclua apenas crediários sem nenhum pagamento registrado."
            });

        // Excluir a conta apaga as cobranças Pix dela: um QR ainda pagável viraria
        // dinheiro recebido sem dono.
        var pixPago = await _pix.EncerrarAtivasAsync(id, GetUserId());
        if (pixPago is not null)
            return Conflict(new { Message = pixPago });

        _db.Crediarios.Remove(crediario);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Crediário {Id} excluído pelo admin {AdminId}", id, GetUserId());
        await _audit.LogAsync("ExcluiuCrediario", "Crediario", id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                crediario.UserId, crediario.ValorEmCentavos, crediario.DataAbertura, crediario.Observacao,
            }),
            httpContext: HttpContext);
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static CrediariosDto MapToDto(Crediario c)
    {
        var agora   = DateTime.UtcNow;
        var vencido = c.Status == CrediariosStatus.Aberto && c.DataVencimento < agora;
        var dias    = (int)Math.Round((c.DataVencimento - agora).TotalDays);

        var lancamentos = c.Lancamentos
            .OrderBy(l => l.CreatedAt)
            .Select(CrediarioLancamentos.ToDto)
            .ToList();

        // Conta sem lançamento só existe se a conversão do startup falhou — mostra o legado.
        var itens = lancamentos.Count > 0
            ? lancamentos.Where(l => l.EstornadoEm == null).SelectMany(l => l.Itens).ToList()
            : CrediarioLancamentos.LerItens(c.ItensJson);

        return new CrediariosDto
        {
            Id                    = c.Id,
            UserId                = c.UserId,
            UserName              = c.User?.Name ?? string.Empty,
            UserEmail             = c.User?.Email,
            ComandaId             = c.ComandaId,
            ValorEmReais          = c.ValorEmReais,
            ValorPagoEmReais      = c.ValorPagoEmReais,
            SaldoRestanteEmReais  = c.SaldoRestanteEmReais,
            ValorExcedenteEmReais = Math.Max(0, c.ValorPagoEmCentavos - c.ValorEmCentavos) / 100m,
            DataAbertura          = c.DataAbertura,
            DataVencimento        = c.DataVencimento,
            DataPagamento         = c.DataPagamento,
            Status                = vencido ? "Vencido" : c.Status.ToString(),
            Observacao            = c.Observacao,
            PagamentoToken        = c.Status == CrediariosStatus.Aberto ? c.PagamentoToken : null,
            Vencido               = vencido,
            DiasRestantes         = dias,
            Pagamentos            = c.Pagamentos
                .OrderBy(p => p.CreatedAt)
                .Select(p => new PagamentoCrediarioDto
                {
                    Id             = p.Id,
                    ValorEmReais   = p.ValorEmReais,
                    FormaPagamento = p.FormaPagamento,
                    Observacao     = p.Observacao,
                    CreatedAt      = p.CreatedAt,
                }).ToList(),
            Avisos                = c.Avisos
                .OrderByDescending(a => a.EnviadoEm)
                .Select(a => new AvisoCrediarioDto
                {
                    EnviadoEm  = a.EnviadoEm,
                    Marco      = a.Marco,
                    Automatico = a.EnviadoPorAdminId == null,
                    Canais     = a.Canais.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
                    Falhas     = a.Falhas,
                }).ToList(),
            Lancamentos           = lancamentos,
            ItensComanda          = itens,
        };
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
