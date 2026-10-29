using CardGameStore.Common;
using CardGameStore.DTOs;
using CardGameStore.Services.Pedidos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CardGameStore.Controllers;

// =============================================================================
// ReservationController.cs — Pedidos do site (pré-venda e fila legada).
// Só HTTP: monta quem está pedindo a partir do login, chama o serviço e traduz
// a recusa de regra (PedidoException) na resposta (RespostaDeRegra.cs). As regras ficam em
// Services/Pedidos: criação, andamento (cancelar, retirar, homologar, pagar),
// cobrança Pix e consulta.
// =============================================================================

[ApiController]
[Route("api/reservations")]
[Produces("application/json")]
public class ReservationController(
    IPedidoCriacaoService criacao, IPedidoAndamentoService andamento,
    IPedidoCobrancaService cobranca, IPedidoConsultaService consulta) : ControllerBase
{
    /// <summary>
    /// Quantos clientes esperam na fila de pré-venda (contador do painel). URL antiga mantida:
    /// veio do ProductWaitListController, que virou fila de reservas (kind "fila").
    /// </summary>
    [HttpGet("/api/products/waitlist/pre-venda/pendentes")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CountPreVendaPendentes() =>
        Ok(new { Count = await consulta.ContarFilaPendenteAsync() });

    // GET /api/reservations/mine — pré-vendas e fila do cliente logado
    [HttpGet("mine")]
    [Authorize]
    public async Task<IActionResult> GetMine() => Ok(await consulta.DoClienteAsync(Ator().Id));

    // POST /api/reservations — pedido de um item (EM ESTOQUE; sem estoque = 409, o site não cria fila)
    [HttpPost]
    [Authorize]
    public Task<IActionResult> Create([FromBody] CreateReservationRequest req) =>
        this.Responder(() => criacao.CriarAsync(Ator().Id, req));

    // POST /api/reservations/cart — o carrinho inteiro num pedido só (ou nenhum item)
    [HttpPost("cart")]
    [Authorize]
    public Task<IActionResult> CreateCart([FromBody] CreateReservationCartRequest req) =>
        this.Responder(() => criacao.CriarCarrinhoAsync(Ator().Id, req));

    // POST /api/reservations/mine/juntar — o cliente junta os pedidos dele sem pagar num Pix só
    [HttpPost("mine/juntar")]
    [Authorize]
    public Task<IActionResult> JuntarMeus() =>
        this.Responder(() => criacao.JuntarMeusPedidosAsync(Ator().Id));

    // POST /api/reservations/admin-create — admin registra o pedido em nome do cliente
    [HttpPost("admin-create")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> AdminCreate([FromBody] AdminCreateReservationRequest req) =>
        this.Responder(() => criacao.CriarPeloAdminAsync(req));

    // DELETE /api/reservations/{id} — cancela pré-venda (estoque volta) ou sai da fila
    [HttpDelete("{id:guid}")]
    [Authorize]
    public Task<IActionResult> Cancel(Guid id) => this.Responder(() => andamento.CancelarAsync(id, Ator()));

    // GET /api/reservations — lista do admin
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status    = null,
        [FromQuery] string? kind      = null,
        [FromQuery] Guid?   userId    = null,
        [FromQuery] Guid?   productId = null,
        [FromQuery] int     page      = 1,
        [FromQuery] int     pageSize  = 30) =>
        Ok(await consulta.ListarAsync(status, kind, userId, productId, page, pageSize));

    // PUT /api/reservations/{id}/status — admin: fulfilled (retirado) ou cancelled
    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateReservationStatusRequest req) =>
        this.Responder(() => andamento.AtualizarStatusAsync(id, req.Status, Ator()));

    // PUT /api/reservations/{id}/quantity — admin corrige a quantidade de um pedido em aberto
    [HttpPut("{id:guid}/quantity")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> UpdateQuantity(Guid id, [FromBody] UpdateReservationQuantityRequest req) =>
        this.Responder(() => andamento.AtualizarQuantidadeAsync(id, req.Quantity));

    // POST /api/reservations/{id}/homologar — homologa UM item (a tela usa o do pedido inteiro)
    [HttpPost("{id:guid}/homologar")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Homologar(Guid id, [FromBody] HomologarRequest req) =>
        this.Responder(() => andamento.HomologarAsync(id, req, Ator()));

    // POST /api/reservations/group/{groupId}/homologar — homologa o pedido inteiro de uma vez
    [HttpPost("group/{groupId:guid}/homologar")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> HomologarGrupo(Guid groupId, [FromBody] HomologarRequest req) =>
        this.Responder(() => andamento.HomologarPedidoAsync(groupId, req, Ator()));

    // POST /api/reservations/group/{groupId}/pagamento — pagamento lançado à mão SEM retirada
    [HttpPost("group/{groupId:guid}/pagamento")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> RegistrarPagamentoGrupo(Guid groupId, [FromBody] HomologarRequest req) =>
        this.Responder(() => andamento.RegistrarPagamentoAsync(groupId, req, Ator()));

    // POST /api/reservations/group/{groupId}/juntar — os outros pedidos sem pagar do cliente entram neste
    [HttpPost("group/{groupId:guid}/juntar")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> JuntarPedidos(Guid groupId) =>
        this.Responder(() => criacao.JuntarPedidosAbertosAsync(groupId));

    // POST /api/reservations/group/{groupId}/pix — Pix do total das pré-vendas do pedido
    [HttpPost("group/{groupId:guid}/pix")]
    [Authorize]
    public Task<IActionResult> GerarPixReserva(Guid groupId) => this.Responder(() => cobranca.GerarAsync(groupId, Ator()));

    // POST /api/reservations/group/{groupId}/pix/verificar — confere no Inter se o Pix caiu
    [HttpPost("group/{groupId:guid}/pix/verificar")]
    [Authorize]
    public Task<IActionResult> VerificarPixReserva(Guid groupId) => this.Responder(() => cobranca.VerificarAsync(groupId, Ator()));

    // DELETE /api/reservations/group/{groupId}/pix — cancela o Pix aberto do pedido
    [HttpDelete("group/{groupId:guid}/pix")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> CancelarPixReserva(Guid groupId) => this.Responder(async () =>
    {
        await cobranca.CancelarAsync(groupId);
        return new { Message = "Cobrança Pix cancelada. Agora dá pra alterar a quantidade." };
    });

    // GET /api/reservations/group/{groupId}/pix — status atual do pagamento
    [HttpGet("group/{groupId:guid}/pix")]
    [Authorize]
    public Task<IActionResult> GetPixReserva(Guid groupId) => this.Responder(() => cobranca.StatusAsync(groupId, Ator()));

    /// <summary>Quem está pedindo, a partir dos claims do login.</summary>
    private Ator Ator()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id)) throw new UnauthorizedAccessException();
        var nome = User.FindFirst(ClaimTypes.Name)?.Value ?? User.FindFirst("name")?.Value ?? "Admin";
        return new Ator(id, nome, User.IsInRole("Admin"));
    }
}
