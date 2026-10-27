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

        var servico = new CampeonatoInscricaoService(db, new ChampionshipService(db), inter.Object,
            new Mock<IPixReconciliationService>().Object, new Mock<IPushService>().Object,
            NullLogger<CampeonatoInscricaoService>.Instance);
        return new Amb { Db = db, Inter = inter, Inscricoes = servico };
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
}
