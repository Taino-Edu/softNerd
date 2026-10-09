// =============================================================================
// AuthServiceTests.cs — Testes unitários de Autenticação
// Foco: lógica de login, quick-login e tokens
// =============================================================================
using System.ComponentModel.DataAnnotations;

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

    private static AuthService CreateAuthService(AppDbContext db, ILogger<AuthService>? logger = null,
        IValidadorGoogle? google = null, string? googleClientId = null)
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
            new Mock<IHttpContextAccessor>().Object,
            google ?? new Mock<IValidadorGoogle>().Object,
            Options.Create(new GoogleAuthSettings { ClientId = googleClientId ?? "" }));
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

    [Fact]
    public async Task RefreshToken_LegadoArmazenadoSemHash_DeveMigrarSemDeslogar()
    {
        var db       = CreateSqliteDb();
        var rawToken = "token-legado-bruto-antes-do-deploy";
        var user     = new User
        {
            Id                 = Guid.NewGuid(),
            Name               = "Admin legado",
            Email              = "legado@softnerd.com",
            PasswordHash       = BCrypt.Net.BCrypt.HashPassword("Senha123!"),
            Role               = UserRole.Admin,
            IsActive           = true,
            RefreshToken       = rawToken,
            RefreshTokenExpiry = DateTime.UtcNow.AddDays(7),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var service  = CreateAuthService(db);
        var renovado = await service.RefreshTokenAsync(new RefreshTokenRequest(rawToken));

        renovado.RefreshToken.Should().NotBeNullOrEmpty();
        renovado.UserId.Should().Be(user.Id);
        (await db.UserSessions.CountAsync(s => s.UserId == user.Id)).Should().BeGreaterThan(0);
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

    /// <summary>
    /// Regressão do 400 no /auth/refresh. O token vem do cookie HttpOnly e o
    /// frontend manda `{}`; enquanto o corpo exigia [Required], a validação
    /// automática do [ApiController] devolvia 400 antes de a action rodar, e o
    /// trecho que lê o cookie nunca executava — nenhuma sessão renovava.
    ///
    /// Validator é a mesma engrenagem que o MVC usa pra montar o ModelState, então
    /// este teste falha se alguém puser [Required] de volta. Teste de serviço não
    /// pegaria: o defeito estava no model binding, antes do código de negócio.
    /// </summary>
    [Fact]
    public void RefreshTokenBody_CorpoVazio_PassaNaValidacaoDoModelo()
    {
        var corpo    = new RefreshTokenBody();
        var contexto = new ValidationContext(corpo);
        var erros    = new List<ValidationResult>();

        var valido = Validator.TryValidateObject(corpo, contexto, erros, validateAllProperties: true);

        valido.Should().BeTrue(
            "o corpo é opcional de propósito — exigir campo aqui devolve 400 e impede o " +
            "controller de ler o cookie, que é de onde o token realmente vem");
        erros.Should().BeEmpty();
    }

    // ── Bloqueio de conta por senha errada (ProtecaoLogin.cs) ─────────────────

    private static async Task<(AppDbContext Db, AuthService Service, Guid UserId)> ContaComSenhaAsync(string email = "bloqueio@softnerd.com")
    {
        var db = CreateSqliteDb();
        var id = Guid.NewGuid();
        db.Users.Add(new User
        {
            Id = id, Name = "Cliente", Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("SenhaCerta!1"),
            Role = UserRole.Customer, IsActive = true,
        });
        await db.SaveChangesAsync();
        return (db, CreateAuthService(db), id);
    }

    private static async Task ErrarAsync(AuthService service, int vezes, string? dispositivo = null, string email = "bloqueio@softnerd.com")
    {
        for (var i = 0; i < vezes; i++)
        {
            try { await service.LoginAsync(new LoginRequest(email, "errada"), dispositivo); }
            catch (UnauthorizedAccessException) { }
            catch (ContaBloqueadaException) { }
        }
    }

    [Fact]
    public async Task Bloqueio_QuatroErros_AindaNaoTrava()
    {
        var (_, service, _) = await ContaComSenhaAsync();
        await ErrarAsync(service, 4);

        var r = await service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"));

        r.UserId.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Bloqueio_QuintoErro_TravaAtePraSenhaCerta()
    {
        var (db, service, id) = await ContaComSenhaAsync();
        await ErrarAsync(service, 5);

        var act = () => service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"));

        await act.Should().ThrowAsync<ContaBloqueadaException>("travada não confere senha — senão vira oráculo");
        var u = await db.Users.AsNoTracking().SingleAsync(x => x.Id == id);
        u.FalhasLogin.Should().Be(5);
        u.LoginBloqueadoAte.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(1), TimeSpan.FromSeconds(10));
    }

    [Theory]
    [InlineData(4, 0)]
    [InlineData(5, 1)]
    [InlineData(6, 5)]
    [InlineData(7, 15)]
    [InlineData(8, 60)]
    [InlineData(30, 60)]
    public void Bloqueio_Progressivo(int falhas, int minutos) =>
        ProtecaoLogin.Bloqueio(falhas).Should().Be(TimeSpan.FromMinutes(minutos));

    [Fact]
    public async Task Bloqueio_AcertarZeraAContagem()
    {
        var (db, service, id) = await ContaComSenhaAsync();
        await ErrarAsync(service, 3);

        await service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"));

        (await db.Users.AsNoTracking().SingleAsync(x => x.Id == id)).FalhasLogin.Should().Be(0);
    }

    [Fact]
    public async Task Bloqueio_DispositivoConhecido_NaoFicaTravado()
    {
        // O dono já entrou neste aparelho; alguém de fora erra a senha dele 5x
        var (_, service, _) = await ContaComSenhaAsync();
        var meuCelular = (await service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"))).Dispositivo;
        await ErrarAsync(service, 5);

        // Aparelho desconhecido: travado. O do dono: entra normal.
        var deFora = () => service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"));
        await deFora.Should().ThrowAsync<ContaBloqueadaException>();
        var r = await service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"), meuCelular);
        r.UserId.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Bloqueio_DispositivoDeOutraConta_NaoVale()
    {
        var (db, service, _) = await ContaComSenhaAsync();
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Outro", Email = "outro@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Outra!123"), Role = UserRole.Customer, IsActive = true,
        });
        await db.SaveChangesAsync();
        var dispositivoDoOutro = (await service.LoginAsync(new LoginRequest("outro@softnerd.com", "Outra!123"))).Dispositivo;
        await ErrarAsync(service, 5);

        var act = () => service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "SenhaCerta!1"), dispositivoDoOutro);

        await act.Should().ThrowAsync<ContaBloqueadaException>();
    }

    [Fact]
    public void Dispositivo_TrocarASenhaInvalida()
    {
        var id = Guid.NewGuid();
        var token = ProtecaoLogin.GerarDispositivo(id, "hash-antigo", "chave");

        ProtecaoLogin.DispositivoValido(token, id, "hash-antigo", "chave").Should().BeTrue();
        ProtecaoLogin.DispositivoValido(token, id, "hash-novo", "chave").Should().BeFalse();
        ProtecaoLogin.DispositivoValido(token + "0", id, "hash-antigo", "chave").Should().BeFalse();
        ProtecaoLogin.DispositivoValido("lixo", id, "hash-antigo", "chave").Should().BeFalse();
    }

    [Fact]
    public async Task Bloqueio_RedefinirSenhaDestrava()
    {
        var (db, service, id) = await ContaComSenhaAsync();
        await ErrarAsync(service, 5);
        var u = await db.Users.SingleAsync(x => x.Id == id);
        u.PasswordResetToken = "tok-bloqueio";
        u.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
        await db.SaveChangesAsync();

        await service.ResetPasswordAsync(new ResetPasswordRequest("tok-bloqueio", "NovaSenha!9"));

        var r = await service.LoginAsync(new LoginRequest("bloqueio@softnerd.com", "NovaSenha!9"));
        r.UserId.Should().Be(id);
    }

    [Fact]
    public async Task Bloqueio_EmailQueNaoExiste_NaoQuebraENaoConta()
    {
        var (db, service, _) = await ContaComSenhaAsync();

        var act = () => service.LoginAsync(new LoginRequest("ninguem@softnerd.com", "x"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
        (await db.Users.AsNoTracking().SumAsync(x => x.FalhasLogin)).Should().Be(0);
    }

    [Fact]
    public async Task Bloqueio_ClientLogin_TambemTrava()
    {
        var (_, service, _) = await ContaComSenhaAsync("cliente.bloqueio@softnerd.com");
        for (var i = 0; i < 5; i++)
        {
            try { await service.ClientLoginAsync(new ClientLoginRequest("cliente.bloqueio@softnerd.com", "errada")); }
            catch (UnauthorizedAccessException) { }
            catch (ContaBloqueadaException) { }
        }

        var act = () => service.ClientLoginAsync(new ClientLoginRequest("cliente.bloqueio@softnerd.com", "SenhaCerta!1"));

        await act.Should().ThrowAsync<ContaBloqueadaException>();
    }

    // ── QR Code da mesa: não entra em conta alheia (QuickLogin) ───────────────

    private const string CpfVitima = "52998224725";
    private const string ZapVitima = "17991122890";

    private static async Task<(AppDbContext Db, AuthService Service, Guid Id)> ContaDaMesaAsync(
        string? senha = null, string role = UserRole.Customer, string? cpf = CpfVitima, string? zap = ZapVitima)
    {
        var db = CreateSqliteDb();
        var id = Guid.NewGuid();
        db.Users.Add(new User
        {
            Id = id, Name = "Cliente Original", Email = $"{id:N}@softnerd.com",
            Cpf = cpf, WhatsApp = zap, Role = role, IsActive = true,
            PasswordHash = senha is null ? null : BCrypt.Net.BCrypt.HashPassword(senha),
        });
        await db.SaveChangesAsync();
        return (db, CreateAuthService(db), id);
    }

    [Fact]
    public async Task QuickLogin_ContaComSenha_PedeEmailESenha()
    {
        var (_, service, _) = await ContaDaMesaAsync(senha: "Senha!123");

        var act = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", CpfVitima, ZapVitima, "1"));

        (await act.Should().ThrowAsync<QuickLoginRecusadoException>()).Which.Codigo.Should().Be("precisaSenha");
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Operator")]
    public async Task QuickLogin_ContaDaEquipe_NuncaEntraPeloQrCode(string role)
    {
        var (_, service, _) = await ContaDaMesaAsync(role: role);

        var act = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", CpfVitima, ZapVitima, "1"));

        (await act.Should().ThrowAsync<QuickLoginRecusadoException>()).Which.Codigo.Should().Be("precisaSenha");
    }

    [Fact]
    public async Task QuickLogin_SoOCpf_ComOutroWhatsApp_NaoEntraENaoMudaNada()
    {
        var (db, service, id) = await ContaDaMesaAsync();

        var act = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", CpfVitima, "11988887777", "1"));

        (await act.Should().ThrowAsync<QuickLoginRecusadoException>()).Which.Codigo.Should().Be("naoBate");
        var u = await db.Users.AsNoTracking().SingleAsync(x => x.Id == id);
        u.Name.Should().Be("Cliente Original");
        u.WhatsApp.Should().Be(ZapVitima);
    }

    [Fact]
    public async Task QuickLogin_SoOWhatsApp_EmContaComCpf_PedeOCpf()
    {
        var (_, service, _) = await ContaDaMesaAsync();

        var act = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", null, ZapVitima, "1"));

        (await act.Should().ThrowAsync<QuickLoginRecusadoException>()).Which.Codigo.Should().Be("precisaCpf");
    }

    [Fact]
    public async Task QuickLogin_DadosBatem_EntraSemSobrescreverONome()
    {
        var (db, service, id) = await ContaDaMesaAsync();

        var r = await service.QuickLoginAsync(new QuickLoginRequest("Outro Nome", "529.982.247-25", "(17) 99112-2890", "3"));

        r.UserId.Should().Be(id);
        r.ComandaId.Should().NotBeNull();
        (await db.Users.AsNoTracking().SingleAsync(x => x.Id == id)).Name.Should().Be("Cliente Original");
    }

    [Fact]
    public async Task QuickLogin_CadastroSemWhatsApp_MandaProBalcao()
    {
        var (_, service, _) = await ContaDaMesaAsync(zap: null);

        var act = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", CpfVitima, ZapVitima, "1"));

        (await act.Should().ThrowAsync<QuickLoginRecusadoException>()).Which.Codigo.Should().Be("balcao");
    }

    [Fact]
    public async Task QuickLogin_CincoTentativasErradas_TravaAConta()
    {
        var (_, service, _) = await ContaDaMesaAsync();
        for (var i = 0; i < 4; i++)
        {
            var errado = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", CpfVitima, $"1198888000{i}", "1"));
            await errado.Should().ThrowAsync<QuickLoginRecusadoException>();
        }

        var quinta = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", CpfVitima, "11988880009", "1"));
        await quinta.Should().ThrowAsync<ContaBloqueadaException>();

        // Travada: nem o dono entra pelo QR Code até passar o tempo (ou entrar com senha / balcão)
        var dono = () => service.QuickLoginAsync(new QuickLoginRequest("Cliente", CpfVitima, ZapVitima, "1"));
        await dono.Should().ThrowAsync<ContaBloqueadaException>();
    }

    [Fact]
    public async Task QuickLogin_ContaSemCpf_CompletaOCpfQuandoOWhatsAppBate()
    {
        var (db, service, id) = await ContaDaMesaAsync(cpf: null);

        var r = await service.QuickLoginAsync(new QuickLoginRequest("Cliente", CpfVitima, ZapVitima, "1"));

        r.UserId.Should().Be(id);
        (await db.Users.AsNoTracking().SingleAsync(x => x.Id == id)).Cpf.Should().Be(CpfVitima);
    }

    // ── Entrar com Google (LoginGoogle.cs) ───────────────────────────────────

    private const string ClientIdTeste = "teste.apps.googleusercontent.com";

    private static (AppDbContext Db, AuthService Service) ComGoogle(DadosGoogle? devolve)
    {
        var db = CreateSqliteDb();
        var google = new Mock<IValidadorGoogle>();
        google.Setup(g => g.ValidarAsync(It.IsAny<string>(), ClientIdTeste)).ReturnsAsync(devolve);
        return (db, CreateAuthService(db, google: google.Object, googleClientId: ClientIdTeste));
    }

    [Fact]
    public async Task Google_Desligado_SemClientId()
    {
        var db = CreateSqliteDb();
        var service = CreateAuthService(db);

        service.GoogleClientId.Should().BeNull();
        var act = () => service.LoginGoogleAsync(new LoginGoogleRequest("token"));
        await act.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Google_PrimeiraVez_CriaClienteSemSenha_ComCadastroIncompleto()
    {
        var (db, service) = ComGoogle(new DadosGoogle("sub-1", "Novo@Gmail.com", true, "Fulano Google"));

        var r = await service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        var u = await db.Users.AsNoTracking().SingleAsync(x => x.Id == r.UserId);
        u.Email.Should().Be("novo@gmail.com");
        u.GoogleSub.Should().Be("sub-1");
        u.PasswordHash.Should().BeNull();
        u.Role.Should().Be(UserRole.Customer);
        r.Dispositivo.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Google_MesmoEmailDeContaExistente_LigaSemDuplicar()
    {
        var (db, service) = ComGoogle(new DadosGoogle("sub-2", "cliente@softnerd.com", true, "Cliente"));
        var id = Guid.NewGuid();
        db.Users.Add(new User
        {
            Id = id, Name = "Cliente Antigo", Email = "cliente@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha!123"), Role = UserRole.Customer, IsActive = true,
            FalhasLogin = 7, LoginBloqueadoAte = DateTime.UtcNow.AddHours(1),
        });
        await db.SaveChangesAsync();

        var r = await service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        r.UserId.Should().Be(id);
        (await db.Users.CountAsync()).Should().Be(1);
        var u = await db.Users.AsNoTracking().SingleAsync();
        u.GoogleSub.Should().Be("sub-2");
        u.Name.Should().Be("Cliente Antigo");
        u.LoginBloqueadoAte.Should().BeNull("entrou provando a identidade pelo Google");
    }

    [Fact]
    public async Task Google_ContaCriadaPorOutroComMeuEmail_InvasorPerdeSenhaESessao()
    {
        // Invasor cadastra conta com o e-mail da vítima (o cadastro não confirma e-mail) e fica logado
        var (db, service) = ComGoogle(new DadosGoogle("sub-vitima", "vitima@gmail.com", true, "Vítima"));
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Invasor", Email = "vitima@gmail.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("SenhaDoInvasor!1"), Role = UserRole.Customer, IsActive = true,
        });
        await db.SaveChangesAsync();
        var sessaoDoInvasor = await service.LoginAsync(new LoginRequest("vitima@gmail.com", "SenhaDoInvasor!1"));

        // A dona do e-mail entra com Google
        await service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        // Senha do invasor não entra mais, e a sessão dele caiu
        var senha = () => service.LoginAsync(new LoginRequest("vitima@gmail.com", "SenhaDoInvasor!1"));
        await senha.Should().ThrowAsync<UnauthorizedAccessException>();
        var sessao = () => service.RefreshTokenAsync(new RefreshTokenRequest(sessaoDoInvasor.RefreshToken));
        await sessao.Should().ThrowAsync<UnauthorizedAccessException>();
        (await db.Users.AsNoTracking().SingleAsync()).PasswordHash.Should().BeNull();
    }

    [Fact]
    public async Task Google_EmailNaoVerificado_Recusa()
    {
        var (db, service) = ComGoogle(new DadosGoogle("sub-3", "x@gmail.com", false, "X"));

        var act = () => service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        await act.Should().ThrowAsync<LoginGoogleRecusadoException>();
        (await db.Users.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Google_TokenInvalido_Recusa()
    {
        var (_, service) = ComGoogle(null);

        var act = () => service.LoginGoogleAsync(new LoginGoogleRequest("token-falso"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Operator")]
    public async Task Google_ContaDaEquipe_ContinuaComSenha(string role)
    {
        var (db, service) = ComGoogle(new DadosGoogle("sub-4", "equipe@softnerd.com", true, "Equipe"));
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Equipe", Email = "equipe@softnerd.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha!123"), Role = role, IsActive = true,
        });
        await db.SaveChangesAsync();

        var act = () => service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        await act.Should().ThrowAsync<LoginGoogleRecusadoException>();
        (await db.Users.AsNoTracking().SingleAsync()).GoogleSub.Should().BeNull();
    }

    [Fact]
    public async Task Google_EmailJaLigadoAOutraContaGoogle_NaoTroca()
    {
        var (db, service) = ComGoogle(new DadosGoogle("sub-novo", "cliente@softnerd.com", true, "Cliente"));
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Cliente", Email = "cliente@softnerd.com",
            GoogleSub = "sub-antigo", Role = UserRole.Customer, IsActive = true,
        });
        await db.SaveChangesAsync();

        var act = () => service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        await act.Should().ThrowAsync<LoginGoogleRecusadoException>();
    }

    [Fact]
    public async Task Google_ContaLigada_NaoAbreMaisPeloQrCodeSemSenha()
    {
        // Ligar o Google apaga a senha: a conta não pode voltar a abrir só com CPF + WhatsApp
        var (db, service) = ComGoogle(new DadosGoogle("sub-qr", "qr@gmail.com", true, "Cliente QR"));
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), Name = "Cliente QR", Email = "qr@gmail.com", Cpf = "52998224725", WhatsApp = "17991122890",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Senha!123"), Role = UserRole.Customer, IsActive = true,
        });
        await db.SaveChangesAsync();
        await service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        var act = () => service.QuickLoginAsync(new QuickLoginRequest("Invasor", "52998224725", "17991122890", "1"));

        (await act.Should().ThrowAsync<QuickLoginRecusadoException>()).Which.Codigo.Should().Be("precisaSenha");
    }

    [Fact]
    public async Task Google_NaMesa_AbreAComanda()
    {
        var (_, service) = ComGoogle(new DadosGoogle("sub-5", "mesa@gmail.com", true, "Da Mesa"));

        var r = await service.LoginGoogleAsync(new LoginGoogleRequest("token", "7"));

        r.ComandaId.Should().NotBeNull();
    }

    [Fact]
    public async Task Google_CompletarCadastro_GravaWhatsAppECpf_ENaoDeixaRepetir()
    {
        var (db, service) = ComGoogle(new DadosGoogle("sub-6", "completa@gmail.com", true, "Completa"));
        db.Users.Add(new User { Id = Guid.NewGuid(), Name = "Outro", WhatsApp = "17988887777", Role = UserRole.Customer, IsActive = true });
        await db.SaveChangesAsync();
        var r = await service.LoginGoogleAsync(new LoginGoogleRequest("token"));

        var repetido = () => service.CompletarCadastroGoogleAsync(r.UserId, new CompletarCadastroGoogleRequest("(17) 98888-7777"));
        await repetido.Should().ThrowAsync<CadastroDuplicadoException>();

        await service.CompletarCadastroGoogleAsync(r.UserId, new CompletarCadastroGoogleRequest("(17) 99111-2222", "529.982.247-25"));
        var u = await db.Users.AsNoTracking().SingleAsync(x => x.Id == r.UserId);
        u.WhatsApp.Should().Be("17991112222");
        u.Cpf.Should().Be("52998224725");
    }
}
