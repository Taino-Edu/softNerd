// lib/api/crediario.ts — Crediário (admin, cliente e link público /pagar/{token})
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'
import { opcoesPagamento } from '../pagamentos'

// ── Crediário ─────────────────────────────────────────────────────────────────

export interface PagamentoCrediarioDto {
  id: string
  valorEmReais: number
  formaPagamento: string
  observacao: string | null
  createdAt: string
}

export interface ItemCrediarioDto {
  /** Compra a que o item pertence; null = item novo, vai pro bloco de ajuste manual. */
  lancamentoId?: string | null
  itemName: string
  quantity: number
  unitPriceInReais: number
  subtotalInReais: number
}

export interface CrediariosDto {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  comandaId: string | null
  valorEmReais: number
  valorPagoEmReais: number
  saldoRestanteEmReais: number
  dataAbertura: string
  dataVencimento: string
  dataPagamento: string | null
  status: string        // 'Aberto' | 'Pago' | 'Vencido'
  observacao: string | null
  vencido: boolean
  diasRestantes: number
  /** Pago acima do valor da conta (Pix antigo pago depois do acerto) — virou crédito do cliente. */
  valorExcedenteEmReais: number
  pagamentos: PagamentoCrediarioDto[]
  /** Código do link público de pagamento (/pagar/{token}); null em conta quitada. */
  pagamentoToken: string | null
  /** Lembretes de vencimento enviados, mais recente primeiro. */
  avisos: AvisoCrediarioDto[]
  /** Compras que entraram na conta, mais antiga primeiro (inclui estornadas). */
  lancamentos: LancamentoCrediarioDto[]
  /** Itens de todas as compras não estornadas, em lista corrida (impressão/edição). */
  itensComanda: ItemCrediarioDto[]
}

export interface AvisoCrediarioDto {
  enviadoEm: string
  /** Dias em relação ao vencimento; null = enviado à mão. */
  marco: number | null
  automatico: boolean
  canais: string[]
  falhas: string | null
}

export interface CrediarioAvisoConfigDto {
  ativo: boolean
  horaEnvio: number
  /** Dias em relação ao vencimento: negativo = antes, 0 = no dia, positivo = atraso. */
  marcos: number[]
  canalApp: boolean
  canalEmail: boolean
  canalWhatsApp: boolean
  resumoAdmin: boolean
  mensagemExtra: string | null
  /** Somente leitura. */
  whatsAppConectado: boolean
}

export interface PreviaAvisoCrediarioDto {
  titulo: string
  texto: string
  whatsApp: string | null
  email: string | null
  canaisDisponiveis: string[]
}

export type OrigemLancamentoCrediario = 'Comanda' | 'VendaAvulsa' | 'Manual' | 'Ajuste' | 'Legado'

export interface LancamentoCrediarioDto {
  id: string
  origem: OrigemLancamentoCrediario
  comandaId: string | null
  vendaAvulsaId: string | null
  descricao: string | null
  valorEmReais: number
  createdAt: string
  estornadoEm: string | null
  itens: ItemCrediarioDto[]
}

/** Quitar crediário: só dinheiro de verdade. */
export const FORMAS_PAGAMENTO_CREDIARIO = opcoesPagamento(
  f => f.entraNoCaixa,
  ['Dinheiro', 'Pix', 'CartaoCredito', 'CartaoDebito'],
)

export interface CriarCrediarioManualRequest {
  userId: string
  valorEmCentavos: number
  observacao?: string
  dataAbertura?: string   // ISO string, opcional — data real da dívida
  dataVencimento?: string // ISO string, opcional — se null usa dataAbertura + 30 dias
  itens?: ItemCrediarioDto[]
}

export interface CrediariosClienteDto {
  userId: string
  userName: string
  userEmail: string | null
  userWhatsApp: string | null
  saldoTotal: number
  totalDividas: number
  temVencido: boolean
  proximoVencimento: string
  dividas: CrediariosDto[]
}

export interface PixCobrancaDto {
  txId: string
  status: string // 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR' | 'REMOVIDA_PELO_PSP'
  pixCopiaCola: string | null
  imagemQrCode: string | null // data URI base64, pronta pra <img src=...>
  expiraEm: string | null
  valorEmReais: number
}

export const crediarioApi = {
  list:        (status?: string) =>
    api.get<CrediariosDto[]>('/api/crediarios', { params: { status } }),
  byUser:      (userId: string) =>
    api.get<CrediariosDto[]>(`/api/crediarios/usuario/${userId}`),
  registrarPagamento: (id: string, req: { valorEmCentavos: number; formaPagamento: string; secondFormaPagamento?: string; secondValorEmCentavos?: number; observacao?: string }) =>
    api.post<CrediariosDto>(`/api/crediarios/${id}/pagamento`, req),
  criarManual: (req: CriarCrediarioManualRequest) =>
    api.post<CrediariosDto>('/api/crediarios', req),
  editar: (id: string, req: { valorEmCentavos?: number; observacao?: string; dataVencimento?: string; itens?: ItemCrediarioDto[] }) =>
    api.patch<CrediariosDto>(`/api/crediarios/${id}`, req),
  deletar: (id: string) =>
    api.delete(`/api/crediarios/${id}`),
  meuHistorico: () =>
    api.get<CrediariosDto[]>('/api/crediarios/historico'),
  porCliente: () =>
    api.get<CrediariosClienteDto[]>('/api/crediarios/por-cliente'),
  gerarPix: (id: string) =>
    api.post<PixCobrancaDto>(`/api/crediarios/${id}/pix`),
  statusPix: (id: string, txid: string) =>
    api.get<{ txId: string; status: string; pagoEm: string | null }>(`/api/crediarios/${id}/pix/${txid}/status`),
  avisoConfig: () =>
    api.get<CrediarioAvisoConfigDto>('/api/crediarios/avisos/config'),
  salvarAvisoConfig: (cfg: CrediarioAvisoConfigDto) =>
    api.put<CrediarioAvisoConfigDto>('/api/crediarios/avisos/config', cfg),
  previaAviso: (id: string) =>
    api.get<PreviaAvisoCrediarioDto>(`/api/crediarios/${id}/aviso/previa`),
  avisarAgora: (id: string) =>
    api.post<{ canais: string[]; falhas: string | null }>(`/api/crediarios/${id}/aviso`),
}

// ── Link público de pagamento do crediário (/pagar/{token}) — sem login ───────

export interface PagamentoCrediarioResumo {
  loja: string
  primeiroNome: string
  valorEmReais: number
  valorPagoEmReais: number
  saldoRestanteEmReais: number
  dataVencimento: string
  quitado: boolean
  vencido: boolean
  diasDeAtraso: number
  pixDisponivel: boolean
  valorMinimoEmReais: number
  /** Outras contas abertas do mesmo cliente — habilita "pagar todas num Pix só". */
  outrasContas: number
  /** Soma do que falta em todas as contas abertas do cliente (esta inclusa). */
  saldoTodasEmReais: number
  compras: { data: string; valorEmReais: number }[]
}

export interface PagamentoCrediarioPix {
  txId: string
  status: string
  pixCopiaCola: string | null
  imagemQrCode: string | null
  expiraEm: string | null
  valorEmReais: number
}

export const pagarCrediarioApi = {
  resumo: (token: string) =>
    api.get<PagamentoCrediarioResumo>(`/api/pagar/crediario/${token}`),
  /** Sem nada = saldo inteiro desta conta; `valorEmCentavos` = parcial; `tudo` = todas as contas abertas. */
  gerarPix: (token: string, opcoes: { valorEmCentavos?: number; tudo?: boolean } = {}) =>
    api.post<PagamentoCrediarioPix>(`/api/pagar/crediario/${token}/pix`, opcoes),
  statusPix: (token: string, txid: string) =>
    api.get<{ status: string; pagoEm: string | null; quitado: boolean; saldoRestanteEmReais: number; saldoTodasEmReais: number; aviso: string | null }>(
      `/api/pagar/crediario/${token}/pix/${txid}`),
}

// ── Contas a Receber / Pagar ──────────────────────────────────────────────────
export const contasReceberApi = {
  list:      (params?: { type?: string; status?: string; source?: string; search?: string; page?: number }) =>
               api.get('/api/contas-receber', { params }),
  summary:   ()                                    => api.get('/api/contas-receber/summary'),
  create:    (body: { type: string; amount: number; description: string; dueDate?: string; category?: string; supplier?: string; notes?: string }) =>
               api.post('/api/contas-receber', body),
  update:    (id: string, body: Partial<{ description: string; amount: number; dueDate: string; status: string; category: string; supplier: string; notes: string }>) =>
               api.put(`/api/contas-receber/${id}`, body),
  remove:    (id: string)                          => api.delete(`/api/contas-receber/${id}`),
  importOfx: (file: File)                          => {
               const form = new FormData(); form.append('file', file)
               return api.post('/api/contas-receber/import-ofx', form, { headers: { 'Content-Type': 'multipart/form-data' } })
             },
  integracoes:   ()                                => api.get('/api/contas-receber/integracoes'),
  saveIntegracao:(source: string, body: { clientId?: string; clientSecret?: string; cnpj?: string; isActive?: boolean }) =>
                  api.put(`/api/contas-receber/integracoes/${source}`, body),
  sefazStatus:  ()                                 => api.get('/api/contas-receber/sefaz-status'),
}
