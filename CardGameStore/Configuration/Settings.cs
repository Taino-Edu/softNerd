namespace CardGameStore.Configuration;

public class JwtSettings
{
    public string SecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int AccessTokenExpirationMinutes { get; set; } = 60;
    public int RefreshTokenExpirationDays { get; set; } = 30;

    /// <summary>
    /// Janela em que o refresh token recém-rotacionado ainda é aceito. Sem ela,
    /// duas abas renovando ao mesmo tempo derrubam a sessão: a segunda chega com
    /// o token que a primeira acabou de trocar e leva 401.
    /// </summary>
    public int RefreshTokenGraceSeconds { get; set; } = 120;

    /// <summary>Máximo de sessões ativas por usuário (PDV, celular, tablet...).</summary>
    public int MaxSessionsPerUser { get; set; } = 20;
}

/// <summary>
/// "Entrar com Google" (Services/Implementations/LoginGoogle.cs). Só o Client ID — o
/// fluxo de ID token não usa chave secreta. Vazio = desligado (o botão nem aparece).
/// Em produção: variável de ambiente GoogleAuth__ClientId.
/// </summary>
public class GoogleAuthSettings
{
    public string ClientId { get; set; } = string.Empty;
    public bool Ativo => !string.IsNullOrWhiteSpace(ClientId);
}

public class MongoDbSettings
{
    public string ConnectionString { get; set; } = "mongodb://localhost:27017";
    public string DatabaseName { get; set; } = "cardgamestore_cache";
}
