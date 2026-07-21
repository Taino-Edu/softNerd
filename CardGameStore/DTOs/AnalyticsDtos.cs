// =============================================================================
// AnalyticsDtos.cs — DTOs para o módulo de analytics do dashboard admin
// =============================================================================

namespace CardGameStore.DTOs;

public class DashboardAnalyticsDto
{
    // KPIs do dia
    public decimal VendasHoje          { get; set; }
    public decimal VendasOntem         { get; set; }
    public decimal VariacaoPercDia     { get; set; }  // ex: +12.5 ou -5.0
    public int     ComandasAbertas     { get; set; }
    public int     VendasAvulsasHoje   { get; set; }

    // Ticket médio (últimos 30 dias)
    public decimal TicketMedio         { get; set; }
    public decimal TicketMedioAnterior { get; set; }

    // Clientes
    public int TotalClientes           { get; set; }
    public int ClientesAtivos30Dias    { get; set; }
    public int ClientesInativos30Dias  { get; set; }
    public int NovosClientesMes        { get; set; }

    // Curva de vendas do dia (por hora)
    public List<HourlyRevenueDto> CurvaVendasDia { get; set; } = new();

    // Top produtos vendidos (últimos 30 dias)
    public List<TopProductDto> TopProdutos { get; set; } = new();

    // Forma de pagamento (últimas vendas avulsas com pagamento registrado)
    public int PagamentosPix      { get; set; }
    public int PagamentosCartao   { get; set; }
    public int PagamentosDinheiro { get; set; }
}

public class HourlyRevenueDto
{
    public string Hora    { get; set; } = string.Empty; // ex: "14h"
    public decimal Valor  { get; set; }
}

public class TopProductDto
{
    public string Nome         { get; set; } = string.Empty;
    public int    QuantVendida { get; set; }
    public decimal Receita     { get; set; }
}

public class ClienteInsightDto
{
    public Guid    UserId       { get; set; }
    public string  Nome         { get; set; } = string.Empty;
    public string? Email        { get; set; }
    public string? WhatsApp     { get; set; }
    public decimal GastoTotal   { get; set; }
    public decimal TicketMedio  { get; set; }
    public int     NumVisitas   { get; set; }
    public DateTime? UltimaVisita { get; set; }
    public bool    Inativo30    { get; set; }  // sem visita nos últimos 30 dias
    public int     Pontos       { get; set; }
    /// <summary>Dias até os pontos vencerem. Negativo = já venceu. Null = sem data de vencimento.</summary>
    public int?    PontosVencemEm { get; set; }
}

// ── Financeiro ────────────────────────────────────────────────────────────────

public class FinanceiroDto
{
    public decimal Receita          { get; set; } // total (comandas + avulsas + site + pré-venda)
    public decimal ReceitaComandas  { get; set; } // só comandas fechadas
    public decimal ReceitaAvulsa    { get; set; } // só vendas avulsas de balcão (PDV, sem site/pré-venda)
    public decimal ReceitaSite      { get; set; } // pedido do site homologado, produto SEM tag de pré-venda
    public decimal ReceitaPreVenda  { get; set; } // pedido do site homologado, produto COM tag de pré-venda
    public decimal Custo            { get; set; } // custo dos produtos vendidos (R$)
    public decimal Margem           { get; set; } // receita - custo
    public decimal MargemPercent    { get; set; } // (margem / custo) * 100
    public decimal Crediarios        { get; set; } // total em aberto nos crediários (R$)
    public decimal RecebidoCrediario { get; set; } // total recebido de crediários no período
    public List<DiaFinanceiroDto>               DiaDia                     { get; set; } = new();
    public List<TopProductFinDto>               TopProdutos                { get; set; } = new();
    public List<FormaPagamentoTotalDto>         PagamentosPorForma         { get; set; } = new();
    public List<PagamentoCrediarioPeriodoDto>   PagamentosCrediarioPeriodo { get; set; } = new();
}

public class PagamentoCrediarioPeriodoDto
{
    public string   ClienteNome     { get; set; } = string.Empty;
    public string?  ClienteWhatsApp { get; set; }
    public decimal  ValorEmReais    { get; set; }
    public string   FormaPagamento  { get; set; } = string.Empty;
    public string?  Observacao      { get; set; }
    public DateTime CreatedAt       { get; set; }
}

public class DiaFinanceiroDto
{
    public string  Dia     { get; set; } = string.Empty; // "dd/MM"
    public decimal Receita { get; set; }
    public decimal Custo   { get; set; }
}

public class TopProductFinDto
{
    public string  Nome            { get; set; } = string.Empty;
    public string  Categoria       { get; set; } = string.Empty;
    public int     Qtd             { get; set; }
    public int     QtdComandas     { get; set; }
    public int     QtdAvulsa       { get; set; }
    public int     QtdSite         { get; set; }
    public int     QtdPreVenda     { get; set; }
    public decimal Receita         { get; set; }
    public decimal ReceitaComandas { get; set; }
    public decimal ReceitaAvulsa   { get; set; }
    public decimal ReceitaSite     { get; set; }
    public decimal ReceitaPreVenda { get; set; }
    public decimal Custo           { get; set; }
    public decimal Margem          { get; set; }
}

public class FormaPagamentoTotalDto
{
    public string  Forma      { get; set; } = string.Empty;
    public decimal Total      { get; set; }
    public int     Quantidade { get; set; }

    /// <summary>Transações individuais que compõem esse total (drill-down).</summary>
    public List<TransacaoFinDto> Transacoes { get; set; } = new();
}

public class TransacaoFinDto
{
    /// <summary>"Comanda", "PDV", "Site" ou "Pré-venda".</summary>
    public string  Origem  { get; set; } = string.Empty;
    public string? Cliente { get; set; }
    public decimal Valor   { get; set; }
    public DateTime Data   { get; set; }
    /// <summary>Nota opcional exibida no drill-down (ex.: "+ Cashback R$19,00").</summary>
    public string? Nota    { get; set; }

    /// <summary>Usado internamente no agrupamento — não serializado.</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public string Forma { get; set; } = string.Empty;
}
