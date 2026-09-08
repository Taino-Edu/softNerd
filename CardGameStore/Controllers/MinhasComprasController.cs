// =============================================================================
// MinhasComprasController.cs — Compras de balcão (PDV) do próprio cliente.
//
// VendaAvulsaController inteiro é AdminOnly — este controller separado existe
// pra o cliente enxergar no painel dele as vendas de balcão que foram
// registradas no seu nome, com a forma de pagamento de cada uma.
//
// GET /api/minhas-compras → vendas de balcão do cliente logado
//
// As comandas continuam vindo de /api/comanda/my-history; o front junta as duas
// listas por data no histórico.
// =============================================================================

using CardGameStore.DTOs;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/minhas-compras")]
[Authorize(Policy = "CustomerOrAdmin")]
[Produces("application/json")]
public class MinhasComprasController : ControllerBase
{
    private readonly IVendaAvulsaService _vendas;

    public MinhasComprasController(IVendaAvulsaService vendas) => _vendas = vendas;

    /// <summary>Vendas de balcão registradas no nome do cliente logado, estornadas incluídas
    /// (marcadas, pra o cliente ver que a compra existiu e foi desfeita).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<MinhaCompraDto>), 200)]
    public async Task<IActionResult> ListMinhasCompras()
    {
        var userId = GetUserId();
        var vendas = await _vendas.GetByUserComEstornadasAsync(userId);

        var result = vendas.Select(v => new MinhaCompraDto
        {
            Id                         = v.Id,
            SoldAt                     = v.SoldAt,
            PaymentMethod              = v.PaymentMethod,
            SecondPaymentMethod        = v.SecondPaymentMethod,
            SecondPaymentAmountInCents = v.SecondPaymentAmountInCents,
            TotalInReais               = v.TotalInReais,
            DiscountInReais            = v.DiscountInReais,
            Origem                     = v.Origem != "Reserva" ? "Balcao"
                                       : v.ProductIsPreVenda  ? "PreVenda"
                                                              : "Site",
            Estornada                  = v.Cancelada,
            EstornadaEm                = v.CanceladaEm,
            MotivoEstorno              = v.MotivoCancelamento,
            Items                      = v.Items.Select(i => new MinhaCompraItemDto
            {
                ProductName      = i.ProductName,
                Quantity         = i.Quantity,
                UnitPriceInReais = i.UnitPriceInReais,
                SubtotalInReais  = i.SubtotalInReais,
            }).ToList(),
        }).ToList();

        return Ok(result);
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
