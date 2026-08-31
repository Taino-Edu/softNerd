using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.Services.Interfaces;

public interface IReservationPixService
{
    Task<ReservationPixResult> GerarAsync(
        Guid groupId,
        Guid solicitanteId,
        bool podeGerarParaTerceiros = false,
        CancellationToken cancellationToken = default);
}

public sealed record ReservationPixResult(
    bool Success,
    int StatusCode,
    string? Error,
    PixCobranca? Pix,
    bool Reused = false)
{
    public static ReservationPixResult Fail(int statusCode, string error) =>
        new(false, statusCode, error, null);

    public static ReservationPixResult Ok(PixCobranca pix, bool reused) =>
        new(true, StatusCodes.Status200OK, null, pix, reused);
}
