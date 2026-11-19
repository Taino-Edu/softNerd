// =============================================================================
// PrecoCartasService.cs — preço de referência das cartas avulsas (v1.92.0, chave "preco-referencia-cartas")
//
// Pedido do Taino (19/11): "os preços atualizam e as cartas mudam" — o Mercado precisa de uma referência
// de preço que se atualiza sozinha, pra todos os jogos. Uma rodada (robô diário ou o botão do painel):
//   1. cotação do dólar (PTAX do Banco Central); cotação degradada = NÃO precifica (melhor ficar com o
//      preço de ontem do que converter por um número inventado);
//   2. preços do dia por coleção no catálogo (tcgcsv/TCGplayer), uma leitura por coleção;
//   3. cada carta ligada ao catálogo ganha a referência em reais e uma linha no histórico do dia;
//   4. só as cartas com "ajustar sozinho" (CartaPrecoAutomatico) têm o preço de venda trocado pela
//      sugestão da regra da loja. O padrão é só sugerir — quem decide é o Maikon.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

/// <summary>Cotação do dólar (o CurrencyService implementa; os testes passam uma fixa).</summary>
public interface IFonteCotacao
{
    Task<CotacaoUsdBrl> GetCotacaoAsync();
}

public sealed record ResultadoRodadaPreco(bool Rodou, string Mensagem, int Cartas, int Atualizadas, int PrecosTrocados,
    int SemPreco, int ColecoesComErro, decimal? Cotacao);

public sealed record VariacaoPreco(Guid ProductId, int? ReferenciaCentavos, DateTime? ReferenciaEm, int? Ha7Dias, int? Ha30Dias);

public sealed record ReferenciaAgora(decimal? MercadoUsd, string? Variante, decimal Cotacao, bool CotacaoDegradada,
    string? AvisoCotacao, int? ReferenciaCentavos, int? SugestaoCentavos, IReadOnlyList<PrecoCatalogo> Precos);

public class PrecoCartasService
{
    /// <summary>Marco gravado no fim de cada rodada completa — o robô usa pra rodar uma vez por dia.</summary>
    public const string MarcoRodada = "preco-cartas";

    private readonly AppDbContext _db;
    private readonly ICatalogoCartas _catalogo;
    private readonly IFonteCotacao _cotacao;
    private readonly FuncionalidadesService _funcionalidades;
    private readonly ILogger<PrecoCartasService> _logger;

    public PrecoCartasService(AppDbContext db, ICatalogoCartas catalogo, IFonteCotacao cotacao,
        FuncionalidadesService funcionalidades, ILogger<PrecoCartasService> logger)
    {
        _db = db; _catalogo = catalogo; _cotacao = cotacao; _funcionalidades = funcionalidades; _logger = logger;
    }

    // ── Regra da loja ───────────────────────────────────────────────────────────

    public async Task<CartaRegraPreco> RegraAsync() =>
        await _db.CartaRegraPreco.AsNoTracking().FirstOrDefaultAsync(r => r.Id == CartaRegraPreco.IdUnico) ?? new CartaRegraPreco();

    public async Task<CartaRegraPreco> SalvarRegraAsync(decimal fatorPercent, int arredondarCentavos, int minimoCentavos)
    {
        if (fatorPercent is < 10 or > 500) throw new ArgumentException("A porcentagem da referência deve ficar entre 10% e 500%.");
        if (arredondarCentavos is < 1 or > 1000) throw new ArgumentException("Arredondamento entre R$ 0,01 e R$ 10,00.");
        if (minimoCentavos is < 0 or > 100_000) throw new ArgumentException("Preço mínimo entre R$ 0,00 e R$ 1.000,00.");
        var regra = await _db.CartaRegraPreco.FirstOrDefaultAsync(r => r.Id == CartaRegraPreco.IdUnico);
        if (regra is null) { regra = new CartaRegraPreco(); _db.CartaRegraPreco.Add(regra); }
        regra.FatorPercent = fatorPercent;
        regra.ArredondarCentavos = arredondarCentavos;
        regra.MinimoCentavos = minimoCentavos;
        regra.AtualizadaEm = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return regra;
    }

    /// <summary>Referência em reais (centavos): dólar × cotação, arredondado no centavo.</summary>
    public static int ReferenciaCentavos(decimal usd, decimal cotacao) =>
        (int)Math.Round(usd * cotacao * 100m, MidpointRounding.AwayFromZero);

    /// <summary>Preço sugerido pela regra: % da referência, arredondado pra cima no múltiplo, nunca abaixo do mínimo.</summary>
    public static int Sugestao(int referenciaCentavos, CartaRegraPreco regra)
    {
        var bruto = referenciaCentavos * regra.FatorPercent / 100m;
        var passo = Math.Max(1, regra.ArredondarCentavos);
        var arredondado = (int)(Math.Ceiling(bruto / passo) * passo);
        return Math.Max(arredondado, regra.MinimoCentavos);
    }

    /// <summary>O preço da variante escolhida; sem variante (ou sem preço nela), o primeiro com preço.</summary>
    public static PrecoCatalogo? PrecoDaVariante(IReadOnlyList<PrecoCatalogo> precos, string? variante) =>
        (variante is null ? null : precos.FirstOrDefault(p => p.Variante == variante && p.Referencia is not null))
        ?? (variante is null ? precos.FirstOrDefault(p => p.Referencia is not null) : null);

    // ── Na hora do cadastro ─────────────────────────────────────────────────────

    /// <summary>Referência e sugestão de uma carta do catálogo, agora (o cadastro mostra antes de salvar).</summary>
    public async Task<ReferenciaAgora> ReferenciaAgoraAsync(int categoria, int grupo, int produtoId, string? variante, CancellationToken ct = default)
    {
        var cot = await _cotacao.GetCotacaoAsync();
        var precos = (await _catalogo.PrecosAsync(categoria, grupo, ct)).GetValueOrDefault(produtoId) ?? [];
        var preco = PrecoDaVariante(precos, variante);
        int? referencia = preco?.Referencia is { } usd && !cot.Degradada ? ReferenciaCentavos(usd, cot.Valor) : null;
        int? sugestao = referencia is { } r ? Sugestao(r, await RegraAsync()) : null;
        return new ReferenciaAgora(preco?.Referencia, preco?.Variante, cot.Valor, cot.Degradada, cot.Aviso, referencia, sugestao, precos);
    }

    // ── Rodada (robô diário e botão "Atualizar agora") ──────────────────────────

    public async Task<ResultadoRodadaPreco> AtualizarAsync(IReadOnlyCollection<Guid>? soEstas = null, CancellationToken ct = default)
    {
        if (!await _funcionalidades.LigadaAsync(Funcionalidades.PrecoReferenciaCartas))
            return new(false, "Chave \"Preço de referência das cartas\" desligada.", 0, 0, 0, 0, 0, null);

        var q = _db.Products.Where(p => p.CartaAvulsa && p.IsActive && p.CartaTcgProdutoId != null
                                        && p.CartaTcgCategoria != null && p.CartaTcgGrupo != null);
        if (soEstas is { Count: > 0 }) q = q.Where(p => soEstas.Contains(p.Id));
        var cartas = await q.ToListAsync(ct);
        if (cartas.Count == 0)
            return new(true, "Nenhuma carta ligada ao catálogo.", 0, 0, 0, 0, 0, null);

        var cot = await _cotacao.GetCotacaoAsync();
        if (cot.Degradada)
            return new(false, cot.Aviso ?? "Cotação do dólar indisponível — nada foi atualizado.", cartas.Count, 0, 0, 0, 0, cot.Valor);

        var regra = await RegraAsync();
        var agora = DateTime.UtcNow;
        var dia = DateTime.SpecifyKind(Brasilia.Hoje(), DateTimeKind.Utc);
        var ids = cartas.Select(c => c.Id).ToList();
        var historicoHoje = await _db.CartaPrecoHistorico.Where(h => ids.Contains(h.ProductId) && h.Dia == dia)
            .ToDictionaryAsync(h => h.ProductId, ct);

        int atualizadas = 0, trocados = 0, semPreco = 0, erros = 0;
        foreach (var colecao in cartas.GroupBy(c => (Categoria: c.CartaTcgCategoria!.Value, Grupo: c.CartaTcgGrupo!.Value)))
        {
            IReadOnlyDictionary<int, IReadOnlyList<PrecoCatalogo>> precos;
            try { precos = await _catalogo.PrecosAsync(colecao.Key.Categoria, colecao.Key.Grupo, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                erros++;
                _logger.LogWarning(ex, "Preço das cartas: coleção {Categoria}/{Grupo} não respondeu", colecao.Key.Categoria, colecao.Key.Grupo);
                continue;
            }

            foreach (var carta in colecao)
            {
                var preco = PrecoDaVariante(precos.GetValueOrDefault(carta.CartaTcgProdutoId!.Value) ?? [], carta.CartaTcgVariante);
                if (preco?.Referencia is not { } usd) { semPreco++; continue; }

                var referencia = ReferenciaCentavos(usd, cot.Valor);
                carta.CartaRefUsd = usd;
                carta.CartaRefCentavos = referencia;
                carta.CartaRefEm = agora;
                atualizadas++;

                if (historicoHoje.TryGetValue(carta.Id, out var h))
                { h.MercadoUsd = usd; h.Cotacao = cot.Valor; h.ReferenciaCentavos = referencia; h.CriadoEm = agora; }
                else
                {
                    h = new CartaPrecoHistorico { ProductId = carta.Id, Dia = dia, MercadoUsd = usd, Cotacao = cot.Valor, ReferenciaCentavos = referencia };
                    _db.CartaPrecoHistorico.Add(h);
                    historicoHoje[carta.Id] = h;
                }

                if (carta.CartaPrecoAutomatico)
                {
                    var novo = Sugestao(referencia, regra);
                    if (novo != carta.PriceInCents)
                    {
                        _logger.LogInformation("Preço das cartas: {Nome} {De} → {Para} centavos (referência {Ref})",
                            carta.Name, carta.PriceInCents, novo, referencia);
                        carta.PriceInCents = novo;
                        carta.UpdatedAt = agora;
                        trocados++;
                    }
                }
            }
        }

        // Rodada inteira (sem filtro) marca o dia — o robô não roda de novo hoje
        if (soEstas is null or { Count: 0 })
        {
            var marco = await _db.MarcosOperacao.FirstOrDefaultAsync(m => m.Chave == MarcoRodada, ct);
            if (marco is null) { marco = new MarcoOperacao { Chave = MarcoRodada }; _db.MarcosOperacao.Add(marco); }
            marco.Quando = agora;
            marco.Detalhe = $"{atualizadas}/{cartas.Count} cartas, {trocados} preços trocados, cotação {cot.Valor:0.0000}";
        }

        await _db.SaveChangesAsync(ct);
        var msg = $"{atualizadas} de {cartas.Count} cartas com referência nova" +
                  (trocados > 0 ? $", {trocados} preços ajustados" : "") +
                  (semPreco > 0 ? $", {semPreco} sem preço no catálogo" : "") +
                  (erros > 0 ? $", {erros} coleções não responderam" : "") + ".";
        return new(true, msg, cartas.Count, atualizadas, trocados, semPreco, erros, cot.Valor);
    }

    // ── Variação ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Referência atual e a de 7 e 30 dias atrás de cada carta: a linha mais recente até aquele dia, dentro de uma folga
    /// curta (7 → até 10 dias atrás; 30 → até 37) — sem isso, a carta com só um preço de 31 dias mostrava ele como "7d".
    /// </summary>
    public async Task<IReadOnlyList<VariacaoPreco>> VariacoesAsync(CancellationToken ct = default)
    {
        var cartas = await _db.Products.AsNoTracking().Where(p => p.CartaAvulsa && p.CartaTcgProdutoId != null)
            .Select(p => new { p.Id, p.CartaRefCentavos, p.CartaRefEm }).ToListAsync(ct);
        if (cartas.Count == 0) return [];
        var hoje = DateTime.SpecifyKind(Brasilia.Hoje(), DateTimeKind.Utc);
        var desde = hoje.AddDays(-45);
        var ids = cartas.Select(c => c.Id).ToList();
        var historico = (await _db.CartaPrecoHistorico.AsNoTracking()
                .Where(h => ids.Contains(h.ProductId) && h.Dia >= desde)
                .Select(h => new { h.ProductId, h.Dia, h.ReferenciaCentavos }).ToListAsync(ct))
            .GroupBy(h => h.ProductId).ToDictionary(g => g.Key, g => g.OrderByDescending(h => h.Dia).ToList());

        int? Em(Guid id, int dias)
        {
            var ate = hoje.AddDays(-dias);
            var desdeJanela = ate.AddDays(-Math.Max(3, dias / 4));
            return historico.TryGetValue(id, out var l)
                ? l.FirstOrDefault(h => h.Dia <= ate && h.Dia >= desdeJanela)?.ReferenciaCentavos : null;
        }

        return cartas.Select(c => new VariacaoPreco(c.Id, c.CartaRefCentavos, c.CartaRefEm, Em(c.Id, 7), Em(c.Id, 30))).ToList();
    }
}
