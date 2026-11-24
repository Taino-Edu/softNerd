// =============================================================================
// EmailDaInscricao.cs — e-mails da inscrição de campeonato (v1.98.0, chave "comprovante-inscricao").
//
// Comprovante: sai quando a vaga fica garantida (Pix pago ou campeonato grátis). Cobrança: sai quando a LOJA
// inscreve ou cobra o jogador (quem se inscreve pelo site já está com o Pix na tela) e leva só o botão que
// abre a conta no site — o código Pix nunca vai no e-mail, pra o cliente não se acostumar a pagar código que
// chega por e-mail (pedido do Taino, 24/11). O jogador desliga em Configurações (notifications.emailsInscricao).
// Melhor-esforço: e-mail que falha só vira log, nunca desfaz inscrição nem pagamento.
// =============================================================================

using System.Text.Json;
using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Campeonatos;

public static class EmailDaInscricao
{
    /// <summary>Meus Campeonatos fica na página inicial da conta do cliente.</summary>
    public const string LinkDaConta = "/cliente";

    /// <summary>Abre a conta já com o Pix da inscrição na tela (app/cliente/page.tsx lê o parâmetro).</summary>
    public static string LinkPagar(Guid championshipId) => $"/cliente?pagarInscricao={championshipId}";

    /// <summary>Código curto mostrado no comprovante (o mesmo da tela: 8 primeiros hexadecimais do id).</summary>
    public static string Codigo(Guid participantId) => participantId.ToString("N")[..8].ToUpperInvariant();

    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static async Task<bool> LigadoAsync(AppDbContext db)
    {
        var mudada = await db.FuncionalidadesEstado.AsNoTracking()
            .Where(f => f.Codigo == Funcionalidades.ComprovanteInscricao)
            .Select(f => (bool?)f.Ligada)
            .FirstOrDefaultAsync();
        return mudada ?? Funcionalidades.Buscar(Funcionalidades.ComprovanteInscricao)!.Padrao;
    }

    /// <summary>Preferência do cliente (Configurações). Sem preferência gravada ou JSON estranho = aceita.</summary>
    public static bool AceitaEmails(string? preferencesJson)
    {
        if (string.IsNullOrWhiteSpace(preferencesJson)) return true;
        try { return JsonSerializer.Deserialize<UserPreferencesDto>(preferencesJson, Json)?.Notifications.EmailsInscricao ?? true; }
        catch (JsonException) { return true; }
    }

    private static async Task<(string Email, string Nome)?> DestinoAsync(AppDbContext db, Guid userId)
    {
        var u = await db.Users.AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new { x.Email, x.Name, x.PreferencesJson, x.DeletedAt })
            .FirstOrDefaultAsync();
        if (u is null || u.DeletedAt is not null || string.IsNullOrWhiteSpace(u.Email) || !AceitaEmails(u.PreferencesJson))
            return null;
        return (u.Email!, u.Name);
    }

    private static async Task<string> LojaAsync(AppDbContext db)
    {
        var nome = await db.SiteConfigs.AsNoTracking().Select(s => s.SiteName).FirstOrDefaultAsync();
        return string.IsNullOrWhiteSpace(nome) ? "Santuário Nerd" : nome;
    }

    /// <summary>Data e hora no calendário de Brasília (o servidor roda em UTC).</summary>
    public static string DataHora(DateTime utc) => Brasilia.ParaBrasilia(utc).ToString("dd/MM/yyyy 'às' HH:mm");

    /// <summary>Comprovante da vaga garantida. Vaga ainda segurada esperando Pix não tem comprovante.</summary>
    public static async Task EnviarComprovanteAsync(AppDbContext db, IEmailService? email, ILogger logger, Guid participantId)
    {
        if (email is null) return;
        try
        {
            if (!await LigadoAsync(db)) return;
            var p = await db.ChampionshipParticipants.AsNoTracking()
                .Include(x => x.Championship)
                .FirstOrDefaultAsync(x => x.Id == participantId);
            if (p?.Championship is null || p.InscricaoExpiraEm is not null) return;
            if (await DestinoAsync(db, p.UserId) is not { } destino) return;

            var ch   = p.Championship;
            var pago = p.EntryFeePaidAt is not null;
            var comprovante = new ComprovanteInscricaoEmail(
                Loja:             await LojaAsync(db),
                Jogador:          destino.Nome,
                Campeonato:       ch.Name,
                Jogo:             ch.Game,
                DataDoCampeonato: DataHora(ch.StartDate),
                NumeroDoJogador:  p.PlayerNumber,
                Valor:            ch.EntryFeeInCents > 0 ? Dinheiro.Brl(ch.EntryFeeInCents / 100m) : null,
                FormaDePagamento: ch.EntryFeeInCents <= 0 ? null : pago ? p.EntryFeePaymentMethod ?? "Pix" : "pagamento pendente",
                PagoEm:           pago ? DataHora(p.EntryFeePaidAt!.Value) : null,
                Codigo:           Codigo(p.Id),
                Link:             LinkDaConta);
            await email.SendComprovanteInscricaoAsync(destino.Email, comprovante);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Comprovante da inscrição {ParticipantId} não saiu por e-mail.", participantId);
        }
    }

    /// <summary>Cobrança feita pela loja: o botão abre a conta com o Pix na tela. Sem o código Pix no e-mail.</summary>
    public static async Task EnviarCobrancaAsync(AppDbContext db, IEmailService? email, ILogger logger,
        ChampionshipParticipant participante, int valorEmCentavos)
    {
        if (email is null) return;
        try
        {
            if (!await LigadoAsync(db)) return;
            if (await DestinoAsync(db, participante.UserId) is not { } destino) return;
            var ch = participante.Championship;
            var cobranca = new CobrancaInscricaoEmail(
                Loja:        await LojaAsync(db),
                Jogador:     destino.Nome,
                Campeonato:  ch.Name,
                Valor:       Dinheiro.Brl(valorEmCentavos / 100m),
                PrazoDaVaga: participante.InscricaoExpiraEm is { } prazo ? DataHora(prazo) : null,
                Link:        LinkPagar(ch.Id));
            await email.SendCobrancaInscricaoAsync(destino.Email, cobranca);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Cobrança da inscrição {ParticipantId} não saiu por e-mail.", participante.Id);
        }
    }
}
