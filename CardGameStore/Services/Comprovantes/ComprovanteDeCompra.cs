// =============================================================================
// ComprovanteDeCompra.cs — comprovante de compra pro cliente por e-mail (v1.99.0, chave "comprovante-compra").
//
// Sai quando a compra fica registrada no nome de um cliente cadastrado: comanda fechada (ComandaService) e
// venda (VendaAvulsaService: Frente de Caixa com cliente e pedido do site pago — Pix, registrar pagamento ou
// homologar). Pedido do Taino em 24/11, junto do comprovante de inscrição. O cliente desliga em Configurações
// (notifications.emailsCompra). O botão "Comprovante" do histórico monta o mesmo conteúdo no navegador.
//
// Preparar (leituras rápidas no banco) roda na requisição; o envio SMTP sai em segundo plano: fechar comanda e
// vender no PDV não podem esperar o servidor de e-mail. E-mail que falha só vira log.
// =============================================================================

using System.Text.Json;
using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Campeonatos;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Comprovantes;

/// <summary>Comprovante pronto pra mandar: pra quem e o quê.</summary>
public sealed record ComprovantePronto(string Email, ComprovanteCompraEmail Dados);

public static class ComprovanteDeCompra
{
    /// <summary>Minha conta → aba Compras.</summary>
    public const string Link = "/cliente/perfil?aba=historico";

    /// <summary>Código curto: os 8 últimos hexadecimais do id (o começo do id do Mongo é a hora — repete entre vendas).</summary>
    public static string Codigo(string id)
    {
        var hex = new string(id.Where(Uri.IsHexDigit).ToArray());
        return (hex.Length > 8 ? hex[^8..] : hex).ToUpperInvariant();
    }

    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static async Task<bool> LigadoAsync(AppDbContext db)
    {
        var mudada = await db.FuncionalidadesEstado.AsNoTracking()
            .Where(f => f.Codigo == Funcionalidades.ComprovanteCompra)
            .Select(f => (bool?)f.Ligada)
            .FirstOrDefaultAsync();
        return mudada ?? Funcionalidades.Buscar(Funcionalidades.ComprovanteCompra)!.Padrao;
    }

    public static bool AceitaEmails(string? preferencesJson)
    {
        if (string.IsNullOrWhiteSpace(preferencesJson)) return true;
        try { return JsonSerializer.Deserialize<UserPreferencesDto>(preferencesJson, Json)?.Notifications.EmailsCompra ?? true; }
        catch (JsonException) { return true; }
    }

    private static string Reais(int centavos) => Dinheiro.Brl(centavos / 100m);

    /// <summary>"Pix — R$ 10,00" por forma; com uma forma só, sem valor (é o total).</summary>
    public static List<string> Pagamento(string? forma, string? segunda, int segundaEmCentavos, int totalEmCentavos)
    {
        if (string.IsNullOrWhiteSpace(segunda) || segundaEmCentavos <= 0)
            return [PaymentMethod.Rotulo(forma)];
        return [$"{PaymentMethod.Rotulo(forma)} — {Reais(totalEmCentavos - segundaEmCentavos)}",
                $"{PaymentMethod.Rotulo(segunda)} — {Reais(segundaEmCentavos)}"];
    }

    /// <summary>Chave ligada, cliente com e-mail e que não desligou: devolve o destino; senão null.</summary>
    private static async Task<(string Email, string Nome, string Loja)?> DestinoAsync(AppDbContext db, Guid userId)
    {
        if (!await LigadoAsync(db)) return null;
        var u = await db.Users.AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new { x.Email, x.Name, x.PreferencesJson, x.DeletedAt })
            .FirstOrDefaultAsync();
        if (u is null || u.DeletedAt is not null || string.IsNullOrWhiteSpace(u.Email) || !AceitaEmails(u.PreferencesJson))
            return null;
        var loja = await db.SiteConfigs.AsNoTracking().Select(s => s.SiteName).FirstOrDefaultAsync();
        return (u.Email!, u.Name, string.IsNullOrWhiteSpace(loja) ? "Santuário Nerd" : loja);
    }

    /// <summary>Venda registrada (balcão ou pedido do site) no nome de um cliente.</summary>
    public static async Task<ComprovantePronto?> DaVendaAsync(AppDbContext db, VendaAvulsa venda)
    {
        if (venda.UserId is not Guid userId || venda.Cancelada) return null;
        if (await DestinoAsync(db, userId) is not { } d) return null;
        return new ComprovantePronto(d.Email, new ComprovanteCompraEmail(
            Loja:      d.Loja,
            Cliente:   d.Nome,
            Origem:    venda.Origem == "Reserva" ? "Pedido do site" : "Compra no balcão",
            Quando:    EmailDaInscricao.DataHora(venda.SoldAt),
            Itens:     venda.Items.Select(i => new ItemDoComprovante(i.ProductName, i.Quantity, Reais(i.SubtotalInCents))).ToList(),
            Desconto:  venda.DiscountInCents > 0 ? Reais(venda.DiscountInCents) : null,
            Pontos:    null,
            Total:     Reais(venda.TotalInCents),
            Pagamento: Pagamento(venda.PaymentMethod, venda.SecondPaymentMethod, venda.SecondPaymentAmountInCents, venda.TotalInCents),
            Codigo:    Codigo(venda.Id),
            Link:      Link));
    }

    /// <summary>Comanda fechada (TotalInCents já é o líquido, depois de pontos e desconto).</summary>
    public static async Task<ComprovantePronto?> DaComandaAsync(AppDbContext db, Comanda comanda)
    {
        if (comanda.Status != ComandaStatus.Fechada) return null;
        if (await DestinoAsync(db, comanda.UserId) is not { } d) return null;
        return new ComprovantePronto(d.Email, new ComprovanteCompraEmail(
            Loja:      d.Loja,
            Cliente:   d.Nome,
            Origem:    string.IsNullOrWhiteSpace(comanda.TableIdentifier) ? "Comanda" : $"Comanda · Mesa {comanda.TableIdentifier}",
            Quando:    EmailDaInscricao.DataHora(comanda.ClosedAt ?? DateTime.UtcNow),
            Itens:     comanda.Items.Select(i => new ItemDoComprovante(i.ItemNameSnapshot, i.Quantity, Reais(i.SubtotalInCents))).ToList(),
            Desconto:  comanda.DiscountInCents > 0 ? Reais(comanda.DiscountInCents) : null,
            Pontos:    comanda.PointsApplied > 0 ? Reais(comanda.PointsApplied) : null,
            Total:     Reais(comanda.TotalInCents),
            Pagamento: Pagamento(comanda.PaymentMethod, comanda.SecondPaymentMethod, comanda.SecondPaymentAmountInCents, comanda.TotalInCents),
            Codigo:    Codigo(comanda.Id.ToString()),
            Link:      Link));
    }

    /// <summary>Manda em segundo plano (o SMTP não segura o caixa). Falha vira log.</summary>
    public static void Enviar(IEmailService? email, ILogger logger, ComprovantePronto? pronto)
    {
        if (email is null || pronto is null) return;
        _ = Task.Run(async () =>
        {
            try { await email.SendComprovanteCompraAsync(pronto.Email, pronto.Dados); }
            catch (Exception ex) { logger.LogWarning(ex, "Comprovante de compra {Codigo} não saiu por e-mail.", pronto.Dados.Codigo); }
        });
    }

    /// <summary>Prepara e manda; nunca derruba quem chamou.</summary>
    public static async Task PrepararEEnviarAsync(IEmailService? email, ILogger logger, Func<Task<ComprovantePronto?>> preparar)
    {
        if (email is null) return;
        try { Enviar(email, logger, await preparar()); }
        catch (Exception ex) { logger.LogWarning(ex, "Comprovante de compra não foi preparado."); }
    }
}
