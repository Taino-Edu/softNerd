// =============================================================================
// CrediarioContaServiceTests.cs — contas do crediário (Services/Crediarios):
// abrir à mão, editar, receber pagamento (parcial, total, split) e excluir.
// SQLite em memória; sem Pix ativo, o CrediarioPixService não chama o Inter.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Crediarios;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class CrediarioContaServiceTests
{
    private static readonly Guid Admin = Guid.NewGuid();

    private sealed record Amb(AppDbContext Db, CrediarioContaService Contas, Mock<IEmailService> Email);

    private static Amb Criar()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();

        var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().Build();
        var inter = new Mock<InterSyncService>(new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object), config, NullLogger<InterSyncService>.Instance);
        var pix = new CrediarioPixService(db, inter.Object, new Mock<IPixReconciliationService>().Object,
            config, NullLogger<CrediarioPixService>.Instance);

        var email = new Mock<IEmailService>();
        var contas = new CrediarioContaService(db, pix, email.Object, new Mock<IAuditService>().Object,
            NullLogger<CrediarioContaService>.Instance);
        return new Amb(db, contas, email);
    }

    private static Crediario Conta(AppDbContext db, int valor = 10000, int pago = 0, string email = "pietro@t.com")
    {
        var user = new User { Id = Guid.NewGuid(), Name = "Pietro", Email = email, PasswordHash = "h", Role = UserRole.Customer };
        var conta = new Crediario
        {
            UserId = user.Id, ValorEmCentavos = valor, ValorPagoEmCentavos = pago,
            DataVencimento = DateTime.UtcNow.AddDays(10),
            Status = pago >= valor ? CrediariosStatus.Pago : CrediariosStatus.Aberto,
        };
        db.Users.Add(user);
        db.Crediarios.Add(conta);
        db.SaveChanges();
        return conta;
    }

    private static RegistrarPagamentoRequest Pagamento(int valor, string forma = "Dinheiro", string? segunda = null, int segundoValor = 0) =>
        new() { ValorEmCentavos = valor, FormaPagamento = forma, SecondFormaPagamento = segunda, SecondValorEmCentavos = segundoValor };

    private static async Task<RegraException> Recusa(Func<Task> acao) =>
        (await acao.Should().ThrowAsync<RegraException>()).Which;

    [Fact]
    public async Task PagamentoParcial_BaixaOSaldo_SemQuitar()
    {
        var a = Criar();
        var conta = Conta(a.Db);

        var dto = await a.Contas.RegistrarPagamentoAsync(conta.Id, Pagamento(4000), Admin);

        dto.SaldoRestanteEmReais.Should().Be(60m);
        dto.Status.Should().Be("Aberto");
        dto.Pagamentos.Should().ContainSingle();
    }

    [Fact]
    public async Task PagamentoDoSaldoTodo_Quita_EAvisaPorEmail()
    {
        var a = Criar();
        var conta = Conta(a.Db);

        var dto = await a.Contas.RegistrarPagamentoAsync(conta.Id, Pagamento(10000), Admin);

        dto.Status.Should().Be("Pago");
        a.Email.Verify(e => e.SendCrediarioPagoAsync("pietro@t.com", "Pietro", 100m), Times.Once);
    }

    [Fact]
    public async Task Split_QuePassaDoSaldo_Recusa_ENaoLancaNada()
    {
        var a = Criar();
        var conta = Conta(a.Db, valor: 5000);

        var erro = await Recusa(() => a.Contas.RegistrarPagamentoAsync(conta.Id, Pagamento(5000, segunda: "Pix", segundoValor: 3000), Admin));

        erro.Mensagem.Should().Contain("Os dois pagamentos somam");
        (await a.Db.PagamentosCrediario.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task PagamentoMaiorQueOSaldo_Recusa()
    {
        var a = Criar();
        var conta = Conta(a.Db, valor: 5000, pago: 4000);

        (await Recusa(() => a.Contas.RegistrarPagamentoAsync(conta.Id, Pagamento(2000), Admin)))
            .Mensagem.Should().Contain("excede o saldo restante");
    }

    [Theory]
    [InlineData("Pontos")]
    [InlineData("Crediario")]
    [InlineData("Qualquer")]
    public async Task FormaQueNaoQuitaDivida_Recusa(string forma)
    {
        var a = Criar();
        var conta = Conta(a.Db);

        (await Recusa(() => a.Contas.RegistrarPagamentoAsync(conta.Id, Pagamento(1000, forma), Admin)))
            .Mensagem.Should().StartWith("Forma de pagamento inválida");
    }

    [Fact]
    public async Task ContaQuitada_NaoRecebeNemEdita()
    {
        var a = Criar();
        var conta = Conta(a.Db, valor: 1000, pago: 1000);

        (await Recusa(() => a.Contas.RegistrarPagamentoAsync(conta.Id, Pagamento(100), Admin))).Mensagem.Should().Be("Crediário já está quitado.");
        (await Recusa(() => a.Contas.EditarAsync(conta.Id, new EditarCrediarioRequest { Observacao = "x" }, Admin)))
            .Mensagem.Should().Be("Não é possível editar um crediário já quitado.");
    }

    [Fact]
    public async Task Editar_ValorAbaixoDoPago_EVencimentoNoPassado_Recusam()
    {
        var a = Criar();
        var conta = Conta(a.Db, valor: 10000, pago: 3000);

        (await Recusa(() => a.Contas.EditarAsync(conta.Id, new EditarCrediarioRequest { ValorEmCentavos = 2000 }, Admin)))
            .Mensagem.Should().Contain("não pode ser menor do que o valor já pago");
        (await Recusa(() => a.Contas.EditarAsync(conta.Id, new EditarCrediarioRequest { DataVencimento = DateTime.UtcNow.AddDays(-5) }, Admin)))
            .Mensagem.Should().Be("A data de vencimento não pode ser no passado.");
    }

    // Pedido do Maikon (29/10, conta do Pietro): o item adicionado na edição aparecia na lista,
    // mas o bloco "Itens adicionados na edição" valia R$ 0 — a conta não somava (v1.79.2).
    private static ItemCrediarioDto Item(string nome, decimal valor, Guid? lancamento = null) =>
        new() { LancamentoId = lancamento, ItemName = nome, Quantity = 1, UnitPriceInReais = valor, SubtotalInReais = valor };

    private static CrediarioLancamento CompraDe(AppDbContext db, Crediario conta, string nome, decimal valor)
    {
        var compra = new CrediarioLancamento
        {
            CrediarioId = conta.Id, Origem = CrediarioLancamentoOrigem.Manual, ValorEmCentavos = (int)(valor * 100),
            ItensJson = CrediarioLancamentos.SerializarItens([Item(nome, valor)]),
        };
        db.CrediarioLancamentos.Add(compra);
        db.SaveChanges();
        return compra;
    }

    [Fact]
    public async Task Editar_ItemNovo_EntraNoBlocoDeAjusteComOValorDele()
    {
        var a = Criar();
        var conta = Conta(a.Db, valor: 24850);
        var compra = CompraDe(a.Db, conta, "Booster", 248.50m);

        // A tela manda o total já somado (248,50 + 49,50) e a lista com o item novo
        await a.Contas.EditarAsync(conta.Id, new EditarCrediarioRequest
        {
            ValorEmCentavos = 29800,
            Itens = [Item("Booster", 248.50m, compra.Id), Item("Sleeve", 49.50m)],
        }, Admin);

        var salva = await a.Db.Crediarios.AsNoTracking().Include(c => c.Lancamentos).SingleAsync();
        salva.ValorEmCentavos.Should().Be(29800);
        salva.Lancamentos.Single(l => l.Origem == CrediarioLancamentoOrigem.Ajuste).ValorEmCentavos.Should().Be(4950,
            "o bloco vale o item que tem dentro — a soma das compras bate com o total da conta");
        salva.Lancamentos.Sum(l => l.ValorEmCentavos).Should().Be(salva.ValorEmCentavos);
    }

    [Fact]
    public async Task Editar_TirarOItemAdicionado_ZeraOBlocoDeAjuste()
    {
        var a = Criar();
        var conta = Conta(a.Db, valor: 24850);
        var compra = CompraDe(a.Db, conta, "Booster", 248.50m);
        await a.Contas.EditarAsync(conta.Id, new EditarCrediarioRequest
        {
            ValorEmCentavos = 29800, Itens = [Item("Booster", 248.50m, compra.Id), Item("Sleeve", 49.50m)],
        }, Admin);

        await a.Contas.EditarAsync(conta.Id, new EditarCrediarioRequest
        {
            ValorEmCentavos = 24850, Itens = [Item("Booster", 248.50m, compra.Id)],
        }, Admin);

        var salva = await a.Db.Crediarios.AsNoTracking().Include(c => c.Lancamentos).SingleAsync();
        salva.Lancamentos.Single(l => l.Origem == CrediarioLancamentoOrigem.Ajuste).ValorEmCentavos.Should().Be(0,
            "sem item dentro, o bloco não pode seguir cobrando o Sleeve");
        salva.Lancamentos.Sum(l => l.ValorEmCentavos).Should().Be(salva.ValorEmCentavos);
    }

    [Fact]
    public async Task Excluir_ComPagamento_Recusa_SemPagamento_Some()
    {
        var a = Criar();
        var comPagamento = Conta(a.Db, valor: 5000, pago: 1000);
        var semPagamento = Conta(a.Db, valor: 5000, email: "outro@t.com");

        (await Recusa(() => a.Contas.ExcluirAsync(comPagamento.Id, Admin))).Mensagem.Should().Contain("já possui");
        await a.Contas.ExcluirAsync(semPagamento.Id, Admin);

        (await a.Db.Crediarios.Select(c => c.Id).ToListAsync()).Should().Equal(comPagamento.Id);
    }

    [Fact]
    public async Task CriarManual_AbreAContaComUmLancamentoManual()
    {
        var a = Criar();
        var cliente = Conta(a.Db).UserId;

        var dto = await a.Contas.CriarManualAsync(new CriarCrediarioManualRequest { UserId = cliente, ValorEmCentavos = 2500 }, Admin);

        dto.ValorEmReais.Should().Be(25m);
        dto.Observacao.Should().Be("Dívida anterior ao sistema");
        dto.Lancamentos.Should().ContainSingle();
    }

    [Fact]
    public async Task ContaInexistente_404()
    {
        var a = Criar();

        (await Recusa(() => a.Contas.RegistrarPagamentoAsync(Guid.NewGuid(), Pagamento(100), Admin))).Status.Should().Be(404);
        (await Recusa(() => a.Contas.CriarManualAsync(new CriarCrediarioManualRequest { UserId = Guid.NewGuid(), ValorEmCentavos = 100 }, Admin)))
            .Mensagem.Should().Be("Cliente não encontrado.");
    }
}
