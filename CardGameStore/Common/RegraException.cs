namespace CardGameStore.Common;

/// <summary>
/// Regra de negócio recusada, lançada pelo serviço. O controller traduz pra resposta HTTP com o
/// Status (Controllers/RespostaDeRegra.cs). Mensagem nula = só o status (404/403 sem corpo);
/// Extras entram no corpo junto com a mensagem (ex.: pixAberto, semEstoque).
/// </summary>
public class RegraException(string? mensagem, int status = 400, IReadOnlyDictionary<string, object?>? extras = null)
    : Exception(mensagem ?? $"HTTP {status}")
{
    public string? Mensagem { get; } = mensagem;
    public int Status { get; } = status;
    public IReadOnlyDictionary<string, object?>? Extras { get; } = extras;
}
