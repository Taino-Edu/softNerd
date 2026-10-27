// =============================================================================
// RelatoriosDtos.cs — DTOs para relatórios de vendas e crediário
// =============================================================================

namespace CardGameStore.DTOs;

// ── Vendas por categoria ──────────────────────────────────────────────────────

public class RelatorioVendasDto
{
    public int     Mes                { get; set; }
    public int     Ano                { get; set; }
    public decimal TotalGeralEmReais  { get; set; }
    public int     TotalItensVendidos { get; set; }
    public List<RelatorioCategoria> PorCategoria { get; set; } = new();
    /// <summary>As mesmas categorias de PorCategoria, agrupadas debaixo da categoria-pai
    /// (chave relatorio-por-subcategoria). O total do grupo é a soma das subcategorias.</summary>
    public List<RelatorioGrupoCategoria> Grupos { get; set; } = new();
}

public class RelatorioGrupoCategoria
{
    public string  Categoria         { get; set; } = string.Empty;
    public string  Emoji             { get; set; } = "📦";
    public int     QuantidadeVendida { get; set; }
    public decimal TotalEmReais      { get; set; }
    public List<RelatorioCategoria> Subcategorias { get; set; } = new();
}

public class RelatorioCategoria
{
    public string  Categoria         { get; set; } = string.Empty;
    public string  Emoji             { get; set; } = "📦";
    public int     QuantidadeVendida { get; set; }
    public decimal TotalEmReais      { get; set; }
    public List<RelatorioProduto> Produtos { get; set; } = new();
}

public class RelatorioProduto
{
    public string  Nome              { get; set; } = string.Empty;
    public int     QuantidadeVendida { get; set; }
    public decimal TotalEmReais      { get; set; }
}

// ── Crediário ─────────────────────────────────────────────────────────────────

public class RelatorioCrediarioDto
{
    public int     Mes  { get; set; }
    public int     Ano  { get; set; }

    // Situação atual (todos os crediários abertos — independe do mês)
    public decimal TotalEmAbertoEmReais { get; set; }
    public decimal TotalVencidoEmReais  { get; set; }
    public int     QtdAbertos           { get; set; }
    public int     QtdVencidos          { get; set; }

    // Movimento do mês selecionado
    public decimal RecebidoNoMesEmReais { get; set; }
    public int     QtdPagamentosNoMes   { get; set; }

    public List<DevedorDto>      Devedores       { get; set; } = new();
    public List<PagamentoMesDto> PagamentosNoMes { get; set; } = new();
}

public class DevedorDto
{
    public Guid     UserId         { get; set; }
    public string   Nome           { get; set; } = string.Empty;
    public string?  Email          { get; set; }
    public string?  WhatsApp       { get; set; }
    public decimal  SaldoEmReais   { get; set; }
    public bool     Vencido        { get; set; }
    public int      DiasAtraso     { get; set; }   // positivo = dias em atraso
    public DateTime DataVencimento { get; set; }
}

public class PagamentoMesDto
{
    public string   ClienteNome    { get; set; } = string.Empty;
    public decimal  ValorEmReais   { get; set; }
    public string   FormaPagamento { get; set; } = string.Empty;
    public string?  Observacao     { get; set; }
    public DateTime CreatedAt      { get; set; }
}
