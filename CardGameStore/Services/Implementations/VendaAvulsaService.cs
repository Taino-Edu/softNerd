using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.MongoDB;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;

namespace CardGameStore.Services.Implementations;

public class VendaAvulsaService : IVendaAvulsaService
{
    // Fuso horário de Brasília — funciona em Linux (IANA) e Windows (ID legado).
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    private static (DateTime InicioUtc, DateTime FimUtc) DiaBrasil(DateTime? dia = null)
    {
        var agora    = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        var dataBr   = dia.HasValue ? dia.Value.Date : agora.Date;
        var inicioUtc = TimeZoneInfo.ConvertTimeToUtc(
            DateTime.SpecifyKind(dataBr, DateTimeKind.Unspecified), BrazilZone);
        return (inicioUtc, inicioUtc.AddDays(1));
    }

    private readonly AppDbContext                    _db;
    private readonly IMongoCollection<VendaAvulsa>  _collection;
    private readonly ILogger<VendaAvulsaService>    _logger;
    private readonly IServiceScopeFactory           _scopeFactory;
    private readonly IHubContext<ComandaHub>        _hub;

    private const string CollectionName = "vendas_avulsas";

    public VendaAvulsaService(
        AppDbContext db, IMongoDatabase mongo, ILogger<VendaAvulsaService> logger,
        IServiceScopeFactory scopeFactory, IHubContext<ComandaHub> hub)
    {
        _db           = db;
        _collection   = mongo.GetCollection<VendaAvulsa>(CollectionName);
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _hub          = hub;
    }

    public async Task<VendaAvulsaDto> RegisterAsync(VendaAvulsaRequest request, Guid adminId, string adminName)
    {
        // Valida tudo antes de qualquer escrita: falha rápida evita decremento parcial de estoque
        var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var products   = await _db.Products
            .Where(p => productIds.Contains(p.Id) && p.IsActive)
            .ToListAsync();

        // Pré-carrega variantes necessárias
        var variantIds = request.Items.Where(i => i.VariantId.HasValue).Select(i => i.VariantId!.Value).ToList();
        var variants   = variantIds.Count > 0
            ? await _db.ProductVariants.Where(v => variantIds.Contains(v.Id)).ToListAsync()
            : new List<ProductVariant>();

        foreach (var item in request.Items)
        {
            var product = products.FirstOrDefault(p => p.Id == item.ProductId)
                ?? throw new InvalidOperationException($"Produto '{item.ProductId}' não encontrado ou inativo.");

            // SkipStockDecrement (homologação de pré-venda): o estoque já foi baixado
            // no ato da reserva — aqui só validamos que produto/variante existem.
            if (request.SkipStockDecrement)
            {
                if (product.HasVariants && !item.VariantId.HasValue)
                    throw new InvalidOperationException($"Produto '{product.Name}' tem grade — selecione tamanho/cor.");
                continue;
            }

            if (product.HasVariants)
            {
                if (!item.VariantId.HasValue)
                    throw new InvalidOperationException($"Produto '{product.Name}' tem grade — selecione tamanho/cor.");
                var variant = variants.FirstOrDefault(v => v.Id == item.VariantId && v.ProductId == product.Id)
                    ?? throw new InvalidOperationException($"Variante inválida para '{product.Name}'.");
                if (variant.StockQuantity < item.Quantity)
                    throw new InvalidOperationException(
                        $"Estoque insuficiente para '{product.Name} — {variant.Label}'. Disponível: {variant.StockQuantity}, solicitado: {item.Quantity}.");
            }
            else
            {
                if (product.StockQuantity < item.Quantity)
                    throw new InvalidOperationException(
                        $"Estoque insuficiente para '{product.Name}'. Disponível: {product.StockQuantity}, solicitado: {item.Quantity}.");
            }
        }

        // ── 2. Decrementar estoque no PostgreSQL (única transação relacional) ────
        var vendaItems = new List<VendaAvulsaItem>();
        var total      = 0;

        foreach (var reqItem in request.Items)
        {
            var product = products.First(p => p.Id == reqItem.ProductId);
            var effectivePrice = product.IsOnPromo ? product.DiscountPriceInCents!.Value : product.PriceInCents;
            string? variantLabel = null;

            if (product.HasVariants && reqItem.VariantId.HasValue)
            {
                var variant = variants.First(v => v.Id == reqItem.VariantId);
                // Preço específico da variante sobrepõe o produto pai
                if (variant.PriceInCents.HasValue) effectivePrice = variant.PriceInCents.Value;
                variantLabel = variant.Label;

                if (!request.SkipStockDecrement)
                {
                    var updated = await _db.ProductVariants
                        .Where(v => v.Id == variant.Id && v.StockQuantity >= reqItem.Quantity)
                        .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - reqItem.Quantity));
                    if (updated == 0)
                        throw new InvalidOperationException($"Estoque insuficiente para '{product.Name} — {variant.Label}' (venda simultânea detectada).");
                }
            }
            else
            {
                if (!request.SkipStockDecrement)
                {
                    // Decremento atômico via ExecuteUpdateAsync — evita race condition em vendas simultâneas
                    var updated = await _db.Products
                        .Where(p => p.Id == product.Id && p.StockQuantity >= reqItem.Quantity)
                        .ExecuteUpdateAsync(s => s.SetProperty(
                            p => p.StockQuantity, p => p.StockQuantity - reqItem.Quantity));
                    if (updated == 0)
                        throw new InvalidOperationException($"Estoque insuficiente para '{product.Name}' (venda simultânea detectada).");
                }
            }

            var subtotal = effectivePrice * reqItem.Quantity;
            total += subtotal;

            vendaItems.Add(new VendaAvulsaItem
            {
                ProductId        = product.Id,
                ProductName      = product.Name,
                ProductCategory  = product.Category,
                Quantity         = reqItem.Quantity,
                UnitPriceInCents = effectivePrice,
                SubtotalInCents  = subtotal,
                UnitCostInCents  = product.CostPriceInCents,
                VariantId        = reqItem.VariantId,
                VariantLabel     = variantLabel,
            });
        }

        // Desconto em R$ sobrepõe percentual quando informado — mesmo padrão do EditarPagamentoAsync.
        var discountInCents = request.DiscountInCents.HasValue
            ? Math.Min(request.DiscountInCents.Value, total)
            : (int)Math.Round(total * request.DiscountPercent / 100.0);
        var discountPercentStored = request.DiscountInCents.HasValue ? 0 : request.DiscountPercent;
        var finalTotal = total - discountInCents;

        // ── Validação do segundo método de pagamento ──────────────────────────
        var secondPm  = string.IsNullOrWhiteSpace(request.SecondPaymentMethod) ? null : request.SecondPaymentMethod;
        var secondAmt = secondPm != null ? request.SecondPaymentAmountInCents : 0;

        if (secondPm != null)
        {
            if (secondAmt <= 0 || secondAmt >= finalTotal)
                throw new InvalidOperationException("Valor do segundo pagamento deve ser positivo e menor que o total.");
            if (secondPm == request.PaymentMethod)
                throw new InvalidOperationException("O segundo método de pagamento não pode ser igual ao principal.");
            if (secondPm is PaymentMethod.Cashback or PaymentMethod.Pontos && !request.UserId.HasValue)
                throw new InvalidOperationException("Cashback e Pontos como segundo pagamento exigem um cliente cadastrado selecionado.");
        }

        // Valor cobrado pelo método principal (total menos a parcela do segundo método)
        var primaryAmt = finalTotal - secondAmt;

        // ── 3. Persistir evento de caixa no MongoDB ──────────────────────────────
        // Resolve nome do cliente: prioriza nome explícito, depois busca no banco pelo userId
        string? clientNameResolved = string.IsNullOrWhiteSpace(request.ClientName) ? null : request.ClientName.Trim();
        if (clientNameResolved == null && request.UserId.HasValue)
        {
            var usr = await _db.Users.FindAsync(request.UserId.Value);
            clientNameResolved = usr?.Name;
        }

        var venda = new VendaAvulsa
        {
            Items                      = vendaItems,
            TotalInCents               = finalTotal,
            DiscountPercent            = discountPercentStored,
            DiscountInCents            = discountInCents,
            PaymentMethod              = request.PaymentMethod,
            SecondPaymentMethod        = secondPm,
            SecondPaymentAmountInCents = secondAmt,
            ClientName                 = clientNameResolved,
            UserId                     = request.UserId,
            UserName                   = clientNameResolved,
            SoldAt                     = DateTime.UtcNow,
            SoldByAdminId              = adminId,
            SoldByAdminName            = adminName,
            Origem                     = request.Origem,
            ReservationId              = request.ReservationId,
            ReservationGroupId         = request.ReservationGroupId,
            ProductIsPreVenda          = request.ProductIsPreVenda,
        };

        await _collection.InsertOneAsync(venda);

        // Emite a NFC-e referente a esta venda avulsa — só quando o admin escolheu
        // explicitamente emitir no fechamento (Maikon não quer nota emitida sem antes
        // perguntar). Aguarda o resultado (em vez de fire-and-forget) pra devolver o status
        // pro caixa na hora e permitir abrir o cupom automaticamente quando autorizar — a
        // falhas fiscais comuns não derrubam a venda; a trava geral é tratada logo abaixo. Se não marcou,
        // nenhuma NotaFiscalEmitida é criada; a emissão pode ser feita depois manualmente
        // pelo histórico.
        NotaFiscalEmitida? nota = null;
        string? bloqueioFiscal = null;
        if (request.EmitirNotaFiscal)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var emissao = scope.ServiceProvider.GetRequiredService<INfceEmissionService>();
                nota = await emissao.EmitirParaVendaAvulsaAsync(venda.Id);
            }
            catch (FiscalModuloBloqueadoException ex)
            {
                // A venda continua válida; apenas a operação fiscal foi bloqueada.
                bloqueioFiscal = ex.Message;
            }
        }

        var paymentSummary = secondPm != null
            ? $"{request.PaymentMethod} + {secondPm} (R$ {secondAmt / 100m:N2})"
            : request.PaymentMethod;
        _logger.LogInformation(
            "Venda avulsa {Id} registrada por {Admin}: {Count} item(ns), R$ {Total:F2} (desconto R$ {Desc:F2}), {Payment}",
            venda.Id, adminName, vendaItems.Count, finalTotal / 100m, discountInCents / 100m, paymentSummary);

        // Avisa o admin (estoque aberto) que a venda baixou estoque — recarrega sem F5.
        // SkipStockDecrement = homologação de pré-venda: o estoque já tinha saído no ato.
        if (!request.SkipStockDecrement)
            await _hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("StockChanged", new { });

        // ── Pós-venda: operações que dependem de cliente cadastrado ──────────────
        // Crediário gerado aqui fica gravado na venda (CrediarioId): é o que permite
        // baixar a dívida no estorno e achar a venda a partir do crediário.
        Guid? crediarioIdVinculado = null;
        var pm = request.PaymentMethod;
        if (pm is PaymentMethod.Crediario or PaymentMethod.Pontos or PaymentMethod.Cashback)
        {
            if (!request.UserId.HasValue)
                throw new InvalidOperationException(
                    "Crediário, Pontos e Cashback exigem um cliente cadastrado selecionado.");

            var userId = request.UserId.Value;
            var user   = await _db.Users.FindAsync(userId)
                ?? throw new InvalidOperationException("Cliente não encontrado.");

            if (pm == PaymentMethod.Crediario)
            {
                // Conta escolhida pelo caixa > primeira conta aberta. AbrirNovoCrediario
                // força conta nova: o cliente pode ter duas dívidas com prazos diferentes
                // (era o pedido do Maikon — o PDV grudava tudo na mesma conta sem perguntar).
                Crediario? crediarioExistente = null;
                if (request.CrediarioExistenteId.HasValue)
                {
                    crediarioExistente = await _db.Crediarios
                        .FirstOrDefaultAsync(c => c.Id == request.CrediarioExistenteId.Value)
                        ?? throw new InvalidOperationException("Conta de crediário não encontrada.");

                    if (crediarioExistente.UserId != userId)
                        throw new InvalidOperationException("A conta de crediário escolhida não é deste cliente.");
                    if (crediarioExistente.Status != CrediariosStatus.Aberto)
                        throw new InvalidOperationException("A conta de crediário escolhida já foi quitada.");
                }
                else if (!request.AbrirNovoCrediario)
                {
                    crediarioExistente = await _db.Crediarios
                        .FirstOrDefaultAsync(c => c.UserId == userId && c.Status == CrediariosStatus.Aberto);
                }

                // Vencimento escolhido pelo caixa (o produto chega dia 16, então a conta não
                // pode vencer dia 11) — sem escolha, mantém os 30 dias de sempre.
                var vencimento = request.CrediarioVencimento?.Date.ToUniversalTime()
                                 ?? DateTime.UtcNow.AddDays(30);

                // Snapshot dos itens desta venda para registrar no crediário
                var novosItens = vendaItems.Select(i => new ItemCrediarioDto
                {
                    ItemName         = i.ProductName,
                    Quantity         = i.Quantity,
                    UnitPriceInReais = i.UnitPriceInCents / 100m,
                    SubtotalInReais  = i.SubtotalInCents  / 100m,
                }).ToList();

                if (crediarioExistente != null)
                {
                    var itensAtuais = string.IsNullOrWhiteSpace(crediarioExistente.ItensJson)
                        ? new List<ItemCrediarioDto>()
                        : JsonSerializer.Deserialize<List<ItemCrediarioDto>>(crediarioExistente.ItensJson)
                          ?? new List<ItemCrediarioDto>();

                    itensAtuais.AddRange(novosItens);
                    crediarioExistente.ItensJson        = JsonSerializer.Serialize(itensAtuais);
                    crediarioExistente.ValorEmCentavos += primaryAmt;
                    // Sem mexer no vencimento: acumular uma compra nova NÃO pode dar mais 30
                    // dias pra dívida velha (o fechamento de comanda já fazia certo).
                    crediarioIdVinculado                = crediarioExistente.Id;
                    _logger.LogInformation(
                        "Venda avulsa acumulada no crediário {CredId} do usuário {UserId} — novo total R$ {Valor:N2}",
                        crediarioExistente.Id, userId, crediarioExistente.ValorEmCentavos / 100m);
                }
                else
                {
                    var crediario = new Crediario
                    {
                        UserId           = userId,
                        ComandaId        = null,
                        ValorEmCentavos  = primaryAmt,
                        DataAbertura     = DateTime.UtcNow,
                        DataVencimento   = vencimento,
                        Status           = CrediariosStatus.Aberto,
                        AbertoPorAdminId = adminId,
                        Observacao       = "Venda avulsa no balcão",
                        ItensJson        = JsonSerializer.Serialize(novosItens),
                    };
                    _db.Crediarios.Add(crediario);
                    crediarioIdVinculado = crediario.Id;
                    _logger.LogInformation(
                        "Crediário {CredId} criado para usuário {UserId} via venda avulsa — R$ {Valor:N2}",
                        crediario.Id, userId, primaryAmt / 100m);
                }
            }
            else if (pm == PaymentMethod.Pontos)
            {
                if (user.PointsExpiresAt.HasValue && user.PointsExpiresAt.Value < DateTime.UtcNow)
                    throw new InvalidOperationException("Os pontos deste cliente estão expirados.");

                // UPDATE atômico: debita pontos somente se o saldo for suficiente (evita race condition)
                var rows = await _db.Users
                    .Where(u => u.Id == userId && u.PointsBalance >= primaryAmt)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(u => u.PointsBalance, u => u.PointsBalance - primaryAmt)
                        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                if (rows == 0)
                    throw new InvalidOperationException(
                        $"Saldo de pontos insuficiente. Cliente tem {user.PointsBalance} pts, método principal custa {primaryAmt} pts.");
                _logger.LogInformation(
                    "Usuário {UserId} usou {Pts} pontos (principal) em venda avulsa.", userId, primaryAmt);
            }
            else if (pm == PaymentMethod.Cashback)
            {
                var rows = await _db.Users
                    .Where(u => u.Id == userId && u.BalanceInCents >= primaryAmt)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(u => u.BalanceInCents, u => u.BalanceInCents - primaryAmt)
                        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                if (rows == 0)
                    throw new InvalidOperationException(
                        $"Saldo insuficiente. Cliente tem R$ {user.BalanceInCents / 100m:N2}, método principal custa R$ {primaryAmt / 100m:N2}.");
                _logger.LogInformation(
                    "Usuário {UserId} usou R$ {Valor:N2} de cashback (principal) em venda avulsa.", userId, primaryAmt / 100m);
            }

            // Aplica o segundo método de pagamento (Cashback ou Pontos como complemento)
            if (secondPm == PaymentMethod.Cashback)
            {
                var rows = await _db.Users
                    .Where(u => u.Id == userId && u.BalanceInCents >= secondAmt)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(u => u.BalanceInCents, u => u.BalanceInCents - secondAmt)
                        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                if (rows == 0)
                    throw new InvalidOperationException(
                        $"Saldo cashback insuficiente para o segundo pagamento. Disponível: R$ {user.BalanceInCents / 100m:N2}.");
                _logger.LogInformation("Usuário {UserId} usou R$ {Amt:N2} de cashback como segundo pagamento.", userId, secondAmt / 100m);
            }
            else if (secondPm == PaymentMethod.Pontos)
            {
                var rows = await _db.Users
                    .Where(u => u.Id == userId && u.PointsBalance >= secondAmt)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(u => u.PointsBalance, u => u.PointsBalance - secondAmt)
                        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                if (rows == 0)
                    throw new InvalidOperationException(
                        $"Saldo de pontos insuficiente para o segundo pagamento. Disponível: {user.PointsBalance} pts.");
                _logger.LogInformation("Usuário {UserId} usou {Pts} pontos como segundo pagamento.", userId, secondAmt);
            }

            await _db.SaveChangesAsync();
        }
        else if (request.UserId.HasValue)
        {
            // Pagamento normal (Pix / Dinheiro / Cartão) com cliente identificado
            var userId = request.UserId.Value;
            var user   = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId)
                ?? throw new InvalidOperationException("Cliente não encontrado.");

            // Aplica o segundo método de pagamento se houver (UPDATE atômico)
            if (secondPm == PaymentMethod.Cashback)
            {
                var rows = await _db.Users
                    .Where(u => u.Id == userId && u.BalanceInCents >= secondAmt)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(u => u.BalanceInCents, u => u.BalanceInCents - secondAmt)
                        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                if (rows == 0)
                    throw new InvalidOperationException(
                        $"Saldo cashback insuficiente para o segundo pagamento. Disponível: R$ {user.BalanceInCents / 100m:N2}.");
                _logger.LogInformation("Usuário {UserId} usou R$ {Amt:N2} de cashback como segundo pagamento.", userId, secondAmt / 100m);
            }
            else if (secondPm == PaymentMethod.Pontos)
            {
                var rows = await _db.Users
                    .Where(u => u.Id == userId && u.PointsBalance >= secondAmt)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(u => u.PointsBalance, u => u.PointsBalance - secondAmt)
                        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                if (rows == 0)
                    throw new InvalidOperationException(
                        $"Saldo de pontos insuficiente para o segundo pagamento. Disponível: {user.PointsBalance} pts.");
                _logger.LogInformation("Usuário {UserId} usou {Pts} pontos como segundo pagamento.", userId, secondAmt);
            }

            // Acumula pontos de fidelidade: 1 ponto por R$1 gasto
            var pontosGanhos = finalTotal / 100;
            if (pontosGanhos > 0)
            {
                var expirado = user.PointsExpiresAt.HasValue && user.PointsExpiresAt.Value < DateTime.UtcNow;
                if (expirado)
                    await _db.Users
                        .Where(u => u.Id == userId)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(u => u.PointsBalance, pontosGanhos)
                            .SetProperty(u => u.PointsExpiresAt, DateTime.UtcNow.AddDays(30))
                            .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                else
                    await _db.Users
                        .Where(u => u.Id == userId)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(u => u.PointsBalance, u => u.PointsBalance + pontosGanhos)
                            .SetProperty(u => u.PointsExpiresAt, DateTime.UtcNow.AddDays(30))
                            .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
                _logger.LogInformation(
                    "Usuário {UserId} ganhou {Pontos} pontos em venda avulsa {VendaId}.",
                    userId, pontosGanhos, venda.Id);
            }
        }

        if (crediarioIdVinculado.HasValue)
        {
            venda.CrediarioId = crediarioIdVinculado;
            await _collection.UpdateOneAsync(
                Builders<VendaAvulsa>.Filter.Eq(v => v.Id, venda.Id),
                Builders<VendaAvulsa>.Update.Set(v => v.CrediarioId, crediarioIdVinculado));
        }

        var dto = MapToDto(venda);
        dto.NotaFiscalId             = nota?.Id;
        dto.NotaFiscalStatus         = bloqueioFiscal is null ? nota?.Status.ToString() : "Bloqueada";
        dto.NotaFiscalMotivoRejeicao = bloqueioFiscal ?? nota?.MotivoRejeicao;
        return dto;
    }

    /// <summary>
    /// Venda estornada não entra em nenhuma conta do financeiro. Toda leitura de venda
    /// passa por este filtro — quem quiser ver as estornadas (extrato) pede explicitamente.
    /// </summary>
    private static FilterDefinition<VendaAvulsa> NaoCancelada =>
        Builders<VendaAvulsa>.Filter.Eq(v => v.CanceladaEm, null);

    /// <summary>
    /// Estorna uma venda: devolve estoque, desfaz pontos/cashback, baixa o crediário que
    /// ela gerou e tira o valor do faturamento. A venda não é apagada — fica marcada com
    /// motivo e autor, e continua aparecendo no extrato como estornada.
    /// </summary>
    public async Task<VendaAvulsaDto> EstornarAsync(string id, Guid adminId, string adminNome, string motivo)
    {
        if (string.IsNullOrWhiteSpace(motivo))
            throw new InvalidOperationException("Informe o motivo do estorno.");

        var venda = await _collection.Find(Builders<VendaAvulsa>.Filter.Eq(v => v.Id, id)).FirstOrDefaultAsync()
            ?? throw new KeyNotFoundException($"Venda avulsa {id} não encontrada.");

        if (venda.Cancelada)
            throw new InvalidOperationException("Esta venda já foi estornada.");

        // ── Trava fiscal: nota autorizada não se desfaz por dentro ────────────────
        var notaAtiva = await _db.NotasFiscaisEmitidas
            .Where(n => n.VendaAvulsaId == id
                     && (n.Status == NotaFiscalStatus.Autorizada
                      || n.Status == NotaFiscalStatus.AutorizadaContingencia))
            .FirstOrDefaultAsync();
        if (notaAtiva is not null)
            throw new InvalidOperationException(
                "Esta venda tem NFC-e autorizada. Cancele a nota em Admin > Fiscal primeiro — " +
                "o cancelamento tem prazo legal e precisa ir à SEFAZ.");

        // ── Crediário gerado pela venda ───────────────────────────────────────────
        Crediario? crediario = null;
        if (venda.CrediarioId.HasValue)
        {
            crediario = await _db.Crediarios.FirstOrDefaultAsync(c => c.Id == venda.CrediarioId.Value);
            if (crediario is not null && crediario.ValorPagoEmCentavos > 0)
                throw new InvalidOperationException(
                    $"O crediário desta venda já tem R$ {crediario.ValorPagoEmCentavos / 100m:N2} pagos. " +
                    "Acerte o crediário do cliente antes de estornar a venda.");
        }

        // ── Devolve estoque ───────────────────────────────────────────────────────
        // Venda vinda da homologação de pré-venda também devolve: quem baixou foi a
        // reserva, e o produto está voltando pra prateleira do mesmo jeito.
        foreach (var item in venda.Items)
        {
            if (item.VariantId.HasValue)
                await _db.ProductVariants
                    .Where(v => v.Id == item.VariantId.Value)
                    .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + item.Quantity));
            else
                await _db.Products
                    .Where(p => p.Id == item.ProductId)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + item.Quantity));
        }

        // ── Desfaz o que mexeu no saldo do cliente ────────────────────────────────
        if (venda.UserId.HasValue)
        {
            var userId    = venda.UserId.Value;
            var principal = venda.TotalInCents - venda.SecondPaymentAmountInCents;

            // Devolve o que foi pago em pontos/cashback (principal e segundo método)
            var pontosDevolver   = (venda.PaymentMethod       == PaymentMethod.Pontos   ? principal : 0)
                                 + (venda.SecondPaymentMethod == PaymentMethod.Pontos   ? venda.SecondPaymentAmountInCents : 0);
            var cashbackDevolver = (venda.PaymentMethod       == PaymentMethod.Cashback ? principal : 0)
                                 + (venda.SecondPaymentMethod == PaymentMethod.Cashback ? venda.SecondPaymentAmountInCents : 0);

            // Retira os pontos de fidelidade ganhos na venda (1 ponto por R$1), sem
            // deixar o saldo negativo caso o cliente já tenha gasto.
            var pontosGanhosNaVenda = venda.PaymentMethod is PaymentMethod.Crediario or PaymentMethod.Pontos or PaymentMethod.Cashback
                ? 0                       // esses caminhos não acumulam fidelidade
                : venda.TotalInCents / 100;

            if (pontosDevolver > 0 || cashbackDevolver > 0 || pontosGanhosNaVenda > 0)
            {
                var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user is not null)
                {
                    user.PointsBalance  = Math.Max(0, user.PointsBalance + pontosDevolver - pontosGanhosNaVenda);
                    user.BalanceInCents = Math.Max(0, user.BalanceInCents + cashbackDevolver);
                    user.UpdatedAt      = DateTime.UtcNow;
                }
            }
        }

        // ── Baixa a dívida do crediário ───────────────────────────────────────────
        if (crediario is not null)
        {
            var principal = venda.TotalInCents - venda.SecondPaymentAmountInCents;
            crediario.ValorEmCentavos = Math.Max(0, crediario.ValorEmCentavos - principal);

            // Conta que ficou zerada e sem pagamento nenhum não deve continuar cobrando.
            if (crediario.ValorEmCentavos == 0)
                _db.Crediarios.Remove(crediario);
        }

        await _db.SaveChangesAsync();

        var agora = DateTime.UtcNow;
        var atualizada = await _collection.FindOneAndUpdateAsync(
            Builders<VendaAvulsa>.Filter.Eq(v => v.Id, id),
            Builders<VendaAvulsa>.Update
                .Set(v => v.CanceladaEm,           agora)
                .Set(v => v.CanceladaPorAdminId,   adminId)
                .Set(v => v.CanceladaPorAdminNome, adminNome)
                .Set(v => v.MotivoCancelamento,    motivo.Trim()),
            new FindOneAndUpdateOptions<VendaAvulsa> { ReturnDocument = ReturnDocument.After })
            ?? throw new KeyNotFoundException($"Venda avulsa {id} não encontrada.");

        _logger.LogInformation(
            "Venda avulsa {Id} estornada por {Admin}: R$ {Total:N2} devolvidos ao estoque. Motivo: {Motivo}",
            id, adminNome, venda.TotalInCents / 100m, motivo);

        await _hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("StockChanged", new { });

        return MapToDto(atualizada);
    }

    public async Task<IEnumerable<VendaAvulsaDto>> GetRecentAsync(int limit = 50, DateTime? desde = null)
    {
        var filter = desde.HasValue
            ? Builders<VendaAvulsa>.Filter.And(NaoCancelada, Builders<VendaAvulsa>.Filter.Gte(v => v.SoldAt, desde.Value))
            : NaoCancelada;

        var vendas = await _collection
            .Find(filter)
            .SortByDescending(v => v.SoldAt)
            .Limit(limit)
            .ToListAsync();

        return vendas.Select(MapToDto);
    }

    public async Task<IEnumerable<VendaAvulsaDto>> GetByDateAsync(DateTime? date = null)
    {
        // Converte data BR → intervalo UTC para evitar o bug de timezone:
        // uma venda às 22h BR (= 01h UTC do dia seguinte) aparecia como "hoje".
        var (inicio, fim) = DiaBrasil(date);

        var filter = Builders<VendaAvulsa>.Filter.And(
            NaoCancelada,
            Builders<VendaAvulsa>.Filter.Gte(v => v.SoldAt, inicio),
            Builders<VendaAvulsa>.Filter.Lt(v => v.SoldAt, fim));

        var vendas = await _collection
            .Find(filter)
            .SortByDescending(v => v.SoldAt)
            .ToListAsync();

        return vendas.Select(MapToDto);
    }

    /// <summary>
    /// Vendas do período INCLUINDO as estornadas — só o extrato usa isto. Todo o resto
    /// do financeiro passa pelos métodos que filtram, pra não somar o que foi desfeito.
    /// </summary>
    public async Task<IEnumerable<VendaAvulsaDto>> GetPeriodoComCanceladasAsync(DateTime inicio, DateTime fim)
    {
        var vendas = await _collection
            .Find(Builders<VendaAvulsa>.Filter.And(
                Builders<VendaAvulsa>.Filter.Gte(v => v.SoldAt, inicio),
                Builders<VendaAvulsa>.Filter.Lt (v => v.SoldAt, fim)))
            .SortByDescending(v => v.SoldAt)
            .ToListAsync();

        return vendas.Select(MapToDto);
    }

    public async Task<IEnumerable<VendaAvulsaDto>> GetByUserAsync(Guid userId)
    {
        var filter = Builders<VendaAvulsa>.Filter.And(
            NaoCancelada,
            Builders<VendaAvulsa>.Filter.Eq(v => v.UserId, userId));
        var vendas = await _collection
            .Find(filter)
            .SortByDescending(v => v.SoldAt)
            .ToListAsync();
        return vendas.Select(MapToDto);
    }

    public async Task<IEnumerable<VendaAvulsaDto>> GetByUserComEstornadasAsync(Guid userId)
    {
        var vendas = await _collection
            .Find(Builders<VendaAvulsa>.Filter.Eq(v => v.UserId, userId))
            .SortByDescending(v => v.SoldAt)
            .ToListAsync();
        return vendas.Select(MapToDto);
    }

    public async Task<IReadOnlyList<VendaAvulsaClienteAgregadoDto>> AgregarPorClienteAsync(
        DateTime? inicio, DateTime? fim, string? formaPagamento)
    {
        var f = Builders<VendaAvulsa>.Filter;
        var condicoes = new List<FilterDefinition<VendaAvulsa>>
        {
            NaoCancelada,
            f.Ne(v => v.UserId, null),
        };

        if (inicio.HasValue) condicoes.Add(f.Gte(v => v.SoldAt, inicio.Value));
        if (fim.HasValue)    condicoes.Add(f.Lt (v => v.SoldAt, fim.Value));

        var temFiltroForma = !string.IsNullOrWhiteSpace(formaPagamento);
        if (temFiltroForma)
            condicoes.Add(f.Or(
                f.Eq(v => v.PaymentMethod,       formaPagamento),
                f.Eq(v => v.SecondPaymentMethod, formaPagamento)));

        // Sem Limit: o recorte todo já está no filtro, então o que volta é só o que
        // realmente entra na conta. A projeção mantém o tráfego baixo — os itens da
        // venda, que são a parte pesada do documento, ficam de fora.
        var vendas = await _collection
            .Find(f.And(condicoes))
            .Project(v => new
            {
                v.UserId,
                v.SoldAt,
                v.TotalInCents,
                v.PaymentMethod,
                v.SecondPaymentMethod,
                v.SecondPaymentAmountInCents,
            })
            .ToListAsync();

        return vendas
            .GroupBy(v => v.UserId!.Value)
            .Select(g => new VendaAvulsaClienteAgregadoDto
            {
                UserId       = g.Key,
                Compras      = g.Count(),
                GastoCents   = g.Sum(v => ValorNaForma(
                    v.PaymentMethod, v.SecondPaymentMethod,
                    v.TotalInCents, v.SecondPaymentAmountInCents,
                    temFiltroForma ? formaPagamento : null)),
                UltimaCompra = g.Max(v => v.SoldAt),
            })
            .ToList();
    }

    /// <summary>
    /// Quanto de uma venda foi pago na forma filtrada. Sem filtro, é o total.
    /// Numa venda dividida (R$ 80 cartão + R$ 20 Pix), filtrar por Pix tem que somar
    /// R$ 20 — atribuir o total inteiro faria a mesma venda aparecer cheia nos dois
    /// filtros e inflar o ranking.
    /// </summary>
    internal static long ValorNaForma(
        string? forma, string? segundaForma, int totalCents, int segundoValorCents, string? filtro)
    {
        if (string.IsNullOrWhiteSpace(filtro)) return totalCents;

        long valor = 0;
        if (forma == filtro)        valor += totalCents - segundoValorCents;
        if (segundaForma == filtro) valor += segundoValorCents;
        return valor;
    }

    public async Task<IReadOnlyDictionary<Guid, DateTime>> UltimaVendaPorClienteAsync()
    {
        var vendas = await _collection
            .Find(Builders<VendaAvulsa>.Filter.And(NaoCancelada, Builders<VendaAvulsa>.Filter.Ne(v => v.UserId, null)))
            .Project(v => new { v.UserId, v.SoldAt })
            .ToListAsync();

        return vendas
            .GroupBy(v => v.UserId!.Value)
            .ToDictionary(g => g.Key, g => g.Max(v => v.SoldAt));
    }

    public async Task<int> BackfillCostsAsync()
    {
        // Carrega todos os produtos com custo > 0 de uma vez para evitar N queries
        var produtos = await _db.Products
            .Where(p => p.CostPriceInCents > 0)
            .Select(p => new { p.Id, p.CostPriceInCents })
            .ToListAsync();

        var custoMap = produtos.ToDictionary(p => p.Id, p => p.CostPriceInCents);

        // Busca todas as vendas avulsas (sem limite — backfill é operação administrativa)
        var todasVendas = await _collection.Find(Builders<VendaAvulsa>.Filter.Empty).ToListAsync();

        var totalAtualizados = 0;

        foreach (var venda in todasVendas)
        {
            var modificou = false;
            foreach (var item in venda.Items)
            {
                if (custoMap.TryGetValue(item.ProductId, out var custo) && item.UnitCostInCents != custo)
                {
                    item.UnitCostInCents = custo;
                    totalAtualizados++;
                    modificou = true;
                }
            }

            if (modificou)
            {
                await _collection.ReplaceOneAsync(
                    Builders<VendaAvulsa>.Filter.Eq(v => v.Id, venda.Id),
                    venda);
            }
        }

        _logger.LogInformation("BackfillCosts: {N} item(s) de venda avulsa atualizados com custo.", totalAtualizados);
        return totalAtualizados;
    }

    public async Task<VendaAvulsaDto> EditarPagamentoAsync(string id, EditarPagamentoVendaAvulsaRequest request)
    {
        if (!PaymentMethod.IsValid(request.PaymentMethod))
            throw new ArgumentException($"Forma de pagamento inválida: {request.PaymentMethod}");

        if (request.SecondPaymentMethod != null && !PaymentMethod.IsValid(request.SecondPaymentMethod))
            throw new ArgumentException($"Segundo pagamento inválido: {request.SecondPaymentMethod}");

        // Busca a venda para calcular novo total se desconto mudar
        var filter  = Builders<VendaAvulsa>.Filter.Eq(v => v.Id, id);
        var current = await _collection.Find(filter).FirstOrDefaultAsync()
            ?? throw new KeyNotFoundException($"Venda avulsa {id} não encontrada.");

        var updateDef = Builders<VendaAvulsa>.Update
            .Set(v => v.PaymentMethod,              request.PaymentMethod)
            .Set(v => v.SecondPaymentMethod,        request.SecondPaymentMethod)
            .Set(v => v.SecondPaymentAmountInCents, request.SecondPaymentAmountInCents);

        // Nome do cliente
        if (request.ClearClientName)
            updateDef = updateDef.Set(v => v.ClientName, (string?)null);
        else if (!string.IsNullOrWhiteSpace(request.ClientName))
            updateDef = updateDef.Set(v => v.ClientName, request.ClientName.Trim());

        // Desconto — recalcula TotalInCents se mudar
        if (request.DiscountInCents.HasValue)
        {
            var originalTotal = current.TotalInCents + current.DiscountInCents;
            var newDiscount   = Math.Min(request.DiscountInCents.Value, originalTotal);
            updateDef = updateDef
                .Set(v => v.DiscountInCents,  newDiscount)
                .Set(v => v.DiscountPercent,  0)
                .Set(v => v.TotalInCents,     originalTotal - newDiscount);
        }

        var opts   = new FindOneAndUpdateOptions<VendaAvulsa> { ReturnDocument = ReturnDocument.After };
        var result = await _collection.FindOneAndUpdateAsync(filter, updateDef, opts)
            ?? throw new KeyNotFoundException($"Venda avulsa {id} não encontrada.");

        _logger.LogInformation("Venda avulsa {Id} atualizada: pagamento={PM}, cliente={CN}, desconto={Desc}.",
            id, request.PaymentMethod, result.ClientName, result.DiscountInCents);
        return MapToDto(result);
    }

    private static VendaAvulsaDto MapToDto(VendaAvulsa v) => new()
    {
        Id                         = v.Id,
        ClientName                 = v.ClientName,
        UserId                     = v.UserId,
        PaymentMethod              = v.PaymentMethod,
        SecondPaymentMethod        = v.SecondPaymentMethod,
        SecondPaymentAmountInCents = v.SecondPaymentAmountInCents,
        TotalInReais               = v.TotalInReais,
        DiscountPercent            = v.DiscountPercent,
        DiscountInReais            = v.DiscountInReais,
        SoldAt                     = v.SoldAt,
        SoldByAdminName            = v.SoldByAdminName,
        Origem                     = v.Origem,
        ProductIsPreVenda          = v.ProductIsPreVenda,
        CrediarioId                = v.CrediarioId,
        Cancelada                  = v.Cancelada,
        CanceladaEm                = v.CanceladaEm,
        CanceladaPorAdminNome      = v.CanceladaPorAdminNome,
        MotivoCancelamento         = v.MotivoCancelamento,
        Items                      = v.Items.Select(i => new VendaAvulsaItemDto
        {
            ProductName      = i.ProductName,
            ProductCategory  = i.ProductCategory,
            Quantity         = i.Quantity,
            UnitPriceInReais = i.UnitPriceInCents / 100m,
            SubtotalInReais  = i.SubtotalInReais,
            UnitCostInCents  = i.UnitCostInCents,
        }).ToList(),
    };
}
