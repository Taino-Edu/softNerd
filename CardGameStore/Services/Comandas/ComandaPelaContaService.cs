// =============================================================================
// ComandaPelaContaService.cs — cliente abre a comanda pela própria conta (v1.101.0, chave "comanda-pela-conta").
//
// Pedido do Maikon (25/11): o cliente abrir a comanda sem ler o QR Code da mesa. Pra não virar bagunça
// (gente pedindo do sofá e segurando estoque — cada item da comanda já baixa o estoque), existe a trava
// "Só abre na loja": ligada, o celular manda a localização e só abre dentro do raio da loja.
// A trava começa DESLIGADA: o dono marca o lugar da loja e o raio em Configurações quando quiser.
//
// O que a trava é e o que não é: a posição vem do celular, então dá pra falsificar (app de GPS falso).
// Ela segura o cliente comum de casa, não quem quer enganar — por isso é opcional.
// LGPD: a posição só serve pra medir a distância na hora; não é gravada nem vai pro log.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Configuration;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Comandas;

/// <summary>Posição do celular na hora de abrir. Precisão = raio de erro que o navegador informa.</summary>
public record LocalDoCliente(double Latitude, double Longitude, double? PrecisaoMetros);

/// <summary>O que a conta do cliente precisa saber pra mostrar o botão.</summary>
public record ComandaPelaContaStatus(bool Disponivel, bool PrecisaLocalizacao);

/// <summary>A trava como o dono vê e salva.</summary>
public record TravaLocalDto(bool Ligada, double? Latitude, double? Longitude, int RaioMetros);

public enum ResultadoTrava { Liberado, PrecisaLocalizacao, ForaDoRaio }

public interface IComandaPelaContaService
{
    Task<ComandaPelaContaStatus> StatusAsync();
    Task<ComandaDto> AbrirAsync(Guid userId, LocalDoCliente? local);
    Task<TravaLocalDto> LerTravaAsync();
    Task<TravaLocalDto> SalvarTravaAsync(TravaLocalDto pedido);
}

public class ComandaPelaContaService(
    AppDbContext db, IComandaService comandas, FuncionalidadesService funcionalidades,
    ILogger<ComandaPelaContaService> logger) : IComandaPelaContaService
{
    public const int RaioMinimo = 50;
    public const int RaioMaximo = 5000;
    /// <summary>Quanto da imprecisão do GPS a gente perdoa além do raio (iPhone sem "localização precisa" erra km).</summary>
    public const int ToleranciaMaxima = 200;

    public async Task<ComandaPelaContaStatus> StatusAsync()
    {
        if (!await funcionalidades.LigadaAsync(Funcionalidades.ComandaPelaConta))
            return new(false, false);
        var trava = await LerTravaAsync();
        return new(true, TravaValendo(trava));
    }

    public async Task<ComandaDto> AbrirAsync(Guid userId, LocalDoCliente? local)
    {
        if (!await funcionalidades.LigadaAsync(Funcionalidades.ComandaPelaConta))
            throw new RegraException("Abrir a comanda pela conta está desligado. Leia o QR Code da mesa ou peça no balcão.", 403);

        // Já tem comanda aberta: devolve ela, sem pedir localização de novo
        var aberta = await comandas.GetActiveComandaAsync(userId);
        if (aberta is not null) return aberta;

        var trava = await LerTravaAsync();
        var resultado = Conferir(trava, local, out var distancia);
        switch (resultado)
        {
            case ResultadoTrava.PrecisaLocalizacao:
                throw new RegraException(
                    "Pra abrir a comanda pela conta, libere a localização do celular. Ou leia o QR Code da mesa.", 400,
                    new Dictionary<string, object?> { ["codigo"] = "precisa-localizacao" });
            case ResultadoTrava.ForaDoRaio:
                logger.LogInformation("Comanda pela conta recusada: {UserId} a {Distancia} m da loja", userId, distancia);
                throw new RegraException(
                    "Parece que você não está na loja. A comanda pela conta só abre lá dentro — se já está aqui, leia o QR Code da mesa ou peça no balcão.", 403,
                    new Dictionary<string, object?> { ["codigo"] = "fora-da-loja", ["distanciaMetros"] = distancia });
        }

        var comanda = await comandas.OpenComandaAsync(userId, null);
        logger.LogInformation("Comanda {ComandaId} aberta pela conta do cliente {UserId}", comanda.Id, userId);
        return comanda;
    }

    public async Task<TravaLocalDto> LerTravaAsync()
    {
        var t = await db.SiteConfigs.AsNoTracking()
            .Where(s => s.Id == SiteConfig.SingletonId)
            .Select(s => new TravaLocalDto(s.TravaLocalLigada, s.LojaLatitude, s.LojaLongitude, s.TravaLocalRaioMetros))
            .FirstOrDefaultAsync();
        return t ?? new TravaLocalDto(false, null, null, 300);
    }

    public async Task<TravaLocalDto> SalvarTravaAsync(TravaLocalDto pedido)
    {
        if (pedido.RaioMetros is < RaioMinimo or > RaioMaximo)
            throw new RegraException($"O raio precisa ficar entre {RaioMinimo} e {RaioMaximo} metros.");
        if ((pedido.Latitude is null) != (pedido.Longitude is null))
            throw new RegraException("Informe latitude e longitude juntas.");
        if (pedido.Latitude is double lat && (lat < -90 || lat > 90 || pedido.Longitude!.Value < -180 || pedido.Longitude.Value > 180))
            throw new RegraException("Localização da loja inválida.");
        if (pedido.Ligada && pedido.Latitude is null)
            throw new RegraException("Marque onde a loja fica antes de ligar a trava.");

        var cfg = await db.SiteConfigs.FindAsync(SiteConfig.SingletonId);
        if (cfg is null)
        {
            cfg = new SiteConfig();
            db.SiteConfigs.Add(cfg);
        }
        cfg.TravaLocalLigada     = pedido.Ligada;
        cfg.LojaLatitude         = pedido.Latitude;
        cfg.LojaLongitude        = pedido.Longitude;
        cfg.TravaLocalRaioMetros = pedido.RaioMetros;
        cfg.UpdatedAt            = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await LerTravaAsync();
    }

    /// <summary>Trava só vale ligada E com o lugar da loja marcado.</summary>
    public static bool TravaValendo(TravaLocalDto t) => t.Ligada && t.Latitude is not null && t.Longitude is not null;

    /// <summary>
    /// Decide se pode abrir. Dentro = distância até a loja ≤ raio + parte da imprecisão do GPS
    /// (até <see cref="ToleranciaMaxima"/> m), pra não barrar quem está no balcão com sinal ruim.
    /// </summary>
    public static ResultadoTrava Conferir(TravaLocalDto trava, LocalDoCliente? local, out int? distanciaMetros)
    {
        distanciaMetros = null;
        if (!TravaValendo(trava)) return ResultadoTrava.Liberado;
        if (local is null || double.IsNaN(local.Latitude) || double.IsNaN(local.Longitude))
            return ResultadoTrava.PrecisaLocalizacao;

        var distancia = DistanciaEmMetros(trava.Latitude!.Value, trava.Longitude!.Value, local.Latitude, local.Longitude);
        distanciaMetros = (int)Math.Round(distancia);
        var tolerancia = Math.Clamp(local.PrecisaoMetros ?? 0, 0, ToleranciaMaxima);
        return distancia <= trava.RaioMetros + tolerancia ? ResultadoTrava.Liberado : ResultadoTrava.ForaDoRaio;
    }

    /// <summary>Distância em linha reta entre dois pontos (fórmula de Haversine), em metros.</summary>
    public static double DistanciaEmMetros(double lat1, double lon1, double lat2, double lon2)
    {
        const double raioTerra = 6_371_000;
        static double Rad(double g) => g * Math.PI / 180;
        var dLat = Rad(lat2 - lat1);
        var dLon = Rad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return raioTerra * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
