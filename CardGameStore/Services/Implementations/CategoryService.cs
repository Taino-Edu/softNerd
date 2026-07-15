using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class CategoryService : ICategoryService
{
    private readonly AppDbContext _db;
    public CategoryService(AppDbContext db) { _db = db; }

    public async Task<IEnumerable<ProductCategory>> GetAllAsync() =>
        await _db.ProductCategories
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.Name)
            .ToListAsync();

    public async Task<ProductCategory> CreateAsync(ProductCategory category)
    {
        await ValidarParentAsync(category.ParentCategoryId, category.Id);
        _db.ProductCategories.Add(category);
        await _db.SaveChangesAsync();
        return category;
    }

    public async Task<ProductCategory> UpdateAsync(ProductCategory category)
    {
        var existing = await _db.ProductCategories.FindAsync(category.Id)
            ?? throw new InvalidOperationException("Categoria não encontrada.");

        await ValidarParentAsync(category.ParentCategoryId, category.Id);

        existing.Name             = category.Name;
        existing.Emoji            = category.Emoji;
        existing.DisplayOrder     = category.DisplayOrder;
        existing.IsActive         = category.IsActive;
        existing.ParentCategoryId = category.ParentCategoryId;
        // CreatedAt não é atualizado — preserva a data de criação original

        await _db.SaveChangesAsync();
        return existing;
    }

    /// <summary>
    /// Só um nível de subcategoria é suportado de propósito (Card Game → One Piece), não uma
    /// árvore arbitrária — mais simples de mostrar na UI e cobre o caso real do Maikon.
    /// </summary>
    private async Task ValidarParentAsync(Guid? parentId, Guid selfId)
    {
        if (parentId is null) return;

        if (parentId == selfId)
            throw new InvalidOperationException("Uma categoria não pode ser subcategoria de si mesma.");

        var parent = await _db.ProductCategories.FindAsync(parentId.Value)
            ?? throw new InvalidOperationException("Categoria pai não encontrada.");

        if (parent.ParentCategoryId is not null)
            throw new InvalidOperationException(
                $"\"{parent.Name}\" já é uma subcategoria — só é permitido um nível de aninhamento.");

        var temFilhas = await _db.ProductCategories.AnyAsync(c => c.ParentCategoryId == selfId);
        if (temFilhas)
            throw new InvalidOperationException(
                "Esta categoria já tem subcategorias — remova-as primeiro antes de torná-la uma subcategoria de outra.");
    }

    public async Task DeleteAsync(Guid id)
    {
        var category = await _db.ProductCategories.FindAsync(id);
        if (category != null)
        {
            _db.ProductCategories.Remove(category);
            await _db.SaveChangesAsync();
        }
    }
}
