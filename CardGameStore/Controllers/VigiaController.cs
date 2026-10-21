// =============================================================================
// VigiaController.cs — alertas do sistema (só o dono) e registro de erro de tela (público)
// Regras: Services/Vigia/VigiaService.cs. Tela: frontend/app/admin/alertas.
// =============================================================================

using System.Security.Claims;
using CardGameStore.Services.Vigia;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api")]
public class VigiaController(VigiaService vigia) : ControllerBase
{
    // ── Dono: tela Configuração → Alertas do sistema ────────────────────────

    [HttpGet("admin/vigia/alertas")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Alertas([FromQuery] string? status, [FromQuery] string? gravidade,
        [FromQuery] string? codigo, [FromQuery] string? busca) =>
        Ok(await vigia.ListarAsync(status, gravidade, codigo, busca));

    [HttpGet("admin/vigia/resumo")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Resumo() => Ok(new
    {
        resumo = await vigia.ResumoAsync(),
        ligado = await vigia.LigadoAsync(),
        verificacoes = vigia.Verificacoes.Select(v => new { v.Codigo, v.Nome })
            .Append(new { Codigo = VigiaService.CodigoErroTela, Nome = "Erro em tela do site" }),
    });

    [HttpPost("admin/vigia/alertas/{id:guid}/resolver")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Resolver(Guid id)
    {
        var quem = User.FindFirst(ClaimTypes.Name)?.Value ?? User.FindFirst("name")?.Value ?? "Admin";
        var a = await vigia.ResolverAsync(id, quem);
        return a is null ? NotFound() : Ok(a);
    }

    /// <summary>Roda todas as verificações agora (sem esperar o robô de 10 min).</summary>
    [HttpPost("admin/vigia/rodar")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Rodar(CancellationToken ct) => Ok(new { novos = await vigia.RodarAsync(ct) });

    // ── Público: o site avisa quando uma tela quebra ─────────────────────────

    /// <summary>
    /// Erro de JavaScript numa tela (app/error.tsx e o relator global). Sem login: a tela
    /// pode quebrar antes de saber quem é. Limite por IP e textos cortados no serviço.
    /// </summary>
    [HttpPost("vigia/erro-tela")]
    [AllowAnonymous]
    [EnableRateLimiting("erro-tela")]
    [RequestSizeLimit(8_192)]
    public async Task<IActionResult> ErroTela([FromBody] ErroTelaRequest req)
    {
        Guid? userId = Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;
        var navegador = Request.Headers.UserAgent.ToString();
        await vigia.RegistrarErroTelaAsync(req.Mensagem ?? "", req.Rota ?? "/", req.Detalhe, userId,
            string.IsNullOrWhiteSpace(navegador) ? null : navegador);
        return NoContent();
    }
}

public sealed record ErroTelaRequest(string? Mensagem, string? Rota, string? Detalhe);
