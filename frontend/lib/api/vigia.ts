// lib/api/vigia.ts — Vigia do sistema: alertas dos gatilhos e erros de tela
// Regras no back: CardGameStore/Services/Vigia. Importe sempre de "@/lib/api".
import { api } from './client'

export type GravidadeAlerta = 'info' | 'aviso' | 'critico'

export interface AlertaSistemaDto {
  id: string
  codigo: string
  chave: string
  gravidade: GravidadeAlerta
  titulo: string
  detalhe: string
  link: string | null
  ocorrencias: number
  criadoEm: string
  ultimaVezEm: string
  resolvidoEm: string | null
  /** "sozinho" = o problema sumiu; outro nome = um admin resolveu (fica ciente, não volta). */
  resolvidoPor: string | null
}

export interface ResumoVigiaDto {
  resumo: { abertos: number; criticos: number; avisos: number; ultimaVolta: string | null }
  ligado: boolean
  verificacoes: { codigo: string; nome: string }[]
}

export const vigiaApi = {
  alertas:  (filtro: { status?: 'abertos' | 'resolvidos' | 'todos'; gravidade?: string; codigo?: string; busca?: string }) =>
    api.get<AlertaSistemaDto[]>('/api/admin/vigia/alertas', { params: filtro }),
  resumo:   () => api.get<ResumoVigiaDto>('/api/admin/vigia/resumo'),
  resolver: (id: string) => api.post<AlertaSistemaDto>(`/api/admin/vigia/alertas/${id}/resolver`),
  rodar:    () => api.post<{ novos: number }>('/api/admin/vigia/rodar'),
}
