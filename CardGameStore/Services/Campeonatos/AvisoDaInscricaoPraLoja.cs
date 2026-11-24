// =============================================================================
// AvisoDaInscricaoPraLoja.cs — a loja fica sabendo de inscrição nova (v1.100.0, chave "aviso-inscricao-loja").
//
// Até aqui o Maikon só descobria quem entrou no campeonato abrindo a lista de participantes. Agora,
// quando a vaga fica GARANTIDA pelo próprio jogador, os admins e os operadores com a permissão
// Campeonatos recebem no sininho e no celular:
//   • "Inscrição nova: Ana"  — campeonato grátis, inscrição feita pelo site;
//   • "Inscrição paga: Ana"  — o Pix da inscrição caiu (vale também pra cobrança feita pela loja).
// Vaga só segurada esperando Pix não avisa: muitas vencem sem pagar e virariam barulho.
// Quem a loja inscreveu num grátis também não avisa: foi a própria loja que fez.
// Cada tipo pode ser ignorado no sininho ("Ignorar este tipo"), como os outros avisos da equipe.
// Melhor-esforço: aviso que falha só vira log, nunca desfaz inscrição nem pagamento.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Campeonatos;

public static class AvisoDaInscricaoPraLoja
{
    /// <summary>Campeonatos no painel, com o card desse aberto nos participantes (a página lê ?abrir=).</summary>
    public static string Link(Guid championshipId) => $"/admin/campeonatos?abrir={championshipId}";

    public static async Task<bool> LigadoAsync(AppDbContext db)
    {
        var mudada = await db.FuncionalidadesEstado.AsNoTracking()
            .Where(f => f.Codigo == Funcionalidades.AvisoInscricaoLoja)
            .Select(f => (bool?)f.Ligada)
            .FirstOrDefaultAsync();
        return mudada ?? Funcionalidades.Buscar(Funcionalidades.AvisoInscricaoLoja)!.Padrao;
    }

    /// <summary>"8 de 16 vagas" (ou "8 inscritos" sem limite), contando só vaga em pé.</summary>
    public static string Vagas(int ocupadas, int? limite) =>
        limite is int max ? $"{ocupadas} de {max} vagas" : ocupadas == 1 ? "1 inscrito" : $"{ocupadas} inscritos";

    /// <summary>
    /// Avisa a equipe que a vaga do participante ficou garantida. <paramref name="valorPagoEmCentavos"/>
    /// null = inscrição grátis; com valor = Pix pago.
    /// </summary>
    public static async Task AvisarAsync(AppDbContext db, IPushService push, ILogger logger,
        Guid participantId, int? valorPagoEmCentavos)
    {
        try
        {
            if (!await LigadoAsync(db)) return;
            var p = await db.ChampionshipParticipants.AsNoTracking()
                .Where(x => x.Id == participantId)
                .Select(x => new { x.PlayerNumber, x.ChampionshipId, Jogador = x.User.Name, Campeonato = x.Championship.Name, x.Championship.MaxParticipants })
                .FirstOrDefaultAsync();
            if (p is null) return;

            var equipe = await EquipeDaLoja.QuemRecebeAsync(db, Permissao.Campeonatos);
            if (equipe.Count == 0) return;

            // Vaga em pé = pagou ou o prazo pra pagar não venceu (Championship.VagaVale), contada no banco
            var agora    = DateTime.UtcNow;
            var ocupadas = await db.ChampionshipParticipants.AsNoTracking()
                .CountAsync(x => x.ChampionshipId == p.ChampionshipId &&
                                 (x.EntryFeePaidAt != null || x.InscricaoExpiraEm == null || x.InscricaoExpiraEm > agora));

            var quem   = string.IsNullOrWhiteSpace(p.Jogador) ? "Um jogador" : p.Jogador;
            var vagas  = Vagas(ocupadas, p.MaxParticipants);
            var pago   = valorPagoEmCentavos is > 0;
            var titulo = pago ? $"Inscrição paga: {quem}" : $"Inscrição nova: {quem}";
            var corpo  = pago
                ? $"{quem} pagou a inscrição no {p.Campeonato} ({Dinheiro.Brl(valorPagoEmCentavos!.Value / 100m)} no Pix). Jogador #{p.PlayerNumber} — {vagas}."
                : $"{quem} se inscreveu no {p.Campeonato} pelo site. Jogador #{p.PlayerNumber} — {vagas}.";
            var link   = Link(p.ChampionshipId);

            EquipeDaLoja.Avisar(db, equipe, titulo, corpo, link);
            await db.SaveChangesAsync();
            await push.SendToManyAsync(EquipeDaLoja.QuemOuve(equipe, titulo).Select(m => m.Id), titulo, corpo, link);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Aviso de inscrição {ParticipantId} não saiu pra loja.", participantId);
        }
    }
}
