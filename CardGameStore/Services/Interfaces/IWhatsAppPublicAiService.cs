namespace CardGameStore.Services.Interfaces;

public interface IWhatsAppPublicAiService
{
    /// <summary>Responde apenas com contexto público. Null transfere para o menu seguro.</summary>
    Task<string?> ReplyAsync(string question, CancellationToken cancellationToken = default);
}
