// =============================================================================
// PaymentMethod.cs — Catálogo ÚNICO das formas de pagamento
//
// Toda regra do tipo "essa forma precisa de cliente?", "gera pontos?", "quita
// crediário?" sai daqui. Antes cada serviço tinha a sua lista (Comanda,
// PDV, crediário, analytics, fiscal) e uma tela gravava "Débito"/"Crédito",
// que nenhum outro lugar reconhecia.
//
// Forma nova: uma linha no Catalogo abaixo + a mesma linha no catálogo do
// front (frontend/lib/pagamentos.ts). O teste PaymentMethodTests confere que
// os dois estão iguais.
//
// Fica no namespace antigo (Models.MongoDB) só pra não precisar trocar o using
// dos ~20 arquivos que já usavam PaymentMethod.
// =============================================================================

namespace CardGameStore.Models.MongoDB;

/// <param name="Codigo">Valor gravado no banco e trafegado na API.</param>
/// <param name="Rotulo">Nome pra mostrar ao usuário.</param>
/// <param name="EntraNoCaixa">Dinheiro de verdade entrando (Pix, dinheiro, cartão). Só esses geram pontos e quitam crediário.</param>
/// <param name="PrecisaCliente">Exige cliente cadastrado na venda (crediário, pontos, cashback).</param>
/// <param name="UsaSaldoDoCliente">Abate do saldo do cliente (pontos ou cashback).</param>
public sealed record FormaPagamentoInfo(
    string Codigo, string Rotulo, bool EntraNoCaixa, bool PrecisaCliente, bool UsaSaldoDoCliente);

public static class PaymentMethod
{
    public const string Pix           = "Pix";
    public const string Dinheiro      = "Dinheiro";
    public const string CartaoCredito = "CartaoCredito";
    public const string CartaoDebito  = "CartaoDebito";
    public const string Crediario     = "Crediario";
    public const string Pontos        = "Pontos";
    public const string Cashback      = "Cashback";

    public static readonly IReadOnlyList<FormaPagamentoInfo> Catalogo =
    [
        new(Pix,           "Pix",                EntraNoCaixa: true,  PrecisaCliente: false, UsaSaldoDoCliente: false),
        new(Dinheiro,      "Dinheiro",           EntraNoCaixa: true,  PrecisaCliente: false, UsaSaldoDoCliente: false),
        new(CartaoCredito, "Cartão de crédito",  EntraNoCaixa: true,  PrecisaCliente: false, UsaSaldoDoCliente: false),
        new(CartaoDebito,  "Cartão de débito",   EntraNoCaixa: true,  PrecisaCliente: false, UsaSaldoDoCliente: false),
        new(Crediario,     "Crediário",          EntraNoCaixa: false, PrecisaCliente: true,  UsaSaldoDoCliente: false),
        new(Pontos,        "Pontos",             EntraNoCaixa: false, PrecisaCliente: true,  UsaSaldoDoCliente: true),
        new(Cashback,      "Cashback",           EntraNoCaixa: false, PrecisaCliente: true,  UsaSaldoDoCliente: true),
    ];

    public static readonly string[] All = Catalogo.Select(f => f.Codigo).ToArray();

    /// <summary>Formas que quitam conta de crediário — só dinheiro de verdade.</summary>
    public static readonly string[] QuitamCrediario = Catalogo.Where(f => f.EntraNoCaixa).Select(f => f.Codigo).ToArray();

    public static FormaPagamentoInfo? Info(string? codigo) =>
        codigo is null ? null : Catalogo.FirstOrDefault(f => f.Codigo == codigo);

    public static bool IsValid(string? codigo) => Info(codigo) is not null;

    public static string Rotulo(string? codigo) => Info(codigo)?.Rotulo ?? codigo ?? "—";

    public static bool EntraNoCaixa(string? codigo)      => Info(codigo)?.EntraNoCaixa ?? false;
    public static bool PrecisaCliente(string? codigo)    => Info(codigo)?.PrecisaCliente ?? false;
    public static bool UsaSaldoDoCliente(string? codigo) => Info(codigo)?.UsaSaldoDoCliente ?? false;
    public static bool EhCartao(string? codigo)          => codigo is CartaoCredito or CartaoDebito;

    /// <summary>
    /// Nomes escritos à mão que já chegaram a ser gravados ("Débito", "Crédito"...)
    /// → código certo. Código válido volta igual; desconhecido volta null.
    /// </summary>
    public static string? Normalizar(string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor)) return null;
        if (IsValid(valor)) return valor;
        return valor.Trim().ToLowerInvariant() switch
        {
            "débito" or "debito" or "cartão de débito" or "cartao de debito" => CartaoDebito,
            "crédito" or "credito" or "cartão de crédito" or "cartao de credito" => CartaoCredito,
            "crediário" => Crediario,
            _ => Catalogo.FirstOrDefault(f => string.Equals(f.Codigo, valor.Trim(), StringComparison.OrdinalIgnoreCase))?.Codigo,
        };
    }

    /// <summary>Valores legados que a correção de dados troca pelo código certo.</summary>
    public static readonly IReadOnlyDictionary<string, string> Legados = new Dictionary<string, string>
    {
        ["Débito"]  = CartaoDebito,
        ["Crédito"] = CartaoCredito,
    };
}
