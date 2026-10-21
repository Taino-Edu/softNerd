// =============================================================================
// VerificacoesRotina.cs — gatilhos de coisas que deviam ter acontecido sozinhas (Vigia)
// Crediário vencido sem aviso, rodada da liguinha parada depois do tempo e backup diário
// que não rodou. Cada classe responde UMA pergunta; a regra mora no serviço dela.
// =============================================================================

using System.Diagnostics;
using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Vigia;

/// <summary>
/// Marco de aviso configurado (ex.: -3, 0, 3 dias do vencimento) que já passou há 1 a 7 dias
/// sem lembrete entregue, com os avisos ligados: o robô do crediário devia ter avisado e não
/// avisou (ou tentou e nenhum canal entregou). Só os marcos da configuração contam.
/// </summary>
public class VerificacaoCrediarioSemAviso(AppDbContext db) : IVerificacaoVigia
{
    public const int JanelaDias = 7;
    public string Codigo => "crediario-sem-aviso";
    public string Nome => "Crediário sem lembrete ao cliente";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var config = await db.CrediarioAvisoConfigs.AsNoTracking().FirstOrDefaultAsync(ct);
        if (config is null || !config.Ativo) return []; // avisos desligados: não é falha
        var marcos = CrediarioAvisoService.LerMarcos(config.MarcosJson);
        if (marcos.Count == 0) return [];

        var hoje = CrediarioLancamentos.ParaBrasilia(DateTime.UtcNow).Date;
        // Vencimento mais antigo que ainda tem marco dentro da janela
        var desde = DateTime.UtcNow.AddDays(-(marcos.Max() + JanelaDias + 2));
        var abertas = await db.Crediarios.AsNoTracking().Include(c => c.User).Include(c => c.Avisos)
            .Where(c => c.Status == CrediariosStatus.Aberto && c.ValorEmCentavos > c.ValorPagoEmCentavos
                        && c.DataVencimento >= desde)
            .ToListAsync(ct);

        var achados = new List<Achado>();
        foreach (var c in abertas.Where(c => c.User is { IsActive: true }))
        {
            var dias = CrediarioAvisoService.DiasDoVencimento(c, hoje);
            var abertura = CrediarioLancamentos.ParaBrasilia(c.DataAbertura).Date;
            // Marcos cujo dia já terminou há 1 a 7 dias e em que a conta já existia
            var perdidos = marcos
                .Where(m => dias - m >= 1 && dias - m <= JanelaDias && hoje.AddDays(m - dias) >= abertura)
                .Where(m => !c.Avisos.Any(a => a.Marco == m && a.VencimentoReferencia == c.DataVencimento
                                              // Entregue em algum canal, ou pulado porque o cliente já tinha sido avisado no dia
                                              && (a.Canais.Length > 0 || (a.Falhas ?? "").StartsWith("pulado"))))
                .ToList();
            if (perdidos.Count == 0) continue;
            var m0 = perdidos.Max();
            achados.Add(new Achado($"{c.Id}:{c.DataVencimento:yyyyMMdd}:{m0}", VigiaGravidade.Aviso,
                $"Crediário sem lembrete: {c.User!.Name}",
                $"{VigiaPedidos.Reais(c.ValorEmCentavos - c.ValorPagoEmCentavos)} em aberto, vence(u) em {Brasilia.Formatar(c.DataVencimento)}. " +
                $"O lembrete de {Descrever(m0)} não chegou ao cliente (o robô não mandou ou nenhum canal entregou). " +
                "Confira o robô do crediário e avise o cliente.",
                "/admin/crediario"));
        }
        return achados;
    }

    static string Descrever(int marco) => marco switch
    {
        < 0 => $"{-marco} dia(s) antes do vencimento",
        0   => "dia do vencimento",
        _   => $"{marco} dia(s) de atraso",
    };
}

/// <summary>Rodada da liguinha cujo relógio acabou há mais de 30 min e ainda tem mesa sem resultado.</summary>
public class VerificacaoRodadaParada(AppDbContext db) : IVerificacaoVigia
{
    public static readonly TimeSpan Folga = TimeSpan.FromMinutes(30);
    public string Codigo => "rodada-parada";
    public string Nome => "Rodada da liguinha parada depois do tempo";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var agora = DateTime.UtcNow;
        var relogios = await db.Timers.AsNoTracking()
            .Where(t => t.ChampionshipId != null && t.Rodada != null && t.State == TimerState.Running && t.StartedAt != null)
            .Select(t => new { t.ChampionshipId, t.Rodada, t.StartedAt, t.DurationSeconds })
            .ToListAsync(ct);
        var acabados = relogios.Where(t => t.StartedAt!.Value.AddSeconds(t.DurationSeconds) + Folga < agora).ToList();
        if (acabados.Count == 0) return [];

        var ids = acabados.Select(t => t.ChampionshipId!.Value).ToList();
        var torneios = await db.Championships.AsNoTracking()
            .Where(c => ids.Contains(c.Id) && c.Status == ChampionshipStatus.EmAndamento)
            .Select(c => new { c.Id, c.Name, c.RodadaAtual })
            .ToDictionaryAsync(c => c.Id, ct);

        var achados = new List<Achado>();
        foreach (var t in acabados)
        {
            if (!torneios.TryGetValue(t.ChampionshipId!.Value, out var c) || c.RodadaAtual != t.Rodada) continue;
            var abertas = await db.TorneioPartidas
                .CountAsync(p => p.Rodada.ChampionshipId == c.Id && p.Rodada.Numero == c.RodadaAtual
                                 && p.ParticipanteBId != null && p.Resultado == null, ct);
            if (abertas == 0) continue;
            var fim = t.StartedAt!.Value.AddSeconds(t.DurationSeconds);
            achados.Add(new Achado($"{c.Id}:{c.RodadaAtual}", VigiaGravidade.Aviso,
                $"Rodada {c.RodadaAtual} parada: {c.Name}",
                $"O tempo da rodada acabou em {Brasilia.Formatar(fim)} e {abertas} mesa(s) ainda estão sem resultado. " +
                "Confira se os jogadores lançaram no celular ou decida pela Central.",
                $"/admin/liguinha/{c.Id}"));
        }
        return achados;
    }
}

/// <summary>
/// Backup diário sem registro há mais de 26 h: os dumps locais (deploy/backup.sh) e, se a cópia
/// no Google Drive (deploy/backup-drive.sh) já rodou alguma vez, ela também — cada um com sua marca,
/// pra um upload que falha todo dia não ficar escondido atrás do dump local que deu certo.
/// </summary>
public class VerificacaoBackupAtrasado(AppDbContext db) : IVerificacaoVigia
{
    public static readonly TimeSpan Prazo = TimeSpan.FromHours(26);
    public string Codigo => "backup-atrasado";
    public string Nome => "Backup diário atrasado";

    /// <summary>Desde quando a API está no ar — sem registro nenhum, só alerta depois do prazo.</summary>
    internal static DateTime NoArDesde = Process.GetCurrentProcess().StartTime.ToUniversalTime();

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var agora = DateTime.UtcNow;
        var marcos = await db.MarcosOperacao.AsNoTracking()
            .Where(m => m.Chave == MarcoOperacao.BackupDiario || m.Chave == MarcoOperacao.BackupDrive)
            .ToDictionaryAsync(m => m.Chave, ct);
        var achados = new List<Achado>();

        if (!marcos.TryGetValue(MarcoOperacao.BackupDiario, out var local))
        {
            if (agora - NoArDesde >= Prazo)
                achados.Add(new Achado("sem-registro", VigiaGravidade.Critico, "Nenhum backup registrado",
                    "O backup diário (3h, deploy/backup.sh) nunca registrou execução. Confira o cron na VPS: crontab -l",
                    null));
        }
        else if (agora - local.Quando >= Prazo)
            // A data do último backup na referência: cada atraso é um caso novo (resolver um não silencia o próximo)
            achados.Add(new Achado($"atrasado:{local.Quando:yyyyMMddHHmm}", VigiaGravidade.Critico,
                $"Backup não roda há {(int)(agora - local.Quando).TotalHours} h",
                $"Último backup em {Brasilia.Formatar(local.Quando)} ({local.Detalhe ?? "sem detalhe"}). " +
                "Ele roda todo dia às 3h e antes de todo deploy. Confira na VPS: tail /var/log/santuarionerd-backup.log",
                null));

        // A cópia no Drive só é cobrada depois de ter rodado uma vez (sem rclone configurado, não existe)
        if (marcos.TryGetValue(MarcoOperacao.BackupDrive, out var drive) && agora - drive.Quando >= Prazo)
            achados.Add(new Achado($"drive-atrasado:{drive.Quando:yyyyMMddHHmm}", VigiaGravidade.Critico,
                $"Cópia do backup no Drive parada há {(int)(agora - drive.Quando).TotalHours} h",
                $"Última cópia no Google Drive em {Brasilia.Formatar(drive.Quando)} ({drive.Detalhe ?? "sem detalhe"}). " +
                "Os dumps podem estar saindo na VPS, mas a cópia fora dela não. Confira: tail /opt/santuarionerd/backups/backup-drive.log",
                null));
        return achados;
    }
}
