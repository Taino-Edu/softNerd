// =============================================================================
// LoginGoogle.cs — "Entrar com Google" (Google Identity Services)
//
// O navegador recebe do Google um ID token (JWT assinado pelo Google) e manda pra
// /api/auth/google. Aqui só conferimos a assinatura, o emissor e se o token foi
// emitido pro NOSSO Client ID — não existe chave secreta nesse fluxo.
//
// Desligado enquanto GoogleAuth:ClientId estiver vazio (o botão nem aparece).
// Só pra clientes: conta da equipe continua com e-mail e senha.
// =============================================================================

using Google.Apis.Auth;

namespace CardGameStore.Services.Implementations;

/// <summary>O que interessa do ID token do Google.</summary>
public sealed record DadosGoogle(string Sub, string Email, bool EmailVerificado, string? Nome);

/// <summary>Confere o ID token do Google. Interface pra os testes não dependerem do Google.</summary>
public interface IValidadorGoogle
{
    /// <returns>null se o token for inválido, vencido ou de outro Client ID.</returns>
    Task<DadosGoogle?> ValidarAsync(string idToken, string clientId);
}

public class ValidadorGoogle(ILogger<ValidadorGoogle> logger) : IValidadorGoogle
{
    public async Task<DadosGoogle?> ValidarAsync(string idToken, string clientId)
    {
        try
        {
            var p = await GoogleJsonWebSignature.ValidateAsync(idToken,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] });
            return new DadosGoogle(p.Subject, p.Email, p.EmailVerified, p.Name);
        }
        catch (InvalidJwtException ex)
        {
            logger.LogWarning("Token do Google recusado: {Msg}", ex.Message);
            return null;
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException or Newtonsoft.Json.JsonException)
        {
            // Token mal formado (lixo no corpo) estoura antes da validação — é só "inválido", não 500
            logger.LogWarning("Token do Google mal formado: {Tipo}", ex.GetType().Name);
            return null;
        }
    }
}

/// <summary>Login com Google recusado por regra (conta da equipe, e-mail não verificado...).</summary>
public class LoginGoogleRecusadoException(string message) : Exception(message);
