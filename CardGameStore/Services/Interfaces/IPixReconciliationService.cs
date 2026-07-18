// =============================================================================
// IPixReconciliationService.cs — Reconciliação de cobranças Pix (consulta ao
// Inter + baixa por origem). Caminho único usado pelos controllers (polling de
// tela), pelo robô (PixReconciliationBackgroundService) e pela verificação
// final da expiração de pré-vendas — não existe webhook do Inter.
// =============================================================================

using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.Services.Interfaces;

public interface IPixReconciliationService
{
    /// <summary>
    /// Consulta o status da cobrança no Inter e, se CONCLUIDA, executa a baixa
    /// conforme a origem: fecha a comanda, registra pagamento no crediário,
    /// marca a inscrição de campeonato como paga ou limpa a expiração da
    /// pré-venda. Idempotente: cobrança já com PagoEm não repete efeitos.
    /// </summary>
    /// <param name="pix">Cobrança a reconciliar (entidade rastreada pelo DbContext do escopo atual).</param>
    /// <param name="adminId">Admin que disparou a verificação pela tela; null no robô → usa o CriadoPorAdminId da cobrança.</param>
    Task<PixReconciliationResult> ReconciliarAsync(PixCobranca pix, Guid? adminId = null);
}

public record PixReconciliationResult
{
    /// <summary>Status atual da cobrança (ATIVA, CONCLUIDA, REMOVIDA_*...).</summary>
    public string Status { get; init; } = "ATIVA";

    public DateTime? PagoEm { get; init; }

    /// <summary>True quando ESTA chamada executou a baixa (false se já estava baixada ou não paga).</summary>
    public bool BaixaEfetuada { get; init; }

    /// <summary>Preenchido quando a consulta ao Inter falhou — cobrança fica pra próxima tentativa.</summary>
    public string? Error { get; init; }

    /// <summary>Comanda fechada pela baixa (só origem Comanda), pra tela atualizar na hora.</summary>
    public ComandaDto? ComandaFechada { get; init; }
}
