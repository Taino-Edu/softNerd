// =============================================================================
// IProductService.cs — Interface do CRUD de Produtos (estoque físico)
// =============================================================================

using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.Services.Interfaces;

/// <summary>Contrato para gestão do estoque físico da loja.</summary>
public interface IProductService
{
    Task<IEnumerable<Product>> GetAllActiveAsync();
    Task<IEnumerable<Product>> GetAllForAdminAsync();
    Task<IEnumerable<Product>> GetByCategoryAsync(string category);
    Task<Product?>             GetByIdAsync(Guid id);
    /// <summary>Cartas avulsas à venda no Mercado de Cartas (chave cartas-como-produto).</summary>
    Task<List<Product>>        ListarCartasAsync(string? jogo, string? busca);
    Task<Product?>             GetByBarcodeAsync(string barcode);
    Task<Product>              CreateAsync(Product product);
    Task<Product>              UpdateAsync(Product product);
    Task                       DeactivateAsync(Guid id);
    Task<IEnumerable<Product>> GetLowStockAsync();
    Task<bool>                 AdjustStockAsync(Guid id, int quantityDelta); // Positivo = entrada, negativo = saída

    /// <summary>
    /// Chegada de estoque: converte a fila (kind=fila, status=waiting) em pré-venda
    /// na ordem de entrada, baixando o estoque de cada convertido, até onde o estoque
    /// cobrir. Notifica cada pessoa convertida. Quem não couber no lote segue na fila.
    /// Idempotente e seguro para chamar sempre que o estoque aumentar.
    /// </summary>
    Task ProcessarChegadaFilaAsync(Guid productId);
}
