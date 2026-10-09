// lib/api/relatorios.ts — Analytics, financeiro e relatórios
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'
import type { ExtratoDto } from './vendas'

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
  /** Extrato do período: cada entrada de dinheiro com origem, incluindo as estornadas. */
  extrato: (inicio?: string, fim?: string) =>
    api.get<ExtratoDto>('/api/analytics/extrato', { params: { inicio: inicio || undefined, fim: fim || undefined } }),
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
