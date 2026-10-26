# Mapa — Backend

> Gerado por `python scripts/gerar-mapa.py` — não edite à mão, rode o script de novo.

## Tabelas do PostgreSQL

O banco usa `EnsureCreated` (sem migrations). Tabela/coluna nova em banco que já existe precisa de SQL em `CardGameStore/Data/Inicializacao/` (postgres.sql e sqlite.sql) — a coluna "No startup" mostra quais já têm (`criada` = CREATE TABLE IF NOT EXISTS, `colunas` = ALTER TABLE).

| Tabela | Classe | DbSet | No startup | Arquivo |
|---|---|---|---|---|
| `alertas_sistema` | `AlertaSistema` | `AlertasSistema` | criada | `CardGameStore/Models/PostgreSQL/AlertaSistema.cs` |
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
| `funcionalidades` | `FuncionalidadeEstado` | `FuncionalidadesEstado` | criada | `CardGameStore/Models/PostgreSQL/FuncionalidadeEstado.cs` |
| `integration_configs` | `IntegrationConfig` | `IntegrationConfigs` | criada, colunas | `CardGameStore/Models/PostgreSQL/IntegrationConfig.cs` |
| `lgpd_requests` | `LgpdRequest` | `LgpdRequests` | colunas | `CardGameStore/Models/PostgreSQL/LgpdRequest.cs` |
| `liga_mensal_manual_entries` | `LigaMensalManualEntry` | `LigaMensalManualEntries` | criada | `CardGameStore/Models/PostgreSQL/LigaMensalManualEntry.cs` |
| `listing_interests` | `ListingInterest` | `ListingInterests` | criada, colunas | `CardGameStore/Models/PostgreSQL/CardListing.cs` |
| `marcos_operacao` | `MarcoOperacao` | `MarcosOperacao` | criada | `CardGameStore/Models/PostgreSQL/MarcoOperacao.cs` |
| `notifications` | `Notification` | `Notifications` | criada, colunas | `CardGameStore/Models/PostgreSQL/Notification.cs` |
| `pagamentos_crediario` | `PagamentoCrediario` | `PagamentosCrediario` | — | `CardGameStore/Models/PostgreSQL/PagamentoCrediario.cs` |
| `perfis` | `Perfil` | `Perfis` | criada | `CardGameStore/Models/PostgreSQL/Perfil.cs` |
| `pix_cobrancas` | `PixCobranca` | `PixCobrancas` | criada, colunas | `CardGameStore/Models/PostgreSQL/PixCobranca.cs` |
| `product_categories` | `ProductCategory` | `ProductCategories` | colunas | `CardGameStore/Models/PostgreSQL/ProductCategory.cs` |
| `product_reservations` | `ProductReservation` | `ProductReservations` | criada, colunas | `CardGameStore/Models/PostgreSQL/ProductReservation.cs` |
| `product_variants` | `ProductVariant` | `ProductVariants` | criada | `CardGameStore/Models/PostgreSQL/ProductVariant.cs` |
| `products` | `Product` | `Products` | colunas | `CardGameStore/Models/PostgreSQL/Product.cs` |
| `push_subscriptions` | `PushSubscription` | `PushSubscriptions` | criada | `CardGameStore/Models/PostgreSQL/PushSubscription.cs` |
| `site_config` | `SiteConfig` | `SiteConfigs` | criada, colunas | `CardGameStore/Models/PostgreSQL/SiteConfig.cs` |
| `timers` | `TimerEntity` | `Timers` | criada, colunas | `CardGameStore/Models/PostgreSQL/Timer.cs` |
| `torneio_partidas` | `TorneioPartida` | `TorneioPartidas` | criada, colunas | `CardGameStore/Models/PostgreSQL/Torneio.cs` |
| `torneio_rodadas` | `TorneioRodada` | `TorneioRodadas` | criada, colunas | `CardGameStore/Models/PostgreSQL/Torneio.cs` |
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
| `CardGameStore.Services.Vigia.VigiaBackgroundService` | roda o Vigia a cada 10 minutos (chave "vigia-sistema") | `CardGameStore/Services/Vigia/VigiaBackgroundService.cs` |
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
| Scoped | `PokemonFavoritoService` | `CardGameStore/Services/Implementations/PokemonFavoritoService.cs` |
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
| Scoped | `IAuditService → AuditService` | `CardGameStore/Services/Implementations/AuditService.cs` |
| Singleton | `OfxParserService` | `CardGameStore/Services/Implementations/OfxParserService.cs` |
| Singleton | `EncryptionService` | `CardGameStore/Services/Implementations/EncryptionService.cs` |
| Scoped | `InterSyncService` | `CardGameStore/Services/Implementations/InterSyncService.cs` |
| Scoped | `PedidoVendaService` | `CardGameStore/Services/Implementations/PedidoVendaService.cs` |
| Scoped | `CardGameStore.Services.Vigia.VigiaService` | `CardGameStore/Services/Vigia/VigiaService.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoPixPagoPedidoCancelado` | `CardGameStore/Services/Vigia/VerificacoesPedidos.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoPedidoPagoSemVenda` | `CardGameStore/Services/Vigia/VerificacoesPedidos.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoVendaTravada` | `CardGameStore/Services/Vigia/VerificacoesPedidos.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoValorPixDiferente` | `CardGameStore/Services/Vigia/VerificacoesPedidos.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoEstoqueNegativo` | `CardGameStore/Services/Vigia/VerificacoesPedidos.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoPedidoParado` | `CardGameStore/Services/Vigia/VerificacoesPedidos.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoComandaEsquecida` | `CardGameStore/Services/Vigia/VerificacoesOperacao.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoPixComandaSemFechar` | `CardGameStore/Services/Vigia/VerificacoesOperacao.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoTorneioNaoEncerrado` | `CardGameStore/Services/Vigia/VerificacoesOperacao.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoRobosParados` | `CardGameStore/Services/Vigia/VerificacoesOperacao.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoCrediarioSemAviso` | `CardGameStore/Services/Vigia/VerificacoesRotina.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoRodadaParada` | `CardGameStore/Services/Vigia/VerificacoesRotina.cs` |
| Scoped | `CardGameStore.Services.Vigia.IVerificacaoVigia → CardGameStore.Services.Vigia.VerificacaoBackupAtrasado` | `CardGameStore/Services/Vigia/VerificacoesRotina.cs` |
| Scoped | `IPixReconciliationService → PixReconciliationService` | `CardGameStore/Services/Implementations/PixReconciliationService.cs` |
| Scoped | `CrediarioAvisoService` | `CardGameStore/Services/Implementations/CrediarioAvisoService.cs` |
| Scoped | `CrediarioPixService` | `CardGameStore/Services/Implementations/CrediarioPixService.cs` |
| Singleton | `IValidadorGoogle → ValidadorGoogle` | `CardGameStore/Services/Implementations/LoginGoogle.cs` |
| Scoped | `CardGameStore.Services.Liga.TorneioService` | `CardGameStore/Services/Liga/TorneioService.cs` |
| Scoped | `CardGameStore.Services.Liga.LigaMensalService` | `CardGameStore/Services/Liga/LigaMensalService.cs` |
| Scoped | `CardGameStore.Services.Liga.EtapaExternaService` | `CardGameStore/Services/Liga/EtapaExternaService.cs` |
| Scoped | `CardGameStore.Services.Liga.LigaEstatisticasService` | `CardGameStore/Services/Liga/LigaEstatisticasService.cs` |
| Scoped | `FuncionalidadesService` | `CardGameStore/Services/Implementations/FuncionalidadesService.cs` |
| Singleton | `FotosLeves` | `CardGameStore/Services/Implementations/FotosLeves.cs` |
