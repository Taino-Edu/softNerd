// =============================================================================
// FuncionalidadesService.cs — pergunta "esta chave está ligada?"
//
// Uso no código:  if (await _funcionalidades.LigadaAsync(Funcionalidades.X)) { novo } else { antigo }
//
// O estado fica em memória por 30 s (é consultado em rota pública, ex. a Liga
// Mensal); mudar a chave pela tela limpa o cache na hora.
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Services.Implementations;

/// <summary>Estado de uma chave, já com o padrão do catálogo aplicado.</summary>
public sealed record EstadoFuncionalidade(
    Funcionalidade Funcionalidade,
    bool           Ligada,
    DateTime?      AlteradaEm,
    Guid?          AlteradaPorId);

public class FuncionalidadesService
{
    private const string ChaveCache = "funcionalidades:mudadas";
    private static readonly TimeSpan TempoCache = TimeSpan.FromSeconds(30);

    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;

    public FuncionalidadesService(AppDbContext db, IMemoryCache cache)
    {
        _db    = db;
        _cache = cache;
    }

    /// <summary>A chave está ligada? Código fora do catálogo é erro de programação.</summary>
    public async Task<bool> LigadaAsync(string codigo)
    {
        var funcionalidade = Funcionalidades.Buscar(codigo)
            ?? throw new ArgumentException($"Chave de funcionalidade desconhecida: {codigo}", nameof(codigo));

        var mudadas = await MudadasAsync();
        return mudadas.TryGetValue(codigo, out var estado) ? estado.Ligada : funcionalidade.Padrao;
    }

    /// <summary>Todas as chaves do catálogo, com o estado atual.</summary>
    public async Task<List<EstadoFuncionalidade>> ListarAsync()
    {
        var mudadas = await MudadasAsync();
        return Funcionalidades.Catalogo
            .Select(f => mudadas.TryGetValue(f.Codigo, out var e)
                ? new EstadoFuncionalidade(f, e.Ligada, e.AlteradaEm, e.AlteradaPorId)
                : new EstadoFuncionalidade(f, f.Padrao, null, null))
            .ToList();
    }

    /// <summary>Liga ou desliga. Devolve null se a chave não existe no catálogo.</summary>
    public async Task<EstadoFuncionalidade?> DefinirAsync(string codigo, bool ligada, Guid quem)
    {
        var funcionalidade = Funcionalidades.Buscar(codigo);
        if (funcionalidade is null) return null;

        var linha = await _db.FuncionalidadesEstado.FindAsync(codigo);
        if (linha is null)
        {
            linha = new FuncionalidadeEstado { Codigo = codigo };
            _db.FuncionalidadesEstado.Add(linha);
        }
        linha.Ligada        = ligada;
        linha.AlteradaEm    = DateTime.UtcNow;
        linha.AlteradaPorId = quem;
        await _db.SaveChangesAsync();

        _cache.Remove(ChaveCache);
        return new EstadoFuncionalidade(funcionalidade, ligada, linha.AlteradaEm, quem);
    }

    private async Task<Dictionary<string, FuncionalidadeEstado>> MudadasAsync() =>
        (await _cache.GetOrCreateAsync(ChaveCache, async entrada =>
        {
            entrada.AbsoluteExpirationRelativeToNow = TempoCache;
            return await _db.FuncionalidadesEstado.AsNoTracking().ToDictionaryAsync(f => f.Codigo);
        }))!;
}
