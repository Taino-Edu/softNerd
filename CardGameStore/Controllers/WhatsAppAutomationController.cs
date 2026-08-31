using System.Security.Cryptography;
using System.Text;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/automation/whatsapp")]
[AllowAnonymous]
[EnableRateLimiting("automation")]
public sealed class WhatsAppAutomationController : ControllerBase
{
    private readonly IWhatsAppAutomationService _automation;
    private readonly IConfiguration _configuration;

    public WhatsAppAutomationController(
        IWhatsAppAutomationService automation,
        IConfiguration configuration)
    {
        _automation = automation;
        _configuration = configuration;
    }

    [HttpPost("message")]
    public async Task<IActionResult> Message(
        [FromBody] WhatsAppAutomationRequest request,
        CancellationToken cancellationToken)
    {
        if (!HasValidAutomationKey()) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Phone) || string.IsNullOrWhiteSpace(request.Text))
            return BadRequest(new { Message = "Phone e Text são obrigatórios." });

        var result = await _automation.ProcessarAsync(request, cancellationToken);
        return Ok(result);
    }

    [HttpGet("health")]
    public IActionResult Health()
    {
        if (!HasValidAutomationKey()) return Unauthorized();
        return Ok(new { status = "ok" });
    }

    private bool HasValidAutomationKey()
    {
        var expected = _configuration["WhatsAppAutomation:ApiKey"];
        var supplied = Request.Headers["X-Automation-Key"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(supplied)) return false;

        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var suppliedBytes = Encoding.UTF8.GetBytes(supplied);
        return expectedBytes.Length == suppliedBytes.Length &&
               CryptographicOperations.FixedTimeEquals(expectedBytes, suppliedBytes);
    }
}
