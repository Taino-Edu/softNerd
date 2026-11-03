// =============================================================================
// CrediariosController.cs — Gestão de crediários
//
// POST /api/crediarios                     → Admin: cria crediário manual (dívida antiga)
// GET  /api/crediarios                     → Admin: lista todos (filtro por status)
// GET  /api/crediarios/usuario/{userId}    → Admin: crediários de um cliente
// GET  /api/crediarios/historico           → Cliente: as contas dele
// POST /api/crediarios/{id}/pagamento      → Admin: registra pagamento parcial ou total
// GET  /api/crediarios/avisos/config        → Admin: config dos lembretes automáticos
// PUT  /api/crediarios/avisos/config        → Admin: salva a config
// GET  /api/crediarios/{id}/aviso/previa    → Admin: texto do lembrete, sem enviar
// POST /api/crediarios/{id}/aviso           → Admin: manda o lembrete agora
//
// Só HTTP: as contas em Services/Crediarios/CrediarioContaService, o Pix em
// CrediarioPixService e os lembretes em CrediarioAvisoService.
// =============================================================================

using CardGameStore.DTOs;
using CardGameStore.Services.Crediarios;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/crediarios")]
[Authorize]
public class CrediariosController(
    ICrediarioContaService contas, CrediarioPixService pix, CrediarioAvisoService avisos) : ControllerBase
{
    /// <summary>Criação manual (dívida anterior ao sistema).</summary>
    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(CrediariosDto), 200)]
    [ProducesResponseType(400)]
    public Task<IActionResult> CriarManual([FromBody] CriarCrediarioManualRequest request) =>
        ModelState.IsValid
            ? this.Responder(() => contas.CriarManualAsync(request, UsuarioId()))
            : Task.FromResult<IActionResult>(BadRequest(ModelState));

    /// <summary>Dívidas abertas agrupadas por pessoa.</summary>
    [HttpGet("por-cliente")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<List<CrediariosClienteDto>>> GetPorCliente() => Ok(await contas.PorClienteAsync());

    /// <summary>GET /api/crediarios?status=Aberto</summary>
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<List<CrediariosDto>>> GetAll([FromQuery] string? status) => Ok(await contas.ListarAsync(status));

    [HttpGet("usuario/{userId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<List<CrediariosDto>>> GetByUser(Guid userId) => Ok(await contas.DoClienteAsync(userId));

    /// <summary>Todo o histórico de crediários do cliente logado.</summary>
    [HttpGet("historico")]
    public async Task<ActionResult<List<CrediariosDto>>> GetMeuHistorico() => Ok(await contas.DoClienteAsync(UsuarioId()));

    /// <summary>Editar valor, observação, vencimento ou os itens.</summary>
    [HttpPatch("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(CrediariosDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public Task<IActionResult> Editar(Guid id, [FromBody] EditarCrediarioRequest request) =>
        this.Responder(() => contas.EditarAsync(id, request, UsuarioId()));

    [HttpPost("{id:guid}/pagamento")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> RegistrarPagamento(Guid id, [FromBody] RegistrarPagamentoRequest request) =>
        ModelState.IsValid
            ? this.Responder(() => contas.RegistrarPagamentoAsync(id, request, UsuarioId()))
            : Task.FromResult<IActionResult>(BadRequest(ModelState));

    /// <summary>Exclui conta sem nenhum pagamento.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(204)]
    [ProducesResponseType(404)]
    public Task<IActionResult> Deletar(Guid id) => this.ResponderCom(async () =>
    {
        await contas.ExcluirAsync(id, UsuarioId());
        return NoContent();
    });

    // ── Pix ──────────────────────────────────────────────────────────────────

    /// <summary>Cobrança Pix do saldo restante (reaproveita a ativa do mesmo saldo).</summary>
    [HttpPost("{id:guid}/pix")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GerarCobrancaPix(Guid id)
    {
        var resultado = await pix.ObterOuGerarAsync(id, UsuarioId());
        if (resultado.Pix is not { } cobranca)
            return StatusCode(resultado.StatusCode, new { Message = resultado.Erro });

        return Ok(new { cobranca.TxId, cobranca.Status, cobranca.PixCopiaCola, cobranca.ImagemQrCode, cobranca.ExpiraEm, cobranca.ValorEmReais });
    }

    /// <summary>Consulta a cobrança; paga → o pagamento entra na conta (mesmo caminho do robô).</summary>
    [HttpGet("{id:guid}/pix/{txid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ConsultarCobrancaPix(Guid id, string txid)
    {
        var (cobranca, erro) = await pix.VerificarAsync(id, txid, UsuarioId());
        if (cobranca is null) return NotFound(new { Message = erro });
        if (erro is not null) return StatusCode(422, new { message = erro });

        return Ok(new { cobranca.TxId, cobranca.Status, cobranca.PagoEm });
    }

    // ── Lembretes de vencimento ──────────────────────────────────────────────

    [HttpGet("avisos/config")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CrediarioAvisoConfigDto>> GetAvisoConfig(CancellationToken ct) =>
        Ok(CrediarioAvisoService.ParaConfigDto(await avisos.ObterConfigAsync()));

    [HttpPut("avisos/config")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> SalvarAvisoConfig([FromBody] CrediarioAvisoConfigDto request, CancellationToken ct) =>
        ModelState.IsValid
            ? this.Responder(() => avisos.SalvarConfigAsync(request, ct))
            : Task.FromResult<IActionResult>(BadRequest(ModelState));

    [HttpGet("{id:guid}/aviso/previa")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PreviaAviso(Guid id, CancellationToken ct)
    {
        try
        {
            var previa = await avisos.PreviaAsync(id, ct);
            return Ok(new { previa.Titulo, previa.Texto, previa.WhatsApp, previa.Email, previa.CanaisDisponiveis });
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
            var envio = await avisos.AvisarAgoraAsync(id, UsuarioId(), ct);
            return Ok(new { Canais = envio.Canais.Split(',', StringSplitOptions.RemoveEmptyEntries), envio.Falhas });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    private Guid UsuarioId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
