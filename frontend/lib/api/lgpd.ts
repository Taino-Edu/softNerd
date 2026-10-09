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
  /** Registra consentimento ou recusa de cookies. */
  recordConsent: (accepted: boolean) =>
    api.post('/api/lgpd/consent', { accepted }),
}

// ── LGPD — Admin ──────────────────────────────────────────────────────────────

export const lgpdAdminApi = {
  /** Lista todas as solicitações LGPD, com filtro opcional por status. */
  listRequests: (status?: string) =>
    api.get<LgpdRequestDto[]>('/api/lgpd/requests', { params: status ? { status } : undefined }),

}
