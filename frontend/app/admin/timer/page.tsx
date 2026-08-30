'use client'

// =============================================================================
// /admin/timer — tela cheia dos timers de torneio
//
// O estado, o polling e o som vivem no TimerContext, o mesmo que alimenta o
// widget lateral. Antes cada tela tinha o seu relógio e o seu áudio, então com
// as duas abertas o alarme tocava dobrado e o timer sumia ao sair da página.
// =============================================================================

import { useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Plus, Trash2, Play, Pause, RotateCcw, Volume2, PlayCircle, Settings, BellRing } from 'lucide-react'
import { TimerDto } from '@/lib/api'
import { useTimers, fmtTempo, tocarPreview } from '@/contexts/TimerContext'

const SONS = [
  { value: 'none',   label: 'Sem som' },
  { value: 'beep',   label: 'Beep'    },
  { value: 'bell',   label: 'Sino'    },
  { value: 'buzzer', label: 'Buzzer'  },
]

// ── Card de timer ─────────────────────────────────────────────────────────────
function TimerCard({ timer, restante }: { timer: TimerDto; restante: number }) {
  const { acao, remover } = useTimers()

  const [showConfig, setShowConfig] = useState(false)
  const [editName,   setEditName]   = useState(false)
  const [nameVal,    setNameVal]    = useState(timer.name)
  const [cfgMin,     setCfgMin]     = useState(String(Math.round(timer.durationSeconds / 60)))
  const [cfgWarn,    setCfgWarn]    = useState(String(timer.warnAtSeconds))
  const [cfgSound,   setCfgSound]   = useState(timer.soundPreset)

  async function doAction(action: string, extra?: Record<string, unknown>) {
    try { await acao(timer.id, action, extra) }
    catch { toast.error('Erro ao atualizar timer') }
  }

  async function saveName() {
    setEditName(false)
    if (nameVal.trim() && nameVal.trim() !== timer.name)
      await doAction('rename', { name: nameVal.trim() })
  }

  async function saveConfig() {
    await doAction('config', {
      durationSeconds: (parseInt(cfgMin) || 30) * 60,
      soundPreset:     cfgSound,
      warnAtSeconds:   parseInt(cfgWarn) || 60,
    })
    setShowConfig(false)
  }

  const rodando  = timer.state === 'running'
  const acabou   = timer.state === 'finished'
  const pct      = Math.max(0, Math.min(100,
    ((timer.durationSeconds - restante) / Math.max(1, timer.durationSeconds)) * 100))
  const isRed    = restante <= 30 && rodando
  const isYellow = restante <= timer.warnAtSeconds && restante > 30 && rodando

  // Classes literais (não template string) — o Tailwind JIT precisa achar o nome
  // inteiro da classe no código-fonte pra gerar o CSS dela.
  const tone = acabou || isRed ? 'red' : isYellow ? 'amber' : rodando ? 'green' : 'gray'
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
        <button onClick={() => setShowConfig(!showConfig)} aria-label="Configurar timer"
          className="text-gray-400 hover:text-white">
          <Settings className="w-4 h-4" />
        </button>
        <button onClick={() => remover(timer.id).then(() => toast.success('Timer removido')).catch(() => toast.error('Erro ao remover timer'))}
          aria-label="Remover timer" className="text-gray-500 hover:text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Display de tempo */}
      <div className="text-center">
        <span className={clsx('font-mono text-6xl font-bold tabular-nums transition-colors', TONE_TEXT[tone])}>
          {fmtTempo(restante)}
        </span>
        <p className="text-xs text-gray-500 mt-1">
          {acabou
            ? <span className="text-red-400 font-semibold animate-pulse">🔔 Alarme tocando — clique Parar alarme</span>
            : rodando ? 'Rodando'
            : timer.state === 'paused' ? 'Pausado'
            : 'Parado'}
          {!acabou && <>{' · '}{Math.round(timer.durationSeconds / 60)} min total</>}
        </p>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-1000', TONE_BG[tone])}
          style={{ width: `${pct}%` }} />
      </div>

      {/* Controles */}
      <div className="flex gap-2 justify-center">
        {acabou ? (
          <button onClick={() => doAction('reset')}
            className="btn-danger flex items-center gap-1.5 px-6 animate-pulse">
            <BellRing className="w-4 h-4" /> Parar alarme
          </button>
        ) : (
          <>
            <button onClick={() => doAction(rodando ? 'pause' : 'start')}
              className={clsx('flex items-center gap-1.5 px-5', rodando ? 'btn-secondary' : 'btn-primary')}>
              {rodando
                ? <><Pause className="w-4 h-4" /> Pausar</>
                : <><Play className="w-4 h-4" /> {timer.state === 'paused' ? 'Retomar' : 'Iniciar'}</>}
            </button>
            <button onClick={() => doAction('reset')} className="btn-secondary flex items-center gap-1.5 px-4">
              <RotateCcw className="w-4 h-4" /> Resetar
            </button>
          </>
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
              {SONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              onClick={() => tocarPreview(cfgSound)}
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
  const { timers, restantes, loading, criar } = useTimers()

  const [showNew,  setShowNew]  = useState(false)
  const [newName,  setNewName]  = useState('Rodada 1')
  const [newMin,   setNewMin]   = useState('30')
  const [newSound, setNewSound] = useState('bell')
  const [newWarn,  setNewWarn]  = useState('60')

  async function createTimer() {
    try {
      await criar({
        name:            newName.trim() || 'Timer',
        durationSeconds: (parseInt(newMin) || 30) * 60,
        soundPreset:     newSound,
        warnAtSeconds:   parseInt(newWarn) || 60,
      })
      setShowNew(false)
      setNewName('Rodada 1')
    } catch { toast.error('Erro ao criar timer') }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">⏱ Timers de Torneio</h1>
          <p className="text-gray-400 text-sm mt-1">
            Crie e gerencie múltiplos timers simultâneos. O estado é persistente — sobrevive a
            refresh, e o widget na lateral acompanha em qualquer tela do sistema.
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
                  {SONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button
                  onClick={() => tocarPreview(newSound)}
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
          <p className="text-sm mt-1">Clique em &quot;Novo Timer&quot; para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {timers.map(t => (
            <TimerCard key={t.id} timer={t} restante={restantes[t.id] ?? t.durationSeconds} />
          ))}
        </div>
      )}
    </div>
  )
}
