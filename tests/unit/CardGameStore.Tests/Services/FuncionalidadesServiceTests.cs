// =============================================================================
// FuncionalidadesServiceTests.cs — chaves de funcionalidade (mudança com volta)
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Services.Implementations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Tests.Services;

public class FuncionalidadesServiceTests
{
    private static (AppDbContext Db, FuncionalidadesService Servico) Criar()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return (db, new FuncionalidadesService(db, new MemoryCache(new MemoryCacheOptions())));
    }

    [Fact]
    public async Task SemNinguemMexer_ValeOPadraoDoCatalogo()
    {
        var (_, servico) = Criar();

        foreach (var f in Funcionalidades.Catalogo)
            (await servico.LigadaAsync(f.Codigo)).Should().Be(f.Padrao, f.Codigo);
    }

    [Fact]
    public async Task Desligar_ValeNaHora_MesmoComOEstadoEmCache()
    {
        var (_, servico) = Criar();
        (await servico.LigadaAsync(Funcionalidades.LigaMensalPorJogador)).Should().BeTrue(); // enche o cache

        await servico.DefinirAsync(Funcionalidades.LigaMensalPorJogador, false, Guid.NewGuid());

        (await servico.LigadaAsync(Funcionalidades.LigaMensalPorJogador)).Should().BeFalse();
    }

    [Fact]
    public async Task Definir_GuardaQuemEQuando_ELigarDeNovoVolta()
    {
        var (db, servico) = Criar();
        var dono = Guid.NewGuid();

        await servico.DefinirAsync(Funcionalidades.LigaMensalPorJogador, false, dono);
        await servico.DefinirAsync(Funcionalidades.LigaMensalPorJogador, true, dono);

        var estado = (await servico.ListarAsync()).Single(e => e.Funcionalidade.Codigo == Funcionalidades.LigaMensalPorJogador);
        estado.Ligada.Should().BeTrue();
        estado.AlteradaPorId.Should().Be(dono);
        estado.AlteradaEm.Should().NotBeNull();
        db.FuncionalidadesEstado.Should().ContainSingle(); // uma linha por chave, não uma por clique
    }

    [Fact]
    public async Task ChaveForaDoCatalogo_DefinirDevolveNull_EConsultarEErroDeProgramacao()
    {
        var (_, servico) = Criar();

        (await servico.DefinirAsync("nao-existe", true, Guid.NewGuid())).Should().BeNull();
        await FluentActions.Awaiting(() => servico.LigadaAsync("nao-existe")).Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public void Catalogo_CodigosUnicosEmKebabCase_ComTextoEDataDeRevisao()
    {
        Funcionalidades.Catalogo.Select(f => f.Codigo).Should().OnlyHaveUniqueItems();
        foreach (var f in Funcionalidades.Catalogo)
        {
            f.Codigo.Should().MatchRegex("^[a-z0-9]+(-[a-z0-9]+)*$");
            f.Codigo.Length.Should().BeLessThanOrEqualTo(60);
            f.Nome.Should().NotBeNullOrWhiteSpace();
            f.OQueMuda.Should().NotBeNullOrWhiteSpace();
            f.SeDesligar.Should().NotBeNullOrWhiteSpace();
            f.Desde.Should().MatchRegex(@"^v\d+\.\d+\.\d+$");
        }
    }
}
