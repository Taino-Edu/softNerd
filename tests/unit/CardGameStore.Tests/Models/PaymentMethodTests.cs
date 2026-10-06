// =============================================================================
// PaymentMethodTests.cs — Catálogo de formas de pagamento
// Inclui a trava que compara com o catálogo do front (frontend/lib/pagamentos.ts):
// forma nova ou regra mudada só de um lado faz este teste falhar.
// =============================================================================

using System.Text.RegularExpressions;
using CardGameStore.Models.MongoDB;

namespace CardGameStore.Tests.Models;

public class PaymentMethodTests
{
    [Theory]
    [InlineData("Débito", PaymentMethod.CartaoDebito)]
    [InlineData("Crédito", PaymentMethod.CartaoCredito)]
    [InlineData("cartão de crédito", PaymentMethod.CartaoCredito)]
    [InlineData("Pix", PaymentMethod.Pix)]
    [InlineData("pix", PaymentMethod.Pix)]
    public void Normalizar_NomeLegadoOuCodigo_DevolveOCodigo(string entrada, string esperado) =>
        PaymentMethod.Normalizar(entrada).Should().Be(esperado);

    [Theory]
    [InlineData("Boleto")]
    [InlineData("")]
    [InlineData(null)]
    public void Normalizar_Desconhecido_DevolveNull(string? entrada) =>
        PaymentMethod.Normalizar(entrada).Should().BeNull();

    [Fact]
    public void Regras_BatemComOQueOSistemaFaziaAntes()
    {
        // Só dinheiro de verdade gera pontos e quita crediário
        PaymentMethod.QuitamCrediario.Should().BeEquivalentTo(
            [PaymentMethod.Pix, PaymentMethod.Dinheiro, PaymentMethod.CartaoCredito, PaymentMethod.CartaoDebito]);
        // Crediário, pontos e cashback exigem cliente
        PaymentMethod.Catalogo.Where(f => f.PrecisaCliente).Select(f => f.Codigo).Should().BeEquivalentTo(
            [PaymentMethod.Crediario, PaymentMethod.Pontos, PaymentMethod.Cashback]);
        // Pontos e cashback abatem saldo do cliente
        PaymentMethod.Catalogo.Where(f => f.UsaSaldoDoCliente).Select(f => f.Codigo).Should().BeEquivalentTo(
            [PaymentMethod.Pontos, PaymentMethod.Cashback]);
    }

    [Fact]
    public void CatalogoDoFront_EIgualAoDoBack()
    {
        var arquivo = AcharArquivo(Path.Combine("frontend", "lib", "pagamentos.ts"));
        var texto   = File.ReadAllText(arquivo);
        var inicio  = texto.IndexOf("catalogo-inicio", StringComparison.Ordinal);
        var fim     = texto.LastIndexOf("catalogo-fim", StringComparison.Ordinal);
        inicio.Should().BeGreaterThan(0, "o catálogo do front precisa dos marcadores catalogo-inicio/fim");
        var bloco = texto[inicio..fim];

        var linha = new Regex(
            @"value:\s*'(?<v>\w+)'.*?entraNoCaixa:\s*(?<c>true|false).*?precisaCliente:\s*(?<p>true|false).*?usaSaldoDoCliente:\s*(?<s>true|false)");
        var front = linha.Matches(bloco)
            .Select(m => (m.Groups["v"].Value, bool.Parse(m.Groups["c"].Value), bool.Parse(m.Groups["p"].Value), bool.Parse(m.Groups["s"].Value)))
            .ToList();
        var back = PaymentMethod.Catalogo
            .Select(f => (f.Codigo, f.EntraNoCaixa, f.PrecisaCliente, f.UsaSaldoDoCliente))
            .ToList();

        front.Should().Equal(back,
            "frontend/lib/pagamentos.ts e CardGameStore/Models/PaymentMethod.cs têm que ter as mesmas formas, na mesma ordem e com as mesmas regras");
    }

    private static string AcharArquivo(string relativo)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, relativo);
            if (File.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new FileNotFoundException($"Não achei {relativo} subindo a partir de {AppContext.BaseDirectory}");
    }
}
