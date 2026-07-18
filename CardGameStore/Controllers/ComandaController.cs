// =============================================================================
// ComandaController.cs — Endpoints REST de Comandas
// GET    /api/comanda/dashboard           → lista todas as abertas (Admin)
// GET    /api/comanda/my                  → comanda ativa do cliente logado
// GET    /api/comanda/{id}                → detalhe de uma comanda (Admin)
// POST   /api/comanda/{id}/items          → adiciona item
// DELETE /api/comanda/{id}/items/{itemId} → remove item
// PUT    /api/comanda/{id}/close          → fecha comanda (Admin)
// PUT    /api/comanda/{id}/cancel         → cancela comanda (Admin)
// POST   /api/comanda/{id}/apply-points   → aplica pontos do cliente
//
// Venda avulsa de balcão → POST /api/venda-avulsa  (VendaAvulsaController)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
[Produces("application/json")]
public class ComandaController : ControllerBase
{
    private readonly IComandaService  _service;
    private readonly AppDbContext     _db;
    private readonly InterSyncService _inter;
    private readonly IPixReconciliationService _pixReconciliation;
    private readonly IHubContext<ComandaHub> _hub;
    private readonly IPushService     _push;
    private readonly ILogger<ComandaController> _logger;

    public ComandaController(
        IComandaService service, AppDbContext db, InterSyncService inter,
        IPixReconciliationService pixReconciliation,
        IHubContext<ComandaHub> hub, IPushService push, ILogger<ComandaController> logger)
    {
        _service           = service;
        _db                = db;
        _inter             = inter;
        _pixReconciliation = pixReconciliation;
        _hub               = hub;
        _push              = push;
        _logger            = logger;
    }

    /// <summary>Admin abre uma comanda para um cliente (sem precisar que ele escaneie o QR).</summary>
    [HttpPost("admin-open")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> AdminOpenComanda([FromBody] AdminOpenComandaRequest request)
    {
        try
        {
            var result = await _service.OpenComandaAsync(request.UserId, request.TableIdentifier);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Dashboard do Admin: lista todas as comandas abertas/em andamento.</summary>
    [HttpGet("dashboard")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<ComandaDto>), 200)]
    public async Task<IActionResult> GetDashboard()
    {
        var comandas = await _service.GetActiveCommandasForDashboardAsync();
        return Ok(comandas);
    }

    /// <summary>Histórico do dia: comandas fechadas/canceladas. Parâmetro ?data=YYYY-MM-DD (padrão: hoje). Apenas Admin.</summary>
    [HttpGet("history")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<ComandaDto>), 200)]
    public async Task<IActionResult> GetHistory([FromQuery] DateTime? data)
    {
        var result = await _service.GetTodayHistoryAsync(data);
        return Ok(result);
    }

    /// <summary>Retorna uma comanda específica pelo ID. Apenas Admin.</summary>
    [HttpGet("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var comanda = await _service.GetByIdAsync(id);
        return comanda == null ? NotFound(new { Message = "Comanda não encontrada." }) : Ok(comanda);
    }

    /// <summary>Histórico de comandas fechadas/canceladas do cliente autenticado.</summary>
    [HttpGet("my-history")]
    [ProducesResponseType(typeof(IEnumerable<ComandaDto>), 200)]
    public async Task<IActionResult> GetMyHistory()
    {
        var userId = GetUserId();
        var result = await _service.GetUserHistoryAsync(userId);
        return Ok(result);
    }

    /// <summary>Retorna a comanda ativa do cliente autenticado.</summary>
    [HttpGet("my")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetMyComanda()
    {
        var userId  = GetUserId();
        var comanda = await _service.GetActiveComandaAsync(userId);
        return comanda == null ? NotFound(new { Message = "Nenhuma comanda ativa encontrada." }) : Ok(comanda);
    }

    /// <summary>Adiciona um item à comanda do cliente autenticado.</summary>
    [HttpPost("{id:guid}/items")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> AddItem(Guid id, [FromBody] AddItemToComandaRequest request)
    {
        var userId = GetUserId();
        var role   = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;

        ComandaDto result;

        if (role == "Admin")
            result = await _service.AdminAddItemAsync(id, userId, request);
        else
            result = await _service.AddItemAsync(userId, request);

        return Ok(result);
    }

    /// <summary>Remove um item de uma comanda. Apenas Admin.</summary>
    [HttpDelete("{id:guid}/items/{itemId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    public async Task<IActionResult> RemoveItem(Guid id, Guid itemId)
    {
        var userId = GetUserId();
        var result = await _service.RemoveItemAsync(id, itemId, userId);
        return Ok(result);
    }

    /// <summary>Atualiza quantidade de um item (0 = remove). Apenas Admin.</summary>
    [HttpPatch("{id:guid}/items/{itemId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> UpdateItem(Guid id, Guid itemId, [FromBody] UpdateItemRequest request)
    {
        try
        {
            var adminId = GetUserId();
            var result  = await _service.UpdateItemAsync(id, itemId, request.Quantity, adminId);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Fecha uma comanda (pagamento recebido). Apenas Admin.</summary>
    [HttpPut("{id:guid}/close")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    public async Task<IActionResult> Close(Guid id, [FromBody] CloseComandaRequest? request)
    {
        try
        {
            var adminId    = GetUserId();
            var method     = request?.PaymentMethod ?? "Dinheiro";
            var obs        = request?.Observacao;
            var method2    = request?.SecondPaymentMethod;
            var amount2    = request?.SecondPaymentAmountInCents ?? 0;
            var credId     = request?.CrediarioExistenteId;
            var desconto   = request?.DiscountInCents ?? 0;
            var emitirNota = request?.EmitirNotaFiscal ?? false;
            var result     = await _service.CloseComandaAsync(id, adminId, method, obs, method2, amount2, credId, desconto, emitirNota);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Cancela uma comanda sem cobrança. Apenas Admin.</summary>
    [HttpPut("{id:guid}/cancel")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var adminId = GetUserId();
        var result  = await _service.CancelComandaAsync(id, adminId);
        return Ok(result);
    }

    /// <summary>Edita uma comanda fechada: pagamento, itens, desconto, cliente (Admin only).</summary>
    [HttpPut("{id:guid}/editar")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> EditarComanda(Guid id, [FromBody] EditarComandaRequest request)
    {
        try
        {
            var adminId = GetUserId();
            var result  = await _service.EditarComandaFechadaAsync(id, adminId, request);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)   { return NotFound(new { Message = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { Message = ex.Message }); }
    }

    /// <summary>Cliente aplica seus pontos para abater o total da comanda.</summary>
    [HttpPost("{id:guid}/apply-points")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> ApplyPoints(Guid id, [FromBody] ApplyPointsRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.ApplyPointsAsync(id, userId, request.Points);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>
    /// Remove os pontos aplicados à comanda, devolvendo-os ao saldo do cliente.
    /// Pode ser chamado pelo próprio cliente ou por qualquer Admin.
    /// </summary>
    [HttpDelete("{id:guid}/apply-points")]
    [ProducesResponseType(typeof(ComandaDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(403)]
    public async Task<IActionResult> RemovePoints(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.RemovePointsAsync(id, userId);
            return Ok(result);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Gera cobrança Pix pro total em aberto da comanda. Apenas Admin.</summary>
    [HttpPost("{id:guid}/pix")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GerarCobrancaPix(Guid id)
    {
        try
        {
            var comanda = await _db.Comandas
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (comanda == null)
                return NotFound(new { Message = "Comanda não encontrada." });

            if (comanda.Status is ComandaStatus.Fechada or ComandaStatus.Cancelada)
                return BadRequest(new { Message = "Comanda já está fechada ou cancelada." });

            var valorEmCentavos = Math.Max(0, comanda.TotalInCents - comanda.PointsApplied);
            if (valorEmCentavos <= 0)
                return BadRequest(new { Message = "Comanda não tem valor restante para cobrar." });

            var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
            if (cfg == null)
                return BadRequest(new { Message = "Integração com o Inter não configurada em /admin/integracoes." });

            var nomeDevedor = comanda.User?.Name;
            var cpf         = comanda.User?.Cpf?.Length == 11 ? comanda.User.Cpf : null;
            var result = await _inter.CriarCobrancaAsync(
                cfg, valorEmCentavos, nomeDevedor, cpf, "Santuário Nerd — Comanda");

            if (result.Error is not null)
                return StatusCode(422, new { message = result.Error });

            var pix = new PixCobranca
            {
                Origem           = PixCobrancaOrigem.Comanda,
                ComandaId        = comanda.Id,
                TxId             = result.TxId!,
                ValorEmCentavos  = valorEmCentavos,
                Status           = result.Status ?? "ATIVA",
                PixCopiaCola     = result.PixCopiaCola,
                ImagemQrCode     = result.ImagemQrCode,
                NomeDevedor      = nomeDevedor,
                CriadoPorAdminId = GetUserId(),
                ExpiraEm         = result.ExpiraEm,
            };
            _db.PixCobrancas.Add(pix);
            await _db.SaveChangesAsync();

            // Avisa o cliente na hora: card de pagamento na comanda (SignalR) e push
            // no navegador se o site estiver fechado. Falha aqui nunca desfaz a cobrança.
            try
            {
                await _hub.Clients.Group(ComandaHub.GetComandaGroup(comanda.Id))
                    .SendAsync("PixCobrancaCriada", PixDto(pix));

                await _push.SendAsync(
                    comanda.UserId,
                    $"Cobrança Pix — R$ {pix.ValorEmReais:N2}".Replace('.', ','),
                    "Sua comanda está pronta pra pagar. Toque para abrir o Pix.",
                    "/cliente");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cobrança Pix {TxId} criada, mas falhou ao notificar o cliente.", pix.TxId);
            }

            return Ok(PixDto(pix));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Message = $"Erro interno ao gerar cobrança Pix: {ex.Message}" });
        }
    }

    /// <summary>Consulta status da cobrança Pix da comanda; se paga, fecha a comanda automaticamente. Apenas Admin.</summary>
    [HttpGet("{id:guid}/pix/{txid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ConsultarCobrancaPix(Guid id, string txid)
    {
        var pix = await _db.PixCobrancas.FirstOrDefaultAsync(p => p.ComandaId == id && p.TxId == txid);
        if (pix == null)
            return NotFound(new { Message = "Cobrança não encontrada." });

        return await VerificarPagamentoPixAsync(pix, fechadoPor: GetUserId());
    }

    /// <summary>Cobrança Pix ativa da comanda do cliente autenticado — pro card "Pagar" na tela dele.</summary>
    [HttpGet("my/pix")]
    public async Task<IActionResult> GetMinhaCobrancaPix()
    {
        var pix = await BuscarCobrancaAtivaDoUsuarioAsync();
        return pix == null
            ? NotFound(new { Message = "Nenhuma cobrança Pix ativa." })
            : Ok(PixDto(pix));
    }

    /// <summary>
    /// Cliente verifica se o pagamento da própria cobrança caiu (polling da tela do cliente).
    /// A confirmação vem do Inter — se paga, fecha a comanda como o admin faria.
    /// </summary>
    [HttpPost("my/pix/verificar")]
    public async Task<IActionResult> VerificarMinhaCobrancaPix()
    {
        var pix = await BuscarCobrancaAtivaDoUsuarioAsync(incluirRecemPagas: true);
        if (pix == null)
            return NotFound(new { Message = "Nenhuma cobrança Pix ativa." });

        // Quem "fecha" é o admin que gerou a cobrança — o cliente só dispara a checagem;
        // a prova do pagamento é a consulta autenticada na API do Inter.
        return await VerificarPagamentoPixAsync(pix, fechadoPor: pix.CriadoPorAdminId);
    }

    /// <summary>Consulta o Inter e, se a cobrança estiver paga, marca e fecha a comanda. Compartilhado entre admin e cliente.</summary>
    private async Task<IActionResult> VerificarPagamentoPixAsync(PixCobranca pix, Guid fechadoPor)
    {
        // A baixa mora no PixReconciliationService — mesmo caminho do robô e da
        // verificação final da expiração, pra tela e fundo nunca divergirem.
        var result = await _pixReconciliation.ReconciliarAsync(pix, fechadoPor);
        if (result.Error is not null)
            return StatusCode(422, new { message = result.Error });

        return Ok(new { pix.TxId, pix.Status, PagoEm = pix.PagoEm, Comanda = result.ComandaFechada });
    }

    /// <summary>Última cobrança Pix não expirada da comanda ativa do usuário logado.</summary>
    private async Task<PixCobranca?> BuscarCobrancaAtivaDoUsuarioAsync(bool incluirRecemPagas = false)
    {
        var userId  = GetUserId();
        var agora   = DateTime.UtcNow;

        var comandaId = await _db.Comandas
            .Where(c => c.UserId == userId &&
                        c.Status != ComandaStatus.Fechada && c.Status != ComandaStatus.Cancelada)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync();
        if (comandaId == null) return null;

        var q = _db.PixCobrancas.Where(p => p.ComandaId == comandaId);
        q = incluirRecemPagas
            ? q.Where(p => p.Status == "ATIVA" || p.Status == "CONCLUIDA")
            : q.Where(p => p.Status == "ATIVA" && (p.ExpiraEm == null || p.ExpiraEm > agora));

        return await q.OrderByDescending(p => p.CriadoEm).FirstOrDefaultAsync();
    }

    private static object PixDto(PixCobranca pix) => new
    {
        pix.TxId,
        pix.Status,
        pix.PixCopiaCola,
        pix.ImagemQrCode,
        pix.ExpiraEm,
        pix.ValorEmReais,
    };

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
