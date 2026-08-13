using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Implementations;

public class ComandaService : IComandaService
{
    // Fuso horário de Brasília (UTC-3 fixo; BR não usa horário de verão desde 2019).
    // Funciona em Linux (IANA) e Windows (ID legado).
    private static readonly TimeZoneInfo BrazilZone = GetBrazilZone();
    private static TimeZoneInfo GetBrazilZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
    }

    /// <summary>
    /// Retorna o intervalo UTC correspondente a um dia no fuso de Brasília.
    /// Ex.: dia 29/05 BR → [29/05 03:00 UTC, 30/05 03:00 UTC)
    /// </summary>
    private static (DateTime InicioUtc, DateTime FimUtc) DiaBrasil(DateTime? dia = null)
    {
        var agora    = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BrazilZone);
        var dataBr   = dia.HasValue ? dia.Value.Date : agora.Date;
        var inicioUtc = TimeZoneInfo.ConvertTimeToUtc(
            DateTime.SpecifyKind(dataBr, DateTimeKind.Unspecified), BrazilZone);
        return (inicioUtc, inicioUtc.AddDays(1));
    }

    // Constantes para evitar magic strings sensíveis a typo/case
    private const string PaymentCrediario = "Crediario";
    private const string PaymentPontos    = "Pontos";
    private const string PaymentCashback  = "Cashback";

    private readonly AppDbContext            _db;
    private readonly IEmailService           _email;
    private readonly ILogger<ComandaService> _logger;
    private readonly IServiceScopeFactory    _scopeFactory;
    private readonly IHubContext<ComandaHub> _hub;

    public ComandaService(AppDbContext db, IEmailService email, ILogger<ComandaService> logger, IServiceScopeFactory scopeFactory, IHubContext<ComandaHub> hub)
    {
        _db           = db;
        _email        = email;
        _logger       = logger;
        _scopeFactory = scopeFactory;
        _hub          = hub;
    }

    public async Task<ComandaDto> OpenComandaAsync(Guid userId, string? tableIdentifier = null)
    {
        // Verifica se já existe uma comanda aberta ou em andamento para este usuário.
        // Se existir, reutilizamos ela para evitar duplicidade (ex: cliente leu QR code duas vezes).
        var comandaExistente = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .Where(c => c.UserId == userId && (c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento))
            .OrderByDescending(c => c.OpenedAt)
            .FirstOrDefaultAsync();

        if (comandaExistente != null)
        {
            _logger.LogInformation("Reutilizando comanda {Id} existente para usuário {UserId}", comandaExistente.Id, userId);
            
            // Se o identificador da mesa mudou (cliente trocou de lugar), atualizamos
            if (!string.IsNullOrEmpty(tableIdentifier) && comandaExistente.TableIdentifier != tableIdentifier)
            {
                comandaExistente.TableIdentifier = tableIdentifier;
                await _db.SaveChangesAsync();
                
                // Notifica o admin que a mesa da comanda mudou
                await _hub.Clients.Group(ComandaHub.AdminGroup)
                    .SendAsync("ComandaUpdated", new ComandaUpdateEvent
                    {
                        ComandaId       = comandaExistente.Id,
                        UserId          = userId,
                        UserName        = comandaExistente.User?.Name ?? string.Empty,
                        TableIdentifier = tableIdentifier,
                        TotalInReais    = comandaExistente.TotalInReais,
                        Status          = comandaExistente.Status.ToString(),
                        UpdatedAt       = DateTime.UtcNow,
                    });
            }

            return MapToDto(comandaExistente);
        }

        // Se não houver comanda ativa, cria uma nova
        var comanda = new Comanda
        {
            UserId          = userId,
            TableIdentifier = tableIdentifier,
            Status          = ComandaStatus.Aberta,
        };

        _db.Comandas.Add(comanda);
        await _db.SaveChangesAsync();
        _logger.LogInformation("Comanda {Id} aberta para usuário {UserId}", comanda.Id, userId);

        // Notifica o cliente (User_{userId}) que a comanda foi aberta pelo admin
        await _hub.Clients.Group(ComandaHub.GetUserGroup(userId))
            .SendAsync("ComandaOpened", new { ComandaId = comanda.Id, TableIdentifier = comanda.TableIdentifier });

        // Notifica o admin (dashboard)
        var userName = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.Name)
            .FirstOrDefaultAsync() ?? string.Empty;
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaOpened", new { ComandaId = comanda.Id, UserId = userId, UserName = userName, TableIdentifier = comanda.TableIdentifier });

        return MapToDto(comanda);
    }

    public async Task<ComandaDto?> GetActiveComandaAsync(Guid userId)
    {
        // Se houver múltiplas abertas, retorna a mais recente
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .Where(c => c.UserId == userId &&
                (c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento))
            .OrderByDescending(c => c.OpenedAt)
            .FirstOrDefaultAsync();

        return comanda == null ? null : MapToDto(comanda);
    }

    public async Task<Guid?> GetActiveComandaIdByUserAsync(Guid userId)
    {
        // Se houver múltiplas abertas, retorna a ID da mais recente
        return await _db.Comandas
            .Where(c => c.UserId == userId &&
                (c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento))
            .OrderByDescending(c => c.OpenedAt)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync();
    }

    public async Task<ComandaDto?> GetByIdAsync(Guid comandaId)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId);

        return comanda == null ? null : MapToDto(comanda);
    }

    public async Task<ComandaDto> AddItemAsync(Guid userId, AddItemToComandaRequest request)
    {
        if (request.Quantity <= 0)
            throw new ArgumentException("Quantidade deve ser maior que zero.");

        // Se houver múltiplas abertas, adiciona à mais recente
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .Where(c => c.UserId == userId &&
                (c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento))
            .OrderByDescending(c => c.OpenedAt)
            .FirstOrDefaultAsync()
            ?? throw new InvalidOperationException("Comanda ativa não encontrada para este usuário.");

        // Agrupa com item existente de mesmo produto+variante (variantes diferentes = linhas separadas)
        if (request.ProductId.HasValue)
        {
            var existing = comanda.Items.FirstOrDefault(i =>
                i.ProductId == request.ProductId.Value &&
                i.VariantId == request.VariantId);   // null == null para produtos sem grade
            if (existing != null)
            {
                // Desconta estoque via ResolveItemAsync (já trata variantes)
                var (_, resolvedPrice, _) = await ResolveItemAsync(request);
                var addedSubtotal         = existing.UnitPriceInCents * request.Quantity;
                existing.Quantity        += request.Quantity;
                existing.SubtotalInCents += addedSubtotal;
                comanda.TotalInCents     += addedSubtotal;
                comanda.Status            = ComandaStatus.EmAndamento;
                await _db.SaveChangesAsync();
                await _hub.Clients.Group(ComandaHub.AdminGroup)
                    .SendAsync("ComandaUpdated", new ComandaUpdateEvent
                    {
                        ComandaId       = comanda.Id,
                        UserId          = userId,
                        UserName        = comanda.User?.Name ?? string.Empty,
                        TableIdentifier = comanda.TableIdentifier,
                        TotalInReais    = comanda.TotalInReais,
                        Status          = comanda.Status.ToString(),
                        LastItemAdded   = existing.ItemNameSnapshot,
                        UpdatedAt       = DateTime.UtcNow,
                    });
                return MapToDto(comanda);
            }
        }

        var (itemName, priceInCents, costInCents) = await ResolveItemAsync(request);

        var item = new ComandaItem
        {
            ComandaId                = comanda.Id,
            ProductId                = request.ProductId,
            CardCacheId              = request.CardCacheId,
            VariantId                = request.VariantId,
            ItemNameSnapshot         = itemName,
            UnitPriceInCents         = priceInCents,
            CostPriceSnapshotInCents = costInCents,
            Quantity                 = request.Quantity,
            SubtotalInCents          = priceInCents * request.Quantity,
            AddedByUserId            = userId,
        };

        // _db.Add ensures EntityState.Added; navigation fixup populates comanda.Items.
        // Using comanda.Items.Add alone causes EF to infer Modified (not Added) for
        // entities with a pre-set client-generated GUID key.
        _db.Add(item);
        comanda.Status        = ComandaStatus.EmAndamento;
        comanda.TotalInCents += item.SubtotalInCents;

        await _db.SaveChangesAsync();

        // Notifica o admin sobre o item adicionado pelo cliente
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaUpdated", new ComandaUpdateEvent
            {
                ComandaId       = comanda.Id,
                UserId          = userId,
                UserName        = comanda.User?.Name ?? string.Empty,
                TableIdentifier = comanda.TableIdentifier,
                TotalInReais    = comanda.TotalInReais,
                Status          = comanda.Status.ToString(),
                LastItemAdded   = item.ItemNameSnapshot,
                UpdatedAt       = DateTime.UtcNow,
            });

        return MapToDto(comanda);
    }

    public async Task<ComandaDto> AdminAddItemAsync(Guid comandaId, Guid adminId, AddItemToComandaRequest request)
    {
        if (request.Quantity <= 0)
            throw new ArgumentException("Quantidade deve ser maior que zero.");

        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException($"Comanda {comandaId} não encontrada.");

        // Agrupa com item existente de mesmo produto (evita linhas duplicadas)
        if (request.ProductId.HasValue)
        {
            var existing = comanda.Items.FirstOrDefault(i =>
                i.ProductId == request.ProductId.Value &&
                i.VariantId == request.VariantId);
            if (existing != null)
            {
                var (_, _, _) = await ResolveItemAsync(request); // desconta estoque
                var addedSubtotal        = existing.UnitPriceInCents * request.Quantity;
                existing.Quantity       += request.Quantity;
                existing.SubtotalInCents += addedSubtotal;
                comanda.TotalInCents    += addedSubtotal;
                comanda.Status           = ComandaStatus.EmAndamento;
                await _db.SaveChangesAsync();
                await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
                    .SendAsync("ItemAddedByAdmin", new { ItemName = existing.ItemNameSnapshot, NewTotalInReais = comanda.TotalInReais });
                await _hub.Clients.Group(ComandaHub.AdminGroup)
                    .SendAsync("ComandaUpdated", new ComandaUpdateEvent
                    {
                        ComandaId       = comanda.Id,
                        UserId          = comanda.UserId,
                        UserName        = comanda.User?.Name ?? string.Empty,
                        TableIdentifier = comanda.TableIdentifier,
                        TotalInReais    = comanda.TotalInReais,
                        Status          = comanda.Status.ToString(),
                        LastItemAdded   = existing.ItemNameSnapshot,
                        UpdatedAt       = DateTime.UtcNow,
                    });
                return MapToDto(comanda);
            }
        }

        var (itemName, priceInCents, costInCents) = await ResolveItemAsync(request);

        var item = new ComandaItem
        {
            ComandaId                = comanda.Id,
            ProductId                = request.ProductId,
            CardCacheId              = request.CardCacheId,
            VariantId                = request.VariantId,
            ItemNameSnapshot         = itemName,
            UnitPriceInCents         = priceInCents,
            CostPriceSnapshotInCents = costInCents,
            Quantity                 = request.Quantity,
            SubtotalInCents          = priceInCents * request.Quantity,
            AddedByUserId            = adminId,
        };

        _db.Add(item);
        comanda.Status        = ComandaStatus.EmAndamento;
        comanda.TotalInCents += item.SubtotalInCents;

        await _db.SaveChangesAsync();

        // Notifica o cliente na comanda que o admin adicionou um item
        await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
            .SendAsync("ItemAddedByAdmin", new
            {
                ItemName        = item.ItemNameSnapshot,
                NewTotalInReais = comanda.TotalInReais,
            });
        // Notifica o admin (outros painéis)
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaUpdated", new ComandaUpdateEvent
            {
                ComandaId       = comanda.Id,
                UserId          = comanda.UserId,
                UserName        = comanda.User?.Name ?? string.Empty,
                TableIdentifier = comanda.TableIdentifier,
                TotalInReais    = comanda.TotalInReais,
                Status          = comanda.Status.ToString(),
                LastItemAdded   = item.ItemNameSnapshot,
                UpdatedAt       = DateTime.UtcNow,
            });

        return MapToDto(comanda);
    }

    public async Task<ComandaDto> RemoveItemAsync(Guid comandaId, Guid itemId, Guid requestingUserId)
    {
        var item = await _db.ComandaItems.FindAsync(itemId)
            ?? throw new InvalidOperationException("Item não encontrado.");

        // Garante que o item pertence à comanda informada (evita remoção cruzada)
        if (item.ComandaId != comandaId)
            throw new InvalidOperationException("Item não pertence a esta comanda.");

        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstAsync(c => c.Id == comandaId);

        comanda.TotalInCents = Math.Max(0, comanda.TotalInCents - item.SubtotalInCents);

        if (item.ProductId.HasValue)
        {
            await _db.Products
                .Where(p => p.Id == item.ProductId.Value)
                .ExecuteUpdateAsync(s => s.SetProperty(
                    p => p.StockQuantity, p => p.StockQuantity + item.Quantity));
        }

        // Ajusta pontos aplicados se o total ficou menor que o desconto
        if (comanda.PointsApplied > comanda.TotalInCents)
        {
            var excess = comanda.PointsApplied - comanda.TotalInCents;
            comanda.PointsApplied = comanda.TotalInCents;
            comanda.User!.PointsBalance += excess;
        }

        _db.ComandaItems.Remove(item);

        if (comanda.Items.Count(i => i.Id != itemId) == 0)
            comanda.Status = ComandaStatus.Aberta;

        await _db.SaveChangesAsync();

        var dto = MapToDto(comanda);
        // Notifica cliente e admin da remoção
        await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
            .SendAsync("ComandaUpdated", new { ComandaId = comandaId, NewTotalInReais = dto.TotalInReais });
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaUpdated", new ComandaUpdateEvent
            {
                ComandaId       = dto.Id,
                UserId          = dto.UserId,
                UserName        = dto.UserName,
                TableIdentifier = dto.TableIdentifier,
                TotalInReais    = dto.TotalInReais,
                Status          = dto.Status,
                UpdatedAt       = DateTime.UtcNow,
            });

        return dto;
    }

    public async Task<ComandaDto> UpdateItemAsync(Guid comandaId, Guid itemId, int newQuantity, Guid adminId)
    {
        var item = await _db.ComandaItems.FindAsync(itemId)
            ?? throw new InvalidOperationException("Item não encontrado.");

        if (item.ComandaId != comandaId)
            throw new InvalidOperationException("Item não pertence a esta comanda.");

        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstAsync(c => c.Id == comandaId);

        if (comanda.Status == ComandaStatus.Fechada || comanda.Status == ComandaStatus.Cancelada
         || comanda.Status == ComandaStatus.Estornada)
            throw new InvalidOperationException("Não é possível editar itens de uma comanda encerrada.");

        // Quantity == 0 → remover item
        if (newQuantity <= 0)
            return await RemoveItemAsync(comandaId, itemId, adminId);

        var oldSubtotal = item.SubtotalInCents;
        var diff        = item.UnitPriceInCents * newQuantity - oldSubtotal;

        // Ajusta estoque físico
        if (item.ProductId.HasValue)
        {
            var delta = item.Quantity - newQuantity; // positivo = devolve, negativo = retira
            await _db.Products
                .Where(p => p.Id == item.ProductId.Value)
                .ExecuteUpdateAsync(s => s.SetProperty(
                    p => p.StockQuantity, p => p.StockQuantity + delta));
        }

        item.Quantity       = newQuantity;
        item.SubtotalInCents = item.UnitPriceInCents * newQuantity;
        comanda.TotalInCents = Math.Max(0, comanda.TotalInCents + diff);

        // Ajusta pontos se o total ficou menor que o desconto aplicado
        if (comanda.PointsApplied > comanda.TotalInCents)
        {
            var excess = comanda.PointsApplied - comanda.TotalInCents;
            comanda.PointsApplied  = comanda.TotalInCents;
            comanda.User!.PointsBalance += excess;
        }

        _logger.LogInformation(
            "Item {ItemId} da comanda {ComandaId} atualizado para qty={Qty} pelo admin {AdminId}",
            itemId, comandaId, newQuantity, adminId);

        await _db.SaveChangesAsync();

        var dto = MapToDto(comanda);
        // Notifica cliente e admin da atualização de quantidade
        await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
            .SendAsync("ComandaUpdated", new { ComandaId = comandaId, NewTotalInReais = dto.TotalInReais });
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaUpdated", new ComandaUpdateEvent
            {
                ComandaId       = dto.Id,
                UserId          = dto.UserId,
                UserName        = dto.UserName,
                TableIdentifier = dto.TableIdentifier,
                TotalInReais    = dto.TotalInReais,
                Status          = dto.Status,
                UpdatedAt       = DateTime.UtcNow,
            });

        return dto;
    }

    public async Task<ComandaDto> CloseComandaAsync(Guid comandaId, Guid adminId, string paymentMethod = "Dinheiro", string? observacao = null, string? secondPaymentMethod = null, int secondPaymentAmountInCents = 0, Guid? crediarioExistenteId = null, int discountInCents = 0, bool emitirNotaFiscal = false,
        DateTime? crediarioVencimento = null)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException($"Comanda {comandaId} não encontrada.");

        if (discountInCents > 0 && discountInCents > comanda.TotalInCents - comanda.PointsApplied)
            throw new InvalidOperationException(
                $"O desconto (R$ {discountInCents / 100m:N2}) não pode ser maior que o total da comanda (R$ {(comanda.TotalInCents - comanda.PointsApplied) / 100m:N2}).");

        // Total líquido: desconta pontos que o cliente já pré-pagou via ApplyPoints e o
        // desconto administrativo dado pelo Admin no fechamento.
        var netTotal = Math.Max(0, comanda.TotalInCents - comanda.PointsApplied - discountInCents);
        comanda.DiscountInCents = discountInCents;

        // ── Split payment: valida e processa segundo método ───────────────────
        var hasSecond = secondPaymentAmountInCents > 0 && !string.IsNullOrEmpty(secondPaymentMethod);
        if (hasSecond && secondPaymentAmountInCents >= netTotal)
            throw new InvalidOperationException("O valor do segundo pagamento não pode cobrir o total inteiro. Selecione apenas o método principal.");

        var primaryAmt = hasSecond ? netTotal - secondPaymentAmountInCents : netTotal;

        if (hasSecond)
        {
            if (comanda.User == null)
                throw new InvalidOperationException("Usuário não encontrado para processar segundo pagamento.");

            if (secondPaymentMethod == PaymentCashback)
            {
                if (comanda.User.BalanceInCents < secondPaymentAmountInCents)
                    throw new InvalidOperationException(
                        $"Saldo de cashback insuficiente. Cliente tem R$ {comanda.User.BalanceInCents / 100m:N2}, solicitado R$ {secondPaymentAmountInCents / 100m:N2}.");
                comanda.User.BalanceInCents -= secondPaymentAmountInCents;
                comanda.User.UpdatedAt       = DateTime.UtcNow;
                _logger.LogInformation("Split: R$ {Val:N2} de cashback aplicado na comanda {Id}.", secondPaymentAmountInCents / 100m, comandaId);
            }
            else if (secondPaymentMethod == PaymentPontos)
            {
                if (comanda.User.PointsExpiresAt.HasValue && comanda.User.PointsExpiresAt.Value < DateTime.UtcNow)
                    throw new InvalidOperationException("Os pontos do cliente estão expirados.");
                if (comanda.User.PointsBalance < secondPaymentAmountInCents)
                    throw new InvalidOperationException(
                        $"Saldo de pontos insuficiente. Cliente tem {comanda.User.PointsBalance} pts, solicitado {secondPaymentAmountInCents} pts.");
                comanda.User.PointsBalance -= secondPaymentAmountInCents;
                comanda.User.UpdatedAt      = DateTime.UtcNow;
                _logger.LogInformation("Split: {Pts} pontos aplicados na comanda {Id}.", secondPaymentAmountInCents, comandaId);
            }
            // Métodos físicos (Dinheiro/Pix/Cartão) como segundo: apenas registra, sem ação

            comanda.SecondPaymentMethod        = secondPaymentMethod;
            comanda.SecondPaymentAmountInCents = secondPaymentAmountInCents;
        }

        // ── Crediário ─────────────────────────────────────────────────────────────
        if (paymentMethod == PaymentCrediario)
        {
            if (crediarioExistenteId.HasValue)
            {
                // Admin escolheu acumular em uma conta já aberta — sem renovar prazo
                var existente = await _db.Crediarios
                    .Include(cr => cr.Comanda).ThenInclude(cmd => cmd!.Items)
                    .FirstOrDefaultAsync(cr => cr.Id == crediarioExistenteId.Value)
                    ?? throw new InvalidOperationException("Crediário selecionado não encontrado.");

                if (existente.UserId != comanda.UserId)
                    throw new InvalidOperationException("O crediário selecionado não pertence ao cliente desta comanda.");

                if (existente.Status != CrediariosStatus.Aberto)
                    throw new InvalidOperationException("O crediário selecionado já foi quitado.");

                existente.ValorEmCentavos += primaryAmt;
                if (!string.IsNullOrWhiteSpace(observacao))
                    existente.Observacao = observacao;

                // Serializa os itens da nova comanda em ItensJson para que o MapToDto
                // os exiba corretamente sem depender de date-range.
                // Na primeira acumulação: se a conta original tinha ComandaId, migra
                // os itens da comanda original para ItensJson primeiro.
                var novosItens = comanda.Items
                    .OrderBy(i => i.AddedAt)
                    .Select(i => new ItemCrediarioDto
                    {
                        ItemName         = i.ItemNameSnapshot,
                        Quantity         = i.Quantity,
                        UnitPriceInReais = i.UnitPriceInCents / 100m,
                        SubtotalInReais  = i.SubtotalInCents  / 100m,
                    }).ToList();

                List<ItemCrediarioDto> itensAcumulados;
                if (string.IsNullOrWhiteSpace(existente.ItensJson))
                {
                    // Primeira acumulação — migra itens da comanda original (se houver)
                    var originais = existente.Comanda?.Items
                        .OrderBy(i => i.AddedAt)
                        .Select(i => new ItemCrediarioDto
                        {
                            ItemName         = i.ItemNameSnapshot,
                            Quantity         = i.Quantity,
                            UnitPriceInReais = i.UnitPriceInCents / 100m,
                            SubtotalInReais  = i.SubtotalInCents  / 100m,
                        }) ?? Enumerable.Empty<ItemCrediarioDto>();

                    itensAcumulados = originais.Concat(novosItens).ToList();
                }
                else
                {
                    itensAcumulados = JsonSerializer.Deserialize<List<ItemCrediarioDto>>(existente.ItensJson)
                        ?? new List<ItemCrediarioDto>();
                    itensAcumulados.AddRange(novosItens);
                }

                existente.ItensJson = JsonSerializer.Serialize(itensAcumulados);

                _logger.LogInformation(
                    "Comanda {CmdId} acumulada no crediário {CredId} do usuário {UserId} — +R$ {Valor:N2}, novo total R$ {Total:N2}",
                    comandaId, existente.Id, comanda.UserId, primaryAmt / 100m, existente.ValorEmCentavos / 100m);
            }
            else
            {
                // Conta nova: vencimento escolhido no fechamento (o produto da pré-venda pode
                // chegar depois) ou os 30 dias de sempre quando ninguém escolheu.
                var vencimento = crediarioVencimento?.Date.ToUniversalTime() ?? DateTime.UtcNow.AddDays(30);
                var crediario  = new Crediario
                {
                    UserId           = comanda.UserId,
                    ComandaId        = comanda.Id,
                    ValorEmCentavos  = primaryAmt,
                    DataAbertura     = DateTime.UtcNow,
                    DataVencimento   = vencimento,
                    Status           = CrediariosStatus.Aberto,
                    AbertoPorAdminId = adminId,
                    Observacao       = observacao,
                };

                _db.Crediarios.Add(crediario);
                _logger.LogInformation(
                    "Crediário {CredId} criado para usuário {UserId} — R$ {Valor:N2}, vence em {Venc:dd/MM/yyyy}",
                    crediario.Id, comanda.UserId, crediario.ValorEmReais, vencimento);

                if (!string.IsNullOrWhiteSpace(comanda.User?.Email))
                {
                    var emailAddr  = comanda.User.Email;
                    var userName   = comanda.User.Name;
                    var valorReais = crediario.ValorEmReais;
                    var venc       = vencimento;
                    _ = Task.Run(async () =>
                    {
                        using var scope  = _scopeFactory.CreateScope();
                        var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
                        await emailService.SendCrediarioAbertoAsync(emailAddr, userName, valorReais, venc);
                    });
                }
            }
        }

        // ── Pontos como pagamento principal ───────────────────────────────────
        if (paymentMethod == PaymentPontos)
        {
            if (comanda.User == null)
                throw new InvalidOperationException("Usuário não encontrado.");

            if (comanda.User.PointsBalance < primaryAmt)
                throw new InvalidOperationException(
                    $"Saldo de pontos insuficiente. Cliente tem {comanda.User.PointsBalance} pts, faltam {primaryAmt} pts.");

            comanda.User.PointsBalance -= primaryAmt;
            comanda.User.UpdatedAt      = DateTime.UtcNow;
            _logger.LogInformation(
                "Comanda {Id} quitada com {Pts} pontos do usuário {UserId}. Saldo restante: {Saldo}",
                comandaId, primaryAmt, comanda.UserId, comanda.User.PointsBalance);
        }

        // ── Cashback como pagamento principal ─────────────────────────────────
        if (paymentMethod == PaymentCashback)
        {
            if (comanda.User == null)
                throw new InvalidOperationException("Usuário não encontrado.");

            if (comanda.User.BalanceInCents < primaryAmt)
                throw new InvalidOperationException(
                    $"Saldo insuficiente. Cliente tem R$ {comanda.User.BalanceInCents / 100m:N2}, falta R$ {primaryAmt / 100m:N2}.");

            comanda.User.BalanceInCents -= primaryAmt;
            comanda.User.UpdatedAt       = DateTime.UtcNow;
            _logger.LogInformation(
                "Comanda {Id} quitada com R$ {Valor:N2} de cashback do usuário {UserId}. Saldo restante: R$ {Saldo:N2}",
                comandaId, primaryAmt / 100m, comanda.UserId, comanda.User.BalanceInCents / 100m);
        }

        // Grava o total líquido (o que o cliente efetivamente pagou, após desconto de pontos pré-aplicados)
        comanda.TotalInCents  = netTotal;
        comanda.Status        = ComandaStatus.Fechada;
        comanda.ClosedAt      = DateTime.UtcNow;
        comanda.PaymentMethod = paymentMethod;

        // ── Pontos de fidelidade ──────────────────────────────────────────────
        // Não acumula quando qualquer parte do pagamento usa cashback, pontos ou crediário.
        if (comanda.User != null && paymentMethod != PaymentCrediario
                                 && paymentMethod != PaymentPontos
                                 && paymentMethod != PaymentCashback
                                 && secondPaymentMethod != PaymentCashback)
        {
            // Base para acúmulo: exclui parcela paga em pontos no segundo método
            var baseParaPontos = (hasSecond && secondPaymentMethod == PaymentPontos)
                ? primaryAmt
                : netTotal;

            var pontosGanhos = baseParaPontos / 100;
            if (pontosGanhos > 0)
            {
                if (comanda.User.PointsExpiresAt.HasValue && comanda.User.PointsExpiresAt.Value < DateTime.UtcNow)
                    comanda.User.PointsBalance = 0;
                comanda.User.PointsBalance  += pontosGanhos;
                comanda.User.PointsExpiresAt = DateTime.UtcNow.AddDays(30);
                _logger.LogInformation(
                    "Usuário {UserId} ganhou {Pontos} pontos na comanda {ComandaId}.",
                    comanda.UserId, pontosGanhos, comandaId);
            }
        }

        await _db.SaveChangesAsync();

        // Emite a NFC-e referente a esta comanda — só quando o admin escolheu explicitamente
        // emitir no fechamento (Maikon não quer nota emitida sem antes perguntar). Aguarda o
        // resultado (em vez de fire-and-forget) pra poder devolver o status pro caixa na hora
        // e permitir abrir o cupom automaticamente quando autorizar. Falhas fiscais comuns não
        // derrubam o fechamento; a exceção da trava geral é tratada logo abaixo.
        // Se não marcou, nenhuma NotaFiscalEmitida é criada; a emissão pode ser feita depois
        // manualmente pelo histórico.
        NotaFiscalEmitida? nota = null;
        string? bloqueioFiscal = null;
        if (emitirNotaFiscal)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var emissao = scope.ServiceProvider.GetRequiredService<INfceEmissionService>();
                nota = await emissao.EmitirParaComandaAsync(comandaId);
            }
            catch (FiscalModuloBloqueadoException ex)
            {
                // A venda já foi fechada com sucesso; a trava impede somente a NFC-e.
                bloqueioFiscal = ex.Message;
            }
        }

        var dto = MapToDto(comanda);
        dto.NotaFiscalId              = nota?.Id;
        dto.NotaFiscalStatus          = bloqueioFiscal is null ? nota?.Status.ToString() : "Bloqueada";
        dto.NotaFiscalMotivoRejeicao  = bloqueioFiscal ?? nota?.MotivoRejeicao;
        // Notifica o cliente que a comanda foi fechada
        await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
            .SendAsync("ComandaClosed", new { ComandaId = comandaId, PaymentMethod = paymentMethod });
        // Notifica o admin
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaClosed", new
            {
                ComandaId     = comandaId,
                UserId        = comanda.UserId,
                UserName      = dto.UserName,
                TotalInReais  = dto.TotalInReais,
                PaymentMethod = paymentMethod,
            });

        return dto;
    }

    public async Task<ComandaDto> CancelComandaAsync(Guid comandaId, Guid adminId)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException($"Comanda {comandaId} não encontrada.");

        if (comanda.Status == ComandaStatus.Fechada || comanda.Status == ComandaStatus.Cancelada
         || comanda.Status == ComandaStatus.Estornada)
            throw new InvalidOperationException(
                "Esta comanda já foi fechada (cobrada) ou cancelada — cancelamento sem cobrança só se aplica a comandas ainda abertas. " +
                "Para estornar uma venda já fechada, use o cancelamento da nota fiscal (Admin > Fiscal).");

        foreach (var item in comanda.Items.Where(i => i.ProductId.HasValue))
        {
            await _db.Products
                .Where(p => p.Id == item.ProductId!.Value)
                .ExecuteUpdateAsync(s => s.SetProperty(
                    p => p.StockQuantity, p => p.StockQuantity + item.Quantity));
        }

        // Devolve pontos que o cliente havia aplicado nesta comanda
        if (comanda.PointsApplied > 0 && comanda.User != null)
        {
            comanda.User.PointsBalance += comanda.PointsApplied;
            comanda.User.UpdatedAt      = DateTime.UtcNow;
            _logger.LogInformation(
                "Comanda {Id} cancelada — {Pts} pontos devolvidos ao usuário {UserId}.",
                comandaId, comanda.PointsApplied, comanda.UserId);
        }

        comanda.Status   = ComandaStatus.Cancelada;
        comanda.ClosedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Comanda {Id} cancelada — estoque restaurado para {Count} produto(s).",
            comandaId, comanda.Items.Count(i => i.ProductId.HasValue));

        // Notifica o cliente que a comanda foi cancelada
        await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
            .SendAsync("ComandaCancelled", new { ComandaId = comandaId });
        // Notifica o admin
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaCancelled", new { ComandaId = comandaId, UserId = comanda.UserId });

        return MapToDto(comanda);
    }

    /// <summary>
    /// Estorna uma comanda JÁ FECHADA: devolve estoque, devolve os pontos que o cliente
    /// aplicou, tira os pontos de fidelidade que ganhou, baixa o crediário que a comanda
    /// gerou e marca como Estornada — o faturamento só soma Fechada, então o valor sai
    /// das contas. Diferente de CancelComandaAsync, que só vale pra comanda ainda aberta.
    /// </summary>
    public async Task<ComandaDto> EstornarComandaFechadaAsync(Guid comandaId, Guid adminId, string motivo)
    {
        if (string.IsNullOrWhiteSpace(motivo))
            throw new InvalidOperationException("Informe o motivo do estorno.");

        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException($"Comanda {comandaId} não encontrada.");

        if (comanda.Status != ComandaStatus.Fechada)
            throw new InvalidOperationException(
                "Só dá pra estornar comanda fechada. Comanda ainda aberta se cancela pelo botão de cancelar.");

        // Nota autorizada não se desfaz por dentro do sistema — tem prazo legal na SEFAZ.
        var notaAtiva = await _db.NotasFiscaisEmitidas
            .AnyAsync(n => n.ComandaId == comandaId
                        && (n.Status == NotaFiscalStatus.Autorizada
                         || n.Status == NotaFiscalStatus.AutorizadaContingencia));
        if (notaAtiva)
            throw new InvalidOperationException(
                "Esta comanda tem NFC-e autorizada. Cancele a nota em Admin > Fiscal primeiro.");

        // Crediário gerado por esta comanda: só desfaz se ninguém pagou nada ainda.
        var crediario = await _db.Crediarios.FirstOrDefaultAsync(c => c.ComandaId == comandaId);
        if (crediario is not null && crediario.ValorPagoEmCentavos > 0)
            throw new InvalidOperationException(
                $"O crediário desta comanda já tem R$ {crediario.ValorPagoEmCentavos / 100m:N2} pagos. " +
                "Acerte o crediário do cliente antes de estornar.");

        foreach (var item in comanda.Items.Where(i => i.ProductId.HasValue))
        {
            if (item.VariantId.HasValue)
                await _db.ProductVariants
                    .Where(v => v.Id == item.VariantId.Value)
                    .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + item.Quantity));
            else
                await _db.Products
                    .Where(p => p.Id == item.ProductId!.Value)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.StockQuantity, p => p.StockQuantity + item.Quantity));
        }

        if (comanda.User != null)
        {
            // Devolve os pontos que o cliente usou pra abater e retira os que ganhou na compra.
            var pontosGanhos = comanda.TotalInCents / 100;
            comanda.User.PointsBalance = Math.Max(0, comanda.User.PointsBalance + comanda.PointsApplied - pontosGanhos);
            comanda.User.UpdatedAt     = DateTime.UtcNow;
        }

        if (crediario is not null)
        {
            crediario.ValorEmCentavos = Math.Max(0, crediario.ValorEmCentavos - comanda.TotalInCents);
            if (crediario.ValorEmCentavos == 0)
                _db.Crediarios.Remove(crediario);
        }

        comanda.Status              = ComandaStatus.Estornada;
        comanda.EstornadaEm         = DateTime.UtcNow;
        comanda.EstornadaPorAdminId = adminId;
        comanda.MotivoEstorno       = motivo.Trim();

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Comanda {Id} estornada pelo admin {AdminId} — R$ {Total:N2} fora do faturamento, estoque devolvido. Motivo: {Motivo}",
            comandaId, adminId, comanda.TotalInReais, motivo);

        await _hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("StockChanged", new { });

        return MapToDto(comanda);
    }

    public async Task<IEnumerable<ComandaDto>> GetActiveCommandasForDashboardAsync()
    {
        var comandas = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .Where(c => c.Status == ComandaStatus.Aberta || c.Status == ComandaStatus.EmAndamento)
            .OrderByDescending(c => c.OpenedAt)
            .ToListAsync();

        return comandas.Select(MapToDto).ToList();
    }

    public async Task<IEnumerable<ComandaDto>> GetUserHistoryAsync(Guid userId, int limit = 20)
    {
        var comandas = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .Where(c => c.UserId == userId &&
                (c.Status == ComandaStatus.Fechada || c.Status == ComandaStatus.Cancelada
                     || c.Status == ComandaStatus.Estornada))
            .OrderByDescending(c => c.ClosedAt)
            .Take(limit)
            .ToListAsync();

        return comandas.Select(MapToDto).ToList();
    }

    public async Task<IEnumerable<ComandaDto>> GetTodayHistoryAsync(DateTime? data = null)
    {
        // Usa intervalo UTC calculado a partir do fuso de Brasília.
        // Sem isso, uma comanda fechada às 22h30 BR (= 01h30 UTC do dia seguinte)
        // aparecia incorretamente como "hoje" no dashboard.
        var (inicioUtc, fimUtc) = DiaBrasil(data);

        var comandas = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .Where(c => (c.Status == ComandaStatus.Fechada || c.Status == ComandaStatus.Cancelada
                     || c.Status == ComandaStatus.Estornada)
                     && c.ClosedAt.HasValue
                     && c.ClosedAt.Value >= inicioUtc
                     && c.ClosedAt.Value <  fimUtc)
            .OrderByDescending(c => c.ClosedAt)
            .ToListAsync();

        return comandas.Select(MapToDto).ToList();
    }

    public async Task<ComandaDto> ApplyPointsAsync(Guid comandaId, Guid userId, int points)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException("Comanda não encontrada.");

        if (comanda.UserId != userId)
            throw new InvalidOperationException("Você só pode usar pontos na sua própria comanda.");

        if (comanda.Status == ComandaStatus.Fechada || comanda.Status == ComandaStatus.Cancelada
         || comanda.Status == ComandaStatus.Estornada)
            throw new InvalidOperationException("Não é possível aplicar pontos em comanda encerrada.");

        if (comanda.PointsApplied > 0)
            throw new InvalidOperationException("Pontos já foram aplicados nesta comanda.");

        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("Usuário não encontrado.");

        if (user.PointsExpiresAt.HasValue && user.PointsExpiresAt.Value < DateTime.UtcNow)
            throw new InvalidOperationException("Seus pontos estão expirados.");

        if (user.PointsBalance < points)
            throw new InvalidOperationException($"Saldo insuficiente. Você tem {user.PointsBalance} pontos.");

        // Não permite abater mais do que o total da comanda
        var pontosAplicados = Math.Min(points, comanda.TotalInCents);

        user.PointsBalance   -= pontosAplicados;
        user.UpdatedAt        = DateTime.UtcNow;
        comanda.PointsApplied = pontosAplicados;

        await _db.SaveChangesAsync();
        _logger.LogInformation("Usuário {UserId} aplicou {Points} pontos na comanda {ComandaId}.",
            userId, pontosAplicados, comandaId);

        return MapToDto(comanda);
    }

    public async Task<ComandaDto> RemovePointsAsync(Guid comandaId, Guid requestingUserId)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException("Comanda não encontrada.");

        if (comanda.Status == ComandaStatus.Fechada || comanda.Status == ComandaStatus.Cancelada
         || comanda.Status == ComandaStatus.Estornada)
            throw new InvalidOperationException("Não é possível remover pontos de comanda encerrada.");

        if (comanda.PointsApplied == 0)
            throw new InvalidOperationException("Não há pontos aplicados nesta comanda.");

        // Valida permissão: deve ser o dono da comanda ou um Admin
        var isOwner = comanda.UserId == requestingUserId;
        if (!isOwner)
        {
            var requestingUser = await _db.Users.FindAsync(requestingUserId)
                ?? throw new UnauthorizedAccessException("Usuário solicitante não encontrado.");
            if (requestingUser.Role != UserRole.Admin)
                throw new UnauthorizedAccessException("Sem permissão para remover pontos desta comanda.");
        }

        var user = await _db.Users.FindAsync(comanda.UserId)
            ?? throw new InvalidOperationException("Usuário da comanda não encontrado.");

        var pontosDevolvidos   = comanda.PointsApplied;
        user.PointsBalance    += pontosDevolvidos;
        user.UpdatedAt         = DateTime.UtcNow;
        comanda.PointsApplied  = 0;

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Pontos removidos da comanda {ComandaId} por {RequestingUserId}. {Points} pts devolvidos ao usuário {UserId}.",
            comandaId, requestingUserId, pontosDevolvidos, comanda.UserId);

        var dto = MapToDto(comanda);

        // Notifica o cliente que os pontos foram removidos
        await _hub.Clients.Group(ComandaHub.GetComandaGroup(comandaId))
            .SendAsync("ComandaUpdated", new { ComandaId = comandaId, NewTotalInReais = dto.TotalInReais });
        // Notifica o admin (dashboard)
        await _hub.Clients.Group(ComandaHub.AdminGroup)
            .SendAsync("ComandaUpdated", new ComandaUpdateEvent
            {
                ComandaId  = dto.Id,
                UserId     = dto.UserId,
                UserName   = comanda.User?.Name ?? string.Empty,
                Status     = dto.Status,
                LastItemAdded = "(pontos removidos)",
                UpdatedAt  = DateTime.UtcNow,
            });

        return dto;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Resolve nome e preço do item. Se vier ProductId, busca do banco e ignora
    /// o que o cliente enviou — nunca confiar em preço vindo da requisição.
    /// </summary>
    private async Task<(string name, int priceInCents, int costInCents)> ResolveItemAsync(AddItemToComandaRequest request)
    {
        if (!request.ProductId.HasValue)
        {
            if (string.IsNullOrWhiteSpace(request.ItemName))
                throw new ArgumentException("Nome do item é obrigatório para itens sem produto cadastrado.");
            return (request.ItemName, request.UnitPriceInCents, 0);
        }

        var product = await _db.Products.FindAsync(request.ProductId.Value)
            ?? throw new InvalidOperationException("Produto não encontrado.");

        if (!product.IsActive)
            throw new InvalidOperationException("Produto inativo e não pode ser adicionado.");

        var effectivePrice = product.IsOnPromo ? product.DiscountPriceInCents!.Value : product.PriceInCents;
        string itemName    = product.Name;

        // ── Produto com grade de tamanho/cor ──────────────────────────────────
        if (product.HasVariants)
        {
            if (!request.VariantId.HasValue)
                throw new InvalidOperationException($"Produto '{product.Name}' tem grade — selecione tamanho/cor.");

            var variant = await _db.ProductVariants
                .FirstOrDefaultAsync(v => v.Id == request.VariantId && v.ProductId == product.Id)
                ?? throw new InvalidOperationException("Variante inválida.");

            if (!request.SkipStockDecrement)
            {
                if (variant.StockQuantity < request.Quantity)
                    throw new InvalidOperationException(
                        $"Estoque insuficiente para '{product.Name} — {variant.Label}'. Disponível: {variant.StockQuantity} un.");

                var updv = await _db.ProductVariants
                    .Where(v => v.Id == variant.Id && v.StockQuantity >= request.Quantity)
                    .ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity - request.Quantity));
                if (updv == 0)
                    throw new InvalidOperationException($"Estoque insuficiente para '{product.Name} — {variant.Label}' (venda simultânea).");
            }

            if (variant.PriceInCents.HasValue) effectivePrice = variant.PriceInCents.Value;
            itemName = $"{product.Name} — {variant.Label}";
            return (itemName, effectivePrice, product.CostPriceInCents);
        }

        // ── Produto simples ───────────────────────────────────────────────────
        // SkipStockDecrement (homologação de pré-venda): estoque já foi baixado na
        // reserva — só resolve nome/preço sem mexer no saldo.
        if (request.SkipStockDecrement)
            return (product.Name, effectivePrice, product.CostPriceInCents);

        if (product.StockQuantity < request.Quantity)
            throw new InvalidOperationException(
                $"Estoque insuficiente para '{product.Name}'. Disponível: {product.StockQuantity} un.");

        var updated = await _db.Products
            .Where(p => p.Id == product.Id && p.StockQuantity >= request.Quantity)
            .ExecuteUpdateAsync(s => s.SetProperty(
                p => p.StockQuantity, p => p.StockQuantity - request.Quantity));

        if (updated == 0)
            throw new InvalidOperationException(
                $"Estoque insuficiente para '{product.Name}' (atualizado por outra venda simultânea).");

        product.StockQuantity -= request.Quantity;
        return (product.Name, effectivePrice, product.CostPriceInCents);
    }

    // =========================================================================
    // EDITAR COMANDA FECHADA — Admin only
    // =========================================================================

    public async Task<ComandaDto> EditarComandaFechadaAsync(Guid comandaId, Guid adminId, EditarComandaRequest request)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException($"Comanda {comandaId} não encontrada.");

        if (comanda.Status != ComandaStatus.Fechada)
            throw new InvalidOperationException("Somente comandas com status 'Fechada' podem ser editadas.");

        // 1. Forma de pagamento
        if (request.PaymentMethod != null)
            comanda.PaymentMethod = request.PaymentMethod;

        if (request.SecondPaymentMethod != null)
            comanda.SecondPaymentMethod = request.SecondPaymentMethod == "" ? null : request.SecondPaymentMethod;

        if (request.SecondPaymentAmountInCents.HasValue)
            comanda.SecondPaymentAmountInCents = request.SecondPaymentAmountInCents.Value;

        // 2. Desconto — campo próprio, separado de PointsApplied (pontos de fidelidade reais)
        if (request.DescontoEmCentavos.HasValue)
            comanda.DiscountInCents = Math.Max(0, request.DescontoEmCentavos.Value);

        // 3. Observações
        if (request.Notes != null)
            comanda.Notes = request.Notes;

        // 4. Trocar cliente
        if (request.NovoClienteId.HasValue)
        {
            var existe = await _db.Users.AnyAsync(u => u.Id == request.NovoClienteId.Value && u.IsActive);
            if (!existe) throw new InvalidOperationException("Cliente não encontrado ou inativo.");
            comanda.UserId = request.NovoClienteId.Value;
        }

        // 5. Itens
        if (request.Itens != null)
        {
            foreach (var req in request.Itens)
            {
                if (req.ComandaItemId.HasValue && req.Remover)
                {
                    var existing = comanda.Items.FirstOrDefault(i => i.Id == req.ComandaItemId.Value);
                    if (existing != null)
                    {
                        if (existing.ProductId.HasValue)
                            await _db.Products
                                .Where(p => p.Id == existing.ProductId.Value)
                                .ExecuteUpdateAsync(s => s
                                    .SetProperty(p => p.StockQuantity, p => p.StockQuantity + existing.Quantity)
                                    .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));
                        _db.ComandaItems.Remove(existing);
                        comanda.Items.Remove(existing);
                    }
                }
                else if (req.ComandaItemId.HasValue)
                {
                    var existing = comanda.Items.FirstOrDefault(i => i.Id == req.ComandaItemId.Value);
                    if (existing != null)
                    {
                        var delta = req.Quantity - existing.Quantity;
                        if (delta != 0 && existing.ProductId.HasValue)
                        {
                            if (delta > 0)
                            {
                                var rows = await _db.Products
                                    .Where(p => p.Id == existing.ProductId.Value && p.StockQuantity >= delta)
                                    .ExecuteUpdateAsync(s => s
                                        .SetProperty(p => p.StockQuantity, p => p.StockQuantity - delta)
                                        .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));
                                if (rows == 0)
                                    throw new InvalidOperationException($"Estoque insuficiente para '{existing.ItemNameSnapshot}'.");
                            }
                            else
                            {
                                await _db.Products
                                    .Where(p => p.Id == existing.ProductId.Value)
                                    .ExecuteUpdateAsync(s => s
                                        .SetProperty(p => p.StockQuantity, p => p.StockQuantity + (-delta))
                                        .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));
                            }
                        }
                        existing.Quantity         = req.Quantity;
                        existing.UnitPriceInCents = req.UnitPriceInCents;
                        existing.SubtotalInCents  = req.Quantity * req.UnitPriceInCents;
                    }
                }
                else
                {
                    // Novo item
                    if (req.ProductId.HasValue)
                    {
                        var rows = await _db.Products
                            .Where(p => p.Id == req.ProductId.Value && p.IsActive && p.StockQuantity >= req.Quantity)
                            .ExecuteUpdateAsync(s => s
                                .SetProperty(p => p.StockQuantity, p => p.StockQuantity - req.Quantity)
                                .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));
                        if (rows == 0)
                            throw new InvalidOperationException($"Estoque insuficiente ou produto inativo: '{req.ItemName}'.");
                    }
                    var novoItem = new ComandaItem
                    {
                        ComandaId        = comanda.Id,
                        ProductId        = req.ProductId,
                        ItemNameSnapshot = req.ItemName,
                        UnitPriceInCents = req.UnitPriceInCents,
                        Quantity         = req.Quantity,
                        SubtotalInCents  = req.Quantity * req.UnitPriceInCents,
                        AddedByUserId    = adminId,
                    };
                    _db.ComandaItems.Add(novoItem);
                    comanda.Items.Add(novoItem);
                }
            }
        }

        await _db.SaveChangesAsync();

        // Recalcula total a partir dos itens salvos
        var totalItens = await _db.ComandaItems
            .Where(i => i.ComandaId == comandaId)
            .SumAsync(i => i.SubtotalInCents);
        comanda.TotalInCents = Math.Max(0, totalItens - comanda.PointsApplied - comanda.DiscountInCents);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Comanda {Id} editada pelo admin {AdminId}.", comandaId, adminId);
        await _hub.Clients.Group(ComandaHub.AdminGroup).SendAsync("ComandaAtualizada", comandaId);

        // Recarrega com User para o MapToDto
        var updated = await _db.Comandas
            .Include(c => c.Items)
            .Include(c => c.User)
            .FirstAsync(c => c.Id == comandaId);

        return MapToDto(updated);
    }

    private static ComandaDto MapToDto(Comanda comanda) => new()
    {
        Id                         = comanda.Id,
        UserId                     = comanda.UserId,
        UserName                   = comanda.User?.Name ?? string.Empty,
        TableIdentifier            = comanda.TableIdentifier,
        Status                     = comanda.Status.ToString(),
        TotalInReais               = comanda.TotalInReais,
        PointsApplied              = comanda.PointsApplied,
        DiscountInCents            = comanda.DiscountInCents,
        OpenedAt                   = comanda.OpenedAt,
        ClosedAt                   = comanda.ClosedAt,
        PaymentMethod              = comanda.PaymentMethod,
        SecondPaymentMethod        = comanda.SecondPaymentMethod,
        SecondPaymentAmountInCents = comanda.SecondPaymentAmountInCents,
        UserPointsBalance          = comanda.User?.PointsBalance  ?? 0,
        UserBalanceInCents         = comanda.User?.BalanceInCents ?? 0,
        ProfileImageUrl            = comanda.User?.ProfileImageUrl,
        EstornadaEm                = comanda.EstornadaEm,
        MotivoEstorno              = comanda.MotivoEstorno,
        Items                      = comanda.Items.Select(i => new ComandaItemDto
        {
            Id               = i.Id,
            ProductId        = i.ProductId,
            ItemNameSnapshot = i.ItemNameSnapshot,
            Quantity         = i.Quantity,
            UnitPriceInCents = i.UnitPriceInCents,
            UnitPriceInReais = i.UnitPriceInCents / 100m,
            SubtotalInReais  = i.SubtotalInReais,
            AddedAt          = i.AddedAt,
        }).ToList(),
    };
}
