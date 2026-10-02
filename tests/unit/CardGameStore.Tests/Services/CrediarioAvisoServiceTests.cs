// =============================================================================
// CrediarioAvisoServiceTests.cs — Lembretes de vencimento do crediário
// =============================================================================

using System.Text.Json;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class CrediarioAvisoServiceTests
{
    // 10/10/2026 às 11h em Brasília (14h UTC) — depois da hora padrão de envio (10h)
    private static readonly DateTime Agora = new(2026, 10, 10, 14, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Hoje  = new(2026, 10, 10);

    private static AppDbContext CreateDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        return db;
    }

    private sealed record Ambiente(
        AppDbContext Db, CrediarioAvisoService Service,
        Mock<IEmailService> Email, Mock<IPushService> Push, Mock<IWhatsAppGateway> WhatsApp);

    private static Ambiente Criar(Action<CrediarioAvisoConfig>? config = null)
    {
        var db = CreateDb();
        var cfg = new CrediarioAvisoConfig { CanalWhatsApp = true };
        config?.Invoke(cfg);
        db.CrediarioAvisoConfigs.Add(cfg);
        db.SaveChanges();

        var email = new Mock<IEmailService>();
        var push  = new Mock<IPushService>();
        var wpp   = new Mock<IWhatsAppGateway>();
        wpp.Setup(w => w.SendTextAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
           .ReturnsAsync(new WhatsAppGatewaySendResult(true, "msg-1"));

        var service = new CrediarioAvisoService(db, email.Object, push.Object, wpp.Object,
            NullLogger<CrediarioAvisoService>.Instance);
        return new(db, service, email, push, wpp);
    }

    private static User NovoCliente(AppDbContext db, string nome = "Pietro Souza")
    {
        var user = new User
        {
            Id = Guid.NewGuid(), Name = nome, Email = $"{Guid.NewGuid():N}@test.com",
            WhatsApp = "17999990000", PasswordHash = "h", Role = UserRole.Customer,
        };
        db.Users.Add(user);
        return user;
    }

    private static Crediario NovaConta(AppDbContext db, User user, DateTime vencimentoDia, int valor = 10000, int pago = 0)
    {
        var c = new Crediario
        {
            UserId              = user.Id,
            ValorEmCentavos     = valor,
            ValorPagoEmCentavos = pago,
            DataVencimento      = CrediarioLancamentos.VencimentoFimDoDia(vencimentoDia),
        };
        db.Crediarios.Add(c);
        return c;
    }

    [Fact]
    public async Task Rodada_ContaNoMarcoDeHoje_AvisaPorTodosOsCanaisUmaVezSo()
    {
        var a    = Criar();
        var user = NovoCliente(a.Db);
        var conta = NovaConta(a.Db, user, Hoje.AddDays(3)); // marco -3
        await a.Db.SaveChangesAsync();

        var r1 = await a.Service.ExecutarRodadaAsync(Agora);
        var r2 = await a.Service.ExecutarRodadaAsync(Agora.AddMinutes(30));

        r1.ClientesAvisados.Should().Be(1);
        r2.ClientesAvisados.Should().Be(0, "o mesmo marco não pode sair duas vezes");

        var aviso = await a.Db.CrediarioAvisos.SingleAsync(x => x.CrediarioId == conta.Id);
        aviso.Marco.Should().Be(-3);
        aviso.Canais.Should().Be("app,email,whatsapp");

        a.Email.Verify(e => e.SendCrediarioLembreteAsync(user.Email!, user.Name, It.IsAny<string>(),
            It.Is<string>(t => t.Contains("vence em 3 dias"))), Times.Once);
        a.WhatsApp.Verify(w => w.SendTextAsync("17999990000", It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        (await a.Db.Notifications.CountAsync(n => n.UserId == user.Id)).Should().Be(1);
    }

    [Fact]
    public async Task Rodada_ForaDoMarco_NaoAvisa()
    {
        var a    = Criar();
        var user = NovoCliente(a.Db);
        NovaConta(a.Db, user, Hoje.AddDays(5)); // -5 não está nos marcos padrão
        NovaConta(a.Db, user, Hoje.AddDays(-2)); // +2 também não
        await a.Db.SaveChangesAsync();

        var r = await a.Service.ExecutarRodadaAsync(Agora);

        r.ClientesAvisados.Should().Be(0);
        (await a.Db.CrediarioAvisos.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Rodada_AntesDaHoraDeEnvio_NaoAvisa()
    {
        var a    = Criar();
        var user = NovoCliente(a.Db);
        NovaConta(a.Db, user, Hoje); // vence hoje
        await a.Db.SaveChangesAsync();

        // 08h em Brasília
        var r = await a.Service.ExecutarRodadaAsync(new DateTime(2026, 10, 10, 11, 0, 0, DateTimeKind.Utc));

        r.ClientesAvisados.Should().Be(0);
    }

    [Fact]
    public async Task Rodada_Desligado_NaoAvisa()
    {
        var a    = Criar(c => c.Ativo = false);
        var user = NovoCliente(a.Db);
        NovaConta(a.Db, user, Hoje);
        await a.Db.SaveChangesAsync();

        (await a.Service.ExecutarRodadaAsync(Agora)).ClientesAvisados.Should().Be(0);
    }

    [Fact]
    public async Task Rodada_DuasContasDoMesmoCliente_UmaMensagemSoComTotal()
    {
        var a    = Criar();
        var user = NovoCliente(a.Db);
        NovaConta(a.Db, user, Hoje, valor: 5000);              // vence hoje
        NovaConta(a.Db, user, Hoje.AddDays(-7), valor: 3000);  // 7 dias de atraso
        await a.Db.SaveChangesAsync();

        var r = await a.Service.ExecutarRodadaAsync(Agora);

        r.ClientesAvisados.Should().Be(1);
        r.ContasAvisadas.Should().Be(2);
        a.WhatsApp.Verify(w => w.SendTextAsync(It.IsAny<string>(),
            It.Is<string>(t => t.Contains("vence hoje") && t.Contains("7 dias de atraso") && t.Contains("Total em aberto: R$ 80,00")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Rodada_VencimentoProrrogado_MarcoValeDeNovo()
    {
        var a    = Criar();
        var user = NovoCliente(a.Db);
        var conta = NovaConta(a.Db, user, Hoje); // vence hoje
        await a.Db.SaveChangesAsync();
        await a.Service.ExecutarRodadaAsync(Agora);

        // Admin prorrogou pra daqui 3 dias e depois de 3 dias o "vence hoje" tem que sair de novo
        conta.DataVencimento = CrediarioLancamentos.VencimentoFimDoDia(Hoje.AddDays(3));
        await a.Db.SaveChangesAsync();
        var r = await a.Service.ExecutarRodadaAsync(Agora.AddDays(3));

        r.ClientesAvisados.Should().Be(1);
        (await a.Db.CrediarioAvisos.CountAsync(x => x.CrediarioId == conta.Id && x.Marco == 0)).Should().Be(2);
    }

    [Fact]
    public async Task Rodada_WhatsAppFalha_RegistraFalhaEMantemOsOutrosCanais()
    {
        var a = Criar();
        a.WhatsApp.Setup(w => w.SendTextAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                  .ReturnsAsync(new WhatsAppGatewaySendResult(false, Error: "desconectado"));
        var user = NovoCliente(a.Db);
        var conta = NovaConta(a.Db, user, Hoje);
        await a.Db.SaveChangesAsync();

        await a.Service.ExecutarRodadaAsync(Agora);

        var aviso = await a.Db.CrediarioAvisos.SingleAsync(x => x.CrediarioId == conta.Id);
        aviso.Canais.Should().Be("app,email");
        aviso.Falhas.Should().Contain("whatsapp: desconectado");
    }

    [Fact]
    public async Task Rodada_ResumoDoAdmin_SaiUmaVezPorDia()
    {
        var a     = Criar();
        var admin = new User { Id = Guid.NewGuid(), Name = "Maikon", PasswordHash = "h", Role = UserRole.Admin };
        a.Db.Users.Add(admin);
        var user  = NovoCliente(a.Db);
        NovaConta(a.Db, user, Hoje.AddDays(-10)); // atrasada, fora de marco
        await a.Db.SaveChangesAsync();

        var r1 = await a.Service.ExecutarRodadaAsync(Agora);
        var r2 = await a.Service.ExecutarRodadaAsync(Agora.AddHours(1));

        r1.ResumoEnviado.Should().BeTrue();
        r2.ResumoEnviado.Should().BeFalse();
        var notif = await a.Db.Notifications.SingleAsync(n => n.UserId == admin.Id);
        notif.Body.Should().Contain("1 em atraso");
    }

    [Fact]
    public async Task AvisarAgora_RegistraAvisoManual()
    {
        var a     = Criar();
        var user  = NovoCliente(a.Db);
        var conta = NovaConta(a.Db, user, Hoje.AddDays(20));
        await a.Db.SaveChangesAsync();
        var adminId = Guid.NewGuid();

        var envio = await a.Service.AvisarAgoraAsync(conta.Id, adminId);

        envio.Canais.Should().Contain("whatsapp");
        var aviso = await a.Db.CrediarioAvisos.SingleAsync(x => x.CrediarioId == conta.Id);
        aviso.Marco.Should().BeNull();
        aviso.EnviadoPorAdminId.Should().Be(adminId);
    }

    [Fact]
    public async Task Rodada_ClienteJaAvisadoAMaoHoje_NaoRecebeDeNovo()
    {
        var a     = Criar();
        var user  = NovoCliente(a.Db);
        var conta = NovaConta(a.Db, user, Hoje); // vence hoje
        a.Db.CrediarioAvisos.Add(new CrediarioAviso
        {
            CrediarioId          = conta.Id,
            VencimentoReferencia = conta.DataVencimento,
            Canais               = "whatsapp",
            EnviadoPorAdminId    = Guid.NewGuid(),
            EnviadoEm            = Agora.AddHours(-1),
        });
        await a.Db.SaveChangesAsync();

        var r = await a.Service.ExecutarRodadaAsync(Agora);

        r.ClientesAvisados.Should().Be(0);
        a.WhatsApp.Verify(w => w.SendTextAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        var marco = await a.Db.CrediarioAvisos.SingleAsync(x => x.CrediarioId == conta.Id && x.Marco == 0);
        marco.Falhas.Should().Contain("já foi avisado hoje", "o marco fica cumprido pra não sair mais tarde");
    }

    [Fact]
    public void LerMarcos_JsonInvalido_DevolveVazio()
    {
        CrediarioAvisoService.LerMarcos("lixo").Should().BeEmpty();
        CrediarioAvisoService.LerMarcos(JsonSerializer.Serialize(new[] { 7, -3, 0, 7 }))
            .Should().Equal(-3, 0, 7);
    }
}
