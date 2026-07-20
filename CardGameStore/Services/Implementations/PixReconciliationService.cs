// =============================================================================
// PixReconciliationService.cs — Baixa centralizada de cobranças Pix pagas.
// Sem webhook do Inter, quem confirma o pagamento é esta reconciliação — antes
// a lógica vivia duplicada nos controllers (só rodava com alguém de tela aberta).
// Hoje controllers e robô passam pelo MESMO caminho pra não divergir.
//
// Idempotência em duas camadas:
//   1. Claim atômico no banco (UPDATE ... WHERE pago_em IS NULL): reconciliações
//      concorrentes (robô × botão "verificar" × GET de status) — só UMA ganha o
//      direito de aplicar os efeitos; as demais retornam o estado já baixado.
//   2. Índice único ix_ext_tx_source_external_id em external_transactions:
//      última linha de defesa contra lançamento financeiro duplicado por txid.
// =============================================================================

using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class PixReconciliationService : IPixReconciliationService
{
    private readonly AppDbContext     _db;
    private readonly InterSyncService _inter;
    private readonly IComandaService  _comanda;
    private readonly IEmailService    _email;
    private readonly ILogger<PixReconciliationService> _logger;

    public PixReconciliationService(
        AppDbContext db, InterSyncService inter, IComandaService comanda,
        IEmailService email, ILogger<PixReconciliationService> logger)
    {
        _db      = db;
        _inter   = inter;
        _comanda = comanda;
        _email   = email;
        _logger  = logger;
    }

    public async Task<PixReconciliationResult> ReconciliarAsync(PixCobranca pix, Guid? adminId = null)
    {
        // PagoEm preenchido = esta cobrança já foi baixada (tela ou robô) — não repete.
        if (pix.PagoEm is not null)
            return new PixReconciliationResult { Status = pix.Status, PagoEm = pix.PagoEm };

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null)
            return new PixReconciliationResult { Status = pix.Status, Error = "Integração com o Inter não configurada." };

        // Consulta HTTP ao Inter fica FORA da transação (lenta, sem necessidade de lock).
        var consulta = await _inter.ConsultarCobrancaAsync(cfg, pix.TxId);
        if (consulta.Error is not null)
            return new PixReconciliationResult { Status = pix.Status, Error = consulta.Error };

        pix.Status = consulta.Status ?? pix.Status;
        if (pix.Status != "CONCLUIDA")
        {
            await _db.SaveChangesAsync();
            return new PixReconciliationResult { Status = pix.Status };
        }

        ComandaDto? comandaFechada = null;
        var baixaEfetuada = false;

        // Transação manual precisa rodar dentro da execution strategy
        // (EnableRetryOnFailure do Npgsql rejeita transação solta).
        var strategy = _db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();

            // ── CLAIM ATÔMICO ────────────────────────────────────────────────
            // Só um executor (robô, botão "verificar" ou GET de status) consegue
            // gravar PagoEm; quem perde a corrida aborta aqui e devolve o estado
            // já baixado — sem duplicar fechamento de comanda, pagamento de
            // crediário, inscrição ou lançamento financeiro.
            var agora = DateTime.UtcNow;
            var claimed = await _db.PixCobrancas
                .Where(p => p.Id == pix.Id && p.PagoEm == null)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.PagoEm, agora));

            if (claimed == 0)
            {
                await tx.RollbackAsync();
                return;
            }

            baixaEfetuada = true;
            pix.PagoEm = agora; // espelha no objeto rastreado (ExecuteUpdate não toca o tracker)
            // Quem assina a baixa: o admin que disparou pela tela ou, no robô, quem gerou a cobrança.
            var adminEfetivo = adminId ?? pix.CriadoPorAdminId;

            switch (pix.Origem)
            {
                case PixCobrancaOrigem.Comanda:
                    comandaFechada = await BaixarComandaAsync(pix, adminEfetivo);
                    break;
                case PixCobrancaOrigem.Crediario:
                    await BaixarCrediarioAsync(pix, adminEfetivo);
                    break;
                case PixCobrancaOrigem.Campeonato:
                    await BaixarCampeonatoAsync(pix);
                    break;
                case PixCobrancaOrigem.Reserva:
                    await BaixarReservaAsync(pix);
                    break;
                // VendaAvulsa existe no enum mas nenhum fluxo gera cobrança com ela — nada a baixar.
                case PixCobrancaOrigem.VendaAvulsa:
                    _logger.LogInformation("Cobrança Pix {TxId} de VendaAvulsa paga — origem sem baixa automatizada, ignorando.", pix.TxId);
                    break;
            }

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        if (!baixaEfetuada)
        {
            // Outro fluxo ganhou o claim — relê pra devolver o estado real gravado por ele.
            await _db.Entry(pix).ReloadAsync();
            return new PixReconciliationResult { Status = pix.Status, PagoEm = pix.PagoEm };
        }

        _logger.LogInformation("Cobrança Pix {TxId} ({Origem}) paga — baixa efetuada.", pix.TxId, pix.Origem);
        return new PixReconciliationResult
        {
            Status          = pix.Status,
            PagoEm          = pix.PagoEm,
            BaixaEfetuada   = true,
            ComandaFechada  = comandaFechada,
        };
    }

    // ── Comanda: paga → fecha como "Pix" ──────────────────────────────────────
    private async Task<ComandaDto?> BaixarComandaAsync(PixCobranca pix, Guid fechadoPor)
    {
        if (pix.ComandaId is null) return null;

        // Guarda extra (o claim do PagoEm já impede execução concorrente): se a
        // comanda foi fechada por outro caminho (dinheiro no balcão) enquanto a
        // cobrança estava ativa, não reabre nem duplica pontos/notificações.
        var status = await _db.Comandas
            .Where(c => c.Id == pix.ComandaId)
            .Select(c => (ComandaStatus?)c.Status)
            .FirstOrDefaultAsync();

        if (status is null or ComandaStatus.Fechada or ComandaStatus.Cancelada) return null;

        try
        {
            return await _comanda.CloseComandaAsync(pix.ComandaId.Value, fechadoPor, "Pix");
        }
        catch (InvalidOperationException)
        {
            // Comanda fechada por outro caminho enquanto a cobrança estava ativa — ignora.
            return null;
        }
    }

    // ── Crediário: paga → registra PagamentoCrediario e quita se zerou ────────
    private async Task BaixarCrediarioAsync(PixCobranca pix, Guid adminId)
    {
        var crediario = await _db.Crediarios
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == pix.CrediarioId);

        if (crediario is null || crediario.Status == CrediariosStatus.Pago) return;

        var valorPagar = Math.Min(pix.ValorEmCentavos, crediario.SaldoRestanteEmCentavos);

        _db.PagamentosCrediario.Add(new PagamentoCrediario
        {
            CrediarioId     = crediario.Id,
            ValorEmCentavos = valorPagar,
            FormaPagamento  = "Pix",
            Observacao      = $"Cobrança Pix automática (txid {pix.TxId})",
            AdminId         = adminId,
        });
        crediario.ValorPagoEmCentavos += valorPagar;

        // Quita automaticamente se saldo chegou a zero (tolerância de 1 centavo para arredondamentos)
        if (crediario.SaldoRestanteEmCentavos <= 1)
        {
            crediario.Status         = CrediariosStatus.Pago;
            crediario.DataPagamento  = DateTime.UtcNow;
            crediario.PagoPorAdminId = adminId;

            if (!string.IsNullOrWhiteSpace(crediario.User?.Email))
                _ = _email.SendCrediarioPagoAsync(
                    crediario.User.Email, crediario.User.Name, crediario.ValorEmReais);
        }

        _logger.LogInformation(
            "Cobrança Pix {TxId} confirmada — pagamento de R$ {Valor:N2} registrado no crediário {CrediarioId}",
            pix.TxId, valorPagar / 100m, crediario.Id);
    }

    // ── Campeonato: paga → marca a inscrição como paga (Pix) ──────────────────
    private async Task BaixarCampeonatoAsync(PixCobranca pix)
    {
        var participant = await _db.ChampionshipParticipants
            .FirstOrDefaultAsync(p => p.Id == pix.ChampionshipParticipantId);

        if (participant is null || participant.EntryFeePaidAt is not null) return;

        participant.EntryFeePaidAt        = DateTime.UtcNow;
        participant.EntryFeePaymentMethod = "Pix";
        _logger.LogInformation("Inscrição {ParticipantId} paga via Pix (tx {TxId}).", participant.Id, pix.TxId);
    }

    // ── Reserva: paga → quita SÓ os itens do snapshot da cobrança ─────────────
    // A cobrança guarda (ReservationItemIdsJson) os IDs das pré-vendas somadas no
    // valor no momento da geração. Isso evita dois desvios:
    //   • item que ENTROU no grupo depois (fila legada convertida em pré-venda)
    //     não sai "pago de graça" — segue aguardando pagamento;
    //   • item CANCELADO depois da geração não é baixado — é contado e sinalizado
    //     no lançamento financeiro (o valor cobrado incluía esse item).
    // Cobranças antigas (sem snapshot, null) caem no comportamento legado: quitar
    // o grupo inteiro — é o que a tela/robô já faziam antes desta vinculação.
    private async Task BaixarReservaAsync(PixCobranca pix)
    {
        if (pix.ReservationGroupId is null) return;
        var groupId = pix.ReservationGroupId.Value;

        HashSet<Guid>? snapshot = null;
        if (!string.IsNullOrWhiteSpace(pix.ReservationItemIdsJson))
        {
            try
            {
                snapshot = JsonSerializer.Deserialize<List<Guid>>(pix.ReservationItemIdsJson!)?.ToHashSet();
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Snapshot de itens inválido na cobrança {TxId} — caindo no modo legado (grupo inteiro).", pix.TxId);
            }
        }

        // Quita as pré-vendas ativas do grupo que estão no snapshot (ou todas, no legado):
        // ExpiresAt vira null (deixa de marcar "ainda não paga") e PaymentMethod vira "pix".
        var itens = await _db.ProductReservations
            .Where(r => r.ReservationGroupId == groupId && r.Kind == "pre_venda" && r.Status == "active")
            .ToListAsync();
        foreach (var r in itens)
        {
            if (snapshot is not null && !snapshot.Contains(r.Id)) continue;
            r.ExpiresAt     = null;
            r.PaymentMethod = "pix";
        }

        // Itens do snapshot cancelados entre a geração e o pagamento: o cliente pagou
        // por eles mesmo assim — fica sinalizado no lançamento financeiro e no log.
        var canceladosCobrados = 0;
        if (snapshot is { Count: > 0 })
        {
            canceladosCobrados = await _db.ProductReservations
                .CountAsync(r => snapshot.Contains(r.Id) && r.Status == "cancelled");
            if (canceladosCobrados > 0)
                _logger.LogWarning(
                    "Cobrança Pix {TxId} paga com {N} item(ns) cancelado(s) após a geração (grupo {GroupId}) — valor cobrado inclui itens cancelados; tratar estorno manualmente.",
                    pix.TxId, canceladosCobrados, groupId);
        }

        // Lançamento financeiro deduplicado pelo txid (AnyAsync + índice único
        // ix_ext_tx_source_external_id como segunda barreira).
        var jaLancado = await _db.ExternalTransactions
            .AnyAsync(x => x.Source == "inter" && x.ExternalId == pix.TxId);
        if (!jaLancado)
        {
            var notas = $"Pagamento via Pix da pré-venda {groupId}";
            if (canceladosCobrados > 0)
                notas += $" — ATENÇÃO: {canceladosCobrados} item(ns) cancelado(s) após a geração foram cobrados mesmo assim (verificar estorno).";

            _db.ExternalTransactions.Add(new ExternalTransaction
            {
                Source      = "inter",
                ExternalId  = pix.TxId,
                Type        = "income",
                Amount      = pix.ValorEmCentavos / 100m,
                Description = $"Pix Pré-venda Grupo {groupId.ToString().Substring(0, 8)}",
                DueDate     = pix.ExpiraEm,
                PaidAt      = pix.PagoEm,
                Status      = "paid",
                Notes       = notas,
            });
        }
    }
}
