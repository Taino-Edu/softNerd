// =============================================================================
// RelatoriosController.cs — Relatórios de vendas por categoria e produto
//
// GET /api/relatorios/vendas?mes=5&ano=2026
//   Combina:
//   • Comanda items  (PostgreSQL) — comandas Fechadas no mês
//   • VendaAvulsa items (MongoDB) — vendas de balcão no mês
//   Agrupa por categoria → produto, soma quantidades e totais.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using System.Linq;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/relatorios")]
[Authorize(Policy = "AdminOnly")]
public class RelatoriosController : ControllerBase
{
    // Fuso de Brasília: um lugar só (Common/Brasilia.cs)
    private static readonly TimeZoneInfo BrazilZone = Common.Brasilia.Zona;

    private readonly AppDbContext                   _db;
    private readonly IMongoCollection<VendaAvulsa> _vendas;

    public RelatoriosController(AppDbContext db, IMongoDatabase mongo)
    {
        _db     = db;
        _vendas = mongo.GetCollection<VendaAvulsa>("vendas_avulsas");
    }

    // -------------------------------------------------------------------------
    // GET /api/relatorios/vendas?mes=5&ano=2026
    // -------------------------------------------------------------------------
    [HttpGet("vendas")]
    public async Task<ActionResult<RelatorioVendasDto>> Vendas(
        [FromQuery] int mes = 0,
        [FromQuery] int ano = 0)
    {
        var agoraBr = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        if (mes <= 0 || mes > 12) mes = agoraBr.Month;
        if (ano <= 0)             ano = agoraBr.Year;

        var inicioLocal = new DateTime(ano, mes, 1);
        var inicio = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(inicioLocal, DateTimeKind.Unspecified), BrazilZone);
        var fim    = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(inicioLocal.AddMonths(1), DateTimeKind.Unspecified), BrazilZone);

        // Cadastro de categorias: emoji e pai de cada uma. O produto guarda só o NOME da folha
        // (Product.Category, sem FK), então o pai sai cruzando esse nome com o cadastro.
        var cadastro = await _db.ProductCategories.AsNoTracking()
            .Select(c => new { c.Id, c.Name, c.Emoji, c.ParentCategoryId })
            .ToListAsync();
        var categorias = cadastro
            .GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Emoji ?? "📦", StringComparer.OrdinalIgnoreCase);

        // ── 1. Itens de Comandas Fechadas no mês ─────────────────────────────
        var comandaItems = await _db.ComandaItems
            .Include(i => i.Product)
            .Include(i => i.Comanda)
            .Where(i =>
                i.Comanda.Status == ComandaStatus.Fechada &&
                i.Comanda.ClosedAt.HasValue &&
                i.Comanda.ClosedAt.Value >= inicio &&
                i.Comanda.ClosedAt.Value < fim)
            .ToListAsync();

        // ── 2. VendasAvulsas no mês (MongoDB) ────────────────────────────────
        var filter = Builders<VendaAvulsa>.Filter.And(
            Builders<VendaAvulsa>.Filter.Gte(v => v.SoldAt, inicio),
            Builders<VendaAvulsa>.Filter.Lt(v => v.SoldAt, fim));
        // Venda estornada sai do relatório, como no resto do financeiro
        var vendasAvulsas = (await _vendas.Find(filter).ToListAsync()).Where(v => !v.Cancelada).ToList();

        // ── 3. Acumula em dicionário categoria → produto → (qty, total) ───────
        // Estrutura: dict[categoria][produto] = (qty, totalCentavos)
        var dict = new Dictionary<string, Dictionary<string, (int qty, long totalCents)>>(StringComparer.OrdinalIgnoreCase);

        void Acumular(string cat, string nome, int qty, int unitCents)
        {
            if (!dict.TryGetValue(cat, out var prods))
            {
                prods = new Dictionary<string, (int, long)>(StringComparer.OrdinalIgnoreCase);
                dict[cat] = prods;
            }
            var subtotal = (long)qty * unitCents;
            if (prods.TryGetValue(nome, out var cur))
                prods[nome] = (cur.qty + qty, cur.totalCents + subtotal);
            else
                prods[nome] = (qty, subtotal);
        }

        // Comandas
        foreach (var item in comandaItems)
        {
            var cat = item.ProductId.HasValue
                ? (item.Product?.Category ?? "Outros")
                : (item.CardCacheId != null ? "Cartas TCG" : "Outros");

            Acumular(cat, item.ItemNameSnapshot, item.Quantity, item.UnitPriceInCents);
        }

        // Vendas avulsas (MongoDB)
        foreach (var venda in vendasAvulsas)
        foreach (var item in venda.Items)
        {
            var cat = string.IsNullOrWhiteSpace(item.ProductCategory)
                ? "Outros"
                : item.ProductCategory;

            Acumular(cat, item.ProductName, item.Quantity, item.UnitPriceInCents);
        }

        // ── 4. Projeta em DTO ─────────────────────────────────────────────────
        var porCategoria = dict
            .Select(kv =>
            {
                var produtos = kv.Value
                    .Select(p => new RelatorioProduto
                    {
                        Nome              = p.Key,
                        QuantidadeVendida = p.Value.qty,
                        TotalEmReais      = p.Value.totalCents / 100m,
                    })
                    .OrderByDescending(p => p.QuantidadeVendida)
                    .ToList();

                return new RelatorioCategoria
                {
                    Categoria         = kv.Key,
                    Emoji             = categorias.GetValueOrDefault(kv.Key, "📦"),
                    QuantidadeVendida = produtos.Sum(p => p.QuantidadeVendida),
                    TotalEmReais      = produtos.Sum(p => p.TotalEmReais),
                    Produtos          = produtos,
                };
            })
            .OrderByDescending(c => c.QuantidadeVendida)
            .ToList();

        // ── 5. Agrupa as subcategorias debaixo da categoria-pai ───────────────
        var grupos = AgruparPorCategoriaPai(porCategoria,
            cadastro.Select(c => new CategoriaCadastrada(c.Id, c.Name, c.Emoji, c.ParentCategoryId)).ToList());

        return Ok(new RelatorioVendasDto
        {
            Mes                = mes,
            Ano                = ano,
            TotalGeralEmReais  = porCategoria.Sum(c => c.TotalEmReais),
            TotalItensVendidos = porCategoria.Sum(c => c.QuantidadeVendida),
            PorCategoria       = porCategoria,
            Grupos             = grupos,
        });
    }

    public sealed record CategoriaCadastrada(Guid Id, string Nome, string? Emoji, Guid? PaiId);

    /// <summary>
    /// Põe cada categoria do relatório debaixo da categoria-pai. A linha do pai é SEMPRE a soma
    /// das filhas (item vendido direto no pai entra como uma "filha" com o mesmo nome). Nome
    /// repetido em famílias diferentes não dá pra saber de quem é: fica no próprio grupo em vez
    /// de somar no pai errado. Categoria fora do cadastro ("Outros", "Cartas TCG") é o próprio grupo.
    /// </summary>
    public static List<RelatorioGrupoCategoria> AgruparPorCategoriaPai(
        IReadOnlyList<RelatorioCategoria> porCategoria, IReadOnlyList<CategoriaCadastrada> cadastro)
    {
        var nomePorId = cadastro.ToDictionary(c => c.Id, c => c.Nome);
        string PaiDe(string cat)
        {
            var pais = cadastro
                .Where(c => string.Equals(c.Nome, cat, StringComparison.OrdinalIgnoreCase))
                .Select(c => c.PaiId)
                .Distinct()
                .ToList();
            return pais is [Guid paiId] && nomePorId.TryGetValue(paiId, out var nomePai) ? nomePai : cat;
        }
        string EmojiDe(string nome) =>
            cadastro.FirstOrDefault(c => string.Equals(c.Nome, nome, StringComparison.OrdinalIgnoreCase))?.Emoji ?? "📦";

        return porCategoria
            .GroupBy(c => PaiDe(c.Categoria), StringComparer.OrdinalIgnoreCase)
            .Select(g => new RelatorioGrupoCategoria
            {
                Categoria         = g.Key,
                Emoji             = EmojiDe(g.Key),
                QuantidadeVendida = g.Sum(c => c.QuantidadeVendida),
                TotalEmReais      = g.Sum(c => c.TotalEmReais),
                Subcategorias     = g.OrderByDescending(c => c.QuantidadeVendida).ToList(),
            })
            .OrderByDescending(g => g.QuantidadeVendida)
            .ToList();
    }

    // -------------------------------------------------------------------------
    // GET /api/relatorios/crediario?mes=5&ano=2026
    // -------------------------------------------------------------------------
    [HttpGet("crediario")]
    public async Task<ActionResult<RelatorioCrediarioDto>> Crediario(
        [FromQuery] int mes = 0,
        [FromQuery] int ano = 0)
    {
        var agoraBr2 = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        if (mes <= 0 || mes > 12) mes = agoraBr2.Month;
        if (ano <= 0)             ano = agoraBr2.Year;

        var mesInicioLocal = new DateTime(ano, mes, 1);
        var iniciomes = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(mesInicioLocal, DateTimeKind.Unspecified), BrazilZone);
        var fimMes    = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(mesInicioLocal.AddMonths(1), DateTimeKind.Unspecified), BrazilZone);

        // ── 1. Todos os crediários abertos (situação atual) ───────────────────
        var abertos = await _db.Crediarios
            .Include(c => c.User)
            .Where(c => c.Status == CrediariosStatus.Aberto)
            .ToListAsync();

        var agr = DateTime.UtcNow;
        var devedores = abertos
            .Select(c =>
            {
                var vencido    = c.DataVencimento < agr;
                var diasAtraso = vencido ? (int)(agr - c.DataVencimento).TotalDays : 0;
                return new DevedorDto
                {
                    UserId         = c.UserId,
                    Nome           = c.User?.Name ?? "—",
                    Email          = c.User?.Email,
                    WhatsApp       = c.User?.WhatsApp,
                    SaldoEmReais   = c.SaldoRestanteEmReais,
                    Vencido        = vencido,
                    DiasAtraso     = diasAtraso,
                    DataVencimento = c.DataVencimento,
                };
            })
            .OrderByDescending(d => d.Vencido)
            .ThenByDescending(d => d.SaldoEmReais)
            .ToList();

        // ── 2. Pagamentos registrados no mês ──────────────────────────────────
        var pagamentosMes = await _db.PagamentosCrediario
            .Include(p => p.Crediario).ThenInclude(c => c.User)
            .Where(p => p.CreatedAt >= iniciomes && p.CreatedAt < fimMes)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        var pagamentosMesDto = pagamentosMes.Select(p => new PagamentoMesDto
        {
            ClienteNome    = p.Crediario?.User?.Name ?? "—",
            ValorEmReais   = p.ValorEmReais,
            FormaPagamento = p.FormaPagamento,
            Observacao     = p.Observacao,
            CreatedAt      = p.CreatedAt,
        }).ToList();

        var vencidos = abertos.Where(c => c.DataVencimento < agr).ToList();

        return Ok(new RelatorioCrediarioDto
        {
            Mes                 = mes,
            Ano                 = ano,
            TotalEmAbertoEmReais = abertos.Sum(c => c.SaldoRestanteEmReais),
            TotalVencidoEmReais  = vencidos.Sum(c => c.SaldoRestanteEmReais),
            QtdAbertos           = abertos.Count,
            QtdVencidos          = vencidos.Count,
            RecebidoNoMesEmReais = pagamentosMes.Sum(p => p.ValorEmReais),
            QtdPagamentosNoMes   = pagamentosMes.Count,
            Devedores            = devedores,
            PagamentosNoMes      = pagamentosMesDto,
        });
    }
}
