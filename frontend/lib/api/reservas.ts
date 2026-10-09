// lib/api/reservas.ts — Reservas (pré-venda)
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

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

export interface HomologarResult {
  message: string
  /** Primeiro item homologado — mantido por compatibilidade. */
  reservationId: string
  /** Todos os itens que saíram como retirados nesta homologação. */
  reservationIds: string[]
  itemCount: number
  discountPercent: number
  discountInReais: number
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
  /** Registra pré-venda/fila em nome do cliente. Vários itens viram UM pedido (mesmo grupo). */
  adminCreate: (body: { userId: string; items: { productId: string; variantId?: string; quantity: number }[]; notes?: string }) =>
               api.post<{ groupId: string; items: AdminReservation[] }>('/api/reservations/admin-create', body),
  gerarPix:  (groupId: string)                     =>
               api.post<{ txId: string; status: string; pixCopiaCola?: string; imagemQrCode?: string; expiraEm?: string; valorEmReais: number }>(
                 `/api/reservations/group/${groupId}/pix`),
  verificarPix: (groupId: string)                  =>
               api.post<{ status: string; pagoEm?: string }>(`/api/reservations/group/${groupId}/pix/verificar`),
  getPix:    (groupId: string)                     => api.get<ReservationPixStatus>(`/api/reservations/group/${groupId}/pix`),
  /** Encerra a cobrança aberta (some com o QR no Inter também) — libera a edição de quantidade. */
  cancelarPix: (groupId: string)                   => api.delete<{ message: string }>(`/api/reservations/group/${groupId}/pix`),
  cancel:    (id: string)                          => api.delete(`/api/reservations/${id}`),
  /** Homologa o carrinho INTEIRO de uma vez (uma venda com todos os itens do grupo).
   *  Reserva avulsa tem groupId = o próprio id, então serve pros dois casos. */
  homologarGrupo: (groupId: string, body: {
    paymentMethod?: string; secondPaymentMethod?: string; secondPaymentAmountInCents?: number
    discountPercent?: number; discountInCents?: number
  }) => api.post<HomologarResult>(`/api/reservations/group/${groupId}/homologar`, body),
  updateStatus: (id: string, status: string)       => api.put(`/api/reservations/${id}/status`, { status }),
  updateQuantity: (id: string, quantity: number)   => api.put<AdminReservation>(`/api/reservations/${id}/quantity`, { quantity }),
  /** Contagem de pessoas na fila (dashboard admin). Rota legada mantida no backend. */
  filaPendentesCount: () => api.get<{ count: number }>('/api/products/waitlist/pre-venda/pendentes'),
}
