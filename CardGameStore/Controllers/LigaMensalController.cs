// =============================================================================
// LigaMensalController.cs — Ranking mensal da liga de campeonatos semanais
//
// Só recebe e responde; a regra (pontos, mês de Brasília, mescla com lançamento
// manual) fica em Services/Liga/LigaMensalService.cs, que tem os testes.
//
// GET    /api/liga-mensal              → ranking do mês, já mesclado (público)
// GET    /api/liga-mensal/meses        → meses com dados (público)
// GET    /api/liga-mensal/manual       → lançamentos manuais brutos do mês (Admin)
// POST   /api/liga-mensal/manual       → cria lançamento manual (Admin)
// PUT    /api/liga-mensal/manual/{id}  → edita lançamento manual (Admin)
// DELETE /api/liga-mensal/manual/{id}  → remove lançamento manual (Admin)
// =============================================================================

using CardGameStore.DTOs;
using CardGameStore.Services.Liga;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/liga-mensal")]
[Produces("application/json")]
public class LigaMensalController : ControllerBase
{
    private readonly LigaMensalService _liga;

    public LigaMensalController(LigaMensalService liga) => _liga = liga;

    /// <summary>Ranking consolidado da Liga Mensal (campeonatos + lançamentos manuais).</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LigaMensalDto), 200)]
    [ProducesResponseType(400)]
    public Task<IActionResult> GetRanking([FromQuery] int? ano, [FromQuery] int? mes) =>
        Responder(async () => Ok(await _liga.RankingAsync(ano, mes)));

    /// <summary>Lista os meses que já têm dados (campeonatos com colocação OU lançamento manual).</summary>
    [HttpGet("meses")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<LigaMensalMesDto>), 200)]
    public async Task<IActionResult> GetMesesDisponiveis() => Ok(await _liga.MesesComDadosAsync());

    /// <summary>Lista os lançamentos manuais de um mês (bruto, pra edição no admin).</summary>
    [HttpGet("manual")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<LigaMensalManualEntryDto>), 200)]
    public async Task<IActionResult> GetManualEntries([FromQuery] int ano, [FromQuery] int mes) =>
        Ok(await _liga.ListarManuaisAsync(ano, mes));

    /// <summary>Cria um lançamento manual de pontos.</summary>
    [HttpPost("manual")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(LigaMensalManualEntryDto), 201)]
    [ProducesResponseType(400)]
    public Task<IActionResult> CreateManualEntry([FromBody] SaveLigaMensalManualEntryRequest request) =>
        Responder(async () => StatusCode(201, await _liga.CriarManualAsync(request, GetUserId())));

    /// <summary>Edita um lançamento manual.</summary>
    [HttpPut("manual/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(LigaMensalManualEntryDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public Task<IActionResult> UpdateManualEntry(Guid id, [FromBody] SaveLigaMensalManualEntryRequest request) =>
        Responder(async () => Ok(await _liga.EditarManualAsync(id, request)));

    /// <summary>Remove um lançamento manual.</summary>
    [HttpDelete("manual/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public Task<IActionResult> DeleteManualEntry(Guid id) =>
        Responder(async () =>
        {
            await _liga.RemoverManualAsync(id);
            return Ok(new { Message = "Lançamento removido." });
        });

    /// <summary>Regra violada no serviço vira 400/404 com a mensagem pro usuário.</summary>
    private async Task<IActionResult> Responder(Func<Task<IActionResult>> acao)
    {
        try { return await acao(); }
        catch (LigaMensalException ex) { return StatusCode(ex.Status, new { Message = ex.Message }); }
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
