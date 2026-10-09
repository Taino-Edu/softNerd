// =============================================================================
// TorneioController.cs — Liguinha (torneio suíço em cima do campeonato)
//
// Organizador: AdminOnly, como o resto de campeonato.
// Jogador:     logado; só lança resultado da própria partida (checado no serviço).
// Público:     telão — nome, deck e tabela; nada de contato nem do que cada um lançou.
// Regras e concorrência: Services/Liga/TorneioService.cs. Arquitetura: docs/liguinha.md.
// =============================================================================

using System.Security.Claims;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Liga;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/torneios")]
public class TorneioController : ControllerBase
{
    private readonly TorneioService _torneio;

    public TorneioController(TorneioService torneio) => _torneio = torneio;

    // ── Organizador ──────────────────────────────────────────────────────────

    [HttpGet("{id:guid}/painel")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Painel(Guid id) => Rodar(async () => Ok(await _torneio.PainelAsync(id)));

    /// <summary>Liga o modo suíço e gera o código de entrada.</summary>
    [HttpPost("{id:guid}/preparar")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Preparar(Guid id, [FromBody] PrepararTorneioRequest req) => Rodar(async () =>
    {
        var ch = await _torneio.PrepararAsync(id, req.MelhorDe, req.MinutosRodada);
        return Ok(new { ch.CodigoEntrada, ch.MelhorDe, ch.MinutosRodada });
    });

    [HttpPost("{id:guid}/codigo")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> NovoCodigo(Guid id) =>
        Rodar(async () => Ok(new { codigoEntrada = await _torneio.NovoCodigoDeEntradaAsync(id) }));

    [HttpPut("{id:guid}/participantes/{participantId:guid}/check-in")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> CheckIn(Guid id, Guid participantId, [FromBody] CheckInRequest req) => Rodar(async () =>
    {
        await _torneio.CheckInManualAsync(id, participantId, req.Presente);
        return NoContent();
    });

    /// <summary>Gera a próxima rodada (a 1ª inicia o torneio). 409 se ainda houver partida aberta.</summary>
    [HttpPost("{id:guid}/rodadas")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> GerarRodada(Guid id, [FromBody] GerarRodadaRequest? req) => Rodar(async () =>
    {
        var rodada = await _torneio.GerarRodadaAsync(id, req?.NumeroRodadas);
        return Ok(new { rodada.Numero });
    });

    [HttpPut("{id:guid}/partidas/{partidaId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Resolver(Guid id, Guid partidaId, [FromBody] ResolverPartidaRequest req) => Rodar(async () =>
    {
        await _torneio.ResolverAsync(id, partidaId, req.Resultado, UsuarioId(), req.VitoriasA, req.VitoriasB);
        return NoContent();
    });

    [HttpPost("{id:guid}/participantes/{participantId:guid}/desistencia")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Desistencia(Guid id, Guid participantId) => Rodar(async () =>
    {
        await _torneio.DesistenciaAsync(id, participantId);
        return NoContent();
    });

    /// <summary>Classificação final → colocação de cada um + pódio → Liga Mensal.</summary>
    [HttpPost("{id:guid}/encerrar")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Encerrar(Guid id) => Rodar(async () => Ok(await _torneio.EncerrarAsync(id)));

    // ── Jogador ──────────────────────────────────────────────────────────────

    /// <summary>Check-in pelo código (ou inscrição na hora, se gratuito). Limite por usuário: código não se adivinha.</summary>
    [HttpPost("entrar")]
    [Authorize]
    [EnableRateLimiting("torneio-codigo")]
    public Task<IActionResult> Entrar([FromBody] EntrarTorneioRequest req) => Rodar(async () =>
    {
        var ch = await _torneio.EntrarAsync(UsuarioId(), req.Codigo, req.DeckId, req.DeckNome);
        return Ok(new { championshipId = ch.Id, nome = ch.Name });
    });

    [HttpGet("ativos")]
    [Authorize]
    public Task<IActionResult> Ativos() => Rodar(async () => Ok(await _torneio.MeusAtivosAsync(UsuarioId())));

    [HttpGet("{id:guid}/minha-mesa")]
    [Authorize]
    public Task<IActionResult> MinhaMesa(Guid id) => Rodar(async () => Ok(await _torneio.MinhaMesaAsync(UsuarioId(), id)));

    [HttpPost("{id:guid}/partidas/{partidaId:guid}/resultado")]
    [Authorize]
    public Task<IActionResult> LancarResultado(Guid id, Guid partidaId, [FromBody] LancarResultadoRequest req) => Rodar(async () =>
    {
        await _torneio.LancarResultadoAsync(UsuarioId(), id, partidaId, req.Resultado);
        return NoContent();
    });

    [HttpPost("{id:guid}/desistir")]
    [Authorize]
    public Task<IActionResult> Desistir(Guid id) => Rodar(async () =>
    {
        await _torneio.DesistirAsync(UsuarioId(), id);
        return NoContent();
    });

    // ── Público (telão) ──────────────────────────────────────────────────────

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public Task<IActionResult> Publico(Guid id) => Rodar(async () => Ok(await _torneio.PublicoAsync(id)));

    [HttpGet("{id:guid}/rodadas/{numero:int}")]
    [AllowAnonymous]
    public Task<IActionResult> Rodada(Guid id, int numero) =>
        Rodar(async () => Ok(await _torneio.MesasAsync(id, numero, comReports: false)));

    // ── Internos ─────────────────────────────────────────────────────────────

    private Guid UsuarioId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")
                   ?? throw new UnauthorizedAccessException());

    private async Task<IActionResult> Rodar(Func<Task<IActionResult>> acao)
    {
        try { return await acao(); }
        catch (TorneioException ex) { return StatusCode(ex.Status, new { message = ex.Message }); }
    }
}

public sealed record PrepararTorneioRequest(int MelhorDe = 1, int MinutosRodada = 50);
public sealed record CheckInRequest(bool Presente);
public sealed record GerarRodadaRequest(int? NumeroRodadas);
public sealed record ResolverPartidaRequest(ResultadoPartida Resultado, int? VitoriasA, int? VitoriasB);
public sealed record EntrarTorneioRequest(string Codigo, Guid? DeckId, string? DeckNome);
public sealed record LancarResultadoRequest(ResultadoJogador Resultado);
