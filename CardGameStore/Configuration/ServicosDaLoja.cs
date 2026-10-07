// =============================================================================
// ServicosDaLoja.cs — registro de serviços, robôs e clientes HTTP externos
//
// Saiu do Program.cs pra ele ficar só com a ordem de montagem da aplicação.
// Serviço novo? Registre aqui, no grupo do assunto.
// =============================================================================

using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;

namespace CardGameStore.Configuration;

public static class ServicosDaLoja
{
    /// <summary>Clientes HTTP das APIs externas (cartas, cotação, IA, WhatsApp, ERP).</summary>
    public static IServiceCollection AddClientesExternos(this IServiceCollection services)
    {
        services.AddHttpClient("PokemonTcgApi", client =>
        {
            client.BaseAddress = new Uri("https://api.pokemontcg.io/");
            client.Timeout     = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
        });

        services.AddHttpClient("ScryfallApi", client =>
        {
            client.BaseAddress = new Uri("https://api.scryfall.com/");
            client.Timeout     = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            client.DefaultRequestHeaders.Add("User-Agent", "CardGameStore/1.0 (softnerd.com.br)");
        });

        services.AddHttpClient("YugiohApi", client =>
        {
            client.BaseAddress = new Uri("https://db.ygoprodeck.com/");
            client.Timeout     = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
        });

        // Banco Central (PTAX) — fonte PRIMÁRIA da cotação USD/BRL.
        // Oficial, pública, sem chave e sem limite prático de requisição. Virou primária depois
        // que a AwesomeAPI passou a devolver HTTP 429 pro IP do VPS (confirmado em 30/07/2026):
        // o código antigo batia nela a cada requisição sem cachear falha, e o IP foi bloqueado.
        services.AddHttpClient("BcbPtax", client =>
        {
            client.BaseAddress = new Uri("https://olinda.bcb.gov.br/");
            client.Timeout     = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
        });

        // AwesomeAPI — reserva. Cotação de mercado em tempo real (gratuita, sem autenticação).
        services.AddHttpClient("AwesomeApi", client =>
        {
            client.BaseAddress = new Uri("https://economia.awesomeapi.com.br/");
            // 10s como os outros clients externos. 5s era apertado pra uma API gratuita e
            // fazia o timeout cair no fallback com facilidade — e o fallback vira preço errado.
            client.Timeout     = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
        });

        // LoL Riftbound — Riftcodex API (gratuita, sem auth) https://api.riftcodex.com
        services.AddHttpClient("RiftboundApi", client =>
        {
            client.BaseAddress = new Uri("https://api.riftcodex.com/");
            client.Timeout     = TimeSpan.FromSeconds(15);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            client.DefaultRequestHeaders.Add("User-Agent", "CardGameStore/1.0 (softnerd.com.br)");
        });

        // Scrydex API — fonte paralela com preços de mercado (requer TcgSettings:ScrydexApiKey e ScrydexTeamId)
        services.AddHttpClient("ScrydexApi", client =>
        {
            client.BaseAddress = new Uri("https://api.scrydex.com/");
            client.Timeout     = TimeSpan.FromSeconds(15);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            client.DefaultRequestHeaders.Add("User-Agent", "CardGameStore/1.0 (softnerd.com.br)");
        });

        // OPTCG API — One Piece TCG (gratuita, sem auth, cobre OP-01..OP-15 + starter decks)
        services.AddHttpClient("OptcgApi", client =>
        {
            client.BaseAddress = new Uri("https://optcgapi.com/");
            client.Timeout     = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            client.DefaultRequestHeaders.Add("User-Agent", "CardGameStore/1.0 (softnerd.com.br)");
        });

        // TCGdex — fonte multilíngue de cartas Pokémon (suporte a português nativo, gratuita, sem auth)
        services.AddHttpClient("TcgDexApi", client =>
        {
            client.BaseAddress = new Uri("https://api.tcgdex.net/");
            client.Timeout     = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            client.DefaultRequestHeaders.Add("User-Agent", "CardGameStore/1.0 (softnerd.com.br)");
        });

        // Gemini 2.0 Flash — assistente IA conversacional
        services.AddHttpClient("gemini", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
        });

        services.AddHttpClient("evolution", (services, client) =>
        {
            var configuration = services.GetRequiredService<IConfiguration>();
            client.BaseAddress = new Uri(configuration["Evolution:BaseUrl"] ?? "http://evolution-api:8080/");
            client.Timeout = TimeSpan.FromSeconds(20);
        });

        services.AddHttpClient(TenantErpApiClient.HttpClientName, (services, client) =>
        {
            var options = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<TenantErpIntegrationOptions>>().Value;
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            client.DefaultRequestHeaders.Add("User-Agent", "SoftNerd/TenantErpIntegration");
        });

        return services;
    }

    /// <summary>Serviços de aplicação e robôs (BackgroundService).</summary>
    public static IServiceCollection AddServicosDaLoja(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IAuthService,         AuthService>();
        services.AddScoped<IComandaService,      ComandaService>();
        services.AddScoped<IProductService,      ProductService>();
        services.AddScoped<ICategoryService,     CategoryService>();
        services.AddScoped<IChampionshipService, ChampionshipService>();
        services.AddScoped<IUserService,         UserService>();
        services.AddScoped<IVendaAvulsaService,  VendaAvulsaService>();
        services.AddScoped<IAnnouncementService, AnnouncementService>();
        services.AddScoped<IEmailService,        EmailService>();
        services.AddScoped<IPushService,         PushService>();
        services.AddScoped<IReservationPixService, ReservationPixService>();
        services.AddScoped<IWhatsAppAutomationService, WhatsAppAutomationService>();
        services.AddScoped<IWhatsAppGateway, EvolutionWhatsAppGateway>();
        services.AddScoped<IWhatsAppPublicAiService, WhatsAppPublicAiService>();
        services.AddScoped<IAiChatService,       GeminiChatService>();
        services.AddSingleton<ITcgApiClient,     TcgApiClient>();
        services.AddSingleton<ITcgService,       TcgService>();
        services.AddSingleton<CurrencyService>();
        services.AddSingleton<ITenantErpApiClient, TenantErpApiClient>();
        services.AddMemoryCache();

        // LGPD — Auditoria e privacidade
        services.AddHttpContextAccessor();
        services.AddScoped<IAuditService, AuditService>();
        services.AddSingleton<OfxParserService>();
        services.AddScoped<SefazNfeService>();
        services.AddSingleton<EncryptionService>();
        services.AddScoped<InterSyncService>();
        services.AddHostedService<InterSyncBackgroundService>();

        // Fiscal — emissão de NFC-e, certificado A1, exportação de XMLs
        services.AddScoped<FiscalCertificadoService>();
        services.AddScoped<FiscalXmlExportService>();
        var useCentralFiscalEngine =
            configuration.GetValue<bool>("TenantErp:UseCentralFiscalEngine") &&
            configuration.GetValue<bool>("TenantErp:Enabled");
        if (useCentralFiscalEngine)
            services.AddScoped<INfceEmissionService, TenantErpNfceEmissionService>();
        else
            services.AddScoped<INfceEmissionService, NfceEmissionService>();
        services.AddHostedService<FiscalRetryBackgroundService>();
        if (!useCentralFiscalEngine)
        {
            services.AddHostedService<FiscalAlertBackgroundService>();
            services.AddHostedService<FiscalXmlExportBackgroundService>();
            services.AddHostedService<SefazDistBackgroundService>();
        }

        // Pix — sem webhook do Inter: o robô reconcilia cobranças ATIVA a cada 5 min e
        // dá a baixa por origem (mesmo caminho dos controllers, com claim atômico no
        // banco pra reconciliação concorrente não aplicar efeito duas vezes).
        services.AddScoped<IPixReconciliationService, PixReconciliationService>();
        services.AddHostedService<PixReconciliationBackgroundService>();

        // Crediário — lembretes de vencimento (cliente: sininho/push, e-mail, WhatsApp;
        // admin: resumo do dia). Configurado em /admin/crediario → Avisos automáticos.
        services.AddScoped<CrediarioAvisoService>();
        services.AddScoped<CrediarioPixService>();
        services.AddHostedService<CrediarioAvisoBackgroundService>();

        return services;
    }
}
