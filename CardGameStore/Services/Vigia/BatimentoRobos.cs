// =============================================================================
// BatimentoRobos.cs — cada robô (BackgroundService) bate o ponto a cada volta
//
// O robô declara que começou (Iniciou: nome, primeira espera, intervalo) e a cada volta
// diz se deu certo (Bateu) ou falhou (Falhou). O Vigia (VerificacaoRobosParados) lê isso:
// robô que não bate há 3 intervalos parou; robô que falha 3 vezes seguidas está quebrado.
// Fica na memória do processo — cada cópia da API vigia os próprios robôs.
// =============================================================================

using System.Collections.Concurrent;

namespace CardGameStore.Services.Vigia;

public sealed record EstadoRobo(string Nome, DateTime IniciouEm, TimeSpan PrimeiraEspera, TimeSpan Intervalo,
    DateTime? UltimaVoltaOk, int FalhasSeguidas, string? UltimoErro);

public static class BatimentoRobos
{
    private static readonly ConcurrentDictionary<string, EstadoRobo> Robos = new();

    /// <summary>Chame no começo do ExecuteAsync, antes da primeira espera.</summary>
    public static void Iniciou(string nome, TimeSpan primeiraEspera, TimeSpan intervalo) =>
        Robos[nome] = new EstadoRobo(nome, DateTime.UtcNow, primeiraEspera, intervalo, null, 0, null);

    /// <summary>Volta terminou sem erro.</summary>
    public static void Bateu(string nome) =>
        Robos.AddOrUpdate(nome,
            _ => new EstadoRobo(nome, DateTime.UtcNow, TimeSpan.Zero, TimeSpan.Zero, DateTime.UtcNow, 0, null),
            (_, e) => e with { UltimaVoltaOk = DateTime.UtcNow, FalhasSeguidas = 0, UltimoErro = null });

    /// <summary>Volta terminou com erro (o robô segue tentando).</summary>
    public static void Falhou(string nome, Exception ex) =>
        Robos.AddOrUpdate(nome,
            _ => new EstadoRobo(nome, DateTime.UtcNow, TimeSpan.Zero, TimeSpan.Zero, null, 1, Resumo(ex)),
            (_, e) => e with { FalhasSeguidas = e.FalhasSeguidas + 1, UltimoErro = Resumo(ex) });

    /// <summary>Volta falhou sem exceção (o serviço devolveu o erro em vez de lançar).</summary>
    public static void Falhou(string nome, string erro) => Falhou(nome, new Exception(erro));

    public static IReadOnlyCollection<EstadoRobo> Estado => Robos.Values.ToList();

    /// <summary>Só pros testes.</summary>
    internal static void Limpar() => Robos.Clear();

    /// <summary>Só pros testes: põe um estado pronto (ex.: robô que começou há 1 h).</summary>
    internal static void Definir(EstadoRobo estado) => Robos[estado.Nome] = estado;

    private static string Resumo(Exception ex)
    {
        var texto = ex.GetType().Name + ": " + ex.Message;
        return texto.Length <= 300 ? texto : texto[..299] + "…";
    }
}
