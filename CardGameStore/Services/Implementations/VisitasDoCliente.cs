// =============================================================================
// VisitasDoCliente.cs — o que conta como "visita" à loja
//
// Visita = um dia (calendário de Brasília) em que o cliente fechou comanda OU
// comprou no balcão (PDV). Duas compras no mesmo dia são uma visita.
//
// Antes o histórico do cliente contava só comanda fechada: quem só compra no
// caixa aparecia com "0 visitas" e R$ 6 mil gastos.
// =============================================================================

using CardGameStore.Common;

namespace CardGameStore.Services.Implementations;

public static class VisitasDoCliente
{
    public sealed record Resumo(int Total, DateTime? Primeira, DateTime? Ultima);

    /// <param name="momentosUtc">Fechamento de cada comanda e hora de cada venda do PDV, em UTC.</param>
    public static Resumo Resumir(IEnumerable<DateTime> momentosUtc)
    {
        var momentos = momentosUtc.ToList();
        if (momentos.Count == 0) return new Resumo(0, null, null);

        var dias = momentos.Select(m => Brasilia.ParaBrasilia(m).Date).Distinct().Count();
        return new Resumo(dias, momentos.Min(), momentos.Max());
    }
}
