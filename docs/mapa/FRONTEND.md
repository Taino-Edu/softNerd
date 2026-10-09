# Mapa — Frontend

> Gerado por `python scripts/gerar-mapa.py` — não edite à mão, rode o script de novo.

## Páginas (URL → arquivo)

| URL | Arquivo | Componentes usados |
|---|---|---|
| `/admin/anuncios` | `app/admin/anuncios/page.tsx` | `admin/ImageUpload`, `ui/PageHeader` |
| `/admin/campeonatos/[id]/torneio` | `app/admin/campeonatos/[id]/torneio/page.tsx` | `liga/Relogio`, `liga/TabelaTorneio`, `ui/Switch` |
| `/admin/campeonatos` | `app/admin/campeonatos/page.tsx` | `admin/ConferenciaDecksModal`, `admin/DeckViewerModal`, `ui/Badge` |
| `/admin/cartas` | `app/admin/cartas/page.tsx` | — |
| `/admin/categorias` | `app/admin/categorias/page.tsx` | `ui/Badge`, `ui/Table` |
| `/admin/changelog` | `app/admin/changelog/page.tsx` | `ui/PageHeader` |
| `/admin/clientes/analises` | `app/admin/clientes/analises/page.tsx` | `admin/TopClientes` |
| `/admin/configuracoes` | `app/admin/configuracoes/page.tsx` | `ui/PageHeader`, `ui/Switch` |
| `/admin/contas-receber` | `app/admin/contas-receber/page.tsx` | `ui/Badge`, `ui/PageHeader` |
| `/admin/crediario` | `app/admin/crediario/page.tsx` | `admin/CobrancaPixModal`, `admin/CrediarioAvisos`, `ui/Badge`, `ui/PageHeader` |
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` | `CameraScanner`, `admin/CobrancaPixModal`, `admin/ConferenciaButton`, `admin/EscolherContaCrediarioModal`, `admin/PercentPicker`, `admin/TopClientes` |
| `/admin/estoque` | `app/admin/estoque/page.tsx` | `CameraScanner`, `admin/ImageUpload`, `ui/Badge`, `ui/Switch`, `ui/Table` |
| `/admin/financeiro` | `app/admin/financeiro/page.tsx` | — |
| `/admin/fiscal/cupom/[id]` | `app/admin/fiscal/cupom/[id]/page.tsx` | — |
| `/admin/fiscal` | `app/admin/fiscal/page.tsx` | `ui/PageHeader`, `ui/Switch` |
| `/admin/integracoes` | `app/admin/integracoes/page.tsx` | `ui/Badge`, `ui/PageHeader` |
| `/admin/lgpd/documento/[id]` | `app/admin/lgpd/documento/[id]/page.tsx` | — |
| `/admin/lgpd` | `app/admin/lgpd/page.tsx` | `ui/Badge`, `ui/PageHeader`, `ui/Table` |
| `/admin/liga-mensal` | `app/admin/liga-mensal/page.tsx` | `ui/PageHeader` |
| `/admin/manual` | `app/admin/manual/page.tsx` | — |
| `/admin/marketplace` | `app/admin/marketplace/page.tsx` | `ui/PageHeader`, `ui/Table` |
| `/admin/mensageria` | `app/admin/mensageria/page.tsx` | `ui/PageHeader` |
| `/admin/perfis` | `app/admin/perfis/page.tsx` | `ui/PageHeader` |
| `/admin/qrcodes` | `app/admin/qrcodes/page.tsx` | — |
| `/admin/relatorios` | `app/admin/relatorios/page.tsx` | `ui/PageHeader` |
| `/admin/reservas` | `app/admin/reservas/page.tsx` | `PixReservaModal`, `admin/PercentPicker`, `ui/PageHeader` |
| `/admin/site` | `app/admin/site/page.tsx` | `ui/PageHeader` |
| `/admin/sobre` | `app/admin/sobre/page.tsx` | `ui/PageHeader` |
| `/admin/timer` | `app/admin/timer/page.tsx` | `ui/Switch` |
| `/admin/usuarios` | `app/admin/usuarios/page.tsx` | `admin/DeckViewerModal`, `ui/Badge` |
| `/admin/venda-avulsa` | `app/admin/venda-avulsa/page.tsx` | `admin/ConferenciaButton`, `admin/EscolherContaCrediarioModal`, `admin/PercentPicker`, `admin/VariantPicker`, `ui/PageHeader` |
| `/admin/whatsapp` | `app/admin/whatsapp/page.tsx` | `admin/whatsapp/WhatsAppInbox`, `ui/PageHeader` |
| `/cadastro` | `app/cadastro/page.tsx` | — |
| `/campeonato/[id]` | `app/campeonato/[id]/page.tsx` | — |
| `/cliente/configuracoes` | `app/cliente/configuracoes/page.tsx` | — |
| `/cliente/decks/[id]` | `app/cliente/decks/[id]/page.tsx` | — |
| `/cliente/decks` | `app/cliente/decks/page.tsx` | — |
| `/cliente/mercado` | `app/cliente/mercado/page.tsx` | — |
| `/cliente/notas/[id]` | `app/cliente/notas/[id]/page.tsx` | — |
| `/cliente` | `app/cliente/page.tsx` | `cliente/NotificationBell` |
| `/cliente/perfil` | `app/cliente/perfil/page.tsx` | `PixReservaModal`, `cliente/ContaCrediarioCliente` |
| `/cliente/reserva/carrinho` | `app/cliente/reserva/carrinho/page.tsx` | — |
| `/entrar` | `app/entrar/page.tsx` | `GoogleLoginButton` |
| `/janela/whatsapp` | `app/janela/whatsapp/page.tsx` | `admin/whatsapp/WhatsAppInbox` |
| `/lgpd` | `app/lgpd/page.tsx` | `ThemeToggle` |
| `/liga/jogar` | `app/liga/jogar/page.tsx` | `liga/Relogio`, `liga/TabelaTorneio` |
| `/liga` | `app/liga/page.tsx` | — |
| `/liga/torneio/[id]` | `app/liga/torneio/[id]/page.tsx` | `liga/Relogio`, `liga/TabelaTorneio` |
| `/login` | `app/login/page.tsx` | — |
| `/mesa/[mesa]` | `app/mesa/[mesa]/page.tsx` | `GoogleLoginButton` |
| `/pagar/[token]` | `app/pagar/[token]/page.tsx` | — |
| `/` | `app/page.tsx` | — |
| `/perfil/[id]` | `app/perfil/[id]/page.tsx` | — |
| `/primeiro-acesso` | `app/primeiro-acesso/page.tsx` | — |
| `/privacidade` | `app/privacidade/page.tsx` | `LegalActions`, `ThemeToggle` |
| `/produtos/[id]` | `app/produtos/[id]/page.tsx` | — |
| `/produtos` | `app/produtos/page.tsx` | — |
| `/reset-password` | `app/reset-password/page.tsx` | — |
| `/termos` | `app/termos/page.tsx` | `LegalActions`, `ThemeToggle` |

## Componentes (onde cada um é usado)

Mudou um componente? Confira as telas da última coluna.

| Componente | Exporta | Usado em |
|---|---|---|
| `CameraScanner` | `CameraScanner` | `app/admin/dashboard/page.tsx`<br>`app/admin/estoque/page.tsx` |
| `ClientProviders` | `ClientProviders` | `app/layout.tsx` |
| `CompleteProfileGuard` | `CompleteProfileGuard` | `app/cliente/layout.tsx` |
| `CookieBanner` | `CookieBanner` | `app/layout.tsx` |
| `CookieSettingsButton` | `CookieSettingsButton` | `components/Footer.tsx` |
| `Footer` | `Footer` | `app/layout.tsx` |
| `GoogleLoginButton` | `GoogleLoginButton` | `app/entrar/page.tsx`<br>`app/mesa/[mesa]/page.tsx` |
| `LegalActions` | `LegalActions` | `app/privacidade/page.tsx`<br>`app/termos/page.tsx` |
| `PWAInstallButton` | `PWAInstallButton` | `app/layout.tsx` |
| `PixReservaModal` | `PixReservaModal` | `app/admin/reservas/page.tsx`<br>`app/cliente/perfil/page.tsx` |
| `ThemeToggle` | `ThemeToggle` | `app/lgpd/page.tsx`<br>`app/privacidade/page.tsx`<br>`app/termos/page.tsx`<br>`components/admin/Sidebar.tsx` |
| `TimerWidget` | `TimerWidget` | `app/admin/layout.tsx` |
| `VLibrasController` | `VLibrasController` | `app/layout.tsx` |
| `admin/AiChatWidget` | `AiChatWidget` | `app/admin/layout.tsx` |
| `admin/CobrancaPixModal` | `CobrancaPixModal` | `app/admin/crediario/page.tsx`<br>`app/admin/dashboard/page.tsx` |
| `admin/ConferenciaButton` | `ConferenciaButton` | `app/admin/dashboard/page.tsx`<br>`app/admin/venda-avulsa/page.tsx` |
| `admin/ConferenciaDecksModal` | `ConferenciaDecksModal` | `app/admin/campeonatos/page.tsx` |
| `admin/CrediarioAvisos` | `AvisosAutomaticosButton`, `AvisarModal`, `UltimoAviso` | `app/admin/crediario/page.tsx` |
| `admin/DeckViewerModal` | `DeckViewerModal` | `app/admin/campeonatos/page.tsx`<br>`app/admin/usuarios/page.tsx` |
| `admin/EscolherContaCrediarioModal` | `EscolherContaCrediarioModal` | `app/admin/dashboard/page.tsx`<br>`app/admin/venda-avulsa/page.tsx` |
| `admin/ImageUpload` | `ImageUpload` | `app/admin/anuncios/page.tsx`<br>`app/admin/estoque/page.tsx` |
| `admin/KeyboardShortcutsOverlay` | `KeyboardShortcutsOverlay` | `app/admin/layout.tsx`<br>`components/admin/Sidebar.tsx` |
| `admin/PercentPicker` | `PercentPicker` | `app/admin/dashboard/page.tsx`<br>`app/admin/reservas/page.tsx`<br>`app/admin/venda-avulsa/page.tsx` |
| `admin/Sidebar` | `Sidebar` | `app/admin/layout.tsx` |
| `admin/TopClientes` | `toDateInput`, `getRangeClientes`, `useTopClientes`, `TopClientesFilterBar`, `TopClientesList` | `app/admin/clientes/analises/page.tsx`<br>`app/admin/dashboard/page.tsx` |
| `admin/VariantPicker` | `VariantPicker` | `app/admin/venda-avulsa/page.tsx` |
| `admin/whatsapp/WhatsAppFloatingPanel` | `WhatsAppFloatingPanel` | `app/admin/layout.tsx` |
| `admin/whatsapp/WhatsAppInbox` | `WhatsAppInbox` | `app/admin/whatsapp/page.tsx`<br>`app/janela/whatsapp/page.tsx` |
| `cliente/ContaCrediarioCliente` | `ContaCrediarioCliente` | `app/cliente/perfil/page.tsx` |
| `cliente/NotificationBell` | `NotificationBell` | `app/cliente/page.tsx` |
| `liga/Relogio` | `Relogio` | `app/admin/campeonatos/[id]/torneio/page.tsx`<br>`app/liga/jogar/page.tsx`<br>`app/liga/torneio/[id]/page.tsx` |
| `liga/TabelaTorneio` | `TabelaTorneio` | `app/admin/campeonatos/[id]/torneio/page.tsx`<br>`app/liga/jogar/page.tsx`<br>`app/liga/torneio/[id]/page.tsx` |
| `ui/Badge` | `Badge` | `app/admin/campeonatos/page.tsx`<br>`app/admin/categorias/page.tsx`<br>`app/admin/contas-receber/page.tsx`<br>`app/admin/crediario/page.tsx`<br>`app/admin/estoque/page.tsx`<br>`app/admin/integracoes/page.tsx`<br>`app/admin/lgpd/page.tsx`<br>`app/admin/usuarios/page.tsx` |
| `ui/PageHeader` | `PageHeader` | `app/admin/anuncios/page.tsx`<br>`app/admin/changelog/page.tsx`<br>`app/admin/configuracoes/page.tsx`<br>`app/admin/contas-receber/page.tsx`<br>`app/admin/crediario/page.tsx`<br>`app/admin/fiscal/page.tsx`<br>`app/admin/integracoes/page.tsx`<br>`app/admin/lgpd/page.tsx`<br>`app/admin/liga-mensal/page.tsx`<br>`app/admin/marketplace/page.tsx`<br>`app/admin/mensageria/page.tsx`<br>`app/admin/perfis/page.tsx`<br>`app/admin/relatorios/page.tsx`<br>`app/admin/reservas/page.tsx`<br>`app/admin/site/page.tsx`<br>`app/admin/sobre/page.tsx`<br>`app/admin/venda-avulsa/page.tsx`<br>`app/admin/whatsapp/page.tsx` |
| `ui/Switch` | `Switch` | `app/admin/campeonatos/[id]/torneio/page.tsx`<br>`app/admin/configuracoes/page.tsx`<br>`app/admin/estoque/page.tsx`<br>`app/admin/fiscal/page.tsx`<br>`app/admin/timer/page.tsx`<br>`components/admin/CrediarioAvisos.tsx` |
| `ui/Table` | `Table` | `app/admin/categorias/page.tsx`<br>`app/admin/estoque/page.tsx`<br>`app/admin/lgpd/page.tsx`<br>`app/admin/marketplace/page.tsx` |

## Bibliotecas (`frontend/lib`)

| Arquivo | Exporta |
|---|---|
| `lib/api/auth.ts` | `authApi` |
| `lib/api/campeonatos.ts` | `championshipApi`, `timerApi`, `ligaMensalApi` |
| `lib/api/cartas.ts` | `tcgApi`, `deckApi`, `marketplaceApi` |
| `lib/api/client.ts` | `api` |
| `lib/api/comandas.ts` | `PAYMENT_METHODS`, `PAYMENT_NEEDS_USER`, `SECOND_PAYMENT_METHODS`, `comandaApi`, `COMANDA_PAYMENT_METHODS` |
| `lib/api/comunicacao.ts` | `aiApi`, `notificationsApi`, `mensageriaApi`, `whatsappAdminApi`, `pushApi` |
| `lib/api/crediario.ts` | `FORMAS_PAGAMENTO_CREDIARIO`, `crediarioApi`, `pagarCrediarioApi`, `contasReceberApi` |
| `lib/api/fiscal.ts` | `fiscalApi`, `minhasNotasApi` |
| `lib/api/index.ts` | — |
| `lib/api/lgpd.ts` | `lgpdApi`, `lgpdAdminApi` |
| `lib/api/liga.ts` | `torneioApi`, `segundosRestantes` |
| `lib/api/produtos.ts` | `categoryApi`, `productApi`, `variantApi`, `uploadApi` |
| `lib/api/relatorios.ts` | `analyticsApi`, `relatorioApi` |
| `lib/api/reservas.ts` | `reservationApi` |
| `lib/api/site.ts` | `ANNOUNCEMENT_TYPES`, `announcementApi`, `siteConfigApi` |
| `lib/api/usuarios.ts` | `DEFAULT_DASHBOARD_PANELS`, `DEFAULT_PREFERENCES`, `perfisApi`, `userApi`, `publicProfileApi` |
| `lib/api/vendas.ts` | `vendaAvulsaApi`, `minhasComprasApi` |
| `lib/auth.ts` | `saveAuth`, `clearAuth`, `getRole`, `getUserName`, `getUserId`, `isAdmin`, `isOperator`, `isLoggedIn`, `getPermissions`, `hasPermission` |
| `lib/colors.ts` | `mixHex`, `isDark`, `getContrastText` |
| `lib/cookieConsent.ts` | `CONSENT_KEY`, `CONSENT_VERSION`, `CONSENT_EVENT`, `OPEN_SETTINGS_EVENT`, `OPTIONAL_STORAGE_KEYS`, `createConsent`, `parseConsent`, `readConsent`, `saveConsent`, `allowsPreferences`, `setOptionalItem` |
| `lib/crediario.ts` | `agruparItens`, `totalUnidades` |
| `lib/deckRules.ts` | `MAX_CARDS`, `MAX_COPIES`, `copyLimit`, `analisarDeck`, `resumoDaAnalise` |
| `lib/format.ts` | `brl`, `brlDeCentavos`, `numeroBR`, `hojeBrasil`, `dataISOBrasil`, `somarDias`, `dataBR`, `dataHoraBR` |
| `lib/hooks.ts` | `useThrottle` |
| `lib/notificacoes.ts` | `incrementBadge`, `clearBadge`, `tocarSom`, `pedirPermissaoNotificacao`, `notificarBrowser` |
| `lib/pagamentos.ts` | `FORMAS_PAGAMENTO`, `infoPagamento`, `rotuloPagamento`, `rotuloCurtoPagamento`, `precisaCliente`, `opcoesPagamento` |
| `lib/prazo.ts` | `fmtRestante` |
| `lib/precoVitrine.ts` | `resolvePixPercent`, `calcPrecoVitrine` |
| `lib/printConferencia.ts` | `CONFERENCIA_FORMATOS`, `printConferencia` |
| `lib/printDeck.ts` | `printDecks` |
| `lib/relatorio-admin.ts` | `gerarRelatorioClientes`, `gerarRelatorioPDV`, `gerarRelatorioComandas`, `gerarRelatorioCrediario` |
| `lib/relatorio-estoque.ts` | `gerarRelatorioOperacional`, `gerarRelatorioGerencial` |
| `lib/relatorio.ts` | `gerarRelatorioPDF` |
| `lib/sessionKeepAlive.ts` | `renovarSessao`, `iniciarKeepAlive` |
| `lib/signalr.ts` | `getComandaHub`, `startHub`, `stopHub` |
| `lib/sounds.ts` | `playGoalSound`, `playErrorSound`, `playSuccessSound` |
| `lib/sumula-crediario.ts` | `gerarSumulaCrediario` |
| `lib/useMontado.ts` | `useMontado` |
| `lib/useTorneioAoVivo.ts` | `useTorneioAoVivo` |
