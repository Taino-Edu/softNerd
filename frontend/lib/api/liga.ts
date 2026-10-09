// lib/api/liga.ts — Liguinha: torneio suíço em cima do campeonato (docs/liguinha.md)
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

/** Do ponto de vista do jogador A da mesa. */
export type ResultadoPartida = 'VitoriaA' | 'VitoriaB' | 'Empate'
/** Do ponto de vista de quem está lançando. */
export type ResultadoJogador = 'Venci' | 'Perdi' | 'Empatei'

export interface LinhaTabela {
  posicao: number; participanteId: string; userId: string; nome: string; deck?: string | null
  pontos: number; vitorias: number; empates: number; derrotas: number
  owp: number; oowp: number; desistiuNaRodada?: number | null
}

export interface JogadorMesa { participanteId: string; userId: string; nome: string; deck?: string | null }

export interface MesaDto {
  partidaId: string; mesa: number; a: JogadorMesa; b: JogadorMesa | null
  reportA: ResultadoPartida | null; reportB: ResultadoPartida | null
  resultado: ResultadoPartida | null; divergente: boolean
}

export interface TimerTorneioDto {
  id: string; state: 'stopped' | 'running' | 'paused' | 'finished'
  durationSeconds: number; pausedRemaining: number | null; startedAt: string | null; rodada: number | null
}

export interface TorneioPublicoDto {
  id: string; nome: string; jogo: string; status: string; formato: string
  melhorDe: number; minutosRodada: number; numeroRodadas: number | null; rodadaAtual: number
  mesas: MesaDto[]; classificacao: LinhaTabela[]; timer: TimerTorneioDto | null
}

export interface ParticipantePainel {
  id: string; userId: string; playerNumber: number; nome: string; deck?: string | null
  checkInEm: string | null; desistiuNaRodada: number | null; pago: boolean
}

export interface PainelTorneioDto {
  id: string; nome: string; status: string; formato: string; codigoEntrada: string | null
  melhorDe: number; minutosRodada: number; numeroRodadas: number | null; rodadaAtual: number
  rodadasSugeridas: number
  participantes: ParticipantePainel[]; mesas: MesaDto[]; classificacao: LinhaTabela[]
  timer: TimerTorneioDto | null
}

export interface MinhaMesaDto {
  torneio: TorneioPublicoDto; participanteId: string | null; checkIn: boolean
  desistiuNaRodada: number | null; deck: string | null
  mesa: MesaDto | null; meuReport: ResultadoJogador | null; reportOponente: ResultadoJogador | null
}

export interface TorneioResumoDto {
  id: string; nome: string; status: string; rodadaAtual: number; numeroRodadas: number | null; checkIn: boolean
}

export const torneioApi = {
  // Organizador
  painel:      (id: string) => api.get<PainelTorneioDto>(`/api/torneios/${id}/painel`),
  preparar:    (id: string, body: { melhorDe: number; minutosRodada: number }) =>
    api.post<{ codigoEntrada: string }>(`/api/torneios/${id}/preparar`, body),
  novoCodigo:  (id: string) => api.post<{ codigoEntrada: string }>(`/api/torneios/${id}/codigo`),
  checkIn:     (id: string, participantId: string, presente: boolean) =>
    api.put(`/api/torneios/${id}/participantes/${participantId}/check-in`, { presente }),
  gerarRodada: (id: string, numeroRodadas?: number) =>
    api.post<{ numero: number }>(`/api/torneios/${id}/rodadas`, { numeroRodadas: numeroRodadas ?? null }),
  resolver:    (id: string, partidaId: string, resultado: ResultadoPartida) =>
    api.put(`/api/torneios/${id}/partidas/${partidaId}`, { resultado }),
  desistencia: (id: string, participantId: string) =>
    api.post(`/api/torneios/${id}/participantes/${participantId}/desistencia`),
  encerrar:    (id: string) => api.post<LinhaTabela[]>(`/api/torneios/${id}/encerrar`),

  // Jogador
  entrar:      (body: { codigo: string; deckId?: string | null; deckNome?: string | null }) =>
    api.post<{ championshipId: string; nome: string }>('/api/torneios/entrar', body),
  ativos:      () => api.get<TorneioResumoDto[]>('/api/torneios/ativos'),
  minhaMesa:   (id: string) => api.get<MinhaMesaDto>(`/api/torneios/${id}/minha-mesa`),
  lancar:      (id: string, partidaId: string, resultado: ResultadoJogador) =>
    api.post(`/api/torneios/${id}/partidas/${partidaId}/resultado`, { resultado }),
  desistir:    (id: string) => api.post(`/api/torneios/${id}/desistir`),

  // Público (telão)
  publico:     (id: string) => api.get<TorneioPublicoDto>(`/api/torneios/${id}`),
}

/** Segundos que faltam no timer da rodada (mesma conta do servidor). */
export function segundosRestantes(t: TimerTorneioDto | null, agora = Date.now()): number | null {
  if (!t) return null
  if (t.state === 'paused') return t.pausedRemaining ?? t.durationSeconds
  if (t.state === 'finished') return 0
  if (t.state === 'running' && t.startedAt) {
    const passou = Math.floor((agora - new Date(t.startedAt).getTime()) / 1000)
    return Math.max(0, t.durationSeconds - passou)
  }
  return t.durationSeconds
}
