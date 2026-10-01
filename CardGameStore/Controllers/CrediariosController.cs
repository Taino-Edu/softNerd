// =============================================================================
// CrediariosController.cs — Gestão de crediários
//
// POST /api/crediarios                     → Admin: cria crediário manual (dívida antiga)
// GET  /api/crediarios                     → Admin: lista todos (filtro por status)
// GET  /api/crediarios/usuario/{userId}    → Admin: crediários de um cliente
// GET  /api/crediarios/meu                 → Cliente: seu crediário ativo
// PUT  /api/crediarios/{id}/pagar          → Admin: quita 100% (legado)
// POST /api/crediarios/{id}/pagamento      → Admin: registra pagamento parcial ou total
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
    private readonly InterSyncService _inter;
    private readonly IPixReconciliationService _pixReconciliation;
    private readonly ILogger<CrediariosController> _logger;

    public CrediariosController(AppDbContext db, IEmailService email, InterSyncService inter,
        IPixReconciliationService pixReconciliation, ILogger<CrediariosController> logger)
    {
        _db                = db;
        _email             = email;
        _inter             = inter;
        _pixReconciliation = pixReconciliation;
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
                                   ? request.DataVencimento.Value.ToUniversalTime()
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
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        return Ok(crediarios.Select(MapToDto).ToList());
    }

    // -------------------------------------------------------------------------
    // GET /api/crediarios/meu — crediário aberto do cliente
    // -------------------------------------------------------------------------
    [HttpGet("meu")]
    public async Task<ActionResult<CrediariosDto>> GetMeu()
    {
        var userId    = GetUserId();
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .Where(c => c.UserId == userId && c.Status == CrediariosStatus.Aberto)
            .FirstOrDefaultAsync();

        if (crediario == null)
            return NotFound(new { Message = "Nenhum crediário em aberto." });

        return Ok(MapToDto(crediario));
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
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        return Ok(lista.Select(MapToDto).ToList());
    }

    // -------------------------------------------------------------------------
    // PUT /api/crediarios/{id}/pagar
    // -------------------------------------------------------------------------
    [HttpPut("{id:guid}/pagar")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CrediariosDto>> MarcarPago(Guid id, [FromBody] MarcarPagoRequest? request)
    {
        var adminId   = GetUserId();
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        if (crediario.Status == CrediariosStatus.Pago)
            return BadRequest(new { Message = "Crediário já está quitado." });

        // Garante que ValorPago reflita a quitação total
        crediario.ValorPagoEmCentavos = crediario.ValorEmCentavos;
        crediario.Status        = CrediariosStatus.Pago;
        crediario.DataPagamento = DateTime.UtcNow;
        crediario.PagoPorAdminId = adminId;

        if (!string.IsNullOrWhiteSpace(request?.Observacao))
            crediario.Observacao = (crediario.Observacao != null
                ? crediario.Observacao + " | " : "") + request.Observacao;

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Crediário {Id} quitado pelo admin {AdminId} — R$ {Valor:N2}",
            id, adminId, crediario.ValorEmReais);

        // Envia email de confirmação (não bloqueia)
        if (!string.IsNullOrWhiteSpace(crediario.User?.Email))
            _ = _email.SendCrediarioPagoAsync(
                crediario.User.Email, crediario.User.Name, crediario.ValorEmReais);

        return Ok(MapToDto(crediario));
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
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        if (crediario.Status == CrediariosStatus.Pago)
            return BadRequest(new { Message = "Não é possível editar um crediário já quitado." });

        if (request.ValorEmCentavos.HasValue)
        {
            if (request.ValorEmCentavos.Value < crediario.ValorPagoEmCentavos)
                return BadRequest(new
                {
                    Message = $"O novo valor (R$ {request.ValorEmCentavos.Value / 100m:N2}) não pode ser menor do que o valor já pago (R$ {crediario.ValorPagoEmCentavos / 100m:N2})."
                });
            crediario.ValorEmCentavos = request.ValorEmCentavos.Value;
        }

        if (request.Observacao != null)
            crediario.Observacao = request.Observacao;

        if (request.DataVencimento.HasValue)
        {
            if (request.DataVencimento.Value.ToUniversalTime().Date < DateTime.UtcNow.Date)
                return BadRequest(new { Message = "A data de vencimento não pode ser no passado." });
            crediario.DataVencimento = request.DataVencimento.Value.ToUniversalTime();
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
        if (!PaymentMethod.IsValid(request.FormaPagamento))
            return BadRequest(new
            {
                Message = $"Forma de pagamento inválida. Use: {string.Join(", ", PaymentMethod.All)}"
            });
        if (!string.IsNullOrWhiteSpace(request.SecondFormaPagamento) &&
            !PaymentMethod.IsValid(request.SecondFormaPagamento))
            return BadRequest(new
            {
                Message = $"Segunda forma de pagamento inválida. Use: {string.Join(", ", PaymentMethod.All)}"
            });

        var adminId   = GetUserId();
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Lancamentos)
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
                    ? $"Os dois pagamentos somam R$ {totalPago / 100m:N2} e passam do saldo restante de R$ {saldoAtual / 100m:N2}."
                    : $"Pagamento de R$ {request.ValorEmCentavos / 100m:N2} excede o saldo restante de R$ {saldoAtual / 100m:N2}."
            });

        // O saldo vai mudar: QR Code gerado antes cobraria o valor velho. Derruba antes de
        // lançar — e se o cliente acabou de pagar por ele, para aqui pra não receber duas vezes.
        var pixPago = await EncerrarPixAtivosAsync(id);
        if (pixPago is not null)
            return Conflict(new { Message = pixPago });

        // Registra o pagamento parcial (método principal)
        var pagamento = new PagamentoCrediario
        {
            CrediarioId     = id,
            ValorEmCentavos = request.ValorEmCentavos,
            FormaPagamento  = request.FormaPagamento,
            Observacao      = request.Observacao,
            AdminId         = adminId,
        };
        _db.PagamentosCrediario.Add(pagamento);
        crediario.ValorPagoEmCentavos += request.ValorEmCentavos;

        // Segundo método (split) — registra como entrada separada
        if (temSegundo)
        {
            var pagamento2 = new PagamentoCrediario
            {
                CrediarioId     = id,
                ValorEmCentavos = request.SecondValorEmCentavos,
                FormaPagamento  = request.SecondFormaPagamento!,
                Observacao      = request.Observacao,
                AdminId         = adminId,
            };
            _db.PagamentosCrediario.Add(pagamento2);
            crediario.ValorPagoEmCentavos += request.SecondValorEmCentavos;
        }

        // Quita automaticamente se saldo chegou a zero (tolerância de 1 centavo para arredondamentos)
        if (crediario.SaldoRestanteEmCentavos <= 1)
        {
            crediario.Status         = CrediariosStatus.Pago;
            crediario.DataPagamento  = DateTime.UtcNow;
            crediario.PagoPorAdminId = adminId;

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
                "Crediário {Id}: pagamento parcial de R$ {Valor:N2} registrado pelo admin {AdminId}. Saldo restante: R$ {Saldo:N2}",
                id, request.ValorEmCentavos / 100m, adminId, crediario.SaldoRestanteEmReais);
        }

        await _db.SaveChangesAsync();
        return Ok(MapToDto(crediario));
    }

    // -------------------------------------------------------------------------
    // POST /api/crediarios/{id}/pix — gera cobrança Pix pro saldo restante
    // -------------------------------------------------------------------------
    [HttpPost("{id:guid}/pix")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GerarCobrancaPix(Guid id)
    {
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        if (crediario.Status == CrediariosStatus.Pago)
            return BadRequest(new { Message = "Crediário já está quitado." });

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg == null)
            return BadRequest(new { Message = "Integração com o Inter não configurada em /admin/integracoes." });

        var cpf = crediario.User.Cpf?.Length == 11 ? crediario.User.Cpf : null;

        var result = await _inter.CriarCobrancaAsync(
            cfg, crediario.SaldoRestanteEmCentavos, crediario.User.Name, cpf,
            "Santuário Nerd — Crediário");

        if (result.Error is not null)
            return StatusCode(422, new { message = result.Error });

        var pix = new PixCobranca
        {
            Origem           = PixCobrancaOrigem.Crediario,
            CrediarioId      = crediario.Id,
            TxId             = result.TxId!,
            ValorEmCentavos  = crediario.SaldoRestanteEmCentavos,
            Status           = result.Status ?? "ATIVA",
            PixCopiaCola     = result.PixCopiaCola,
            ImagemQrCode     = result.ImagemQrCode,
            NomeDevedor      = crediario.User.Name,
            CriadoPorAdminId = GetUserId(),
            ExpiraEm         = result.ExpiraEm,
        };
        _db.PixCobrancas.Add(pix);
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Cobrança Pix {TxId} gerada pelo admin {AdminId} para crediário {CrediarioId} — R$ {Valor:N2}",
            pix.TxId, GetUserId(), crediario.Id, pix.ValorEmReais);

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
        var pix = await _db.PixCobrancas.FirstOrDefaultAsync(p => p.CrediarioId == id && p.TxId == txid);
        if (pix == null)
            return NotFound(new { Message = "Cobrança não encontrada." });

        // Reconcilia automaticamente: cobrança paga → registra pagamento no crediário.
        // A baixa mora no PixReconciliationService — mesmo caminho do robô.
        var result = await _pixReconciliation.ReconciliarAsync(pix, GetUserId());
        if (result.Error is not null)
            return StatusCode(422, new { message = result.Error });

        return Ok(new { pix.TxId, pix.Status, PagoEm = pix.PagoEm });
    }

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
                Message = $"Não é possível excluir este crediário pois já possui R$ {crediario.ValorPagoEmCentavos / 100m:N2} registrados como pagos. " +
                          "Exclua apenas crediários sem nenhum pagamento registrado."
            });

        // Excluir a conta apaga as cobranças Pix dela: um QR ainda pagável viraria
        // dinheiro recebido sem dono.
        var pixPago = await EncerrarPixAtivosAsync(id);
        if (pixPago is not null)
            return Conflict(new { Message = pixPago });

        _db.Crediarios.Remove(crediario);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Crediário {Id} excluído pelo admin {AdminId}", id, GetUserId());
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
            Lancamentos           = lancamentos,
            ItensComanda          = itens,
        };
    }

    /// <summary>
    /// Encerra as cobranças Pix ainda ativas da conta. Antes de cancelar, confere no
    /// Inter: se o cliente acabou de pagar, a reconciliação dá a baixa e devolve a
    /// mensagem pro chamador parar. Se o Inter não deixar cancelar, a cobrança segue
    /// ativa pro robô — e, se for paga, o que passar do saldo vira crédito do cliente.
    /// </summary>
    private async Task<string?> EncerrarPixAtivosAsync(Guid crediarioId)
    {
        var ativos = await _db.PixCobrancas
            .Where(p => p.CrediarioId == crediarioId && p.Status == "ATIVA" && p.PagoEm == null)
            .ToListAsync();
        if (ativos.Count == 0) return null;

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        foreach (var pix in ativos)
        {
            var vencida = pix.ExpiraEm is not null && pix.ExpiraEm <= DateTime.UtcNow;
            if (!vencida)
            {
                var conferida = await _pixReconciliation.ReconciliarAsync(pix, GetUserId());
                if (conferida.PagoEm is not null)
                    return $"O cliente acabou de pagar R$ {pix.ValorEmReais:N2} pela cobrança Pix desta conta e o pagamento já foi registrado. Recarregue a tela antes de lançar outro.";
                if (pix.Status != "ATIVA") continue; // o Inter já encerrou por conta própria
            }

            var removida = cfg is null
                ? new PixCobrancaResult { Error = "Integração com o Inter não configurada." }
                : await _inter.RemoverCobrancaAsync(cfg, pix.TxId);

            if (removida.Error is null || vencida)
            {
                pix.Status = "REMOVIDA_PELO_USUARIO_RECEBEDOR";
            }
            else
            {
                _logger.LogWarning(
                    "Cobrança Pix {TxId} do crediário {CrediarioId} não foi cancelada no Inter ({Erro}) — segue ativa pro robô conciliar.",
                    pix.TxId, crediarioId, removida.Error);
            }
        }

        await _db.SaveChangesAsync();
        return null;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
