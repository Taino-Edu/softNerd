// =============================================================================
// AuthService.cs — Implementação de Autenticação
// =============================================================================
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using CardGameStore.Validation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace CardGameStore.Services.Implementations;

/// <summary>
/// Implementação do serviço de autenticação.
/// Responsável por: login completo, login rápido (QR Code), refresh tokens e logout.
/// </summary>
public class AuthService : IAuthService
{
    private readonly AppDbContext          _db;
    private readonly JwtSettings           _jwt;
    private readonly ILogger<AuthService>  _logger;
    private readonly IComandaService       _comandaService;
    private readonly IEmailService         _email;
    private readonly IHttpContextAccessor  _http;
    private readonly IValidadorGoogle      _google;
    private readonly GoogleAuthSettings    _googleCfg;

    public AuthService(
        AppDbContext db,
        IOptions<JwtSettings> jwt,
        ILogger<AuthService> logger,
        IComandaService comandaService,
        IEmailService email,
        IHttpContextAccessor http,
        IValidadorGoogle google,
        IOptions<GoogleAuthSettings> googleCfg)
    {
        _google         = google;
        _googleCfg      = googleCfg.Value;
        _db             = db;
        _jwt            = jwt.Value;
        _logger         = logger;
        _comandaService = comandaService;
        _email          = email;
        _http           = http;
    }

    // =========================================================================
    // LOGIN COMPLETO — Admin e jogadores de campeonato
    // =========================================================================
    public async Task<AuthResponse> LoginAsync(LoginRequest request, string? dispositivo = null)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive);

        await ConferirSenhaAsync(user, request.Password, dispositivo);
        return await RespostaComDispositivoAsync(user!);
    }

    /// <summary>
    /// Confere a senha com o bloqueio por conta (ProtecaoLogin.cs). Lança
    /// UnauthorizedAccessException (senha errada / e-mail que não existe) ou
    /// ContaBloqueadaException (travada pra aparelho desconhecido).
    /// </summary>
    private async Task ConferirSenhaAsync(User? user, string senha, string? dispositivo)
    {
        // E-mail inexistente ou conta sem senha (quick-login): compara com um hash falso pra
        // demorar o mesmo tanto — tempo de resposta não pode dizer quem tem conta.
        if (user is null || user.PasswordHash is null)
        {
            BCrypt.Net.BCrypt.Verify(senha, ProtecaoLogin.HashFalso);
            throw new UnauthorizedAccessException("E-mail ou senha inválidos.");
        }

        // Contagem sempre do banco: o objeto pode ter vindo de antes (mesmo contexto) com valor velho
        var estado = await _db.Users.AsNoTracking().Where(u => u.Id == user.Id)
            .Select(u => new { u.FalhasLogin, u.LoginBloqueadoAte }).FirstAsync();
        user.FalhasLogin = estado.FalhasLogin;
        user.LoginBloqueadoAte = estado.LoginBloqueadoAte;

        var conhecido = ProtecaoLogin.DispositivoValido(dispositivo, user.Id, user.PasswordHash, _jwt.SecretKey);
        var agora = DateTime.UtcNow;
        // Travada: nem confere a senha (senão o bloqueio vira oráculo de "acertou")
        if (!conhecido && user.LoginBloqueadoAte > agora)
            throw new ContaBloqueadaException(user.LoginBloqueadoAte.Value);

        if (BCrypt.Net.BCrypt.Verify(senha, user.PasswordHash))
        {
            if (user.FalhasLogin != 0 || user.LoginBloqueadoAte is not null)
                await _db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(s => s
                    .SetProperty(u => u.FalhasLogin, 0)
                    .SetProperty(u => u.LoginBloqueadoAte, (DateTime?)null));
            user.FalhasLogin = 0;
            user.LoginBloqueadoAte = null;
            return;
        }

        // Conta atômica: duas tentativas erradas ao mesmo tempo somam duas
        await _db.Users.Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.FalhasLogin, u => u.FalhasLogin + 1));
        var falhas = await _db.Users.AsNoTracking().Where(u => u.Id == user.Id).Select(u => u.FalhasLogin).FirstAsync();
        user.FalhasLogin = falhas;
        var trava = ProtecaoLogin.Bloqueio(falhas);
        if (trava > TimeSpan.Zero && !conhecido)
        {
            var ate = agora + trava;
            await _db.Users.Where(u => u.Id == user.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.LoginBloqueadoAte, ate));
            user.LoginBloqueadoAte = ate;
            _logger.LogWarning("Conta {UserId} bloqueada por {Min} min após {Falhas} senhas erradas.",
                user.Id, (int)trava.TotalMinutes, falhas);
            throw new ContaBloqueadaException(ate);
        }
        throw new UnauthorizedAccessException("E-mail ou senha inválidos.");
    }

    // =========================================================================
    // ENTRAR COM GOOGLE (LoginGoogle.cs)
    // =========================================================================

    public string? GoogleClientId => _googleCfg.Ativo ? _googleCfg.ClientId.Trim() : null;

    public async Task<AuthResponse> LoginGoogleAsync(LoginGoogleRequest request)
    {
        if (!_googleCfg.Ativo) throw new KeyNotFoundException("Login com Google desligado.");

        var g = await _google.ValidarAsync(request.Credential, _googleCfg.ClientId.Trim())
            ?? throw new UnauthorizedAccessException("Não deu pra confirmar a conta do Google. Tente de novo.");
        // E-mail não verificado pelo Google não prova nada: não liga conta nem cria cadastro
        if (!g.EmailVerificado || string.IsNullOrWhiteSpace(g.Email))
            throw new LoginGoogleRecusadoException("Essa conta do Google não tem o e-mail confirmado.");

        var email = Identificadores.NormalizarEmail(g.Email)!;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.GoogleSub == g.Sub)
                ?? await _db.Users.FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == email);

        if (user is null)
        {
            user = new User
            {
                Name      = string.IsNullOrWhiteSpace(g.Nome) ? email.Split('@')[0] : g.Nome.Trim(),
                Email     = email,
                GoogleSub = g.Sub,
                Role      = UserRole.Customer,
                IsActive  = true,
            };
            _db.Users.Add(user);
            _logger.LogInformation("Nova conta criada pelo Google: {Email}", MaskEmail(email));
        }
        else
        {
            if (user.Role != UserRole.Customer)
                throw new LoginGoogleRecusadoException("Contas da equipe entram com e-mail e senha.");
            if (!user.IsActive)
                throw new UnauthorizedAccessException("Conta desativada. Fale com a loja.");
            // Já ligada a OUTRA conta Google (mesmo e-mail, sub diferente): não troca sozinho
            if (user.GoogleSub is not null && user.GoogleSub != g.Sub)
                throw new LoginGoogleRecusadoException("Esse e-mail já está ligado a outra conta do Google. Fale com a loja.");
            if (user.GoogleSub is null)
            {
                // O Google garante que essa pessoa é dona do e-mail: liga sem criar cadastro duplicado.
                // Mas o cadastro pelo site NÃO confirma e-mail: alguém pode ter criado conta com o
                // e-mail dela e uma senha própria, esperando ela entrar com Google pra dividir a
                // conta. Por isso, ao ligar, a senha antiga é apagada e toda sessão aberta cai —
                // fica só quem provou ser dona do e-mail. Ela entra pelo Google ou cria senha nova
                // em "Esqueci minha senha".
                user.GoogleSub = g.Sub;
                var tinhaSenha = user.PasswordHash is not null;
                user.PasswordHash = null;
                user.RefreshToken = null;
                user.RefreshTokenExpiry = null;
                await RevogarTodasAsSessoesAsync(user.Id);
                _logger.LogInformation("Conta {UserId} ligada ao Google (senha antiga {Senha}, sessões revogadas).",
                    user.Id, tinhaSenha ? "apagada" : "não havia");
            }
            // Entrou provando a identidade: zera as senhas erradas
            user.FalhasLogin = 0;
            user.LoginBloqueadoAte = null;
            user.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();

        Guid? comandaId = null;
        if (!string.IsNullOrWhiteSpace(request.TableIdentifier))
            comandaId = (await _comandaService.OpenComandaAsync(user.Id, request.TableIdentifier)).Id;

        return await GenerateAuthResponseAsync(user, comandaId) with
        {
            Dispositivo = ProtecaoLogin.GerarDispositivo(user.Id, user.PasswordHash, _jwt.SecretKey),
        };
    }

    public async Task CompletarCadastroGoogleAsync(Guid userId, CompletarCadastroGoogleRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive)
            ?? throw new KeyNotFoundException("Usuário não encontrado.");
        if (user.GoogleSub is null)
            throw new InvalidOperationException("Essa conta não entrou com Google.");

        var whatsApp = Identificadores.NormalizarWhatsApp(request.WhatsApp)
            ?? throw new InvalidOperationException("Informe um WhatsApp válido.");
        var cpf = Identificadores.NormalizarCpf(request.Cpf);
        await GarantirIdentificadoresLivresAsync(_db, null, cpf, whatsApp, ignorarUserId: userId);

        user.WhatsApp = whatsApp;
        if (cpf is not null && user.Cpf is null) user.Cpf = cpf;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _logger.LogInformation("Cadastro do Google completado pelo cliente {UserId}", userId);
    }

    /// <summary>Login com senha deu certo: sessão + cookie de dispositivo conhecido (renovado a cada login).</summary>
    private async Task<AuthResponse> RespostaComDispositivoAsync(User user) =>
        await GenerateAuthResponseAsync(user) with
        {
            Dispositivo = ProtecaoLogin.GerarDispositivo(user.Id, user.PasswordHash, _jwt.SecretKey),
        };

    // =========================================================================
    // LOGIN RÁPIDO — Customer via QR Code (CPF + WhatsApp)
    // =========================================================================
    public async Task<AuthResponse> QuickLoginAsync(QuickLoginRequest request)
    {
        // Normaliza antes de procurar: o cliente digita o CPF com ponto numa visita e sem
        // ponto na outra, e a busca crua criava um cadastro novo em vez de reencontrar o dele.
        var cpf      = Identificadores.NormalizarCpf(request.Cpf);
        var whatsApp = Identificadores.NormalizarWhatsApp(request.WhatsApp);

        var user = await AcharContaDaMesaAsync(cpf, whatsApp);

        if (user is null)
        {
            user = new User
            {
                Name     = request.Name,
                Cpf      = cpf,
                WhatsApp = whatsApp,
                Role     = UserRole.Customer,
                IsActive = true
            };
            _db.Users.Add(user);
            try
            {
                await _db.SaveChangesAsync();
                _logger.LogInformation("Novo cliente criado via QR Code: {Name}", request.Name);
            }
            catch (DbUpdateException)
            {
                // Corrida: outra mesa criou a mesma conta no mesmo instante. Ela agora existe
                // e passa pela mesma conferência de qualquer conta existente.
                _db.ChangeTracker.Clear();
                user = await AcharContaDaMesaAsync(cpf, whatsApp) ?? throw new InvalidOperationException("Não deu pra criar o cadastro. Tente de novo.");
                await ConferirContaDaMesaAsync(user, cpf, whatsApp);
            }
        }
        else
        {
            await ConferirContaDaMesaAsync(user, cpf, whatsApp);
        }

        var comanda = await _comandaService.OpenComandaAsync(user.Id, request.TableIdentifier);
        _logger.LogInformation("Comanda {ComandaId} associada ao quick-login de {Name}", comanda.Id, user.Name);

        return await GenerateAuthResponseAsync(user, comanda.Id);
    }

    /// <summary>CPF informado manda; sem CPF, procura pelo WhatsApp.</summary>
    private async Task<User?> AcharContaDaMesaAsync(string? cpf, string? whatsApp)
    {
        if (cpf is not null)
        {
            var porCpf = await _db.Users.FirstOrDefaultAsync(u => u.Cpf != null
                && u.Cpf.Replace(".", "").Replace("-", "").Replace(" ", "") == cpf);
            if (porCpf is not null) return porCpf;
        }
        return whatsApp is null ? null : await _db.Users.FirstOrDefaultAsync(u => u.WhatsApp != null
            && u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                         .Replace("-", "").Replace("+", "") == whatsApp);
    }

    /// <summary>
    /// QR Code da mesa entra SEM senha — então só vale pra conta que nunca teve senha,
    /// e os dados têm que bater com o cadastro. Antes bastava o CPF: quem soubesse o CPF
    /// de alguém entrava na conta dele (até de operador/admin) e ainda trocava o nome e
    /// o WhatsApp. Regras:
    ///   - conta de operador/admin, ou cliente com senha → entra com e-mail e senha
    ///   - WhatsApp tem que ser o do cadastro (cadastro sem WhatsApp → balcão)
    ///   - conta com CPF exige o CPF (só o WhatsApp não basta)
    ///   - nada do cadastro é sobrescrito; CPF só é preenchido se estava vazio
    ///   - dado que não bate conta como senha errada (bloqueio por conta, ProtecaoLogin.cs)
    /// </summary>
    private async Task ConferirContaDaMesaAsync(User user, string? cpf, string? whatsApp)
    {
        // Conta com credencial forte (senha OU Google ligado) só entra provando ela. Ligar o
        // Google apaga a senha — sem o GoogleSub aqui, a conta voltaria a abrir só com CPF+WhatsApp.
        if (user.Role != UserRole.Customer || user.PasswordHash is not null || user.GoogleSub is not null || !user.IsActive)
            throw new QuickLoginRecusadoException(
                user.GoogleSub is not null && user.PasswordHash is null
                    ? "Essa conta entra com o Google. Toque em \"Continuar com o Google\" pra abrir a comanda."
                    : "Essa conta tem senha. Entre com seu e-mail e senha pra abrir a comanda.",
                "precisaSenha");

        var agora = DateTime.UtcNow;
        var estado = await _db.Users.AsNoTracking().Where(u => u.Id == user.Id)
            .Select(u => new { u.FalhasLogin, u.LoginBloqueadoAte }).FirstAsync();
        if (estado.LoginBloqueadoAte > agora)
            throw new ContaBloqueadaException(estado.LoginBloqueadoAte.Value);

        if (string.IsNullOrEmpty(user.WhatsApp))
            throw new QuickLoginRecusadoException(
                "Não conseguimos confirmar esse cadastro pelo celular. Fale com o balcão.", "balcao");

        var cpfDoCadastro = Identificadores.NormalizarCpf(user.Cpf);
        var bate = Identificadores.NormalizarWhatsApp(user.WhatsApp) == whatsApp
                && (cpfDoCadastro is null || cpfDoCadastro == cpf);
        if (!bate)
        {
            await _db.Users.Where(u => u.Id == user.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.FalhasLogin, u => u.FalhasLogin + 1));
            var falhas = await _db.Users.AsNoTracking().Where(u => u.Id == user.Id).Select(u => u.FalhasLogin).FirstAsync();
            var trava = ProtecaoLogin.Bloqueio(falhas);
            if (trava > TimeSpan.Zero)
            {
                var ate = agora + trava;
                await _db.Users.Where(u => u.Id == user.Id)
                    .ExecuteUpdateAsync(s => s.SetProperty(u => u.LoginBloqueadoAte, ate));
                _logger.LogWarning("Conta {UserId} bloqueada no QR Code após {Falhas} tentativas com dados que não batem.", user.Id, falhas);
                throw new ContaBloqueadaException(ate);
            }
            throw new QuickLoginRecusadoException(
                cpfDoCadastro is not null && cpf is null
                    ? "Informe também o seu CPF pra confirmar o cadastro."
                    : "Os dados não batem com o cadastro. Confira o CPF e o WhatsApp ou fale com o balcão.",
                cpfDoCadastro is not null && cpf is null ? "precisaCpf" : "naoBate");
        }

        if (estado.FalhasLogin != 0)
            await _db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(s => s
                .SetProperty(u => u.FalhasLogin, 0).SetProperty(u => u.LoginBloqueadoAte, (DateTime?)null));

        // Conta antiga sem CPF: completa (só se ninguém mais usa esse CPF — índice único protege)
        if (cpfDoCadastro is null && cpf is not null)
        {
            user.Cpf = cpf;
            user.UpdatedAt = DateTime.UtcNow;
            try { await _db.SaveChangesAsync(); }
            catch (DbUpdateException) { _db.Entry(user).State = EntityState.Unchanged; user.Cpf = null; }
        }
    }

    // =========================================================================
    // REFRESH TOKEN
    // =========================================================================
    public async Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request)
    {
        var hashedToken = HashRefreshToken(request.RefreshToken);
        var agora       = DateTime.UtcNow;

        var session = await _db.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.TokenHash == hashedToken);

        // Sessão ainda não migrada: o token está na coluna antiga do usuário.
        // Adota a sessão em vez de deslogar quem já estava logado antes do deploy.
        if (session == null)
        {
            // Versões antigas gravavam formatos diferentes na coluna users.refresh_token:
            // algumas já guardavam SHA-256, outras guardavam o token bruto. A migração
            // inicial copiou essa coluna sem normalizar, então comparar só com o hash
            // derrubava todas as sessões antigas logo após o deploy.
            var rawToken = request.RefreshToken;
            var legado = await _db.Users.FirstOrDefaultAsync(
                u => (u.RefreshToken == hashedToken || u.RefreshToken == rawToken) && u.IsActive);

            if (legado == null || legado.RefreshTokenExpiry == null || legado.RefreshTokenExpiry < agora)
                throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");

            session = new UserSession
            {
                UserId    = legado.Id,
                TokenHash = hashedToken,
                ExpiresAt = legado.RefreshTokenExpiry.Value,
                User      = legado,
            };
            _db.UserSessions.Add(session);
            try
            {
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Outra aba migrou a mesma sessão no mesmo instante — reaproveita a dela.
                _db.ChangeTracker.Clear();
                session = await _db.UserSessions
                    .Include(x => x.User)
                    .FirstOrDefaultAsync(x => x.TokenHash == hashedToken);
                if (session == null) throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");
            }
        }

        var user = session.User ?? await _db.Users.FindAsync(session.UserId);

        if (user is null || !user.IsActive || session.RevokedAt != null || session.ExpiresAt < agora)
            throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");

        // Token já rotacionado: só vale dentro da janela de graça. É esse trecho que
        // impede a segunda aba (que disparou o refresh junto com a primeira e chegou
        // com o token velho) de derrubar a sessão inteira.
        if (session.RotatedAt != null &&
            session.RotatedAt.Value.AddSeconds(_jwt.RefreshTokenGraceSeconds) < agora)
        {
            throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");
        }

        session.LastUsedAt = agora;
        if (session.RotatedAt == null) session.RotatedAt = agora;

        return await GenerateAuthResponseAsync(user);
    }

    // =========================================================================
    // LOGOUT
    // =========================================================================
    public async Task LogoutAsync(Guid userId, string? refreshToken = null)
    {
        var agora = DateTime.UtcNow;

        // Sair no celular não pode derrubar o PDV: revoga só a sessão deste
        // dispositivo. Sem o token (chamada antiga) revoga todas, como antes.
        if (!string.IsNullOrEmpty(refreshToken))
        {
            var hash    = HashRefreshToken(refreshToken);
            var session = await _db.UserSessions
                .FirstOrDefaultAsync(s => s.TokenHash == hash && s.UserId == userId);

            if (session != null)
            {
                session.RevokedAt = agora;
                await _db.SaveChangesAsync();
            }

            // A API sempre envia o cookie quando ele existe. Se essa sessão já
            // expirou/foi limpa, não há nada a revogar — e principalmente não
            // devemos derrubar os outros dispositivos como efeito colateral.
            return;
        }

        var sessions = await _db.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null)
            .ToListAsync();
        foreach (var s in sessions) s.RevokedAt = agora;

        var user = await _db.Users.FindAsync(userId);
        if (user != null)
        {
            user.RefreshToken       = null;
            user.RefreshTokenExpiry = null;
            user.UpdatedAt          = agora;
        }

        await _db.SaveChangesAsync();
    }

    // =========================================================================
    // HELPERS PRIVADOS
    // =========================================================================

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user, Guid? comandaId = null)
    {
        // Carrega perfil do Operator para incluir permissões no JWT
        string[]? permissions = null;
        if (user.Role == UserRole.Operator && user.PerfilId.HasValue)
        {
            var perfil = await _db.Perfis.FindAsync(user.PerfilId.Value);
            if (perfil != null)
            {
                try { permissions = System.Text.Json.JsonSerializer.Deserialize<string[]>(perfil.PermissoesJson); }
                catch { permissions = []; }
            }
        }

        var accessToken  = GenerateJwt(user, permissions);
        var refreshToken = GenerateRefreshToken();
        var agora        = DateTime.UtcNow;
        var expiresAt    = agora.AddMinutes(_jwt.AccessTokenExpirationMinutes);

        // Cada login/refresh abre a SUA sessão. As outras continuam de pé — é o que
        // deixa o lojista usar PDV, celular e tablet ao mesmo tempo sem se deslogar.
        // Armazena somente o hash SHA-256: o token bruto só sai no cookie HttpOnly,
        // então um vazamento do banco não entrega sessões utilizáveis.
        _db.UserSessions.Add(new UserSession
        {
            UserId    = user.Id,
            TokenHash = HashRefreshToken(refreshToken),
            ExpiresAt = agora.AddDays(_jwt.RefreshTokenExpirationDays),
            UserAgent = Truncate(_http.HttpContext?.Request.Headers.UserAgent.ToString(), 300),
            IpAddress = Truncate(_http.HttpContext?.Connection.RemoteIpAddress?.ToString(), 45),
        });

        // A coluna antiga só continua preenchida pra não quebrar sessão de quem ainda
        // não passou por um refresh depois do deploy; quem renova migra pra tabela.
        user.RefreshToken       = null;
        user.RefreshTokenExpiry = null;
        user.UpdatedAt          = agora;

        await _db.SaveChangesAsync();
        await LimparSessoesAsync(user.Id, agora);

        return new AuthResponse(accessToken, refreshToken, expiresAt, user.Role, user.Name, user.Id, comandaId, permissions);
    }

    /// <summary>
    /// Derruba todos os dispositivos do usuário. Usado na troca de senha e na
    /// anonimização LGPD — quem já estava logado tem que ser cortado junto.
    /// Não salva: quem chama já faz o SaveChanges do próprio fluxo.
    /// </summary>
    private async Task RevogarTodasAsSessoesAsync(Guid userId)
    {
        var sessoes = await _db.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null)
            .ToListAsync();

        var agora = DateTime.UtcNow;
        foreach (var s in sessoes) s.RevokedAt = agora;
    }

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null
        : value.Length <= max ? value
        : value[..max];

    /// <summary>
    /// Descarta sessões expiradas, revogadas ou já fora da janela de graça e mantém
    /// o teto por usuário — senão a tabela cresce sem parar com token de QR Code.
    /// </summary>
    private async Task LimparSessoesAsync(Guid userId, DateTime agora)
    {
        var limiteGraca = agora.AddSeconds(-_jwt.RefreshTokenGraceSeconds);

        var mortas = await _db.UserSessions
            .Where(s => s.UserId == userId &&
                   (s.ExpiresAt < agora ||
                    s.RevokedAt != null ||
                    (s.RotatedAt != null && s.RotatedAt < limiteGraca)))
            .ToListAsync();

        if (mortas.Count > 0) _db.UserSessions.RemoveRange(mortas);

        var vivas = await _db.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.ExpiresAt >= agora)
            .OrderByDescending(s => s.LastUsedAt)
            .Skip(_jwt.MaxSessionsPerUser)
            .ToListAsync();

        if (vivas.Count > 0) _db.UserSessions.RemoveRange(vivas);

        if (mortas.Count > 0 || vivas.Count > 0) await _db.SaveChangesAsync();
    }

    private string GenerateJwt(User user, string[]? permissions = null)
    {
        var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SecretKey));
        var creds   = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub,   user.Id.ToString()),
            new(JwtRegisteredClaimNames.Name,  user.Name),
            new(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()),
            new(ClaimTypes.Role,               user.Role)
        };

        if (!string.IsNullOrEmpty(user.Email))
            claims.Add(new(JwtRegisteredClaimNames.Email, user.Email));

        if (permissions != null && permissions.Length > 0)
            claims.Add(new("permissions", System.Text.Json.JsonSerializer.Serialize(permissions)));

        var token = new JwtSecurityToken(
            issuer:             _jwt.Issuer,
            audience:           _jwt.Audience,
            claims:             claims,
            expires:            DateTime.UtcNow.AddMinutes(_jwt.AccessTokenExpirationMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Gera um refresh token aleatório e seguro (256 bits).</summary>
    private static string GenerateRefreshToken()
    {
        var randomBytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    /// <summary>
    /// Retorna SHA-256 hex do token — o que é persistido no banco.
    /// O token bruto trafega apenas no cookie HttpOnly.
    /// </summary>
    private static string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    // =========================================================================
    // ACESSO DO CLIENTE PELO SITE
    // =========================================================================

    public async Task<CpfLookupResponse> LookupByCpfAsync(string cpf)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Cpf == cpf && u.IsActive);
        if (user == null)
            throw new KeyNotFoundException("CPF não encontrado. Acesse a loja e escaneie o QR Code para criar sua conta.");

        return new CpfLookupResponse(user.Name, user.PasswordHash != null);
    }

    public async Task<AuthResponse> SetupAccountAsync(SetupAccountRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Cpf == request.Cpf && u.IsActive);
        if (user == null)
            throw new KeyNotFoundException("CPF não encontrado.");

        var emailInUse = await _db.Users.AnyAsync(u => u.Email == request.Email.ToLowerInvariant() && u.Id != user.Id);
        if (emailInUse)
            throw new InvalidOperationException("Este e-mail já está em uso por outra conta.");

        user.Email        = request.Email.ToLowerInvariant();
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Conta ativada para cliente {Name}", user.Name);
        return await GenerateAuthResponseAsync(user);
    }

    // Completa o perfil da conta LOGADA — quick-login cria conta semi-criada (sem
    // e-mail/senha) e o site exige esta etapa: sem e-mail a redefinição de senha
    // não chega (incidente real com cliente da loja).
    public async Task CompleteProfileAsync(Guid userId, CompleteProfileRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive)
            ?? throw new KeyNotFoundException("Usuário não encontrado.");

        if (user.PasswordHash is not null && user.Email is not null)
            throw new InvalidOperationException("Esta conta já está completa.");

        var email = request.Email.Trim().ToLowerInvariant();
        var emailInUse = await _db.Users.AnyAsync(u => u.Email == email && u.Id != userId);
        if (emailInUse)
            throw new InvalidOperationException("Este e-mail já está em uso por outra conta.");

        user.Email        = email;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Perfil completado pelo próprio cliente {UserId}", userId);
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var email    = Identificadores.NormalizarEmail(request.Email)!;
        var cpf      = Identificadores.NormalizarCpf(request.Cpf);
        var whatsApp = Identificadores.NormalizarWhatsApp(request.WhatsApp);

        await GarantirIdentificadoresLivresAsync(_db, email, cpf, whatsApp);

        var user = new User
        {
            Name         = request.Name.Trim(),
            Email        = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            WhatsApp     = whatsApp,
            Cpf          = cpf,
            Role         = UserRole.Customer,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Nova conta criada via cadastro público: {Name} ({Email})", user.Name, user.Email);
        return await GenerateAuthResponseAsync(user);
    }

    /// <summary>
    /// Barra cadastro repetido comparando os identificadores JÁ NORMALIZADOS contra a
    /// base — e limpando também a coluna, porque cadastro antigo foi salvo formatado
    /// ("123.456.789-00", "(17) 99112-2890"). Sem isso o mesmo cliente entrava de novo
    /// só mudando a pontuação. Cada campo devolve a sua própria mensagem: quem está
    /// cadastrando precisa saber QUAL dado já existe, não um "erro ao criar conta".
    /// </summary>
    internal static async Task GarantirIdentificadoresLivresAsync(
        AppDbContext db, string? email, string? cpf, string? whatsApp, Guid? ignorarUserId = null)
    {
        var outros = ignorarUserId.HasValue
            ? db.Users.Where(u => u.Id != ignorarUserId.Value)
            : db.Users;

        if (email is not null && await outros.AnyAsync(u => u.Email != null && u.Email.ToLower() == email))
            throw new CadastroDuplicadoException("email",
                "Este e-mail já tem cadastro. Faça login ou use \"Esqueci minha senha\".");

        if (cpf is not null && await outros.AnyAsync(u => u.Cpf != null
                && u.Cpf.Replace(".", "").Replace("-", "").Replace(" ", "") == cpf))
            throw new CadastroDuplicadoException("cpf",
                "Este CPF já tem cadastro. Faça login ou use \"Esqueci minha senha\" — se não reconhece, fale com a loja.");

        // Compara com e sem o 55 do país em vez de remover "55" da string — remover
        // estragaria números que têm 55 no meio (ex: 17 99155-2890).
        var whatsAppComDdi = whatsApp is null ? null : "55" + whatsApp;
        if (whatsApp is not null && await outros.AnyAsync(u => u.WhatsApp != null
                && (u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                              .Replace("-", "").Replace("+", "") == whatsApp
                 || u.WhatsApp.Replace(" ", "").Replace("(", "").Replace(")", "")
                              .Replace("-", "").Replace("+", "") == whatsAppComDdi)))
            throw new CadastroDuplicadoException("whatsapp",
                "Este WhatsApp já tem cadastro. Faça login ou use \"Esqueci minha senha\".");
    }

    public async Task<AuthResponse> ClientLoginAsync(ClientLoginRequest request, string? dispositivo = null)
    {
        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email == request.Email.ToLowerInvariant() && u.IsActive && u.Role == UserRole.Customer);

        await ConferirSenhaAsync(user, request.Password, dispositivo);
        return await RespostaComDispositivoAsync(user!);
    }

    // =========================================================================
    // RECUPERAÇÃO DE SENHA
    // =========================================================================

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request)
    {
        // Sempre retorna sem erro — não revelar se email existe (evita user enumeration)
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email.ToLowerInvariant() && u.IsActive);

        if (user == null)
        {
            await Task.Delay(Random.Shared.Next(200, 500)); // timing equalization
            return;
        }

        // Gera token seguro e salva com expiração de 2h
        var tokenBytes = new byte[32];
        using var rng  = RandomNumberGenerator.Create();
        rng.GetBytes(tokenBytes);
        var token = Convert.ToBase64String(tokenBytes);

        user.PasswordResetToken       = token;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(2);
        user.UpdatedAt                = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _email.SendPasswordResetAsync(user.Email!, user.Name, token);
        _logger.LogInformation("Solicitação de reset de senha para {Email}", MaskEmail(request.Email));
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.PasswordResetToken == request.Token &&
            u.PasswordResetTokenExpiry > DateTime.UtcNow &&
            u.IsActive);

        if (user == null)
            throw new UnauthorizedAccessException("Token inválido ou expirado.");

        user.PasswordHash             = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.PasswordResetToken       = null;
        user.PasswordResetTokenExpiry = null;
        user.FalhasLogin              = 0;    // senha nova: destrava
        user.LoginBloqueadoAte        = null;
        user.RefreshToken             = null; // invalida sessões ativas
        user.RefreshTokenExpiry       = null;
        user.UpdatedAt                = DateTime.UtcNow;

        // As sessões agora moram em user_sessions: limpar a coluna antiga sozinha
        // deixaria os dispositivos já logados continuarem entrando com a senha velha.
        await RevogarTodasAsSessoesAsync(user.Id);

        await _db.SaveChangesAsync();
        _logger.LogInformation("Senha redefinida para usuário {UserId}", user.Id);
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var local = email[..at];
        var visible = local.Length > 1 ? local[0] + new string('*', Math.Min(local.Length - 1, 3)) : "*";
        return visible + email[at..];
    }
}
