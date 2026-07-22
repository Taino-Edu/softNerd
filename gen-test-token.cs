// ============================================================================
// Gera um token JWT de teste pra fazer curl nos endpoints de admin
// Uso: dotnet run --project CardGameStore gen-test-token
// ============================================================================

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

var secretKey = "SUBSTITUA_ESTA_CHAVE_POR_UMA_STRING_SECRETA_E_FORTE_EM_PRODUCAO";
var key = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(secretKey));

var claims = new[]
{
    new Claim(ClaimTypes.Email, "admin@cardgamestore.com.br"),
    new Claim(ClaimTypes.NameIdentifier, "00000000-0000-0000-0000-000000000001"),
    new Claim("role", "Admin"),
};

var tokenHandler = new JwtSecurityTokenHandler();
var tokenDescriptor = new SecurityTokenDescriptor
{
    Subject = new ClaimsIdentity(claims),
    Expires = DateTime.UtcNow.AddHours(8),
    Issuer = "https://localhost:5001",
    Audience = "CardGameStore-Frontend",
    SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256Signature),
};

var token = tokenHandler.CreateToken(tokenDescriptor);
Console.WriteLine(tokenHandler.WriteToken(token));
