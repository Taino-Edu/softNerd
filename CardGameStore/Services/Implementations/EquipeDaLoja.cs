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
//
// v1.89.0 — "Ignorar" no sininho: cada pessoa pode silenciar um TIPO de aviso (o começo do
// título antes dos dois-pontos, ex. "Fila de espera"), guardado nas preferências dela
// (notifications.silenciados). O aviso continua indo pra lista, mas já chega lido e sem
// push/e-mail — senão o Windows apitava no canto do relógio do mesmo jeito. O PushService também
// confere (QuemNaoSilenciouAsync), então vale pros avisos que não passam por aqui.
// =============================================================================

using System.Text.Json;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public sealed record MembroDaEquipe(Guid Id, string Name, string? Email, IReadOnlyCollection<string>? Silenciados = null)
{
    /// <summary>A pessoa mandou ignorar avisos desse tipo?</summary>
    public bool Silenciou(string titulo) =>
        Silenciados is { Count: > 0 } s && s.Contains(EquipeDaLoja.TipoDoAviso(titulo), StringComparer.OrdinalIgnoreCase);
}

public static class EquipeDaLoja
{
    private static readonly JsonSerializerOptions LerPreferencias = new() { PropertyNameCaseInsensitive = true };

    /// <summary>"Fila de espera: Ana" → "Fila de espera". Sem dois-pontos, o título inteiro.</summary>
    public static string TipoDoAviso(string titulo)
    {
        var i = titulo.IndexOf(':');
        return (i > 0 ? titulo[..i] : titulo).Trim();
    }

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
        var admins = (await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Admin && u.IsActive)
            .Select(u => new { u.Id, u.Name, u.Email, u.PreferencesJson })
            .ToListAsync())
            .Select(u => new MembroDaEquipe(u.Id, u.Name, u.Email, Silenciados(u.PreferencesJson)))
            .ToList();

        if (!await AvisosPraEquipeAsync(db)) return admins;

        // O perfil guarda as permissões em JSON: poucos operadores, filtra aqui.
        var operadores = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Operator && u.IsActive && u.Perfil != null)
            .Select(u => new { u.Id, u.Name, u.Email, u.PreferencesJson, u.Perfil!.PermissoesJson })
            .ToListAsync();

        foreach (var o in operadores)
        {
            string[] permissoes;
            try { permissoes = JsonSerializer.Deserialize<string[]>(o.PermissoesJson) ?? []; }
            catch (JsonException) { continue; }
            if (permissoes.Contains(permissao) && admins.All(a => a.Id != o.Id))
                admins.Add(new MembroDaEquipe(o.Id, o.Name, o.Email, Silenciados(o.PreferencesJson)));
        }
        return admins;
    }

    /// <summary>Grava o aviso no sininho de cada um (o SaveChanges fica com quem chamou).
    /// Quem silenciou o tipo recebe na lista, mas já lido.</summary>
    public static void Avisar(AppDbContext db, IEnumerable<MembroDaEquipe> quem, string titulo, string corpo, string link)
    {
        foreach (var m in quem)
            db.Notifications.Add(new Notification
            {
                UserId = m.Id, Title = titulo, Body = corpo, Link = link,
                ReadAt = m.Silenciou(titulo) ? DateTime.UtcNow : null,
            });
    }

    /// <summary>Quem deve ser chamado por push/e-mail (todos menos quem silenciou o tipo).</summary>
    public static List<MembroDaEquipe> QuemOuve(IEnumerable<MembroDaEquipe> quem, string titulo) =>
        quem.Where(m => !m.Silenciou(titulo)).ToList();

    /// <summary>
    /// Dos usuários pedidos, os que NÃO ignoraram o tipo deste título. Usado pelo PushService, pra
    /// que "Ignorar este tipo" valha pra todo push (resumo do crediário, mensageria…), não só
    /// pros avisos que passam por aqui.
    /// </summary>
    public static async Task<List<Guid>> QuemNaoSilenciouAsync(AppDbContext db, IEnumerable<Guid> userIds, string titulo)
    {
        var ids = userIds.Distinct().ToList();
        if (ids.Count == 0) return ids;
        var comPreferencia = await db.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id) && u.PreferencesJson != null && u.PreferencesJson.Contains("silenciados"))
            .Select(u => new { u.Id, u.PreferencesJson })
            .ToListAsync();
        var tipo = TipoDoAviso(titulo);
        var calados = comPreferencia
            .Where(u => Silenciados(u.PreferencesJson)?.Contains(tipo, StringComparer.OrdinalIgnoreCase) == true)
            .Select(u => u.Id)
            .ToHashSet();
        return ids.Where(id => !calados.Contains(id)).ToList();
    }

    private static IReadOnlyCollection<string>? Silenciados(string? preferencesJson)
    {
        if (string.IsNullOrWhiteSpace(preferencesJson)) return null;
        try
        {
            var lista = JsonSerializer.Deserialize<UserPreferencesDto>(preferencesJson, LerPreferencias)?.Notifications?.Silenciados;
            return lista is { Count: > 0 } ? lista : null;
        }
        catch (JsonException) { return null; }
    }
}
