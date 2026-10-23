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
  /** Pokémon preferido (foto na liguinha); sem ele, a foto sai do deck. */
  pokemon?: string | null; shiny?: boolean
}

export interface JogadorMesa {
  participanteId: string; userId: string; nome: string; deck?: string | null
  /** Pokémon preferido (foto na liguinha); sem ele, a foto sai do deck. */
  pokemon?: string | null; shiny?: boolean
}

export interface MesaDto {
  partidaId: string; mesa: number; a: JogadorMesa; b: JogadorMesa | null
  reportA: ResultadoPartida | null; reportB: ResultadoPartida | null
  resultado: ResultadoPartida | null; divergente: boolean
  /** Mesa além dos lugares da loja: joga quando uma liberar. */
  aguardandoMesa: boolean
  /** Jogador A/B apertou "Estou pronto" (setup montado) — chave liguinha-pronto-na-mesa. */
  prontoA?: boolean
  prontoB?: boolean
}

/** Mesas que contam pro "todas prontas": com oponente, dentro dos lugares da loja e ainda sem resultado. */
export function mesasDeSetup(mesas: MesaDto[]) {
  const jogo = mesas.filter(m => m.b && !m.aguardandoMesa && !m.resultado)
  const prontas = jogo.filter(m => m.prontoA && m.prontoB)
  return { total: jogo.length, prontas: prontas.length, todas: jogo.length > 0 && prontas.length === jogo.length }
}

export interface TimerTorneioDto {
  id: string; state: 'stopped' | 'running' | 'paused' | 'finished'
  durationSeconds: number; pausedRemaining: number | null; startedAt: string | null; rodada: number | null
}

export interface TorneioPublicoDto {
  id: string; nome: string; jogo: string; status: string; formato: string
  melhorDe: number; minutosRodada: number; numeroRodadas: number | null; rodadaAtual: number
  mesas: MesaDto[]; classificacao: LinhaTabela[]; timer: TimerTorneioDto | null
  lugares: number
  /** A rodada atual já está em jogo (marca da rodada no servidor — zerar ou apagar o relógio não desfaz). */
  rodadaComecou?: boolean
  /** Liga ou Campeonato. */
  modalidade?: string
}

export interface ParticipantePainel {
  id: string; userId: string; playerNumber: number; nome: string; deck?: string | null
  checkInEm: string | null; desistiuNaRodada: number | null; pago: boolean
  pokemon?: string | null; shiny?: boolean
}

export interface PainelTorneioDto {
  id: string; nome: string; status: string; formato: string; codigoEntrada: string | null
  melhorDe: number; minutosRodada: number; numeroRodadas: number | null; rodadaAtual: number
  rodadasSugeridas: number
  participantes: ParticipantePainel[]; mesas: MesaDto[]; classificacao: LinhaTabela[]
  timer: TimerTorneioDto | null
  lugares: number
  /** Ver TorneioPublicoDto.rodadaComecou. */
  rodadaComecou?: boolean
  modalidade?: string
}

export interface MinhaMesaDto {
  torneio: TorneioPublicoDto; participanteId: string | null; checkIn: boolean
  desistiuNaRodada: number | null; deck: string | null
  mesa: MesaDto | null; meuReport: ResultadoJogador | null; reportOponente: ResultadoJogador | null
}

/** Etapa jogada fora do sistema (papel, outro app) → campeonato encerrado com colocação. */
export interface EtapaExternaJogador {
  nome: string; deck?: string | null; userId?: string | null
  /** Cadastro novo mesmo se o nome bater com um cliente ("não é esse"). */
  novoCadastro?: boolean
}
export interface EtapaExternaRequest {
  nome: string; data: string; jogo?: string | null; jogadores: EtapaExternaJogador[]
}
export interface EtapaExternaLinha {
  posicao: number; nome: string; deck?: string | null; pontos: number
  userId?: string | null; clienteNome?: string | null
  /** existente = liga ao cliente; novo = cria cliente de balcão; homonimos = vários com o nome (cria novo, a menos que escolha) */
  situacao: 'existente' | 'novo' | 'homonimos'
}
export interface EtapaExternaDto { championshipId?: string | null; linhas: EtapaExternaLinha[] }

export interface TorneioResumoDto {
  id: string; nome: string; status: string; rodadaAtual: number; numeroRodadas: number | null; checkIn: boolean
  /** Liga ou Campeonato (chave campeonato-separado: cada um na sua tela). */
  modalidade?: string
}

export const torneioApi = {
  // Organizador
  painel:      (id: string) => api.get<PainelTorneioDto>(`/api/torneios/${id}/painel`),
  preparar:    (id: string, body: { melhorDe: number; minutosRodada: number; lugares?: number }) =>
    api.post<{ codigoEntrada: string }>(`/api/torneios/${id}/preparar`, body),
  novoCodigo:  (id: string) => api.post<{ codigoEntrada: string }>(`/api/torneios/${id}/codigo`),
  checkIn:     (id: string, participantId: string, presente: boolean) =>
    api.put(`/api/torneios/${id}/participantes/${participantId}/check-in`, { presente }),
  /** Solta os pareamentos (mesas) da próxima rodada. O relógio só corre com comecarRodada. */
  gerarRodada: (id: string, numeroRodadas?: number) =>
    api.post<{ numero: number }>(`/api/torneios/${id}/rodadas`, { numeroRodadas: numeroRodadas ?? null }),
  comecarRodada: (id: string) => api.post(`/api/torneios/${id}/rodadas/atual/comecar`),
  resolver:    (id: string, partidaId: string, resultado: ResultadoPartida) =>
    api.put(`/api/torneios/${id}/partidas/${partidaId}`, { resultado }),
  /** Marca a mesa inteira como pronta (jogador sem celular). */
  mesaPronta:  (id: string, partidaId: string, pronto: boolean) =>
    api.put(`/api/torneios/${id}/partidas/${partidaId}/pronto`, { pronto }),
  desistencia: (id: string, participantId: string) =>
    api.post(`/api/torneios/${id}/participantes/${participantId}/desistencia`),
  encerrar:    (id: string) => api.post<LinhaTabela[]>(`/api/torneios/${id}/encerrar`),
  /** Mesas de uma rodada já jogada (histórico). */
  rodada:      (id: string, numero: number) => api.get<MesaDto[]>(`/api/torneios/${id}/rodadas/${numero}`),
  simularEtapaExterna: (body: EtapaExternaRequest) => api.post<EtapaExternaDto>('/api/torneios/etapa-externa/simular', body),
  lancarEtapaExterna:  (body: EtapaExternaRequest) => api.post<EtapaExternaDto>('/api/torneios/etapa-externa', body),

  // Jogador
  entrar:      (body: { codigo: string; deckId?: string | null; deckNome?: string | null }) =>
    api.post<{ championshipId: string; nome: string; modalidade?: string }>('/api/torneios/entrar', body),
  ativos:      () => api.get<TorneioResumoDto[]>('/api/torneios/ativos'),
  /** "Estou aqui": check-in de quem já está inscrito, sem código. */
  checkInProprio: (id: string) => api.post(`/api/torneios/${id}/check-in`),
  minhaMesa:   (id: string) => api.get<MinhaMesaDto>(`/api/torneios/${id}/minha-mesa`),
  lancar:      (id: string, partidaId: string, resultado: ResultadoJogador) =>
    api.post(`/api/torneios/${id}/partidas/${partidaId}/resultado`, { resultado }),
  desistir:    (id: string) => api.post(`/api/torneios/${id}/desistir`),
  /** Escolhe/troca o próprio deck (livre até a 1ª rodada; depois só quem está sem deck). */
  meuDeck:     (id: string, body: { deckId?: string | null; deckNome?: string | null }) =>
    api.put(`/api/torneios/${id}/meu-deck`, body),
  /** "Estou pronto": setup montado, básicos em campo. */
  pronto:      (id: string, pronto: boolean) => api.post(`/api/torneios/${id}/pronto`, { pronto }),

  // Público (telão)
  publico:     (id: string) => api.get<TorneioPublicoDto>(`/api/torneios/${id}`),
}

/** O relógio da rodada atual já foi disparado? (false = pareamentos soltos, esperando o "Começar rodada") */
export function rodadaComecou(t: TimerTorneioDto | null, rodadaAtual: number, marcadaNoServidor?: boolean): boolean {
  if (rodadaAtual === 0) return false
  // O servidor marca a rodada quando o relógio liga: "Parar alarme" zera o relógio e antes isso
  // voltava a tela do jogador pro "monte o setup", sem os botões de resultado
  if (marcadaNoServidor) return true
  if (!t) return false
  return t.rodada === rodadaAtual && t.state !== 'stopped'
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
