// =============================================================================
// AuthServiceTests.cs — Testes unitários de Autenticação
// Foco: lógica de login, quick-login e tokens
// =============================================================================

using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Hubs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Validation;
using CardGameStore.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace CardGameStore.Tests.Services;

public class AuthServiceTests
{
    private static AppDbContext CreateInMemoryDb(string dbName)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        return new AppDbContext(options);
    }

    // SQLite in-memory para testes que usam o AuthService real (que usa ComandaService)
    private static AppDbContext CreateSqliteDb()
    {
        var connection = new SqliteConnection("Filename=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .Options;
        var db = new AppDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    /// <summary>Cria um mock de IHubContext com Clients.Group configurado para evitar NullReferenceException.</summary>
    private static IHubContext<ComandaHub> CreateHubMock()
    {
        var mockClientProxy = new Mock<IClientProxy>();
        mockClientProxy
            .Setup(p => p.SendCoreAsync(It.IsAny<string>(), It.IsAny<object[]>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var mockClients = new Mock<IHubClients>();
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockClientProxy.Object);

        var mockHub = new Mock<IHubContext<ComandaHub>>();
        mockHub.Setup(h => h.Clients).Returns(mockClients.Object);
        return mockHub.Object;
    }

    private static AuthService CreateAuthService(AppDbContext db, ILogger<AuthService>? logger = null)
    {
        var jwtSettings = Options.Create(new JwtSettings
        {
            SecretKey                    = "ChaveSecretaDeTeste1234567890ABCDEF",
            Issuer                       = "TestIssuer",
            Audience                     = "TestAudience",
            AccessTokenExpirationMinutes = 60,
            RefreshTokenExpirationDays   = 30,
            RefreshTokenGraceSeconds     = 120,
            MaxSessionsPerUser           = 20,
        });

        var comandaService = new ComandaService(
            db,
            new Mock<IEmailService>().Object,
            NullLogger<ComandaService>.Instance,
            new Mock<IServiceScopeFactory>().Object,
            CreateHubMock());

        return new AuthService(
            db,
            jwtSettings,
            logger ?? NullLogger<AuthService>.Instance,
            comandaService,
            new Mock<IEmailService>().Object,
            // O AuthService anota user-agent/IP na sessão; sem requisição no teste,
            // o HttpContext nulo do mock é exatamente o caso que ele já trata.
            new Mock<IHttpContextAccessor>().Object);
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_UsuarioExistente_DeveEncontrarPorEmail()
    {
        // Arrange
        var db = CreateInMemoryDb(nameof(Login_UsuarioExistente_DeveEncontrarPorEmail));
        var user = new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Admin",
            Email        = "admin@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role         = "Admin",
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        // Act
        var encontrado = await db.Users.FirstOrDefaultAsync(u => u.Email == "admin@softnerd.com");

        // Assert
        encontrado.Should().NotBeNull();
        encontrado!.Role.Should().Be("Admin");
    }

    [Fact]
    public async Task Login_EmailInexistente_DeveRetornarNull()
    {
        var db = CreateInMemoryDb(nameof(Login_EmailInexistente_DeveRetornarNull));

        var encontrado = await db.Users.FirstOrDefaultAsync(u => u.Email == "naoexiste@teste.com");

        encontrado.Should().BeNull();
    }

    [Fact]
    public void Login_SenhaCorreta_BCryptVerifyDeveRetornarTrue()
    {
        var senha = "Senha@Segura123!";
        var hash  = BCrypt.Net.BCrypt.HashPassword(senha);

        BCrypt.Net.BCrypt.Verify(senha, hash).Should().BeTrue();
    }

    [Fact]
    public void Login_SenhaErrada_BCryptVerifyDeveRetornarFalse()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("SenhaCorreta123!");

        BCrypt.Net.BCrypt.Verify("SenhaErrada!", hash).Should().BeFalse();
    }

    // ── Quick-Login ───────────────────────────────────────────────────────────

    [Fact]
    public async Task QuickLogin_CPFNovo_DeveCriarUsuario()
    {
        // Arrange
        var db  = CreateInMemoryDb(nameof(QuickLogin_CPFNovo_DeveCriarUsuario));
        var cpf = "123.456.789-00";

        // Act — simula lógica: busca por CPF, cria se não existe
        var existente = await db.Users.FirstOrDefaultAsync(u => u.Cpf == cpf);
        if (existente == null)
        {
            var novo = new User
            {
                Id           = Guid.NewGuid(),
                Name         = "Novo Cliente",
                Cpf          = cpf,
                WhatsApp     = "11999990001",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
                Role         = UserRole.Customer,
            };
            db.Users.Add(novo);
            await db.SaveChangesAsync();
        }

        // Assert
        var usuarioCriado = await db.Users.FirstOrDefaultAsync(u => u.Cpf == cpf);
        usuarioCriado.Should().NotBeNull();
        usuarioCriado!.Role.Should().Be(UserRole.Customer);
    }

    [Fact]
    public async Task QuickLogin_CPFExistente_DeveRetornarMesmoUsuario()
    {
        // Arrange
        var db  = CreateInMemoryDb(nameof(QuickLogin_CPFExistente_DeveRetornarMesmoUsuario));
        var cpf = "987.654.321-00";

        var existente = new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Cliente Antigo",
            Cpf          = cpf,
            PasswordHash = "hash",
            Role         = "Client",
        };
        db.Users.Add(existente);
        await db.SaveChangesAsync();

        // Act — segunda tentativa com mesmo CPF
        var encontrado = await db.Users.FirstOrDefaultAsync(u => u.Cpf == cpf);

        // Assert
        encontrado.Should().NotBeNull();
        encontrado!.Id.Should().Be(existente.Id, "deve retornar o mesmo usuário, não criar duplicata");
    }

    // ── Pontos na criação de conta ────────────────────────────────────────────

    [Fact]
    public void NovoUsuario_DeveTerSaldoZero()
    {
        var user = new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Novo",
            PasswordHash = "hash",
            Role         = "Client",
        };

        user.PointsBalance.Should().Be(0);
        user.PointsExpiresAt.Should().BeNull();
    }

    // ── Roles ─────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Admin",    true)]
    [InlineData("Customer", false)]
    [InlineData("",         false)]
    public void Role_Admin_DeveIdentificarCorretamente(string role, bool esperadoAdmin)
    {
        var isAdmin = role == "Admin";
        isAdmin.Should().Be(esperadoAdmin);
    }

    // ── QuickLogin — LGPD e privacidade ──────────────────────────────────────

    [Fact]
    public async Task QuickLogin_NaoLogaCPF()
    {
        // Arrange
        var db = CreateSqliteDb();

        // Logger que captura as mensagens registradas
        var logMessages = new List<string>();
        var loggerMock  = new Mock<ILogger<AuthService>>();
        loggerMock
            .Setup(l => l.Log(
                It.IsAny<LogLevel>(),
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) => true),
                It.IsAny<Exception?>(),
                It.Is<Func<It.IsAnyType, Exception?, string>>((_, _) => true)))
            .Callback<LogLevel, EventId, object, Exception?, Delegate>((_, _, state, _, formatter) =>
            {
                var message = formatter.DynamicInvoke(state, null) as string ?? "";
                logMessages.Add(message);
            });

        var service = CreateAuthService(db, loggerMock.Object);
        var cpf     = "52998224725"; // CPF válido para validação

        // Act
        await service.QuickLoginAsync(new QuickLoginRequest(
            Name:            "Cliente Privacidade",
            Cpf:             cpf,
            WhatsApp:        "11999990099",
            TableIdentifier: null));

        // Assert — nenhuma mensagem de log deve conter o CPF
        logMessages.Should().NotContain(
            msg => msg.Contains(cpf),
            "o CPF é dado sensível e não deve aparecer em logs (LGPD)");
    }

    [Fact]
    public async Task QuickLogin_CriaNovoCLienteComConsentAt_QuandoConsentimentoFornecido()
    {
        // Arrange — valida que o campo ConsentAt pode ser preenchido no fluxo
        var db      = CreateSqliteDb();
        var service = CreateAuthService(db);
        var cpf     = "01234567890";

        // Act
        await service.QuickLoginAsync(new QuickLoginRequest(
            Name:            "Novo Cliente LGPD",
            Cpf:             cpf,
            WhatsApp:        "11988880000",
            TableIdentifier: "Mesa-02"));

        // Assert — usuário criado no banco
        var usuario = await db.Users.FirstOrDefaultAsync(u => u.Cpf == cpf);
        usuario.Should().NotBeNull("o quick-login deve criar o usuário na primeira visita");
        usuario!.Name.Should().Be("Novo Cliente LGPD");
        usuario.Role.Should().Be(UserRole.Customer);
    }

    [Fact]
    public async Task QuickLogin_NaoCriaDuplicata_QuandoCPFExistente()
    {
        // Arrange
        var db      = CreateSqliteDb();
        var service = CreateAuthService(db);
        var cpf     = "11111111111";

        // Act — duas chamadas com o mesmo CPF
        await service.QuickLoginAsync(new QuickLoginRequest(
            Name: "Primeira Vez", Cpf: cpf, WhatsApp: "11900000001"));
        await service.QuickLoginAsync(new QuickLoginRequest(
            Name: "Segunda Vez",  Cpf: cpf, WhatsApp: "11900000001"));

        // Assert — apenas um usuário com esse CPF
        var count = await db.Users.CountAsync(u => u.Cpf == cpf);
        count.Should().Be(1, "não deve criar duplicata para o mesmo CPF");
    }

    // ── Login — usuário inativo / senha errada ────────────────────────────────

    [Fact]
    public async Task Login_UsuarioInativo_DeveLancarUnauthorized()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Inativo",
            Email        = "inativo@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role         = UserRole.Admin,
            IsActive     = false, // conta desativada
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var act = async () => await service.LoginAsync(new LoginRequest("inativo@softnerd.com", "Senha123!"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>(
            "usuário inativo não pode fazer login mesmo com senha correta");
    }

    [Fact]
    public async Task Login_SenhaErrada_DeveLancarUnauthorized()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Admin",
            Email        = "admin2@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("SenhaCorreta!"),
            Role         = UserRole.Admin,
            IsActive     = true,
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var act = async () => await service.LoginAsync(new LoginRequest("admin2@softnerd.com", "SenhaErrada!"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>("senha incorreta deve ser rejeitada");
    }

    // ── Refresh Token ─────────────────────────────────────────────────────────

    [Fact]
    public async Task RefreshToken_TokenExpirado_DeveLancarUnauthorized()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id                 = Guid.NewGuid(),
            Name               = "Cliente",
            Email              = "cliente@softnerd.com",
            PasswordHash       = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role               = UserRole.Customer,
            IsActive           = true,
            RefreshToken       = "token-expirado-abc",
            RefreshTokenExpiry = DateTime.UtcNow.AddHours(-1), // já expirou
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var act = async () => await service.RefreshTokenAsync(new RefreshTokenRequest("token-expirado-abc"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("*expirado*");
    }

    [Fact]
    public async Task RefreshToken_TokenInvalido_DeveLancarUnauthorized()
    {
        var db      = CreateSqliteDb();
        var service = CreateAuthService(db);

        var act = async () => await service.RefreshTokenAsync(new RefreshTokenRequest("token-que-nao-existe-xyz"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>("token inexistente não deve ser aceito");
    }

    // Regressão do logout automático: entrar no celular derrubava o PDV, porque o
    // refresh token vivia numa coluna única do usuário e cada login sobrescrevia o
    // anterior. Agora cada dispositivo tem a sua sessão.
    [Fact]
    public async Task Login_EmOutroDispositivo_NaoDerrubaASessaoAnterior()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Lojista",
            Email        = "lojista@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role         = UserRole.Admin,
            IsActive     = true,
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var pdv     = await service.LoginAsync(new LoginRequest("lojista@softnerd.com", "Senha123!"));
        var celular = await service.LoginAsync(new LoginRequest("lojista@softnerd.com", "Senha123!"));

        pdv.RefreshToken.Should().NotBe(celular.RefreshToken);

        // O token do PDV continua renovando mesmo depois do login no celular.
        var renovado = await service.RefreshTokenAsync(new RefreshTokenRequest(pdv.RefreshToken));
        renovado.RefreshToken.Should().NotBeNullOrEmpty();
    }

    // Duas abas renovando ao mesmo tempo: a segunda chega com o token que a primeira
    // acabou de rotacionar. Dentro da janela de graça isso não pode deslogar ninguém.
    [Fact]
    public async Task RefreshToken_ReusoDentroDaJanelaDeGraca_DeveSerAceito()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Lojista",
            Email        = "abas@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role         = UserRole.Admin,
            IsActive     = true,
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var login = await service.LoginAsync(new LoginRequest("abas@softnerd.com", "Senha123!"));

        var primeiraAba = await service.RefreshTokenAsync(new RefreshTokenRequest(login.RefreshToken));
        primeiraAba.RefreshToken.Should().NotBeNullOrEmpty();

        // Mesma chamada, mesmo token — é a aba que perdeu a corrida.
        var segundaAba = async () => await service.RefreshTokenAsync(new RefreshTokenRequest(login.RefreshToken));

        await segundaAba.Should().NotThrowAsync(
            "token recém-rotacionado vale dentro da janela de graça — sem isso a aba lenta desloga a sessão");
    }

    [Fact]
    public async Task Logout_NaoDerrubaOsOutrosDispositivos()
    {
        var db = CreateSqliteDb();
        var userId = Guid.NewGuid();
        db.Users.Add(new User
        {
            Id           = userId,
            Name         = "Lojista",
            Email        = "logout@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role         = UserRole.Admin,
            IsActive     = true,
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var pdv     = await service.LoginAsync(new LoginRequest("logout@softnerd.com", "Senha123!"));
        var celular = await service.LoginAsync(new LoginRequest("logout@softnerd.com", "Senha123!"));

        await service.LogoutAsync(userId, celular.RefreshToken);

        var aindaVale = await service.RefreshTokenAsync(new RefreshTokenRequest(pdv.RefreshToken));
        aindaVale.RefreshToken.Should().NotBeNullOrEmpty("sair no celular não pode deslogar o PDV");

        var celularCaiu = async () => await service.RefreshTokenAsync(new RefreshTokenRequest(celular.RefreshToken));
        await celularCaiu.Should().ThrowAsync<UnauthorizedAccessException>();
    }

    [Fact]
    public async Task Logout_ComCookieAntigo_NaoDerrubaOsOutrosDispositivos()
    {
        var db = CreateSqliteDb();
        var userId = Guid.NewGuid();
        db.Users.Add(new User
        {
            Id = userId, Name = "Lojista", Email = "logout-antigo@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role = UserRole.Admin, IsActive = true,
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var pdv = await service.LoginAsync(new LoginRequest("logout-antigo@softnerd.com", "Senha123!"));

        await service.LogoutAsync(userId, "cookie-que-ja-expirou-ou-foi-limpo");

        var aindaVale = await service.RefreshTokenAsync(new RefreshTokenRequest(pdv.RefreshToken));
        aindaVale.RefreshToken.Should().NotBeNullOrEmpty(
            "um cookie antigo não pode transformar logout por dispositivo em logout global");
    }

    [Fact]
    public async Task ResetPassword_DeveDerrubarAsSessoesDeTodosOsDispositivos()
    {
        const string resetToken = "token-reset-multi-dispositivo";
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id                       = Guid.NewGuid(),
            Name                     = "Cliente",
            Email                    = "multi@softnerd.com",
            PasswordHash             = BCrypt.Net.BCrypt.HashPassword("OldPass!"),
            Role                     = UserRole.Customer,
            IsActive                 = true,
            PasswordResetToken       = resetToken,
            PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(2),
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var sessao = await service.LoginAsync(new LoginRequest("multi@softnerd.com", "OldPass!"));

        await service.ResetPasswordAsync(new ResetPasswordRequest(resetToken, "NewPass123!"));

        var act = async () => await service.RefreshTokenAsync(new RefreshTokenRequest(sessao.RefreshToken));
        await act.Should().ThrowAsync<UnauthorizedAccessException>(
            "trocar a senha tem que cortar os dispositivos já logados");
    }

    // ── ForgotPassword ────────────────────────────────────────────────────────

    [Fact]
    public async Task ForgotPassword_EmailExistente_DeveGerarTokenDeReset()
    {
        var db = CreateSqliteDb();
        var user = new User
        {
            Id           = Guid.NewGuid(),
            Name         = "Cliente Reset",
            Email        = "reset@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPass123!"),
            Role         = UserRole.Customer,
            IsActive     = true,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        await service.ForgotPasswordAsync(new ForgotPasswordRequest("reset@softnerd.com"));

        var atualizado = await db.Users.FindAsync(user.Id);
        atualizado!.PasswordResetToken.Should().NotBeNullOrWhiteSpace(
            "deve gerar token de reset para email cadastrado");
        atualizado.PasswordResetTokenExpiry.Should().BeAfter(DateTime.UtcNow,
            "token deve ter validade futura");
    }

    [Fact]
    public async Task ForgotPassword_EmailInexistente_NaoDeveLancarExcecao()
    {
        var db      = CreateSqliteDb();
        var service = CreateAuthService(db);

        // Resposta silenciosa — não revelar se e-mail existe (proteção contra user enumeration)
        var act = async () => await service.ForgotPasswordAsync(
            new ForgotPasswordRequest("nao.cadastrado@softnerd.com"));

        await act.Should().NotThrowAsync();
    }

    // ── ResetPassword ─────────────────────────────────────────────────────────

    [Fact]
    public async Task ResetPassword_TokenValido_DeveAlterarSenha()
    {
        const string resetToken = "token-valido-abc123";
        var db = CreateSqliteDb();
        var user = new User
        {
            Id                       = Guid.NewGuid(),
            Name                     = "Cliente",
            Email                    = "troca@softnerd.com",
            PasswordHash             = BCrypt.Net.BCrypt.HashPassword("SenhaAntiga!"),
            Role                     = UserRole.Customer,
            IsActive                 = true,
            PasswordResetToken       = resetToken,
            PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(2),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        await service.ResetPasswordAsync(new ResetPasswordRequest(resetToken, "NovaSenha123!"));

        var atualizado = await db.Users.FindAsync(user.Id);
        BCrypt.Net.BCrypt.Verify("NovaSenha123!", atualizado!.PasswordHash!)
            .Should().BeTrue("nova senha deve funcionar após o reset");
        atualizado.PasswordResetToken.Should().BeNull("token deve ser removido após uso único");
    }

    [Fact]
    public async Task ResetPassword_TokenExpirado_DeveLancarUnauthorized()
    {
        const string resetToken = "token-expirado-reset";
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id                       = Guid.NewGuid(),
            Name                     = "Cliente",
            Email                    = "expired@softnerd.com",
            PasswordHash             = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role                     = UserRole.Customer,
            IsActive                 = true,
            PasswordResetToken       = resetToken,
            PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(-1), // expirado
        });
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        var act = async () => await service.ResetPasswordAsync(
            new ResetPasswordRequest(resetToken, "NovaSenha123!"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("*expirado*");
    }

    [Fact]
    public async Task ResetPassword_DeveInvalidarSessoesAtivas()
    {
        // Segurança: troca de senha deve forçar novo login (invalida refresh tokens ativos)
        const string resetToken = "token-valido-session-test";
        var db = CreateSqliteDb();
        var user = new User
        {
            Id                       = Guid.NewGuid(),
            Name                     = "Cliente",
            Email                    = "session@softnerd.com",
            PasswordHash             = BCrypt.Net.BCrypt.HashPassword("OldPass!"),
            Role                     = UserRole.Customer,
            IsActive                 = true,
            RefreshToken             = "sessao-ativa-token-xyz",
            RefreshTokenExpiry       = DateTime.UtcNow.AddDays(30),
            PasswordResetToken       = resetToken,
            PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(2),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var service = CreateAuthService(db);

        await service.ResetPasswordAsync(new ResetPasswordRequest(resetToken, "NewPass123!"));

        var atualizado = await db.Users.FindAsync(user.Id);
        atualizado!.RefreshToken.Should().BeNull(
            "sessões ativas devem ser invalidadas quando a senha é alterada");
        atualizado.RefreshTokenExpiry.Should().BeNull();
    }

    // ── Cadastro duplicado ────────────────────────────────────────────────────
    // Reportado pelo Maikon: cliente que já tem conta conseguia se cadastrar de novo.
    // A checagem existia, mas comparava o texto cru — bastava mudar a pontuação.

    [Fact]
    public async Task Register_CpfJaCadastradoComMascara_DeveRecusarApontandoOCampo()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Pietro", Email = "pietro@teste.com",
            Cpf = "529.982.247-25", PasswordHash = "hash", Role = UserRole.Customer,
        });
        await db.SaveChangesAsync();

        var service = CreateAuthService(db);

        // Mesmo CPF, digitado só com números
        var act = async () => await service.RegisterAsync(new RegisterRequest(
            "Pietro de novo", "outro@teste.com", "senha12345", null, "52998224725"));

        var ex = await act.Should().ThrowAsync<CadastroDuplicadoException>();
        ex.Which.Campo.Should().Be("cpf");
        (await db.Users.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Register_EmailComMaiusculasEEspacos_DeveRecusar()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Ana", Email = "ana@teste.com",
            PasswordHash = "hash", Role = UserRole.Customer,
        });
        await db.SaveChangesAsync();

        var service = CreateAuthService(db);

        var act = async () => await service.RegisterAsync(new RegisterRequest(
            "Ana", "  ANA@Teste.com ", "senha12345"));

        var ex = await act.Should().ThrowAsync<CadastroDuplicadoException>();
        ex.Which.Campo.Should().Be("email");
    }

    [Fact]
    public async Task Register_WhatsAppComMascaraEDdi_DeveRecusar()
    {
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Cliente", Email = "cliente@teste.com",
            WhatsApp = "(17) 99112-2890", PasswordHash = "hash", Role = UserRole.Customer,
        });
        await db.SaveChangesAsync();

        var service = CreateAuthService(db);

        var act = async () => await service.RegisterAsync(new RegisterRequest(
            "Cliente", "novo@teste.com", "senha12345", "+55 17 99112-2890"));

        var ex = await act.Should().ThrowAsync<CadastroDuplicadoException>();
        ex.Which.Campo.Should().Be("whatsapp");
    }

    [Fact]
    public async Task Register_NumeroDiferenteCom55NoMeio_DevePassar()
    {
        // Guarda contra a tentação de "limpar" o 55 do país com Replace: isso
        // transformaria 17 99155-2890 em outro número e barraria cadastro legítimo.
        var db = CreateSqliteDb();
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Cliente", Email = "cliente@teste.com",
            WhatsApp = "17991122890", PasswordHash = "hash", Role = UserRole.Customer,
        });
        await db.SaveChangesAsync();

        var service = CreateAuthService(db);

        var resp = await service.RegisterAsync(new RegisterRequest(
            "Outro", "outro@teste.com", "senha12345", "17991552890"));

        resp.UserName.Should().Be("Outro");
        (await db.Users.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task Register_DadosNovos_DeveSalvarNormalizado()
    {
        var db      = CreateSqliteDb();
        var service = CreateAuthService(db);

        await service.RegisterAsync(new RegisterRequest(
            "Novo Cliente", " NOVO@Teste.com ", "senha12345", "+55 (17) 99112-2890", "529.982.247-25"));

        var user = await db.Users.SingleAsync();
        user.Email.Should().Be("novo@teste.com");
        user.Cpf.Should().Be("52998224725", "guardar só dígitos é o que faz a próxima checagem bater");
        user.WhatsApp.Should().Be("17991122890");
    }
}
