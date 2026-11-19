// =============================================================================
// ProductController.cs — CRUD de Produtos (Estoque Fixo)
// GET    /api/product            → lista todos ativos
// GET    /api/product/{id}       → busca por ID
// POST   /api/product            → cria (Admin)
// PUT    /api/product/{id}       → atualiza (Admin)
// DELETE /api/product/{id}       → desativa (Admin)
// PATCH  /api/product/{id}/stock → ajusta estoque (Admin)
// GET    /api/product/mais-vendidos → ids dos que mais saem (público, seção da home)
// GET    /api/product/cartas    → cartas avulsas à venda (público, Mercado de Cartas)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ProductController : ControllerBase
{
    private readonly IProductService _service;

    public ProductController(IProductService service)
    {
        _service = service;
    }

    // Custo e margem só pra admin/operador (PDV e estoque usam). Cliente e visitante recebem o
    // ProdutoPublicoDto — antes o custo de cada produto saía aberto no site (06/11).
    private bool VeCusto => User.IsInRole("Admin") || User.IsInRole("Operator");
    private object ParaQuemPede(Product p) => VeCusto ? p : ProdutoPublicoDto.De(p);
    private object ParaQuemPede(IEnumerable<Product> lista) =>
        VeCusto ? lista : lista.Select(ProdutoPublicoDto.De).ToList();

    /// <summary>Lista todos os produtos ativos. Acessível por todos.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<Product>), 200)]
    public async Task<IActionResult> GetAll([FromQuery] string? category)
    {
        var products = category != null
            ? await _service.GetByCategoryAsync(category)
            : await _service.GetAllActiveAsync();
        return Ok(ParaQuemPede(products));
    }

    /// <summary>Lista todos os produtos ativos para comanda do cliente (sem filtro de marketplace).</summary>
    [HttpGet("store")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<Product>), 200)]
    public async Task<IActionResult> GetAllStore()
    {
        var products = await _service.GetAllForAdminAsync();
        return Ok(ParaQuemPede(products));
    }

    /// <summary>Lista TODOS os produtos ativos (incluindo ocultos do site). Só Admin/Operator.</summary>
    [HttpGet("admin")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IEnumerable<Product>), 200)]
    public async Task<IActionResult> GetAllAdmin()
    {
        var products = await _service.GetAllForAdminAsync();
        return Ok(products);
    }

    /// <summary>
    /// Ids dos produtos mais vendidos nos últimos 90 dias (seção "Mais vendidos" da home). Só a ordem —
    /// sem quantidade nem receita, que são da loja. Guardado 10 minutos: a home é aberta por qualquer um.
    /// </summary>
    [HttpGet("mais-vendidos")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(List<Guid>), 200)]
    public async Task<IActionResult> MaisVendidosDaLoja(
        [FromServices] AppDbContext db, [FromServices] IVendaAvulsaService vendas, [FromServices] IMemoryCache cache,
        [FromQuery] int limite = 12)
    {
        limite = Math.Clamp(limite, 1, 24);
        var ids = await cache.GetOrCreateAsync($"mais-vendidos:{limite}", e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            return MaisVendidos.CalcularAsync(db, vendas, limite, DateTime.UtcNow);
        });
        return Ok(ids ?? []);
    }

    /// <summary>
    /// Cartas avulsas à venda no Mercado de Cartas (chave cartas-como-produto): ativas, na loja digital e com
    /// estoque. Filtro por jogo e busca no nome/coleção. Sempre no formato público (sem custo).
    /// </summary>
    [HttpGet("cartas")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(List<ProdutoPublicoDto>), 200)]
    public async Task<IActionResult> CartasAvulsas([FromQuery] string? jogo, [FromQuery] string? busca)
    {
        var cartas = await _service.ListarCartasAsync(jogo, busca);
        return Ok(cartas.Select(ProdutoPublicoDto.De).ToList());
    }

    /// <summary>Busca produto por ID.</summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(Product), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var product = await _service.GetByIdAsync(id);
        return product == null ? NotFound() : Ok(ParaQuemPede(product));
    }

    /// <summary>Busca produto por código de barras. Acessível por todos autenticados.</summary>
    [HttpGet("barcode/{code}")]
    [Authorize]
    [ProducesResponseType(typeof(Product), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetByBarcode(string code)
    {
        var product = await _service.GetByBarcodeAsync(code);
        return product == null ? NotFound(new { Message = "Produto não encontrado para este código de barras." }) : Ok(ParaQuemPede(product));
    }

    /// <summary>Produtos com estoque abaixo do mínimo. Apenas Admin.</summary>
    [HttpGet("low-stock")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetLowStock()
    {
        return Ok(await _service.GetLowStockAsync());
    }

    /// <summary>Cria um novo produto. Apenas Admin.</summary>
    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(Product), 201)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> Create([FromBody] Product product)
    {
        // NCM/CEST/preço/estoque inválidos são erro do usuário — sem o catch a exceção
        // subia pro handler global e virava 500 "Erro interno", escondendo o motivo real.
        Product created;
        try { created = await _service.CreateAsync(product); }
        catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); }

        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    /// <summary>Atualiza um produto. Apenas Admin.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(Product), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Update(Guid id, [FromBody] Product product)
    {
        product.Id = id;
        try { return Ok(await _service.UpdateAsync(product)); }
        catch (ArgumentException ex)    { return BadRequest(new { Message = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { Message = ex.Message }); }
    }

    /// <summary>Desativa um produto (soft delete). Apenas Admin.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        await _service.DeactivateAsync(id);
        return NoContent();
    }

    /// <summary>
    /// Ajusta o estoque. Positivo = entrada, negativo = saída.
    /// Exemplo: { "delta": -1 } para vender 1 unidade.
    /// </summary>
    [HttpPatch("{id:guid}/stock")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> AdjustStock(Guid id, [FromBody] StockAdjustRequest req)
    {
        bool ok;
        try { ok = await _service.AdjustStockAsync(id, req.Delta); }
        catch (ArgumentException ex) { return BadRequest(new { Message = ex.Message }); }

        return ok ? Ok(new { Message = "Estoque ajustado." }) : BadRequest(new { Message = "Estoque insuficiente." });
    }
}

public record StockAdjustRequest(int Delta);
