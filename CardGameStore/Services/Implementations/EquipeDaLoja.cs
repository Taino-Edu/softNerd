// =============================================================================
// EquipeDaLoja — quem recebe os avisos de pedido e Pix do site
//
// Até a v1.87 o sininho, o push e o e-mail de "pré-venda nova", "Pix caiu num pedido
// cancelado" e afins iam só pra quem é Admin. O operador do balcão (perfil com Pré-vendas,
// a permissão "estoque") não recebia nada e só descobria o pedido abrindo a tela.
//
// Chave "avisos-pra-equipe" (Configuration/Funcionalidades.cs): ligada, recebem os admins
// e os operadores ativos com a permissão; desligada, volta a ser só admin.
// O estado da chave é lido direto da tabela (sem o cache do FuncionalidadesService) pra
// não mexer no construtor de quem avisa — aviso é raro, uma consulta a mais não pesa.
// =============================================================================

using System.Text.Json;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public sealed record MembroDaEquipe(Guid Id, string Name, string? Email);

public static class EquipeDaLoja
{
    /// <summary>A chave "avisos-pra-equipe" está ligada? (linha no banco, senão o padrão do catálogo)</summary>
    public static async Task<bool> AvisosPraEquipeAsync(AppDbContext db)
    {
        var mudada = await db.FuncionalidadesEstado.AsNoTracking()
            .Where(f => f.Codigo == Funcionalidades.AvisosPraEquipe)
            .Select(f => (bool?)f.Ligada)
            .FirstOrDefaultAsync();
        return mudada ?? Funcionalidades.Buscar(Funcionalidades.AvisosPraEquipe)!.Padrao;
    }

    /// <summary>
    /// Admins ativos e, com a chave ligada, os operadores ativos cujo perfil tem a permissão
    /// (padrão: "estoque", a que abre Pré-vendas).
    /// </summary>
    public static async Task<List<MembroDaEquipe>> QuemRecebeAsync(AppDbContext db, string permissao = Permissao.Estoque)
    {
        var admins = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Admin && u.IsActive)
            .Select(u => new MembroDaEquipe(u.Id, u.Name, u.Email))
            .ToListAsync();

        if (!await AvisosPraEquipeAsync(db)) return admins;

        // O perfil guarda as permissões em JSON: poucos operadores, filtra aqui.
        var operadores = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Operator && u.IsActive && u.Perfil != null)
            .Select(u => new { u.Id, u.Name, u.Email, u.Perfil!.PermissoesJson })
            .ToListAsync();

        foreach (var o in operadores)
        {
            string[] permissoes;
            try { permissoes = JsonSerializer.Deserialize<string[]>(o.PermissoesJson) ?? []; }
            catch (JsonException) { continue; }
            if (permissoes.Contains(permissao) && admins.All(a => a.Id != o.Id))
                admins.Add(new MembroDaEquipe(o.Id, o.Name, o.Email));
        }
        return admins;
    }

    /// <summary>Grava o aviso no sininho de cada um (o SaveChanges fica com quem chamou).</summary>
    public static void Avisar(AppDbContext db, IEnumerable<MembroDaEquipe> quem, string titulo, string corpo, string link)
    {
        foreach (var m in quem)
            db.Notifications.Add(new Notification { UserId = m.Id, Title = titulo, Body = corpo, Link = link });
    }
}
