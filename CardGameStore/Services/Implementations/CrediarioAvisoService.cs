// =============================================================================
// CrediarioAvisoService.cs — Lembretes de vencimento do crediário
//
// Robô (CrediarioAvisoBackgroundService) chama ExecutarRodadaAsync a cada meia
// hora. A partir da hora configurada (Brasília), cada conta aberta que estiver
// num "marco" hoje (3 dias antes, no dia, 7 dias de atraso...) gera UM aviso:
// uma mensagem por cliente juntando as contas dele, pelos canais ligados
// (sininho + push, e-mail, WhatsApp). Cada marco sai uma vez só por vencimento —
// o índice único em crediario_avisos garante isso mesmo com duas rodadas.
//
// Marco perdido não é recuperado: se o servidor ficou fora no dia do marco, o
// próximo é que sai. É de propósito — ligar o recurso não pode disparar uma
// enxurrada de "você está atrasado" pra todo mundo de uma vez.
// =============================================================================

using System.Text;
using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using CardGameStore.Validation;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public sealed record CrediarioAvisoRodada(int ClientesAvisados, int ContasAvisadas, bool ResumoEnviado);

public sealed record CrediarioAvisoEnvio(string Canais, string? Falhas);

public sealed record CrediarioAvisoPrevia(
    string Titulo, string Texto, string? WhatsApp, string? Email, List<string> CanaisDisponiveis);

public class CrediarioAvisoService
{
    /// <summary>Depois desta hora (Brasília) o robô não manda mais nada no dia.</summary>
    public const int HoraLimite = 20;

    private readonly AppDbContext     _db;
    private readonly IEmailService    _email;
    private readonly IPushService     _push;
    private readonly IWhatsAppGateway _whatsApp;
    private readonly ILogger<CrediarioAvisoService> _logger;

    public CrediarioAvisoService(
        AppDbContext db, IEmailService email, IPushService push, IWhatsAppGateway whatsApp,
        ILogger<CrediarioAvisoService> logger)
    {
        _db       = db;
        _email    = email;
        _push     = push;
        _whatsApp = whatsApp;
        _logger   = logger;
    }

    // ── Config ────────────────────────────────────────────────────────────────

    public async Task<CrediarioAvisoConfig> ObterConfigAsync()
    {
        var cfg = await _db.CrediarioAvisoConfigs.FindAsync(CrediarioAvisoConfig.SingletonId);
        if (cfg is not null) return cfg;

        cfg = new CrediarioAvisoConfig();
        _db.CrediarioAvisoConfigs.Add(cfg);
        await _db.SaveChangesAsync();
        return cfg;
    }

    public static List<int> LerMarcos(string? json)
    {
        try
        {
            return (JsonSerializer.Deserialize<List<int>>(json ?? "[]") ?? new List<int>())
                .Distinct().OrderBy(m => m).ToList();
        }
        catch (JsonException)
        {
            return new List<int>();
        }
    }

    // ── Rodada automática ─────────────────────────────────────────────────────

    public async Task<CrediarioAvisoRodada> ExecutarRodadaAsync(DateTime agoraUtc, CancellationToken ct = default)
    {
        var cfg = await ObterConfigAsync();
        if (!cfg.Ativo) return new(0, 0, false);

        var agoraBr = CrediarioLancamentos.ParaBrasilia(agoraUtc);
        if (agoraBr.Hour < cfg.HoraEnvio || agoraBr.Hour >= HoraLimite) return new(0, 0, false);

        var hoje   = agoraBr.Date;
        var marcos = LerMarcos(cfg.MarcosJson).ToHashSet();

        var abertas = await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Avisos)
            .Where(c => c.Status == CrediariosStatus.Aberto && c.ValorEmCentavos > c.ValorPagoEmCentavos)
            .ToListAsync(ct);

        // Conta no marco de hoje e ainda sem aviso desse marco pra este vencimento
        var devidas = abertas
            .Select(c => (Conta: c, Marco: DiasDoVencimento(c, hoje)))
            .Where(x => marcos.Contains(x.Marco)
                     && !x.Conta.Avisos.Any(a => a.Marco == x.Marco && a.VencimentoReferencia == x.Conta.DataVencimento))
            .ToList();

        var clientes = 0;
        foreach (var grupo in devidas.GroupBy(x => x.Conta.UserId))
        {
            var user = grupo.First().Conta.User;
            if (user is null || !user.IsActive) continue;

            // Grava os avisos ANTES de enviar: se outra instância já gravou o mesmo marco,
            // o índice único estoura aqui e ninguém recebe duplicado.
            var avisos = grupo.Select(x => new CrediarioAviso
            {
                CrediarioId          = x.Conta.Id,
                Marco                = x.Marco,
                VencimentoReferencia = x.Conta.DataVencimento,
            }).ToList();
            _db.CrediarioAvisos.AddRange(avisos);
            try
            {
                await _db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogInformation(ex, "Aviso de crediário do cliente {UserId} já registrado por outra rodada — pulando.", user.Id);
                foreach (var a in avisos) _db.Entry(a).State = EntityState.Detached;
                continue;
            }

            // A mensagem cita as contas do marco de hoje; o total é de todas as abertas do cliente.
            var todasDoCliente = abertas.Where(c => c.UserId == user.Id).ToList();

            // Cliente que já recebeu aviso hoje (o admin mandou à mão mais cedo) não recebe
            // outro: o marco fica marcado como cumprido, sem mensagem nova.
            var jaAvisadoHoje = todasDoCliente
                .SelectMany(c => c.Avisos)
                .Any(a => !avisos.Contains(a)
                       && a.Canais.Length > 0
                       && CrediarioLancamentos.ParaBrasilia(a.EnviadoEm).Date == hoje);
            if (jaAvisadoHoje)
            {
                foreach (var a in avisos) a.Falhas = "pulado: cliente já foi avisado hoje";
                await _db.SaveChangesAsync(ct);
                continue;
            }

            var envio = await EnviarAsync(cfg, user, grupo.Select(x => x.Conta).ToList(), todasDoCliente, hoje, ct);

            foreach (var a in avisos)
            {
                a.Canais = envio.Canais;
                a.Falhas = envio.Falhas;
            }
            await _db.SaveChangesAsync(ct);
            clientes++;
        }

        var resumo = cfg.ResumoAdmin && (cfg.UltimoResumoEm is null || CrediarioLancamentos.ParaBrasilia(cfg.UltimoResumoEm.Value).Date < hoje)
            && await EnviarResumoAdminAsync(cfg, abertas, hoje, agoraUtc, clientes, ct);

        if (clientes > 0)
            _logger.LogInformation(
                "Avisos de crediário: {Clientes} cliente(s), {Contas} conta(s) avisadas hoje.", clientes, devidas.Count);

        return new(clientes, devidas.Count, resumo);
    }

    // ── Aviso manual ──────────────────────────────────────────────────────────

    public async Task<CrediarioAvisoEnvio> AvisarAgoraAsync(Guid crediarioId, Guid adminId, CancellationToken ct = default)
    {
        var conta = await _db.Crediarios
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == crediarioId, ct)
            ?? throw new InvalidOperationException("Crediário não encontrado.");

        if (conta.Status != CrediariosStatus.Aberto)
            throw new InvalidOperationException("Esta conta já foi quitada.");

        var cfg  = await ObterConfigAsync();
        var hoje = CrediarioLancamentos.HojeBrasil();
        var todas = await _db.Crediarios
            .Where(c => c.UserId == conta.UserId && c.Status == CrediariosStatus.Aberto)
            .ToListAsync(ct);

        var envio = await EnviarAsync(cfg, conta.User, new List<Crediario> { conta }, todas, hoje, ct);
        if (envio.Canais.Length == 0)
            throw new InvalidOperationException(
                "Nenhum canal conseguiu entregar o aviso" + (envio.Falhas is null ? "." : $": {envio.Falhas}"));

        _db.CrediarioAvisos.Add(new CrediarioAviso
        {
            CrediarioId          = conta.Id,
            Marco                = null,
            VencimentoReferencia = conta.DataVencimento,
            Canais               = envio.Canais,
            Falhas               = envio.Falhas,
            EnviadoPorAdminId    = adminId,
        });
        await _db.SaveChangesAsync(ct);
        return envio;
    }

    public async Task<CrediarioAvisoPrevia> PreviaAsync(Guid crediarioId, CancellationToken ct = default)
    {
        var conta = await _db.Crediarios
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == crediarioId, ct)
            ?? throw new InvalidOperationException("Crediário não encontrado.");

        var cfg   = await ObterConfigAsync();
        var hoje  = CrediarioLancamentos.HojeBrasil();
        var todas = await _db.Crediarios
            .Where(c => c.UserId == conta.UserId && c.Status == CrediariosStatus.Aberto)
            .ToListAsync(ct);
        var site  = await NomeDaLojaAsync(ct);

        var (titulo, texto) = MontarMensagem(conta.User, new List<Crediario> { conta }, todas, hoje, site, cfg.MensagemExtra);

        var canais = new List<string>();
        if (cfg.CanalApp) canais.Add("app");
        if (cfg.CanalEmail && !string.IsNullOrWhiteSpace(conta.User.Email)) canais.Add("email");
        if (cfg.CanalWhatsApp && Identificadores.NormalizarWhatsApp(conta.User.WhatsApp) is not null) canais.Add("whatsapp");

        return new CrediarioAvisoPrevia(
            titulo, texto, Identificadores.NormalizarWhatsApp(conta.User.WhatsApp), conta.User.Email, canais);
    }

    // ── Envio ─────────────────────────────────────────────────────────────────

    private async Task<CrediarioAvisoEnvio> EnviarAsync(
        CrediarioAvisoConfig cfg, User user, List<Crediario> contasDoAviso, List<Crediario> todasDoCliente,
        DateTime hoje, CancellationToken ct)
    {
        var site = await NomeDaLojaAsync(ct);
        var (titulo, texto) = MontarMensagem(user, contasDoAviso, todasDoCliente, hoje, site, cfg.MensagemExtra);

        var ok     = new List<string>();
        var falhas = new List<string>();

        if (cfg.CanalApp)
        {
            var resumo = ResumoCurto(contasDoAviso, todasDoCliente, hoje);
            _db.Notifications.Add(new Notification
            {
                UserId = user.Id,
                Title  = titulo,
                Body   = resumo,
                Link   = "/cliente/perfil?tab=crediario",
            });
            await _db.SaveChangesAsync(ct);
            ok.Add("app");

            // Push é bônus: o sininho já ficou gravado, falha aqui não desfaz o aviso.
            try { await _push.SendAsync(user.Id, titulo, resumo, "/cliente/perfil?tab=crediario"); }
            catch (Exception ex) { _logger.LogWarning(ex, "Push do lembrete de crediário não saiu (cliente {UserId}).", user.Id); }
        }

        if (cfg.CanalEmail)
        {
            if (string.IsNullOrWhiteSpace(user.Email))
                falhas.Add("email: cliente sem e-mail");
            else
            {
                try
                {
                    await _email.SendCrediarioLembreteAsync(user.Email, user.Name, titulo, texto);
                    ok.Add("email");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "E-mail do lembrete de crediário falhou (cliente {UserId}).", user.Id);
                    falhas.Add("email: falha no envio");
                }
            }
        }

        if (cfg.CanalWhatsApp)
        {
            var phone = Identificadores.NormalizarWhatsApp(user.WhatsApp);
            if (phone is null)
                falhas.Add("whatsapp: cliente sem número");
            else
            {
                var res = await _whatsApp.SendTextAsync(phone, texto, ct);
                if (res.Success)
                {
                    ok.Add("whatsapp");
                    // Aparece na caixa de atendimento junto com a conversa do cliente
                    _db.WhatsAppOutboundMessages.Add(new WhatsAppOutboundMessage
                    {
                        Phone             = phone,
                        MessageText       = texto.Length > 2000 ? texto[..2000] : texto,
                        Author            = "crediario",
                        ExternalMessageId = res.MessageId,
                    });
                    await _db.SaveChangesAsync(ct);
                }
                else
                {
                    falhas.Add($"whatsapp: {res.Error ?? "falha no envio"}");
                }
            }
        }

        var falhasTexto = falhas.Count == 0 ? null : string.Join("; ", falhas);
        if (falhasTexto is { Length: > 500 }) falhasTexto = falhasTexto[..500];
        return new CrediarioAvisoEnvio(string.Join(",", ok), falhasTexto);
    }

    private async Task<bool> EnviarResumoAdminAsync(
        CrediarioAvisoConfig cfg, List<Crediario> abertas, DateTime hoje, DateTime agoraUtc, int clientesAvisados, CancellationToken ct)
    {
        var vencemHoje = abertas.Where(c => DiasDoVencimento(c, hoje) == 0).ToList();
        var vencidas   = abertas.Where(c => DiasDoVencimento(c, hoje) > 0).ToList();
        var proximos3  = abertas.Where(c => DiasDoVencimento(c, hoje) is >= -3 and < 0).ToList();

        cfg.UltimoResumoEm = agoraUtc;
        if (vencemHoje.Count == 0 && vencidas.Count == 0 && proximos3.Count == 0)
        {
            await _db.SaveChangesAsync(ct);
            return false;
        }

        static decimal Soma(IEnumerable<Crediario> cs) => cs.Sum(c => c.SaldoRestanteEmReais);
        var partes = new List<string>();
        if (vencemHoje.Count > 0) partes.Add($"{vencemHoje.Count} vence(m) hoje (R$ {Soma(vencemHoje):N2})");
        if (vencidas.Count > 0)   partes.Add($"{vencidas.Count} em atraso (R$ {Soma(vencidas):N2})");
        if (proximos3.Count > 0)  partes.Add($"{proximos3.Count} vence(m) nos próximos 3 dias");
        var corpo = string.Join(" · ", partes)
            + (clientesAvisados > 0 ? $". Lembrete enviado pra {clientesAvisados} cliente(s)." : ".");

        var admins = await _db.Users
            .Where(u => u.Role == UserRole.Admin && u.IsActive)
            .Select(u => u.Id)
            .ToListAsync(ct);

        foreach (var adminId in admins)
            _db.Notifications.Add(new Notification
            {
                UserId = adminId,
                Title  = "Crediário hoje",
                Body   = corpo.Length > 500 ? corpo[..500] : corpo,
                Link   = "/admin/crediario",
            });
        await _db.SaveChangesAsync(ct);

        try { await _push.SendToManyAsync(admins, "Crediário hoje", corpo, "/admin/crediario"); }
        catch (Exception ex) { _logger.LogWarning(ex, "Push do resumo diário do crediário não saiu."); }

        return true;
    }

    // ── Texto ─────────────────────────────────────────────────────────────────

    /// <summary>Dias em relação ao vencimento, no calendário de Brasília (negativo = ainda não venceu).</summary>
    public static int DiasDoVencimento(Crediario c, DateTime hojeBr) =>
        (hojeBr - CrediarioLancamentos.ParaBrasilia(c.DataVencimento).Date).Days;

    private static string Situacao(Crediario c, DateTime hoje)
    {
        var dias = DiasDoVencimento(c, hoje);
        var data = CrediarioLancamentos.ParaBrasilia(c.DataVencimento).ToString("dd/MM");
        return dias switch
        {
            < -1 => $"vence em {-dias} dias ({data})",
            -1   => $"vence amanhã ({data})",
            0    => "vence hoje",
            1    => $"venceu ontem ({data})",
            _    => $"venceu em {data} ({dias} dias de atraso)",
        };
    }

    public static (string Titulo, string Texto) MontarMensagem(
        User user, List<Crediario> contasDoAviso, List<Crediario> todasDoCliente, DateTime hoje,
        string nomeLoja, string? mensagemExtra)
    {
        var piorDias = contasDoAviso.Max(c => DiasDoVencimento(c, hoje));
        var titulo = piorDias switch
        {
            < 0 => "Lembrete do seu crediário",
            0   => "Seu crediário vence hoje",
            _   => "Crediário em atraso",
        };

        var primeiroNome = user.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? user.Name;
        var sb = new StringBuilder();
        sb.Append($"Olá, {primeiroNome}! Aqui é do {nomeLoja}.\n");
        sb.Append(piorDias > 0
            ? "Passando pra lembrar que tem crediário em atraso:\n"
            : "Passando pra lembrar do seu crediário:\n");

        foreach (var c in contasDoAviso.OrderBy(c => c.DataVencimento))
            sb.Append($"• R$ {c.SaldoRestanteEmReais:N2} — {Situacao(c, hoje)}\n");

        var total = todasDoCliente.Sum(c => c.SaldoRestanteEmReais);
        if (todasDoCliente.Count > contasDoAviso.Count || contasDoAviso.Count > 1)
            sb.Append($"Total em aberto: R$ {total:N2}\n");

        sb.Append("\nDá pra pagar no balcão ou por Pix. Os detalhes de cada compra estão no seu perfil, na aba Dívida.");
        if (!string.IsNullOrWhiteSpace(mensagemExtra))
            sb.Append($"\n{mensagemExtra.Trim()}");
        sb.Append("\nSe já pagou, pode desconsiderar. 🙂");

        return (titulo, sb.ToString());
    }

    private static string ResumoCurto(List<Crediario> contasDoAviso, List<Crediario> todas, DateTime hoje)
    {
        var linhas = contasDoAviso
            .OrderBy(c => c.DataVencimento)
            .Select(c => $"R$ {c.SaldoRestanteEmReais:N2} {Situacao(c, hoje)}");
        var texto = string.Join(" · ", linhas);
        if (todas.Count > 1) texto += $". Total em aberto: R$ {todas.Sum(c => c.SaldoRestanteEmReais):N2}";
        return texto.Length > 500 ? texto[..500] : texto;
    }

    private async Task<string> NomeDaLojaAsync(CancellationToken ct)
    {
        var nome = await _db.SiteConfigs
            .Where(s => s.Id == SiteConfig.SingletonId)
            .Select(s => s.SiteName)
            .FirstOrDefaultAsync(ct);
        return string.IsNullOrWhiteSpace(nome) ? "Santuário Nerd" : nome;
    }
}
