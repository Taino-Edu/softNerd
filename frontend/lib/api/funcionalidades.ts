// lib/api/funcionalidades.ts — chaves de funcionalidade ("mudança com volta")
// Catálogo e regras no back: CardGameStore/Configuration/Funcionalidades.cs
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

export interface FuncionalidadeDto {
  codigo: string
  nome: string
  oQueMuda: string
  seDesligar: string
  padrao: boolean
  desde: string
  /** yyyy-MM-dd */
  revisarEm: string
  ligada: boolean
  alteradaEm: string | null
  alteradaPor: string | null
}

export const funcionalidadesApi = {
  /** { codigo: ligada } — público, é o que o hook useFuncionalidade lê. */
  estado:  () => api.get<Record<string, boolean>>('/api/funcionalidades'),
  /** Catálogo completo com quem mudou — só o dono. */
  painel:  () => api.get<FuncionalidadeDto[]>('/api/funcionalidades/painel'),
  definir: (codigo: string, ligada: boolean) =>
    api.put<FuncionalidadeDto>(`/api/funcionalidades/${encodeURIComponent(codigo)}`, { ligada }),
}
