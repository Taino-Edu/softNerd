using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using CardGameStore.Validation;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public sealed partial class WhatsAppAutomationService : IWhatsAppAutomationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    private readonly AppDbContext _db;
    private readonly IReservationPixService _reservationPix;
    private readonly IPixReconciliationService _pixReconciliation;
    private readonly ILogger<WhatsAppAutomationService> _logger;

    public WhatsAppAutomationService(
        AppDbContext db,
        IReservationPixService reservationPix,
        IPixReconciliationService pixReconciliation,
        ILogger<WhatsAppAutomationService> logger)
    {
        _db = db;
        _reservationPix = reservationPix;
        _pixReconciliation = pixReconciliation;
        _logger = logger;
    }

    public async Task<WhatsAppAutomationResponse> ProcessarAsync(
        WhatsAppAutomationRequest request,
        CancellationToken cancellationToken = default)
    {
        var phone = Identificadores.NormalizarWhatsApp(request.Phone);
        if (phone is null || phone.Length is < 10 or > 11)
            return Reply(request.Phone, null, "Não consegui identificar o número desta conversa.");

        var messageId = string.IsNullOrWhiteSpace(request.MessageId)
            ? $"fallback:{Guid.NewGuid():N}"
            : request.MessageId.Trim();
        messageId = messageId[..Math.Min(messageId.Length, 200)];

        // O mesmo webhook pode ser reenviado pela Evolution/n8n. Reutilizar a resposta
        // evita gerar efeitos e mensagens duplicadas.
        var existing = await _db.WhatsAppInboundEvents
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.ExternalMessageId == messageId, cancellationToken);
        if (existing?.ResponseJson is not null)
            return JsonSerializer.Deserialize<WhatsAppAutomationResponse>(existing.ResponseJson, JsonOptions)
                ?? new WhatsAppAutomationResponse { Handled = false, Phone = phone };

        var inbound = new WhatsAppInboundEvent
        {
            ExternalMessageId = messageId,
            Phone = phone,
            MessageText = request.Text.Trim()[..Math.Min(request.Text.Trim().Length, 1000)],
        };
        _db.WhatsAppInboundEvents.Add(inbound);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            _db.Entry(inbound).State = EntityState.Detached;
            var duplicate = await _db.WhatsAppInboundEvents.AsNoTracking()
                .FirstOrDefaultAsync(e => e.ExternalMessageId == inbound.ExternalMessageId, cancellationToken);
            if (duplicate?.ResponseJson is not null)
                return JsonSerializer.Deserialize<WhatsAppAutomationResponse>(duplicate.ResponseJson, JsonOptions)
                    ?? new WhatsAppAutomationResponse { Handled = false, Phone = phone };

            return new WhatsAppAutomationResponse { Handled = false, Phone = phone };
        }

        WhatsAppAutomationResponse response;
        try
        {
            var user = await FindUserByPhoneAsync(phone, cancellationToken);
            var conversation = await _db.WhatsAppConversations
                .FirstOrDefaultAsync(c => c.Phone == phone, cancellationToken);
            if (conversation is null)
            {
                conversation = new WhatsAppConversation { Phone = phone };
                _db.WhatsAppConversations.Add(conversation);
            }

            conversation.UserId = user?.Id;
            conversation.LastInboundAt = DateTime.UtcNow;
            conversation.UpdatedAt = DateTime.UtcNow;

            var command = NormalizeCommand(request.Text);
            if (command == "bot")
            {
                conversation.BotPausedUntil = null;
                response = Reply(phone, user?.Id, $"Atendimento automático reativado.\n\n{Menu(user)}");
            }
            else if (conversation.BotPausedUntil > DateTime.UtcNow)
            {
                // Durante o handoff o Maikon conversa normalmente pelo próprio WhatsApp;
                // o workflow recebe o evento, mas não envia resposta automática.
                response = new WhatsAppAutomationResponse { Handled = false, Phone = phone, UserId = user?.Id };
            }
            else
            {
                response = await ExecuteCommandAsync(user, conversation, phone, request.Text, cancellationToken);
            }
            inbound.Status = "processed";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha ao processar WhatsApp {MessageId}", messageId);
            response = Reply(phone, null,
                "Tive um problema para consultar o sistema agora. Tente novamente em alguns minutos ou digite *atendente*.");
            inbound.Status = "failed";
        }

        inbound.ResponseJson = JsonSerializer.Serialize(response, JsonOptions);
        inbound.ProcessedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return response;
    }

    private async Task<WhatsAppAutomationResponse> ExecuteCommandAsync(
        User? user,
        WhatsAppConversation conversation,
        string phone,
        string rawText,
        CancellationToken cancellationToken)
    {
        var command = NormalizeCommand(rawText);

        if (command is "oi" or "ola" or "menu" or "ajuda" or "inicio" or "bom dia" or "boa tarde" or "boa noite")
            return Reply(phone, user?.Id, Menu(user));

        if (command is "pontos" or "saldo" or "meus pontos")
        {
            if (user is null) return NotRegistered(phone);
            var validade = user.PointsExpiresAt is null
                ? string.Empty
                : $"\nValidade atual: {user.PointsExpiresAt.Value.ToLocalTime():dd/MM/yyyy}.";
            return Reply(phone, user.Id, $"{FirstName(user.Name)}, você tem *{user.PointsBalance} pontos*.{validade}");
        }

        if (command is "reservas" or "reserva" or "pedidos" or "pedido")
        {
            if (user is null) return NotRegistered(phone);
            return await ReservationListAsync(user, phone, cancellationToken);
        }

        if (command == "pix" || PixCommandRegex().IsMatch(command))
        {
            if (user is null) return NotRegistered(phone);
            var match = PixCommandRegex().Match(command);
            int? selection = match.Success && int.TryParse(match.Groups[1].Value, out var parsed) ? parsed : null;
            return await GeneratePixAsync(user, phone, selection, cancellationToken);
        }

        if (command is "pago" or "pagamento" or "status pix" or "verificar pix")
        {
            if (user is null) return NotRegistered(phone);
            return await CheckPaymentAsync(user, phone, cancellationToken);
        }

        if (command is "atendente" or "humano" or "maikon" or "falar com atendente")
        {
            conversation.BotPausedUntil = DateTime.UtcNow.AddHours(4);
            conversation.UpdatedAt = DateTime.UtcNow;
            if (user is not null)
            {
                var admin = await _db.Users.FirstOrDefaultAsync(
                    u => u.IsActive && u.Role == UserRole.Admin, cancellationToken);
                if (admin is not null)
                {
                    _db.Notifications.Add(new Notification
                    {
                        UserId = admin.Id,
                        Title = "Cliente aguardando no WhatsApp",
                        Body = $"{user.Name} pediu atendimento humano.",
                        Link = "/admin/reservas",
                    });
                    await _db.SaveChangesAsync(cancellationToken);
                }
            }

            return Reply(phone, user?.Id,
                "Certo! Vou avisar o Maikon e vou ficar em silêncio por 4 horas para ele continuar o atendimento por aqui. 🙂\nSe quiser reativar antes, digite *BOT*.");
        }

        return Reply(phone, user?.Id,
            $"Não entendi *{rawText.Trim()}*.\n\n{Menu(user)}");
    }

    private async Task<WhatsAppAutomationResponse> ReservationListAsync(
        User user, string phone, CancellationToken cancellationToken)
    {
        var groups = await GetActiveReservationGroupsAsync(user.Id, cancellationToken);
        if (groups.Count == 0)
            return Reply(phone, user.Id, "Você não tem reservas ou filas ativas no momento.");

        var lines = new List<string> { $"Encontrei estas reservas para {FirstName(user.Name)}:" };
        for (var i = 0; i < groups.Count; i++)
        {
            var group = groups[i];
            var label = string.Join(", ", group.Items.Select(x => $"{x.Quantity}x {x.Product.Name}"));
            var hasPayable = group.Items.Any(x => x.Kind == "pre_venda" && x.Status == "active");
            lines.Add($"\n*{i + 1}.* {label}{(hasPayable ? " — aguardando pagamento/retirada" : " — na fila")}");
        }

        lines.Add(groups.Count == 1
            ? "\nDigite *PIX* para gerar ou recuperar a cobrança."
            : "\nPara pagar, responda *PIX 1*, *PIX 2* e assim por diante.");
        return Reply(phone, user.Id, string.Join(string.Empty, lines));
    }

    private async Task<WhatsAppAutomationResponse> GeneratePixAsync(
        User user, string phone, int? selection, CancellationToken cancellationToken)
    {
        var groups = await GetActiveReservationGroupsAsync(user.Id, cancellationToken);
        var payable = groups
            .Where(g => g.Items.Any(x => x.Kind == "pre_venda" && x.Status == "active"))
            .ToList();

        if (payable.Count == 0)
            return Reply(phone, user.Id,
                "Você não tem pré-venda aguardando pagamento. Itens que ainda estão na fila não geram Pix.");

        ReservationGroup group;
        if (selection.HasValue)
        {
            if (selection.Value < 1 || selection.Value > groups.Count)
                return Reply(phone, user.Id, "Esse número não corresponde a uma reserva. Digite *reservas* para ver a lista.");
            group = groups[selection.Value - 1];
            if (!group.Items.Any(x => x.Kind == "pre_venda" && x.Status == "active"))
                return Reply(phone, user.Id, "Esse item ainda está na fila e não pode ser pago agora.");
        }
        else if (payable.Count == 1)
        {
            group = payable[0];
        }
        else
        {
            return await ReservationListAsync(user, phone, cancellationToken);
        }

        var result = await _reservationPix.GerarAsync(
            group.GroupId, user.Id, cancellationToken: cancellationToken);
        if (!result.Success || result.Pix is null)
            return Reply(phone, user.Id, result.Error ?? "Não consegui gerar o Pix agora.");

        var pix = result.Pix;
        var expiry = pix.ExpiraEm is null ? string.Empty : $"\nVálido até {pix.ExpiraEm.Value.ToLocalTime():dd/MM/yyyy HH:mm}.";
        var reuse = result.Reused ? "Recuperei a cobrança que já estava ativa." : "Cobrança criada pelo Banco Inter.";
        var code = string.IsNullOrWhiteSpace(pix.PixCopiaCola)
            ? "O código copia e cola não foi retornado; fale com o atendente."
            : pix.PixCopiaCola;

        return new WhatsAppAutomationResponse
        {
            Phone = phone,
            UserId = user.Id,
            Replies =
            [
                new WhatsAppReply
                {
                    Text = $"{reuse}\nValor: *{FormatCurrency(pix.ValorEmReais)}*.{expiry}\n\nCopie o código da próxima mensagem e pague no aplicativo do seu banco."
                },
                new WhatsAppReply { Text = code },
                new WhatsAppReply { Text = "Depois do pagamento, responda *PAGO* para conferir na hora." },
            ],
        };
    }

    private async Task<WhatsAppAutomationResponse> CheckPaymentAsync(
        User user, string phone, CancellationToken cancellationToken)
    {
        var groupIds = await _db.ProductReservations
            .Where(r => r.UserId == user.Id)
            .Select(r => r.ReservationGroupId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var pixes = await _db.PixCobrancas
            .Where(p => p.Origem == PixCobrancaOrigem.Reserva &&
                        p.ReservationGroupId.HasValue && groupIds.Contains(p.ReservationGroupId.Value) &&
                        p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .ToListAsync(cancellationToken);

        if (pixes.Count == 0)
        {
            var lastPaid = await _db.PixCobrancas
                .Where(p => p.Origem == PixCobrancaOrigem.Reserva &&
                            p.ReservationGroupId.HasValue && groupIds.Contains(p.ReservationGroupId.Value) &&
                            p.Status == "CONCLUIDA")
                .OrderByDescending(p => p.PagoEm)
                .FirstOrDefaultAsync(cancellationToken);
            return lastPaid is null
                ? Reply(phone, user.Id, "Não encontrei uma cobrança Pix ativa para suas reservas.")
                : Reply(phone, user.Id, $"Seu último Pix está *pago* ✅\nConfirmado em {lastPaid.PagoEm?.ToLocalTime():dd/MM/yyyy HH:mm}.");
        }

        foreach (var pix in pixes)
            await _pixReconciliation.ReconciliarAsync(pix);

        var paid = pixes.FirstOrDefault(p => p.Status == "CONCLUIDA");
        return paid is not null
            ? Reply(phone, user.Id, $"Pagamento confirmado ✅\nValor: *{FormatCurrency(paid.ValorEmReais)}*. Sua compra está aguardando retirada.")
            : Reply(phone, user.Id, "O Banco Inter ainda não confirmou o pagamento. Se você acabou de pagar, aguarde um minuto e envie *PAGO* novamente.");
    }

    private async Task<User?> FindUserByPhoneAsync(string phone, CancellationToken cancellationToken)
    {
        var withCountry = "55" + phone;
        return await _db.Users.FirstOrDefaultAsync(u =>
            u.IsActive && u.WhatsApp != null &&
            (u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                .Replace("-", "").Replace("+", "") == phone ||
             u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                .Replace("-", "").Replace("+", "") == withCountry), cancellationToken);
    }

    private async Task<List<ReservationGroup>> GetActiveReservationGroupsAsync(
        Guid userId, CancellationToken cancellationToken)
    {
        var items = await _db.ProductReservations
            .AsNoTracking()
            .Include(r => r.Product)
            .Include(r => r.Variant)
            .Where(r => r.UserId == userId && (r.Status == "active" || r.Status == "waiting"))
            .OrderByDescending(r => r.ReservedAt)
            .ToListAsync(cancellationToken);

        return items
            .GroupBy(r => r.ReservationGroupId)
            .Select(g => new ReservationGroup(g.Key, g.OrderBy(x => x.ReservedAt).ToList(), g.Max(x => x.ReservedAt)))
            .OrderByDescending(g => g.ReservedAt)
            .ToList();
    }

    private static WhatsAppAutomationResponse NotRegistered(string phone) => Reply(phone, null,
        "Não encontrei um cadastro com este WhatsApp. Cadastre-se em https://santuarionerd.com.br/cadastro usando este mesmo número ou fale com o atendente.");

    private static WhatsAppAutomationResponse Reply(string phone, Guid? userId, string text) => new()
    {
        Phone = phone,
        UserId = userId,
        Replies = [new WhatsAppReply { Text = text }],
    };

    private static string Menu(User? user)
    {
        var hello = user is null ? "Olá! Sou o assistente do Santuário Nerd. 🎴" : $"Olá, {FirstName(user.Name)}! 🎴";
        return $"{hello}\n\nVocê pode digitar:\n*RESERVAS* — ver pedidos e filas\n*PIX* — pagar uma pré-venda\n*PAGO* — conferir o pagamento\n*PONTOS* — consultar seus pontos\n*ATENDENTE* — falar com o Maikon";
    }

    private static string FirstName(string name) =>
        name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? name;

    private static string FormatCurrency(decimal value) =>
        value.ToString("C", PtBr).Replace('\u00A0', ' ');

    private static string NormalizeCommand(string text)
    {
        var normalized = text.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var chars = normalized.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark);
        return string.Join(' ', new string(chars.ToArray()).Normalize(NormalizationForm.FormC)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private sealed record ReservationGroup(Guid GroupId, List<ProductReservation> Items, DateTime ReservedAt);

    [GeneratedRegex(@"^pix\s+(\d+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex PixCommandRegex();
}
