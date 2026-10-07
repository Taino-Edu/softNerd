// =============================================================================
// InicializacaoBancoTests.cs — startup do banco (Data/InicializacaoBanco.cs)
// =============================================================================

using CardGameStore.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CardGameStore.Tests.Data;

public class InicializacaoBancoTests
{
    [Theory]
    [InlineData("postgres.sql", "CREATE TABLE IF NOT EXISTS crediario_lancamentos")]
    [InlineData("sqlite.sql",   "CREATE TABLE IF NOT EXISTS crediario_lancamentos")]
    public void Scripts_VaoEmbutidosNaDll(string arquivo, string trecho)
    {
        var sql = InicializacaoBanco.LerScript(arquivo);

        sql.Should().Contain(trecho);
    }

    [Fact]
    public async Task ExecutarAsync_DuasVezesNoSqlite_NaoQuebraECriaUmAdminSo()
    {
        using var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var services = new ServiceCollection()
            .AddLogging()
            .AddDbContext<AppDbContext>(o => o.UseSqlite(conexao))
            .BuildServiceProvider();

        // Segunda rodada = API reiniciando num banco que já existe: tudo tem que ser idempotente
        await InicializacaoBanco.ExecutarAsync(services, useSqlite: true);
        await InicializacaoBanco.ExecutarAsync(services, useSqlite: true);

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Users.Count(u => u.Email == "admin@cardgamestore.com.br").Should().Be(1);
    }
}
