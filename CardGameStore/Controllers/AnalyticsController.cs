// =============================================================================
// AnalyticsController.cs — Endpoints de analytics para o dashboard admin
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/analytics")]
[Authorize(Policy = "AdminOnly")]
public class AnalyticsController : ControllerBase
{
    // Fuso horário de Brasília — funciona em Linux (IANA) e Windows (ID legado).
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    /// <summary>
    /// Converte uma data local de Brasília no início UTC daquele dia.
    /// Ex.: 29/05 BR (UTC-3) → 29/05 03:00:00 UTC
    /// </summary>
    private static DateTime BrDateToUtcStart(DateTime brDate) =>
        TimeZoneInfo.ConvertTimeToUtc(
            DateTime.SpecifyKind(brDate.Date, DateTimeKind.Unspecified), BrazilZone);

    private readonly AppDbContext         _db;
    private readonly IVendaAvulsaService  _vendas;

    public AnalyticsController(AppDbContext db, IVendaAvulsaService vendas)
    {
        _db     = db;
        _vendas = vendas;
    }

    // -------------------------------------------------------------------------
    // GET /api/analytics/dashboard
    // -------------------------------------------------------------------------
    [HttpGet("dashboard")]
    public async Task<ActionResult<DashboardAnalyticsDto>> GetDashboard()
    {
        var agoraBr     = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        var hojeInicio  = BrDateToUtcStart(agoraBr.Date);
        var ontemInicio = hojeInicio.AddDays(-1);
        var ha30Dias    = hojeInicio.AddDays(-30);
        var ha60Dias    = hojeInicio.AddDays(-60);
        var inicioMes   = BrDateToUtcStart(new DateTime(agoraBr.Year, agoraBr.Month, 1));

        // ── Comandas fechadas ─────────────────────────────────────────────────
        var comandasHoje = await _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt >= hojeInicio && c.ClosedAt < hojeInicio.AddDays(1))
            .Select(c => new { c.TotalInCents, c.ClosedAt, c.PaymentMethod })
            .ToListAsync();

        var comandasOntem = await _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt >= ontemInicio && c.ClosedAt < hojeInicio)
            .SumAsync(c => (long)c.TotalInCents);

        // ── Vendas avulsas (MongoDB) — 60 dias cobre todas as métricas do dashboard ──
        var vendas60Dias = (await _vendas.GetRecentAsync(5000, ha60Dias)).ToList();
        var vendasHoje   = vendas60Dias.Where(v => v.SoldAt >= hojeInicio).ToList();
        var vendasOntem  = vendas60Dias.Where(v => v.SoldAt >= ontemInicio && v.SoldAt < hojeInicio).ToList();
        var vendasUlt30  = vendas60Dias.Where(v => v.SoldAt >= ha30Dias).ToList();
        var vendasAnt30  = vendas60Dias.Where(v => v.SoldAt >= ha60Dias && v.SoldAt < ha30Dias).ToList();

        var totalHoje  = (comandasHoje.Sum(c => c.TotalInCents) + vendasHoje.Sum(v => v.TotalInCents)) / 100m;
        var totalOntem = (comandasOntem + vendasOntem.Sum(v => (long)v.TotalInCents)) / 100m;
        var variacao   = totalOntem == 0 ? 0m : Math.Round((totalHoje - totalOntem) / totalOntem * 100, 1);

        // ── Ticket médio (últimos 30 dias — comandas + vendas avulsas) ────────────
        var ticketsRecentes = await _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt >= ha30Dias && c.TotalInCents > 0)
            .Select(c => (decimal)c.TotalInCents)
            .ToListAsync();
        ticketsRecentes.AddRange(vendasUlt30.Where(v => v.TotalInCents > 0).Select(v => (decimal)v.TotalInCents));

        var ticketsAnteriores = await _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt >= ha60Dias && c.ClosedAt < ha30Dias && c.TotalInCents > 0)
            .Select(c => (decimal)c.TotalInCents)
            .ToListAsync();
        ticketsAnteriores.AddRange(vendasAnt30.Where(v => v.TotalInCents > 0).Select(v => (decimal)v.TotalInCents));

        var ticketMedio    = ticketsRecentes.Count > 0 ? ticketsRecentes.Average() / 100m : 0;
        var ticketAnterior = ticketsAnteriores.Count > 0 ? ticketsAnteriores.Average() / 100m : 0;

        // ── Clientes ──────────────────────────────────────────────────────────
        var totalClientes    = await _db.Users.CountAsync(u => u.IsActive && u.Role == UserRole.Customer);
        var novosClientesMes = await _db.Users.CountAsync(u => u.IsActive && u.Role == UserRole.Customer && u.CreatedAt >= inicioMes);

        var ultimasVisitas = await _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt != null)
            .GroupBy(c => c.UserId)
            .Select(g => new { UserId = g.Key, Ultima = g.Max(c => c.ClosedAt) })
            .ToListAsync();

        var clientesAtivos   = ultimasVisitas.Count(v => v.Ultima >= ha30Dias);
        var clientesInativos = Math.Max(0, totalClientes - clientesAtivos);

        // ── Curva horária do dia ──────────────────────────────────────────────
        var curva = Enumerable.Range(9, 16).Select(h =>
        {
            var ini = hojeInicio.AddHours(h);
            var fim = ini.AddHours(1);
            var vc  = comandasHoje.Where(c => c.ClosedAt >= ini && c.ClosedAt < fim).Sum(c => c.TotalInCents);
            var vv  = vendasHoje.Where(v => v.SoldAt >= ini && v.SoldAt < fim).Sum(v => v.TotalInCents);
            return new HourlyRevenueDto { Hora = $"{h}h", Valor = (vc + vv) / 100m };
        }).ToList();

        // ── Top produtos (últimos 30 dias — comandas + vendas avulsas) ───────────
        var topComandaItens = await _db.ComandaItems
            .Where(i => i.AddedAt >= ha30Dias)
            .GroupBy(i => i.ItemNameSnapshot)
            .Select(g => new TopProductDto
            {
                Nome         = g.Key,
                QuantVendida = g.Sum(i => i.Quantity),
                Receita      = g.Sum(i => i.UnitPriceInCents * i.Quantity) / 100m,
            })
            .ToListAsync();

        var topAvulsaItens = vendasUlt30
            .SelectMany(v => v.Items)
            .GroupBy(i => i.ProductName)
            .Select(g => new TopProductDto
            {
                Nome         = g.Key,
                QuantVendida = g.Sum(i => i.Quantity),
                Receita      = Math.Round(g.Sum(i => (decimal)i.Quantity * i.UnitPriceInReais), 2),
            })
            .ToList();

        var topProdutos = topComandaItens.Concat(topAvulsaItens)
            .GroupBy(t => t.Nome)
            .Select(g => new TopProductDto
            {
                Nome         = g.Key,
                QuantVendida = g.Sum(t => t.QuantVendida),
                Receita      = Math.Round(g.Sum(t => t.Receita), 2),
            })
            .OrderByDescending(t => t.QuantVendida)
            .Take(5)
            .ToList();

        // ── Formas de pagamento (vendas avulsas + comandas hoje) ─────────────────
        var pix      = vendasHoje.Count(v => v.PaymentMethod == "Pix")
                     + comandasHoje.Count(c => c.PaymentMethod == "Pix");
        var cartao   = vendasHoje.Count(v => v.PaymentMethod is "CartaoCredito" or "CartaoDebito")
                     + comandasHoje.Count(c => c.PaymentMethod is "CartaoCredito" or "CartaoDebito");
        var dinheiro = vendasHoje.Count(v => v.PaymentMethod == "Dinheiro")
                     + comandasHoje.Count(c => c.PaymentMethod == "Dinheiro");

        var comandasAbertas = await _db.Comandas.CountAsync(c => c.Status == ComandaStatus.Aberta);

        return Ok(new DashboardAnalyticsDto
        {
            VendasHoje             = totalHoje,
            VendasOntem            = totalOntem,
            VariacaoPercDia        = variacao,
            ComandasAbertas        = comandasAbertas,
            VendasAvulsasHoje      = vendasHoje.Count,
            TicketMedio            = Math.Round(ticketMedio, 2),
            TicketMedioAnterior    = Math.Round(ticketAnterior, 2),
            TotalClientes          = totalClientes,
            ClientesAtivos30Dias   = clientesAtivos,
            ClientesInativos30Dias = clientesInativos,
            NovosClientesMes       = novosClientesMes,
            CurvaVendasDia         = curva,
            TopProdutos            = topProdutos,
            PagamentosPix          = pix,
            PagamentosCartao       = cartao,
            PagamentosDinheiro     = dinheiro,
        });
    }

    // -------------------------------------------------------------------------
    // GET /api/analytics/clientes
    // Insights por cliente: gasto, ticket médio, inatividade.
    //
    // Filtros (todos opcionais — sem nenhum, o comportamento é o histórico:
    // tudo desde sempre, só comandas, lista inteira):
    //   inicio/fim           — recorta gasto/visitas ao período (datas de Brasília)
    //   incluirPdv           — soma também as vendas avulsas identificadas com o cliente
    //   filterPaymentMethod  — só o que foi pago naquela forma (1ª ou 2ª)
    //   limite               — corta em N clientes DEPOIS de ordenar por gasto
    //
    // `Inativo30` continua ancorado em "hoje", não no fim do período: ele responde
    // "sumiu?", que é sobre o presente, não sobre a janela que o admin escolheu olhar.
    // -------------------------------------------------------------------------
    [HttpGet("clientes")]
    public async Task<ActionResult<List<ClienteInsightDto>>> GetClienteInsights(
        [FromQuery] bool      apenasInativos      = false,
        [FromQuery] DateTime? inicio              = null,
        [FromQuery] DateTime? fim                 = null,
        [FromQuery] bool      incluirPdv          = false,
        [FromQuery] string?   filterPaymentMethod = null,
        [FromQuery] int?      limite              = null)
    {
        var ha30Dias    = DateTime.UtcNow.AddDays(-30);
        var hasPmFilter = !string.IsNullOrWhiteSpace(filterPaymentMethod);

        // Período: mesma convenção da tela financeira — data de Brasília convertida
        // pro início do dia em UTC, `fim` inclusivo (soma 1 dia e usa `<`).
        DateTime? ini = inicio.HasValue ? BrDateToUtcStart(inicio.Value.Date)            : null;
        DateTime? end = fim.HasValue    ? BrDateToUtcStart(fim.Value.Date.AddDays(1))    : null;

        var usuarios = await _db.Users
            .Where(u => u.IsActive && u.Role == UserRole.Customer)
            .Select(u => new { u.Id, u.Name, u.Email, u.WhatsApp, u.PointsBalance, u.PointsExpiresAt })
            .ToListAsync();

        // ── Comandas do período ───────────────────────────────────────────────
        IQueryable<Comanda> comandasQ = _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt != null);

        if (ini.HasValue) comandasQ = comandasQ.Where(c => c.ClosedAt >= ini.Value);
        if (end.HasValue) comandasQ = comandasQ.Where(c => c.ClosedAt <  end.Value);
        if (hasPmFilter)
            comandasQ = comandasQ.Where(c =>
                c.PaymentMethod == filterPaymentMethod ||
                c.SecondPaymentMethod == filterPaymentMethod);

        // Com filtro de forma, uma comanda dividida (ex: R$ 80 cartão + R$ 20 Pix) entra
        // pelos dois lados do OR acima — somar o total inteiro faria ela aparecer cheia
        // nos dois rankings. Aqui entra só a parte paga na forma filtrada.
        var estatisticas = hasPmFilter
            ? await comandasQ
                .GroupBy(c => c.UserId)
                .Select(g => new AgregadoCliente
                {
                    UserId     = g.Key,
                    Visitas    = g.Count(),
                    GastoCents = g.Sum(c =>
                        (c.PaymentMethod == filterPaymentMethod
                            ? (long)c.TotalInCents - c.SecondPaymentAmountInCents : 0L) +
                        (c.SecondPaymentMethod == filterPaymentMethod
                            ? (long)c.SecondPaymentAmountInCents : 0L)),
                })
                .ToListAsync()
            : await comandasQ
                .GroupBy(c => c.UserId)
                .Select(g => new AgregadoCliente
                {
                    UserId     = g.Key,
                    Visitas    = g.Count(),
                    GastoCents = g.Sum(c => (long)c.TotalInCents),
                })
                .ToListAsync();

        var acumulado = estatisticas.ToDictionary(
            e => e.UserId,
            e => (Visitas: e.Visitas, GastoCents: e.GastoCents));

        // ── Vendas avulsas do período (PDV / MongoDB) ─────────────────────────
        if (incluirPdv)
        {
            foreach (var pdv in await _vendas.AgregarPorClienteAsync(ini, end, filterPaymentMethod))
            {
                acumulado.TryGetValue(pdv.UserId, out var atual);
                acumulado[pdv.UserId] = (atual.Visitas + pdv.Compras, atual.GastoCents + pdv.GastoCents);
            }
        }

        // ── Última compra, SEM recorte de período ─────────────────────────────
        // "Inativo" responde "sumiu?", que é sobre hoje — não sobre a janela que o admin
        // escolheu olhar. Derivar isso das comandas já filtradas marcaria como inativo
        // todo mundo que aparece ao consultar, por exemplo, janeiro. Também ignora o
        // filtro de forma e o toggle de PDV: quem comprou no balcão ontem não sumiu,
        // independente de como o ranking está recortado.
        var ultimaVisita = (await _db.Comandas
                .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt != null)
                .GroupBy(c => c.UserId)
                .Select(g => new { UserId = g.Key, Ultima = g.Max(c => c.ClosedAt)!.Value })
                .ToListAsync())
            .ToDictionary(x => x.UserId, x => x.Ultima);

        foreach (var (userId, ultimaPdv) in await _vendas.UltimaVendaPorClienteAsync())
            if (!ultimaVisita.TryGetValue(userId, out var atual) || ultimaPdv > atual)
                ultimaVisita[userId] = ultimaPdv;

        var insights = usuarios.Select(u =>
        {
            acumulado.TryGetValue(u.Id, out var stats);
            DateTime? ultima = ultimaVisita.TryGetValue(u.Id, out var dt) ? dt : null;
            var gasto = stats.GastoCents / 100m;
            int? pontosVencemEm = u.PointsExpiresAt.HasValue
                ? (int)Math.Round((u.PointsExpiresAt.Value - DateTime.UtcNow).TotalDays)
                : null;
            return new ClienteInsightDto
            {
                UserId        = u.Id,
                Nome          = u.Name,
                Email         = u.Email,
                WhatsApp      = u.WhatsApp,
                GastoTotal    = gasto,
                TicketMedio   = stats.Visitas > 0 ? Math.Round(gasto / stats.Visitas, 2) : 0,
                NumVisitas    = stats.Visitas,
                UltimaVisita  = ultima,
                Inativo30     = ultima == null || ultima < ha30Dias,
                Pontos        = u.PointsBalance,
                PontosVencemEm = pontosVencemEm,
            };
        })
        .Where(i => !apenasInativos || i.Inativo30)
        .OrderByDescending(i => i.GastoTotal)
        .ToList();

        // O limite é aplicado depois da ordenação: "Top N por gasto", não "N primeiros
        // que apareceram". Sem limite, devolve tudo (compatível com quem já chamava).
        if (limite is > 0)
            insights = insights.Take(limite.Value).ToList();

        return Ok(insights);
    }

    /// <summary>Tipo nomeado (e não anônimo) porque as duas variantes da query de comandas
    /// — com e sem filtro de forma de pagamento — precisam ter o mesmo tipo de retorno.</summary>
    private sealed class AgregadoCliente
    {
        public Guid UserId     { get; set; }
        public int  Visitas    { get; set; }
        public long GastoCents { get; set; }
    }

    /// <summary>
    /// Fração do valor de uma transação que corresponde à forma de pagamento filtrada.
    /// Sem filtro é 1 (a transação inteira).
    ///
    /// Numa venda dividida — ex: R$ 80 no cartão + R$ 20 em Pix — filtrar por Pix devolve
    /// 0,2. Sem isso a mesma venda entrava INTEIRA nos dois filtros: o predicado aceita a
    /// transação quando a forma bate na primeira OU na segunda, mas a soma pegava o total.
    /// O card "Formas de pagamento" desta mesma tela sempre fez essa conta certa (ele emite
    /// uma linha por forma, com `primaryAmt = total - secondAmt`) — eram os totais que não
    /// faziam, então a tela se contradizia sozinha.
    ///
    /// A mesma fração é aplicada ao CUSTO, e não só à receita: alocar receita proporcional
    /// contra custo cheio faria uma venda lucrativa aparecer como prejuízo no filtro.
    /// </summary>
    internal static decimal FracaoNaForma(
        string? forma, string? segundaForma, int totalCents, int segundoValorCents, string? filtro)
    {
        if (string.IsNullOrWhiteSpace(filtro)) return 1m;
        if (totalCents <= 0) return 0m;

        var temSegundo = !string.IsNullOrEmpty(segundaForma) && segundoValorCents > 0;
        var segundo    = temSegundo ? segundoValorCents : 0;

        long valor = 0;
        if (forma == filtro)                      valor += totalCents - segundo;
        if (temSegundo && segundaForma == filtro) valor += segundo;

        return Math.Clamp((decimal)valor / totalCents, 0m, 1m);
    }

    // -------------------------------------------------------------------------
    // GET /api/analytics/financeiro?inicio=2025-01-01&fim=2025-01-31
    // Controle financeiro: receita, custo e margem no período filtrado
    // -------------------------------------------------------------------------
    [HttpGet("financeiro")]
    public async Task<ActionResult<FinanceiroDto>> GetFinanceiro(
        [FromQuery] DateTime? inicio,
        [FromQuery] DateTime? fim,
        [FromQuery] string?   filterPaymentMethod = null)
    {
        var agoraBr   = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        var dataBrIni = inicio.HasValue ? inicio.Value.Date : new DateTime(agoraBr.Year, agoraBr.Month, 1);
        var dataBrFim = fim.HasValue    ? fim.Value.Date    : agoraBr.Date;

        var ini = BrDateToUtcStart(dataBrIni);
        var end = BrDateToUtcStart(dataBrFim.AddDays(1));

        var hasPmFilter = !string.IsNullOrWhiteSpace(filterPaymentMethod);

        // ── Comandas base query ───────────────────────────────────────────────
        IQueryable<Comanda> comandasBaseQ = _db.Comandas
            .Where(c => c.ClosedAt >= ini && c.ClosedAt < end && c.Status == ComandaStatus.Fechada);

        if (hasPmFilter)
            comandasBaseQ = comandasBaseQ.Where(c =>
                c.PaymentMethod == filterPaymentMethod ||
                c.SecondPaymentMethod == filterPaymentMethod);

        // ── Receita de comandas ───────────────────────────────────────────────
        // Materializa em vez de somar no banco: com filtro de forma, cada comanda entra
        // pela fração paga naquela forma (ver FracaoNaForma), não pelo total.
        var comandasBase = await comandasBaseQ
            .Select(c => new
            {
                c.ClosedAt,
                c.TotalInCents,
                c.PaymentMethod,
                c.SecondPaymentMethod,
                c.SecondPaymentAmountInCents,
            })
            .ToListAsync();

        var comandasComFracao = comandasBase
            .Select(c => new
            {
                c.ClosedAt,
                c.TotalInCents,
                Fracao = FracaoNaForma(c.PaymentMethod, c.SecondPaymentMethod,
                                       c.TotalInCents, c.SecondPaymentAmountInCents, filterPaymentMethod),
            })
            .ToList();

        var receitaComandas = comandasComFracao.Sum(c => c.TotalInCents * c.Fracao) / 100m;

        // ── Vendas avulsas (MongoDB) ──────────────────────────────────────────
        var todasVendas = (await _vendas.GetRecentAsync(2000, ini)).ToList();
        var avulsasPeriodo = todasVendas
            .Where(v => v.SoldAt >= ini && v.SoldAt < end);

        if (hasPmFilter)
            avulsasPeriodo = avulsasPeriodo.Where(v =>
                v.PaymentMethod == filterPaymentMethod ||
                v.SecondPaymentMethod == filterPaymentMethod);

        var avulsasList = avulsasPeriodo.ToList();

        // Fração de cada venda avulsa atribuível à forma filtrada — mesma regra das comandas.
        var fracaoVenda = avulsasList.ToDictionary(
            v => v.Id,
            v => FracaoNaForma(v.PaymentMethod, v.SecondPaymentMethod,
                               v.TotalInCents, v.SecondPaymentAmountInCents, filterPaymentMethod));

        // ── Separa venda homologada do site (Origem == "Reserva") de venda de balcão comum,
        // e dentro do site ainda separa "Site" × "Pré-venda" pela tag do produto (mesma
        // divisão das colunas Vendas × Pré-vendas no kanban de Pedidos).
        var avulsasPdv      = avulsasList.Where(v => v.Origem != "Reserva").ToList();
        var avulsasSite     = avulsasList.Where(v => v.Origem == "Reserva" && !v.ProductIsPreVenda).ToList();
        var avulsasPreVenda = avulsasList.Where(v => v.Origem == "Reserva" && v.ProductIsPreVenda).ToList();
        var receitaAvulsa   = avulsasPdv.Sum(v => v.TotalInCents * fracaoVenda[v.Id]) / 100m;
        var receitaSite     = avulsasSite.Sum(v => v.TotalInCents * fracaoVenda[v.Id]) / 100m;
        var receitaPreVenda = avulsasPreVenda.Sum(v => v.TotalInCents * fracaoVenda[v.Id]) / 100m;

        var receita = receitaComandas + receitaAvulsa + receitaSite + receitaPreVenda;

        // ── Itens de comanda — com categoria e método de pagamento do pai ─────
        var itensRaw = await _db.ComandaItems
            .Where(i => i.Comanda!.ClosedAt >= ini
                     && i.Comanda.ClosedAt < end
                     && i.Comanda.Status == ComandaStatus.Fechada
                     && i.ProductId != null
                     && i.Product != null)
            .Select(i => new {
                i.ItemNameSnapshot,
                i.UnitPriceInCents,
                i.Quantity,
                i.CostPriceSnapshotInCents,
                ComandaClosedAt          = i.Comanda!.ClosedAt,
                ComandaPaymentMethod     = i.Comanda.PaymentMethod,
                ComandaSecondPayment     = i.Comanda.SecondPaymentMethod,
                ComandaTotal             = i.Comanda.TotalInCents,
                ComandaSegundoValor      = i.Comanda.SecondPaymentAmountInCents,
                Categoria                = i.Product!.Category,
            })
            .ToListAsync();

        // Cada item carrega a fração da comanda-pai: com filtro de forma, o custo entra
        // proporcional à receita atribuída, senão a margem do filtro viraria prejuízo.
        var itens = itensRaw
            .Where(i => !hasPmFilter
                     || i.ComandaPaymentMethod == filterPaymentMethod
                     || i.ComandaSecondPayment == filterPaymentMethod)
            .Select(i => new
            {
                i.ItemNameSnapshot,
                i.UnitPriceInCents,
                i.Quantity,
                i.CostPriceSnapshotInCents,
                i.ComandaClosedAt,
                i.Categoria,
                Fracao = FracaoNaForma(i.ComandaPaymentMethod, i.ComandaSecondPayment,
                                       i.ComandaTotal, i.ComandaSegundoValor, filterPaymentMethod),
            })
            .ToList();

        var custoComandas = itens
            .Sum(i => (decimal)i.CostPriceSnapshotInCents * i.Quantity * i.Fracao) / 100m;

        var custoAvulsa = avulsasPdv
            .Sum(v => v.Items.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) * fracaoVenda[v.Id]) / 100m;

        var custoSite = avulsasSite
            .Sum(v => v.Items.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) * fracaoVenda[v.Id]) / 100m;

        var custoPreVenda = avulsasPreVenda
            .Sum(v => v.Items.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) * fracaoVenda[v.Id]) / 100m;

        var custo = custoComandas + custoAvulsa + custoSite + custoPreVenda;
        var margem        = receita - custo;
        var margemPercent = custo > 0 ? Math.Round(margem / custo * 100, 1) : 0;

        // ── Crediários em aberto ──────────────────────────────────────────────
        var crediarios = await _db.Crediarios
            .Where(c => c.Status == CrediariosStatus.Aberto)
            .SumAsync(c => (decimal)(c.ValorEmCentavos - c.ValorPagoEmCentavos)) / 100m;

        // ── Breakdown dia a dia ───────────────────────────────────────────────
        // Reaproveita a lista já materializada acima (com a fração por comanda) — o dia a dia
        // precisa fechar com o total, então tem que usar exatamente o mesmo critério.
        var comandasDoPeriodo = comandasComFracao;

        var totalDias = (int)(dataBrFim - dataBrIni).TotalDays + 1;
        var diaDia    = new List<DiaFinanceiroDto>();

        for (var d = 0; d < totalDias; d++)
        {
            var dBr  = dataBrIni.AddDays(d);
            var dIni = BrDateToUtcStart(dBr);
            var dFim = BrDateToUtcStart(dBr.AddDays(1));

            var rComanda = comandasDoPeriodo
                .Where(c => c.ClosedAt >= dIni && c.ClosedAt < dFim)
                .Sum(c => c.TotalInCents * c.Fracao) / 100m;

            var rAvulsa = avulsasList
                .Where(v => v.SoldAt >= dIni && v.SoldAt < dFim)
                .Sum(v => v.TotalInCents * fracaoVenda[v.Id]) / 100m;

            var cComandaDia = itens
                .Where(i => i.ComandaClosedAt >= dIni && i.ComandaClosedAt < dFim)
                .Sum(i => (decimal)i.CostPriceSnapshotInCents * i.Quantity * i.Fracao) / 100m;

            var cAvulsaDia = avulsasList
                .Where(v => v.SoldAt >= dIni && v.SoldAt < dFim)
                .Sum(v => v.Items.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) * fracaoVenda[v.Id]) / 100m;

            diaDia.Add(new DiaFinanceiroDto
            {
                Dia     = dBr.ToString("yyyy-MM-dd"),
                Receita = Math.Round(rComanda + rAvulsa, 2),
                Custo   = Math.Round(cComandaDia + cAvulsaDia, 2),
            });
        }

        // ── Breakdown por forma de pagamento ─────────────────────────────────
        var comandasPeriodo = await comandasBaseQ
            .Include(c => c.User)
            .Where(c => c.PaymentMethod != null)
            .Select(c => new
            {
                c.PaymentMethod,
                c.TotalInCents,
                c.PointsApplied,
                c.SecondPaymentMethod,
                c.SecondPaymentAmountInCents,
                c.ClosedAt,
                ClienteNome = c.User != null ? c.User.Name : null,
            })
            .ToListAsync();

        static string fmtReais(decimal v) => $"R$ {v:F2}".Replace('.', ',');
        var transacoesComanda = comandasPeriodo
            .SelectMany(c =>
            {
                // TotalInCents já sai líquido de PointsApplied/DiscountInCents no fechamento
                // (ComandaService.CloseComandaAsync) — não subtrair de novo aqui.
                var net        = c.TotalInCents;
                var hasSecond  = !string.IsNullOrEmpty(c.SecondPaymentMethod) && c.SecondPaymentAmountInCents > 0;
                var secondAmt  = hasSecond ? c.SecondPaymentAmountInCents : 0;
                var primaryAmt = Math.Max(0, net - secondAmt);
                var label2nd   = hasSecond ? $"+ {c.SecondPaymentMethod} {fmtReais(secondAmt / 100m)}" : null;
                var label1st   = hasSecond ? $"+ {c.PaymentMethod} {fmtReais(primaryAmt / 100m)}" : null;

                var list = new List<TransacaoFinDto>
                {
                    new() { Origem = "Comanda", Cliente = c.ClienteNome,
                            Valor = Math.Round(primaryAmt / 100m, 2), Data = c.ClosedAt!.Value,
                            Nota = label2nd, Forma = c.PaymentMethod! }
                };
                if (hasSecond)
                    list.Add(new TransacaoFinDto
                    {
                        Origem = "Comanda", Cliente = c.ClienteNome,
                        Valor = Math.Round(secondAmt / 100m, 2), Data = c.ClosedAt!.Value,
                        Nota = label1st, Forma = c.SecondPaymentMethod!,
                    });
                return list;
            });

        // Mesmo split de primário/secundário do transacoesComanda acima — sem isso, o valor
        // do segundo método (ex: parte em Pix de um pagamento dividido) desaparecia do
        // breakdown por forma de pagamento, ficando tudo somado só no método principal.
        var transacoesAvulsa = avulsasList
            .SelectMany(v =>
            {
                var origemLabel = v.Origem != "Reserva" ? "PDV" : v.ProductIsPreVenda ? "Pré-venda" : "Site";
                var hasSecond   = !string.IsNullOrEmpty(v.SecondPaymentMethod) && v.SecondPaymentAmountInCents > 0;
                var secondAmt   = hasSecond ? v.SecondPaymentAmountInCents : 0;
                var primaryAmt  = Math.Max(0, v.TotalInCents - secondAmt);
                var label2nd    = hasSecond ? $"+ {v.SecondPaymentMethod} {fmtReais(secondAmt / 100m)}" : null;
                var label1st    = hasSecond ? $"+ {v.PaymentMethod} {fmtReais(primaryAmt / 100m)}" : null;

                var list = new List<TransacaoFinDto>
                {
                    new() { Origem = origemLabel, Cliente = v.ClientName,
                            Valor = Math.Round(primaryAmt / 100m, 2), Data = v.SoldAt,
                            Nota = label2nd, Forma = v.PaymentMethod }
                };
                if (hasSecond)
                    list.Add(new TransacaoFinDto
                    {
                        Origem = origemLabel, Cliente = v.ClientName,
                        Valor = Math.Round(secondAmt / 100m, 2), Data = v.SoldAt,
                        Nota = label1st, Forma = v.SecondPaymentMethod!,
                    });
                return list;
            });

        var todasFormas = transacoesComanda.Concat(transacoesAvulsa)
            .GroupBy(t => t.Forma)
            .Select(g => new FormaPagamentoTotalDto
            {
                Forma      = g.Key,
                Total      = Math.Round(g.Sum(t => t.Valor), 2),
                Quantidade = g.Count(),
                Transacoes = g.OrderByDescending(t => t.Data).ToList(),
            })
            .OrderByDescending(f => f.Total)
            .ToList();

        // ── Top produtos: comandas + PDV com breakdown por origem ─────────────
        // Receita e custo entram pela fração da forma filtrada, igual aos totais — assim a
        // soma dos produtos fecha com o KPI de receita. A QUANTIDADE não é fracionada: o
        // produto saiu do estoque inteiro, independente de como a venda foi paga.
        var topDeComandas = itens
            .GroupBy(i => i.ItemNameSnapshot)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria   = g.First().Categoria,
                Qtd         = g.Sum(i => i.Quantity),
                Receita     = Math.Round(g.Sum(i => (decimal)i.UnitPriceInCents * i.Quantity * i.Fracao) / 100m, 2),
                Custo       = Math.Round(g.Sum(i => (decimal)i.CostPriceSnapshotInCents * i.Quantity * i.Fracao) / 100m, 2),
            });

        var topDePdv = avulsasPdv
            .SelectMany(v => v.Items.Select(i => new { Item = i, Fracao = fracaoVenda[v.Id] }))
            .GroupBy(x => x.Item.ProductName)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria = g.First().Item.ProductCategory ?? "Outros",
                Qtd       = g.Sum(x => x.Item.Quantity),
                Receita   = Math.Round(g.Sum(x => x.Item.UnitPriceInReais * x.Item.Quantity * x.Fracao), 2),
                Custo     = Math.Round(g.Sum(x => (decimal)x.Item.UnitCostInCents * x.Item.Quantity * x.Fracao) / 100m, 2),
            });

        var topDeSite = avulsasSite
            .SelectMany(v => v.Items.Select(i => new { Item = i, Fracao = fracaoVenda[v.Id] }))
            .GroupBy(x => x.Item.ProductName)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria = g.First().Item.ProductCategory ?? "Outros",
                Qtd       = g.Sum(x => x.Item.Quantity),
                Receita   = Math.Round(g.Sum(x => x.Item.UnitPriceInReais * x.Item.Quantity * x.Fracao), 2),
                Custo     = Math.Round(g.Sum(x => (decimal)x.Item.UnitCostInCents * x.Item.Quantity * x.Fracao) / 100m, 2),
            });

        var topDePreVenda = avulsasPreVenda
            .SelectMany(v => v.Items.Select(i => new { Item = i, Fracao = fracaoVenda[v.Id] }))
            .GroupBy(x => x.Item.ProductName)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria = g.First().Item.ProductCategory ?? "Outros",
                Qtd       = g.Sum(x => x.Item.Quantity),
                Receita   = Math.Round(g.Sum(x => x.Item.UnitPriceInReais * x.Item.Quantity * x.Fracao), 2),
                Custo     = Math.Round(g.Sum(x => (decimal)x.Item.UnitCostInCents * x.Item.Quantity * x.Fracao) / 100m, 2),
            });

        var todosNomes = topDeComandas.Keys.Union(topDePdv.Keys).Union(topDeSite.Keys).Union(topDePreVenda.Keys);

        var topProdutos = todosNomes.Select(nome =>
        {
            topDeComandas.TryGetValue(nome, out var c);
            topDePdv.TryGetValue(nome, out var a);
            topDeSite.TryGetValue(nome, out var s);
            topDePreVenda.TryGetValue(nome, out var pv);
            var recC  = c?.Receita ?? 0m;
            var recA  = a?.Receita ?? 0m;
            var recS  = s?.Receita ?? 0m;
            var recPv = pv?.Receita ?? 0m;
            var tot   = recC + recA + recS + recPv;
            var cus   = (c?.Custo ?? 0m) + (a?.Custo ?? 0m) + (s?.Custo ?? 0m) + (pv?.Custo ?? 0m);
            return new TopProductFinDto
            {
                Nome            = nome,
                Categoria       = c?.Categoria ?? a?.Categoria ?? s?.Categoria ?? pv?.Categoria ?? "Outros",
                Qtd             = (c?.Qtd ?? 0) + (a?.Qtd ?? 0) + (s?.Qtd ?? 0) + (pv?.Qtd ?? 0),
                QtdComandas     = c?.Qtd ?? 0,
                QtdAvulsa       = a?.Qtd ?? 0,
                QtdSite         = s?.Qtd ?? 0,
                QtdPreVenda     = pv?.Qtd ?? 0,
                Receita         = Math.Round(tot, 2),
                ReceitaComandas = Math.Round(recC, 2),
                ReceitaAvulsa   = Math.Round(recA, 2),
                ReceitaSite     = Math.Round(recS, 2),
                ReceitaPreVenda = Math.Round(recPv, 2),
                Custo           = Math.Round(cus, 2),
                Margem          = Math.Round(tot - cus, 2),
            };
        })
        .OrderByDescending(t => t.Receita)
        .Take(30)
        .ToList();

        // ── Pagamentos de crediário recebidos no período ──────────────────────
        var pgtoCrediarioPeriodo = await _db.PagamentosCrediario
            .Include(p => p.Crediario).ThenInclude(c => c.User)
            .Where(p => p.CreatedAt >= ini && p.CreatedAt < end)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        var recebidoCrediario = pgtoCrediarioPeriodo.Sum(p => p.ValorEmReais);

        var pagamentosCrediarioPeriodo = pgtoCrediarioPeriodo.Select(p => new PagamentoCrediarioPeriodoDto
        {
            ClienteNome     = p.Crediario?.User?.Name ?? "—",
            ClienteWhatsApp = p.Crediario?.User?.WhatsApp,
            ValorEmReais    = p.ValorEmReais,
            FormaPagamento  = p.FormaPagamento,
            Observacao      = p.Observacao,
            CreatedAt       = p.CreatedAt,
        }).ToList();

        return Ok(new FinanceiroDto
        {
            Receita                    = Math.Round(receita, 2),
            ReceitaComandas            = Math.Round(receitaComandas, 2),
            ReceitaAvulsa              = Math.Round(receitaAvulsa, 2),
            ReceitaSite                = Math.Round(receitaSite, 2),
            ReceitaPreVenda            = Math.Round(receitaPreVenda, 2),
            Custo                      = Math.Round(custo, 2),
            Margem                     = Math.Round(margem, 2),
            MargemPercent              = margemPercent,
            Crediarios                 = Math.Round(crediarios, 2),
            RecebidoCrediario          = Math.Round(recebidoCrediario, 2),
            DiaDia                     = diaDia,
            TopProdutos                = topProdutos,
            PagamentosPorForma         = todasFormas,
            PagamentosCrediarioPeriodo = pagamentosCrediarioPeriodo,
        });
    }
}
