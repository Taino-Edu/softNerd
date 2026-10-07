// lib/api/comandas.ts — Comandas e as listas de formas de pagamento do PDV/comanda
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'
import { FORMAS_PAGAMENTO, opcoesPagamento } from '../pagamentos'
import type { PixCobrancaDto } from './crediario'

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
  /** Preenchidos quando a comanda fechada foi estornada (status = "Estornada"). */
  estornadaEm?: string | null
  motivoEstorno?: string | null
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

// Formas de pagamento: catálogo único em lib/pagamentos.ts — as listas abaixo são
// só recortes dele por tela (mantidas com os nomes antigos pra não mexer nos imports).

/** PDV: todas, Pix primeiro. */
export const PAYMENT_METHODS = opcoesPagamento()

/** Formas que exigem cliente cadastrado selecionado. */
export const PAYMENT_NEEDS_USER: readonly string[] = FORMAS_PAGAMENTO.filter(f => f.precisaCliente).map(f => f.value)

/** Segundo pagamento da comanda: tudo menos crediário. */
export const SECOND_PAYMENT_METHODS = opcoesPagamento(
  f => f.value !== 'Crediario',
  ['Cashback', 'Pontos', 'Dinheiro', 'Pix', 'CartaoCredito', 'CartaoDebito'],
)

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
  /** crediarioVencimento (YYYY-MM-DD) só vale pra conta NOVA — acumular não mexe no prazo da conta existente. */
  close:        (id: string, paymentMethod = 'Dinheiro', observacao?: string, secondPaymentMethod?: string, secondPaymentAmountInCents = 0, crediarioExistenteId?: string, discountInCents = 0, emitirNotaFiscal = false, crediarioVencimento?: string) =>
    api.put<ComandaDto>(`/api/comanda/${id}/close`, { paymentMethod, observacao, secondPaymentMethod, secondPaymentAmountInCents, crediarioExistenteId, discountInCents, emitirNotaFiscal, crediarioVencimento }),
  cancel:       (id: string) => api.put<ComandaDto>(`/api/comanda/${id}/cancel`),
  /** Comanda JÁ FECHADA cobrada errada: devolve estoque e pontos, baixa crediário e sai do faturamento. */
  estornar:     (id: string, motivo: string) => api.post<ComandaDto>(`/api/comanda/${id}/estornar`, { motivo }),
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

/** Fechamento de comanda: todas, dinheiro primeiro. */
export const COMANDA_PAYMENT_METHODS = opcoesPagamento(
  undefined,
  ['Dinheiro', 'Pix', 'CartaoCredito', 'CartaoDebito', 'Crediario', 'Pontos', 'Cashback'],
)
