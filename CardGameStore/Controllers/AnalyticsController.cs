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
    // Insights por cliente: gasto, ticket médio, inatividade
    // -------------------------------------------------------------------------
    [HttpGet("clientes")]
    public async Task<ActionResult<List<ClienteInsightDto>>> GetClienteInsights(
        [FromQuery] bool apenasInativos = false)
    {
        var ha30Dias = DateTime.UtcNow.AddDays(-30);

        var usuarios = await _db.Users
            .Where(u => u.IsActive && u.Role == UserRole.Customer)
            .Select(u => new { u.Id, u.Name, u.Email, u.WhatsApp, u.PointsBalance, u.PointsExpiresAt })
            .ToListAsync();

        var estatisticas = await _db.Comandas
            .Where(c => c.Status == ComandaStatus.Fechada && c.ClosedAt != null)
            .GroupBy(c => c.UserId)
            .Select(g => new
            {
                UserId       = g.Key,
                NumVisitas   = g.Count(),
                GastoTotal   = g.Sum(c => c.TotalInCents) / 100m,
                UltimaVisita = (DateTime?)g.Max(c => c.ClosedAt),
            })
            .ToListAsync();

        var statsDict = estatisticas.ToDictionary(e => e.UserId);
        var insights = usuarios.Select(u =>
        {
            statsDict.TryGetValue(u.Id, out var stats);
            var ultima = stats?.UltimaVisita;
            int? pontosVencemEm = u.PointsExpiresAt.HasValue
                ? (int)Math.Round((u.PointsExpiresAt.Value - DateTime.UtcNow).TotalDays)
                : null;
            return new ClienteInsightDto
            {
                UserId        = u.Id,
                Nome          = u.Name,
                Email         = u.Email,
                WhatsApp      = u.WhatsApp,
                GastoTotal    = stats?.GastoTotal ?? 0,
                TicketMedio   = stats is { NumVisitas: > 0 }
                    ? Math.Round(stats.GastoTotal / stats.NumVisitas, 2) : 0,
                NumVisitas    = stats?.NumVisitas ?? 0,
                UltimaVisita  = ultima,
                Inativo30     = ultima == null || ultima < ha30Dias,
                Pontos        = u.PointsBalance,
                PontosVencemEm = pontosVencemEm,
            };
        })
        .Where(i => !apenasInativos || i.Inativo30)
        .OrderByDescending(i => i.GastoTotal)
        .ToList();

        return Ok(insights);
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
        var receitaComandas = await comandasBaseQ
            .SumAsync(c => (decimal)c.TotalInCents) / 100m;

        // ── Vendas avulsas (MongoDB) ──────────────────────────────────────────
        var todasVendas = (await _vendas.GetRecentAsync(2000, ini)).ToList();
        var avulsasPeriodo = todasVendas
            .Where(v => v.SoldAt >= ini && v.SoldAt < end);

        if (hasPmFilter)
            avulsasPeriodo = avulsasPeriodo.Where(v =>
                v.PaymentMethod == filterPaymentMethod ||
                v.SecondPaymentMethod == filterPaymentMethod);

        var avulsasList = avulsasPeriodo.ToList();

        // ── Separa venda homologada do site (Origem == "Reserva") de venda de balcão comum,
        // e dentro do site ainda separa "Site" × "Pré-venda" pela tag do produto (mesma
        // divisão das colunas Vendas × Pré-vendas no kanban de Pedidos).
        var avulsasPdv      = avulsasList.Where(v => v.Origem != "Reserva").ToList();
        var avulsasSite     = avulsasList.Where(v => v.Origem == "Reserva" && !v.ProductIsPreVenda).ToList();
        var avulsasPreVenda = avulsasList.Where(v => v.Origem == "Reserva" && v.ProductIsPreVenda).ToList();
        var receitaAvulsa   = avulsasPdv.Sum(v => (decimal)v.TotalInCents) / 100m;
        var receitaSite     = avulsasSite.Sum(v => (decimal)v.TotalInCents) / 100m;
        var receitaPreVenda = avulsasPreVenda.Sum(v => (decimal)v.TotalInCents) / 100m;

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
                Categoria                = i.Product!.Category,
            })
            .ToListAsync();

        var itens = hasPmFilter
            ? itensRaw.Where(i =>
                i.ComandaPaymentMethod == filterPaymentMethod ||
                i.ComandaSecondPayment == filterPaymentMethod).ToList()
            : itensRaw;

        var custoComandas = itens
            .Sum(i => (decimal)i.CostPriceSnapshotInCents * i.Quantity) / 100m;

        var custoAvulsa = avulsasPdv
            .SelectMany(v => v.Items)
            .Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m;

        var custoSite = avulsasSite
            .SelectMany(v => v.Items)
            .Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m;

        var custoPreVenda = avulsasPreVenda
            .SelectMany(v => v.Items)
            .Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m;

        var custo = custoComandas + custoAvulsa + custoSite + custoPreVenda;
        var margem        = receita - custo;
        var margemPercent = custo > 0 ? Math.Round(margem / custo * 100, 1) : 0;

        // ── Crediários em aberto ──────────────────────────────────────────────
        var crediarios = await _db.Crediarios
            .Where(c => c.Status == CrediariosStatus.Aberto)
            .SumAsync(c => (decimal)(c.ValorEmCentavos - c.ValorPagoEmCentavos)) / 100m;

        // ── Breakdown dia a dia ───────────────────────────────────────────────
        var comandasDoPeriodo = await comandasBaseQ
            .Select(c => new { c.ClosedAt, c.TotalInCents })
            .ToListAsync();

        var totalDias = (int)(dataBrFim - dataBrIni).TotalDays + 1;
        var diaDia    = new List<DiaFinanceiroDto>();

        for (var d = 0; d < totalDias; d++)
        {
            var dBr  = dataBrIni.AddDays(d);
            var dIni = BrDateToUtcStart(dBr);
            var dFim = BrDateToUtcStart(dBr.AddDays(1));

            var rComanda = comandasDoPeriodo
                .Where(c => c.ClosedAt >= dIni && c.ClosedAt < dFim)
                .Sum(c => (decimal)c.TotalInCents) / 100m;

            var rAvulsa = avulsasList
                .Where(v => v.SoldAt >= dIni && v.SoldAt < dFim)
                .Sum(v => (decimal)v.TotalInCents) / 100m;

            var cComandaDia = itens
                .Where(i => i.ComandaClosedAt >= dIni && i.ComandaClosedAt < dFim)
                .Sum(i => (decimal)i.CostPriceSnapshotInCents * i.Quantity) / 100m;

            var cAvulsaDia = avulsasList
                .Where(v => v.SoldAt >= dIni && v.SoldAt < dFim)
                .SelectMany(v => v.Items)
                .Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m;

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
        var topDeComandas = itens
            .GroupBy(i => i.ItemNameSnapshot)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria   = g.First().Categoria,
                Qtd         = g.Sum(i => i.Quantity),
                Receita     = Math.Round(g.Sum(i => (decimal)i.UnitPriceInCents * i.Quantity) / 100m, 2),
                Custo       = Math.Round(g.Sum(i => (decimal)i.CostPriceSnapshotInCents * i.Quantity) / 100m, 2),
            });

        var topDePdv = avulsasPdv
            .SelectMany(v => v.Items)
            .GroupBy(i => i.ProductName)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria = g.First().ProductCategory ?? "Outros",
                Qtd       = g.Sum(i => i.Quantity),
                Receita   = Math.Round(g.Sum(i => i.UnitPriceInReais * i.Quantity), 2),
                Custo     = Math.Round(g.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m, 2),
            });

        var topDeSite = avulsasSite
            .SelectMany(v => v.Items)
            .GroupBy(i => i.ProductName)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria = g.First().ProductCategory ?? "Outros",
                Qtd       = g.Sum(i => i.Quantity),
                Receita   = Math.Round(g.Sum(i => i.UnitPriceInReais * i.Quantity), 2),
                Custo     = Math.Round(g.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m, 2),
            });

        var topDePreVenda = avulsasPreVenda
            .SelectMany(v => v.Items)
            .GroupBy(i => i.ProductName)
            .ToDictionary(g => g.Key, g => new
            {
                Categoria = g.First().ProductCategory ?? "Outros",
                Qtd       = g.Sum(i => i.Quantity),
                Receita   = Math.Round(g.Sum(i => i.UnitPriceInReais * i.Quantity), 2),
                Custo     = Math.Round(g.Sum(i => (decimal)i.UnitCostInCents * i.Quantity) / 100m, 2),
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
