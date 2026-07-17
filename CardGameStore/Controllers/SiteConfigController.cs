// =============================================================================
// SiteConfigController.cs — Personalização da landing page (nome, textos, cores)
//
// GET /api/site-config  → público, a landing precisa carregar sem estar logado
// PUT /api/site-config  → Admin only
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/site-config")]
[Produces("application/json")]
public class SiteConfigController : ControllerBase
{
    private readonly AppDbContext _db;

    public SiteConfigController(AppDbContext db) => _db = db;

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> Get()
    {
        var cfg = await _db.SiteConfigs.FindAsync(SiteConfig.SingletonId) ?? new SiteConfig();
        return Ok(cfg);
    }

    [HttpPut]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Save([FromBody] SaveSiteConfigRequest req)
    {
        var cfg = await GetOrCreateConfigAsync();

        if (req.SiteName             is not null) cfg.SiteName             = req.SiteName;
        if (req.HeroSubtitle         is not null) cfg.HeroSubtitle         = req.HeroSubtitle;
        if (req.AddressLine          is not null) cfg.AddressLine          = req.AddressLine;
        if (req.ContactPersonName    is not null) cfg.ContactPersonName    = req.ContactPersonName;
        if (req.LogoUrl              is not null) cfg.LogoUrl              = req.LogoUrl;
        if (req.FaviconUrl           is not null) cfg.FaviconUrl           = req.FaviconUrl;
        if (req.PwaIconUrl           is not null) cfg.PwaIconUrl           = req.PwaIconUrl;
        if (req.AdminIconUrl         is not null) cfg.AdminIconUrl         = req.AdminIconUrl;
        if (req.WhatsappNumber       is not null) cfg.WhatsappNumber       = req.WhatsappNumber;
        if (req.ContactEmail         is not null) cfg.ContactEmail         = req.ContactEmail;
        if (req.NavTorneiosLabel     is not null) cfg.NavTorneiosLabel     = req.NavTorneiosLabel;
        if (req.NavProdutosLabel     is not null) cfg.NavProdutosLabel     = req.NavProdutosLabel;
        if (req.NavMercadoLabel      is not null) cfg.NavMercadoLabel      = req.NavMercadoLabel;
        if (req.NavPontosLabel       is not null) cfg.NavPontosLabel       = req.NavPontosLabel;
        if (req.NavLigaLabel         is not null) cfg.NavLigaLabel         = req.NavLigaLabel;
        if (req.CtaVerEventosLabel   is not null) cfg.CtaVerEventosLabel   = req.CtaVerEventosLabel;
        if (req.CtaVerTorneiosLabel  is not null) cfg.CtaVerTorneiosLabel  = req.CtaVerTorneiosLabel;
        if (req.CtaVerProdutosLabel  is not null) cfg.CtaVerProdutosLabel  = req.CtaVerProdutosLabel;
        if (req.TorneiosEyebrow      is not null) cfg.TorneiosEyebrow      = req.TorneiosEyebrow;
        if (req.TorneiosTitle        is not null) cfg.TorneiosTitle        = req.TorneiosTitle;
        if (req.ProdutosEyebrow      is not null) cfg.ProdutosEyebrow      = req.ProdutosEyebrow;
        if (req.ProdutosTitle        is not null) cfg.ProdutosTitle        = req.ProdutosTitle;
        if (req.PontosEyebrow        is not null) cfg.PontosEyebrow        = req.PontosEyebrow;
        if (req.PontosTitle          is not null) cfg.PontosTitle          = req.PontosTitle;
        if (req.PontosParagraph      is not null) cfg.PontosParagraph      = req.PontosParagraph;
        if (req.ColorPrimary         is not null) cfg.ColorPrimary         = req.ColorPrimary;
        if (req.ColorAccent          is not null) cfg.ColorAccent          = req.ColorAccent;
        if (req.ColorNavy            is not null) cfg.ColorNavy            = req.ColorNavy;
        if (req.ColorBackground      is not null) cfg.ColorBackground      = req.ColorBackground;
        if (req.ColorCard            is not null) cfg.ColorCard            = req.ColorCard;

        if (req.BorderRadiusStyle is not null)
        {
            if (BorderRadiusStyles.Valid.Contains(req.BorderRadiusStyle))
                cfg.BorderRadiusStyle = req.BorderRadiusStyle;
            else
                return BadRequest(new { Message = $"Estilo de arredondamento inválido. Use: {string.Join(", ", BorderRadiusStyles.Valid)}." });
        }

        cfg.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(cfg);
    }

    /// <summary>
    /// Busca a linha única de configuração pelo ID fixo, criando-a se necessário.
    /// Mesmo padrão de FiscalController.GetOrCreateConfigAsync.
    /// </summary>
    private async Task<SiteConfig> GetOrCreateConfigAsync()
    {
        var cfg = await _db.SiteConfigs.FindAsync(SiteConfig.SingletonId);
        if (cfg is not null) return cfg;

        cfg = new SiteConfig();
        _db.SiteConfigs.Add(cfg);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            _db.Entry(cfg).State = EntityState.Detached;
            cfg = await _db.SiteConfigs.FindAsync(SiteConfig.SingletonId)
                ?? throw new InvalidOperationException("Falha ao obter configuração do site após conflito de concorrência.");
        }

        return cfg;
    }
}

public static class BorderRadiusStyles
{
    public static readonly string[] Valid = { "Padrao", "Suave", "MuitoArredondado" };
}

public class SaveSiteConfigRequest
{
    public string? SiteName            { get; init; }
    public string? HeroSubtitle        { get; init; }
    public string? AddressLine         { get; init; }
    public string? ContactPersonName   { get; init; }
    public string? LogoUrl             { get; init; }
    public string? FaviconUrl          { get; init; }
    public string? PwaIconUrl          { get; init; }
    public string? AdminIconUrl        { get; init; }
    public string? WhatsappNumber      { get; init; }
    public string? ContactEmail        { get; init; }
    public string? NavTorneiosLabel    { get; init; }
    public string? NavProdutosLabel    { get; init; }
    public string? NavMercadoLabel     { get; init; }
    public string? NavPontosLabel      { get; init; }
    public string? NavLigaLabel        { get; init; }
    public string? CtaVerEventosLabel  { get; init; }
    public string? CtaVerTorneiosLabel { get; init; }
    public string? CtaVerProdutosLabel { get; init; }
    public string? TorneiosEyebrow     { get; init; }
    public string? TorneiosTitle       { get; init; }
    public string? ProdutosEyebrow     { get; init; }
    public string? ProdutosTitle       { get; init; }
    public string? PontosEyebrow       { get; init; }
    public string? PontosTitle         { get; init; }
    public string? PontosParagraph     { get; init; }
    public string? ColorPrimary        { get; init; }
    public string? ColorAccent         { get; init; }
    public string? ColorNavy           { get; init; }
    public string? ColorBackground     { get; init; }
    public string? ColorCard           { get; init; }
    public string? BorderRadiusStyle   { get; init; }
}
