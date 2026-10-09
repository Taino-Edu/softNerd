// =============================================================================
// FuncionalidadesController.cs — chaves de funcionalidade ("mudança com volta")
//
// GET /api/funcionalidades           → { codigo: ligada } de todas (público: o front também consulta)
// GET /api/funcionalidades/painel    → catálogo completo com estado e quem mudou (só o dono)
// PUT /api/funcionalidades/{codigo}  → liga/desliga (só o dono; vai pra auditoria)
//
// Catálogo e regras: Configuration/Funcionalidades.cs
// =============================================================================

using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/funcionalidades")]
[Produces("application/json")]
public class FuncionalidadesController : ControllerBase
{
    private readonly FuncionalidadesService _funcionalidades;
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;

    public FuncionalidadesController(FuncionalidadesService funcionalidades, AppDbContext db, IAuditService audit)
    {
        _funcionalidades = funcionalidades;
        _db              = db;
        _audit           = audit;
    }

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(Dictionary<string, bool>), 200)]
    public async Task<IActionResult> Estado() =>
        Ok((await _funcionalidades.ListarAsync()).ToDictionary(e => e.Funcionalidade.Codigo, e => e.Ligada));

    [HttpGet("painel")]
    [Authorize(Policy = "OwnerOnly")]
    [ProducesResponseType(typeof(List<FuncionalidadeDto>), 200)]
    public async Task<IActionResult> Painel()
    {
        var estados = await _funcionalidades.ListarAsync();

        var quemMudou = estados.Where(e => e.AlteradaPorId != null).Select(e => e.AlteradaPorId!.Value).Distinct().ToList();
        var nomes = await _db.Users
            .Where(u => quemMudou.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Name);

        return Ok(estados.Select(e => ParaDto(e, nomes)).ToList());
    }

    [HttpPut("{codigo}")]
    [Authorize(Policy = "OwnerOnly")]
    [ProducesResponseType(typeof(FuncionalidadeDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Definir(string codigo, [FromBody] DefinirFuncionalidadeRequest req)
    {
        var quem = GetUserId();
        var estado = await _funcionalidades.DefinirAsync(codigo, req.Ligada, quem);
        if (estado is null) return NotFound(new { Message = "Chave de funcionalidade não encontrada." });

        await _audit.LogAsync(req.Ligada ? "LigouFuncionalidade" : "DesligouFuncionalidade", "Funcionalidade", codigo,
            JsonSerializer.Serialize(new { codigo, ligada = req.Ligada }), HttpContext);

        var nome = await _db.Users.Where(u => u.Id == quem).Select(u => u.Name).FirstOrDefaultAsync();
        return Ok(ParaDto(estado, new Dictionary<Guid, string> { [quem] = nome ?? "" }));
    }

    private static FuncionalidadeDto ParaDto(EstadoFuncionalidade e, IReadOnlyDictionary<Guid, string> nomes) => new()
    {
        Codigo      = e.Funcionalidade.Codigo,
        Nome        = e.Funcionalidade.Nome,
        OQueMuda    = e.Funcionalidade.OQueMuda,
        SeDesligar  = e.Funcionalidade.SeDesligar,
        Padrao      = e.Funcionalidade.Padrao,
        Desde       = e.Funcionalidade.Desde,
        RevisarEm   = e.Funcionalidade.RevisarEm.ToString("yyyy-MM-dd"),
        Ligada      = e.Ligada,
        AlteradaEm  = e.AlteradaEm,
        AlteradaPor = e.AlteradaPorId is { } id ? nomes.GetValueOrDefault(id) : null,
    };

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}

public class FuncionalidadeDto
{
    public string    Codigo      { get; init; } = string.Empty;
    public string    Nome        { get; init; } = string.Empty;
    public string    OQueMuda    { get; init; } = string.Empty;
    public string    SeDesligar  { get; init; } = string.Empty;
    public bool      Padrao      { get; init; }
    public string    Desde       { get; init; } = string.Empty;
    /// <summary>yyyy-MM-dd</summary>
    public string    RevisarEm   { get; init; } = string.Empty;
    public bool      Ligada      { get; init; }
    public DateTime? AlteradaEm  { get; init; }
    public string?   AlteradaPor { get; init; }
}

public class DefinirFuncionalidadeRequest
{
    public bool Ligada { get; init; }
}
