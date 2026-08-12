// =============================================================================
// IComandaService.cs — Interface do serviço de Comandas
// =============================================================================

using CardGameStore.DTOs;

namespace CardGameStore.Services.Interfaces;

/// <summary>Contrato para todas as operações de negócio relacionadas a Comandas.</summary>
public interface IComandaService
{
    /// <summary>Cria e abre uma nova comanda para o usuário (chamado após login rápido).</summary>
    Task<ComandaDto> OpenComandaAsync(Guid userId, string? tableIdentifier = null);

    /// <summary>Retorna a comanda ativa (Aberta ou EmAndamento) de um usuário.</summary>
    Task<ComandaDto?> GetActiveComandaAsync(Guid userId);

    /// <summary>Retorna apenas o ID da comanda ativa (para o Hub SignalR).</summary>
    Task<Guid?> GetActiveComandaIdByUserAsync(Guid userId);

    /// <summary>Retorna uma comanda específica pelo ID (Admin).</summary>
    Task<ComandaDto?> GetByIdAsync(Guid comandaId);

    /// <summary>Adiciona um item à comanda do usuário e recalcula o total.</summary>
    Task<ComandaDto> AddItemAsync(Guid userId, AddItemToComandaRequest request);

    /// <summary>Admin adiciona item manualmente a uma comanda de cliente.</summary>
    Task<ComandaDto> AdminAddItemAsync(Guid comandaId, Guid adminId, AddItemToComandaRequest request);

    /// <summary>Remove um item de uma comanda (apenas Admin ou o próprio cliente).</summary>
    Task<ComandaDto> RemoveItemAsync(Guid comandaId, Guid itemId, Guid requestingUserId);

    /// <summary>
    /// Fecha a comanda (pagamento recebido).
    /// Se paymentMethod == "Crediario", cria um Crediario e envia email ao cliente.
    /// Suporta split payment: secondPaymentMethod + secondPaymentAmountInCents.
    /// </summary>
    Task<ComandaDto> CloseComandaAsync(Guid comandaId, Guid adminId, string paymentMethod = "Dinheiro", string? observacao = null, string? secondPaymentMethod = null, int secondPaymentAmountInCents = 0, Guid? crediarioExistenteId = null, int discountInCents = 0, bool emitirNotaFiscal = false);

    /// <summary>Cancela a comanda sem cobrança.</summary>
    Task<ComandaDto> CancelComandaAsync(Guid comandaId, Guid adminId);

    /// <summary>Desfaz uma comanda já fechada: estoque volta, pontos voltam, crediário baixa
    /// e o valor sai do faturamento. A comanda fica como Estornada, com motivo.</summary>
    Task<ComandaDto> EstornarComandaFechadaAsync(Guid comandaId, Guid adminId, string motivo);

    /// <summary>Lista todas as comandas abertas/em andamento para o dashboard do Admin.</summary>
    Task<IEnumerable<ComandaDto>> GetActiveCommandasForDashboardAsync();

    /// <summary>Lista comandas fechadas e canceladas do dia especificado (padrão: hoje).</summary>
    Task<IEnumerable<ComandaDto>> GetTodayHistoryAsync(DateTime? data = null);

    /// <summary>Atualiza a quantidade de um item. Quantity=0 remove o item.</summary>
    Task<ComandaDto> UpdateItemAsync(Guid comandaId, Guid itemId, int newQuantity, Guid adminId);

    /// <summary>Aplica pontos do cliente à comanda, abatendo do total a pagar.</summary>
    Task<ComandaDto> ApplyPointsAsync(Guid comandaId, Guid userId, int points);

    /// <summary>
    /// Remove os pontos aplicados à comanda, devolvendo-os ao saldo do cliente.
    /// Pode ser chamado pelo próprio cliente ou por um Admin.
    /// </summary>
    Task<ComandaDto> RemovePointsAsync(Guid comandaId, Guid requestingUserId);

    /// <summary>Retorna as últimas comandas fechadas/canceladas do próprio usuário autenticado.</summary>
    Task<IEnumerable<ComandaDto>> GetUserHistoryAsync(Guid userId, int limit = 20);

    /// <summary>Edita uma comanda fechada (Admin only): pagamento, itens, desconto, cliente.</summary>
    Task<ComandaDto> EditarComandaFechadaAsync(Guid comandaId, Guid adminId, EditarComandaRequest request);
}
