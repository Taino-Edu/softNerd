// =============================================================================
// lib/pagamentos.ts — Catálogo ÚNICO das formas de pagamento no front
//
// Espelho de CardGameStore/Models/PaymentMethod.cs. Forma nova: uma linha aqui
// e a mesma no back — o teste PaymentMethodTests (backend) lê este arquivo e
// falha se os dois divergirem. As listas de cada tela (PDV, comanda, crediário,
// reservas) são filtros deste catálogo, nunca listas escritas à mão.
// =============================================================================

export type FormaPagamento =
  | 'Pix' | 'Dinheiro' | 'CartaoCredito' | 'CartaoDebito' | 'Crediario' | 'Pontos' | 'Cashback'

export interface FormaPagamentoInfo {
  value: FormaPagamento
  /** Nome completo ("Cartão de crédito"). */
  label: string
  /** Nome curto pra listas e chips ("Crédito"). */
  curto: string
  /** Dinheiro de verdade entrando — só esses geram pontos e quitam crediário. */
  entraNoCaixa: boolean
  /** Exige cliente cadastrado na venda. */
  precisaCliente: boolean
  /** Abate do saldo do cliente (pontos ou cashback). */
  usaSaldoDoCliente: boolean
}

// catalogo-inicio (o teste do backend lê daqui até "catalogo-fim")
export const FORMAS_PAGAMENTO: readonly FormaPagamentoInfo[] = [
  { value: 'Pix',           label: 'Pix',               curto: 'Pix',       entraNoCaixa: true,  precisaCliente: false, usaSaldoDoCliente: false },
  { value: 'Dinheiro',      label: 'Dinheiro',          curto: 'Dinheiro',  entraNoCaixa: true,  precisaCliente: false, usaSaldoDoCliente: false },
  { value: 'CartaoCredito', label: 'Cartão de crédito', curto: 'Crédito',   entraNoCaixa: true,  precisaCliente: false, usaSaldoDoCliente: false },
  { value: 'CartaoDebito',  label: 'Cartão de débito',  curto: 'Débito',    entraNoCaixa: true,  precisaCliente: false, usaSaldoDoCliente: false },
  { value: 'Crediario',     label: 'Crediário',         curto: 'Crediário', entraNoCaixa: false, precisaCliente: true,  usaSaldoDoCliente: false },
  { value: 'Pontos',        label: 'Pontos',            curto: 'Pontos',    entraNoCaixa: false, precisaCliente: true,  usaSaldoDoCliente: true },
  { value: 'Cashback',      label: 'Cashback',          curto: 'Cashback',  entraNoCaixa: false, precisaCliente: true,  usaSaldoDoCliente: true },
]
// catalogo-fim

const POR_CODIGO = new Map(FORMAS_PAGAMENTO.map(f => [f.value as string, f]))

export const infoPagamento = (codigo?: string | null) => (codigo ? POR_CODIGO.get(codigo) : undefined)

/** Nome pra mostrar. Código desconhecido volta como veio (nunca some da tela). */
export const rotuloPagamento = (codigo?: string | null) => infoPagamento(codigo)?.label ?? codigo ?? '—'
export const rotuloCurtoPagamento = (codigo?: string | null) => infoPagamento(codigo)?.curto ?? codigo ?? '—'

export const precisaCliente = (codigo?: string | null) => !!infoPagamento(codigo)?.precisaCliente

/** Monta a lista {value,label} de uma tela, na ordem pedida (ou na do catálogo). */
export function opcoesPagamento(
  filtro: (f: FormaPagamentoInfo) => boolean = () => true,
  ordem?: readonly FormaPagamento[],
) {
  const base = ordem
    ? ordem.map(v => POR_CODIGO.get(v)!).filter(Boolean)
    : [...FORMAS_PAGAMENTO]
  return base.filter(filtro).map(f => ({ value: f.value, label: f.label }))
}
