// =============================================================================
// CrediarioContaService.cs — as contas do crediário: abrir à mão (dívida antiga),
// listar, editar (valor, vencimento, itens por compra), receber pagamento e excluir.
//
// Cada compra da conta é um CrediarioLancamento; o DTO devolve as compras separadas
// (Lancamentos) e a lista corrida (ItensComanda) pra impressão. Pagamento de dívida
// é caixa, não receita nova (a receita entrou quando a compra foi feita).
// =============================================================================

using System.Text.Json;
using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Crediarios;

public interface ICrediarioContaService
{
    /// <summary>Abre uma conta à mão (dívida anterior ao sistema).</summary>
    Task<CrediariosDto> CriarManualAsync(CriarCrediarioManualRequest req, Guid adminId);

    /// <summary>Contas abertas agrupadas por cliente, quem tem vencido primeiro.</summary>
    Task<List<CrediariosClienteDto>> PorClienteAsync();

    /// <summary>Todas as contas, filtrando por status (Aberto, Pago...) se vier.</summary>
    Task<List<CrediariosDto>> ListarAsync(string? status);

    /// <summary>Todas as contas de um cliente, da mais nova pra mais antiga.</summary>
    Task<List<CrediariosDto>> DoClienteAsync(Guid userId);

    /// <summary>Edita valor, observação, vencimento e os itens de cada compra.</summary>
    Task<CrediariosDto> EditarAsync(Guid id, EditarCrediarioRequest req, Guid adminId);

    /// <summary>Recebe um pagamento (ou dois, no split) e quita a conta se zerar o saldo.</summary>
    Task<CrediariosDto> RegistrarPagamentoAsync(Guid id, RegistrarPagamentoRequest req, Guid adminId);

    /// <summary>Exclui conta sem nenhum pagamento.</summary>
    Task ExcluirAsync(Guid id, Guid adminId);
}

public class CrediarioContaService(
    AppDbContext db, CrediarioPixService pix, IEmailService email, IAuditService audit,
    ILogger<CrediarioContaService> logger) : ICrediarioContaService
{
    private const string NaoEncontrado = "Crediário não encontrado.";

    public async Task<CrediariosDto> CriarManualAsync(CriarCrediarioManualRequest req, Guid adminId)
    {
        if (await db.Users.FindAsync(req.UserId) is null)
            throw new RegraException("Cliente não encontrado.");

        var abertura = req.DataAbertura?.ToUniversalTime() ?? DateTime.UtcNow;
        var crediario = new Crediario
        {
            UserId           = req.UserId,
            ComandaId        = null, // dívida manual — sem comanda de origem
            ValorEmCentavos  = req.ValorEmCentavos,
            DataAbertura     = abertura,
            DataVencimento   = req.DataVencimento.HasValue
                                   ? CrediarioLancamentos.VencimentoFimDoDia(req.DataVencimento.Value)
                                   : abertura.AddDays(30),
            Status           = CrediariosStatus.Aberto,
            Observacao       = string.IsNullOrWhiteSpace(req.Observacao) ? "Dívida anterior ao sistema" : req.Observacao,
            AbertoPorAdminId = adminId,
        };
        crediario.Lancamentos.Add(new CrediarioLancamento
        {
            CrediarioId     = crediario.Id,
            Origem          = CrediarioLancamentoOrigem.Manual,
            ValorEmCentavos = req.ValorEmCentavos,
            ItensJson       = CrediarioLancamentos.SerializarItens(req.Itens ?? []),
            Descricao       = crediario.Observacao,
            CreatedAt       = abertura,
        });

        db.Crediarios.Add(crediario);
        await db.SaveChangesAsync();

        logger.LogInformation("Crediário manual {Id} criado pelo admin {AdminId} para usuário {UserId} — R$ {Valor:N2}",
            crediario.Id, adminId, req.UserId, req.ValorEmCentavos / 100m);

        return CrediarioMapeamento.ParaDto(await Completas().FirstAsync(c => c.Id == crediario.Id));
    }

    public async Task<List<CrediariosClienteDto>> PorClienteAsync()
    {
        var abertas = await Completas()
            .Where(c => c.Status == CrediariosStatus.Aberto)
            .OrderBy(c => c.DataVencimento)
            .ToListAsync();

        return abertas
            .GroupBy(c => c.UserId)
            .Select(g =>
            {
                var dividas = g.Select(CrediarioMapeamento.ParaDto).ToList();
                var user    = g.First().User;
                return new CrediariosClienteDto
                {
                    UserId            = g.Key,
                    UserName          = user?.Name ?? string.Empty,
                    UserEmail         = user?.Email,
                    UserWhatsApp      = user?.WhatsApp,
                    SaldoTotal        = dividas.Sum(d => d.SaldoRestanteEmReais),
                    TotalDividas      = dividas.Count,
                    TemVencido        = dividas.Any(d => d.Vencido),
                    ProximoVencimento = g.Min(c => c.DataVencimento),
                    Dividas           = dividas,
                };
            })
            .OrderByDescending(g => g.TemVencido)
            .ThenBy(g => g.ProximoVencimento)
            .ToList();
    }

    public async Task<List<CrediariosDto>> ListarAsync(string? status)
    {
        var q = Completas();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<CrediariosStatus>(status, ignoreCase: true, out var s))
            q = q.Where(c => c.Status == s);
        return (await q.OrderByDescending(c => c.DataAbertura).ToListAsync()).Select(CrediarioMapeamento.ParaDto).ToList();
    }

    public async Task<List<CrediariosDto>> DoClienteAsync(Guid userId) =>
        (await Completas().Where(c => c.UserId == userId).OrderByDescending(c => c.DataAbertura).ToListAsync())
            .Select(CrediarioMapeamento.ParaDto).ToList();

    public async Task<CrediariosDto> EditarAsync(Guid id, EditarCrediarioRequest req, Guid adminId)
    {
        var crediario = await Completas().FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new RegraException(NaoEncontrado, 404);
        if (crediario.Status == CrediariosStatus.Pago)
            throw new RegraException("Não é possível editar um crediário já quitado.");

        var antes = new { crediario.ValorEmCentavos, crediario.DataVencimento, crediario.Observacao };

        if (req.ValorEmCentavos is int valor)
        {
            if (valor < crediario.ValorPagoEmCentavos)
                throw new RegraException($"O novo valor ({Dinheiro.Brl(valor / 100m)}) não pode ser menor do que o valor já pago ({Dinheiro.Brl(crediario.ValorPagoEmCentavos / 100m)}).");
            crediario.ValorEmCentavos = valor;
        }

        if (req.Observacao != null) crediario.Observacao = req.Observacao;

        if (req.DataVencimento is { } vencimento)
        {
            if (vencimento.Date < CrediarioLancamentos.HojeBrasil())
                throw new RegraException("A data de vencimento não pode ser no passado.");
            crediario.DataVencimento = CrediarioLancamentos.VencimentoFimDoDia(vencimento);
        }

        if (req.Itens != null) RedistribuirItens(crediario, req.Itens);

        await db.SaveChangesAsync();
        logger.LogInformation("Crediário {Id} editado pelo admin {AdminId}", id, adminId);

        // Mexer no valor de uma dívida precisa deixar rastro de quem mudou e de quanto era
        var depois = new { crediario.ValorEmCentavos, crediario.DataVencimento, crediario.Observacao };
        await audit.LogAsync("EditouCrediario", "Crediario", id.ToString(),
            details: JsonSerializer.Serialize(new { antes, depois, itensEditados = req.Itens != null }));

        return CrediarioMapeamento.ParaDto(crediario);
    }

    /// <summary>
    /// Cada item volta pra compra de onde veio (LancamentoId); item novo, sem compra, vai pro
    /// bloco de ajuste manual da conta.
    /// </summary>
    private void RedistribuirItens(Crediario crediario, List<ItemCrediarioDto> itens)
    {
        var ativos    = crediario.Lancamentos.Where(l => l.EstornadoEm == null).ToList();
        var idsAtivos = ativos.Select(l => l.Id).ToHashSet();

        foreach (var l in ativos)
            l.ItensJson = CrediarioLancamentos.SerializarItens(itens.Where(i => i.LancamentoId == l.Id));

        var semCompra = itens.Where(i => i.LancamentoId is null || !idsAtivos.Contains(i.LancamentoId.Value)).ToList();

        var ajuste = ativos.FirstOrDefault(l => l.Origem == CrediarioLancamentoOrigem.Ajuste);
        if (ajuste is null && semCompra.Count > 0)
        {
            ajuste = new CrediarioLancamento
            {
                CrediarioId = crediario.Id,
                Origem      = CrediarioLancamentoOrigem.Ajuste,
                Descricao   = "Itens adicionados na edição da conta",
            };
            db.CrediarioLancamentos.Add(ajuste);
        }
        if (ajuste is null) return;

        var doAjuste = itens.Where(i => i.LancamentoId == ajuste.Id).Concat(semCompra).ToList();
        ajuste.ItensJson = CrediarioLancamentos.SerializarItens(doAjuste);
        // O bloco vale o que tem dentro: com valor 0 a tela via o item, mas a conta não somava (v1.79.2).
        // Tirar o último item também zera o bloco — por isso não sai antes quando não há item novo.
        ajuste.ValorEmCentavos = (int)Math.Round(doAjuste.Sum(i => i.SubtotalInReais) * 100);
    }

    public async Task<CrediariosDto> RegistrarPagamentoAsync(Guid id, RegistrarPagamentoRequest req, Guid adminId)
    {
        // Pontos, Cashback e "Crediário" passavam aqui sem descontar nada do cliente — quitar
        // dívida com eles era dinheiro de mentira entrando no extrato. Forma desconhecida virava
        // linha fantasma no relatório financeiro agrupado por forma de pagamento.
        var formas = CrediarioLancamentos.FormasDePagamento;
        if (!formas.Contains(req.FormaPagamento))
            throw new RegraException($"Forma de pagamento inválida. Use: {string.Join(", ", formas)}");
        if (!string.IsNullOrWhiteSpace(req.SecondFormaPagamento) && !formas.Contains(req.SecondFormaPagamento))
            throw new RegraException($"Segunda forma de pagamento inválida. Use: {string.Join(", ", formas)}");

        var crediario = await Completas().FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new RegraException(NaoEncontrado, 404);
        if (crediario.Status == CrediariosStatus.Pago)
            throw new RegraException("Crediário já está quitado.");

        // Os dois métodos juntos não podem passar do saldo — antes só o primeiro era conferido, e
        // um split de 50 + 30 numa dívida de 50 registrava R$ 80 recebidos.
        var temSegundo = !string.IsNullOrWhiteSpace(req.SecondFormaPagamento) && req.SecondValorEmCentavos > 0;
        var totalPago  = (long)req.ValorEmCentavos + (temSegundo ? req.SecondValorEmCentavos : 0);
        var saldoAtual = crediario.SaldoRestanteEmCentavos;
        if (totalPago > saldoAtual)
            throw new RegraException(temSegundo
                ? $"Os dois pagamentos somam {Dinheiro.Brl(totalPago / 100m)} e passam do saldo restante de {Dinheiro.Brl(saldoAtual / 100m)}."
                : $"Pagamento de {Dinheiro.Brl(req.ValorEmCentavos / 100m)} excede o saldo restante de {Dinheiro.Brl(saldoAtual / 100m)}.");

        // O saldo vai mudar: QR Code gerado antes cobraria o valor velho. Derruba antes de lançar —
        // e se o cliente acabou de pagar por ele, para aqui pra não receber duas vezes.
        if (await pix.EncerrarAtivasAsync(id, adminId) is { } pixPago)
            throw new RegraException(pixPago, 409);

        // Soma no banco, não na memória: caixa e robô do Pix lançando ao mesmo tempo liam o mesmo
        // ValorPago e um sobrescrevia o outro. A condição de saldo vai junto, então dois pagamentos
        // simultâneos também não passam do valor da conta.
        var conflito = false;
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            conflito = false;
            await using var tx = await db.Database.BeginTransactionAsync();

            var total = (int)totalPago;
            var rows = await db.Crediarios
                .Where(c => c.Id == id && c.Status == CrediariosStatus.Aberto && c.ValorEmCentavos - c.ValorPagoEmCentavos >= total)
                .ExecuteUpdateAsync(u => u.SetProperty(c => c.ValorPagoEmCentavos, c => c.ValorPagoEmCentavos + total));
            if (rows == 0)
            {
                conflito = true;
                await tx.RollbackAsync();
                return;
            }
            await db.Entry(crediario).ReloadAsync();

            db.PagamentosCrediario.Add(new PagamentoCrediario
            {
                CrediarioId = id, ValorEmCentavos = req.ValorEmCentavos, FormaPagamento = req.FormaPagamento,
                Observacao = req.Observacao, AdminId = adminId,
            });
            // Segundo método (split): entrada separada
            if (temSegundo)
                db.PagamentosCrediario.Add(new PagamentoCrediario
                {
                    CrediarioId = id, ValorEmCentavos = req.SecondValorEmCentavos, FormaPagamento = req.SecondFormaPagamento!,
                    Observacao = req.Observacao, AdminId = adminId,
                });

            // Quita se o saldo chegou a zero (tolerância de 1 centavo pra arredondamento)
            if (crediario.SaldoRestanteEmCentavos <= 1)
            {
                crediario.Status         = CrediariosStatus.Pago;
                crediario.DataPagamento  = DateTime.UtcNow;
                crediario.PagoPorAdminId = adminId;
            }

            await db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        if (conflito)
            throw new RegraException("O saldo desta conta mudou enquanto o pagamento era lançado. Recarregue a tela e confira antes de lançar de novo.", 409);

        await db.Entry(crediario).Collection(c => c.Pagamentos).LoadAsync();

        if (crediario.Status == CrediariosStatus.Pago)
        {
            logger.LogInformation("Crediário {Id} quitado via pagamento parcial pelo admin {AdminId} — R$ {Valor:N2}",
                id, adminId, crediario.ValorEmReais);
            if (!string.IsNullOrWhiteSpace(crediario.User?.Email))
                _ = email.SendCrediarioPagoAsync(crediario.User.Email, crediario.User.Name, crediario.ValorEmReais);
        }
        else
        {
            logger.LogInformation("Crediário {Id}: pagamento de R$ {Valor:N2} registrado pelo admin {AdminId}. Saldo restante: R$ {Saldo:N2}",
                id, totalPago / 100m, adminId, crediario.SaldoRestanteEmReais);
        }

        return CrediarioMapeamento.ParaDto(crediario);
    }

    public async Task ExcluirAsync(Guid id, Guid adminId)
    {
        var crediario = await db.Crediarios.Include(c => c.Pagamentos).FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new RegraException(NaoEncontrado, 404);

        // Conta com pagamento é dinheiro já recebido — apagá-la removeria o histórico financeiro
        // sem desfazer a receita original
        if (crediario.ValorPagoEmCentavos > 0)
            throw new RegraException($"Não é possível excluir este crediário pois já possui {Dinheiro.Brl(crediario.ValorPagoEmCentavos / 100m)} registrados como pagos. " +
                                     "Exclua apenas crediários sem nenhum pagamento registrado.");

        // Excluir a conta apaga as cobranças Pix dela: um QR ainda pagável viraria dinheiro sem dono
        if (await pix.EncerrarAtivasAsync(id, adminId) is { } pixPago)
            throw new RegraException(pixPago, 409);

        db.Crediarios.Remove(crediario);
        await db.SaveChangesAsync();

        logger.LogInformation("Crediário {Id} excluído pelo admin {AdminId}", id, adminId);
        await audit.LogAsync("ExcluiuCrediario", "Crediario", id.ToString(),
            details: JsonSerializer.Serialize(new { crediario.UserId, crediario.ValorEmCentavos, crediario.DataAbertura, crediario.Observacao }));
    }

    private IQueryable<Crediario> Completas() =>
        db.Crediarios.Include(c => c.User).Include(c => c.Pagamentos).Include(c => c.Lancamentos).Include(c => c.Avisos);
}

/// <summary>Conta do crediário → DTO das telas.</summary>
public static class CrediarioMapeamento
{
    public static CrediariosDto ParaDto(Crediario c)
    {
        var agora   = DateTime.UtcNow;
        var vencido = c.Status == CrediariosStatus.Aberto && c.DataVencimento < agora;

        var lancamentos = c.Lancamentos.OrderBy(l => l.CreatedAt).Select(CrediarioLancamentos.ToDto).ToList();

        // Conta sem lançamento só existe se a conversão do startup falhou — mostra o legado
        var itens = lancamentos.Count > 0
            ? lancamentos.Where(l => l.EstornadoEm == null).SelectMany(l => l.Itens).ToList()
            : CrediarioLancamentos.LerItens(c.ItensJson);

        return new CrediariosDto
        {
            Id                    = c.Id,
            UserId                = c.UserId,
            UserName              = c.User?.Name ?? string.Empty,
            UserEmail             = c.User?.Email,
            ComandaId             = c.ComandaId,
            ValorEmReais          = c.ValorEmReais,
            ValorPagoEmReais      = c.ValorPagoEmReais,
            SaldoRestanteEmReais  = c.SaldoRestanteEmReais,
            ValorExcedenteEmReais = Math.Max(0, c.ValorPagoEmCentavos - c.ValorEmCentavos) / 100m,
            DataAbertura          = c.DataAbertura,
            DataVencimento        = c.DataVencimento,
            DataPagamento         = c.DataPagamento,
            Status                = vencido ? "Vencido" : c.Status.ToString(),
            Observacao            = c.Observacao,
            PagamentoToken        = c.Status == CrediariosStatus.Aberto ? c.PagamentoToken : null,
            Vencido               = vencido,
            DiasRestantes         = (int)Math.Round((c.DataVencimento - agora).TotalDays),
            Pagamentos            = c.Pagamentos.OrderBy(p => p.CreatedAt).Select(p => new PagamentoCrediarioDto
            {
                Id = p.Id, ValorEmReais = p.ValorEmReais, FormaPagamento = p.FormaPagamento,
                Observacao = p.Observacao, CreatedAt = p.CreatedAt,
            }).ToList(),
            Avisos                = c.Avisos.OrderByDescending(a => a.EnviadoEm).Select(a => new AvisoCrediarioDto
            {
                EnviadoEm  = a.EnviadoEm,
                Marco      = a.Marco,
                Automatico = a.EnviadoPorAdminId == null,
                Canais     = a.Canais.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
                Falhas     = a.Falhas,
            }).ToList(),
            Lancamentos           = lancamentos,
            ItensComanda          = itens,
        };
    }
}
