// =============================================================================
// VendaAvulsaRequestTests.cs — campos internos da venda não entram pelo JSON do PDV
// SkipStockDecrement/Origem/Reserva* só o back preenche (homologação e pagamento de pedido do
// site). Pelo corpo da venda, o PDV vendia sem baixar estoque ou marcava venda como "do site".
// =============================================================================

using System.Text.Json;
using CardGameStore.DTOs;

namespace CardGameStore.Tests.DTOs;

public class VendaAvulsaRequestTests
{
    [Fact]
    public void CamposInternos_MandadosNoJson_SaoIgnorados()
    {
        var json = """
            {
              "paymentMethod": "Dinheiro",
              "items": [{ "productId": "8a3f8d0a-1c1b-4c5e-9d6a-2b7c1e0f9a11", "quantity": 1, "unitPriceInCents": 1 }],
              "skipStockDecrement": true,
              "origem": "Reserva",
              "reservationId": "1b2c3d4e-0000-0000-0000-000000000001",
              "reservationGroupId": "1b2c3d4e-0000-0000-0000-000000000002",
              "productIsPreVenda": true
            }
            """;

        var req = JsonSerializer.Deserialize<VendaAvulsaRequest>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

        req.SkipStockDecrement.Should().BeFalse("o PDV não pode vender sem baixar estoque");
        req.Origem.Should().BeNull();
        req.ReservationId.Should().BeNull();
        req.ReservationGroupId.Should().BeNull();
        req.ProductIsPreVenda.Should().BeFalse();
        req.Items.Single().UnitPriceInCents.Should().BeNull("preço congelado só vem do pedido do site");
        req.PaymentMethod.Should().Be("Dinheiro");
    }
}
