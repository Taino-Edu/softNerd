// GET    /api/category       → lista todas (público)
// POST   /api/category       → cria (Admin)
// PUT    /api/category/{id}  → atualiza (Admin)
// DELETE /api/category/{id}  → remove (Admin)

using System.ComponentModel.DataAnnotations;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

public record CategoryRequest(
    [Required][MaxLength(100)] string Name,
    [MaxLength(10)]            string? Emoji,
    int  DisplayOrder,
    bool IsActive,
    Guid? ParentCategoryId,
    /// <summary>Desconto do Pix desta categoria em %. Null = herda do pai / do padrão da loja.</summary>
    [Range(0, 100)] decimal? PixDiscountPercent = null
);

[ApiController]
[Route("api/category")]
[Produces("application/json")]
public class CategoryController : ControllerBase
{
    private readonly ICategoryService _service;
    public CategoryController(ICategoryService service) { _service = service; }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll() =>
        Ok(await _service.GetAllAsync());

    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Create([FromBody] CategoryRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var category = new ProductCategory
        {
            Id                 = Guid.NewGuid(),
            Name               = req.Name.Trim(),
            Emoji              = req.Emoji?.Trim(),
            DisplayOrder       = req.DisplayOrder,
            IsActive           = req.IsActive,
            ParentCategoryId   = req.ParentCategoryId,
            PixDiscountPercent = req.PixDiscountPercent,
            CreatedAt          = DateTime.UtcNow,
        };
        try { return Ok(await _service.CreateAsync(category)); }
        catch (InvalidOperationException ex) { return BadRequest(new { Message = ex.Message }); }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CategoryRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var category = new ProductCategory
        {
            Id                 = id,
            Name               = req.Name.Trim(),
            Emoji              = req.Emoji?.Trim(),
            DisplayOrder       = req.DisplayOrder,
            IsActive           = req.IsActive,
            ParentCategoryId   = req.ParentCategoryId,
            PixDiscountPercent = req.PixDiscountPercent,
        };
        try { return Ok(await _service.UpdateAsync(category)); }
        catch (InvalidOperationException ex) { return BadRequest(new { Message = ex.Message }); }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _service.DeleteAsync(id);
        return NoContent();
    }
}
