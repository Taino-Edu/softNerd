using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardGameStore.Tests.Services;

public class SefazNfeServiceTests
{
    [Fact]
    public async Task SincronizarAsync_ComCooldownAtivo_NaoConsultaSefazERetornaHorario()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AppDbContext(options);

        var proximaConsulta = DateTime.UtcNow.AddMinutes(30);
        db.FiscalConfigs.Add(new FiscalConfig
        {
            Id = FiscalConfig.SingletonId,
            Cnpj = "42989093000179",
            Uf = "SP",
            CertificadoPfxEncrypted = "configurado",
            DistProximaConsultaEm = proximaConsulta,
        });
        await db.SaveChangesAsync();

        var ambiente = new Mock<IWebHostEnvironment>();
        ambiente.SetupGet(x => x.EnvironmentName).Returns(Environments.Development);
        var encryption = new EncryptionService(new ConfigurationBuilder().Build(), ambiente.Object);
        var service = new SefazNfeService(db, encryption, NullLogger<SefazNfeService>.Instance);

        var resultado = await service.SincronizarAsync();

        resultado.Executado.Should().BeFalse();
        resultado.CooldownAtivo.Should().BeTrue();
        resultado.ProximaTentativaEm.Should().Be(proximaConsulta);
        resultado.Mensagem.Should().Contain("intervalo de segurança");
    }
}
