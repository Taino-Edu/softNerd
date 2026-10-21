// =============================================================================
// FiscalAlertBackgroundService.cs — Verifica diariamente o vencimento do
// certificado fiscal e alerta os admins em 30/15/7/1 dias (dashboard + email).
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using CardGameStore.Services.Vigia;

namespace CardGameStore.Services.Implementations;

public class FiscalAlertBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FiscalAlertBackgroundService> _logger;

    public FiscalAlertBackgroundService(IServiceScopeFactory scopeFactory, ILogger<FiscalAlertBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // aguarda 2 min após startup para não competir com EnsureCreated
        BatimentoRobos.Iniciou("Certificado fiscal (vencimento)", TimeSpan.FromMinutes(2), TimeSpan.FromHours(12)); // Vigia: robô parado vira alerta
        await Task.Delay(TimeSpan.FromMinutes(2), ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await CheckAsync();
                BatimentoRobos.Bateu("Certificado fiscal (vencimento)");
            }
            catch (Exception ex)
            {
                BatimentoRobos.Falhou("Certificado fiscal (vencimento)", ex);
                _logger.LogError(ex, "Erro ao checar vencimento do certificado fiscal");
            }

            await Task.Delay(TimeSpan.FromHours(12), ct);
        }
    }

    private async Task CheckAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var cfg = await db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        if (cfg?.CertificadoValidade is null) return;

        var diasRestantes = (int)Math.Floor((cfg.CertificadoValidade.Value.Date - DateTime.UtcNow.Date).TotalDays);
        var limiar = FiscalAlertCalculator.ProximoLimiarParaAlertar(diasRestantes, cfg.CertificadoUltimoAlertaLimiar);
        if (limiar is null) return;

        var admins = await db.Users
            .Where(u => u.Role == UserRole.Admin && u.IsActive)
            .Select(u => new { u.Id, u.Name, u.Email })
            .ToListAsync();

        foreach (var admin in admins)
        {
            db.Notifications.Add(new Notification
            {
                UserId = admin.Id,
                Title  = "Certificado fiscal vencendo",
                Body   = $"Faltam {diasRestantes} dia(s) para o certificado A1 vencer " +
                          $"({cfg.CertificadoValidade.Value:dd/MM/yyyy}). Atualize em Admin > Fiscal.",
                Link   = "/admin/fiscal",
            });

            if (!string.IsNullOrWhiteSpace(admin.Email))
                await email.SendCertificadoVencendoAsync(admin.Email, admin.Name, diasRestantes, cfg.CertificadoValidade.Value);
        }

        cfg.CertificadoUltimoAlertaLimiar = limiar.Value;
        cfg.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        _logger.LogInformation(
            "Alerta de certificado fiscal disparado — limiar {Limiar} dias, {Count} admins notificados",
            limiar, admins.Count);
    }
}
