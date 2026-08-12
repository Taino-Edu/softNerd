using CardGameStore.DTOs;

namespace CardGameStore.Services.Interfaces;

public interface IVendaAvulsaService
{
    /// <summary>
    /// Registra uma venda avulsa: valida estoque, decrementa no PostgreSQL e
    /// persiste o evento de caixa no MongoDB. Operação atômica no lado PG.
    /// </summary>
    Task<VendaAvulsaDto> RegisterAsync(VendaAvulsaRequest request, Guid adminId, string adminName);

    /// <summary>Retorna as vendas avulsas mais recentes (padrão: últimas 50). Se <paramref name="desde"/> for informado, filtra direto no MongoDB.</summary>
    Task<IEnumerable<VendaAvulsaDto>> GetRecentAsync(int limit = 50, DateTime? desde = null);

    /// <summary>Retorna todas as vendas avulsas de um dia específico (fuso de Brasília). Padrão: hoje BR.</summary>
    Task<IEnumerable<VendaAvulsaDto>> GetByDateAsync(DateTime? date = null);

    /// <summary>Retorna todas as vendas avulsas vinculadas a um cliente específico.</summary>
    Task<IEnumerable<VendaAvulsaDto>> GetByUserAsync(Guid userId);

    /// <summary>
    /// Agrega, por cliente identificado, as vendas do período/forma de pagamento pedidos.
    /// Todos os predicados vão pro MongoDB — não usar <see cref="GetRecentAsync"/> pra isso:
    /// ele corta nas N mais recentes ANTES de filtrar, o que faz o ranking perder histórico
    /// silenciosamente assim que a coleção passa do limite.
    /// Vendas de balcão anônimas (UserId nulo) ficam de fora.
    /// </summary>
    Task<IReadOnlyList<VendaAvulsaClienteAgregadoDto>> AgregarPorClienteAsync(
        DateTime? inicio, DateTime? fim, string? formaPagamento);

    /// <summary>
    /// Data da última venda de cada cliente identificado, sem recorte de período —
    /// usado pra decidir inatividade, que é sempre relativa a hoje.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, DateTime>> UltimaVendaPorClienteAsync();

    /// <summary>
    /// Preenche UnitCostInCents=0 em itens de vendas avulsas usando o custo atual do produto no PostgreSQL.
    /// Retorna quantos itens foram atualizados.
    /// </summary>
    Task<int> BackfillCostsAsync();

    /// <summary>Corrige a forma de pagamento de uma venda avulsa já registrada (Admin only).</summary>
    Task<VendaAvulsaDto> EditarPagamentoAsync(string id, EditarPagamentoVendaAvulsaRequest request);

    /// <summary>Estorna a venda: devolve estoque, desfaz pontos/cashback, baixa o crediário
    /// gerado e tira o valor do faturamento. A venda fica marcada, não é apagada.</summary>
    Task<VendaAvulsaDto> EstornarAsync(string id, Guid adminId, string adminNome, string motivo);

    /// <summary>Vendas do período incluindo as estornadas — exclusivo do extrato.</summary>
    Task<IEnumerable<VendaAvulsaDto>> GetPeriodoComCanceladasAsync(DateTime inicio, DateTime fim);
}
