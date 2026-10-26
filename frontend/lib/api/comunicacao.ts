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

// ── Push notifications (browser) ──────────────────────────────────────────────

export const pushApi = {
  publicKey:   () => api.get<{ publicKey: string }>('/api/push/vapid-public-key'),
  subscribe:   (sub: { endpoint: string; p256dh: string; auth: string }) =>
                 api.post('/api/push/subscribe', sub),
  unsubscribe: (endpoint: string) =>
                 api.delete('/api/push/subscribe', { data: { endpoint } }),
}
