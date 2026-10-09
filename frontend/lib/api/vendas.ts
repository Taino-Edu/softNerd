// lib/api/vendas.ts — Vendas avulsas (PDV), extrato e compras do cliente
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

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
  /** Crediário que esta venda gerou, quando o pagamento foi no crediário. */
  crediarioId?: string | null
  /** Estorno: a venda continua existindo, mas não conta mais no faturamento. */
  cancelada?: boolean
  canceladaEm?: string | null
  canceladaPorAdminNome?: string | null
  motivoCancelamento?: string | null
}

/** Uma linha do extrato do Financeiro — de onde veio cada real do período. */
export interface ExtratoLinhaDto {
  id: string
  tipo: 'venda_balcao' | 'comanda' | 'site' | 'pre_venda' | 'pagamento_crediario'
  data: string
  descricao: string
  cliente: string | null
  formaPagamento: string | null
  valorEmReais: number
  lancadoPor?: string | null
  estornada: boolean
  motivoEstorno?: string | null
  estornadaEm?: string | null
}

export interface ExtratoDto {
  inicio: string
  fim: string
  /** Tudo que entrou de caixa (vendas + recebimento de dívida), sem os estornos. */
  totalEmReais: number
  /** Só as vendas — é este que bate com a Receita do topo do Financeiro. */
  totalVendas: number
  /** Recebimento de crediário: entra no caixa, mas não é receita nova. */
  totalCrediario: number
  totalEstornado: number
  lancamentos: number
  linhas: ExtratoLinhaDto[]
}

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
    /** Conta de crediário onde lançar, quando o cliente já tem mais de uma aberta. */
    crediarioExistenteId?: string,
    /** Força abrir conta nova de crediário mesmo já existindo outra aberta. */
    abrirNovoCrediario?: boolean,
    /** Vencimento da conta nova (YYYY-MM-DD). Sem isso, 30 dias. */
    crediarioVencimento?: string,
  ) =>
    api.post<VendaAvulsaDto>('/api/venda-avulsa', {
      clientName, paymentMethod, items, discountPercent, discountInCents, userId,
      crediarioExistenteId, abrirNovoCrediario, crediarioVencimento,
      secondPaymentMethod: secondPaymentMethod || null,
      secondPaymentAmountInCents,
      emitirNotaFiscal,
    }),
  byDate: (date: string) =>
    api.get<VendaAvulsaDto[]>('/api/venda-avulsa/by-date', { params: { date } }),
  backfillCosts: () =>
    api.post<{ itensAtualizados: number; mensagem: string }>('/api/venda-avulsa/backfill-costs'),
  editarPagamento: (id: string, request: EditarPagamentoVendaAvulsaRequest) =>
    api.patch<VendaAvulsaDto>(`/api/venda-avulsa/${id}/pagamento`, request),
  /** Desfaz a venda: estoque volta, pontos/cashback voltam, crediário baixa e sai do faturamento. */
  estornar: (id: string, motivo: string) =>
    api.post<VendaAvulsaDto>(`/api/venda-avulsa/${id}/estornar`, { motivo }),
}

// ── Compras de balcão (PDV) do próprio cliente ────────────────────────────────
// Recorte enxuto da venda avulsa: sem custo do produto, sem quem operou o caixa.
// As comandas do cliente continuam vindo de comandaApi.myHistory().

export interface MinhaCompraItemDto {
  productName: string; quantity: number
  unitPriceInReais: number; subtotalInReais: number
}

export interface MinhaCompraDto {
  id: string; soldAt: string
  paymentMethod: string
  secondPaymentMethod: string | null
  secondPaymentAmountInCents: number
  totalInReais: number
  discountInReais: number
  items: MinhaCompraItemDto[]
  /** "Balcao" | "Site" | "PreVenda" — mesma divisão que o Financeiro usa. */
  origem: string
  /** Compra desfeita pela loja — vem na lista marcada, não some. */
  estornada: boolean
  estornadaEm: string | null
  motivoEstorno: string | null
}

export const minhasComprasApi = {
  list: () => api.get<MinhaCompraDto[]>('/api/minhas-compras'),
}
