'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { timerApi, TimerDto } from '@/lib/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Plus, Trash2, Play, Pause, RotateCcw, Volume2, PlayCircle, Settings } from 'lucide-react'

// ── Web Audio ────────────────────────────────────────────────────────────────
const freqMap: Record<string, Record<string, number>> = {
  beep:   { warn: 880,  end: 1100 },
  bell:   { warn: 660,  end: 880  },
  buzzer: { warn: 220,  end: 180  },
}

function playOnce(preset: string, type: 'warn' | 'end'): number {
  // Toca uma vez e retorna a duração em ms
  if (preset === 'none') return 0
  try {
    const freq = freqMap[preset]?.[type] ?? 660
    const dur  = type === 'end' ? 1.2 : 0.4
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
    if (type === 'end') {
      // Nota de resolução 400ms depois
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
      return 1800 // pausa entre repetições: 1.8s
    }
    return (dur * 1000) + 200
  } catch { return 0 }
}

// Toca uma vez (para preview / aviso)
function playSound(preset: string, type: 'warn' | 'end') {
  playOnce(preset, type)
}

// Inicia loop de som — retorna função para parar
function startAlarm(preset: string): () => void {
  if (preset === 'none') return () => {}
  let stopped = false
  function loop() {
    if (stopped) return
    const delay = playOnce(preset, 'end')
    setTimeout(() => { if (!stopped) loop() }, delay + 300)
  }
  loop()
  return () => { stopped = true }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcRemaining(t: TimerDto): number {
  if (t.state === 'paused')   return t.pausedRemaining ?? t.durationSeconds
  if (t.state === 'finished') return 0
  if (t.state === 'running' && t.startedAt) {
    const elapsed = (Date.now() - new Date(t.startedAt).getTime()) / 1000
    return Math.max(0, t.durationSeconds - elapsed)
  }
  return t.durationSeconds
}

function fmt(sec: number) {
  const s = Math.ceil(sec)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

// ── Timer Card ────────────────────────────────────────────────────────────────
function TimerCard({
  timer, onUpdate, onDelete,
}: { timer: TimerDto; onUpdate: (t: TimerDto) => void; onDelete: () => void }) {
  const [remaining, setRemaining]   = useState(() => calcRemaining(timer))
  const [showConfig, setShowConfig] = useState(false)
  const [editName,  setEditName]    = useState(false)
  const [nameVal,   setNameVal]     = useState(timer.name)
  const [cfgMin,    setCfgMin]      = useState(String(Math.round(timer.durationSeconds / 60)))
  const [cfgWarn,   setCfgWarn]     = useState(String(timer.warnAtSeconds))
  const [cfgSound,  setCfgSound]    = useState(timer.soundPreset)

  const warnFiredRef  = useRef(false)
  const endFiredRef   = useRef(false)
  const stopAlarmRef  = useRef<(() => void) | null>(null)
  const timerRef      = useRef(timer)
  timerRef.current    = timer

  function stopAlarm() {
    stopAlarmRef.current?.()
    stopAlarmRef.current = null
  }

  // Para o alarme quando o estado sai de 'finished'
  useEffect(() => {
    setRemaining(calcRemaining(timer))
    if (timer.state !== 'running') {
      warnFiredRef.current = false
      endFiredRef.current  = false
    }
    if (timer.state !== 'finished') stopAlarm()
  }, [timer])

  // Cleanup ao desmontar
  useEffect(() => () => stopAlarm(), [])

  useEffect(() => {
    if (timer.state !== 'running') return
    const id = setInterval(() => {
      const r = calcRemaining(timerRef.current)
      setRemaining(r)
      if (r <= timerRef.current.warnAtSeconds && r > 0 && !warnFiredRef.current) {
        warnFiredRef.current = true
        playSound(timerRef.current.soundPreset, 'warn')
      }
      if (r <= 0 && !endFiredRef.current) {
        endFiredRef.current = true
        // Inicia alarme em loop — só para quando usuário pausar/resetar
        stopAlarmRef.current = startAlarm(timerRef.current.soundPreset)
        timerApi.update(timerRef.current.id, { action: 'finish' })
          .then((res: { data: TimerDto }) => { if (res.data) onUpdate(res.data) })
          .catch(() => {})
      }
    }, 1000)
    return () => clearInterval(id)
  }, [timer.state, timer.id, onUpdate])

  async function doAction(action: string, extra?: object) {
    stopAlarm() // para o alarme em qualquer ação do usuário
    const fromRemaining = action === 'start' ? Math.round(remaining) : undefined
    try {
      const r = await timerApi.update(timer.id, { action, fromRemaining, ...extra })
      onUpdate(r.data as TimerDto)
      warnFiredRef.current = false; endFiredRef.current = false
    } catch { toast.error('Erro ao atualizar timer') }
  }

  async function saveName() {
    if (nameVal.trim() && nameVal !== timer.name)
      await doAction('rename', { name: nameVal.trim() })
    setEditName(false)
  }

  async function saveConfig() {
    const mins = parseInt(cfgMin) || 30
    await doAction('config', {
      durationSeconds: mins * 60,
      soundPreset:     cfgSound,
      warnAtSeconds:   parseInt(cfgWarn) || 60,
    })
    setShowConfig(false)
  }

  const pct  = Math.max(0, Math.min(100, ((timer.durationSeconds - remaining) / timer.durationSeconds) * 100))
  const isRed    = remaining <= 30 && timer.state === 'running'
  const isYellow = remaining <= timer.warnAtSeconds && remaining > 30 && timer.state === 'running'
  // Classes literais (não template string) — o Tailwind JIT precisa achar o nome
  // inteiro da classe no código-fonte pra gerar o CSS dela.
  const tone = isRed ? 'red' : isYellow ? 'amber' : timer.state === 'running' ? 'green' : 'gray'
  const TONE_TEXT: Record<string, string> = { red: 'text-red-500', amber: 'text-amber-500', green: 'text-green-500', gray: 'text-gray-500' }
  const TONE_BG:   Record<string, string> = { red: 'bg-red-500',   amber: 'bg-amber-500',   green: 'bg-green-500',   gray: 'bg-gray-500' }

  return (
    <div className="card flex flex-col gap-4">
      {/* Nome */}
      <div className="flex items-center gap-2">
        {editName ? (
          <input autoFocus className="input flex-1 text-sm font-semibold"
            value={nameVal} onChange={e => setNameVal(e.target.value)}
            onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} />
        ) : (
          <button className="flex-1 text-left font-semibold text-white hover:text-brand-400 transition-colors"
            onClick={() => setEditName(true)}>{timer.name}</button>
        )}
        <button onClick={() => setShowConfig(!showConfig)} className="text-gray-400 hover:text-white">
          <Settings className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="text-gray-500 hover:text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Display de tempo */}
      <div className="text-center">
        <span className={clsx('font-mono text-6xl font-bold tabular-nums transition-colors', TONE_TEXT[tone])}>{fmt(remaining)}</span>
        <p className="text-xs text-gray-500 mt-1">
          {timer.state === 'finished'
            ? <span className="text-red-400 font-semibold animate-pulse">🔔 Alarme tocando — clique Resetar para parar</span>
            : timer.state === 'running' ? 'Rodando'
            : timer.state === 'paused'  ? 'Pausado'
            : 'Parado'}
          {timer.state !== 'finished' && <>{' · '}{Math.round(timer.durationSeconds / 60)} min total</>}
        </p>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-1000', TONE_BG[tone])}
          style={{ width: `${pct}%` }} />
      </div>

      {/* Controles */}
      <div className="flex gap-2 justify-center">
        {timer.state === 'finished' ? (
          <button onClick={() => doAction('reset')}
            className="btn-danger flex items-center gap-1.5 px-6 animate-pulse">
            <RotateCcw className="w-4 h-4" /> Parar alarme
          </button>
        ) : timer.state !== 'running' ? (
          <button onClick={() => doAction('start')}
            className="btn-primary flex items-center gap-1.5 px-5">
            <Play className="w-4 h-4" /> {timer.state === 'paused' ? 'Retomar' : 'Iniciar'}
          </button>
        ) : (
          <button onClick={() => doAction('pause')}
            className="btn-secondary flex items-center gap-1.5 px-5">
            <Pause className="w-4 h-4" /> Pausar
          </button>
        )}
        {timer.state !== 'finished' && (
          <button onClick={() => doAction('reset')}
            className="btn-secondary flex items-center gap-1.5 px-4">
            <RotateCcw className="w-4 h-4" /> Resetar
          </button>
        )}
      </div>

      {/* Config */}
      {showConfig && (
        <div className="border-t border-surface-500 pt-3 flex flex-col gap-3">
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-400 w-24">Duração (min)</label>
            <input type="number" min={1} max={999} className="input text-sm flex-1"
              value={cfgMin} onChange={e => setCfgMin(e.target.value)} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-400 w-24">Aviso (seg)</label>
            <input type="number" min={0} max={3600} className="input text-sm flex-1"
              value={cfgWarn} onChange={e => setCfgWarn(e.target.value)} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-400 w-24 flex items-center gap-1">
              <Volume2 className="w-3 h-3" /> Som
            </label>
            <select className="input text-sm flex-1" value={cfgSound} onChange={e => setCfgSound(e.target.value)}>
              <option value="none">Sem som</option>
              <option value="beep">Beep</option>
              <option value="bell">Sino</option>
              <option value="buzzer">Buzzer</option>
            </select>
            <button
              onClick={() => playSound(cfgSound, 'warn')}
              title="Testar som de aviso"
              className="p-1.5 rounded text-gray-400 hover:text-brand-400 hover:bg-surface-700 transition-colors shrink-0">
              <PlayCircle className="w-4 h-4" />
            </button>
          </div>
          <button onClick={saveConfig} className="btn-primary text-sm">Salvar</button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function TimerPage() {
  const [timers,      setTimers]      = useState<TimerDto[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNew,     setShowNew]     = useState(false)
  const [newName,     setNewName]     = useState('Rodada 1')
  const [newMin,      setNewMin]      = useState('30')
  const [newSound,    setNewSound]    = useState('bell')
  const [newWarn,     setNewWarn]     = useState('60')

  const load = useCallback(async () => {
    try {
      const r = await timerApi.list()
      setTimers(r.data)
    } catch { toast.error('Erro ao carregar timers') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Polling a cada 10s para sincronizar com o servidor (caso de múltiplos dispositivos)
  useEffect(() => {
    const id = setInterval(() => { timerApi.list().then((res: { data: TimerDto[] }) => setTimers(res.data)).catch(() => {}) }, 10_000)
    return () => clearInterval(id)
  }, [])

  function updateTimer(updated: TimerDto) {
    setTimers(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function createTimer() {
    const mins = parseInt(newMin) || 30
    try {
      const r = await timerApi.create({
        name: newName.trim() || 'Timer',
        durationSeconds: mins * 60,
        soundPreset: newSound,
        warnAtSeconds: parseInt(newWarn) || 60,
      })
      setTimers(prev => [...prev, r.data as TimerDto])
      setShowNew(false)
      setNewName('Rodada 1')
    } catch { toast.error('Erro ao criar timer') }
  }

  async function deleteTimer(id: string) {
    try {
      await timerApi.remove(id)
      setTimers(prev => prev.filter(t => t.id !== id))
      toast.success('Timer removido')
    } catch { toast.error('Erro ao remover timer') }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">⏱ Timers de Torneio</h1>
          <p className="text-gray-400 text-sm mt-1">
            Crie e gerencie múltiplos timers simultâneos. O estado é persistente — sobrevive a refresh.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Timer
        </button>
      </div>

      {/* Modal novo timer */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="card w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-white">Novo Timer</h2>
            <div>
              <label className="text-xs text-gray-400">Nome</label>
              <input className="input w-full mt-1" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Rodada 1, Intervalo..." />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400">Duração (min)</label>
                <input type="number" min={1} max={999} className="input w-full mt-1"
                  value={newMin} onChange={e => setNewMin(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400">Aviso (seg antes do fim)</label>
                <input type="number" min={0} max={3600} className="input w-full mt-1"
                  value={newWarn} onChange={e => setNewWarn(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> Som
              </label>
              <div className="flex gap-2 mt-1">
                <select className="input flex-1" value={newSound} onChange={e => setNewSound(e.target.value)}>
                  <option value="none">Sem som</option>
                  <option value="beep">Beep</option>
                  <option value="bell">Sino</option>
                  <option value="buzzer">Buzzer</option>
                </select>
                <button
                  onClick={() => playSound(newSound, 'warn')}
                  title="Testar som"
                  className="btn-secondary flex items-center gap-1 px-3 text-sm">
                  <PlayCircle className="w-4 h-4" /> Testar
                </button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="btn-secondary">Cancelar</button>
              <button onClick={createTimer} className="btn-primary">Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Grid de timers */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : timers.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-3">⏱</p>
          <p className="font-semibold">Nenhum timer criado</p>
          <p className="text-sm mt-1">Clique em "Novo Timer" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {timers.map(t => (
            <TimerCard key={t.id} timer={t}
              onUpdate={updateTimer}
              onDelete={() => deleteTimer(t.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
