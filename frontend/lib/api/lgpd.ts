// lib/api/lgpd.ts — Pedidos LGPD (público e admin)
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

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
