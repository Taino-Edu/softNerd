// =============================================================================
// RelatoriosBancoController.cs — relatórios que moram em FUNÇÕES do PostgreSQL
//
// GET  /api/relatorios/banco/estoque-baixo                 → fn_estoque_baixo()
// GET  /api/relatorios/banco/fechamento?dia=2026-11-07     → fn_fechamento_comandas(dia)
// GET  /api/relatorios/banco/crediario-saldo?userId=       → fn_saldo_crediario(userId)
// GET  /api/relatorios/banco/estoque-movimentos?produtoId= → tabela estoque_movimentos (trigger de auditoria)
// POST /api/relatorios/banco/manutencao                    → CALL pr_manutencao_banco() (só o dono)
//
// As funções, o trigger e a procedure estão em Data/Inicializacao/postgres.sql (PIM IV, etapa 7) e só existem
// no Postgres: no SQLite de desenvolvimento cada rota responde 501. Nenhuma regra do sistema depende delas;
// estas rotas só LEEM (menos a manutenção, que limpa sessões e movimentos antigos).
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

public class EstoqueBaixoLinhaDto
{
    public Guid ProductId { get; set; }
    public string Nome { get; set; } = "";
    public string Categoria { get; set; } = "";
    public int Estoque { get; set; }
    public int Minimo { get; set; }
    public int Faltam { get; set; }
}

public class FechamentoFormaDto
{
    public string FormaPagamento { get; set; } = "";
    public int Comandas { get; set; }
    public long TotalCentavos { get; set; }
}

public class SaldoCrediarioDto
{
    public Guid CrediarioId { get; set; }
    public Guid UserId { get; set; }
    public string Cliente { get; set; } = "";
    public int ValorCentavos { get; set; }
    public int PagoCentavos { get; set; }
    public int SaldoCentavos { get; set; }
    public DateTime Vencimento { get; set; }
    public bool Vencido { get; set; }
}

public class MovimentoEstoqueDto
{
    public long Id { get; set; }
    public Guid ProductId { get; set; }
    public Guid? VariantId { get; set; }
    public int EstoqueAntes { get; set; }
    public int EstoqueDepois { get; set; }
    public int Delta { get; set; }
    public string Origem { get; set; } = "";
    public DateTime Quando { get; set; }
}

public class MarcoManutencaoDto
{
    public DateTime Quando { get; set; }
    public string? Detalhe { get; set; }
}

[ApiController]
[Route("api/relatorios/banco")]
[Produces("application/json")]
[Authorize(Policy = "AdminOnly")]
public class RelatoriosBancoController : ControllerBase
{
    private readonly AppDbContext _db;
    public RelatoriosBancoController(AppDbContext db) { _db = db; }

    private ObjectResult SoNoPostgres() => StatusCode(501, new
    {
        Message = "Este relatório usa funções do PostgreSQL e não existe no banco de desenvolvimento (SQLite).",
    });

    private bool EhPostgres => _db.Database.IsNpgsql();

    /// <summary>Produtos ativos no estoque mínimo ou abaixo, do mais urgente ao menos.</summary>
    [HttpGet("estoque-baixo")]
    public async Task<IActionResult> EstoqueBaixo(CancellationToken ct)
    {
        if (!EhPostgres) return SoNoPostgres();
        var linhas = await _db.Database.SqlQueryRaw<EstoqueBaixoLinhaDto>(
            """
            SELECT product_id AS "ProductId", nome AS "Nome", categoria AS "Categoria",
                   estoque AS "Estoque", minimo AS "Minimo", faltam AS "Faltam"
            FROM fn_estoque_baixo()
            """).ToListAsync(ct);
        return Ok(linhas);
    }

    /// <summary>Comandas fechadas num dia (calendário de Brasília) por forma de pagamento. Sem o dia, usa hoje.</summary>
    [HttpGet("fechamento")]
    public async Task<IActionResult> Fechamento([FromQuery] DateOnly? dia, CancellationToken ct)
    {
        if (!EhPostgres) return SoNoPostgres();
        var d = dia ?? DateOnly.FromDateTime(Brasilia.Hoje());
        var linhas = await _db.Database.SqlQueryRaw<FechamentoFormaDto>(
            """
            SELECT forma_pagamento AS "FormaPagamento", comandas AS "Comandas", total_centavos AS "TotalCentavos"
            FROM fn_fechamento_comandas({0})
            """, d).ToListAsync(ct);
        return Ok(new
        {
            Dia = d,
            TotalCentavos = linhas.Sum(l => l.TotalCentavos),
            Formas = linhas,
        });
    }

    /// <summary>Crediários em aberto com saldo e se já venceram. Sem userId, todos os clientes.</summary>
    [HttpGet("crediario-saldo")]
    public async Task<IActionResult> CrediarioSaldo([FromQuery] Guid? userId, CancellationToken ct)
    {
        if (!EhPostgres) return SoNoPostgres();
        const string colunas =
            """
            SELECT crediario_id AS "CrediarioId", user_id AS "UserId", cliente AS "Cliente",
                   valor_centavos AS "ValorCentavos", pago_centavos AS "PagoCentavos",
                   saldo_centavos AS "SaldoCentavos", vencimento AS "Vencimento", vencido AS "Vencido"
            """;
        var linhas = userId is null
            ? await _db.Database.SqlQueryRaw<SaldoCrediarioDto>(colunas + " FROM fn_saldo_crediario()").ToListAsync(ct)
            : await _db.Database.SqlQueryRaw<SaldoCrediarioDto>(colunas + " FROM fn_saldo_crediario({0})", userId.Value).ToListAsync(ct);
        return Ok(linhas);
    }

    /// <summary>Histórico de mudanças de estoque gravado pelo trigger de auditoria (mais recentes primeiro).</summary>
    [HttpGet("estoque-movimentos")]
    public async Task<IActionResult> EstoqueMovimentos([FromQuery] Guid? produtoId, [FromQuery] int limite = 100, CancellationToken ct = default)
    {
        if (!EhPostgres) return SoNoPostgres();
        limite = Math.Clamp(limite, 1, 500);
        const string colunas =
            """
            SELECT id AS "Id", product_id AS "ProductId", variant_id AS "VariantId",
                   estoque_antes AS "EstoqueAntes", estoque_depois AS "EstoqueDepois",
                   delta AS "Delta", origem AS "Origem", quando AS "Quando"
            FROM estoque_movimentos
            """;
        var linhas = produtoId is null
            ? await _db.Database.SqlQueryRaw<MovimentoEstoqueDto>(colunas + " ORDER BY quando DESC LIMIT {0}", limite).ToListAsync(ct)
            : await _db.Database.SqlQueryRaw<MovimentoEstoqueDto>(colunas + " WHERE product_id = {0} ORDER BY quando DESC LIMIT {1}", produtoId.Value, limite).ToListAsync(ct);
        return Ok(linhas);
    }

    /// <summary>
    /// Roda a procedure de manutenção: apaga sessões de login mortas e movimentos de estoque antigos.
    /// Só o dono. Devolve o resultado gravado em marcos_operacao.
    /// </summary>
    [HttpPost("manutencao")]
    [Authorize(Policy = "OwnerOnly")]
    public async Task<IActionResult> Manutencao([FromQuery] int diasSessoes = 30, [FromQuery] int diasMovimentos = 365, CancellationToken ct = default)
    {
        if (!EhPostgres) return SoNoPostgres();
        if (diasSessoes < 1 || diasMovimentos < 30)
            return BadRequest(new { Message = "Prazos inválidos: sessões >= 1 dia e movimentos >= 30 dias." });

        await _db.Database.ExecuteSqlRawAsync("CALL pr_manutencao_banco({0}, {1})", [diasSessoes, diasMovimentos], ct);
        var marco = await _db.Database.SqlQueryRaw<MarcoManutencaoDto>(
            """SELECT quando AS "Quando", detalhe AS "Detalhe" FROM marcos_operacao WHERE chave = 'manutencao-banco'""")
            .FirstOrDefaultAsync(ct);
        return Ok(marco);
    }
}
