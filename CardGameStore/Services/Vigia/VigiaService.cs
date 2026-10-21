// =============================================================================
// VigiaService.cs — gatilhos do sistema (chave "vigia-sistema")
//
// Cada verificação é uma classe pequena (IVerificacaoVigia) que olha o banco e devolve o
// que está errado agora. O Vigia roda todas (robô a cada 10 min ou "Rodar agora" na tela
// /admin/alertas) e sincroniza com a tabela alertas_sistema:
//   • caso novo     → alerta aberto (aviso/crítico também vão pro sininho dos admins);
//   • caso que segue → soma ocorrência;
//   • caso que sumiu → resolvido sozinho;
//   • caso que um admin resolveu → fica "ciente", não volta a abrir.
// Verificação nova = uma classe + uma linha em ServicosDaLoja. Uma que quebra não derruba
// as outras: vira o alerta "vigia-falhou".
// =============================================================================

using System.Security.Cryptography;
using System.Text;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Vigia;

/// <summary>Um caso encontrado por uma verificação. Referencia = o que identifica o caso (id, txid…).</summary>
public sealed record Achado(string Referencia, string Gravidade, string Titulo, string Detalhe, string? Link = null);

public interface IVerificacaoVigia
{
    /// <summary>Código estável (kebab-case): vira o prefixo da chave dos alertas.</summary>
    string Codigo { get; }
    /// <summary>Como aparece na tela de alertas.</summary>
    string Nome { get; }
    Task<IReadOnlyList<Achado>> VerificarAsync(CancellationToken ct);
}

public sealed record ResumoVigia(int Abertos, int Criticos, int Avisos, DateTime? UltimaVolta);

public class VigiaService
{
    public const string CodigoErroTela = "erro-tela";
    public const string CodigoFalha = "vigia-falhou";
    /// <summary>Teto de erros de tela abertos: o envio é anônimo, então ninguém enche a tabela.</summary>
    public const int MaxErrosTelaAbertos = 200;
    /// <summary>Erro de tela vai pro sininho no máximo 1 vez nesse intervalo (o resto fica na tela de alertas).</summary>
    public static readonly TimeSpan IntervaloAvisoErroTela = TimeSpan.FromHours(1);
    private static DateTime? _ultimaVolta;

    private readonly AppDbContext _db;
    private readonly IEnumerable<IVerificacaoVigia> _verificacoes;
    private readonly FuncionalidadesService _funcionalidades;
    private readonly ILogger<VigiaService> _logger;

    public VigiaService(AppDbContext db, IEnumerable<IVerificacaoVigia> verificacoes,
        FuncionalidadesService funcionalidades, ILogger<VigiaService> logger)
    {
        _db = db;
        _verificacoes = verificacoes;
        _funcionalidades = funcionalidades;
        _logger = logger;
    }

    public Task<bool> LigadoAsync() => _funcionalidades.LigadaAsync(Funcionalidades.VigiaSistema);

    public IEnumerable<(string Codigo, string Nome)> Verificacoes => _verificacoes.Select(v => (v.Codigo, v.Nome));

    /// <summary>Uma volta completa. Devolve quantos alertas novos abriu.</summary>
    public async Task<int> RodarAsync(CancellationToken ct = default)
    {
        if (!await LigadoAsync()) return 0;
        var novos = 0;
        foreach (var v in _verificacoes)
        {
            try
            {
                novos += await SincronizarAsync(v.Codigo, await v.VerificarAsync(ct), resolveSozinho: true);
                await SincronizarAsync(CodigoFalha, [], resolveSozinho: true, so: CodigoFalha + ":" + v.Codigo);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Vigia: a verificação {Codigo} falhou.", v.Codigo);
                _db.ChangeTracker.Clear();
                novos += await SincronizarAsync(CodigoFalha,
                    [new Achado(v.Codigo, VigiaGravidade.Aviso, $"A verificação \"{v.Nome}\" não rodou",
                        Cortar(ex.GetType().Name + ": " + ex.Message, 1500))],
                    resolveSozinho: false);
            }
        }
        _ultimaVolta = DateTime.UtcNow;
        return novos;
    }

    /// <summary>
    /// Erro de JavaScript numa tela do site (app/error.tsx e o relator global). O mesmo erro
    /// na mesma tela soma ocorrências num alerta só; o 1º de cada um vai pro sininho.
    /// </summary>
    public async Task RegistrarErroTelaAsync(string mensagem, string rota, string? detalhe, Guid? userId, string? navegador)
    {
        if (!await LigadoAsync()) return;
        // Envio anônimo: nada daqui vira link (seria isca pro admin) e o texto avisa que veio do navegador
        mensagem = Cortar(string.IsNullOrWhiteSpace(mensagem) ? "Erro sem mensagem" : mensagem.Trim(), 300);
        rota = NormalizarRota(rota);
        var referencia = rota + "|" + Hash(mensagem);
        var titulo = Cortar($"Erro na tela {rota}", 200);
        var texto = "Relatado pelo navegador do cliente (texto de fora — confira antes de agir).\n\n" +
                    $"Tela: {rota}\nErro: {mensagem}" +
                    (string.IsNullOrWhiteSpace(detalhe) ? "" : $"\n\n{Cortar(detalhe, 1000)}") +
                    (navegador is null ? "" : $"\n\nNavegador: {Cortar(navegador, 160)}") +
                    (userId is null ? "" : $"\nConta: {userId}");

        var chave = Chave(CodigoErroTela, referencia);
        var jaAberto = await _db.AlertasSistema.AnyAsync(a => a.Codigo == CodigoErroTela && a.Chave == chave && a.ResolvidoEm == null);
        if (!jaAberto && await _db.AlertasSistema.CountAsync(a => a.Codigo == CodigoErroTela && a.ResolvidoEm == null) >= MaxErrosTelaAbertos)
        {
            // Teto: o excesso soma num alerta só em vez de abrir mais um por erro
            referencia = "excesso";
            titulo = "Muitos erros de tela";
            texto = $"Mais de {MaxErrosTelaAbertos} erros de tela diferentes abertos. Resolva os antigos; os novos estão sendo somados aqui.";
        }
        var desde = DateTime.UtcNow - IntervaloAvisoErroTela;
        var avisouHaPouco = await _db.AlertasSistema.AnyAsync(a => a.Codigo == CodigoErroTela && a.CriadoEm >= desde);
        await SincronizarAsync(CodigoErroTela, [new Achado(referencia, VigiaGravidade.Aviso, titulo, texto, Link: null)],
            resolveSozinho: false, avisar: !avisouHaPouco);
    }

    public async Task<ResumoVigia> ResumoAsync()
    {
        var abertos = await _db.AlertasSistema.Where(a => a.ResolvidoEm == null)
            .GroupBy(a => a.Gravidade).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        int N(string g) => abertos.FirstOrDefault(x => x.Key == g)?.N ?? 0;
        return new ResumoVigia(abertos.Sum(x => x.N), N(VigiaGravidade.Critico), N(VigiaGravidade.Aviso), _ultimaVolta);
    }

    public async Task<List<AlertaSistema>> ListarAsync(string? status, string? gravidade, string? codigo, string? busca, int limite = 200)
    {
        var q = _db.AlertasSistema.AsNoTracking().AsQueryable();
        q = status switch
        {
            "resolvidos" => q.Where(a => a.ResolvidoEm != null),
            "todos"      => q,
            _            => q.Where(a => a.ResolvidoEm == null),
        };
        if (!string.IsNullOrWhiteSpace(gravidade)) q = q.Where(a => a.Gravidade == gravidade);
        if (!string.IsNullOrWhiteSpace(codigo)) q = q.Where(a => a.Codigo == codigo);
        if (!string.IsNullOrWhiteSpace(busca))
        {
            var b = busca.Trim().ToLower();
            q = q.Where(a => a.Titulo.ToLower().Contains(b) || a.Detalhe.ToLower().Contains(b)
                          || a.Chave.ToLower().Contains(b) || a.Codigo.ToLower().Contains(b));
        }
        return await q.OrderByDescending(a => a.UltimaVezEm).Take(Math.Clamp(limite, 1, 500)).ToListAsync();
    }

    public async Task<AlertaSistema?> ResolverAsync(Guid id, string quem)
    {
        var a = await _db.AlertasSistema.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return null;
        a.ResolvidoEm ??= DateTime.UtcNow;
        a.ResolvidoPor = Cortar(string.IsNullOrWhiteSpace(quem) ? "Admin" : quem, 120);
        await _db.SaveChangesAsync();
        return a;
    }

    /// <param name="so">Mexe só neste alerta (chave) — usado pra fechar o "vigia-falhou" de uma verificação que voltou.</param>
    /// <param name="avisar">false = registra sem mandar pro sininho (erro de tela já avisado há pouco).</param>
    private async Task<int> SincronizarAsync(string codigo, IReadOnlyList<Achado> achados, bool resolveSozinho, string? so = null,
        bool avisar = true)
    {
        var agora = DateTime.UtcNow;
        var abertos = await _db.AlertasSistema
            .Where(a => a.Codigo == codigo && a.ResolvidoEm == null && (so == null || a.Chave == so))
            .ToListAsync();
        var chaves = achados.Select(a => Chave(codigo, a.Referencia)).ToList();
        // O que um admin já resolveu não volta: ele ficou ciente daquele caso
        var cientes = chaves.Count == 0 ? [] : (await _db.AlertasSistema
            .Where(a => a.Codigo == codigo && chaves.Contains(a.Chave) && a.ResolvidoEm != null
                        && a.ResolvidoPor != AlertaSistema.ResolvidoSozinho)
            .Select(a => a.Chave).ToListAsync()).ToHashSet();

        var novos = new List<AlertaSistema>();
        foreach (var achado in achados)
        {
            var chave = Chave(codigo, achado.Referencia);
            var aberto = abertos.FirstOrDefault(a => a.Chave == chave);
            if (aberto is not null)
            {
                aberto.Ocorrencias++;
                aberto.UltimaVezEm = agora;
                // Erro de tela vem de fora (anônimo): o 1º relato fica, os seguintes só somam
                if (codigo != CodigoErroTela)
                {
                    aberto.Titulo = Cortar(achado.Titulo, 200);
                    aberto.Detalhe = Cortar(achado.Detalhe, 2000);
                    aberto.Gravidade = achado.Gravidade;
                }
                continue;
            }
            if (cientes.Contains(chave) || novos.Any(n => n.Chave == chave)) continue;
            var novo = new AlertaSistema
            {
                Codigo = codigo, Chave = chave, Gravidade = achado.Gravidade,
                Titulo = Cortar(achado.Titulo, 200), Detalhe = Cortar(achado.Detalhe, 2000),
                Link = achado.Link is null ? null : Cortar(achado.Link, 300),
                CriadoEm = agora, UltimaVezEm = agora,
            };
            _db.AlertasSistema.Add(novo);
            novos.Add(novo);
        }

        if (resolveSozinho)
            foreach (var a in abertos.Where(a => !chaves.Contains(a.Chave)))
            {
                a.ResolvidoEm = agora;
                a.ResolvidoPor = AlertaSistema.ResolvidoSozinho;
            }

        var paraOSininho = avisar ? novos.Where(n => n.Gravidade != VigiaGravidade.Info).ToList() : [];
        if (paraOSininho.Count > 0)
        {
            var admins = await _db.Users.Where(u => u.Role == UserRole.Admin && u.IsActive).Select(u => u.Id).ToListAsync();
            foreach (var n in paraOSininho)
                foreach (var adm in admins)
                    _db.Notifications.Add(new Notification
                    {
                        UserId = adm,
                        Title  = Cortar((n.Gravidade == VigiaGravidade.Critico ? "⚠ " : "") + n.Titulo, 120),
                        // Texto livre vindo do navegador não vai pro sininho: só o título (rota já filtrada)
                        Body   = n.Codigo == CodigoErroTela
                            ? $"{n.Titulo}. Veja os detalhes em Alertas do sistema."
                            : Cortar(n.Detalhe, 500),
                        Link   = "/admin/alertas",
                    });
        }

        await _db.SaveChangesAsync();
        return novos.Count;
    }

    private static string Chave(string codigo, string referencia) => Cortar(codigo + ":" + referencia, 200);

    /// <summary>Tira ids e query da rota: o mesmo erro em /campeonato/1 e /campeonato/2 é um alerta só.</summary>
    internal static string NormalizarRota(string? rota)
    {
        var r = (rota ?? "/").Split('?', '#')[0];
        r = System.Text.RegularExpressions.Regex.Replace(r,
            @"/([0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|[0-9]+|[0-9a-fA-F]{24})(?=/|$)", "/:id");
        r = Cortar(r.StartsWith('/') ? r : "/" + r, 120);
        // Só caminho do próprio site: nada de "//outro-site", barra invertida ou caractere estranho
        return System.Text.RegularExpressions.Regex.IsMatch(r, @"^/(?!/)[A-Za-z0-9/_:.…-]*$") ? r : "/(rota inválida)";
    }

    private static string Hash(string texto) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(texto)))[..12].ToLowerInvariant();

    internal static string Cortar(string texto, int max) => texto.Length <= max ? texto : texto[..(max - 1)] + "…";
}
