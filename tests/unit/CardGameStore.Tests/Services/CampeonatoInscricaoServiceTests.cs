// =============================================================================
// CampeonatoInscricaoServiceTests.cs — inscrição em campeonato e o Pix da entrada
// (Services/Campeonatos/CampeonatoInscricaoService.cs). SQLite em memória; o Inter
// é mock (CriarCobrancaAsync é virtual).
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Campeonatos;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace CardGameStore.Tests.Services;

public class CampeonatoInscricaoServiceTests
{
    private sealed class Amb
    {
        public required AppDbContext Db { get; init; }
        public required Mock<InterSyncService> Inter { get; init; }
        public required CampeonatoInscricaoService Inscricoes { get; init; }
        public required Mock<IEmailService> Email { get; init; }
        public required Mock<IPushService> Push { get; init; }

        public User Admin(string nome = "Maikon", string papel = UserRole.Admin)
        {
            var u = new User { Id = Guid.NewGuid(), Name = nome, Email = $"{Guid.NewGuid()}@t.com", PasswordHash = "x", Role = papel, IsActive = true };
            Db.Users.Add(u);
            Db.SaveChanges();
            return u;
        }

        public User Jogador(string nome = "Ana")
        {
            var u = new User { Id = Guid.NewGuid(), Name = nome, Email = $"{Guid.NewGuid()}@t.com", PasswordHash = "x", Role = UserRole.Customer };
            Db.Users.Add(u);
            Db.SaveChanges();
            return u;
        }

        public Championship Campeonato(int entradaEmCentavos = 0, int? vagas = null,
            ChampionshipStatus status = ChampionshipStatus.Inscricoes)
        {
            var ch = new Championship
            {
                Name = "Liguinha", Game = "Pokemon", StartDate = DateTime.UtcNow.AddDays(1), Status = status,
                EntryFeeInCents = entradaEmCentavos, MaxParticipants = vagas, MinutosParaPagar = 30,
            };
            Db.Championships.Add(ch);
            Db.SaveChanges();
            return ch;
        }

        public void ComPix()
        {
            Db.IntegrationConfigs.Add(new IntegrationConfig { Source = "inter" });
            Db.SaveChanges();
        }

        /// <summary>O Inter devolve uma cobrança nova a cada chamada (txid diferente).</summary>
        public void InterCobra() =>
            Inter.Setup(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()))
                .ReturnsAsync(() => new PixCobrancaResult
                {
                    TxId = Guid.NewGuid().ToString("N"), Status = "ATIVA", PixCopiaCola = "000201...",
                    ExpiraEm = DateTime.UtcNow.AddMinutes(30),
                });
    }

    private static Amb Criar()
    {
        var conexao = new SqliteConnection("Filename=:memory:");
        conexao.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conexao).Options);
        db.Database.EnsureCreated();

        var env = new Mock<IWebHostEnvironment>();
        env.Setup(e => e.EnvironmentName).Returns("Development");
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var inter = new Mock<InterSyncService>(new Mock<IServiceScopeFactory>().Object,
            new EncryptionService(config, env.Object), config, NullLogger<InterSyncService>.Instance);

        var email = new Mock<IEmailService>();
        var push  = new Mock<IPushService>();
        var servico = new CampeonatoInscricaoService(db, new ChampionshipService(db), inter.Object,
            new Mock<IPixReconciliationService>().Object, push.Object,
            NullLogger<CampeonatoInscricaoService>.Instance, email.Object);
        return new Amb { Db = db, Inter = inter, Inscricoes = servico, Email = email, Push = push };
    }

    private static async Task<RegraException> Recusa(Func<Task> acao) =>
        (await acao.Should().ThrowAsync<RegraException>()).Which;

    [Fact]
    public async Task Gratuito_EntraComVagaFirme_SemPix()
    {
        var a = Criar();
        var ch = a.Campeonato();
        var ana = a.Jogador();

        var (criada, inscricao) = await a.Inscricoes.InscreverAsync(ch.Id, ana.Id, null);

        criada.Should().BeTrue();
        inscricao.Pix.Should().BeNull();
        inscricao.Participant.InscricaoExpiraEm.Should().BeNull("gratuito não tem prazo de pagamento");
    }

    [Fact]
    public async Task Pago_SemPixConfigurado_NaoCriaAInscricao()
    {
        var a = Criar();
        var ch = a.Campeonato(entradaEmCentavos: 1000);

        var erro = await Recusa(() => a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null));

        erro.Status.Should().Be(400);
        (await a.Db.ChampionshipParticipants.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Pago_SeguraAVaga_EOPixReaproveitaNaSegundaVez()
    {
        var a = Criar();
        a.ComPix();
        a.InterCobra();
        var ch = a.Campeonato(entradaEmCentavos: 1000);
        var ana = a.Jogador();

        var (criada, primeira) = await a.Inscricoes.InscreverAsync(ch.Id, ana.Id, null);
        var (criadaDeNovo, segunda) = await a.Inscricoes.InscreverAsync(ch.Id, ana.Id, null);

        criada.Should().BeTrue();
        criadaDeNovo.Should().BeFalse("é a mesma inscrição, retomada");
        primeira.Participant.InscricaoExpiraEm.Should().NotBeNull("a vaga fica segurada até o Pix cair");
        segunda.Pix!.TxId.Should().Be(primeira.Pix!.TxId, "cobrança no prazo é reaproveitada — um QR só por inscrição");
        (await a.Db.PixCobrancas.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Pago_InterFalha_DesfazAInscricao()
    {
        var a = Criar();
        a.ComPix();
        a.Inter.Setup(i => i.CriarCobrancaAsync(It.IsAny<IntegrationConfig>(), It.IsAny<int>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()))
            .ReturnsAsync(new PixCobrancaResult { Error = "Inter fora do ar" });
        var ch = a.Campeonato(entradaEmCentavos: 1000);

        var erro = await Recusa(() => a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null));

        erro.Status.Should().Be(422);
        erro.Mensagem.Should().Contain("a inscrição não foi criada");
        (await a.Db.ChampionshipParticipants.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Lotado_RecusaInscricaoNova()
    {
        var a = Criar();
        var ch = a.Campeonato(vagas: 1);
        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador("Ana").Id, null);

        var erro = await Recusa(() => a.Inscricoes.InscreverAsync(ch.Id, a.Jogador("Beto").Id, null));

        erro.Mensagem.Should().Be("O campeonato atingiu o número máximo de participantes.");
    }

    [Fact]
    public async Task InscricoesFechadas_Recusa()
    {
        var a = Criar();
        var ch = a.Campeonato(status: ChampionshipStatus.Planejado);

        var erro = await Recusa(() => a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null));

        erro.Mensagem.Should().Be("As inscrições para este campeonato não estão abertas.");
    }

    [Fact]
    public async Task CampeonatoInexistente_404()
    {
        var a = Criar();

        (await Recusa(() => a.Inscricoes.InscreverAsync(Guid.NewGuid(), a.Jogador().Id, null))).Status.Should().Be(404);
    }

    [Fact]
    public async Task PagamentoNoBalcao_Desativado_EPixNaoSeDesmarca()
    {
        var a = Criar();
        var ch = a.Campeonato();
        var (_, inscricao) = await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null);
        var participante = await a.Db.ChampionshipParticipants.SingleAsync();
        participante.EntryFeePaidAt = DateTime.UtcNow;
        participante.EntryFeePaymentMethod = "Pix";
        await a.Db.SaveChangesAsync();

        (await Recusa(() => a.Inscricoes.MarcarPagamentoAsync(inscricao.Participant.Id, pago: true)))
            .Mensagem.Should().Contain("balcão foi desativado");
        (await Recusa(() => a.Inscricoes.MarcarPagamentoAsync(inscricao.Participant.Id, pago: false)))
            .Mensagem.Should().Be("Pagamento confirmado via Pix não pode ser desmarcado.");
    }

    [Fact]
    public async Task Participantes_TrazemOValorDaUltimaCobranca()
    {
        var a = Criar();
        a.ComPix();
        a.InterCobra();
        var ch = a.Campeonato(entradaEmCentavos: 1500);
        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null);

        var lista = await a.Inscricoes.ParticipantesAsync(ch.Id);

        var ana = lista.Should().ContainSingle().Subject;
        ana.ValorInscricaoEmCentavos.Should().Be(1500);
        ana.CobrancaEmAberto.Should().BeTrue();
        ana.UserName.Should().Be("Ana");
    }

    // ── v1.98.0 (chave comprovante-inscricao): comprovante e cobrança por e-mail ──

    private static void Chave(Amb a, bool ligada)
    {
        a.Db.FuncionalidadesEstado.Add(new FuncionalidadeEstado { Codigo = CardGameStore.Configuration.Funcionalidades.ComprovanteInscricao, Ligada = ligada });
        a.Db.SaveChanges();
    }

    [Fact]
    public async Task Gratuito_MandaOComprovante_ComDataDeBrasiliaENomeDaLoja()
    {
        var a = Criar();
        var ch = a.Campeonato();
        ch.StartDate = new DateTime(2026, 11, 28, 22, 30, 0, DateTimeKind.Utc); // 19h30 em Brasília
        a.Db.SaveChanges();
        var ana = a.Jogador();

        var (_, inscricao) = await a.Inscricoes.InscreverAsync(ch.Id, ana.Id, null);
        var codigo = inscricao.Participant.Id.ToString("N").Substring(0, 8).ToUpperInvariant();

        a.Email.Verify(e => e.SendComprovanteInscricaoAsync(ana.Email!, It.Is<ComprovanteInscricaoEmail>(c =>
            c.Loja == "Santuário Nerd" && c.Jogador == "Ana" && c.Campeonato == "Liguinha" &&
            c.DataDoCampeonato == "28/11/2026 às 19:30" && c.NumeroDoJogador == 1 && c.Valor == null &&
            c.Codigo == codigo)), Times.Once);
    }

    [Fact]
    public async Task Gratuito_ChaveDesligada_NaoMandaEmail()
    {
        var a = Criar();
        Chave(a, ligada: false);
        var ch = a.Campeonato();

        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null);

        a.Email.Verify(e => e.SendComprovanteInscricaoAsync(It.IsAny<string>(), It.IsAny<ComprovanteInscricaoEmail>()), Times.Never);
    }

    [Fact]
    public async Task Gratuito_ClienteDesligouOsEmails_NaoMandaEmail()
    {
        var a = Criar();
        var ch = a.Campeonato();
        var ana = a.Jogador();
        ana.PreferencesJson = """{"notifications":{"emailsInscricao":false}}""";
        a.Db.SaveChanges();

        await a.Inscricoes.InscreverAsync(ch.Id, ana.Id, null);

        a.Email.Verify(e => e.SendComprovanteInscricaoAsync(It.IsAny<string>(), It.IsAny<ComprovanteInscricaoEmail>()), Times.Never);
    }

    [Fact]
    public async Task Pago_VagaAindaSegurada_NaoMandaComprovanteNemCobranca()
    {
        // Quem se inscreve pelo site já está com o Pix na tela: o comprovante só sai quando o Pix cair.
        var a = Criar();
        a.ComPix();
        a.InterCobra();
        var ch = a.Campeonato(entradaEmCentavos: 1000);

        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null);

        a.Email.Verify(e => e.SendComprovanteInscricaoAsync(It.IsAny<string>(), It.IsAny<ComprovanteInscricaoEmail>()), Times.Never);
        a.Email.Verify(e => e.SendCobrancaInscricaoAsync(It.IsAny<string>(), It.IsAny<CobrancaInscricaoEmail>()), Times.Never);
    }

    [Fact]
    public async Task LojaInscreveNoPago_MandaCobrancaSoComOBotaoProSite()
    {
        var a = Criar();
        a.ComPix();
        a.InterCobra();
        var ch = a.Campeonato(entradaEmCentavos: 2500);
        var ana = a.Jogador();

        await a.Inscricoes.InscreverPeloAdminAsync(ch.Id, new AdminRegisterRequest { UserId = ana.Id }, Guid.NewGuid());

        a.Email.Verify(e => e.SendCobrancaInscricaoAsync(ana.Email!, It.Is<CobrancaInscricaoEmail>(c =>
            c.Link == $"/cliente?pagarInscricao={ch.Id}" && c.Valor == "R$ 25,00" && c.PrazoDaVaga != null)), Times.Once);
        a.Email.Verify(e => e.SendComprovanteInscricaoAsync(It.IsAny<string>(), It.IsAny<ComprovanteInscricaoEmail>()), Times.Never);
    }

    // ── Aviso pra loja (chave "aviso-inscricao-loja") ─────────────────────────

    [Fact]
    public async Task Gratuito_PeloSite_AvisaALoja_ComNumeroEVagas()
    {
        var a = Criar();
        var dono = a.Admin();
        var ch = a.Campeonato(vagas: 8);

        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador("Ana").Id, null);

        var aviso = await a.Db.Notifications.SingleAsync(n => n.UserId == dono.Id);
        aviso.Title.Should().Be("Inscrição nova: Ana");
        aviso.Body.Should().Be("Ana se inscreveu no Liguinha pelo site. Jogador #1 — 1 de 8 vagas.");
        aviso.Link.Should().Be($"/admin/campeonatos/{ch.Id}");
        a.Push.Verify(p => p.SendToManyAsync(It.Is<IEnumerable<Guid>>(ids => ids.Contains(dono.Id)),
            "Inscrição nova: Ana", It.IsAny<string>(), $"/admin/campeonatos/{ch.Id}", It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task Gratuito_ChaveDoAvisoDesligada_NaoAvisaALoja()
    {
        var a = Criar();
        a.Db.FuncionalidadesEstado.Add(new FuncionalidadeEstado { Codigo = CardGameStore.Configuration.Funcionalidades.AvisoInscricaoLoja, Ligada = false });
        a.Db.SaveChanges();
        var dono = a.Admin();
        var ch = a.Campeonato();

        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null);

        (await a.Db.Notifications.CountAsync(n => n.UserId == dono.Id)).Should().Be(0);
    }

    [Fact]
    public async Task Pago_VagaAindaSegurada_NaoAvisaALoja()
    {
        // Muitas vagas seguradas vencem sem pagar: o aviso só sai quando o Pix cair
        var a = Criar();
        a.ComPix();
        a.InterCobra();
        var dono = a.Admin();
        var ch = a.Campeonato(entradaEmCentavos: 1000);

        await a.Inscricoes.InscreverAsync(ch.Id, a.Jogador().Id, null);

        (await a.Db.Notifications.CountAsync(n => n.UserId == dono.Id)).Should().Be(0);
    }

    [Fact]
    public async Task LojaInscreveNoGratuito_NaoAvisaALoja()
    {
        var a = Criar();
        var dono = a.Admin();
        var ch = a.Campeonato();

        await a.Inscricoes.InscreverPeloAdminAsync(ch.Id, new AdminRegisterRequest { UserId = a.Jogador().Id }, dono.Id);

        (await a.Db.Notifications.CountAsync(n => n.UserId == dono.Id)).Should().Be(0);
    }

    [Fact]
    public void Vagas_ComESemLimite()
    {
        AvisoDaInscricaoPraLoja.Vagas(3, 16).Should().Be("3 de 16 vagas");
        AvisoDaInscricaoPraLoja.Vagas(1, null).Should().Be("1 inscrito");
        AvisoDaInscricaoPraLoja.Vagas(5, null).Should().Be("5 inscritos");
    }

    [Fact]
    public void DataHora_UsaOFusoDeBrasilia()
    {
        EmailDaInscricao.DataHora(new DateTime(2026, 11, 25, 2, 15, 0, DateTimeKind.Utc)).Should().Be("24/11/2026 às 23:15");
    }
}
