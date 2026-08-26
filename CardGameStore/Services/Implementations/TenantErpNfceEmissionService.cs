using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;

namespace CardGameStore.Services.Implementations;

/// <summary>
/// Adaptador do Soft Nerd para o motor fiscal hospedado no Tenant ERP. O Soft
/// continua dono da venda e guarda apenas uma referencia local para historico e
/// autorizacao das telas; certificado, XML, numeracao e SEFAZ ficam no central.
/// </summary>
public sealed class TenantErpNfceEmissionService : INfceEmissionService
{
    private const string Source = "softnerd";
    private readonly AppDbContext _db;
    private readonly IMongoDatabase _mongo;
    private readonly ITenantErpApiClient _client;

    public TenantErpNfceEmissionService(
        AppDbContext db, IMongoDatabase mongo, ITenantErpApiClient client)
    {
        _db = db;
        _mongo = mongo;
        _client = client;
    }

    public async Task<NotaFiscalEmitida> EmitirParaComandaAsync(Guid comandaId)
    {
        var existente = await _db.NotasFiscaisEmitidas
            .FirstOrDefaultAsync(n => n.Origem == NotaFiscalOrigem.Comanda && n.ComandaId == comandaId);
        if (existente is not null)
        {
            if (existente.Status != NotaFiscalStatus.PendenteEmissao) return existente;
            if (existente.Numero.HasValue || !string.IsNullOrWhiteSpace(existente.ChaveAcesso)) return existente;
            if (existente.CentralFiscalNoteId.HasValue || !string.IsNullOrWhiteSpace(existente.CentralFiscalPayloadJson))
                return await ReprocessarAsync(existente.Id);
            _db.NotasFiscaisEmitidas.Remove(existente);
            await _db.SaveChangesAsync();
        }

        try
        {
            return await EmitirComandaCentralAsync(comandaId);
        }
        catch (Exception ex)
        {
            return await SavePendingShadowAsync(
                NotaFiscalOrigem.Comanda, comandaId, null, null, ex.Message);
        }
    }

    private async Task<NotaFiscalEmitida> EmitirComandaCentralAsync(Guid comandaId)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.NaturezaOperacao)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException("Comanda nao encontrada para emissao fiscal.");
        if (comanda.Status is ComandaStatus.Cancelada or ComandaStatus.Estornada)
            throw new InvalidOperationException("Comanda cancelada ou estornada nao pode emitir NFC-e.");

        var padrao = await _db.NaturezasOperacao.AsNoTracking().FirstOrDefaultAsync(n => n.IsPadrao);
        var items = comanda.Items.Select(i => MapItem(
            i.ItemNameSnapshot, i.Product, i.Product?.NaturezaOperacao ?? padrao,
            i.Quantity, i.UnitPriceInCents, i.SubtotalInCents)).ToList();
        var gross = items.Sum(i => i.SubtotalInCents);
        var externalId = $"comanda:{comandaId}";
        var request = new TenantErpFiscalEmissionRequest(
            Source, externalId, $"{Source}:{externalId}", items,
            comanda.PaymentMethod ?? PaymentMethod.Dinheiro,
            comanda.SecondPaymentMethod, comanda.SecondPaymentAmountInCents,
            Math.Clamp(gross - comanda.TotalInCents, 0, gross), null, 0, comanda.User?.Cpf);
        try
        {
            var response = await _client.EmitFiscalNoteAsync(request, CancellationToken.None);
            return await SaveShadowAsync(response, NotaFiscalOrigem.Comanda, comandaId, null);
        }
        catch (Exception ex)
        {
            return await SavePendingShadowAsync(
                NotaFiscalOrigem.Comanda, comandaId, null,
                JsonSerializer.Serialize(request), ex.Message);
        }
    }

    public async Task<NotaFiscalEmitida> EmitirParaVendaAvulsaAsync(string vendaAvulsaId)
    {
        var existente = await _db.NotasFiscaisEmitidas
            .FirstOrDefaultAsync(n => n.Origem == NotaFiscalOrigem.VendaAvulsa && n.VendaAvulsaId == vendaAvulsaId);
        if (existente is not null)
        {
            if (existente.Status != NotaFiscalStatus.PendenteEmissao) return existente;
            if (existente.Numero.HasValue || !string.IsNullOrWhiteSpace(existente.ChaveAcesso)) return existente;
            if (existente.CentralFiscalNoteId.HasValue || !string.IsNullOrWhiteSpace(existente.CentralFiscalPayloadJson))
                return await ReprocessarAsync(existente.Id);
            _db.NotasFiscaisEmitidas.Remove(existente);
            await _db.SaveChangesAsync();
        }

        try
        {
            return await EmitirVendaCentralAsync(vendaAvulsaId);
        }
        catch (Exception ex)
        {
            return await SavePendingShadowAsync(
                NotaFiscalOrigem.VendaAvulsa, null, vendaAvulsaId, null, ex.Message);
        }
    }

    private async Task<NotaFiscalEmitida> EmitirVendaCentralAsync(string vendaAvulsaId)
    {
        var venda = await _mongo.GetCollection<VendaAvulsa>("vendas_avulsas")
            .Find(v => v.Id == vendaAvulsaId).FirstOrDefaultAsync()
            ?? throw new InvalidOperationException("Venda avulsa nao encontrada para emissao fiscal.");
        if (venda.Cancelada)
            throw new InvalidOperationException("Venda avulsa cancelada nao pode emitir NFC-e.");

        var ids = venda.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await _db.Products.Include(p => p.NaturezaOperacao)
            .Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var padrao = await _db.NaturezasOperacao.AsNoTracking().FirstOrDefaultAsync(n => n.IsPadrao);
        var items = venda.Items.Select(i =>
        {
            products.TryGetValue(i.ProductId, out var product);
            return MapItem(i.ProductName, product, product?.NaturezaOperacao ?? padrao,
                i.Quantity, i.UnitPriceInCents, i.SubtotalInCents);
        }).ToList();
        var gross = items.Sum(i => i.SubtotalInCents);
        var cpf = venda.UserId.HasValue ? (await _db.Users.FindAsync(venda.UserId.Value))?.Cpf : null;
        var externalId = $"venda-avulsa:{vendaAvulsaId}";
        var request = new TenantErpFiscalEmissionRequest(
            Source, externalId, $"{Source}:{externalId}", items,
            venda.PaymentMethod, venda.SecondPaymentMethod, venda.SecondPaymentAmountInCents,
            Math.Clamp(gross - venda.TotalInCents, 0, gross), null, 0, cpf);
        try
        {
            var response = await _client.EmitFiscalNoteAsync(request, CancellationToken.None);
            return await SaveShadowAsync(response, NotaFiscalOrigem.VendaAvulsa, null, vendaAvulsaId);
        }
        catch (Exception ex)
        {
            return await SavePendingShadowAsync(
                NotaFiscalOrigem.VendaAvulsa, null, vendaAvulsaId,
                JsonSerializer.Serialize(request), ex.Message);
        }
    }

    public async Task<NotaFiscalEmitida> ReprocessarAsync(Guid notaId)
    {
        var local = await _db.NotasFiscaisEmitidas.FindAsync(notaId)
            ?? throw new InvalidOperationException("Nota fiscal nao encontrada.");
        try
        {
            TenantErpFiscalNoteResponse response;
            if (local.CentralFiscalNoteId.HasValue)
            {
                response = await _client.RetryFiscalNoteAsync(
                    local.CentralFiscalNoteId.Value, CancellationToken.None);
            }
            else if (!string.IsNullOrWhiteSpace(local.CentralFiscalPayloadJson))
            {
                var request = JsonSerializer.Deserialize<TenantErpFiscalEmissionRequest>(
                    local.CentralFiscalPayloadJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))
                    ?? throw new InvalidOperationException("Outbox fiscal local invalida.");
                response = await _client.EmitFiscalNoteAsync(request, CancellationToken.None);
                local.CentralFiscalNoteId = response.Id;
            }
            else
            {
                return local;
            }

            return await UpdateShadowAsync(local, response);
        }
        catch (Exception ex)
        {
            local.MotivoRejeicao = $"Motor fiscal central indisponivel: {ex.Message}";
            local.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return local;
        }
    }

    public async Task<NotaFiscalEmitida> CancelarAsync(Guid notaId, string justificativa)
    {
        var local = await GetCentralShadowAsync(notaId);
        var response = await _client.CancelFiscalNoteAsync(
            local.CentralFiscalNoteId!.Value, justificativa, CancellationToken.None);
        return await UpdateShadowAsync(local, response);
    }

    public async Task<CupomDto?> ObterCupomAsync(Guid notaId)
    {
        var local = await _db.NotasFiscaisEmitidas.AsNoTracking().FirstOrDefaultAsync(n => n.Id == notaId);
        if (local?.CentralFiscalNoteId is null) return null;
        var json = await _client.GetFiscalReceiptAsync(local.CentralFiscalNoteId.Value, CancellationToken.None);

        var emitente = json.GetProperty("emitente");
        var endereco = emitente.GetProperty("endereco");
        var itens = json.GetProperty("itens").EnumerateArray().Select(i => new CupomItemDto(
            i.GetProperty("descricao").GetString() ?? string.Empty,
            (int)i.GetProperty("quantidade").GetDecimal(),
            ToCents(i.GetProperty("valorUnitario").GetDecimal()),
            ToCents(i.GetProperty("valorTotal").GetDecimal()))).ToList();
        var pagamentos = json.GetProperty("pagamentos").EnumerateArray().ToList();

        return new CupomDto(
            emitente.GetProperty("razaoSocial").GetString() ?? string.Empty,
            emitente.GetProperty("cnpj").GetString() ?? string.Empty,
            endereco.GetProperty("linha").GetString() ?? string.Empty,
            json.GetProperty("chaveAcesso").GetString(),
            json.TryGetProperty("protocolo", out var protocolo) && protocolo.ValueKind != JsonValueKind.Null
                ? protocolo.GetProperty("numero").GetString() : null,
            json.TryGetProperty("emitidoEm", out var emitido) && emitido.ValueKind != JsonValueKind.Null
                ? emitido.GetDateTime() : null,
            json.GetProperty("serie").GetInt32(),
            json.GetProperty("numero").GetInt32(),
            local.Status.ToString(),
            itens,
            ToCents(json.GetProperty("totais").GetProperty("valorTotal").GetDecimal()),
            pagamentos.Count == 0 ? string.Empty : pagamentos[0].GetProperty("codigoTPag").GetString() ?? string.Empty,
            json.TryGetProperty("qrCodeUrl", out var qr) && qr.ValueKind != JsonValueKind.Null ? qr.GetString() : null);
    }

    private static TenantErpFiscalItemRequest MapItem(
        string name, Product? product, NaturezaOperacao? natureza,
        int quantity, int unitPrice, int subtotal)
    {
        var ncm = Digits(product?.Ncm);
        if (ncm.Length != 8)
            throw new InvalidOperationException($"Produto '{name}' sem NCM valido de 8 digitos.");
        var barcode = Digits(product?.Barcode);
        if (barcode.Length is not (8 or 12 or 13 or 14)) barcode = string.Empty;
        return new TenantErpFiscalItemRequest(
            name, ncm, natureza?.Cfop ?? "5102", natureza?.Csosn ?? "102", null,
            quantity, unitPrice, subtotal, 0, EmptyToNull(Digits(product?.Cest)),
            EmptyToNull(barcode));
    }

    private async Task<NotaFiscalEmitida> SaveShadowAsync(
        TenantErpFiscalNoteResponse response, NotaFiscalOrigem origem, Guid? comandaId, string? vendaId)
    {
        var local = new NotaFiscalEmitida
        {
            Origem = origem,
            ComandaId = comandaId,
            VendaAvulsaId = vendaId,
            CentralFiscalNoteId = response.Id,
        };
        Apply(local, response);
        _db.NotasFiscaisEmitidas.Add(local);
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            _db.Entry(local).State = EntityState.Detached;
            return await _db.NotasFiscaisEmitidas.FirstAsync(n =>
                origem == NotaFiscalOrigem.Comanda ? n.ComandaId == comandaId : n.VendaAvulsaId == vendaId);
        }
        return local;
    }

    private async Task<NotaFiscalEmitida> GetCentralShadowAsync(Guid id)
    {
        var note = await _db.NotasFiscaisEmitidas.FindAsync(id)
            ?? throw new InvalidOperationException("Nota fiscal nao encontrada.");
        if (!note.CentralFiscalNoteId.HasValue)
            throw new InvalidOperationException("Esta nota foi emitida pelo motor fiscal local historico.");
        return note;
    }

    private async Task<NotaFiscalEmitida> UpdateShadowAsync(
        NotaFiscalEmitida local, TenantErpFiscalNoteResponse response)
    {
        Apply(local, response);
        await _db.SaveChangesAsync();
        return local;
    }

    private static void Apply(NotaFiscalEmitida local, TenantErpFiscalNoteResponse response)
    {
        local.Status = response.Status == "ResultadoIncerto"
            ? NotaFiscalStatus.PendenteEmissao
            : Enum.Parse<NotaFiscalStatus>(response.Status);
        local.ValorTotalEmCentavos = response.TotalInCents;
        local.Serie = response.Series;
        local.Numero = response.Number;
        local.ChaveAcesso = response.AccessKey;
        local.Protocolo = response.Protocol;
        local.MotivoRejeicao = response.RejectionReason;
        local.EmitidoEm = response.IssuedAt;
        local.CanceladoEm = response.CancelledAt;
        local.CentralFiscalPayloadJson = null;
        local.UpdatedAt = DateTime.UtcNow;
    }

    private async Task<NotaFiscalEmitida> SavePendingShadowAsync(
        NotaFiscalOrigem origem, Guid? comandaId, string? vendaId,
        string? payload, string reason)
    {
        var existing = await _db.NotasFiscaisEmitidas.FirstOrDefaultAsync(n =>
            origem == NotaFiscalOrigem.Comanda ? n.ComandaId == comandaId : n.VendaAvulsaId == vendaId);
        if (existing is not null) return existing;

        var local = new NotaFiscalEmitida
        {
            Origem = origem,
            ComandaId = comandaId,
            VendaAvulsaId = vendaId,
            Status = NotaFiscalStatus.PendenteEmissao,
            CentralFiscalPayloadJson = payload,
            MotivoRejeicao = $"Motor fiscal central pendente: {reason}",
        };
        _db.NotasFiscaisEmitidas.Add(local);
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            _db.Entry(local).State = EntityState.Detached;
            return await _db.NotasFiscaisEmitidas.FirstAsync(n =>
                origem == NotaFiscalOrigem.Comanda ? n.ComandaId == comandaId : n.VendaAvulsaId == vendaId);
        }
        return local;
    }

    private static int ToCents(decimal value) => decimal.ToInt32(decimal.Round(value * 100m, 0));
    private static string Digits(string? value) => new((value ?? string.Empty).Where(char.IsDigit).ToArray());
    private static string? EmptyToNull(string value) => value.Length == 0 ? null : value;
}
