# Mapa — Backend

> Gerado por `python scripts/gerar-mapa.py` — não edite à mão, rode o script de novo.

## Tabelas do PostgreSQL

O banco usa `EnsureCreated` (sem migrations). Tabela/coluna nova em banco que já existe precisa de SQL em `CardGameStore/Data/Inicializacao/` (postgres.sql e sqlite.sql) — a coluna "No startup" mostra quais já têm (`criada` = CREATE TABLE IF NOT EXISTS, `colunas` = ALTER TABLE).

| Tabela | Classe | DbSet | No startup | Arquivo |
|---|---|---|---|---|
| `announcements` | `Announcement` | `Announcements` | — | `CardGameStore/Models/PostgreSQL/Announcement.cs` |
| `audit_logs` | `AuditLog` | `AuditLogs` | — | `CardGameStore/Models/PostgreSQL/AuditLog.cs` |
| `card_listings` | `CardListing` | `CardListings` | criada | `CardGameStore/Models/PostgreSQL/CardListing.cs` |
| `championship_participants` | `ChampionshipParticipant` | `ChampionshipParticipants` | colunas | `CardGameStore/Models/PostgreSQL/Championship.cs` |
| `championship_preinscricoes` | `ChampionshipPreInscricao` | `ChampionshipPreInscricoes` | colunas | `CardGameStore/Models/PostgreSQL/Championship.cs` |
| `championships` | `Championship` | `Championships` | colunas | `CardGameStore/Models/PostgreSQL/Championship.cs` |
| `comanda_items` | `ComandaItem` | `ComandaItems` | colunas | `CardGameStore/Models/PostgreSQL/ComandaItem.cs` |
| `comandas` | `Comanda` | `Comandas` | colunas | `CardGameStore/Models/PostgreSQL/Comanda.cs` |
| `cookie_consents` | `CookieConsent` | `CookieConsents` | — | `CardGameStore/Models/PostgreSQL/CookieConsent.cs` |
| `crediario_aviso_config` | `CrediarioAvisoConfig` | `CrediarioAvisoConfigs` | criada | `CardGameStore/Models/PostgreSQL/CrediarioAviso.cs` |
| `crediario_avisos` | `CrediarioAviso` | `CrediarioAvisos` | criada | `CardGameStore/Models/PostgreSQL/CrediarioAviso.cs` |
| `crediario_lancamentos` | `CrediarioLancamento` | `CrediarioLancamentos` | criada | `CardGameStore/Models/PostgreSQL/CrediarioLancamento.cs` |
| `crediarios` | `Crediario` | `Crediarios` | colunas | `CardGameStore/Models/PostgreSQL/Crediario.cs` |
| `decks` | `Deck` | `Decks` | criada | `CardGameStore/Models/PostgreSQL/Deck.cs` |
| `external_transactions` | `ExternalTransaction` | `ExternalTransactions` | criada | `CardGameStore/Models/PostgreSQL/ExternalTransaction.cs` |
| `fiscal_config` | `FiscalConfig` | `FiscalConfigs` | criada, colunas | `CardGameStore/Models/PostgreSQL/FiscalConfig.cs` |
| `integration_configs` | `IntegrationConfig` | `IntegrationConfigs` | criada, colunas | `CardGameStore/Models/PostgreSQL/IntegrationConfig.cs` |
| `lgpd_requests` | `LgpdRequest` | `LgpdRequests` | colunas | `CardGameStore/Models/PostgreSQL/LgpdRequest.cs` |
| `liga_mensal_manual_entries` | `LigaMensalManualEntry` | `LigaMensalManualEntries` | criada | `CardGameStore/Models/PostgreSQL/LigaMensalManualEntry.cs` |
| `listing_interests` | `ListingInterest` | `ListingInterests` | criada, colunas | `CardGameStore/Models/PostgreSQL/CardListing.cs` |
| `naturezas_operacao` | `NaturezaOperacao` | `NaturezasOperacao` | criada, colunas | `CardGameStore/Models/PostgreSQL/NaturezaOperacao.cs` |
| `notas_destinadas` | `NotaDestinada` | `NotasDestinadas` | criada | `CardGameStore/Models/PostgreSQL/NotaDestinada.cs` |
| `notas_fiscais_emitidas` | `NotaFiscalEmitida` | `NotasFiscaisEmitidas` | criada, colunas | `CardGameStore/Models/PostgreSQL/NotaFiscalEmitida.cs` |
| `notifications` | `Notification` | `Notifications` | criada, colunas | `CardGameStore/Models/PostgreSQL/Notification.cs` |
| `pagamentos_crediario` | `PagamentoCrediario` | `PagamentosCrediario` | — | `CardGameStore/Models/PostgreSQL/PagamentoCrediario.cs` |
| `perfis` | `Perfil` | `Perfis` | criada | `CardGameStore/Models/PostgreSQL/Perfil.cs` |
| `pix_cobrancas` | `PixCobranca` | `PixCobrancas` | criada, colunas | `CardGameStore/Models/PostgreSQL/PixCobranca.cs` |
| `product_categories` | `ProductCategory` | `ProductCategories` | colunas | `CardGameStore/Models/PostgreSQL/ProductCategory.cs` |
| `product_reservations` | `ProductReservation` | `ProductReservations` | criada, colunas | `CardGameStore/Models/PostgreSQL/ProductReservation.cs` |
| `product_variants` | `ProductVariant` | `ProductVariants` | criada | `CardGameStore/Models/PostgreSQL/ProductVariant.cs` |
| `product_waitlist` | `ProductWaitList` | `ProductWaitLists` | criada, colunas | `CardGameStore/Models/PostgreSQL/ProductWaitList.cs` |
| `products` | `Product` | `Products` | colunas | `CardGameStore/Models/PostgreSQL/Product.cs` |
| `push_subscriptions` | `PushSubscription` | `PushSubscriptions` | criada | `CardGameStore/Models/PostgreSQL/PushSubscription.cs` |
| `site_config` | `SiteConfig` | `SiteConfigs` | criada, colunas | `CardGameStore/Models/PostgreSQL/SiteConfig.cs` |
| `timers` | `TimerEntity` | `Timers` | criada | `CardGameStore/Models/PostgreSQL/Timer.cs` |
| `user_sessions` | `UserSession` | `UserSessions` | criada | `CardGameStore/Models/PostgreSQL/UserSession.cs` |
| `users` | `User` | `Users` | colunas | `CardGameStore/Models/PostgreSQL/User.cs` |
| `whatsapp_conversations` | `WhatsAppConversation` | `WhatsAppConversations` | criada, colunas | `CardGameStore/Models/PostgreSQL/WhatsAppConversation.cs` |
| `whatsapp_inbound_events` | `WhatsAppInboundEvent` | `WhatsAppInboundEvents` | criada | `CardGameStore/Models/PostgreSQL/WhatsAppInboundEvent.cs` |
| `whatsapp_outbound_messages` | `WhatsAppOutboundMessage` | `WhatsAppOutboundMessages` | criada | `CardGameStore/Models/PostgreSQL/WhatsAppOutboundMessage.cs` |

## MongoDB

| Classe | Arquivo |
|---|---|
| `CardCache` | `CardGameStore/Models/MongoDB/CardCache.cs` |
| `CardAllPricesCache` | `CardGameStore/Models/MongoDB/CardCache.cs` |
| `CardMarketCache` | `CardGameStore/Models/MongoDB/CardCache.cs` |
| `CardAttackCache` | `CardGameStore/Models/MongoDB/CardCache.cs` |
| `CardWeaknessCache` | `CardGameStore/Models/MongoDB/CardCache.cs` |
| `CardPrices` | `CardGameStore/Models/MongoDB/CardCache.cs` |
| `VendaAvulsa` | `CardGameStore/Models/MongoDB/VendaAvulsa.cs` |
| `VendaAvulsaItem` | `CardGameStore/Models/MongoDB/VendaAvulsa.cs` |

## Robôs em segundo plano (rodam sozinhos)

| Classe | O que faz | Arquivo |
|---|---|---|
| `InterSyncBackgroundService` | — | `CardGameStore/Services/Implementations/InterSyncService.cs` |
| `FiscalRetryBackgroundService` | Contingência: reprocessa periodicamente | `CardGameStore/Services/Implementations/FiscalRetryBackgroundService.cs` |
| `FiscalAlertBackgroundService` | Verifica diariamente o vencimento do | `CardGameStore/Services/Implementations/FiscalAlertBackgroundService.cs` |
| `FiscalXmlExportBackgroundService` | Todo dia 1 (fuso de Brasília), gera e | `CardGameStore/Services/Implementations/FiscalXmlExportBackgroundService.cs` |
| `SefazDistBackgroundService` | "DDA" fiscal: roda a Manifestação do | `CardGameStore/Services/Implementations/SefazDistBackgroundService.cs` |
| `PixReconciliationBackgroundService` | Robô de confirmação de Pix. | `CardGameStore/Services/Implementations/PixReconciliationBackgroundService.cs` |
| `CrediarioAvisoBackgroundService` | Roda os lembretes de vencimento do | `CardGameStore/Services/Implementations/CrediarioAvisoBackgroundService.cs` |

## Serviços registrados (injeção de dependência)

| Tipo | Serviço | Arquivo |
|---|---|---|
| Scoped | `IAuthService → AuthService` | `CardGameStore/Services/Implementations/AuthService.cs` |
| Scoped | `IComandaService → ComandaService` | `CardGameStore/Services/Implementations/ComandaService.cs` |
| Scoped | `IProductService → ProductService` | `CardGameStore/Services/Implementations/ProductService.cs` |
| Scoped | `ICategoryService → CategoryService` | `CardGameStore/Services/Implementations/CategoryService.cs` |
| Scoped | `IChampionshipService → ChampionshipService` | `CardGameStore/Services/Implementations/ChampionshipService.cs` |
| Scoped | `IUserService → UserService` | `CardGameStore/Services/Implementations/UserService.cs` |
| Scoped | `IVendaAvulsaService → VendaAvulsaService` | `CardGameStore/Services/Implementations/VendaAvulsaService.cs` |
| Scoped | `IAnnouncementService → AnnouncementService` | `CardGameStore/Services/Implementations/AnnouncementService.cs` |
| Scoped | `IEmailService → EmailService` | `CardGameStore/Services/Implementations/EmailService.cs` |
| Scoped | `IPushService → PushService` | `CardGameStore/Services/Implementations/PushService.cs` |
| Scoped | `IReservationPixService → ReservationPixService` | `CardGameStore/Services/Implementations/ReservationPixService.cs` |
| Scoped | `IWhatsAppAutomationService → WhatsAppAutomationService` | `CardGameStore/Services/Implementations/WhatsAppAutomationService.cs` |
| Scoped | `IWhatsAppGateway → EvolutionWhatsAppGateway` | `CardGameStore/Services/Implementations/EvolutionWhatsAppGateway.cs` |
| Scoped | `IWhatsAppPublicAiService → WhatsAppPublicAiService` | `CardGameStore/Services/Implementations/WhatsAppPublicAiService.cs` |
| Scoped | `IAiChatService → GeminiChatService` | `CardGameStore/Services/Implementations/GeminiChatService.cs` |
| Singleton | `ITcgApiClient → TcgApiClient` | `CardGameStore/Services/Implementations/TcgApiClient.cs` |
| Singleton | `ITcgService → TcgService` | `CardGameStore/Services/Implementations/TcgService.cs` |
| Singleton | `CurrencyService` | `CardGameStore/Services/Implementations/CurrencyService.cs` |
| Singleton | `ITenantErpApiClient → TenantErpApiClient` | `CardGameStore/Services/Implementations/TenantErpApiClient.cs` |
| Scoped | `IAuditService → AuditService` | `CardGameStore/Services/Implementations/AuditService.cs` |
| Singleton | `OfxParserService` | `CardGameStore/Services/Implementations/OfxParserService.cs` |
| Scoped | `SefazNfeService` | `CardGameStore/Services/Implementations/SefazNfeService.cs` |
| Singleton | `EncryptionService` | `CardGameStore/Services/Implementations/EncryptionService.cs` |
| Scoped | `InterSyncService` | `CardGameStore/Services/Implementations/InterSyncService.cs` |
| Scoped | `FiscalCertificadoService` | `CardGameStore/Services/Implementations/FiscalCertificadoService.cs` |
| Scoped | `FiscalXmlExportService` | `CardGameStore/Services/Implementations/FiscalXmlExportService.cs` |
| Scoped | `INfceEmissionService → TenantErpNfceEmissionService` | `CardGameStore/Services/Implementations/TenantErpNfceEmissionService.cs` |
| Scoped | `INfceEmissionService → NfceEmissionService` | `CardGameStore/Services/Implementations/NfceEmissionService.cs` |
| Scoped | `IPixReconciliationService → PixReconciliationService` | `CardGameStore/Services/Implementations/PixReconciliationService.cs` |
| Scoped | `CrediarioAvisoService` | `CardGameStore/Services/Implementations/CrediarioAvisoService.cs` |
| Scoped | `CrediarioPixService` | `CardGameStore/Services/Implementations/CrediarioPixService.cs` |
