'use client'

// =============================================================================
// TimerContext — estado dos timers de torneio pro sistema inteiro
//
// Antes o timer só existia em duas telas (a página /admin/timer e o overlay de
// alarme do painel), cada uma com o seu polling e o seu som. Sair da página
// perdia o timer de vista e, com as duas montadas, o alarme tocava dobrado.
//
// Aqui o polling e o áudio moram num lugar só: o widget lateral e a página de
// timers consomem este contexto, então o timer acompanha o operador em qualquer
// tela e o alarme toca uma vez.
// =============================================================================

import {
  createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode,
} from 'react'
import { timerApi, TimerDto } from '@/lib/api'
import { isLoggedIn, getRole } from '@/lib/auth'

// ── Áudio ─────────────────────────────────────────────────────────────────────
const freqMap: Record<string, Record<string, number>> = {
  beep:   { warn: 880,  end: 1100 },
  bell:   { warn: 660,  end: 880  },
  buzzer: { warn: 220,  end: 180  },
}

/** Toca uma vez e devolve em quantos ms dá pra tocar de novo. */
function tocarUmaVez(preset: string, tipo: 'warn' | 'end'): number {
  if (preset === 'none') return 0
  try {
    const freq = freqMap[preset]?.[tipo] ?? 660
    const dur  = tipo === 'end' ? 1.2 : 0.4
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)

    if (tipo === 'end') {
      setTimeout(() => {
        try {
          const c2 = new AudioContext(); const o2 = c2.createOscillator(); const g2 = c2.createGain()
          o2.connect(g2); g2.connect(c2.destination)
          o2.frequency.value = freq * 1.25
          g2.gain.setValueAtTime(0.4, c2.currentTime)
          g2.gain.exponentialRampToValueAtTime(0.001, c2.currentTime + 0.8)
          o2.start(); o2.stop(c2.currentTime + 0.8)
        } catch {}
      }, 400)
      return 1800
    }
    return (dur * 1000) + 200
  } catch { return 0 }
}

export function tocarPreview(preset: string, tipo: 'warn' | 'end' = 'warn') {
  tocarUmaVez(preset, tipo)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function calcRestante(t: TimerDto): number {
  if (t.state === 'paused')   return t.pausedRemaining ?? t.durationSeconds
  if (t.state === 'finished') return 0
  if (t.state === 'running' && t.startedAt) {
    const passado = (Date.now() - new Date(t.startedAt).getTime()) / 1000
    return Math.max(0, t.durationSeconds - passado)
  }
  return t.durationSeconds
}

export function fmtTempo(sec: number) {
  const s = Math.max(0, Math.ceil(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Só quem opera a loja enxerga os timers — cliente não tem esse endpoint. */
export function podeUsarTimers(): boolean {
  if (!isLoggedIn()) return false
  const role = getRole()
  return role === 'Admin' || role === 'Operator'
}

// ── Contexto ──────────────────────────────────────────────────────────────────
interface TimerContextValue {
  timers:      TimerDto[]
  /** Segundos restantes por timer, atualizado de segundo em segundo. */
  restantes:   Record<string, number>
  loading:     boolean
  disponivel:  boolean
  /** Ids tocando alarme agora. */
  alarmando:   Set<string>
  recarregar:  () => Promise<void>
  acao:        (id: string, action: string, extra?: Record<string, unknown>) => Promise<void>
  criar:       (t: { name: string; durationSeconds: number; soundPreset: string; warnAtSeconds: number }) => Promise<void>
  remover:     (id: string) => Promise<void>
  silenciar:   (id: string) => void
}

const TimerContext = createContext<TimerContextValue | null>(null)

const POLL_MS = 5000

export function TimerProvider({ children }: { children: ReactNode }) {
  const [timers,     setTimers]     = useState<TimerDto[]>([])
  const [restantes,  setRestantes]  = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)
  const [disponivel, setDisponivel] = useState(false)
  const [alarmando,  setAlarmando]  = useState<Set<string>>(new Set())

  const timersRef    = useRef<TimerDto[]>([])
  const pararRef     = useRef<Map<string, () => void>>(new Map())
  const avisadosRef  = useRef<Set<string>>(new Set())
  /** Ids cujo "acabou" já foi comunicado ao servidor — sem isso o tique de 1s
   *  reenviaria o finish a cada segundo até o poll trazer o estado novo. */
  const finalizadosRef = useRef<Set<string>>(new Set())
  timersRef.current  = timers

  // ── Alarme ──────────────────────────────────────────────────────────────────
  const pararAlarme = useCallback((id: string) => {
    pararRef.current.get(id)?.()
    pararRef.current.delete(id)
    setAlarmando(prev => {
      if (!prev.has(id)) return prev
      const n = new Set(prev); n.delete(id); return n
    })
  }, [])

  const iniciarAlarme = useCallback((id: string, preset: string) => {
    if (pararRef.current.has(id)) return
    let parado = false
    const loop = () => {
      if (parado) return
      const espera = tocarUmaVez(preset, 'end')
      setTimeout(() => { if (!parado) loop() }, espera + 300)
    }
    loop()
    pararRef.current.set(id, () => { parado = true })
    setAlarmando(prev => new Set(prev).add(id))
  }, [])

  // ── Polling ─────────────────────────────────────────────────────────────────
  const recarregar = useCallback(async () => {
    if (!podeUsarTimers()) {
      setDisponivel(false)
      setLoading(false)
      return
    }
    try {
      const { data } = await timerApi.list()
      setTimers(data)
      setDisponivel(true)
    } catch {
      // 401/403 = sem sessão ou sem permissão: esconde o widget em vez de estourar erro.
      setDisponivel(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
    const id = setInterval(recarregar, POLL_MS)
    return () => clearInterval(id)
  }, [recarregar])

  // ── Tique de 1s: contagem regressiva, aviso e disparo do alarme ─────────────
  useEffect(() => {
    const tick = () => {
      const atuais = timersRef.current
      const mapa: Record<string, number> = {}

      atuais.forEach(t => {
        const r = calcRestante(t)
        mapa[t.id] = r

        const rodando = t.state === 'running'

        if (rodando && r <= t.warnAtSeconds && r > 0 && !avisadosRef.current.has(t.id)) {
          avisadosRef.current.add(t.id)
          tocarUmaVez(t.soundPreset, 'warn')
        }
        if (r > t.warnAtSeconds) avisadosRef.current.delete(t.id)

        const acabou = t.state === 'finished' || (rodando && r <= 0)
        if (acabou) {
          iniciarAlarme(t.id, t.soundPreset)
          // Avisa o servidor uma única vez — a marca só sai quando o timer voltar a andar.
          if (rodando && !finalizadosRef.current.has(t.id)) {
            finalizadosRef.current.add(t.id)
            timerApi.update(t.id, { action: 'finish' })
              .then(res => setTimers(prev => prev.map(x => x.id === t.id ? res.data as TimerDto : x)))
              .catch(() => { finalizadosRef.current.delete(t.id) })
          }
        } else {
          finalizadosRef.current.delete(t.id)
          if (pararRef.current.has(t.id)) pararAlarme(t.id)
        }
      })

      // Timer apagado por outro dispositivo não pode deixar som tocando.
      pararRef.current.forEach((_, id) => {
        if (!atuais.some(t => t.id === id)) pararAlarme(id)
      })
      finalizadosRef.current.forEach(id => {
        if (!atuais.some(t => t.id === id)) finalizadosRef.current.delete(id)
      })

      setRestantes(mapa)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [iniciarAlarme, pararAlarme])

  // Desmontou (logout, troca de app): não deixa alarme órfão tocando.
  useEffect(() => {
    const paradas = pararRef.current
    return () => { paradas.forEach(fn => fn()) }
  }, [])

  // ── Ações ───────────────────────────────────────────────────────────────────
  const acao = useCallback(async (id: string, action: string, extra?: Record<string, unknown>) => {
    pararAlarme(id)
    avisadosRef.current.delete(id)
    finalizadosRef.current.delete(id)
    const alvo = timersRef.current.find(t => t.id === id)
    const fromRemaining = action === 'start' && alvo ? Math.round(calcRestante(alvo)) : undefined
    const { data } = await timerApi.update(id, { action, fromRemaining, ...extra })
    setTimers(prev => prev.map(t => t.id === id ? data as TimerDto : t))
  }, [pararAlarme])

  const criar = useCallback(async (t: { name: string; durationSeconds: number; soundPreset: string; warnAtSeconds: number }) => {
    const { data } = await timerApi.create(t)
    setTimers(prev => [...prev, data as TimerDto])
  }, [])

  const remover = useCallback(async (id: string) => {
    pararAlarme(id)
    await timerApi.remove(id)
    setTimers(prev => prev.filter(t => t.id !== id))
  }, [pararAlarme])

  return (
    <TimerContext.Provider value={{
      timers, restantes, loading, disponivel, alarmando,
      recarregar, acao, criar, remover, silenciar: pararAlarme,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimers(): TimerContextValue {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers precisa estar dentro de TimerProvider')
  return ctx
}
