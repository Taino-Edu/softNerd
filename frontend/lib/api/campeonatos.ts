// lib/api/campeonatos.ts — Campeonatos, timer e liga mensal
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'
import type { PixCobrancaDto } from './crediario'

export interface Championship {
  id: string; name: string; game: string; status: string
  startDate: string; entryFeeInCents: number; entryFeeInReais: number; maxParticipants: number | null
  /** Minutos que a vaga fica segurada esperando o pagamento da inscrição. */
  minutosParaPagar?: number
  description?: string | null; participantCount?: number
  preInscricaoCount?: number; listaEsperaCount?: number
  registrationDeadline?: string | null; endDate?: string | null
  imageUrl?: string | null; podioJson?: string | null
  participants?: ChampionshipParticipant[]
}

export interface ChampionshipPreInscricao {
  id: string; nome: string; whatsApp: string; isListaEspera?: boolean
  numero?: number; createdAt: string; deckId?: string | null; deckName?: string | null
}

export interface TimerDto {
  id: string; name: string; durationSeconds: number; pausedRemaining: number | null
  state: 'stopped' | 'running' | 'paused' | 'finished'
  startedAt: string | null; soundPreset: string; warnAtSeconds: number
  /** Timer de campeonato (liguinha): reinicia sozinho a cada rodada gerada. */
  championshipId?: string | null; rodada?: number | null
}

export interface NovoTimerRequest {
  name: string; durationSeconds: number; soundPreset: string; warnAtSeconds: number
  /** "É de campeonato?" — liga ao campeonato do dia (ou ao escolhido). */
  deCampeonato?: boolean; championshipId?: string | null
}

export interface PodioItem { lugar: number; nome: string }

export interface ChampionshipParticipant {
  id: string; userId: string; userName: string; playerNumber: number
  deckName?: string | null; deckId?: string | null; placement?: number | null; registeredAt: string
  entryFeePaidAt?: string | null; entryFeePaymentMethod?: string | null
  /** Até quando a vaga fica segurada esperando pagamento. Null = vaga firme. */
  inscricaoExpiraEm?: string | null
}

export interface MyParticipation {
  participationId: string; championshipId: string
  championshipName: string; game: string; startDate: string; status: string
  entryFeeInReais: number; playerNumber: number; deckName: string | null
  placement: number | null; registeredAt: string
  entryFeePaidAt?: string | null; entryFeePaymentMethod?: string | null
  /** Prazo pra pagar e não perder a vaga. Null = vaga firme (grátis, paga ou antiga). */
  inscricaoExpiraEm?: string | null
}

export const championshipApi = {
  list:             () => api.get<Championship[]>('/api/championship'),
  update:           (id: string, c: Partial<Championship>) => api.put<Championship>(`/api/championship/${id}`, c),
  myParticipations: () => api.get<MyParticipation[]>('/api/championship/my-participations'),
  listAll:          (search?: string) => api.get<Championship[]>('/api/championship/admin/all', { params: search ? { search } : {} }),
  create:           (c: Partial<Championship>) => api.post<Championship>('/api/championship', c),
  delete:           (id: string) => api.delete(`/api/championship/${id}`),
  /** Inscreve o PRÓPRIO usuário logado (o backend usa o token, não confia em userId do corpo).
   *  Em campeonato pago, o backend já devolve o Pix obrigatório na mesma operação. */
  selfRegister:     (id: string, deckName?: string, deckId?: string) =>
    api.post<{ participant: ChampionshipParticipant; pix: PixCobrancaDto | null }>(
      `/api/championship/${id}/register`, { deckName, deckId }),
  /** Pergunta ao Inter se a taxa caiu e, se caiu, confirma a inscrição na hora.
   *  Mesmo caminho de baixa do robô de conciliação — só que sem esperar o ciclo dele. */
  verificarPixInscricao: (id: string) =>
    api.post<{ status: string; pagoEm?: string | null }>(
      `/api/championship/${id}/my-inscription/pix/verificar`),
  adminRegister:    (id: string, userId: string, deckName?: string, deckId?: string) =>
    api.post<ChampionshipParticipant>(`/api/championship/${id}/admin-register`, { userId, deckName, deckId }),
  participants:     (id: string) =>
    api.get<ChampionshipParticipant[]>(`/api/championship/${id}/participants`),
  removeParticipant:(id: string, participantId: string) =>
    api.delete(`/api/championship/${id}/participants/${participantId}`),
  setStatus:        (id: string, status: string) =>
    api.put(`/api/championship/${id}/status`, { status }),
  setPlacement:     (id: string, participantId: string, placement: number) =>
    api.put(`/api/championship/${id}/participants/${participantId}/placement`, { placement }),
  /** Gera a cobrança da inscrição, mostra na conta do jogador e manda notificação. */
  cobrarInscricao:  (participantId: string) =>
    api.post<PixCobrancaDto & { message: string }>(`/api/championship/participants/${participantId}/cobrar`),
  getPreInscricoes: (id: string) =>
    api.get<ChampionshipPreInscricao[]>(`/api/championship/${id}/preinscricoes`),
  deletePreInscricao: (championshipId: string, preInscricaoId: string) =>
    api.delete(`/api/championship/${championshipId}/preinscricoes/${preInscricaoId}`),
  setPodio:         (id: string, podioJson: string) =>
    api.patch(`/api/championship/${id}/podio`, { podioJson }),
}

// ── Timers ────────────────────────────────────────────────────────────────────

export const timerApi = {
  list:   () => api.get<TimerDto[]>('/api/timers'),
  create: (t: NovoTimerRequest) => api.post<TimerDto>('/api/timers', t),
  update: (id: string, req: { action: string; name?: string; durationSeconds?: number; soundPreset?: string; warnAtSeconds?: number; fromRemaining?: number }) =>
    api.put<TimerDto>(`/api/timers/${id}`, req),
  remove: (id: string) => api.delete(`/api/timers/${id}`),
}

// ── Liga Mensal (ranking agregado dos campeonatos semanais) ───────────────────

export interface LigaMensalRankingDto {
  userId: string
  playerName: string
  totalPoints: number
  eventsPlayed: number
  bestPlacement: number
  decks: string[]
}

export interface LigaMensalDto {
  ano: number
  mes: number
  mesLabel: string
  ranking: LigaMensalRankingDto[]
}

export interface LigaMensalMesDto {
  ano: number
  mes: number
  mesLabel: string
}

export interface LigaMensalManualEntryDto {
  id: string
  ano: number
  mes: number
  playerName: string
  totalPoints: number
  decks?: string | null
  observacao?: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveLigaMensalManualEntry {
  ano: number
  mes: number
  playerName: string
  totalPoints: number
  decks?: string
  observacao?: string
}

export const ligaMensalApi = {
  ranking: (ano?: number, mes?: number) =>
    api.get<LigaMensalDto>('/api/liga-mensal', { params: { ano, mes } }),
  meses: () => api.get<LigaMensalMesDto[]>('/api/liga-mensal/meses'),
  manualList:   (ano: number, mes: number) =>
    api.get<LigaMensalManualEntryDto[]>('/api/liga-mensal/manual', { params: { ano, mes } }),
  manualCreate: (body: SaveLigaMensalManualEntry) =>
    api.post<LigaMensalManualEntryDto>('/api/liga-mensal/manual', body),
  manualUpdate: (id: string, body: SaveLigaMensalManualEntry) =>
    api.put<LigaMensalManualEntryDto>(`/api/liga-mensal/manual/${id}`, body),
  manualDelete: (id: string) => api.delete(`/api/liga-mensal/manual/${id}`),
}
