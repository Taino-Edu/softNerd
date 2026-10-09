// lib/api/fiscal.ts — NFC-e, certificado, naturezas de operação, notas do cliente
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

// ── Fiscal (NFC-e, certificado A1, naturezas de operação) ─────────────────────

export interface FiscalConfigDto {
  cnpj?: string; razaoSocial?: string; inscricaoEstadual?: string
  logradouro?: string; numero?: string; complemento?: string; bairro?: string
  codigoMunicipioIbge?: string; municipio?: string; uf?: string; cep?: string
  cscId?: string; cscConfigurado: boolean
  regimeTributario: string; ambiente: string; modoSimulacao: boolean
  moduloFiscalAtivo: boolean
  serieNfce: number; proximoNumeroNfce: number
  emailContador?: string
  certificadoConfigurado: boolean
  certificadoValidade?: string
  diasParaVencer?: number
  formasPagamentoAutoEmissao: string[]
}

export interface NaturezaOperacaoDto {
  id: string; descricao: string; cfop: string; csosn?: string
  percentualCreditoIcmsSn?: number
  isPadrao: boolean; isActive: boolean
}

export interface NotaFiscalDto {
  id: string; origem: string
  comandaId?: string; vendaAvulsaId?: string
  status: string
  valorTotalEmCentavos: number
  serie?: number; numero?: number
  chaveAcesso?: string; protocolo?: string; motivoRejeicao?: string
  emitidoEm?: string; canceladoEm?: string; inutilizadoEm?: string
  tentativasReprocessamento: number
  createdAt: string
}

export interface CupomItemDto {
  nome: string; quantidade: number; precoUnitarioCentavos: number; subtotalCentavos: number
}

export interface CupomDto {
  razaoSocial: string; cnpj: string; endereco: string
  chaveAcesso?: string; protocolo?: string; emitidoEm?: string
  serie: number; numero: number; status: string
  itens: CupomItemDto[]; valorTotalCentavos: number; formaPagamento: string
  qrCodeUrl?: string
}

export const fiscalApi = {
  getConfig:  ()                                    => api.get<FiscalConfigDto>('/api/fiscal/config'),
  saveConfig: (body: Partial<{
    cnpj: string; razaoSocial: string; inscricaoEstadual: string
    logradouro: string; numero: string; complemento: string; bairro: string
    codigoMunicipioIbge: string; municipio: string; uf: string; cep: string
    cscId: string; cscToken: string
    regimeTributario: string; ambiente: string; modoSimulacao: boolean; moduloFiscalAtivo: boolean; serieNfce: number; emailContador: string
    formasPagamentoAutoEmissao: string[]
  }>) => api.put<FiscalConfigDto>('/api/fiscal/config', body),

  uploadCertificado: (file: File, senha: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('senha', senha)
    return api.post<{ message: string; validade: string; diasRestantes: number }>(
      '/api/fiscal/certificado', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  listNaturezas:  ()                                => api.get<NaturezaOperacaoDto[]>('/api/fiscal/naturezas-operacao'),
  createNatureza: (body: { descricao: string; cfop: string; csosn?: string; percentualCreditoSn?: number; isPadrao: boolean }) =>
                   api.post<NaturezaOperacaoDto>('/api/fiscal/naturezas-operacao', body),
  removeNatureza: (id: string)                      => api.delete(`/api/fiscal/naturezas-operacao/${id}`),

  exportarXmls: (inicio: string, fim: string) =>
    api.get('/api/fiscal/exportar-xmls', { params: { inicio, fim }, responseType: 'blob' }),

  listNotas: (params?: { status?: string; page?: number; pageSize?: number }) =>
    api.get<{ items: NotaFiscalDto[]; total: number; totalPages: number; pendentesCount: number; pendenteMaisAntiga?: string }>('/api/fiscal/notas', { params }),
  reprocessarNota: (id: string) =>
    api.post<{ id: string; status: string; motivoRejeicao?: string }>(`/api/fiscal/notas/${id}/reprocessar`),
  cancelarNota: (id: string, justificativa: string) =>
    api.post<{ id: string; status: string }>(`/api/fiscal/notas/${id}/cancelar`, { justificativa }),
  obterCupom: (id: string) => api.get<CupomDto>(`/api/fiscal/notas/${id}/cupom`),

  emitirNotaComanda: (comandaId: string) =>
    api.post<{ id: string; status: string; motivoRejeicao?: string }>(`/api/fiscal/emitir/comanda/${comandaId}`),
  emitirNotaVendaAvulsa: (vendaId: string) =>
    api.post<{ id: string; status: string; motivoRejeicao?: string }>(`/api/fiscal/emitir/venda-avulsa/${vendaId}`),
}

export interface MinhaNotaDto {
  id: string; status: string; valorTotalEmCentavos: number
  emitidoEm?: string; createdAt: string
}

export const minhasNotasApi = {
  list: () => api.get<MinhaNotaDto[]>('/api/minhas-notas'),
  obterCupom: (id: string) => api.get<CupomDto>(`/api/minhas-notas/${id}/cupom`),
}
