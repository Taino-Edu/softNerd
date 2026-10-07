// lib/api/comunicacao.ts — Assistente IA, notificações, push, mensageria, WhatsApp
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

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

// ── WhatsApp — caixa de atendimento do admin ───────────────────────────────

export interface WhatsAppStatus {
  configured: boolean; connected: boolean; state: string; error?: string | null
  // null = o backend nunca recebeu evento do n8n; ver o estado vazio do inbox.
  lastInboundAt?: string | null
}

export interface WhatsAppConversation {
  phone: string; displayName: string; userId?: string | null; pointsBalance: number
  profileImageUrl?: string | null; activeReservations: number
  lastMessage?: string | null; lastMessageAt: string; unreadCount: number
  humanMode: boolean; botPausedUntil?: string | null
  // Marca permanente: o bot nunca responde este contato. A mensagem continua chegando.
  botDisabled: boolean
}

export interface WhatsAppMessage {
  id: string; direction: 'inbound' | 'outbound'; author: string
  text: string; sentAt: string; status: string
}

export const whatsappAdminApi = {
  status: () => api.get<WhatsAppStatus>('/api/admin/whatsapp/status'),
  qrCode: () => api.get<{ success: boolean; base64?: string; pairingCode?: string; error?: string }>('/api/admin/whatsapp/qr-code'),
  conversations: (search = '', unreadOnly = false) =>
    api.get<WhatsAppConversation[]>('/api/admin/whatsapp/conversations', { params: { search, unreadOnly } }),
  messages: (phone: string) =>
    api.get<WhatsAppMessage[]>(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/messages`),
  markRead: (phone: string) =>
    api.post(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/read`),
  setMode: (phone: string, botEnabled: boolean) =>
    api.post(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/mode`, { botEnabled }),
  setBotDisabled: (phone: string, botDisabled: boolean) =>
    api.post(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/bot-disabled`, { botDisabled }),
  send: (phone: string, text: string) =>
    api.post(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/send`, { text }),
}

// ── Push notifications (browser) ──────────────────────────────────────────────

export const pushApi = {
  publicKey:   () => api.get<{ publicKey: string }>('/api/push/vapid-public-key'),
  subscribe:   (sub: { endpoint: string; p256dh: string; auth: string }) =>
                 api.post('/api/push/subscribe', sub),
  unsubscribe: (endpoint: string) =>
                 api.delete('/api/push/subscribe', { data: { endpoint } }),
}
