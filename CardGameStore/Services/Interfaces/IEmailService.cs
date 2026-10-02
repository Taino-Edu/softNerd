// =============================================================================
// IEmailService.cs — Contrato de envio de emails do sistema
// =============================================================================

namespace CardGameStore.Services.Interfaces;

public interface IEmailService
{
    // ── Autenticação ──────────────────────────────────────────────────────────

    /// <summary>Envia email de recuperação de senha com link contendo o token.</summary>
    Task SendPasswordResetAsync(string toEmail, string toName, string resetToken);

    /// <summary>Envia email de boas-vindas após primeiro login via QR Code.</summary>
    Task SendWelcomeAsync(string toEmail, string toName);

    // ── Crediário ─────────────────────────────────────────────────────────────

    /// <summary>Notifica o cliente que uma comanda foi lançada no crediário.</summary>
    Task SendCrediarioAbertoAsync(string toEmail, string toName, decimal valor, DateTime vencimento);

    /// <summary>Notifica o cliente que seu crediário foi quitado.</summary>
    Task SendCrediarioPagoAsync(string toEmail, string toName, decimal valor);

    /// <summary>
    /// Lembrete de vencimento do crediário. <paramref name="mensagem"/> é texto puro
    /// (o mesmo do WhatsApp) — é escapado e as quebras de linha viram &lt;br&gt;.
    /// </summary>
    Task SendCrediarioLembreteAsync(string toEmail, string toName, string assunto, string mensagem);

    // ── Campeonatos ───────────────────────────────────────────────────────────

    /// <summary>Confirmação de inscrição em campeonato.</summary>
    Task SendCampeonatoInscricaoAsync(string toEmail, string toName, string campeonato, DateTime data, decimal entryFee);

    // ── Pré-venda / Lista de espera ───────────────────────────────────────────

    /// <summary>Avisa o cliente que chegou sua vez na lista de espera.</summary>
    Task SendWaitListNotifiedAsync(string toEmail, string toName, string productName, string productUrl);

    // ── Anúncios (broadcast) ──────────────────────────────────────────────────

    /// <summary>
    /// Envia anúncio/promoção para uma lista de destinatários.
    /// Imagem e link são opcionais; retorna a quantidade de e-mails enviados com sucesso.
    /// </summary>
    Task<int> SendAnuncioAsync(IEnumerable<(string email, string name)> destinatarios, string titulo, string corpo,
                               string? imageUrl = null, string? link = null);

    // ── LGPD ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Confirma ao solicitante o recebimento da solicitação LGPD com número de protocolo e prazo.
    /// </summary>
    Task SendLgpdConfirmationAsync(string toEmail, string toName, string protocol,
                                   string requestType, DateTime deadline);

    /// <summary>
    /// Envia ao solicitante a resposta formal do responsável pelo tratamento de dados.
    /// </summary>
    Task SendLgpdResponseAsync(string toEmail, string toName, string protocol,
                                string requestType, string response);

    /// <summary>Envia um email de diagnóstico para testar as configurações de SMTP.</summary>
    Task<bool> SendDiagnosticEmailAsync(string toEmail);

    // ── Fiscal ────────────────────────────────────────────────────────────────

    /// <summary>Alerta o admin que o certificado digital A1 está próximo do vencimento.</summary>
    Task SendCertificadoVencendoAsync(string toEmail, string toName, int diasRestantes, DateTime validade);

    /// <summary>Envia ao contador o ZIP mensal com os XMLs de NFC-e autorizadas/canceladas.</summary>
    Task SendXmlsMensalContadorAsync(string toEmail, string mesReferencia, byte[] zipBytes, string zipFileName);
}
