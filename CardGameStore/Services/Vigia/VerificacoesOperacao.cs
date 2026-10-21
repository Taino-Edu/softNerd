// =============================================================================
// VerificacoesOperacao.cs — gatilhos do dia a dia da loja (Vigia)
// Comanda esquecida, Pix de comanda pago sem fechar, NFC-e com problema, torneio sem
// encerrar e robô parado. Cada classe responde UMA pergunta; a regra mora no serviço dela.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Vigia;

/// <summary>Comanda aberta há mais de 12 h: esquecida, venda que não fecha e não entra no faturamento.</summary>
public class VerificacaoComandaEsquecida(AppDbContext db) : IVerificacaoVigia
{
    public static readonly TimeSpan Prazo = TimeSpan.FromHours(12);
    public string Codigo => "comanda-esquecida";
    public string Nome => "Comanda aberta há mais de 12 horas";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var limite = DateTime.UtcNow - Prazo;
        var abertas = await db.Comandas.AsNoTracking().Include(c => c.User)
            .Where(c => (c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento) && c.OpenedAt < limite)
            .ToListAsync(ct);
        return abertas.Select(c => new Achado(c.Id.ToString(), VigiaGravidade.Aviso,
            $"Comanda aberta há {(int)(DateTime.UtcNow - c.OpenedAt).TotalHours} h: {c.User?.Name ?? "cliente"}",
            $"Mesa {c.TableIdentifier ?? "—"}, {VigiaPedidos.Reais(c.TotalInCents)}, aberta em {Brasilia.Formatar(c.OpenedAt)}. " +
            "Feche (a venda só entra no faturamento ao fechar) ou cancele se ficou esquecida.",
            "/admin/dashboard")).ToList();
    }
}

/// <summary>Pix de comanda pago há mais de 15 min e a comanda continua aberta.</summary>
public class VerificacaoPixComandaSemFechar(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "pix-comanda-sem-fechar";
    public string Nome => "Pix de comanda pago e a comanda não fechou";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var limite = DateTime.UtcNow.AddMinutes(-15);
        var desde = DateTime.UtcNow - VigiaPedidos.Janela;
        var pagos = await db.PixCobrancas.AsNoTracking()
            .Where(p => p.Origem == PixCobrancaOrigem.Comanda && p.ComandaId != null && p.PagoEm != null
                        && p.PagoEm < limite && p.PagoEm >= desde)
            .Select(p => new { p.TxId, p.ComandaId, p.ValorEmCentavos, p.PagoEm })
            .ToListAsync(ct);
        var ids = pagos.Select(p => p.ComandaId!.Value).Distinct().ToList();
        var abertas = await db.Comandas.AsNoTracking().Include(c => c.User)
            .Where(c => ids.Contains(c.Id) && (c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento))
            .ToDictionaryAsync(c => c.Id, ct);
        return pagos.Where(p => abertas.ContainsKey(p.ComandaId!.Value)).Select(p =>
        {
            var c = abertas[p.ComandaId!.Value];
            return new Achado(p.TxId, VigiaGravidade.Critico,
                $"Pix pago e comanda aberta: {c.User?.Name ?? "cliente"}",
                $"Pix de {VigiaPedidos.Reais(p.ValorEmCentavos)} pago em {Brasilia.Formatar(p.PagoEm!.Value)} e a comanda " +
                $"(mesa {c.TableIdentifier ?? "—"}) continua aberta. Feche a comanda com Pix. Pix {p.TxId}.",
                "/admin/dashboard");
        }).ToList();
    }
}

/// <summary>NFC-e rejeitada (30 dias) ou pendente/em contingência há mais de 2 h.</summary>
public class VerificacaoNfceComProblema(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "nfce-com-problema";
    public string Nome => "NFC-e rejeitada ou pendente";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var desde = DateTime.UtcNow.AddDays(-30);
        var paradaDesde = DateTime.UtcNow.AddHours(-2);
        var notas = await db.NotasFiscaisEmitidas.AsNoTracking()
            .Where(n => n.CreatedAt >= desde &&
                        (n.Status == NotaFiscalStatus.Rejeitada
                         || ((n.Status == NotaFiscalStatus.PendenteEmissao || n.Status == NotaFiscalStatus.AutorizadaContingencia)
                             && n.UpdatedAt < paradaDesde)))
            .Select(n => new { n.Id, n.Status, n.Numero, n.ValorTotalEmCentavos, n.MotivoRejeicao, n.CreatedAt })
            .ToListAsync(ct);
        return notas.Select(n => n.Status == NotaFiscalStatus.Rejeitada
            ? new Achado(n.Id.ToString(), VigiaGravidade.Aviso,
                $"NFC-e rejeitada{(n.Numero is null ? "" : $" nº {n.Numero}")}",
                $"Nota de {VigiaPedidos.Reais(n.ValorTotalEmCentavos)} de {Brasilia.Formatar(n.CreatedAt)} rejeitada pela SEFAZ: " +
                $"{n.MotivoRejeicao ?? "sem motivo informado"}. Corrija e emita de novo em Fiscal.", "/admin/fiscal")
            : new Achado(n.Id.ToString(), VigiaGravidade.Aviso,
                n.Status == NotaFiscalStatus.AutorizadaContingencia ? "NFC-e em contingência sem retransmitir" : "NFC-e pendente de emissão",
                $"Nota de {VigiaPedidos.Reais(n.ValorTotalEmCentavos)} de {Brasilia.Formatar(n.CreatedAt)} parada há mais de 2 h " +
                $"({n.Status}). O robô de reenvio deveria ter resolvido — confira em Fiscal.", "/admin/fiscal")).ToList();
    }
}

/// <summary>Torneio em andamento há mais de 12 h: não encerrado, a colocação não grava e a Liga não soma.</summary>
public class VerificacaoTorneioNaoEncerrado(AppDbContext db) : IVerificacaoVigia
{
    public string Codigo => "torneio-nao-encerrado";
    public string Nome => "Torneio sem encerrar";

    public async Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var limite = DateTime.UtcNow.AddHours(-12);
        var abertos = await db.Championships.AsNoTracking()
            .Where(c => c.Status == ChampionshipStatus.EmAndamento && c.StartDate < limite)
            .Select(c => new { c.Id, c.Name, c.StartDate, c.RodadaAtual, c.NumeroRodadas })
            .ToListAsync(ct);
        return abertos.Select(c => new Achado(c.Id.ToString(), VigiaGravidade.Aviso,
            $"Torneio sem encerrar: {c.Name}",
            $"Começou em {Brasilia.Formatar(c.StartDate)} e está na rodada {c.RodadaAtual}" +
            (c.NumeroRodadas is null ? "" : $" de {c.NumeroRodadas}") +
            ". Enquanto não encerrar, a colocação não grava e a Liga Mensal não soma.",
            $"/admin/liguinha/{c.Id}")).ToList();
    }
}

/// <summary>Robô que parou de bater o ponto (3 intervalos) ou que falhou 3 voltas seguidas.</summary>
public class VerificacaoRobosParados : IVerificacaoVigia
{
    public const int FalhasParaAlertar = 3;
    public string Codigo => "robo-parado";
    public string Nome => "Robô parado ou falhando";

    public Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct)
    {
        var agora = DateTime.UtcNow;
        var achados = new List<Achado>();
        foreach (var r in BatimentoRobos.Estado.Where(r => r.Intervalo > TimeSpan.Zero))
        {
            var esperado = (r.UltimaVoltaOk ?? r.IniciouEm + r.PrimeiraEspera) + r.Intervalo * 3;
            if (agora > esperado)
                achados.Add(new Achado(r.Nome, VigiaGravidade.Critico, $"Robô parado: {r.Nome}",
                    (r.UltimaVoltaOk is null
                        ? $"Não completou nenhuma volta desde que a API subiu ({Brasilia.Formatar(r.IniciouEm)})."
                        : $"Última volta boa em {Brasilia.Formatar(r.UltimaVoltaOk.Value)}; ele roda a cada {Intervalo(r.Intervalo)}.") +
                    (r.UltimoErro is null ? "" : $" Último erro: {r.UltimoErro}") +
                    " Veja o log com: bash deploy/logs.sh --erros"));
            else if (r.FalhasSeguidas >= FalhasParaAlertar)
                achados.Add(new Achado(r.Nome, VigiaGravidade.Critico, $"Robô falhando: {r.Nome}",
                    $"{r.FalhasSeguidas} voltas seguidas com erro. Último: {r.UltimoErro}. Veja o log com: bash deploy/logs.sh --erros"));
        }
        return Task.FromResult<IReadOnlyList<Achado>>(achados);
    }

    private static string Intervalo(TimeSpan t) => t.TotalHours >= 1 ? $"{t.TotalHours:0.#} h" : $"{t.TotalMinutes:0} min";
}
