using CardGameStore.Common;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

/// <summary>
/// Ponte entre serviço e HTTP: roda a ação do serviço e traduz a RegraException nos mesmos tipos
/// de resposta que os controllers sempre devolveram (BadRequest/NotFound/Conflict/Forbid/outros).
/// </summary>
public static class RespostaDeRegra
{
    /// <summary>Deu certo = 200 com o resultado; recusa de regra = o status dela.</summary>
    public static Task<IActionResult> Responder<T>(this ControllerBase c, Func<Task<T>> acao) =>
        c.ResponderCom(async () => c.Ok(await acao()));

    /// <summary>
    /// A ação monta a própria resposta de sucesso (201, 204...); a recusa vira o status dela. Nome
    /// diferente de propósito: com o mesmo nome, o C# escolhe o Responder genérico e embrulha a
    /// resposta pronta num 200.
    /// </summary>
    public static async Task<IActionResult> ResponderCom(this ControllerBase c, Func<Task<IActionResult>> acao)
    {
        try
        {
            return await acao();
        }
        catch (RegraException ex)
        {
            if (ex.Mensagem is null)
                return ex.Status switch { 403 => c.Forbid(), 404 => c.NotFound(), _ => c.StatusCode(ex.Status) };

            var corpo = new Dictionary<string, object?> { ["message"] = ex.Mensagem };
            foreach (var (chave, valor) in ex.Extras ?? new Dictionary<string, object?>()) corpo[chave] = valor;
            return ex.Status switch
            {
                400 => c.BadRequest(corpo),
                404 => c.NotFound(corpo),
                409 => c.Conflict(corpo),
                _   => c.StatusCode(ex.Status, corpo),
            };
        }
    }
}
