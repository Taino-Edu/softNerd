// =============================================================================
// CatalogoCartasController.cs — catálogo e preço de referência das cartas avulsas (v1.92.0)
// Chave "preco-referencia-cartas". Rotas embaixo de /api/product → operador com Estoque usa (Permissao.RotasPrefixo).
//
// GET  /api/product/catalogo-cartas/colecoes?jogo=Pokémon               → coleções do jogo (mais nova primeiro)
// GET  /api/product/catalogo-cartas/cartas?categoria=3&grupo=23237      → cartas da coleção, com preços em dólar
// GET  /api/product/catalogo-cartas/referencia?categoria=&grupo=&produtoId=&variante= → referência e sugestão agora
// GET  /api/product/catalogo-cartas/variacoes                            → referência atual, 7 e 30 dias, por carta
// GET  /api/product/catalogo-cartas/regra   ·  PUT .../regra              → regra da loja
// POST /api/product/catalogo-cartas/atualizar  (corpo opcional: ids)      → roda a atualização agora
// =============================================================================

using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

public sealed record RegraPrecoRequest(decimal FatorPercent, int ArredondarCentavos, int MinimoCentavos);
public sealed record AtualizarPrecosRequest(List<Guid>? Ids);

[ApiController]
[Route("api/product/catalogo-cartas")]
[Authorize(Roles = "Admin,Operator")]
[Produces("application/json")]
public class CatalogoCartasController : ControllerBase
{
    private readonly ICatalogoCartas _catalogo;
    private readonly PrecoCartasService _precos;

    public CatalogoCartasController(ICatalogoCartas catalogo, PrecoCartasService precos)
    {
        _catalogo = catalogo;
        _precos = precos;
    }

    [HttpGet("colecoes")]
    public async Task<IActionResult> Colecoes([FromQuery] string jogo, CancellationToken ct)
    {
        try { return Ok(await _catalogo.ColecoesAsync(jogo, ct)); }
        catch (HttpRequestException ex) { return StatusCode(502, new { message = ex.Message }); }
    }

    [HttpGet("cartas")]
    public async Task<IActionResult> Cartas([FromQuery] int categoria, [FromQuery] int grupo, CancellationToken ct)
    {
        if (!CatalogoCartasService.CategoriaConhecida(categoria)) return BadRequest(new { message = "Jogo fora do catálogo." });
        try { return Ok(await _catalogo.CartasAsync(categoria, grupo, ct)); }
        catch (HttpRequestException ex) { return StatusCode(502, new { message = ex.Message }); }
    }

    [HttpGet("referencia")]
    public async Task<IActionResult> Referencia([FromQuery] int categoria, [FromQuery] int grupo, [FromQuery] int produtoId,
        [FromQuery] string? variante, CancellationToken ct)
    {
        if (!CatalogoCartasService.CategoriaConhecida(categoria)) return BadRequest(new { message = "Jogo fora do catálogo." });
        try { return Ok(await _precos.ReferenciaAgoraAsync(categoria, grupo, produtoId, variante, ct)); }
        catch (HttpRequestException ex) { return StatusCode(502, new { message = ex.Message }); }
    }

    [HttpGet("variacoes")]
    public async Task<IActionResult> Variacoes(CancellationToken ct) => Ok(await _precos.VariacoesAsync(ct));

    [HttpGet("regra")]
    public async Task<IActionResult> Regra() => Ok(await _precos.RegraAsync());

    [HttpPut("regra")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SalvarRegra([FromBody] RegraPrecoRequest req)
    {
        try { return Ok(await _precos.SalvarRegraAsync(req.FatorPercent, req.ArredondarCentavos, req.MinimoCentavos)); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("atualizar")]
    public async Task<IActionResult> Atualizar([FromBody] AtualizarPrecosRequest? req, CancellationToken ct) =>
        Ok(await _precos.AtualizarAsync(req?.Ids, ct));
}
