// =============================================================================
// RelatoriosBancoControllerTests.cs — relatórios em funções do PostgreSQL (PIM IV, etapa 7)
//
// No SQLite dos testes as funções não existem: toda rota tem que responder 501 (e não 500).
// A parte que roda no Postgres de verdade é tests/sql/procedures-triggers.sql, no job de CI.
// =============================================================================

using CardGameStore.Controllers;
using CardGameStore.Data;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Tests.Controllers;

public class RelatoriosBancoControllerTests
{
    private static RelatoriosBancoController CriarController()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();
        return new RelatoriosBancoController(db);
    }

    [Fact]
    public async Task TodasAsRotas_NoSqlite_RespondemNaoImplementado()
    {
        var c = CriarController();

        var respostas = new IActionResult[]
        {
            await c.EstoqueBaixo(default),
            await c.Fechamento(null, default),
            await c.CrediarioSaldo(null, default),
            await c.EstoqueMovimentos(null, 100, default),
            await c.Manutencao(30, 365, default),
        };

        respostas.Should().AllSatisfy(r => r.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(501));
    }

    [Theory]
    [InlineData("fn_carimbar_updated_at")]
    [InlineData("fn_auditar_estoque")]
    [InlineData("fn_estoque_baixo")]
    [InlineData("fn_fechamento_comandas")]
    [InlineData("fn_saldo_crediario")]
    [InlineData("pr_manutencao_banco")]
    [InlineData("pr_conferir_integridade")]
    [InlineData("chk_comanda_items_quantidade")]
    [InlineData("chk_crediarios_status")]
    [InlineData("trg_products_auditar_estoque")]
    [InlineData("trg_product_variants_auditar_estoque")]
    [InlineData("estoque_movimentos")]
    public void PostgresSql_TemOsObjetosDeProceduresETriggers(string objeto)
    {
        // Se alguém tirar um deles do postgres.sql, as rotas /api/relatorios/banco quebram no Postgres.
        InicializacaoBanco.LerScript("postgres.sql").Should().Contain(objeto);
    }

    [Fact]
    public void SqliteSql_NaoTemTriggersNemFuncoesDoPostgres()
    {
        // O SQLite de dev não suporta PL/pgSQL: se isto entrasse no sqlite.sql, a API local não subiria.
        InicializacaoBanco.LerScript("sqlite.sql").Should().NotContain("plpgsql");
    }
}
