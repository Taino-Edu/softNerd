// =============================================================================
// lib/api.ts — Cliente HTTP centralizado (axios + interceptors JWT)
//
// Segurança: os tokens JWT são armazenados como cookies HttpOnly pelo backend.
// O browser envia esses cookies automaticamente — não há manipulação manual
// de tokens no frontend, evitando exposição via JavaScript (proteção XSS).
// =============================================================================
import axios from 'axios'
import { clearAuth } from './auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // withCredentials garante que o browser envie os cookies HttpOnly
  // (accessToken, refreshToken) em todas as requisições cross-origin.
  withCredentials: true,
})

// Mutex de refresh: evita múltiplas requisições simultâneas disparando vários refreshes
// quando o token expira com várias chamadas em paralelo na mesma página.
let refreshPromise: Promise<void> | null = null

async function doRefresh(): Promise<void> {
  // O refreshToken é enviado automaticamente via cookie HttpOnly (withCredentials).
  // O backend lê o cookie e retorna novos cookies — sem manipulação manual de tokens.
  await axios.post(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
}

// Tenta renovar o token se receber 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        // Reutiliza o mesmo promise se já há um refresh em andamento
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => { refreshPromise = null })
        }
        await refreshPromise
        // Re-tenta a requisição original — o novo accessToken já está no cookie
        return api(original)
      } catch {
        // Refresh falhou — redireciona de acordo com o tipo de página:
        //   /admin/*  → /login   (painel de gestão)
        //   /cliente/* → /entrar (área do cliente)
        //   demais    → limpa cookies e fica na página (QR code, campeonatos, etc.)
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          const path = window.location.pathname
          clearAuth()
          if (path.startsWith('/admin')) {
            window.location.href = '/login'
          } else if (path.startsWith('/cliente')) {
            window.location.href = '/entrar'
          }
          // Páginas públicas (/mesa, /campeonato, /produtos…): só limpa os cookies,
          // o usuário continua na mesma página sem redirecionamento.
        }
      }
    }
    return Promise.reject(error)
  }
)

// ── Tipagens ──────────────────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken?: string; refreshToken?: string; expiresAt: string
  role: string; userName: string; userId: string
  comandaId?: string
  permissions?: string[]
}

export interface ComandaDto {
  id: string; userName: string; userId: string
  tableIdentifier: string | null; status: string
  totalInReais: number; pointsApplied: number; discountInCents: number
  openedAt: string; closedAt?: string
  paymentMethod: string | null
  secondPaymentMethod: string | null
  secondPaymentAmountInCents: number
  items: ComandaItemDto[]
  /** Saldo de pontos do cliente (para exibir na modal de fechamento). */
  userPointsBalance: number
  /** Saldo de cashback/crédito do cliente em centavos. */
  userBalanceInCents: number
  profileImageUrl?: string | null
  /** Preenchidos só quando o fechamento pediu emissão de NFC-e (emitirNotaFiscal=true). */
  notaFiscalId?: string | null
  notaFiscalStatus?: string | null
  notaFiscalMotivoRejeicao?: string | null
}

export interface ComandaItemDto {
  id: string; productId?: string | null; itemNameSnapshot: string; quantity: number
  unitPriceInCents: number; unitPriceInReais: number; subtotalInReais: number; addedAt: string
}

export interface EditarItemRequest {
  comandaItemId?: string
  remover?: boolean
  productId?: string
  itemName: string
  unitPriceInCents: number
  quantity: number
}

export interface EditarComandaRequest {
  paymentMethod?: string
  secondPaymentMethod?: string
  secondPaymentAmountInCents?: number
  novoClienteId?: string
  descontoEmCentavos?: number
  notes?: string
  itens?: EditarItemRequest[]
}

export interface Product {
  id: string; name: string; description: string | null; category: string
  barcode: string | null
  priceInCents: number; costPriceInCents: number; stockQuantity: number; minimumStock: number
  discountPriceInCents: number | null; discountPriceInReais: number | null; isOnPromo: boolean
  isActive: boolean; isFeatured: boolean; showOnSite: boolean; showOnMarketplace: boolean; isPreVenda: boolean; imageUrl: string | null
  imageUrls: string[]; fullDescription: string | null
  isLowStock: boolean; priceInReais: number; costPriceInReais: number
  marginInReais: number; marginPercent: number
  hasVariants: boolean
  /** "Data de rua" da pré-venda (YYYY-MM-DD) — retirada/venda só a partir dela. Null = sem trava. */
  preVendaReleaseDate: string | null
  /** NCM (Nomenclatura Comum do Mercosul) — obrigatório para emitir NFC-e deste produto. */
  ncm: string | null
  /** CEST (7 dígitos) — obrigatório só nos CSOSNs de substituição tributária (201/202/203/500). */
  cest: string | null
  /** Natureza de operação (CFOP/CSOSN) usada na emissão fiscal. Null = usa a marcada como padrão. */
  naturezaOperacaoId: string | null
  updatedAt: string; createdAt: string
}

export interface ProductVariant {
  id: string; productId: string
  size: string | null; color: string | null
  stockQuantity: number; priceInCents: number | null
  sku: string | null; label: string; createdAt: string
}

export interface ProductCategory {
  id: string; name: string; emoji: string | null
  displayOrder: number; isActive: boolean; createdAt: string
  parentCategoryId: string | null
}

export const categoryApi = {
  list:   ()                          => api.get<ProductCategory[]>('/api/category'),
  create: (c: Partial<ProductCategory>) => api.post<ProductCategory>('/api/category', c),
  update: (id: string, c: Partial<ProductCategory>) => api.put<ProductCategory>(`/api/category/${id}`, c),
  delete: (id: string)                => api.delete(`/api/category/${id}`),
}

export interface AnnouncementDto {
  id: string; title: string; body: string | null
  imageUrl: string | null; linkUrl: string | null
  type: string; isActive: boolean
  expiresAt: string | null; createdAt: string
}

export const ANNOUNCEMENT_TYPES = ['Banner', 'Aviso', 'Destaque'] as const

export interface CardAttack {
  name: string; cost: string[]; convertedEnergyCost: number; damage?: string | null; text?: string | null
}
export interface CardWeakness { type: string; value: string }
export interface CardPriceVariant { low?: number | null; mid?: number | null; high?: number | null; market?: number | null; directLow?: number | null }
export interface CardAllPrices {
  normal?: CardPriceVariant | null
  holofoil?: CardPriceVariant | null
  reverseHolofoil?: CardPriceVariant | null
  firstEditionNormal?: CardPriceVariant | null
  firstEditionHolofoil?: CardPriceVariant | null
  unlimitedNormal?: CardPriceVariant | null
  unlimitedHolofoil?: CardPriceVariant | null
}
export interface CardMarketPrices {
  averageSellPrice?: number | null; lowPrice?: number | null; trendPrice?: number | null
  reverseHoloSell?: number | null; reverseHoloLow?: number | null; reverseHoloTrend?: number | null
  lowPriceExPlus?: number | null
  avg1?: number | null; avg7?: number | null; avg30?: number | null
  reverseHoloAvg1?: number | null; reverseHoloAvg7?: number | null; reverseHoloAvg30?: number | null
  url?: string | null; updatedAt?: string | null
}

export interface CardCache {
  tcgCardId: string; name: string; game: string
  setName: string | null; setCode: string | null; number?: string | null
  setSeries?: string | null; setPtcgoCode?: string | null; setReleaseDate?: string | null
  rarity: string | null; type: string | null
  subtypes: string[]; types: string[]
  hp: string | null; artist: string | null; flavorText: string | null; regulationMark: string | null
  evolvesFrom?: string | null; evolvesTo?: string[]
  nationalPokedexNumbers?: number[]
  legalities?: Record<string, string>
  attacks: CardAttack[]; weaknesses: CardWeakness[]; resistances: CardWeakness[]
  retreatCost: string[]; convertedRetreatCost: number | null
  imageUrlSmall: string | null; imageUrlLarge: string | null
  allPrices: CardAllPrices | null
  marketPrices: CardPriceVariant | null
  cardMarket?: CardMarketPrices | null
  cachedAt: string
}

export interface DeckCard {
  id: string; name: string; quantity: number
  setCode?: string; setName?: string; number?: string
  imageSmall?: string; type?: string; hp?: string
}

export interface DeckDto {
  id: string; userId: string; name: string; game: string; format: string
  cardsJson: string; isPublic: boolean; cardCount: number
  createdAt: string; updatedAt: string
}

export interface DeckListDto {
  id: string; name: string; game: string; format: string
  isPublic: boolean; cardCount: number; updatedAt: string
}

export interface Championship {
  id: string; name: string; game: string; status: string
  startDate: string; entryFeeInCents: number; entryFeeInReais: number; maxParticipants: number | null
  description?: string | null; participantCount?: number
  preInscricaoCount?: number; listaEsperaCount?: number
  registrationDeadline?: string | null; endDate?: string | null
  imageUrl?: string | null; podioJson?: string | null
  participants?: ChampionshipParticipant[]
}

export interface ChampionshipPreInscricao {
  id: string; nome: string; whatsApp: string; isListaEspera?: boolean
  numero?: number; createdAt: string; deckId?: string | null; deckName?: string | null
}

export interface TimerDto {
  id: string; name: string; durationSeconds: number; pausedRemaining: number | null
  state: 'stopped' | 'running' | 'paused' | 'finished'
  startedAt: string | null; soundPreset: string; warnAtSeconds: number
}

export interface PodioItem { lugar: number; nome: string }

export interface ChampionshipParticipant {
  id: string; userId: string; userName: string; playerNumber: number
  deckName?: string | null; deckId?: string | null; placement?: number | null; registeredAt: string
  entryFeePaidAt?: string | null; entryFeePaymentMethod?: string | null
}

export interface UserSummary {
  id: string; name: string; email: string | null
  cpf: string | null; whatsApp: string | null; role: string; profileImageUrl: string | null
  perfilId: string | null; perfilNome: string | null
  pointsBalance: number; pointsExpiresAt: string | null
  pointsExpired: boolean; balanceInCents: number; isActive: boolean; createdAt: string
}

export interface UserProfile {
  id: string; name: string; email: string | null
  cpf: string | null; whatsApp: string | null; role: string; profileImageUrl: string | null
  pointsBalance: number; pointsExpiresAt: string | null
  pointsExpired: boolean; balanceInCents: number; createdAt: string
  /** Conta completa = senha + e-mail. Quick-login cria conta semi-criada (false) —
   * o site exige completar (CompleteProfileGuard) pra redefinição de senha funcionar. */
  hasPassword: boolean; profileComplete: boolean
}

type PrefCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export type DashChartScheme = 'default' | 'blue' | 'neon'
export type DashRefreshInterval = 15 | 30 | 60 | 0

export interface DashboardPanels {
  finHoje:       boolean
  grafico:       boolean
  previsao:      boolean
  patrimonio:    boolean
  clientes:      boolean
  produtos:      boolean
  lgpd:          boolean
  preInscricoes: boolean
  preVenda:      boolean
}

export interface UserPreferences {
  aiButton:      { mode: 'draggable' | 'fixed'; corner: PrefCorner; enabled: boolean }
  vlibras:       { enabled: boolean; corner: PrefCorner }
  notifications: { soundEnabled: boolean; browserEnabled: boolean }
  pdv:           { defaultDiscount: 0 | 5 | 10 | 15 | 20 }
  dashboard:     { refreshInterval: DashRefreshInterval; chartScheme: DashChartScheme; panels: DashboardPanels }
}

export const DEFAULT_DASHBOARD_PANELS: DashboardPanels = {
  finHoje: true, grafico: true, previsao: true, patrimonio: true,
  clientes: true, produtos: true, lgpd: true, preInscricoes: true, preVenda: true,
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  aiButton:      { mode: 'draggable', corner: 'bottom-right', enabled: true },
  vlibras:       { enabled: true, corner: 'bottom-right' },
  notifications: { soundEnabled: true, browserEnabled: true },
  pdv:           { defaultDiscount: 0 },
  dashboard:     { refreshInterval: 30, chartScheme: 'default', panels: DEFAULT_DASHBOARD_PANELS },
}

// ── Funções de API ────────────────────────────────────────────────────────────

export interface CpfLookupResponse { name: string; hasPassword: boolean }

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/login', { email, password }),
  clientLogin: (email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/client-login', { email, password }),
  register: (name: string, email: string, password: string, whatsApp?: string, cpf?: string) =>
    api.post<AuthResponse>('/api/auth/register', { name, email, password, whatsApp, cpf }),
  cpfLookup: (cpf: string) =>
    api.post<CpfLookupResponse>('/api/auth/cpf-lookup', { cpf }),
  setupAccount: (cpf: string, email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/setup-account', { cpf, email, password }),
  completeProfile: (email: string, password: string) =>
    api.post('/api/auth/complete-profile', { email, password }),
  quickLogin: (name: string, cpf: string | null, whatsApp: string, tableIdentifier?: string) =>
    api.post<AuthResponse>('/api/auth/quick-login', { name, cpf: cpf || null, whatsApp, tableIdentifier }),
  logout:         () => api.post('/api/auth/logout'),
  forgotPassword: (email: string) =>
    api.post('/api/auth/forgot-password', { email }),
  resetPassword:  (token: string, newPassword: string) =>
    api.post('/api/auth/reset-password', { token, newPassword }),
  uploadProfileImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ url: string }>('/api/upload/profile-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}

export const announcementApi = {
  visible: () => api.get<AnnouncementDto[]>('/api/announcements'),
  all:     () => api.get<AnnouncementDto[]>('/api/announcements/all'),
  create:  (data: Omit<AnnouncementDto, 'id' | 'createdAt'>) =>
    api.post<AnnouncementDto>('/api/announcements', data),
  update:  (id: string, data: Partial<Omit<AnnouncementDto, 'id' | 'createdAt'>>) =>
    api.put<AnnouncementDto>(`/api/announcements/${id}`, data),
  delete:  (id: string) => api.delete(`/api/announcements/${id}`),
}

export interface VendaAvulsaDto {
  id: string
  clientName: string | null
  paymentMethod: string
  secondPaymentMethod: string | null
  secondPaymentAmountInCents: number
  totalInReais: number
  discountPercent: number
  discountInReais: number
  soldAt: string
  soldByAdminName: string
  items: {
    productName: string
    productCategory: string | null
    quantity: number
    unitPriceInReais: number
    subtotalInReais: number
  }[]
  /** Preenchidos só quando o registro pediu emissão de NFC-e (emitirNotaFiscal=true). */
  notaFiscalId?: string | null
  notaFiscalStatus?: string | null
  notaFiscalMotivoRejeicao?: string | null
}

export const PAYMENT_METHODS = [
  { value: 'Pix',           label: 'Pix' },
  { value: 'Dinheiro',      label: 'Dinheiro' },
  { value: 'CartaoCredito', label: 'Cartão de Crédito' },
  { value: 'CartaoDebito',  label: 'Cartão de Débito' },
  { value: 'Crediario',     label: 'Crediário' },
  { value: 'Pontos',        label: 'Pontos' },
  { value: 'Cashback',      label: 'Cashback' },
] as const

// Métodos que requerem cliente cadastrado selecionado
export const PAYMENT_NEEDS_USER = ['Crediario', 'Pontos', 'Cashback'] as const

// Métodos disponíveis como segundo pagamento (complemento via carteira do cliente)
export const SECOND_PAYMENT_METHODS = [
  { value: 'Cashback', label: 'Cashback (Saldo)' },
  { value: 'Pontos',   label: 'Pontos de Fidelidade' },
] as const

export const comandaApi = {
  dashboard:    () => api.get<ComandaDto[]>('/api/comanda/dashboard'),
  history:      (data?: string) => api.get<ComandaDto[]>('/api/comanda/history', { params: data ? { data } : undefined }),
  myComanda:    () => api.get<ComandaDto>('/api/comanda/my'),
  myHistory:    () => api.get<ComandaDto[]>('/api/comanda/my-history'),
  addItem:      (id: string, item: { productId?: string; cardCacheId?: string; variantId?: string; itemName: string; unitPriceInCents: number; quantity: number }) =>
    api.post<ComandaDto>(`/api/comanda/${id}/items`, item),
  removeItem:   (id: string, itemId: string) => api.delete<ComandaDto>(`/api/comanda/${id}/items/${itemId}`),
  updateItem:   (id: string, itemId: string, quantity: number) =>
    api.patch<ComandaDto>(`/api/comanda/${id}/items/${itemId}`, { quantity }),
  close:        (id: string, paymentMethod = 'Dinheiro', observacao?: string, secondPaymentMethod?: string, secondPaymentAmountInCents = 0, crediarioExistenteId?: string, discountInCents = 0, emitirNotaFiscal = false) =>
    api.put<ComandaDto>(`/api/comanda/${id}/close`, { paymentMethod, observacao, secondPaymentMethod, secondPaymentAmountInCents, crediarioExistenteId, discountInCents, emitirNotaFiscal }),
  cancel:       (id: string) => api.put<ComandaDto>(`/api/comanda/${id}/cancel`),
  editar:       (id: string, request: EditarComandaRequest) => api.put<ComandaDto>(`/api/comanda/${id}/editar`, request),
  adminOpen:    (userId: string, tableIdentifier?: string) =>
    api.post<ComandaDto>('/api/comanda/admin-open', { userId, tableIdentifier }),
  applyPoints:  (id: string, points: number) =>
    api.post<ComandaDto>(`/api/comanda/${id}/apply-points`, { points }),
  removePoints: (id: string) =>
    api.delete<ComandaDto>(`/api/comanda/${id}/apply-points`),
  gerarPix: (id: string) =>
    api.post<PixCobrancaDto>(`/api/comanda/${id}/pix`),
  statusPix: (id: string, txid: string) =>
    api.get<{ txId: string; status: string; pagoEm: string | null; comanda: ComandaDto | null }>(`/api/comanda/${id}/pix/${txid}/status`),
  // Lado do cliente: cobrança ativa da própria comanda + verificação de pagamento
  meuPix: () =>
    api.get<PixCobrancaDto>('/api/comanda/my/pix'),
  verificarMeuPix: () =>
    api.post<{ txId: string; status: string; pagoEm: string | null; comanda: ComandaDto | null }>('/api/comanda/my/pix/verificar'),
}

// ── Crediário ─────────────────────────────────────────────────────────────────

export interface PagamentoCrediarioDto {
  id: string
  valorEmReais: number
  formaPagamento: string
  observacao: string | null
  createdAt: string
}

export interface ItemCrediarioDto {
  itemName: string
  quantity: number
  unitPriceInReais: number
  subtotalInReais: number
}

export interface CrediariosDto {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  comandaId: string | null
  valorEmReais: number
  valorPagoEmReais: number
  saldoRestanteEmReais: number
  dataAbertura: string
  dataVencimento: string
  dataPagamento: string | null
  status: string        // 'Aberto' | 'Pago' | 'Vencido'
  observacao: string | null
  vencido: boolean
  diasRestantes: number
  pagamentos: PagamentoCrediarioDto[]
  itensComanda: ItemCrediarioDto[]
}

export const FORMAS_PAGAMENTO_CREDIARIO = [
  { value: 'Dinheiro',      label: 'Dinheiro' },
  { value: 'Pix',           label: 'Pix' },
  { value: 'CartaoCredito', label: 'Cartão de Crédito' },
  { value: 'CartaoDebito',  label: 'Cartão de Débito' },
] as const

export interface CriarCrediarioManualRequest {
  userId: string
  valorEmCentavos: number
  observacao?: string
  dataAbertura?: string   // ISO string, opcional — data real da dívida
  dataVencimento?: string // ISO string, opcional — se null usa dataAbertura + 30 dias
  itens?: ItemCrediarioDto[]
}

export interface CrediariosClienteDto {
  userId: string
  userName: string
  userEmail: string | null
  userWhatsApp: string | null
  saldoTotal: number
  totalDividas: number
  temVencido: boolean
  proximoVencimento: string
  dividas: CrediariosDto[]
}

export interface PixCobrancaDto {
  txId: string
  status: string // 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR' | 'REMOVIDA_PELO_PSP'
  pixCopiaCola: string | null
  imagemQrCode: string | null // data URI base64, pronta pra <img src=...>
  expiraEm: string | null
  valorEmReais: number
}

export const crediarioApi = {
  list:        (status?: string) =>
    api.get<CrediariosDto[]>('/api/crediarios', { params: { status } }),
  byUser:      (userId: string) =>
    api.get<CrediariosDto[]>(`/api/crediarios/usuario/${userId}`),
  meu:         () => api.get<CrediariosDto>('/api/crediarios/meu'),
  marcarPago:  (id: string, observacao?: string) =>
    api.put<CrediariosDto>(`/api/crediarios/${id}/pagar`, { observacao }),
  registrarPagamento: (id: string, req: { valorEmCentavos: number; formaPagamento: string; secondFormaPagamento?: string; secondValorEmCentavos?: number; observacao?: string }) =>
    api.post<CrediariosDto>(`/api/crediarios/${id}/pagamento`, req),
  criarManual: (req: CriarCrediarioManualRequest) =>
    api.post<CrediariosDto>('/api/crediarios', req),
  editar: (id: string, req: { valorEmCentavos?: number; observacao?: string; dataVencimento?: string; limparItens?: boolean; itens?: ItemCrediarioDto[] }) =>
    api.patch<CrediariosDto>(`/api/crediarios/${id}`, req),
  deletar: (id: string) =>
    api.delete(`/api/crediarios/${id}`),
  meuHistorico: () =>
    api.get<CrediariosDto[]>('/api/crediarios/historico'),
  porCliente: () =>
    api.get<CrediariosClienteDto[]>('/api/crediarios/por-cliente'),
  gerarPix: (id: string) =>
    api.post<PixCobrancaDto>(`/api/crediarios/${id}/pix`),
  statusPix: (id: string, txid: string) =>
    api.get<{ txId: string; status: string; pagoEm: string | null }>(`/api/crediarios/${id}/pix/${txid}/status`),
}

export const COMANDA_PAYMENT_METHODS = [
  { value: 'Dinheiro',      label: 'Dinheiro' },
  { value: 'Pix',           label: 'Pix' },
  { value: 'CartaoCredito', label: 'Cartão de Crédito' },
  { value: 'CartaoDebito',  label: 'Cartão de Débito' },
  { value: 'Crediario',     label: 'Crediário (30 dias)' },
  { value: 'Pontos',        label: 'Pontos de Fidelidade' },
  { value: 'Cashback',      label: 'Cashback (Saldo)' },
] as const

export interface EditarPagamentoVendaAvulsaRequest {
  paymentMethod: string
  secondPaymentMethod?: string
  secondPaymentAmountInCents?: number
  clientName?: string
  clearClientName?: boolean
  discountInCents?: number
}

export const vendaAvulsaApi = {
  register: (
    clientName: string | null,
    paymentMethod: string,
    items: { productId: string; quantity: number; variantId?: string }[],
    discountPercent = 0,
    userId?: string,
    secondPaymentMethod?: string | null,
    secondPaymentAmountInCents = 0,
    discountInCents?: number,
    emitirNotaFiscal = false,
  ) =>
    api.post<VendaAvulsaDto>('/api/venda-avulsa', {
      clientName, paymentMethod, items, discountPercent, discountInCents, userId,
      secondPaymentMethod: secondPaymentMethod || null,
      secondPaymentAmountInCents,
      emitirNotaFiscal,
    }),
  recent: (limit = 50) =>
    api.get<VendaAvulsaDto[]>('/api/venda-avulsa/recent', { params: { limit } }),
  byDate: (date: string) =>
    api.get<VendaAvulsaDto[]>('/api/venda-avulsa/by-date', { params: { date } }),
  backfillCosts: () =>
    api.post<{ itensAtualizados: number; mensagem: string }>('/api/venda-avulsa/backfill-costs'),
  editarPagamento: (id: string, request: EditarPagamentoVendaAvulsaRequest) =>
    api.patch<VendaAvulsaDto>(`/api/venda-avulsa/${id}/pagamento`, request),
}

export const productApi = {
  list:        (category?: string) => api.get<Product[]>('/api/product', { params: { category } }),
  listAdmin:   ()                  => api.get<Product[]>('/api/product/admin'),
  listStore:   ()                  => api.get<Product[]>('/api/product/store'),
  get:         (id: string)         => api.get<Product>(`/api/product/${id}`),
  getByBarcode:(barcode: string)    => api.get<Product>(`/api/product/barcode/${encodeURIComponent(barcode)}`),
  create:      (p: Partial<Product>) => api.post<Product>('/api/product', p),
  update:      (id: string, p: Partial<Product>) => api.put<Product>(`/api/product/${id}`, p),
  deactivate:  (id: string)         => api.delete(`/api/product/${id}`),
  lowStock:    ()                   => api.get<Product[]>('/api/product/low-stock'),
  adjustStock: (id: string, delta: number) => api.patch(`/api/product/${id}/stock`, { delta }),
}

export const variantApi = {
  list:   (productId: string) =>
            api.get<ProductVariant[]>(`/api/products/${productId}/variants`),
  update: (productId: string, variantId: string, v: Partial<ProductVariant>) =>
            api.put<ProductVariant>(`/api/products/${productId}/variants/${variantId}`, v),
  remove: (productId: string, variantId: string) =>
            api.delete(`/api/products/${productId}/variants/${variantId}`),
  bulk:   (productId: string, sizes: string[], colors: string[], stockQty: number) =>
            api.post<ProductVariant[]>(`/api/products/${productId}/variants/bulk`, { sizes, colors, baseStockQuantity: stockQty }),
}

export interface MyReservation {
  id: string; reservationGroupId: string
  productId: string; productName?: string; productImageUrl?: string
  variantId?: string; variantLabel?: string; quantity: number
  /** "pre_venda" (em estoque, baixou na hora) | "fila" (não chegou, espera) */
  kind: 'pre_venda' | 'fila'
  /** "waiting" (fila) | "active" (pré-venda vigente) | "fulfilled" | "cancelled" | "expired" */
  status: string
  notes?: string; reservedAt: string
  /** Não-nulo = pré-venda ainda não paga. Null = fila ou já paga. Não é mais um prazo. */
  expiresAt: string | null
  fulfilledAt?: string; cancelledAt?: string
  /** Posição na fila (só quando kind=fila e status=waiting). */
  posicaoFila?: number | null
  /** Data de rua da pré-venda (retirada a partir dela), se houver. */
  preVendaReleaseDate?: string | null
  /** Intenção de pagamento declarada na criação: "pix" | "retirada" | null (não declarado). */
  paymentMethod?: string | null
}

export interface ReservationPixStatus {
  hasPix: boolean; status?: string; pagoEm?: string
  pixCopiaCola?: string; imagemQrCode?: string; expiraEm?: string; valorEmReais?: number
}

export interface UpdateMeRequest {
  name?: string
  email?: string
  whatsApp?: string
}

export interface AdminCreateUserRequest {
  name: string
  cpf?: string
  whatsApp?: string
  email?: string
  password?: string
  role?: string
  perfilId?: string
}

export interface AdminUpdateUserRequest {
  name?: string
  email?: string
  cpf?: string
  whatsApp?: string
}

export interface PerfilDto {
  id: string
  nome: string
  permissoes: string[]
  criadoEm: string
  atualizadoEm: string
  totalUsuarios: number
}

export const perfisApi = {
  list:       ()                                    => api.get<PerfilDto[]>('/api/perfis'),
  permissoes: ()                                    => api.get<{ key: string; label: string }[]>('/api/perfis/permissoes'),
  create:     (nome: string, permissoes: string[])  => api.post<PerfilDto>('/api/perfis', { nome, permissoes }),
  update:     (id: string, data: { nome?: string; permissoes?: string[] }) =>
    api.put<PerfilDto>(`/api/perfis/${id}`, data),
  delete:     (id: string)                          => api.delete(`/api/perfis/${id}`),
}

// ── Histórico de cliente ──────────────────────────────────────────────────────

export interface ClienteHistoricoComandaItem {
  itemName: string; quantity: number; unitPriceInReais: number; subtotalInReais: number
}
export interface ClienteHistoricoComanda {
  id: string; status: string; totalInReais: number
  paymentMethod: string | null; secondPaymentMethod: string | null
  openedAt: string; closedAt: string | null; tableIdentifier: string | null
  items: ClienteHistoricoComandaItem[]
}
export interface ClienteHistoricoVendaAvulsaItem {
  productName: string; quantity: number; unitPriceInReais: number; subtotalInReais: number
}
export interface ClienteHistoricoVendaAvulsa {
  id: string; totalInReais: number; paymentMethod: string; soldAt: string
  items: ClienteHistoricoVendaAvulsaItem[]
}
export interface ClienteHistoricoCrediario {
  id: string; valorEmReais: number; saldoRestante: number
  status: string; vencido: boolean
  dataAbertura: string; dataVencimento: string; dataPagamento: string | null
  observacao: string | null
}
export interface ClienteHistoricoCampeonato {
  championshipId: string; championshipName: string; game: string
  status: string; startDate: string; playerNumber: number
  deckName: string | null; placement: number | null; registeredAt: string
}
export interface ClienteHistoricoDto {
  userId: string; userName: string
  totalVisitas: number; totalGasto: number
  primeiraVisita: string | null; ultimaVisita: string | null
  comandas: ClienteHistoricoComanda[]
  vendasAvulsas: ClienteHistoricoVendaAvulsa[]
  crediarios: ClienteHistoricoCrediario[]
  campeonatos: ClienteHistoricoCampeonato[]
}

export const userApi = {
  list:      (search?: string, role?: string) => api.get<UserSummary[]>('/api/user', { params: { search, role } }),
  getById:   (id: string)      => api.get<UserSummary>(`/api/user/${id}`),
  me:        ()                => api.get<UserProfile>('/api/user/me'),
  historico: (id: string)      => api.get<ClienteHistoricoDto>(`/api/user/${id}/historico`),
  addPoints: (id: string, points: number, reason?: string) =>
    api.post<UserSummary>(`/api/user/${id}/points`, { points, reason }),
  adjustBalance: (id: string, amountInCents: number, reason?: string) =>
    api.post<UserSummary>(`/api/user/${id}/balance`, { amountInCents, reason }),
  // Admin: criar conta e redefinir senha
  adminCreate: (data: AdminCreateUserRequest) =>
    api.post<UserSummary>('/api/user', data),
  adminResetPassword: (id: string, newPassword: string) =>
    api.put(`/api/user/${id}/reset-password`, { newPassword }),
  adminUpdate: (id: string, data: AdminUpdateUserRequest) =>
    api.put<UserSummary>(`/api/user/${id}`, data),
  adminUpdatePerfil: (id: string, perfilId: string | null) =>
    api.put<UserSummary>(`/api/user/${id}/perfil`, { perfilId }),
  adminDelete: (id: string) =>
    api.delete(`/api/user/${id}`),
  // LGPD — Direitos do titular
  updateMe:  (data: UpdateMeRequest) => api.put<UserProfile>('/api/user/me', data),
  deleteMe:  ()                      => api.delete('/api/user/me'),
  // Preferências pessoais
  getPreferences:    ()                        => api.get<UserPreferences>('/api/user/me/preferences'),
  updatePreferences: (data: UserPreferences)   => api.put<UserPreferences>('/api/user/me/preferences', data),
}

export interface TcgSet { code: string; name: string; game: string; series?: string; logoUrl?: string; totalCards: number; releaseDate?: string }

export interface TcgSearchParams {
  name?: string; game?: string; page?: number; pageSize?: number
  setId?: string; rarity?: string; cardType?: string
  // Pokémon extended
  artist?: string; supertype?: string; subtype?: string; energyType?: string
  regulationMark?: string; legality?: string; evolvesFrom?: string
  setSeries?: string; ptcgoCode?: string
  releaseDateFrom?: string; releaseDateTo?: string
  pokedexNumber?: number; hpMin?: number; hpMax?: number
}

export const tcgApi = {
  search: (name: string, game?: string, page = 1, pageSize = 30, setId?: string, rarity?: string, cardType?: string, extra?: Omit<TcgSearchParams, 'name'|'game'|'page'|'pageSize'|'setId'|'rarity'|'cardType'>) =>
    api.get<{ items: CardCache[]; totalCount: number; totalPages: number }>('/api/tcg/search',
      { params: { name, game, page, pageSize, ...(setId ? { setId } : {}), ...(rarity ? { rarity } : {}), ...(cardType ? { cardType } : {}), ...extra } }),
  searchAdvanced: (params: TcgSearchParams) =>
    api.get<{ items: CardCache[]; totalCount: number; totalPages: number }>('/api/tcg/search',
      { params }),
  searchByCode: (set: string, num: string, game = 'Pokemon') =>
    api.get<{ items: CardCache[]; totalCount: number }>('/api/tcg/search',
      { params: { set, num, game } }),
  getCard:  (id: string) => api.get<CardCache>(`/api/tcg/cards/${id}`),
  sets:     (game: string) => api.get<TcgSet[]>('/api/tcg/sets', { params: { game } }),
  /** `degradada` = o valor NÃO é a cotação real do momento (API fora do ar). `updatedAt`
   *  é quando a cotação foi lida de verdade, não a hora da requisição — null = nunca leu. */
  brlRate:  () => api.get<{
    usdToBrl: number
    updatedAt: string | null
    degradada: boolean
    aviso: string | null
  }>('/api/tcg/brl-rate'),
}

export const deckApi = {
  list:   (game?: string) => api.get<DeckListDto[]>('/api/deck', { params: game ? { game } : {} }),
  get:    (id: string)    => api.get<DeckDto>(`/api/deck/${id}`),
  create: (deck: { name: string; game: string; format?: string; cardsJson: string; isPublic: boolean }) =>
    api.post<DeckDto>('/api/deck', deck),
  update: (id: string, deck: { name: string; game: string; format?: string; cardsJson: string; isPublic: boolean }) =>
    api.put<DeckDto>(`/api/deck/${id}`, deck),
  delete: (id: string) => api.delete(`/api/deck/${id}`),
  getByUser: (userId: string) => api.get<DeckDto[]>(`/api/deck/user/${userId}`),
}


export interface MyParticipation {
  participationId: string; championshipId: string
  championshipName: string; game: string; startDate: string; status: string
  entryFeeInReais: number; playerNumber: number; deckName: string | null
  placement: number | null; registeredAt: string
}

export const championshipApi = {
  list:             () => api.get<Championship[]>('/api/championship'),
  update:           (id: string, c: Partial<Championship>) => api.put<Championship>(`/api/championship/${id}`, c),
  myParticipations: () => api.get<MyParticipation[]>('/api/championship/my-participations'),
  listAll:          (search?: string) => api.get<Championship[]>('/api/championship/admin/all', { params: search ? { search } : {} }),
  get:              (id: string) => api.get<Championship>(`/api/championship/${id}`),
  create:           (c: Partial<Championship>) => api.post<Championship>('/api/championship', c),
  delete:           (id: string) => api.delete(`/api/championship/${id}`),
  register:         (id: string, userId: string, deckName?: string) =>
    api.post(`/api/championship/${id}/register`, { userId, deckName }),
  adminRegister:    (id: string, userId: string, deckName?: string, deckId?: string) =>
    api.post<ChampionshipParticipant>(`/api/championship/${id}/admin-register`, { userId, deckName, deckId }),
  participants:     (id: string) =>
    api.get<ChampionshipParticipant[]>(`/api/championship/${id}/participants`),
  removeParticipant:(id: string, participantId: string) =>
    api.delete(`/api/championship/${id}/participants/${participantId}`),
  setStatus:        (id: string, status: string) =>
    api.put(`/api/championship/${id}/status`, { status }),
  setPlacement:     (id: string, participantId: string, placement: number) =>
    api.put(`/api/championship/${id}/participants/${participantId}/placement`, { placement }),
  marcarPagamento:  (participantId: string, pago: boolean) =>
    api.put(`/api/championship/participants/${participantId}/pagamento`, { pago }),
  setImage:         (id: string, imageUrl: string | null) =>
    api.put<Championship>(`/api/championship/${id}/image`, { imageUrl }),
  addPreInscricao:  (id: string, nome: string, whatsApp: string, deckId?: string, deckName?: string) =>
    api.post<ChampionshipPreInscricao>(`/api/championship/${id}/preinscricoes`, { nome, whatsApp, deckId, deckName }),
  getPreInscricoes: (id: string) =>
    api.get<ChampionshipPreInscricao[]>(`/api/championship/${id}/preinscricoes`),
  deletePreInscricao: (championshipId: string, preInscricaoId: string) =>
    api.delete(`/api/championship/${championshipId}/preinscricoes/${preInscricaoId}`),
  setPodio:         (id: string, podioJson: string) =>
    api.patch(`/api/championship/${id}/podio`, { podioJson }),
}

// ── Timers ────────────────────────────────────────────────────────────────────

export const timerApi = {
  list:   () => api.get<TimerDto[]>('/api/timers'),
  create: (t: { name: string; durationSeconds: number; soundPreset: string; warnAtSeconds: number }) =>
    api.post<TimerDto>('/api/timers', t),
  update: (id: string, req: { action: string; name?: string; durationSeconds?: number; soundPreset?: string; warnAtSeconds?: number; fromRemaining?: number }) =>
    api.put<TimerDto>(`/api/timers/${id}`, req),
  remove: (id: string) => api.delete(`/api/timers/${id}`),
}

// ── Assistente IA ─────────────────────────────────────────────────────────────

export interface AiChatResponse {
  reply:   string
  success: boolean
  error?:  string
  action?: { type: 'navigate' | 'openWizard'; route?: string }
}

export const aiApi = {
  chat: (message: string) =>
    api.post<AiChatResponse>('/api/ai/chat', { message }),
}

// ── Upload de imagem ──────────────────────────────────────────────────────────

export const uploadApi = {
  /** Envia um arquivo de imagem e retorna a URL pública gerada pelo servidor. */
  image: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ url: string }>('/api/upload/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// ── LGPD — Público ────────────────────────────────────────────────────────────

export interface LgpdRequestCreate {
  requesterName:  string
  requesterEmail: string
  requesterCpf:   string
  requestType:    string
  description?:   string
}

export interface LgpdRequestDto {
  id:            string
  requesterName: string
  requesterEmail:string
  requesterCpf:  string
  requestType:   string
  description:   string | null
  status:        string
  adminResponse: string | null
  createdAt:     string
  deadline:      string
  respondedAt:   string | null
  isOverdue:     boolean
  isUrgent:      boolean
}

export const lgpdApi = {
  /** Abre uma solicitação de exercício de direitos LGPD (público, sem auth). */
  submitRequest: (data: LgpdRequestCreate) =>
    api.post<{ protocol: string; deadline: string; message: string }>('/api/lgpd/request', data),

  /** Consulta o status de uma solicitação pelo número de protocolo. */
  getRequest: (id: string) =>
    api.get<{
      id: string; requestType: string; status: string
      adminResponse: string | null; createdAt: string
      deadline: string; respondedAt: string | null
    }>(`/api/lgpd/request/${id}`),

  /** Registra consentimento ou recusa de cookies. */
  recordConsent: (accepted: boolean) =>
    api.post('/api/lgpd/consent', { accepted }),
}

// ── LGPD — Admin ──────────────────────────────────────────────────────────────

export const lgpdAdminApi = {
  /** Lista todas as solicitações LGPD, com filtro opcional por status. */
  listRequests: (status?: string) =>
    api.get<LgpdRequestDto[]>('/api/lgpd/requests', { params: status ? { status } : undefined }),

  /** Responde formalmente a uma solicitação LGPD. */
  respond: (id: string, data: { status: string; adminResponse: string }) =>
    api.put<LgpdRequestDto>(`/api/lgpd/requests/${id}/respond`, data),

  /** Lista audit logs paginados. */
  listAudit: (page = 1, pageSize = 50) =>
    api.get('/api/audit', { params: { page, pageSize } }),
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface ClienteInsightDto {
  userId: string
  nome: string
  email: string | null
  whatsApp: string | null
  gastoTotal: number
  ticketMedio: number
  numVisitas: number
  ultimaVisita: string | null
  inativo30: boolean
  pontos: number
  /** Dias até os pontos vencerem. Negativo = já venceu. Null = sem data de vencimento. */
  pontosVencemEm: number | null
}

export interface DiaFinanceiroDto {
  dia: string
  receita: number
  custo: number
}

export interface TopProductFinDto {
  nome: string
  categoria: string
  qtd: number
  qtdComandas: number
  qtdAvulsa: number
  qtdSite: number
  qtdPreVenda: number
  receita: number
  receitaComandas: number
  receitaAvulsa: number
  receitaSite: number
  receitaPreVenda: number
  custo: number
  margem: number
}

export interface TransacaoFinDto {
  origem: string       // 'Comanda' | 'PDV' | 'Site' | 'Pré-venda'
  cliente: string | null
  valor: number
  data: string
  nota?: string | null   // ex.: "+ Cashback R$ 19,00" para split payment
}

export interface PagamentoCrediarioPeriodoDto {
  clienteNome: string
  clienteWhatsApp: string | null
  valorEmReais: number
  formaPagamento: string
  observacao: string | null
  createdAt: string
}

/** Crediário aberto (concedido) dentro do período filtrado. */
export interface AberturaCrediarioPeriodoDto {
  clienteNome: string
  clienteWhatsApp: string | null
  valorEmReais: number
  saldoRestante: number
  status: string
  vencido: boolean
  dataAbertura: string
}

export interface FormaPagamentoTotalDto {
  forma: string
  total: number
  quantidade: number
  transacoes: TransacaoFinDto[]
}

export interface FinanceiroDto {
  receita: number
  receitaComandas: number
  receitaAvulsa: number
  receitaSite: number
  receitaPreVenda: number
  custo: number
  margem: number
  margemPercent: number
  crediarios: number
  recebidoCrediario: number
  diaDia: DiaFinanceiroDto[]
  topProdutos: TopProductFinDto[]
  pagamentosPorForma: FormaPagamentoTotalDto[]
  pagamentosCrediarioPeriodo: PagamentoCrediarioPeriodoDto[]
  aberturasCrediarioPeriodo: AberturaCrediarioPeriodoDto[]
  /** Total concedido em crediário no período (soma das aberturas). */
  abertoCrediario: number
}

/** Filtros do Top Clientes. Todos opcionais — omitir tudo devolve o histórico
 *  completo (só comandas, sem limite), que é o comportamento antigo do endpoint. */
export interface ClientesFiltro {
  /** Data de início (YYYY-MM-DD, fuso de Brasília). */
  inicio?: string
  /** Data de fim, inclusiva (YYYY-MM-DD, fuso de Brasília). */
  fim?: string
  /** Soma também as vendas de PDV identificadas com o cliente. */
  incluirPdv?: boolean
  /** Filtra por forma de pagamento (1ª ou 2ª). */
  filterPaymentMethod?: string
  /** Corta em N clientes depois de ordenar por gasto. */
  limite?: number
  apenasInativos?: boolean
}

export const analyticsApi = {
  dashboard: () => api.get('/api/analytics/dashboard'),
  clientes:  (filtro: ClientesFiltro | boolean = false) => {
    // Aceita o booleano antigo (`clientes(true)` = só inativos) pra não quebrar
    // as chamadas que já existiam antes dos filtros.
    const f: ClientesFiltro = typeof filtro === 'boolean' ? { apenasInativos: filtro } : filtro
    return api.get<ClienteInsightDto[]>('/api/analytics/clientes', {
      params: {
        apenasInativos:      f.apenasInativos ?? false,
        inicio:              f.inicio || undefined,
        fim:                 f.fim || undefined,
        incluirPdv:          f.incluirPdv ?? undefined,
        filterPaymentMethod: f.filterPaymentMethod || undefined,
        limite:              f.limite || undefined,
      },
    })
  },
  financeiro: (inicio?: string, fim?: string, filterPaymentMethod?: string) =>
    api.get<FinanceiroDto>('/api/analytics/financeiro', {
      params: { inicio, fim, filterPaymentMethod: filterPaymentMethod || undefined },
    }),
}

// ── Relatórios de vendas por categoria ───────────────────────────────────────

export interface RelatorioProduto {
  nome: string
  quantidadeVendida: number
  totalEmReais: number
}

export interface RelatorioCategoria {
  categoria: string
  emoji: string
  quantidadeVendida: number
  totalEmReais: number
  produtos: RelatorioProduto[]
}

export interface RelatorioVendasDto {
  mes: number
  ano: number
  totalGeralEmReais: number
  totalItensVendidos: number
  porCategoria: RelatorioCategoria[]
}

export interface DevedorDto {
  userId: string
  nome: string
  email: string | null
  whatsApp: string | null
  saldoEmReais: number
  vencido: boolean
  diasAtraso: number
  dataVencimento: string
}

export interface PagamentoMesDto {
  clienteNome: string
  valorEmReais: number
  formaPagamento: string
  observacao: string | null
  createdAt: string
}

export interface RelatorioCrediarioDto {
  mes: number
  ano: number
  totalEmAbertoEmReais: number
  totalVencidoEmReais: number
  qtdAbertos: number
  qtdVencidos: number
  recebidoNoMesEmReais: number
  qtdPagamentosNoMes: number
  devedores: DevedorDto[]
  pagamentosNoMes: PagamentoMesDto[]
}

export const relatorioApi = {
  vendas: (mes: number, ano: number) =>
    api.get<RelatorioVendasDto>('/api/relatorios/vendas', { params: { mes, ano } }),
  crediario: (mes: number, ano: number) =>
    api.get<RelatorioCrediarioDto>('/api/relatorios/crediario', { params: { mes, ano } }),
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export interface CardListingDto {
  id: string
  cardName: string; cardGame: string | null; cardImageUrl: string | null
  priceInCents: number; priceInReais: string
  condition: string; description: string | null
  status: string
  createdAt: string
  sellerId: string; sellerName: string; sellerImageUrl: string | null
  interestCount: number; myInterest: boolean
  interests?: { userId: string; userName: string; message: string | null; createdAt: string }[]
}

export interface MarketplacePageDto {
  items: CardListingDto[]; totalCount: number; totalPages: number
}

export interface CreateListingRequest {
  cardName: string; cardGame?: string; cardImageUrl?: string
  priceInCents: number; condition: string; description?: string
}

export interface MarketplaceInterestDto {
  id: string; userId: string; userName: string | null
  userProfileImage: string | null; userWhatsApp: string | null
  message: string | null; createdAt: string
}

export const marketplaceApi = {
  list: (params?: { page?: number; pageSize?: number; game?: string; search?: string; status?: string; sellerId?: string }) =>
    api.get<MarketplacePageDto>('/api/marketplace', { params }),
  mine: () => api.get<CardListingDto[]>('/api/marketplace/mine'),
  create: (req: CreateListingRequest) => api.post<CardListingDto>('/api/marketplace', req),
  update: (id: string, req: Partial<CreateListingRequest & { status: string }>) =>
    api.put<CardListingDto>(`/api/marketplace/${id}`, req),
  remove: (id: string) => api.delete(`/api/marketplace/${id}`),
  toggleInterest: (id: string, opts?: { message?: string; shareContact?: boolean }) =>
    api.post<{ interested: boolean; interestCount: number }>(`/api/marketplace/${id}/interest`, {
      message: opts?.message,
      shareContact: opts?.shareContact ?? false,
    }),
  interests: (id: string) =>
    api.get<MarketplaceInterestDto[]>(`/api/marketplace/${id}/interests`),
  uploadImage: async (file: File): Promise<string> => {
    const fd = new FormData(); fd.append('file', file)
    const res = await api.post<{ url: string }>('/api/upload/marketplace-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.url
  },
}

// ── Perfil público ────────────────────────────────────────────────────────────

export interface PublicDeckDto {
  id: string; name: string; game: string; format: string | null; cardCount: number; updatedAt: string
}

export interface PublicChampionshipDto {
  championshipId: string; championshipName: string; game: string; startDate: string
  placement: number | null; playerNumber: number | null; deckName: string | null
}

export interface PublicProfileDto {
  id: string; name: string; profileImageUrl: string | null; memberSince: string
  publicDecks: PublicDeckDto[]
  championships: PublicChampionshipDto[]
}

export const publicProfileApi = {
  get: (userId: string) => api.get<PublicProfileDto>(`/api/profile/${userId}`),
}

// ── Reservas (pré-venda) ──────────────────────────────────────────────────────
export interface AdminReservation {
  id: string; reservationGroupId: string; userId: string
  userName?: string; userWhatsApp?: string
  productId: string; productName?: string; productImageUrl?: string
  /** Produto tem a tag de pré-venda ligada — decide a coluna do kanban (Vendas × Pré-vendas). */
  productIsPreVenda: boolean
  variantId?: string; variantLabel?: string; quantity: number
  kind: 'pre_venda' | 'fila'; status: string
  notes?: string; reservedAt: string; expiresAt: string | null
  fulfilledAt?: string; cancelledAt?: string
  posicaoFila?: number | null; preVendaReleaseDate?: string | null
  paymentMethod?: string | null
  precoUnitarioEmReais?: number | null
  subtotalEmReais?: number | null
}

export const reservationApi = {
  list:      (params?: { status?: string; kind?: string; userId?: string; productId?: string; page?: number; pageSize?: number }) =>
               api.get<{ items: AdminReservation[]; total: number; totalPages: number }>('/api/reservations', { params }),
  mine:      ()                                    => api.get<MyReservation[]>('/api/reservations/mine'),
  create:    (body: { productId: string; variantId?: string; quantity?: number; notes?: string; paymentMethod?: string }) =>
               api.post('/api/reservations', body),
  createCart: (items: { productId: string; variantId?: string; quantity: number }[], allowFilaFallback = false, paymentMethod?: string) =>
               api.post<{ groupId: string; items: MyReservation[] }>('/api/reservations/cart', { items, allowFilaFallback, paymentMethod }),
  adminCreate: (body: { userId: string; productId: string; variantId?: string; quantity?: number; notes?: string }) =>
               api.post<AdminReservation>('/api/reservations/admin-create', body),
  gerarPix:  (groupId: string)                     =>
               api.post<{ txId: string; status: string; pixCopiaCola?: string; imagemQrCode?: string; expiraEm?: string; valorEmReais: number }>(
                 `/api/reservations/group/${groupId}/pix`),
  verificarPix: (groupId: string)                  =>
               api.post<{ status: string; pagoEm?: string }>(`/api/reservations/group/${groupId}/pix/verificar`),
  getPix:    (groupId: string)                     => api.get<ReservationPixStatus>(`/api/reservations/group/${groupId}/pix`),
  cancel:    (id: string)                          => api.delete(`/api/reservations/${id}`),
  homologar: (id: string, body: {
    paymentMethod?: string; secondPaymentMethod?: string; secondPaymentAmountInCents?: number
    discountPercent?: number; discountInCents?: number
  }) => api.post<{ message: string; reservationId: string; discountPercent: number; discountInReais: number }>(`/api/reservations/${id}/homologar`, body),
  updateStatus: (id: string, status: string)       => api.put(`/api/reservations/${id}/status`, { status }),
  updateQuantity: (id: string, quantity: number)   => api.put<AdminReservation>(`/api/reservations/${id}/quantity`, { quantity }),
  /** Contagem de pessoas na fila (dashboard admin). Rota legada mantida no backend. */
  filaPendentesCount: () => api.get<{ count: number }>('/api/products/waitlist/pre-venda/pendentes'),
}

// ── Contas a Receber / Pagar ──────────────────────────────────────────────────
export const contasReceberApi = {
  list:      (params?: { type?: string; status?: string; source?: string; search?: string; page?: number }) =>
               api.get('/api/contas-receber', { params }),
  summary:   ()                                    => api.get('/api/contas-receber/summary'),
  create:    (body: { type: string; amount: number; description: string; dueDate?: string; category?: string; supplier?: string; notes?: string }) =>
               api.post('/api/contas-receber', body),
  update:    (id: string, body: Partial<{ description: string; amount: number; dueDate: string; status: string; category: string; supplier: string; notes: string }>) =>
               api.put(`/api/contas-receber/${id}`, body),
  remove:    (id: string)                          => api.delete(`/api/contas-receber/${id}`),
  importOfx: (file: File)                          => {
               const form = new FormData(); form.append('file', file)
               return api.post('/api/contas-receber/import-ofx', form, { headers: { 'Content-Type': 'multipart/form-data' } })
             },
  integracoes:   ()                                => api.get('/api/contas-receber/integracoes'),
  saveIntegracao:(source: string, body: { clientId?: string; clientSecret?: string; cnpj?: string; isActive?: boolean }) =>
                  api.put(`/api/contas-receber/integracoes/${source}`, body),
  sefazStatus:  ()                                 => api.get('/api/contas-receber/sefaz-status'),
}

// ── Fiscal (NFC-e, certificado A1, naturezas de operação) ─────────────────────

export interface FiscalConfigDto {
  cnpj?: string; razaoSocial?: string; inscricaoEstadual?: string
  logradouro?: string; numero?: string; complemento?: string; bairro?: string
  codigoMunicipioIbge?: string; municipio?: string; uf?: string; cep?: string
  cscId?: string; cscConfigurado: boolean
  regimeTributario: string; ambiente: string; modoSimulacao: boolean
  moduloFiscalAtivo: boolean
  serieNfce: number; proximoNumeroNfce: number
  emailContador?: string
  certificadoConfigurado: boolean
  certificadoValidade?: string
  diasParaVencer?: number
  formasPagamentoAutoEmissao: string[]
}

export interface NaturezaOperacaoDto {
  id: string; descricao: string; cfop: string; csosn?: string
  percentualCreditoIcmsSn?: number
  isPadrao: boolean; isActive: boolean
}

export interface NotaFiscalDto {
  id: string; origem: string
  comandaId?: string; vendaAvulsaId?: string
  status: string
  valorTotalEmCentavos: number
  serie?: number; numero?: number
  chaveAcesso?: string; protocolo?: string; motivoRejeicao?: string
  emitidoEm?: string; canceladoEm?: string; inutilizadoEm?: string
  tentativasReprocessamento: number
  createdAt: string
}

export interface CupomItemDto {
  nome: string; quantidade: number; precoUnitarioCentavos: number; subtotalCentavos: number
}

export interface CupomDto {
  razaoSocial: string; cnpj: string; endereco: string
  chaveAcesso?: string; protocolo?: string; emitidoEm?: string
  serie: number; numero: number; status: string
  itens: CupomItemDto[]; valorTotalCentavos: number; formaPagamento: string
  qrCodeUrl?: string
}

export const fiscalApi = {
  getConfig:  ()                                    => api.get<FiscalConfigDto>('/api/fiscal/config'),
  saveConfig: (body: Partial<{
    cnpj: string; razaoSocial: string; inscricaoEstadual: string
    logradouro: string; numero: string; complemento: string; bairro: string
    codigoMunicipioIbge: string; municipio: string; uf: string; cep: string
    cscId: string; cscToken: string
    regimeTributario: string; ambiente: string; modoSimulacao: boolean; moduloFiscalAtivo: boolean; serieNfce: number; emailContador: string
    formasPagamentoAutoEmissao: string[]
  }>) => api.put<FiscalConfigDto>('/api/fiscal/config', body),

  uploadCertificado: (file: File, senha: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('senha', senha)
    return api.post<{ message: string; validade: string; diasRestantes: number }>(
      '/api/fiscal/certificado', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  listNaturezas:  ()                                => api.get<NaturezaOperacaoDto[]>('/api/fiscal/naturezas-operacao'),
  createNatureza: (body: { descricao: string; cfop: string; csosn?: string; percentualCreditoSn?: number; isPadrao: boolean }) =>
                   api.post<NaturezaOperacaoDto>('/api/fiscal/naturezas-operacao', body),
  updateNatureza: (id: string, body: { descricao: string; cfop: string; csosn?: string; percentualCreditoSn?: number; isPadrao: boolean }) =>
                   api.put<NaturezaOperacaoDto>(`/api/fiscal/naturezas-operacao/${id}`, body),
  removeNatureza: (id: string)                      => api.delete(`/api/fiscal/naturezas-operacao/${id}`),

  exportarXmls: (inicio: string, fim: string) =>
    api.get('/api/fiscal/exportar-xmls', { params: { inicio, fim }, responseType: 'blob' }),

  listNotas: (params?: { status?: string; page?: number; pageSize?: number }) =>
    api.get<{ items: NotaFiscalDto[]; total: number; totalPages: number; pendentesCount: number; pendenteMaisAntiga?: string }>('/api/fiscal/notas', { params }),
  reprocessarNota: (id: string) =>
    api.post<{ id: string; status: string; motivoRejeicao?: string }>(`/api/fiscal/notas/${id}/reprocessar`),
  cancelarNota: (id: string, justificativa: string) =>
    api.post<{ id: string; status: string }>(`/api/fiscal/notas/${id}/cancelar`, { justificativa }),
  obterCupom: (id: string) => api.get<CupomDto>(`/api/fiscal/notas/${id}/cupom`),

  emitirNotaComanda: (comandaId: string) =>
    api.post<{ id: string; status: string; motivoRejeicao?: string }>(`/api/fiscal/emitir/comanda/${comandaId}`),
  emitirNotaVendaAvulsa: (vendaId: string) =>
    api.post<{ id: string; status: string; motivoRejeicao?: string }>(`/api/fiscal/emitir/venda-avulsa/${vendaId}`),
}

export interface MinhaNotaDto {
  id: string; status: string; valorTotalEmCentavos: number
  emitidoEm?: string; createdAt: string
}

export const minhasNotasApi = {
  list: () => api.get<MinhaNotaDto[]>('/api/minhas-notas'),
  obterCupom: (id: string) => api.get<CupomDto>(`/api/minhas-notas/${id}/cupom`),
}

// ── Personalização do site (nome, textos, cores da landing) ───────────────────

export interface SiteConfigDto {
  siteName: string
  heroSubtitle: string
  addressLine: string
  contactPersonName: string
  logoUrl?: string | null
  faviconUrl?: string | null
  pwaIconUrl?: string | null
  adminIconUrl?: string | null
  whatsappNumber: string
  contactEmail: string
  navTorneiosLabel: string
  navProdutosLabel: string
  navMercadoLabel: string
  navPontosLabel: string
  navLigaLabel: string
  ctaVerEventosLabel: string
  ctaVerTorneiosLabel: string
  ctaVerProdutosLabel: string
  torneiosEyebrow: string
  torneiosTitle: string
  produtosEyebrow: string
  produtosTitle: string
  pontosEyebrow: string
  pontosTitle: string
  pontosParagraph: string
  colorPrimary: string
  colorAccent: string
  colorNavy: string
  colorBackground: string
  colorCard: string
  borderRadiusStyle: 'Padrao' | 'Suave' | 'MuitoArredondado'
}

export const siteConfigApi = {
  get:  () => api.get<SiteConfigDto>('/api/site-config'),
  save: (body: Partial<SiteConfigDto>) => api.put<SiteConfigDto>('/api/site-config', body),
}

// ── Liga Mensal (ranking agregado dos campeonatos semanais) ───────────────────

export interface LigaMensalRankingDto {
  userId: string
  playerName: string
  totalPoints: number
  eventsPlayed: number
  bestPlacement: number
  decks: string[]
}

export interface LigaMensalDto {
  ano: number
  mes: number
  mesLabel: string
  ranking: LigaMensalRankingDto[]
}

export interface LigaMensalMesDto {
  ano: number
  mes: number
  mesLabel: string
}

export interface LigaMensalManualEntryDto {
  id: string
  ano: number
  mes: number
  playerName: string
  totalPoints: number
  decks?: string | null
  observacao?: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveLigaMensalManualEntry {
  ano: number
  mes: number
  playerName: string
  totalPoints: number
  decks?: string
  observacao?: string
}

export const ligaMensalApi = {
  ranking: (ano?: number, mes?: number) =>
    api.get<LigaMensalDto>('/api/liga-mensal', { params: { ano, mes } }),
  meses: () => api.get<LigaMensalMesDto[]>('/api/liga-mensal/meses'),
  manualList:   (ano: number, mes: number) =>
    api.get<LigaMensalManualEntryDto[]>('/api/liga-mensal/manual', { params: { ano, mes } }),
  manualCreate: (body: SaveLigaMensalManualEntry) =>
    api.post<LigaMensalManualEntryDto>('/api/liga-mensal/manual', body),
  manualUpdate: (id: string, body: SaveLigaMensalManualEntry) =>
    api.put<LigaMensalManualEntryDto>(`/api/liga-mensal/manual/${id}`, body),
  manualDelete: (id: string) => api.delete(`/api/liga-mensal/manual/${id}`),
}

// ── Notificações in-app ───────────────────────────────────────────────────────

export interface AppNotification {
  id: string; title: string; body: string; link?: string; imageUrl?: string
  createdAt: string; readAt?: string; isRead: boolean
}

export const notificationsApi = {
  list:       () => api.get<AppNotification[]>('/api/notifications'),
  unreadCount:() => api.get<{ count: number }>('/api/notifications/unread-count'),
  markRead:   (id: string) => api.patch(`/api/notifications/${id}/read`),
  markAllRead:() => api.patch('/api/notifications/read-all'),
  remove:     (id: string) => api.delete(`/api/notifications/${id}`),
}

// ── Mensageria (admin) ────────────────────────────────────────────────────────

export interface MensageriaClient {
  id: string; name: string; email?: string; whatsApp?: string; pointsBalance: number
}

export interface MensageriaSegment { id: string; label: string }

export const mensageriaApi = {
  clients:  () => api.get<MensageriaClient[]>('/api/admin/mensageria/clients'),
  segments: () => api.get<MensageriaSegment[]>('/api/admin/mensageria/segments'),
  send:     (body: {
    title: string; body: string; link?: string; imageUrl?: string
    channel: 'inapp' | 'email' | 'both'
    segment?: string; userIds?: string[]
  }) => api.post<{ message: string; inApp: number; emails: number; total: number }>('/api/admin/mensageria/send', body),
}

// ── Push notifications (browser) ──────────────────────────────────────────────

export const pushApi = {
  publicKey:   () => api.get<{ publicKey: string }>('/api/push/vapid-public-key'),
  subscribe:   (sub: { endpoint: string; p256dh: string; auth: string }) =>
                 api.post('/api/push/subscribe', sub),
  unsubscribe: (endpoint: string) =>
                 api.delete('/api/push/subscribe', { data: { endpoint } }),
}
