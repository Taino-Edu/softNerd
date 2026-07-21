// =============================================================================
// MinhasNotasController.cs — Nota fiscal (NFC-e) acessível pelo próprio cliente.
//
// FiscalController inteiro é AdminOnly — este controller separado existe pra
// permitir que o cliente veja/imprima a própria nota, sem abrir acesso a mais
// nada do módulo fiscal (config, certificado, naturezas de operação, etc).
//
// GET /api/minhas-notas          → lista as notas do cliente logado
// GET /api/minhas-notas/{id}/cupom → cupom de uma nota, só se pertence a ele
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/minhas-notas")]
[Authorize(Policy = "CustomerOrAdmin")]
[Produces("application/json")]
public class MinhasNotasController : ControllerBase
{
    private readonly AppDbContext         _db;
    private readonly IMongoDatabase       _mongo;
    private readonly INfceEmissionService _emissao;

    public MinhasNotasController(AppDbContext db, IMongoDatabase mongo, INfceEmissionService emissao)
    {
        _db      = db;
        _mongo   = mongo;
        _emissao = emissao;
    }

    [HttpGet]
    public async Task<IActionResult> ListMinhasNotas()
    {
        if (await BloquearSeModuloInativoAsync() is { } bloqueio) return bloqueio;

        var userId = GetUserId();

        var comandaIds = await _db.Comandas
            .Where(c => c.UserId == userId)
            .Select(c => c.Id)
            .ToListAsync();

        var vendaIds = await _mongo.GetCollection<Models.MongoDB.VendaAvulsa>("vendas_avulsas")
            .Find(v => v.UserId == userId)
            .Project(v => v.Id)
            .ToListAsync();

        var notas = await _db.NotasFiscaisEmitidas
            .Where(n =>
                (n.Origem == NotaFiscalOrigem.Comanda && n.ComandaId != null && comandaIds.Contains(n.ComandaId.Value)) ||
                (n.Origem == NotaFiscalOrigem.VendaAvulsa && n.VendaAvulsaId != null && vendaIds.Contains(n.VendaAvulsaId)))
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new
            {
                n.Id,
                Status = n.Status.ToString(),
                n.ValorTotalEmCentavos,
                n.EmitidoEm,
                n.CreatedAt,
            })
            .ToListAsync();

        return Ok(notas);
    }

    [HttpGet("{id:guid}/cupom")]
    public async Task<IActionResult> ObterMeuCupom(Guid id)
    {
        if (await BloquearSeModuloInativoAsync() is { } bloqueio) return bloqueio;

        var userId = GetUserId();

        var nota = await _db.NotasFiscaisEmitidas.FindAsync(id);
        if (nota is null) return NotFound();

        var pertence = false;
        if (nota.Origem == NotaFiscalOrigem.Comanda && nota.ComandaId.HasValue)
        {
            pertence = await _db.Comandas.AnyAsync(c => c.Id == nota.ComandaId.Value && c.UserId == userId);
        }
        else if (nota.Origem == NotaFiscalOrigem.VendaAvulsa && nota.VendaAvulsaId is not null)
        {
            pertence = await _mongo.GetCollection<Models.MongoDB.VendaAvulsa>("vendas_avulsas")
                .Find(v => v.Id == nota.VendaAvulsaId && v.UserId == userId)
                .AnyAsync();
        }

        if (!pertence) return Forbid();

        var cupom = await _emissao.ObterCupomAsync(id);
        return cupom is null ? NotFound() : Ok(cupom);
    }

    private async Task<IActionResult?> BloquearSeModuloInativoAsync()
    {
        var moduloAtivo = await _db.FiscalConfigs
            .Where(c => c.Id == FiscalConfig.SingletonId)
            .Select(c => (bool?)c.ModuloFiscalAtivo)
            .FirstOrDefaultAsync();

        return moduloAtivo == false
            ? StatusCode(StatusCodes.Status423Locked, new { Message = FiscalModuloBloqueadoException.Mensagem })
            : null;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
