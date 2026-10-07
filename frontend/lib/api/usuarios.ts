// lib/api/usuarios.ts — Usuários, perfil, preferências, histórico do cliente, perfil público
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

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
  /** Widget lateral de timer de torneio — mesma ideia do VLibras, visível em todo o sistema. */
  timer:         { enabled: boolean; corner: PrefCorner }
  notifications: { soundEnabled: boolean; browserEnabled: boolean }
  /** defaultDiscount é % livre (0–100) — os atalhos 5/10/15/20 são só sugestão de tela. */
  pdv:           { defaultDiscount: number }
  dashboard:     { refreshInterval: DashRefreshInterval; chartScheme: DashChartScheme; panels: DashboardPanels }
}

export const DEFAULT_DASHBOARD_PANELS: DashboardPanels = {
  finHoje: true, grafico: true, previsao: true, patrimonio: true,
  clientes: true, produtos: true, lgpd: true, preInscricoes: true, preVenda: true,
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  aiButton:      { mode: 'draggable', corner: 'bottom-right', enabled: true },
  vlibras:       { enabled: true, corner: 'bottom-right' },
  timer:         { enabled: true, corner: 'bottom-right' },
  notifications: { soundEnabled: true, browserEnabled: true },
  pdv:           { defaultDiscount: 0 },
  dashboard:     { refreshInterval: 30, chartScheme: 'default', panels: DEFAULT_DASHBOARD_PANELS },
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
