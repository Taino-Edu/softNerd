// =============================================================================
// CrediarioLancamentos.cs — Regras compartilhadas das compras dentro do crediário
// Comanda, venda do balcão e a tela do crediário mexem nas mesmas contas; o que
// é regra (estorno, formato dos itens, conversão das contas antigas) mora aqui
// pra não divergir entre os três.
// =============================================================================

using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public static class CrediarioLancamentos
{
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try   { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    /// <summary>Formas aceitas pra pagar uma conta de crediário (dinheiro de verdade entrando) — vem do catálogo.</summary>
    public static readonly string[] FormasDePagamento = Models.MongoDB.PaymentMethod.QuitamCrediario;

    public static DateTime HojeBrasil() => ParaBrasilia(DateTime.UtcNow).Date;

    /// <summary>Instante UTC (como vem do banco) no relógio de Brasília.</summary>
    public static DateTime ParaBrasilia(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), BrazilZone);

    /// <summary>
    /// Vencimento escolhido como data vale o dia inteiro no horário de Brasília. Antes a
    /// data virava meia-noite UTC — 21h do dia ANTERIOR aqui — e a conta aparecia vencida
    /// na véspera.
    /// </summary>
    public static DateTime VencimentoFimDoDia(DateTime data)
    {
        var diaSeguinte = DateTime.SpecifyKind(data.Date.AddDays(1), DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(diaSeguinte, BrazilZone).AddSeconds(-1);
    }

    /// <summary>Vencimento de conta nova: a data escolhida ou 30 dias a partir de hoje.</summary>
    public static DateTime VencimentoPadrao(DateTime? escolhido) =>
        VencimentoFimDoDia(escolhido ?? HojeBrasil().AddDays(30));

    public static string? SerializarItens(IEnumerable<ItemCrediarioDto> itens)
    {
        // LancamentoId não vai pro JSON: dentro do lançamento ele é redundante.
        var lista = itens.Select(i => new ItemCrediarioDto
        {
            ItemName         = i.ItemName,
            Quantity         = i.Quantity,
            UnitPriceInReais = i.UnitPriceInReais,
            SubtotalInReais  = i.SubtotalInReais,
        }).ToList();
        return lista.Count == 0 ? null : JsonSerializer.Serialize(lista);
    }

    public static List<ItemCrediarioDto> LerItens(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<ItemCrediarioDto>();
        try
        {
            return JsonSerializer.Deserialize<List<ItemCrediarioDto>>(json) ?? new List<ItemCrediarioDto>();
        }
        catch (JsonException)
        {
            return new List<ItemCrediarioDto>();
        }
    }

    public static List<ItemCrediarioDto> ItensDaComanda(Comanda? comanda) =>
        comanda?.Items
            .OrderBy(i => i.AddedAt)
            .Select(i => new ItemCrediarioDto
            {
                ItemName         = i.ItemNameSnapshot,
                Quantity         = i.Quantity,
                UnitPriceInReais = i.UnitPriceInCents / 100m,
                SubtotalInReais  = i.SubtotalInCents  / 100m,
            })
            .ToList() ?? new List<ItemCrediarioDto>();

    public static LancamentoCrediarioDto ToDto(CrediarioLancamento l)
    {
        var itens = LerItens(l.ItensJson);
        foreach (var i in itens) i.LancamentoId = l.Id;

        return new LancamentoCrediarioDto
        {
            Id            = l.Id,
            Origem        = l.Origem.ToString(),
            ComandaId     = l.ComandaId,
            VendaAvulsaId = l.VendaAvulsaId,
            Descricao     = l.Descricao,
            ValorEmReais  = l.ValorEmCentavos / 100m,
            CreatedAt     = l.CreatedAt,
            EstornadoEm   = l.EstornadoEm,
            Itens         = itens,
        };
    }

    // ── Estorno ───────────────────────────────────────────────────────────────

    /// <summary>
    /// O estorno tira <paramref name="valor"/> da conta. Só é bloqueado quando o que
    /// sobra fica menor do que o cliente já pagou — aí teria dinheiro a devolver, e isso
    /// precisa ser acertado à mão. Antes qualquer pagamento na conta travava o estorno
    /// de qualquer compra acumulada nela.
    /// </summary>
    public static void ValidarEstorno(Crediario crediario, int valor)
    {
        if (crediario.ValorEmCentavos - valor < crediario.ValorPagoEmCentavos)
            throw new InvalidOperationException(
                $"O cliente já pagou R$ {crediario.ValorPagoEmCentavos / 100m:N2} nesta conta de crediário e, " +
                $"sem esta compra, a dívida cairia para R$ {Math.Max(0, crediario.ValorEmCentavos - valor) / 100m:N2}. " +
                "Acerte o crediário do cliente (devolução) antes de estornar.");
    }

    public static void AplicarEstorno(
        AppDbContext db, Crediario crediario, CrediarioLancamento? lancamento, int valor, Guid adminId)
    {
        crediario.ValorEmCentavos = Math.Max(0, crediario.ValorEmCentavos - valor);
        if (lancamento is not null)
            lancamento.EstornadoEm = DateTime.UtcNow;

        if (crediario.ValorEmCentavos == 0 && crediario.ValorPagoEmCentavos == 0)
        {
            // Conta que ficou zerada e sem pagamento nenhum não deve continuar cobrando.
            db.Crediarios.Remove(crediario);
        }
        else if (crediario.Status == CrediariosStatus.Aberto && crediario.SaldoRestanteEmCentavos <= 1)
        {
            // O que o cliente já pagou cobre o que sobrou — a conta está quitada.
            crediario.Status         = CrediariosStatus.Pago;
            crediario.DataPagamento  = DateTime.UtcNow;
            crediario.PagoPorAdminId = adminId;
        }
    }

    // ── Conversão das contas antigas ──────────────────────────────────────────

    /// <summary>
    /// Toda conta sem lançamento ganha os seus a partir do que existia antes (ItensJson
    /// corrido ou a comanda de origem). Idempotente: só olha conta sem lançamento.
    /// </summary>
    public static async Task<int> ConverterContasAntigasAsync(AppDbContext db)
    {
        var contas = await db.Crediarios
            .Include(c => c.Comanda).ThenInclude(cmd => cmd!.Items)
            .Where(c => !c.Lancamentos.Any())
            .ToListAsync();
        if (contas.Count == 0) return 0;

        // Contas antigas vindas de comanda sem ItensJson descobriam os itens pelas comandas
        // de crediário fechadas no período da conta. Mantém isso na conversão, mas sem
        // puxar a comanda que abriu OUTRA conta — era o que misturava itens entre dívidas.
        var comandasDeOrigem = (await db.Crediarios
                .Where(c => c.ComandaId != null)
                .Select(c => c.ComandaId!.Value)
                .ToListAsync())
            .ToHashSet();

        var userIds = contas
            .Where(c => c.ComandaId != null && LerItens(c.ItensJson).Count == 0)
            .Select(c => c.UserId)
            .Distinct()
            .ToList();

        var comandasCrediario = userIds.Count == 0
            ? new List<Comanda>()
            : await db.Comandas
                .Include(c => c.Items)
                .Where(c => userIds.Contains(c.UserId)
                         && c.PaymentMethod == "Crediario"
                         && c.Status == ComandaStatus.Fechada
                         && c.ClosedAt != null)
                .ToListAsync();

        foreach (var conta in contas)
        {
            var lancamento = new CrediarioLancamento
            {
                CrediarioId     = conta.Id,
                ValorEmCentavos = conta.ValorEmCentavos,
                CreatedAt       = conta.DataAbertura,
                Descricao       = conta.Observacao,
            };

            var itensJson = LerItens(conta.ItensJson);
            if (itensJson.Count > 0)
            {
                lancamento.Origem    = CrediarioLancamentoOrigem.Legado;
                lancamento.ItensJson = SerializarItens(itensJson);
            }
            else if (conta.ComandaId != null)
            {
                var inicio = conta.DataAbertura.AddSeconds(-60);
                var fim    = conta.DataPagamento?.AddDays(1) ?? DateTime.MaxValue;
                var doPeriodo = comandasCrediario
                    .Where(cmd => cmd.UserId == conta.UserId
                               && cmd.ClosedAt!.Value >= inicio
                               && cmd.ClosedAt!.Value <= fim
                               && (cmd.Id == conta.ComandaId || !comandasDeOrigem.Contains(cmd.Id)))
                    .OrderBy(cmd => cmd.ClosedAt)
                    .ToList();

                if (doPeriodo.Count <= 1)
                {
                    lancamento.Origem    = CrediarioLancamentoOrigem.Comanda;
                    lancamento.ComandaId = conta.ComandaId;
                    lancamento.ItensJson = SerializarItens(ItensDaComanda(conta.Comanda ?? doPeriodo.FirstOrDefault()));
                }
                else
                {
                    lancamento.Origem    = CrediarioLancamentoOrigem.Legado;
                    lancamento.ItensJson = SerializarItens(doPeriodo.SelectMany(ItensDaComanda));
                }
            }
            else
            {
                lancamento.Origem = CrediarioLancamentoOrigem.Manual;
            }

            db.CrediarioLancamentos.Add(lancamento);
        }

        await db.SaveChangesAsync();
        return contas.Count;
    }
}
