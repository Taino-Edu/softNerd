// =============================================================================
// CrediariosController.cs — Gestão de crediários
//
// POST /api/crediarios                     → Admin: cria crediário manual (dívida antiga)
// GET  /api/crediarios                     → Admin: lista todos (filtro por status)
// GET  /api/crediarios/usuario/{userId}    → Admin: crediários de um cliente
// GET  /api/crediarios/meu                 → Cliente: seu crediário ativo
// PUT  /api/crediarios/{id}/pagar          → Admin: quita 100% (legado)
// POST /api/crediarios/{id}/pagamento      → Admin: registra pagamento parcial ou total
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

        // Serializa lista de itens se informada
        string? itensJson = null;
        if (request.Itens != null && request.Itens.Count > 0)
            itensJson = JsonSerializer.Serialize(request.Itens);

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
            ItensJson        = itensJson,
        };

        _db.Crediarios.Add(crediario);
        await _db.SaveChangesAsync();

        // Recarrega com includes para montar o DTO
        var saved = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Pagamentos)
            .Include(c => c.Comanda).ThenInclude(cmd => cmd!.Items)
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
            .Include(c => c.Comanda).ThenInclude(cmd => cmd!.Items)
            .Where(c => c.Status == CrediariosStatus.Aberto)
            .OrderBy(c => c.DataVencimento)
            .ToListAsync();

        // Carrega comandas de crediário de todos os usuários para MapToDto conseguir resolver itens
        var userIds        = crediarios.Select(c => c.UserId).Distinct().ToList();
        var comandasPorUser = await CarregarComandasCrediario(userIds);

        var agora = DateTime.UtcNow;
        var grupos = crediarios
            .GroupBy(c => c.UserId)
            .Select(g =>
            {
                var userComandas = comandasPorUser.GetValueOrDefault(g.Key);
                var dividas = g.Select(c => MapToDto(c, userComandas)).ToList();
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
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<CrediariosStatus>(status, ignoreCase: true, out var s))
            query = query.Where(c => c.Status == s);

        var crediarios = await query
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        var userIds = crediarios.Select(c => c.UserId).Distinct().ToList();
        var comandas = await CarregarComandasCrediario(userIds);
        return Ok(crediarios.Select(c => MapToDto(c, comandas.GetValueOrDefault(c.UserId))).ToList());
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
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        var comandas = await CarregarComandasCrediario(new List<Guid> { userId });
        var listaComandas = comandas.GetValueOrDefault(userId);
        return Ok(crediarios.Select(c => MapToDto(c, listaComandas)).ToList());
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
            .Where(c => c.UserId == userId && c.Status == CrediariosStatus.Aberto)
            .FirstOrDefaultAsync();

        if (crediario == null)
            return NotFound(new { Message = "Nenhum crediário em aberto." });

        var comandas = await CarregarComandasCrediario(new List<Guid> { userId });
        return Ok(MapToDto(crediario, comandas.GetValueOrDefault(userId)));
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
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.DataAbertura)
            .ToListAsync();

        var comandas = await CarregarComandasCrediario(new List<Guid> { userId });
        var listaComandas = comandas.GetValueOrDefault(userId);
        return Ok(lista.Select(c => MapToDto(c, listaComandas)).ToList());
    }

    // ── Carrega todas as comandas pagas com crediário para uma lista de usuários ──
    private async Task<Dictionary<Guid, List<Comanda>>> CarregarComandasCrediario(List<Guid> userIds)
    {
        var all = await _db.Comandas
            .Include(c => c.Items)
            .Where(c => userIds.Contains(c.UserId)
                     && c.PaymentMethod == "Crediario"
                     && c.Status == ComandaStatus.Fechada
                     && c.ClosedAt != null)
            .ToListAsync();

        return all
            .GroupBy(c => c.UserId)
            .ToDictionary(g => g.Key, g => g.ToList());
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
            .Include(c => c.Comanda).ThenInclude(cmd => cmd!.Items)
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
            .Include(c => c.Comanda).ThenInclude(cmd => cmd!.Items)
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

        // Itens editados manualmente têm prioridade; caso contrário verifica flag de limpeza
        if (request.Itens != null)
            crediario.ItensJson = request.Itens.Count > 0
                ? JsonSerializer.Serialize(request.Itens)
                : null; // lista vazia = remove itens (deixa cair no date-range)
        else if (request.LimparItens)
            crediario.ItensJson = null;

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
            .Include(c => c.Comanda).ThenInclude(cmd => cmd!.Items)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crediario == null)
            return NotFound(new { Message = "Crediário não encontrado." });

        if (crediario.Status == CrediariosStatus.Pago)
            return BadRequest(new { Message = "Crediário já está quitado." });

        var saldoAtual = crediario.SaldoRestanteEmCentavos;
        if (request.ValorEmCentavos > saldoAtual)
            return BadRequest(new
            {
                Message = $"Pagamento de R$ {request.ValorEmCentavos / 100m:N2} excede o saldo restante de R$ {saldoAtual / 100m:N2}."
            });

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
        if (!string.IsNullOrWhiteSpace(request.SecondFormaPagamento) && request.SecondValorEmCentavos > 0)
        {
            var pagamento2 = new PagamentoCrediario
            {
                CrediarioId     = id,
                ValorEmCentavos = request.SecondValorEmCentavos,
                FormaPagamento  = request.SecondFormaPagamento,
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

        _db.Crediarios.Remove(crediario);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Crediário {Id} excluído pelo admin {AdminId}", id, GetUserId());
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    // todasComandas: todas as comandas com PaymentMethod=Crediario deste usuário,
    // filtradas aqui pelo período do crediário — cobre histórico e novos acúmulos.
    private static CrediariosDto MapToDto(Crediario c, List<Comanda>? todasComandas = null)
    {
        var agora   = DateTime.UtcNow;
        var vencido = c.Status == CrediariosStatus.Aberto && c.DataVencimento < agora;
        var dias    = (int)Math.Round((c.DataVencimento - agora).TotalDays);

        // Se ItensJson tem dados (acumulação manual ou multi-comanda), usa exclusivamente esses.
        // Isso evita duplicatas quando items foram migrados para ItensJson durante acumulação.
        // Caso contrário, busca pelos itens via ComandaId ou date-range (dados legados).
        var fromJson = string.IsNullOrWhiteSpace(c.ItensJson)
            ? new List<ItemCrediarioDto>()
            : JsonSerializer.Deserialize<List<ItemCrediarioDto>>(c.ItensJson)
              ?? new List<ItemCrediarioDto>();

        List<ItemCrediarioDto> fromComanda;
        if (fromJson.Count > 0)
        {
            // ItensJson definido manualmente — não faz lookup adicional
            fromComanda = new List<ItemCrediarioDto>();
        }
        else if (c.ComandaId != null && todasComandas != null)
        {
            // Crediário originado de comanda: busca itens pelo período
            var inicio = c.DataAbertura.AddSeconds(-60);
            var fim    = c.DataPagamento.HasValue ? c.DataPagamento.Value.AddDays(1) : DateTime.MaxValue;
            fromComanda = todasComandas
                .Where(cmd => cmd.ClosedAt.HasValue
                           && cmd.ClosedAt.Value >= inicio
                           && cmd.ClosedAt.Value <= fim)
                .SelectMany(cmd => cmd.Items)
                .OrderBy(i => i.AddedAt)
                .Select(i => new ItemCrediarioDto
                {
                    ItemName         = i.ItemNameSnapshot,
                    Quantity         = i.Quantity,
                    UnitPriceInReais = i.UnitPriceInCents / 100m,
                    SubtotalInReais  = i.SubtotalInCents  / 100m,
                })
                .ToList();
        }
        else if (c.ComandaId != null)
        {
            fromComanda = c.Comanda?.Items
                .OrderBy(i => i.AddedAt)
                .Select(i => new ItemCrediarioDto
                {
                    ItemName         = i.ItemNameSnapshot,
                    Quantity         = i.Quantity,
                    UnitPriceInReais = i.UnitPriceInCents / 100m,
                    SubtotalInReais  = i.SubtotalInCents  / 100m,
                })
                .ToList() ?? new List<ItemCrediarioDto>();
        }
        else
        {
            // Crediário manual (ComandaId = null, ItensJson = null) — sem itens até admin adicionar
            fromComanda = new List<ItemCrediarioDto>();
        }

        var todosItens = fromComanda.Concat(fromJson).ToList();

        return new CrediariosDto
        {
            Id                   = c.Id,
            UserId               = c.UserId,
            UserName             = c.User?.Name ?? string.Empty,
            UserEmail            = c.User?.Email,
            ComandaId            = c.ComandaId,
            ValorEmReais         = c.ValorEmReais,
            ValorPagoEmReais     = c.ValorPagoEmReais,
            SaldoRestanteEmReais = c.SaldoRestanteEmReais,
            DataAbertura         = c.DataAbertura,
            DataVencimento       = c.DataVencimento,
            DataPagamento        = c.DataPagamento,
            Status               = vencido ? "Vencido" : c.Status.ToString(),
            Observacao           = c.Observacao,
            Vencido              = vencido,
            DiasRestantes        = dias,
            Pagamentos           = c.Pagamentos
                .OrderBy(p => p.CreatedAt)
                .Select(p => new PagamentoCrediarioDto
                {
                    Id             = p.Id,
                    ValorEmReais   = p.ValorEmReais,
                    FormaPagamento = p.FormaPagamento,
                    Observacao     = p.Observacao,
                    CreatedAt      = p.CreatedAt,
                }).ToList(),
            ItensComanda = todosItens,
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
