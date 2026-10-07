# Mapa — Endpoints da API

> Gerado por `python scripts/gerar-mapa.py` — não edite à mão, rode o script de novo.

257 endpoints em 37 controllers. "Quem" = política de acesso (`AdminOnly` = admin/operador, `OwnerOnly` = só o dono, `logado` = qualquer usuário logado).

"Função no front" é a chamada em `frontend/lib/api/` (um arquivo por assunto); "Telas" são os arquivos que usam essa função (ou chamam a rota direto). Endpoint sem tela = só usado por robô, webhook, integração ou ninguém.

## Índice
- [AiChat](#aichat) (1)
- [Analytics](#analytics) (4)
- [Announcement](#announcement) (5)
- [Audit](#audit) (1)
- [Auth](#auth) (12)
- [Category](#category) (4)
- [Championship](#championship) (22)
- [Comanda](#comanda) (19)
- [ContasReceber](#contasreceber) (15)
- [Crediarios](#crediarios) (15)
- [Deck](#deck) (6)
- [Fiscal](#fiscal) (15)
- [Lgpd](#lgpd) (8)
- [LigaMensal](#ligamensal) (6)
- [Marketplace](#marketplace) (7)
- [Mensageria](#mensageria) (3)
- [MinhasCompras](#minhascompras) (1)
- [MinhasNotas](#minhasnotas) (2)
- [Notifications](#notifications) (5)
- [PagamentoCrediario](#pagamentocrediario) (3)
- [Perfis](#perfis) (6)
- [Product](#product) (10)
- [ProductVariant](#productvariant) (5)
- [ProductWaitList](#productwaitlist) (8)
- [PublicProfile](#publicprofile) (1)
- [Push](#push) (3)
- [Relatorios](#relatorios) (2)
- [Reservation](#reservation) (14)
- [SiteConfig](#siteconfig) (2)
- [Tcg](#tcg) (8)
- [TenantErpIntegration](#tenanterpintegration) (6)
- [Timer](#timer) (4)
- [Upload](#upload) (3)
- [User](#user) (15)
- [VendaAvulsa](#vendaavulsa) (6)
- [WhatsAppAdmin](#whatsappadmin) (8)
- [WhatsAppAutomation](#whatsappautomation) (2)

## AiChat

`CardGameStore/Controllers/AiChatController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/ai/chat` | AdminOnly | `Chat` (38) | `aiApi.chat` | `components/admin/AiChatWidget.tsx` |

## Analytics

`CardGameStore/Controllers/AnalyticsController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/analytics/clientes` | AdminOnly | `GetClienteInsights` (196) | `analyticsApi.clientes` | `app/admin/relatorios/page.tsx`<br>`app/admin/usuarios/page.tsx`<br>`components/admin/TopClientes.tsx` |
| GET | `/api/analytics/dashboard` | AdminOnly | `GetDashboard` (46) | `analyticsApi.dashboard` | — |
| GET | `/api/analytics/extrato` | AdminOnly | `Extrato` (782) | `analyticsApi.extrato` | `app/admin/financeiro/page.tsx` |
| GET | `/api/analytics/financeiro` | AdminOnly | `GetFinanceiro` (365) | `analyticsApi.financeiro` | `app/admin/dashboard/page.tsx`<br>`app/admin/financeiro/page.tsx`<br>`app/admin/relatorios/page.tsx` |

## Announcement

`CardGameStore/Controllers/AnnouncementController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/announcements` | público | `GetVisible` (31) | `announcementApi.visible` | `app/page.tsx` |
| POST | `/api/announcements` | AdminOnly | `Create` (46) | `announcementApi.create` | `app/admin/anuncios/page.tsx` |
| GET | `/api/announcements/all` | AdminOnly | `GetAll` (38) | `announcementApi.all` | `app/admin/anuncios/page.tsx` |
| DELETE | `/api/announcements/{id:guid}` | AdminOnly | `Delete` (78) | `announcementApi.delete` | `app/admin/anuncios/page.tsx` |
| PUT | `/api/announcements/{id:guid}` | AdminOnly | `Update` (60) | `announcementApi.update` | `app/admin/anuncios/page.tsx` |

## Audit

`CardGameStore/Controllers/AuditController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/audit` | AdminOnly | `List` (37) | `lgpdAdminApi.listAudit` | `app/admin/lgpd/page.tsx` |

## Auth

`CardGameStore/Controllers/AuthController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/auth/client-login` | público | `ClientLogin` (284) | `authApi.clientLogin` | `app/entrar/page.tsx`<br>`app/primeiro-acesso/page.tsx`<br>`app/produtos/[id]/page.tsx` |
| POST | `/api/auth/complete-profile` | logado | `CompleteProfile` (330) | `authApi.completeProfile` | `components/CompleteProfileGuard.tsx` |
| POST | `/api/auth/cpf-lookup` | público | `CpfLookup` (254) | `authApi.cpfLookup` | `app/primeiro-acesso/page.tsx` |
| POST | `/api/auth/forgot-password` | público | `ForgotPassword` (360) | `authApi.forgotPassword` | `app/reset-password/page.tsx` |
| POST | `/api/auth/login` | público | `Login` (122) | `authApi.login` | `app/login/page.tsx` |
| POST | `/api/auth/logout` | logado | `Logout` (406) | `authApi.logout` | `app/cliente/perfil/page.tsx`<br>`components/admin/Sidebar.tsx` |
| POST | `/api/auth/quick-login` | público | `QuickLogin` (169) | `authApi.quickLogin` | `app/mesa/[mesa]/page.tsx` |
| POST | `/api/auth/refresh` | público | `Refresh` (217) | — | `lib/sessionKeepAlive.ts` |
| POST | `/api/auth/register` | público | `Register` (299) | `authApi.register` | `app/cadastro/page.tsx` |
| POST | `/api/auth/reset-password` | público | `ResetPassword` (380) | `authApi.resetPassword` | `app/reset-password/page.tsx` |
| POST | `/api/auth/setup-account` | público | `SetupAccount` (268) | `authApi.setupAccount` | `app/primeiro-acesso/page.tsx` |
| POST | `/api/auth/test-email` | AdminOnly | `TestEmail` (428) | — | — |

## Category

`CardGameStore/Controllers/CategoryController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/category` | público | `GetAll` (34) | `categoryApi.list` | `app/admin/categorias/page.tsx`<br>`app/admin/estoque/page.tsx`<br>`app/admin/relatorios/page.tsx`<br>`app/admin/venda-avulsa/page.tsx`<br>`app/cliente/page.tsx`<br>`app/cliente/reserva/carrinho/page.tsx`<br>`app/page.tsx`<br>`app/produtos/[id]/page.tsx`<br>`app/produtos/page.tsx` |
| POST | `/api/category` | AdminOnly | `Create` (39) | `categoryApi.create` | `app/admin/categorias/page.tsx` |
| DELETE | `/api/category/{id:guid}` | AdminOnly | `Delete` (78) | `categoryApi.delete` | `app/admin/categorias/page.tsx` |
| PUT | `/api/category/{id:guid}` | AdminOnly | `Update` (59) | `categoryApi.update` | `app/admin/categorias/page.tsx` |

## Championship

`CardGameStore/Controllers/ChampionshipController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/championship` | público | `GetAll` (56) | `championshipApi.list` | `app/admin/dashboard/page.tsx`<br>`app/page.tsx` |
| POST | `/api/championship` | AdminOnly | `Create` (162) | `championshipApi.create` | `app/admin/campeonatos/page.tsx` |
| GET | `/api/championship/admin/all` | AdminOnly | `GetAllAdmin` (66) | `championshipApi.listAll` | `app/admin/campeonatos/page.tsx`<br>`app/admin/liga-mensal/page.tsx` |
| GET | `/api/championship/my-participations` | logado | `GetMyParticipations` (107) | `championshipApi.myParticipations` | `app/cliente/page.tsx`<br>`app/cliente/perfil/page.tsx` |
| POST | `/api/championship/participants/{participantId:guid}/cobrar` | OwnerOnly | `CobrarInscricao` (418) | `championshipApi.cobrarInscricao` | `app/admin/campeonatos/page.tsx` |
| PUT | `/api/championship/participants/{participantId:guid}/pagamento` | AdminOnly | `MarcarPagamentoInscricao` (488) | — | — |
| DELETE | `/api/championship/{id:guid}` | AdminOnly | `Delete` (78) | `championshipApi.delete` | `app/admin/campeonatos/page.tsx`<br>`app/campeonato/[id]/page.tsx` |
| GET | `/api/championship/{id:guid}` | público | `GetById` (97) | `championshipApi.get` | `app/campeonato/[id]/page.tsx` |
| PUT | `/api/championship/{id:guid}` | AdminOnly | `Update` (200) | `championshipApi.update` | `app/admin/campeonatos/page.tsx`<br>`app/campeonato/[id]/page.tsx` |
| POST | `/api/championship/{id:guid}/admin-register` | OwnerOnly | `AdminRegister` (521) | `championshipApi.adminRegister` | `app/admin/campeonatos/page.tsx` |
| PUT | `/api/championship/{id:guid}/image` | AdminOnly | `SetImage` (678) | `championshipApi.setImage` | — |
| POST | `/api/championship/{id:guid}/my-inscription/pix` | logado | `GerarPixInscricao` (341) | `championshipApi.pixInscricao` | `app/cliente/page.tsx` |
| POST | `/api/championship/{id:guid}/my-inscription/pix/verificar` | logado | `VerificarPixInscricao` (458) | `championshipApi.verificarPixInscricao` | `app/cliente/page.tsx`<br>`app/page.tsx` |
| GET | `/api/championship/{id:guid}/participants` | logado | `GetParticipants` (134) | `championshipApi.participants` | `app/admin/campeonatos/page.tsx`<br>`app/admin/liga-mensal/page.tsx` |
| DELETE | `/api/championship/{id:guid}/participants/{participantId:guid}` | AdminOnly | `RemoveParticipant` (610) | `championshipApi.removeParticipant` | `app/admin/campeonatos/page.tsx` |
| PUT | `/api/championship/{id:guid}/participants/{participantId:guid}/placement` | AdminOnly | `SetPlacement` (660) | `championshipApi.setPlacement` | `app/admin/liga-mensal/page.tsx` |
| PATCH | `/api/championship/{id:guid}/podio` | AdminOnly | `SetPodio` (757) | `championshipApi.setPodio` | `app/admin/campeonatos/page.tsx` |
| GET | `/api/championship/{id:guid}/preinscricoes` | AdminOnly | `GetPreInscricoes` (717) | `championshipApi.getPreInscricoes` | `app/admin/campeonatos/page.tsx`<br>`app/campeonato/[id]/page.tsx` |
| POST | `/api/championship/{id:guid}/preinscricoes` | público | `AddPreInscricao` (698) | `championshipApi.addPreInscricao` | `app/campeonato/[id]/page.tsx` |
| DELETE | `/api/championship/{id:guid}/preinscricoes/{preInscricaoId:guid}` | AdminOnly | `DeletePreInscricao` (742) | `championshipApi.deletePreInscricao` | `app/admin/campeonatos/page.tsx` |
| POST | `/api/championship/{id:guid}/register` | logado | `Register` (237) | `championshipApi.register`<br>`championshipApi.selfRegister` | `app/page.tsx` |
| PUT | `/api/championship/{id:guid}/status` | AdminOnly | `UpdateStatus` (634) | `championshipApi.setStatus` | `app/admin/campeonatos/page.tsx` |

## Comanda

`CardGameStore/Controllers/ComandaController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/comanda/admin-open` | AdminOnly | `AdminOpenComanda` (64) | `comandaApi.adminOpen` | `app/admin/dashboard/page.tsx` |
| GET | `/api/comanda/dashboard` | AdminOnly | `GetDashboard` (81) | `comandaApi.dashboard` | `app/admin/dashboard/page.tsx`<br>`app/admin/relatorios/page.tsx` |
| GET | `/api/comanda/history` | AdminOnly | `GetHistory` (91) | `comandaApi.history` | `app/admin/dashboard/page.tsx` |
| GET | `/api/comanda/my` | logado | `GetMyComanda` (122) | `comandaApi.myComanda` | `app/cliente/page.tsx`<br>`app/cliente/perfil/page.tsx`<br>`app/entrar/page.tsx`<br>`app/mesa/[mesa]/page.tsx` |
| GET | `/api/comanda/my-history` | logado | `GetMyHistory` (111) | `comandaApi.myHistory` | `app/cliente/perfil/page.tsx` |
| GET | `/api/comanda/my/pix` | logado | `GetMinhaCobrancaPix` (395) | `comandaApi.meuPix` | `app/cliente/page.tsx` |
| POST | `/api/comanda/my/pix/verificar` | logado | `VerificarMinhaCobrancaPix` (408) | `comandaApi.verificarMeuPix` | `app/cliente/page.tsx` |
| GET | `/api/comanda/{id:guid}` | AdminOnly | `GetById` (102) | — | — |
| DELETE | `/api/comanda/{id:guid}/apply-points` | logado | `RemovePoints` (288) | `comandaApi.removePoints` | `app/admin/dashboard/page.tsx`<br>`app/cliente/page.tsx` |
| POST | `/api/comanda/{id:guid}/apply-points` | logado | `ApplyPoints` (266) | `comandaApi.applyPoints` | `app/cliente/page.tsx` |
| PUT | `/api/comanda/{id:guid}/cancel` | AdminOnly | `Cancel` (208) | `comandaApi.cancel` | `app/admin/dashboard/page.tsx` |
| PUT | `/api/comanda/{id:guid}/close` | AdminOnly | `Close` (182) | `comandaApi.close` | `app/admin/dashboard/page.tsx` |
| PUT | `/api/comanda/{id:guid}/editar` | AdminOnly | `EditarComanda` (250) | `comandaApi.editar` | `app/admin/dashboard/page.tsx` |
| POST | `/api/comanda/{id:guid}/estornar` | AdminOnly | `Estornar` (223) | `comandaApi.estornar` | `app/admin/dashboard/page.tsx` |
| POST | `/api/comanda/{id:guid}/items` | logado | `AddItem` (133) | `comandaApi.addItem` | `app/admin/dashboard/page.tsx`<br>`app/cliente/page.tsx` |
| DELETE | `/api/comanda/{id:guid}/items/{itemId:guid}` | AdminOnly | `RemoveItem` (152) | `comandaApi.removeItem` | `app/admin/dashboard/page.tsx` |
| PATCH | `/api/comanda/{id:guid}/items/{itemId:guid}` | AdminOnly | `UpdateItem` (164) | `comandaApi.updateItem` | `app/admin/dashboard/page.tsx` |
| POST | `/api/comanda/{id:guid}/pix` | AdminOnly | `GerarCobrancaPix` (309) | `comandaApi.gerarPix` | `app/admin/dashboard/page.tsx` |
| GET | `/api/comanda/{id:guid}/pix/{txid}/status` | AdminOnly | `ConsultarCobrancaPix` (384) | `comandaApi.statusPix` | `app/admin/dashboard/page.tsx` |

## ContasReceber

`CardGameStore/Controllers/ContasReceberController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/contas-receber` | AdminOnly | `List` (37) | `contasReceberApi.list` | `app/admin/contas-receber/page.tsx` |
| POST | `/api/contas-receber` | AdminOnly | `Create` (116) | `contasReceberApi.create` | `app/admin/contas-receber/page.tsx` |
| POST | `/api/contas-receber/import-ofx` | AdminOnly | `ImportOfx` (180) | `contasReceberApi.importOfx` | `app/admin/contas-receber/page.tsx`<br>`app/admin/integracoes/page.tsx` |
| GET | `/api/contas-receber/integracoes` | AdminOnly | `GetIntegracoes` (221) | `contasReceberApi.integracoes` | `app/admin/integracoes/page.tsx` |
| POST | `/api/contas-receber/integracoes/inter/certificado` | AdminOnly | `UploadCertificado` (429) | — | `app/admin/integracoes/page.tsx` |
| GET | `/api/contas-receber/integracoes/inter/status` | AdminOnly | `InterStatus` (411) | — | `app/admin/integracoes/page.tsx` |
| POST | `/api/contas-receber/integracoes/inter/sync` | AdminOnly | `InterSync` (378) | — | `app/admin/integracoes/page.tsx` |
| PUT | `/api/contas-receber/integracoes/{source}` | AdminOnly | `SaveIntegracao` (245) | `contasReceberApi.saveIntegracao` | `app/admin/integracoes/page.tsx` |
| POST | `/api/contas-receber/integracoes/{source}/token` | AdminOnly | `SaveToken` (275) | — | — |
| GET | `/api/contas-receber/notas-destinadas` | AdminOnly | `NotasDestinadas` (357) | — | `app/admin/contas-receber/page.tsx` |
| GET | `/api/contas-receber/sefaz-status` | AdminOnly | `SefazStatus` (292) | `contasReceberApi.sefazStatus` | `app/admin/contas-receber/page.tsx`<br>`app/admin/integracoes/page.tsx` |
| POST | `/api/contas-receber/sefaz/sync` | AdminOnly | `SefazSync` (323) | — | `app/admin/contas-receber/page.tsx`<br>`app/admin/integracoes/page.tsx` |
| GET | `/api/contas-receber/summary` | AdminOnly | `Summary` (75) | `contasReceberApi.summary` | `app/admin/contas-receber/page.tsx` |
| DELETE | `/api/contas-receber/{id:guid}` | AdminOnly | `Delete` (168) | `contasReceberApi.remove` | `app/admin/contas-receber/page.tsx` |
| PUT | `/api/contas-receber/{id:guid}` | AdminOnly | `Update` (140) | `contasReceberApi.update` | `app/admin/contas-receber/page.tsx` |

## Crediarios

`CardGameStore/Controllers/CrediariosController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/crediarios` | AdminOnly | `GetAll` (170) | `crediarioApi.list` | `app/admin/crediario/page.tsx`<br>`app/admin/usuarios/page.tsx` |
| POST | `/api/crediarios` | AdminOnly | `CriarManual` (63) | `crediarioApi.criarManual` | `app/admin/crediario/page.tsx` |
| GET | `/api/crediarios/avisos/config` | AdminOnly | `GetAvisoConfig` (532) | `crediarioApi.avisoConfig` | `components/admin/CrediarioAvisos.tsx` |
| PUT | `/api/crediarios/avisos/config` | AdminOnly | `SalvarAvisoConfig` (541) | `crediarioApi.salvarAvisoConfig` | `components/admin/CrediarioAvisos.tsx` |
| GET | `/api/crediarios/historico` | logado | `GetMeuHistorico` (234) | `crediarioApi.meuHistorico` | `app/cliente/perfil/page.tsx` |
| GET | `/api/crediarios/meu` | logado | `GetMeu` (213) | — | — |
| GET | `/api/crediarios/por-cliente` | AdminOnly | `GetPorCliente` (127) | `crediarioApi.porCliente` | `app/admin/crediario/page.tsx` |
| GET | `/api/crediarios/usuario/{userId:guid}` | AdminOnly | `GetByUser` (195) | `crediarioApi.byUser` | `app/admin/dashboard/page.tsx`<br>`app/admin/venda-avulsa/page.tsx` |
| DELETE | `/api/crediarios/{id:guid}` | AdminOnly | `Deletar` (630) | `crediarioApi.deletar` | `app/admin/crediario/page.tsx` |
| PATCH | `/api/crediarios/{id:guid}` | AdminOnly | `Editar` (257) | `crediarioApi.editar` | `app/admin/crediario/page.tsx` |
| POST | `/api/crediarios/{id:guid}/aviso` | AdminOnly | `AvisarAgora` (597) | `crediarioApi.avisarAgora` | `components/admin/CrediarioAvisos.tsx` |
| GET | `/api/crediarios/{id:guid}/aviso/previa` | AdminOnly | `PreviaAviso` (575) | `crediarioApi.previaAviso` | `components/admin/CrediarioAvisos.tsx` |
| POST | `/api/crediarios/{id:guid}/pagamento` | AdminOnly | `RegistrarPagamento` (345) | `crediarioApi.registrarPagamento` | `app/admin/crediario/page.tsx` |
| POST | `/api/crediarios/{id:guid}/pix` | AdminOnly | `GerarCobrancaPix` (489) | `crediarioApi.gerarPix` | `app/admin/crediario/page.tsx` |
| GET | `/api/crediarios/{id:guid}/pix/{txid}/status` | AdminOnly | `ConsultarCobrancaPix` (514) | `crediarioApi.statusPix` | `app/admin/crediario/page.tsx` |

## Deck

`CardGameStore/Controllers/DeckController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/deck` | logado | `GetMyDecks` (42) | `deckApi.list` | `app/cliente/decks/page.tsx`<br>`app/page.tsx` |
| POST | `/api/deck` | logado | `Create` (93) | `deckApi.create` | `app/cliente/decks/[id]/page.tsx` |
| GET | `/api/deck/user/{userId:guid}` | AdminOnly | `GetByUser` (156) | `deckApi.getByUser` | `app/admin/campeonatos/page.tsx`<br>`app/admin/usuarios/page.tsx` |
| DELETE | `/api/deck/{id:guid}` | logado | `Delete` (139) | `deckApi.delete` | `app/cliente/decks/page.tsx` |
| GET | `/api/deck/{id:guid}` | logado | `GetById` (75) | `deckApi.get` | `app/cliente/decks/[id]/page.tsx`<br>`components/admin/ConferenciaDecksModal.tsx`<br>`components/admin/DeckViewerModal.tsx` |
| PUT | `/api/deck/{id:guid}` | logado | `Update` (115) | `deckApi.update` | `app/cliente/decks/[id]/page.tsx` |

## Fiscal

`CardGameStore/Controllers/FiscalController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/fiscal/certificado` | AdminOnly | `UploadCertificado` (192) | `fiscalApi.uploadCertificado` | `app/admin/fiscal/page.tsx` |
| GET | `/api/fiscal/config` | AdminOnly | `GetConfig` (51) | `fiscalApi.getConfig` | `app/admin/dashboard/page.tsx`<br>`app/admin/fiscal/page.tsx`<br>`app/admin/venda-avulsa/page.tsx`<br>`components/admin/Sidebar.tsx` |
| PUT | `/api/fiscal/config` | AdminOnly | `SaveConfig` (64) | `fiscalApi.saveConfig` | `app/admin/fiscal/page.tsx` |
| POST | `/api/fiscal/emitir/comanda/{id:guid}` | AdminOnly | `EmitirNotaComanda` (438) | `fiscalApi.emitirNotaComanda` | `app/admin/dashboard/page.tsx` |
| POST | `/api/fiscal/emitir/venda-avulsa/{id}` | AdminOnly | `EmitirNotaVendaAvulsa` (452) | `fiscalApi.emitirNotaVendaAvulsa` | `app/admin/venda-avulsa/page.tsx` |
| GET | `/api/fiscal/exportar-xmls` | AdminOnly | `ExportarXmls` (519) | `fiscalApi.exportarXmls` | `app/admin/fiscal/page.tsx` |
| GET | `/api/fiscal/naturezas-operacao` | AdminOnly | `ListNaturezas` (253) | `fiscalApi.listNaturezas` | `app/admin/estoque/page.tsx`<br>`app/admin/fiscal/page.tsx` |
| POST | `/api/fiscal/naturezas-operacao` | AdminOnly | `CreateNatureza` (283) | `fiscalApi.createNatureza` | `app/admin/fiscal/page.tsx` |
| DELETE | `/api/fiscal/naturezas-operacao/{id:guid}` | AdminOnly | `DeleteNatureza` (371) | `fiscalApi.removeNatureza` | `app/admin/fiscal/page.tsx` |
| PUT | `/api/fiscal/naturezas-operacao/{id:guid}` | AdminOnly | `UpdateNatureza` (330) | `fiscalApi.updateNatureza` | — |
| GET | `/api/fiscal/notas` | AdminOnly | `ListNotas` (383) | `fiscalApi.listNotas` | `app/admin/fiscal/page.tsx` |
| POST | `/api/fiscal/notas/{id:guid}/cancelar` | AdminOnly | `CancelarNota` (476) | `fiscalApi.cancelarNota` | `app/admin/fiscal/page.tsx` |
| GET | `/api/fiscal/notas/{id:guid}/cupom` | AdminOnly | `ObterCupom` (500) | `fiscalApi.obterCupom` | `app/admin/fiscal/cupom/[id]/page.tsx` |
| POST | `/api/fiscal/notas/{id:guid}/reprocessar` | AdminOnly | `ReprocessarNota` (466) | `fiscalApi.reprocessarNota` | `app/admin/fiscal/page.tsx` |
| POST | `/api/fiscal/test-emissao-sefaz` | AdminOnly | `TestEmissaoSefaz` (541) | — | — |

## Lgpd

`CardGameStore/Controllers/LgpdController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/lgpd/consent` | público | `RecordConsent` (209) | `lgpdApi.recordConsent` | `components/CookieBanner.tsx` |
| POST | `/api/lgpd/request` | público | `CreateRequest` (68) | `lgpdApi.submitRequest` | `app/lgpd/page.tsx` |
| GET | `/api/lgpd/request/{id}` | público | `GetRequest` (168) | `lgpdApi.getRequest` | `app/lgpd/page.tsx` |
| GET | `/api/lgpd/requests` | AdminOnly | `ListRequests` (253) | `lgpdAdminApi.listRequests` | `app/admin/dashboard/page.tsx`<br>`app/admin/lgpd/page.tsx` |
| GET | `/api/lgpd/requests/{id}/attachment` | AdminOnly | `DownloadAttachment` (413) | — | `app/admin/lgpd/page.tsx` |
| POST | `/api/lgpd/requests/{id}/attachment` | AdminOnly | `UploadAttachment` (368) | — | `app/admin/lgpd/page.tsx` |
| GET | `/api/lgpd/requests/{id}/relatorio` | AdminOnly | `GerarRelatorio` (450) | — | `app/admin/lgpd/documento/[id]/page.tsx` |
| PUT | `/api/lgpd/requests/{id}/respond` | AdminOnly | `RespondRequest` (299) | `lgpdAdminApi.respond` | `app/admin/lgpd/page.tsx` |

## LigaMensal

`CardGameStore/Controllers/LigaMensalController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/liga-mensal` | público | `GetRanking` (68) | `ligaMensalApi.ranking` | `app/admin/liga-mensal/page.tsx`<br>`app/liga/page.tsx` |
| GET | `/api/liga-mensal/manual` | AdminOnly | `GetManualEntries` (200) | `ligaMensalApi.manualList` | `app/admin/liga-mensal/page.tsx` |
| POST | `/api/liga-mensal/manual` | AdminOnly | `CreateManualEntry` (215) | `ligaMensalApi.manualCreate` | `app/admin/liga-mensal/page.tsx` |
| DELETE | `/api/liga-mensal/manual/{id:guid}` | AdminOnly | `DeleteManualEntry` (270) | `ligaMensalApi.manualDelete` | `app/admin/liga-mensal/page.tsx` |
| PUT | `/api/liga-mensal/manual/{id:guid}` | AdminOnly | `UpdateManualEntry` (244) | `ligaMensalApi.manualUpdate` | `app/admin/liga-mensal/page.tsx` |
| GET | `/api/liga-mensal/meses` | público | `GetMesesDisponiveis` (161) | `ligaMensalApi.meses` | `app/admin/liga-mensal/page.tsx`<br>`app/liga/page.tsx` |

## Marketplace

`CardGameStore/Controllers/MarketplaceController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/marketplace` | público | `GetAll` (51) | `marketplaceApi.list` | `app/admin/marketplace/page.tsx`<br>`app/cliente/mercado/page.tsx` |
| POST | `/api/marketplace` | AdminOnly | `Create` (113) | `marketplaceApi.create` | `app/admin/marketplace/page.tsx` |
| GET | `/api/marketplace/mine` | logado | `GetMine` (93) | `marketplaceApi.mine` | — |
| DELETE | `/api/marketplace/{id:guid}` | logado | `Delete` (176) | `marketplaceApi.remove` | `app/admin/marketplace/page.tsx` |
| PUT | `/api/marketplace/{id:guid}` | logado | `Update` (144) | `marketplaceApi.update` | `app/admin/marketplace/page.tsx` |
| POST | `/api/marketplace/{id:guid}/interest` | logado | `ToggleInterest` (195) | `marketplaceApi.toggleInterest` | `app/cliente/mercado/page.tsx` |
| GET | `/api/marketplace/{id:guid}/interests` | logado | `GetInterests` (245) | `marketplaceApi.interests` | `app/admin/marketplace/page.tsx` |

## Mensageria

`CardGameStore/Controllers/MensageriaController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/admin/mensageria/clients` | AdminOnly | `GetClients` (33) | `mensageriaApi.clients` | `app/admin/mensageria/page.tsx` |
| GET | `/api/admin/mensageria/segments` | AdminOnly | `GetSegments` (47) | `mensageriaApi.segments` | `app/admin/mensageria/page.tsx` |
| POST | `/api/admin/mensageria/send` | AdminOnly | `Send` (63) | `mensageriaApi.send` | `app/admin/mensageria/page.tsx` |

## MinhasCompras

`CardGameStore/Controllers/MinhasComprasController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/minhas-compras` | CustomerOrAdmin | `ListMinhasCompras` (35) | `minhasComprasApi.list` | `app/cliente/perfil/page.tsx` |

## MinhasNotas

`CardGameStore/Controllers/MinhasNotasController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/minhas-notas` | CustomerOrAdmin | `ListMinhasNotas` (41) | `minhasNotasApi.list` | `app/cliente/perfil/page.tsx` |
| GET | `/api/minhas-notas/{id:guid}/cupom` | CustomerOrAdmin | `ObterMeuCupom` (76) | `minhasNotasApi.obterCupom` | `app/cliente/notas/[id]/page.tsx` |

## Notifications

`CardGameStore/Controllers/NotificationsController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/notifications` | logado | `List` (36) | `notificationsApi.list` | `components/cliente/NotificationBell.tsx` |
| PATCH | `/api/notifications/read-all` | logado | `MarkAllRead` (82) | `notificationsApi.markAllRead` | `components/cliente/NotificationBell.tsx` |
| GET | `/api/notifications/unread-count` | logado | `UnreadCount` (56) | `notificationsApi.unreadCount` | `app/admin/dashboard/page.tsx`<br>`components/admin/Sidebar.tsx`<br>`components/cliente/NotificationBell.tsx`<br>`tests/whatsapp.spec.ts` |
| DELETE | `/api/notifications/{id:guid}` | logado | `Delete` (95) | `notificationsApi.remove` | `components/cliente/NotificationBell.tsx` |
| PATCH | `/api/notifications/{id:guid}/read` | logado | `MarkRead` (68) | `notificationsApi.markRead` | `components/cliente/NotificationBell.tsx` |

## PagamentoCrediario

`CardGameStore/Controllers/PagamentoCrediarioController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/pagar/crediario/{token}` | público | `Resumo` (42) | `pagarCrediarioApi.resumo` | `app/pagar/[token]/page.tsx` |
| POST | `/api/pagar/crediario/{token}/pix` | público | `GerarPix` (89) | `pagarCrediarioApi.gerarPix` | `app/pagar/[token]/page.tsx` |
| GET | `/api/pagar/crediario/{token}/pix/{txid}` | público | `StatusPix` (124) | `pagarCrediarioApi.statusPix` | `app/pagar/[token]/page.tsx` |

## Perfis

`CardGameStore/Controllers/PerfisController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/perfis` | papéis Admin | `GetAll` (74) | `perfisApi.list` | `app/admin/perfis/page.tsx`<br>`app/admin/usuarios/page.tsx` |
| POST | `/api/perfis` | papéis Admin | `Create` (102) | `perfisApi.create` | `app/admin/perfis/page.tsx` |
| GET | `/api/perfis/permissoes` | papéis Admin | `ListPermissoes` (42) | `perfisApi.permissoes` | — |
| DELETE | `/api/perfis/{id:guid}` | papéis Admin | `Delete` (163) | `perfisApi.delete` | `app/admin/perfis/page.tsx` |
| GET | `/api/perfis/{id:guid}` | papéis Admin | `GetById` (90) | — | — |
| PUT | `/api/perfis/{id:guid}` | papéis Admin | `Update` (134) | `perfisApi.update` | `app/admin/perfis/page.tsx` |

## Product

`CardGameStore/Controllers/ProductController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/product` | público | `GetAll` (34) | `productApi.list` | `app/cliente/reserva/carrinho/page.tsx`<br>`app/page.tsx`<br>`app/produtos/page.tsx` |
| POST | `/api/product` | AdminOnly | `Create` (97) | `productApi.create` | `app/admin/cartas/page.tsx`<br>`app/admin/estoque/page.tsx` |
| GET | `/api/product/admin` | papéis Admin,Operator | `GetAllAdmin` (56) | `productApi.listAdmin` | `app/admin/dashboard/page.tsx`<br>`app/admin/estoque/page.tsx`<br>`app/admin/relatorios/page.tsx`<br>`app/admin/reservas/page.tsx`<br>`app/admin/venda-avulsa/page.tsx` |
| GET | `/api/product/barcode/{code}` | logado | `GetByBarcode` (78) | `productApi.getByBarcode` | `app/admin/dashboard/page.tsx`<br>`app/admin/estoque/page.tsx` |
| GET | `/api/product/low-stock` | AdminOnly | `GetLowStock` (87) | `productApi.lowStock` | — |
| GET | `/api/product/store` | logado | `GetAllStore` (46) | `productApi.listStore` | `app/cliente/page.tsx` |
| DELETE | `/api/product/{id:guid}` | AdminOnly | `Deactivate` (125) | `productApi.deactivate` | `app/admin/estoque/page.tsx` |
| GET | `/api/product/{id:guid}` | público | `GetById` (67) | `productApi.get` | `app/admin/venda-avulsa/page.tsx`<br>`app/produtos/[id]/page.tsx` |
| PUT | `/api/product/{id:guid}` | AdminOnly | `Update` (114) | `productApi.update` | `app/admin/estoque/page.tsx` |
| PATCH | `/api/product/{id:guid}/stock` | AdminOnly | `AdjustStock` (137) | `productApi.adjustStock` | `app/admin/estoque/page.tsx` |

## ProductVariant

`CardGameStore/Controllers/ProductVariantController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/products/{productId:guid}/variants` | AdminOnly | `GetAll` (20) | `variantApi.list` | `app/admin/estoque/page.tsx`<br>`app/admin/reservas/page.tsx`<br>`app/cliente/page.tsx`<br>`components/admin/VariantPicker.tsx` |
| POST | `/api/products/{productId:guid}/variants` | AdminOnly | `Create` (36) | — | — |
| POST | `/api/products/{productId:guid}/variants/bulk` | AdminOnly | `BulkCreate` (60) | `variantApi.bulk` | `app/admin/estoque/page.tsx` |
| DELETE | `/api/products/{productId:guid}/variants/{variantId:guid}` | AdminOnly | `Delete` (119) | `variantApi.remove` | `app/admin/estoque/page.tsx` |
| PUT | `/api/products/{productId:guid}/variants/{variantId:guid}` | AdminOnly | `Update` (99) | `variantApi.update` | `app/admin/estoque/page.tsx` |

## ProductWaitList

`CardGameStore/Controllers/ProductWaitListController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/products/waitlist/mine` | logado | `GetMine` (122) | — | — |
| GET | `/api/products/waitlist/pre-venda/pendentes` | AdminOnly | `CountPreVendaPendentes` (153) | `reservationApi.filaPendentesCount` | `app/admin/dashboard/page.tsx` |
| DELETE | `/api/products/{productId:guid}/waitlist` | logado | `Leave` (97) | — | — |
| GET | `/api/products/{productId:guid}/waitlist` | AdminOnly | `GetList` (169) | — | — |
| POST | `/api/products/{productId:guid}/waitlist` | logado | `Join` (60) | — | — |
| GET | `/api/products/{productId:guid}/waitlist/my` | logado | `MyPosition` (43) | — | — |
| DELETE | `/api/products/{productId:guid}/waitlist/{entryId:guid}` | AdminOnly | `RemoveEntry` (221) | — | — |
| POST | `/api/products/{productId:guid}/waitlist/{entryId:guid}/notify` | AdminOnly | `NotifyEntry` (192) | — | — |

## PublicProfile

`CardGameStore/Controllers/PublicProfileController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/profile/{userId:guid}` | público | `GetPublicProfile` (32) | `publicProfileApi.get` | `app/perfil/[id]/page.tsx` |

## Push

`CardGameStore/Controllers/PushController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| DELETE | `/api/push/subscribe` | logado | `Unsubscribe` (72) | `pushApi.unsubscribe` | `components/cliente/NotificationBell.tsx` |
| POST | `/api/push/subscribe` | logado | `Subscribe` (40) | `pushApi.subscribe` | `components/cliente/NotificationBell.tsx` |
| GET | `/api/push/vapid-public-key` | público | `GetPublicKey` (28) | `pushApi.publicKey` | `components/cliente/NotificationBell.tsx` |

## Relatorios

`CardGameStore/Controllers/RelatoriosController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/relatorios/crediario` | AdminOnly | `Crediario` (156) | `relatorioApi.crediario` | `app/admin/relatorios/page.tsx` |
| GET | `/api/relatorios/vendas` | AdminOnly | `Vendas` (44) | `relatorioApi.vendas` | `app/admin/relatorios/page.tsx` |

## Reservation

`CardGameStore/Controllers/ReservationController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/reservations` | AdminOnly | `GetAll` (555) | `reservationApi.list` | `app/admin/estoque/page.tsx`<br>`app/admin/reservas/page.tsx` |
| POST | `/api/reservations` | logado | `Create` (106) | `reservationApi.create` | `app/cliente/page.tsx` |
| POST | `/api/reservations/admin-create` | AdminOnly | `AdminCreate` (276) | `reservationApi.adminCreate` | `app/admin/reservas/page.tsx` |
| POST | `/api/reservations/cart` | logado | `CreateCart` (184) | `reservationApi.createCart` | `app/cliente/reserva/carrinho/page.tsx` |
| POST | `/api/reservations/group/{groupId:guid}/homologar` | AdminOnly | `HomologarGrupo` (815) | `reservationApi.homologarGrupo` | `app/admin/reservas/page.tsx` |
| DELETE | `/api/reservations/group/{groupId:guid}/pix` | AdminOnly | `CancelarPixReserva` (991) | `reservationApi.cancelarPix`<br>`reservationApi.gerarPix` | `app/admin/reservas/page.tsx`<br>`app/cliente/reserva/carrinho/page.tsx`<br>`components/PixReservaModal.tsx` |
| GET | `/api/reservations/group/{groupId:guid}/pix` | logado | `GetPixReserva` (1038) | `reservationApi.gerarPix`<br>`reservationApi.getPix` | `app/admin/reservas/page.tsx`<br>`app/cliente/reserva/carrinho/page.tsx`<br>`components/PixReservaModal.tsx` |
| POST | `/api/reservations/group/{groupId:guid}/pix` | logado | `GerarPixReserva` (935) | `reservationApi.gerarPix` | `app/cliente/reserva/carrinho/page.tsx`<br>`components/PixReservaModal.tsx` |
| POST | `/api/reservations/group/{groupId:guid}/pix/verificar` | logado | `VerificarPixReserva` (961) | `reservationApi.verificarPix` | `app/cliente/reserva/carrinho/page.tsx`<br>`components/PixReservaModal.tsx` |
| GET | `/api/reservations/mine` | logado | `GetMine` (79) | `reservationApi.mine` | `app/cliente/page.tsx`<br>`app/cliente/perfil/page.tsx` |
| DELETE | `/api/reservations/{id:guid}` | logado | `Cancel` (480) | `reservationApi.cancel` | `app/admin/reservas/page.tsx`<br>`app/cliente/page.tsx`<br>`app/cliente/perfil/page.tsx` |
| POST | `/api/reservations/{id:guid}/homologar` | AdminOnly | `Homologar` (791) | `reservationApi.homologar` | — |
| PUT | `/api/reservations/{id:guid}/quantity` | AdminOnly | `UpdateQuantity` (684) | `reservationApi.updateQuantity` | `app/admin/reservas/page.tsx` |
| PUT | `/api/reservations/{id:guid}/status` | AdminOnly | `UpdateStatus` (601) | `reservationApi.updateStatus` | `app/admin/estoque/page.tsx`<br>`app/admin/reservas/page.tsx` |

## SiteConfig

`CardGameStore/Controllers/SiteConfigController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/site-config` | público | `Get` (27) | `siteConfigApi.get` | `app/admin/estoque/page.tsx`<br>`app/admin/site/page.tsx`<br>`app/cliente/reserva/carrinho/page.tsx`<br>`app/page.tsx`<br>`app/produtos/[id]/page.tsx`<br>`app/produtos/page.tsx` |
| PUT | `/api/site-config` | AdminOnly | `Save` (35) | `siteConfigApi.save` | `app/admin/site/page.tsx` |

## Tcg

`CardGameStore/Controllers/TcgController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/tcg/brl-rate` | público | `GetBrlRate` (129) | `tcgApi.brlRate` | `app/admin/cartas/page.tsx`<br>`app/cliente/decks/[id]/page.tsx` |
| GET | `/api/tcg/cards/{tcgCardId}` | logado | `GetCard` (120) | `tcgApi.getCard` | `app/admin/cartas/page.tsx` |
| DELETE | `/api/tcg/cards/{tcgCardId}/cache` | AdminOnly | `InvalidateCache` (166) | — | — |
| POST | `/api/tcg/cards/{tcgCardId}/refresh` | AdminOnly | `RefreshCache` (157) | — | — |
| POST | `/api/tcg/purge-cache` | AdminOnly | `PurgeCache` (175) | — | — |
| GET | `/api/tcg/search` | logado | `Search` (45) | `tcgApi.search`<br>`tcgApi.searchAdvanced`<br>`tcgApi.searchByCode` | `app/admin/cartas/page.tsx`<br>`app/cliente/decks/[id]/page.tsx` |
| GET | `/api/tcg/sets` | logado | `GetSets` (148) | `tcgApi.sets` | `app/admin/cartas/page.tsx`<br>`app/cliente/decks/[id]/page.tsx` |
| POST | `/api/tcg/sync` | AdminOnly | `SyncSet` (188) | — | — |

## TenantErpIntegration

`CardGameStore/Controllers/TenantErpIntegrationController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/integrations/tenant-erp/financeiro` | AdminOnly | `Financeiro` (39) | — | — |
| POST | `/api/integrations/tenant-erp/financeiro/analisar` | AdminOnly | `AnalisarFinanceiro` (54) | — | `app/admin/financeiro/page.tsx` |
| GET | `/api/integrations/tenant-erp/fiscal/ibpt/{ncm}` | AdminOnly | `Ibpt` (62) | — | `app/admin/integracoes/page.tsx` |
| GET | `/api/integrations/tenant-erp/fiscal/saude` | AdminOnly | `FiscalSaude` (47) | — | — |
| GET | `/api/integrations/tenant-erp/status` | AdminOnly | `Status` (27) | — | `app/admin/fiscal/page.tsx`<br>`app/admin/integracoes/page.tsx` |
| POST | `/api/integrations/tenant-erp/test` | AdminOnly | `Test` (35) | — | `app/admin/integracoes/page.tsx` |

## Timer

`CardGameStore/Controllers/TimerController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/timers` | papéis Admin,Operator | `List` (20) | `timerApi.list` | `contexts/TimerContext.tsx` |
| POST | `/api/timers` | papéis Admin,Operator | `Create` (24) | `timerApi.create` | `contexts/TimerContext.tsx` |
| DELETE | `/api/timers/{id:guid}` | papéis Admin,Operator | `Delete` (91) | `timerApi.remove` | `contexts/TimerContext.tsx` |
| PUT | `/api/timers/{id:guid}` | papéis Admin,Operator | `Update` (39) | `timerApi.update` | `contexts/TimerContext.tsx` |

## Upload

`CardGameStore/Controllers/UploadController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/upload/image` | AdminOnly | `UploadImage` (57) | `uploadApi.image` | `app/admin/campeonatos/page.tsx`<br>`app/admin/site/page.tsx`<br>`components/admin/ImageUpload.tsx` |
| POST | `/api/upload/marketplace-image` | logado | `UploadMarketplaceImage` (70) | `marketplaceApi.uploadImage` | `app/admin/marketplace/page.tsx` |
| POST | `/api/upload/profile-image` | logado | `UploadProfileImage` (80) | `authApi.uploadProfileImage` | `app/cliente/perfil/page.tsx` |

## User

`CardGameStore/Controllers/UserController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/user` | AdminOnly | `GetAll` (52) | `userApi.list` | `app/admin/campeonatos/page.tsx`<br>`app/admin/crediario/page.tsx`<br>`app/admin/dashboard/page.tsx`<br>`app/admin/reservas/page.tsx`<br>`app/admin/usuarios/page.tsx`<br>`app/admin/venda-avulsa/page.tsx` |
| POST | `/api/user` | AdminOnly | `AdminCreate` (63) | `userApi.adminCreate` | `app/admin/reservas/page.tsx`<br>`app/admin/usuarios/page.tsx` |
| DELETE | `/api/user/me` | CustomerOrAdmin | `DeleteMe` (135) | `userApi.deleteMe` | — |
| GET | `/api/user/me` | logado | `GetMe` (90) | `userApi.me` | `app/cliente/decks/[id]/page.tsx`<br>`app/cliente/page.tsx`<br>`app/cliente/perfil/page.tsx`<br>`app/produtos/[id]/page.tsx`<br>`components/CompleteProfileGuard.tsx` |
| PUT | `/api/user/me` | CustomerOrAdmin | `UpdateMe` (105) | `userApi.updateMe` | `app/cliente/perfil/page.tsx` |
| GET | `/api/user/me/preferences` | logado | `GetPreferences` (410) | `userApi.getPreferences` | `contexts/PreferencesContext.tsx` |
| PUT | `/api/user/me/preferences` | logado | `UpdatePreferences` (426) | `userApi.updatePreferences` | `contexts/PreferencesContext.tsx` |
| DELETE | `/api/user/{id:guid}` | AdminOnly | `DeleteUser` (494) | `userApi.adminDelete` | `app/admin/usuarios/page.tsx` |
| GET | `/api/user/{id:guid}` | AdminOnly | `GetById` (159) | `userApi.getById` | `app/admin/venda-avulsa/page.tsx` |
| PUT | `/api/user/{id:guid}` | AdminOnly | `AdminUpdateUser` (226) | `userApi.adminUpdate` | `app/admin/usuarios/page.tsx` |
| POST | `/api/user/{id:guid}/balance` | AdminOnly | `AdjustBalance` (203) | `userApi.adjustBalance` | `app/admin/usuarios/page.tsx` |
| GET | `/api/user/{id:guid}/historico` | AdminOnly | `GetHistorico` (279) | `userApi.historico` | `app/admin/usuarios/page.tsx` |
| PUT | `/api/user/{id:guid}/perfil` | AdminOnly | `AtualizarPerfil` (447) | `userApi.adminUpdatePerfil` | `app/admin/usuarios/page.tsx` |
| POST | `/api/user/{id:guid}/points` | AdminOnly | `AddPoints` (177) | `userApi.addPoints` | `app/admin/usuarios/page.tsx` |
| PUT | `/api/user/{id:guid}/reset-password` | AdminOnly | `AdminResetPassword` (253) | `userApi.adminResetPassword` | `app/admin/usuarios/page.tsx` |

## VendaAvulsa

`CardGameStore/Controllers/VendaAvulsaController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| POST | `/api/venda-avulsa` | AdminOnly | `Register` (45) | `vendaAvulsaApi.register` | `app/admin/venda-avulsa/page.tsx` |
| POST | `/api/venda-avulsa/backfill-costs` | AdminOnly | `BackfillCosts` (155) | `vendaAvulsaApi.backfillCosts` | `app/admin/financeiro/page.tsx` |
| GET | `/api/venda-avulsa/by-date` | AdminOnly | `GetByDate` (84) | `vendaAvulsaApi.byDate` | `app/admin/venda-avulsa/page.tsx` |
| GET | `/api/venda-avulsa/recent` | AdminOnly | `GetRecent` (72) | `vendaAvulsaApi.recent` | — |
| POST | `/api/venda-avulsa/{id}/estornar` | AdminOnly | `Estornar` (127) | `vendaAvulsaApi.estornar` | `app/admin/venda-avulsa/page.tsx` |
| PATCH | `/api/venda-avulsa/{id}/pagamento` | AdminOnly | `EditarPagamento` (106) | `vendaAvulsaApi.editarPagamento` | `app/admin/venda-avulsa/page.tsx` |

## WhatsAppAdmin

`CardGameStore/Controllers/WhatsAppAdminController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/admin/whatsapp/conversations` | AdminOnly | `Conversations` (52) | `whatsappAdminApi.conversations` | `components/admin/Sidebar.tsx`<br>`components/admin/whatsapp/WhatsAppFloatingPanel.tsx`<br>`components/admin/whatsapp/WhatsAppInbox.tsx`<br>`tests/whatsapp.spec.ts` |
| POST | `/api/admin/whatsapp/conversations/{phone}/bot-disabled` | AdminOnly | `SetBotDisabled` (184) | `whatsappAdminApi.setBotDisabled` | `components/admin/whatsapp/WhatsAppInbox.tsx` |
| GET | `/api/admin/whatsapp/conversations/{phone}/messages` | AdminOnly | `Messages` (111) | `whatsappAdminApi.messages` | `components/admin/whatsapp/WhatsAppInbox.tsx`<br>`tests/whatsapp.spec.ts` |
| POST | `/api/admin/whatsapp/conversations/{phone}/mode` | AdminOnly | `SetMode` (168) | `whatsappAdminApi.setMode` | `components/admin/whatsapp/WhatsAppInbox.tsx` |
| POST | `/api/admin/whatsapp/conversations/{phone}/read` | AdminOnly | `MarkRead` (155) | `whatsappAdminApi.markRead` | `components/admin/whatsapp/WhatsAppInbox.tsx`<br>`tests/whatsapp.spec.ts` |
| POST | `/api/admin/whatsapp/conversations/{phone}/send` | AdminOnly | `Send` (198) | `whatsappAdminApi.send` | `components/admin/whatsapp/WhatsAppInbox.tsx` |
| GET | `/api/admin/whatsapp/qr-code` | AdminOnly | `QrCode` (45) | `whatsappAdminApi.qrCode` | `app/admin/whatsapp/page.tsx` |
| GET | `/api/admin/whatsapp/status` | AdminOnly | `Status` (32) | `whatsappAdminApi.status` | `components/admin/whatsapp/WhatsAppFloatingPanel.tsx`<br>`components/admin/whatsapp/WhatsAppInbox.tsx`<br>`tests/whatsapp.spec.ts` |

## WhatsAppAutomation

`CardGameStore/Controllers/WhatsAppAutomationController.cs`

| Método | Rota | Quem | Ação (linha) | Função no front | Telas |
|---|---|---|---|---|---|
| GET | `/api/automation/whatsapp/health` | público | `Health` (41) | — | — |
| POST | `/api/automation/whatsapp/message` | público | `Message` (28) | — | — |
