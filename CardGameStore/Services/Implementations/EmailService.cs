// =============================================================================
// EmailService.cs — Envio de emails via SMTP
//
// Configuração (appsettings.json ou variáveis de ambiente):
//   EmailSettings__Host     → smtp.gmail.com  (ou smtp.sendgrid.net etc.)
//   EmailSettings__Port     → 587
//   EmailSettings__User     → seu@email.com
//   EmailSettings__Password → senha-de-app ou api-key
//   EmailSettings__From     → noreply@softnerd.com.br
//   EmailSettings__AppUrl   → https://softnerd.com.br (para montar o link de reset)
//
// Para Gmail: ative "Senhas de app" nas configurações da conta Google.
// Para SendGrid: use smtp.sendgrid.net:587, usuário "apikey", senha = API Key.
// =============================================================================

using System.Net;
using System.Net.Mail;
using CardGameStore.Services.Interfaces;

namespace CardGameStore.Services.Implementations;

public class EmailService : IEmailService
{
    private readonly IConfiguration         _config;
    private readonly ILogger<EmailService>  _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendPasswordResetAsync(string toEmail, string toName, string resetToken)
    {
        var appUrl = _config["SmtpSettings:AppUrl"] ?? _config["EmailSettings:AppUrl"] ?? "https://santuarionerd.com.br";
        var link   = $"{appUrl}/reset-password?token={Uri.EscapeDataString(resetToken)}";

        var body = $"""
            <p>Olá, <strong>{toName}</strong>!</p>
            <p>Recebemos uma solicitação de redefinição de senha para sua conta no <strong>softNerd</strong>.</p>
            <p>
              <a href="{link}" style="background:#f59e0b;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
                Redefinir minha senha
              </a>
            </p>
            <p style="color:#888;font-size:12px;">
              Este link expira em 2 horas. Se você não solicitou a redefinição, ignore este email.
            </p>
            """;

        await SendAsync(toEmail, toName, "Redefinição de senha — softNerd", body);
    }

    public async Task SendWelcomeAsync(string toEmail, string toName)
    {
        var body = $"""
            <p>Olá, <strong>{toName}</strong>! Seja bem-vindo(a) ao softNerd!</p>
            <p>Seu cadastro foi criado automaticamente ao escanear o QR Code da mesa.</p>
            <p>Acumule pontos a cada visita e troque por produtos na loja.</p>
            <p style="color:#888;font-size:12px;">
              Dúvidas? Fale com o Maikon no balcão.
            </p>
            """;

        await SendAsync(toEmail, toName, "Bem-vindo(a) ao softNerd!", body);
    }

    public async Task SendCrediarioAbertoAsync(string toEmail, string toName, decimal valor, DateTime vencimento)
    {
        var venc = vencimento.ToLocalTime().ToString("dd/MM/yyyy");
        var body = $"""
            <div style="font-family:sans-serif;max-width:500px">
              <h2 style="color:#7839F3">softNerd — Crediário Aberto</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>
                Uma comanda foi registrada no seu crediário.
                Por favor, efetue o pagamento até a data de vencimento.
              </p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr>
                  <td style="padding:8px;color:#666">Valor</td>
                  <td style="padding:8px;font-weight:bold;color:#111">R$ {valor:N2}</td>
                </tr>
                <tr style="background:#f9f9f9">
                  <td style="padding:8px;color:#666">Vencimento</td>
                  <td style="padding:8px;font-weight:bold;color:#dc2626">{venc}</td>
                </tr>
              </table>
              <p>
                Enquanto o crediário estiver em aberto, novas comandas ficarão bloqueadas.
                Compareça à loja ou fale com o Maikon para quitar.
              </p>
              <p style="color:#888;font-size:12px">softNerd — Sistema de Gestão</p>
            </div>
            """;

        await SendAsync(toEmail, toName, $"Crediário aberto — R$ {valor:N2} vence em {venc}", body);
    }

    public async Task SendCrediarioPagoAsync(string toEmail, string toName, decimal valor)
    {
        var body = $"""
            <div style="font-family:sans-serif;max-width:500px">
              <h2 style="color:#00F0A8">softNerd — Crediário Quitado</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>
                Seu crediário de <strong>R$ {valor:N2}</strong> foi quitado com sucesso.
                Obrigado pelo pagamento!
              </p>
              <p>Você já pode abrir uma nova comanda normalmente.</p>
              <p style="color:#888;font-size:12px">softNerd — Sistema de Gestão</p>
            </div>
            """;

        await SendAsync(toEmail, toName, "Crediário quitado — softNerd", body);
    }

    public async Task SendCampeonatoInscricaoAsync(string toEmail, string toName, string campeonato, DateTime data, decimal entryFee)
    {
        var dataFmt = data.ToLocalTime().ToString("dd/MM/yyyy 'às' HH:mm");
        var body = $"""
            <div style="font-family:sans-serif;max-width:500px">
              <h2 style="color:#7839F3">softNerd — Inscrição Confirmada</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>Sua inscrição no campeonato abaixo foi confirmada:</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr>
                  <td style="padding:8px;color:#666">Campeonato</td>
                  <td style="padding:8px;font-weight:bold">{campeonato}</td>
                </tr>
                <tr style="background:#f9f9f9">
                  <td style="padding:8px;color:#666">Data</td>
                  <td style="padding:8px;font-weight:bold">{dataFmt}</td>
                </tr>
                <tr>
                  <td style="padding:8px;color:#666">Taxa de Inscrição</td>
                  <td style="padding:8px;font-weight:bold">R$ {entryFee:N2}</td>
                </tr>
              </table>
              <p>Apareça na loja no dia do evento. Boa sorte!</p>
              <p style="color:#888;font-size:12px">softNerd — Sistema de Gestão</p>
            </div>
            """;

        await SendAsync(toEmail, toName, $"Inscrição confirmada: {campeonato}", body);
    }

    public async Task SendWaitListNotifiedAsync(string toEmail, string toName, string productName, string productUrl)
    {
        var body = $"""
            <div style="font-family:sans-serif;max-width:500px">
              <h2 style="color:#7C3AED">softNerd — Chegou sua vez! 🎉</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>
                Boa notícia! Você é o próximo da lista de espera para o produto
                <strong>{productName}</strong>.
              </p>
              <p>
                <a href="{productUrl}"
                   style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
                  Ver produto
                </a>
              </p>
              <p style="color:#888;font-size:12px">
                Se não conseguir finalizar a compra, entre em contato com a loja pelo WhatsApp.
              </p>
              <p style="color:#888;font-size:12px">softNerd — Sistema de Gestão</p>
            </div>
            """;

        await SendAsync(toEmail, toName, $"Chegou sua vez — {productName}", body);
    }

    public async Task<int> SendAnuncioAsync(IEnumerable<(string email, string name)> destinatarios, string titulo, string corpo,
                                            string? imageUrl = null, string? link = null)
    {
        var appUrl = (_config["SmtpSettings:AppUrl"] ?? _config["EmailSettings:AppUrl"] ?? "https://santuarionerd.com.br").TrimEnd('/');

        // Conteúdo vem de campos de texto livre do admin: escapa HTML e preserva quebras de linha.
        var tituloHtml = WebUtility.HtmlEncode(titulo);
        var corpoHtml  = WebUtility.HtmlEncode(corpo).Replace("\n", "<br/>");

        string AbsoluteUrl(string url) =>
            url.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? url : $"{appUrl}{(url.StartsWith('/') ? "" : "/")}{url}";

        var imagemHtml = string.IsNullOrWhiteSpace(imageUrl) ? "" : $"""
              <img src="{AbsoluteUrl(imageUrl)}" alt=""
                   style="width:100%;max-width:520px;border-radius:12px;display:block;margin:0 0 16px 0"/>
            """;

        var botaoHtml = string.IsNullOrWhiteSpace(link) ? "" : $"""
              <p style="margin:20px 0">
                <a href="{AbsoluteUrl(link)}"
                   style="display:inline-block;background:#7839F3;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
                  Ver no site
                </a>
              </p>
            """;

        var host     = _config["SmtpSettings:Host"];
        var portStr  = _config["SmtpSettings:Port"];
        var user     = _config["SmtpSettings:Username"];
        var password = _config["SmtpSettings:Password"];
        var from     = _config["SmtpSettings:FromEmail"] ?? user;
        var fromName = _config["SmtpSettings:FromName"] ?? "softNerd";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogWarning("EmailService: SmtpSettings não configurado. Anúncio '{Titulo}' não foi enviado.", titulo);
            return 0;
        }

        var unsubscribeMailto = $"mailto:{from}?subject={Uri.EscapeDataString("Cancelar inscrição - " + titulo)}";

        var body = $"""
            <div style="font-family:sans-serif;max-width:520px">
              {imagemHtml}
              <h2 style="color:#7839F3;margin-top:0">{tituloHtml}</h2>
              <div style="margin:16px 0;color:#333;line-height:1.6">
                {corpoHtml}
              </div>
              {botaoHtml}
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="color:#888;font-size:12px">
                Você recebe este email por ser cliente softNerd.<br/>
                Dúvidas? Fale com o Maikon no balcão.<br/>
                Não quer mais receber estes avisos? <a href="{unsubscribeMailto}" style="color:#888">Clique aqui para se descadastrar</a>.
              </p>
            </div>
            """;

        var textBody = $"""
            {titulo}

            {corpo}

            {(string.IsNullOrWhiteSpace(link) ? "" : $"Ver no site: {AbsoluteUrl(link)}\n")}
            --
            Você recebe este email por ser cliente softNerd. Dúvidas? Fale com o Maikon no balcão.
            Não quer mais receber estes avisos? Responda este email pedindo para ser descadastrado.
            """;

        var port = int.TryParse(portStr, out var p) ? p : 587;
        using var client = new SmtpClient(host, port)
        {
            Credentials    = new NetworkCredential(user, password),
            EnableSsl      = true,
            DeliveryMethod = SmtpDeliveryMethod.Network,
        };

        // Reutiliza a mesma conexão SMTP para o lote inteiro — falha em um
        // destinatário não interrompe os demais.
        var enviados = 0;
        foreach (var (email, name) in destinatarios)
        {
            try
            {
                using var msg = new MailMessage
                {
                    From       = new MailAddress(from!, fromName),
                    Subject    = $"softNerd — {titulo}",
                    Body       = textBody,
                    IsBodyHtml = false,
                };
                msg.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(body, null, "text/html"));
                msg.Headers.Add("List-Unsubscribe", $"<{unsubscribeMailto}>");
                msg.To.Add(new MailAddress(email, name));
                await client.SendMailAsync(msg);
                enviados++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao enviar anúncio '{Titulo}' para {To}", titulo, email);
            }
        }

        _logger.LogInformation("Anúncio '{Titulo}': {Ok} de {Total} e-mails enviados.", titulo, enviados, destinatarios.Count());
        return enviados;
    }

    // ── LGPD ──────────────────────────────────────────────────────────────────

    public async Task SendLgpdConfirmationAsync(
        string   toEmail,
        string   toName,
        string   protocol,
        string   requestType,
        DateTime deadline)
    {
        var prazo = deadline.ToLocalTime().ToString("dd/MM/yyyy");
        var body = $"""
            <div style="font-family:sans-serif;max-width:560px;color:#222">
              <h2 style="color:#7839F3">softNerd — Solicitação LGPD Recebida</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>
                Sua solicitação de <strong>{requestType}</strong> de dados pessoais foi recebida
                com sucesso pela <strong>softNerd</strong>.
              </p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
                <tr style="background:#f5f0ff">
                  <td style="padding:10px 14px;color:#555;width:40%">Número de Protocolo</td>
                  <td style="padding:10px 14px;font-weight:bold;font-family:monospace">{protocol}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;color:#555">Tipo de Solicitação</td>
                  <td style="padding:10px 14px;font-weight:bold">{requestType}</td>
                </tr>
                <tr style="background:#f5f0ff">
                  <td style="padding:10px 14px;color:#555">Prazo de Resposta</td>
                  <td style="padding:10px 14px;font-weight:bold;color:#dc2626">{prazo}</td>
                </tr>
              </table>
              <p>
                Nos termos da Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018, Art. 18 § 5°),
                sua solicitação será respondida em até <strong>15 dias corridos</strong>.
              </p>
              <p>
                Guarde seu número de protocolo para acompanhar o andamento em:
                <br/>
                <a href="https://softnerd.com.br/lgpd" style="color:#7839F3">softnerd.com.br/lgpd</a>
              </p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="color:#888;font-size:12px">
                Dúvidas? Entre em contato: <a href="mailto:privacidade@softnerd.com.br">privacidade@softnerd.com.br</a><br/>
                softNerd — São José do Rio Preto, SP
              </p>
            </div>
            """;

        await SendAsync(toEmail, toName, $"Solicitação LGPD recebida — Protocolo {protocol}", body);
    }

    public async Task SendLgpdResponseAsync(
        string toEmail,
        string toName,
        string protocol,
        string requestType,
        string response)
    {
        var body = $"""
            <div style="font-family:sans-serif;max-width:560px;color:#222">
              <h2 style="color:#7839F3">softNerd — Resposta à sua Solicitação LGPD</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>
                Sua solicitação de <strong>{requestType}</strong> (Protocolo: <code>{protocol}</code>)
                foi analisada e respondida pela <strong>softNerd</strong>.
              </p>
              <div style="background:#f5f0ff;border-left:4px solid #7839F3;padding:16px;margin:20px 0;border-radius:4px">
                <p style="margin:0;font-weight:bold;color:#555;font-size:13px;margin-bottom:8px">RESPOSTA DA SOFTNERD:</p>
                <p style="margin:0;white-space:pre-wrap">{response}</p>
              </div>
              <p>
                Caso não esteja satisfeito(a) com a resposta, você tem o direito de apresentar
                reclamação à Autoridade Nacional de Proteção de Dados (ANPD) através do portal:
                <a href="https://www.gov.br/anpd" style="color:#7839F3">www.gov.br/anpd</a>
              </p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="color:#888;font-size:12px">
                Dúvidas? Entre em contato: <a href="mailto:privacidade@softnerd.com.br">privacidade@softnerd.com.br</a><br/>
                softNerd — São José do Rio Preto, SP
              </p>
            </div>
            """;

        await SendAsync(toEmail, toName, $"Resposta à sua solicitação LGPD — Protocolo {protocol}", body);
    }

    public async Task<bool> SendDiagnosticEmailAsync(string toEmail)
    {
        var body = $"""
            <h2>Teste de Diagnóstico — softNerd</h2>
            <p>Se você está lendo isso, a configuração de SMTP do servidor está <strong>funcional</strong>!</p>
            <hr/>
            <p><strong>Timestamp:</strong> {DateTime.Now:dd/MM/yyyy HH:mm:ss}</p>
            <p><strong>Servidor:</strong> {Environment.MachineName}</p>
            """;

        try
        {
            await SendAsync(toEmail, "Admin Teste", "Diagnóstico de Email — softNerd", body);
            return true;
        }
        catch
        {
            return false;
        }
    }

    // ── Fiscal ────────────────────────────────────────────────────────────────

    public async Task SendCertificadoVencendoAsync(string toEmail, string toName, int diasRestantes, DateTime validade)
    {
        var venc = validade.ToLocalTime().ToString("dd/MM/yyyy");
        var body = $"""
            <div style="font-family:sans-serif;max-width:520px">
              <h2 style="color:#dc2626">softNerd — Certificado Digital Vencendo</h2>
              <p>Olá, <strong>{toName}</strong>!</p>
              <p>
                O certificado digital A1 usado para emitir NFC-e vence em
                <strong>{diasRestantes} dia{(diasRestantes == 1 ? "" : "s")}</strong> ({venc}).
              </p>
              <p>
                Acesse <strong>Admin &gt; Fiscal</strong> e envie o novo certificado antes do vencimento
                para não interromper a emissão de notas.
              </p>
              <p style="color:#888;font-size:12px">softNerd — Sistema de Gestão</p>
            </div>
            """;

        await SendAsync(toEmail, toName, $"Certificado fiscal vence em {diasRestantes} dia(s) — softNerd", body);
    }

    public async Task SendXmlsMensalContadorAsync(string toEmail, string mesReferencia, byte[] zipBytes, string zipFileName)
    {
        var body = $"""
            <div style="font-family:sans-serif;max-width:520px">
              <h2 style="color:#7839F3">softNerd — XMLs Fiscais do Mês</h2>
              <p>Olá!</p>
              <p>
                Segue em anexo o ZIP com os XMLs das NFC-e autorizadas e canceladas
                referentes a <strong>{mesReferencia}</strong>.
              </p>
              <p style="color:#888;font-size:12px">softNerd — Sistema de Gestão</p>
            </div>
            """;

        await SendWithAttachmentAsync(toEmail, "Contador", $"XMLs fiscais — {mesReferencia}", body, zipBytes, zipFileName);
    }

    // ── Interno ───────────────────────────────────────────────────────────────

    private async Task SendWithAttachmentAsync(
        string toEmail, string toName, string subject, string htmlBody, byte[] attachmentBytes, string attachmentName)
    {
        var host     = _config["SmtpSettings:Host"];
        var portStr  = _config["SmtpSettings:Port"];
        var user     = _config["SmtpSettings:Username"];
        var password = _config["SmtpSettings:Password"];
        var from     = _config["SmtpSettings:FromEmail"] ?? user;
        var fromName = _config["SmtpSettings:FromName"] ?? "softNerd";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogWarning(
                "EmailService: SmtpSettings não configurado. Email com anexo para {To} ('{Subject}') não foi enviado.",
                toEmail, subject);
            return;
        }

        try
        {
            var port = int.TryParse(portStr, out var p) ? p : 587;
            using var client = new SmtpClient(host, port)
            {
                Credentials    = new NetworkCredential(user, password),
                EnableSsl      = true,
                DeliveryMethod = SmtpDeliveryMethod.Network,
            };

            using var msg = new MailMessage
            {
                From       = new MailAddress(from!, fromName),
                Subject    = subject,
                Body       = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(new MailAddress(toEmail, toName));

            using var attachmentStream = new MemoryStream(attachmentBytes);
            msg.Attachments.Add(new Attachment(attachmentStream, attachmentName, "application/zip"));

            await client.SendMailAsync(msg);
            _logger.LogInformation("Email com anexo '{Subject}' enviado para {To}", subject, toEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha ao enviar email com anexo '{Subject}' para {To}", subject, toEmail);
        }
    }

    private async Task SendAsync(string toEmail, string toName, string subject, string htmlBody)
    {
        var host     = _config["SmtpSettings:Host"];
        var portStr  = _config["SmtpSettings:Port"];
        var user     = _config["SmtpSettings:Username"];
        var password = _config["SmtpSettings:Password"];
        var from     = _config["SmtpSettings:FromEmail"] ?? user;
        var fromName = _config["SmtpSettings:FromName"] ?? "softNerd";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogWarning(
                "EmailService: SmtpSettings não configurado. Email para {To} ('{Subject}') não foi enviado.",
                toEmail, subject);
            return;
        }

        try
        {
            var port   = int.TryParse(portStr, out var p) ? p : 587;
            using var client = new SmtpClient(host, port)
            {
                Credentials       = new NetworkCredential(user, password),
                EnableSsl         = true,
                DeliveryMethod    = SmtpDeliveryMethod.Network,
            };

            using var msg = new MailMessage
            {
                From       = new MailAddress(from!, fromName),
                Subject    = subject,
                Body       = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(new MailAddress(toEmail, toName));

            await client.SendMailAsync(msg);
            _logger.LogInformation("Email '{Subject}' enviado para {To}", subject, toEmail);
        }
        catch (Exception ex)
        {
            // Falha de email não derruba o fluxo principal
            _logger.LogError(ex, "Falha ao enviar email '{Subject}' para {To}", subject, toEmail);
        }
    }
}
