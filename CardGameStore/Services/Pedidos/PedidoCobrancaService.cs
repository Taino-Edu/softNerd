// =============================================================================
// PedidoCobrancaService.cs — Pix dos pedidos do site: gerar, conferir, cancelar
// e derrubar a cobrança antes de mudar o pedido (cancelar ou somar itens).
// Mesmo padrão da inscrição de campeonato: cobrança + verificação sob demanda,
// sem webhook. Pago = ExpiresAt dos itens vira null (venda feita, aguarda retirada).
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Services.Pedidos;

public interface IPedidoCobrancaService
{
    /// <summary>Gera (ou reaproveita) o Pix do total das pré-vendas do pedido.</summary>
    Task<PixPedidoGeradoDto> GerarAsync(Guid groupId, Ator ator);

    /// <summary>Confere no Inter se o Pix caiu; se sim, dá a baixa no pedido.</summary>
    Task<PixPedidoVerificadoDto> VerificarAsync(Guid groupId, Ator ator);

    /// <summary>Cancela o Pix aberto do pedido (admin), conferindo antes se não foi pago.</summary>
    Task CancelarAsync(Guid groupId);

    /// <summary>Último Pix do pedido (confere no Inter se ainda está aberto).</summary>
    Task<PixPedidoStatusDto> StatusAsync(Guid groupId, Ator ator);

    /// <summary>Pedido não pago com Pix aberto: derruba a cobrança antes de cancelar o pedido.</summary>
    Task DerrubarAntesDeCancelarAsync(ProductReservation res);

    /// <summary>Derruba os Pix ativos do pedido antes de somar itens. false = não deu, não soma.</summary>
    Task<bool> DerrubarParaJuntarAsync(Guid groupId);
}

public class PedidoCobrancaService(
    AppDbContext db, IReservationPixService reservationPix, IPixReconciliationService reconciliacao,
    InterSyncService inter, IAuditService audit, ILogger<PedidoCobrancaService> logger,
    IMemoryCache? cache = null) : IPedidoCobrancaService
{
    public async Task<PixPedidoGeradoDto> GerarAsync(Guid groupId, Ator ator)
    {
        if (await DoAtorAsync(groupId, ator)) await DerrubarVencendoAsync(groupId);

        var result = await reservationPix.GerarAsync(groupId, ator.Id, podeGerarParaTerceiros: ator.EhAdmin);
        if (!result.Success || result.Pix is null)
            throw new PedidoException(result.Error, result.StatusCode);

        var pix = result.Pix;
        return new PixPedidoGeradoDto(pix.TxId, pix.Status, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm,
            pix.ValorEmReais, result.Reused);
    }

    public async Task<PixPedidoVerificadoDto> VerificarAsync(Guid groupId, Ator ator)
    {
        if (!await DoAtorAsync(groupId, ator)) throw new PedidoException("Reserva não encontrada.", 404);

        var pix = await PixAtivoAsync(groupId)
            ?? throw new PedidoException("Nenhuma cobrança Pix ativa para esta reserva.", 404);

        // A baixa mora no PixReconciliationService — mesmo caminho do robô
        var result = await reconciliacao.ReconciliarAsync(pix);
        if (result.Error is not null) throw new PedidoException(result.Error, 422);

        return new PixPedidoVerificadoDto(pix.Status, pix.PagoEm);
    }

    /// <summary>
    /// Existe porque a mensagem de bloqueio da edição de quantidade mandava "cancele o Pix antes"
    /// sem que houvesse caminho pra isso — o caso real é o cliente pagar na chave normal da loja,
    /// deixando uma cobrança órfã que o Inter nunca vai confirmar.
    /// </summary>
    public async Task CancelarAsync(Guid groupId)
    {
        var pix = await PixAtivoAsync(groupId)
            ?? throw new PedidoException("Nenhuma cobrança Pix aberta para esta reserva.", 404);

        // Antes de cancelar, confere no Inter: se o cliente acabou de pagar POR ESTA cobrança,
        // cancelar apagaria a única pista do pagamento. Confere também a vencida (paga pouco antes
        // de vencer, ainda não conciliada); se o Inter não responder, a vencida segue encerrando só aqui.
        var jaVenceu = pix.ExpiraEm is not null && pix.ExpiraEm <= DateTime.UtcNow;
        var conferida = await reconciliacao.ReconciliarAsync(pix);
        if (conferida.PagoEm is not null || pix.Status == "CONCLUIDA")
            throw new PedidoException("Esta cobrança acabou de ser paga pelo cliente e foi baixada agora — recarregue a tela.", 409);

        var removida = await RemoverNoInterAsync(pix);

        // Vencida não é mais pagável: dá pra encerrar localmente mesmo se o Inter não responder.
        // No prazo, recusar é obrigatório — encerrar só aqui deixaria o QR de pé, aceitando um
        // pagamento que ninguém concilia.
        if (removida.Error is not null && !jaVenceu)
            throw new PedidoException($"Não deu pra cancelar a cobrança no Inter: {removida.Error}", 502);

        await EncerrarAsync(pix, removida, jaVenceu,
            $"{{\"groupId\":\"{groupId}\",\"txid\":\"{pix.TxId}\",\"vencida\":{jaVenceu.ToString().ToLowerInvariant()}}}");
    }

    public async Task<PixPedidoStatusDto> StatusAsync(Guid groupId, Ator ator)
    {
        if (!await DoAtorAsync(groupId, ator)) throw new PedidoException(null, 404);

        var pix = await db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva)
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (pix is null) return new PixPedidoStatusDto(HasPix: false);

        // Falha na consulta ao Inter não derruba a consulta — fica o último status conhecido
        if (pix.Status == "ATIVA" && DeveConferirNoInter(pix)) await reconciliacao.ReconciliarAsync(pix);

        return new PixPedidoStatusDto(true, pix.Status, pix.PagoEm, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais);
    }

    /// <summary>
    /// Sem isso o QR continua pagável e o dinheiro cai num pedido cancelado (o estoque já voltou
    /// pra prateleira e nada vira venda).
    /// </summary>
    public async Task DerrubarAntesDeCancelarAsync(ProductReservation res)
    {
        if (res.Kind != "pre_venda" || res.Status != "active" || res.ExpiresAt is null) return;

        var pix = await PixAtivoAsync(res.ReservationGroupId);
        if (pix is null) return;

        await DerrubarAsync(pix,
            pagaAgora: "O Pix deste pedido acabou de ser pago — ele está pago agora e não foi cancelado. Recarregue a tela.",
            interRecusou: "Não deu pra cancelar o Pix no banco agora, então o pedido não foi cancelado (o cliente ainda conseguiria pagar). Tente de novo em instantes.",
            motivo: "pedido cancelado");
    }

    /// <summary>
    /// A tela de pedidos pede o status de cada pedido ao abrir, e cada um ia ao Inter: com muitos Pix
    /// abertos a tela esperava segundos. Vencido não é mais pagável (o banco recusa o QR) — o robô da
    /// reconciliação confere os das últimas 24 h a cada 5 min. No prazo, no máximo uma consulta a cada
    /// 30 s por cobrança; nas outras vale o status gravado.
    /// </summary>
    private bool DeveConferirNoInter(PixCobranca pix)
    {
        if (pix.ExpiraEm is { } expira && expira <= DateTime.UtcNow) return false;
        if (cache is null) return true;
        var chave = $"pix-status-inter:{pix.TxId}";
        if (cache.TryGetValue(chave, out _)) return false;
        cache.Set(chave, true, TimeSpan.FromSeconds(30));
        return true;
    }

    public async Task<bool> DerrubarParaJuntarAsync(Guid groupId)
    {
        var ativos = await db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Status == "ATIVA")
            .ToListAsync();
        foreach (var pix in ativos)
        {
            try
            {
                await DerrubarAsync(pix,
                    pagaAgora: "O Pix do pedido anterior acabou de ser pago.",
                    interRecusou: "Não deu pra trocar o Pix do pedido anterior agora.",
                    motivo: "itens novos somados ao pedido");
            }
            catch (PedidoException)
            {
                logger.LogInformation("Pedido {Grupo} não recebeu os itens novos: o Pix dele não pôde ser derrubado.", groupId);
                return false;
            }
        }
        return true;
    }

    /// <summary>
    /// O Pix novo só sai depois de derrubar o vencido ou quase vencido (menos de 5 min): o que
    /// vence em 3 min ainda é pagável, e um vencido pode ter sido pago no fim do prazo sem o robô
    /// ter visto — trocar sem conferir deixava dois QRs pagáveis no mesmo pedido (Codex no PR #125).
    /// Pago agora → 409; sem conseguir conferir ou derrubar um ainda no prazo → 502, sem Pix novo.
    /// </summary>
    private async Task DerrubarVencendoAsync(Guid groupId)
    {
        using var trava = await ReservationPixService.TravarPedidoAsync(groupId);
        var limite = DateTime.UtcNow.Add(ReservationPixService.FolgaMinima);
        var vencendo = await db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva
                     && p.Status == "ATIVA" && p.ExpiraEm != null && p.ExpiraEm <= limite)
            .ToListAsync();
        foreach (var pix in vencendo)
            await DerrubarAsync(pix,
                pagaAgora: "O Pix deste pedido acabou de ser pago — ele está pago agora. Recarregue a tela.",
                interRecusou: "Não deu pra trocar o Pix vencido agora. Tente de novo em instantes.",
                motivo: "Pix vencido trocado por um novo");
    }

    /// <summary>
    /// Encerra uma cobrança Pix de pedido no Inter. Antes confere se ela não acabou de ser paga
    /// (cancelar apagaria a única pista do pagamento). Vencida pode ser encerrada só aqui se o
    /// Inter não responder; no prazo, não — o QR ficaria de pé sem ninguém conciliar.
    /// </summary>
    private async Task DerrubarAsync(PixCobranca pix, string pagaAgora, string interRecusou, string motivo)
    {
        // Confere SEMPRE, mesmo vencida: Pix pago pouco antes de vencer e ainda não conciliado
        // (o robô roda a cada 5 min) seria marcado como removido e o robô nunca mais olharia pra
        // ele (só busca ATIVA) — o pagamento sumiria. Sem conseguir conferir, não cancela.
        var conferida = await reconciliacao.ReconciliarAsync(pix);
        if (conferida.PagoEm is not null || pix.Status == "CONCLUIDA")
            throw new PedidoException(pagaAgora, 409);
        if (conferida.Error is not null)
            throw new PedidoException($"{interRecusou} ({conferida.Error})", 502);

        var jaVenceu = pix.ExpiraEm is not null && pix.ExpiraEm <= DateTime.UtcNow;
        var removida = await RemoverNoInterAsync(pix);
        if (removida.Error is not null && !jaVenceu)
            throw new PedidoException($"{interRecusou} ({removida.Error})", 502);

        await EncerrarAsync(pix, removida, jaVenceu,
            $"{{\"groupId\":\"{pix.ReservationGroupId}\",\"txid\":\"{pix.TxId}\",\"vencida\":{jaVenceu.ToString().ToLowerInvariant()},\"motivo\":\"{motivo}\"}}");
    }

    private async Task<PixCobrancaResult> RemoverNoInterAsync(PixCobranca pix)
    {
        var cfg = await db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        return cfg is null
            ? new PixCobrancaResult { Error = "Integração com o Inter não configurada." }
            : await inter.RemoverCobrancaAsync(cfg, pix.TxId);
    }

    private async Task EncerrarAsync(PixCobranca pix, PixCobrancaResult removida, bool jaVenceu, string detalhes)
    {
        if (removida.Error is not null)
            logger.LogWarning("Cobrança {TxId} vencida encerrada localmente — o Inter recusou o PATCH: {Erro}",
                pix.TxId, removida.Error);

        pix.Status = "REMOVIDA_PELO_USUARIO_RECEBEDOR";
        await db.SaveChangesAsync();
        await audit.LogAsync("CancelouPixReserva", "PixCobranca", pix.Id.ToString(), details: detalhes);
    }

    private Task<PixCobranca?> PixAtivoAsync(Guid groupId) =>
        db.PixCobrancas
            .Where(p => p.ReservationGroupId == groupId && p.Origem == PixCobrancaOrigem.Reserva && p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();

    private Task<bool> DoAtorAsync(Guid groupId, Ator ator) =>
        db.ProductReservations.AnyAsync(r => r.ReservationGroupId == groupId && (ator.EhAdmin || r.UserId == ator.Id));
}
