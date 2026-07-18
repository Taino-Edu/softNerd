// =============================================================================
// PixReconciliationService.cs — Baixa centralizada de cobranças Pix pagas.
// Sem webhook do Inter, quem confirma o pagamento é esta reconciliação — antes
// a lógica vivia duplicada nos controllers (só rodava com alguém de tela aberta,
// e pré-venda paga chegava a expirar). Hoje controllers, robô e verificação
// final da expiração passam pelo MESMO caminho pra não divergir.
// Idempotente: PagoEm preenchido = baixa já feita, não repete efeitos.
// =============================================================================

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
        // PagoEm preenchido = esta cobrança já foi baixada (tela, robô ou expiração) — não repete.
        if (pix.PagoEm is not null)
            return new PixReconciliationResult { Status = pix.Status, PagoEm = pix.PagoEm };

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null)
            return new PixReconciliationResult { Status = pix.Status, Error = "Integração com o Inter não configurada." };

        var consulta = await _inter.ConsultarCobrancaAsync(cfg, pix.TxId);
        if (consulta.Error is not null)
            return new PixReconciliationResult { Status = pix.Status, Error = consulta.Error };

        pix.Status = consulta.Status ?? pix.Status;
        if (pix.Status != "CONCLUIDA")
        {
            await _db.SaveChangesAsync();
            return new PixReconciliationResult { Status = pix.Status };
        }

        pix.PagoEm = DateTime.UtcNow;
        // Quem assina a baixa: o admin que disparou pela tela ou, no robô, quem gerou a cobrança.
        var adminEfetivo = adminId ?? pix.CriadoPorAdminId;

        ComandaDto? comandaFechada = null;
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

        // Guarda de idempotência: CloseComandaAsync não valida status — fechar de novo
        // duplicaria pontos de fidelidade e notificações.
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

    // ── Reserva: paga → pré-venda vira venda feita (não expira mais) ──────────
    private async Task BaixarReservaAsync(PixCobranca pix)
    {
        if (pix.ReservationGroupId is null) return;
        var groupId = pix.ReservationGroupId.Value;

        // Pré-venda paga não expira: limpa o prazo dos itens ativos do grupo.
        var itens = await _db.ProductReservations
            .Where(r => r.ReservationGroupId == groupId && r.Kind == "pre_venda" && r.Status == "active")
            .ToListAsync();
        foreach (var r in itens) r.ExpiresAt = null;

        // Lançamento financeiro deduplicado pelo txid — o robô e a tela podem
        // confirmar a mesma cobrança quase ao mesmo tempo.
        var jaLancado = await _db.ExternalTransactions
            .AnyAsync(x => x.Source == "inter" && x.ExternalId == pix.TxId);
        if (!jaLancado)
        {
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
                Notes       = $"Pagamento via Pix da pré-venda {groupId}",
            });
        }
    }
}
