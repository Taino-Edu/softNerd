'use client'

// =============================================================================
// TimerWidget — timer de torneio como widget lateral, no estilo do VLibras
//
// Fica preso na lateral da tela em qualquer página do sistema (montado no layout
// raiz), então o juiz acompanha a rodada enquanto lança venda, abre comanda ou
// mexe no estoque — antes era preciso ficar na página /admin/timer.
//
// Só aparece pra quem opera a loja (Admin/Operator) e pode ser desligado em
// Configurações → Preferências, igual ao VLibras.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  Timer, X, Play, Pause, RotateCcw, Plus, Trash2, Settings,
  Volume2, PlayCircle, BellRing, ChevronDown,
} from 'lucide-react'
import { TimerDto } from '@/lib/api'
import { usePreferences } from '@/hooks/usePreferences'
import { useTimers, fmtTempo, tocarPreview } from '@/contexts/TimerContext'

const SONS = [
  { value: 'none',   label: 'Sem som' },
  { value: 'beep',   label: 'Beep'    },
  { value: 'bell',   label: 'Sino'    },
  { value: 'buzzer', label: 'Buzzer'  },
]

/**
 * Aba colada na borda da tela, como a do VLibras. As âncoras de baixo ficam bem
 * acima do rodapé porque ali já moram o botão da IA, o do VLibras e o de instalar
 * o app — empilhar mais um em cima cobriria os outros.
 */
const ANCORAS: Record<string, string> = {
  'bottom-right': 'right-0 bottom-44',
  'bottom-left':  'left-0  bottom-44',
  'top-right':    'right-0 top-32',
  'top-left':     'left-0  top-32',
}

function ehEsquerda(corner: string) { return corner.endsWith('left') }

// ── Card de um timer dentro do painel ─────────────────────────────────────────
function TimerItem({ timer, restante }: { timer: TimerDto; restante: number }) {
  const { acao, remover } = useTimers()
  const [config,  setConfig]  = useState(false)
  const [nome,    setNome]    = useState(timer.name)
  const [editando, setEditando] = useState(false)
  const [min,     setMin]     = useState(String(Math.round(timer.durationSeconds / 60)))
  const [aviso,   setAviso]   = useState(String(timer.warnAtSeconds))
  const [som,     setSom]     = useState(timer.soundPreset)

  const rodando  = timer.state === 'running'
  const acabou   = timer.state === 'finished'
  const vermelho = restante <= 30 && rodando
  const amarelo  = restante <= timer.warnAtSeconds && restante > 30 && rodando

  // Classes literais: o JIT do Tailwind precisa ver o nome inteiro no código.
  const TEXTO: Record<string, string> = {
    red: 'text-red-400', amber: 'text-amber-400', green: 'text-emerald-400', gray: 'text-gray-400',
  }
  const BARRA: Record<string, string> = {
    red: 'bg-red-500', amber: 'bg-amber-500', green: 'bg-emerald-500', gray: 'bg-gray-500',
  }
  const tom = acabou || vermelho ? 'red' : amarelo ? 'amber' : rodando ? 'green' : 'gray'
  const pct = Math.max(0, Math.min(100,
    ((timer.durationSeconds - restante) / Math.max(1, timer.durationSeconds)) * 100))

  async function executar(action: string, extra?: Record<string, unknown>) {
    try { await acao(timer.id, action, extra) }
    catch { toast.error('Não deu pra atualizar o timer') }
  }

  async function salvarNome() {
    setEditando(false)
    if (nome.trim() && nome.trim() !== timer.name) await executar('rename', { name: nome.trim() })
  }

  async function salvarConfig() {
    await executar('config', {
      durationSeconds: (parseInt(min) || 30) * 60,
      soundPreset:     som,
      warnAtSeconds:   parseInt(aviso) || 60,
    })
    setConfig(false)
  }

  return (
    <div className={clsx(
      'rounded-xl border p-3 transition-colors',
      acabou ? 'border-red-500/60 bg-red-950/40' : 'border-surface-500 bg-surface-800',
    )}>
      <div className="flex items-center gap-2">
        {editando ? (
          <input
            autoFocus value={nome}
            onChange={e => setNome(e.target.value)}
            onBlur={salvarNome}
            onKeyDown={e => e.key === 'Enter' && salvarNome()}
            className="flex-1 min-w-0 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs font-semibold text-white outline-none focus:border-brand-500"
          />
        ) : (
          <button onClick={() => setEditando(true)}
            className="flex-1 min-w-0 text-left text-xs font-bold text-white truncate hover:text-brand-400 transition-colors">
            {timer.name}
          </button>
        )}
        <button onClick={() => setConfig(c => !c)} aria-label="Configurar timer"
          className="text-gray-500 hover:text-white transition-colors">
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => remover(timer.id).catch(() => toast.error('Não deu pra remover'))}
          aria-label="Remover timer"
          className="text-gray-500 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className={clsx('mt-1.5 text-center font-mono text-3xl font-bold tabular-nums', TEXTO[tom])}>
        {fmtTempo(restante)}
      </p>

      <div className="mt-2 h-1.5 w-full rounded-full bg-surface-700 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-1000', BARRA[tom])}
          style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-2.5 flex gap-1.5">
        {acabou ? (
          <button onClick={() => executar('reset')}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-red-500 hover:bg-red-400 px-2 py-1.5 text-[11px] font-bold text-white transition-colors">
            <BellRing className="w-3 h-3" /> Parar alarme
          </button>
        ) : (
          <>
            <button onClick={() => executar(rodando ? 'pause' : 'start')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors',
                rodando
                  ? 'bg-surface-700 hover:bg-surface-500 text-gray-200'
                  : 'bg-brand-500 hover:bg-brand-400 text-white',
              )}>
              {rodando
                ? <><Pause className="w-3 h-3" /> Pausar</>
                : <><Play className="w-3 h-3" /> {timer.state === 'paused' ? 'Retomar' : 'Iniciar'}</>}
            </button>
            <button onClick={() => executar('reset')} aria-label="Resetar timer"
              className="rounded-lg bg-surface-700 hover:bg-surface-500 px-2.5 py-1.5 text-gray-300 transition-colors">
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {config && (
        <div className="mt-3 space-y-2 border-t border-surface-500 pt-2.5">
          <label className="flex items-center gap-2">
            <span className="w-20 text-[10px] uppercase tracking-wider text-gray-500">Duração (min)</span>
            <input type="number" min={1} max={999} value={min} onChange={e => setMin(e.target.value)}
              className="flex-1 min-w-0 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500" />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-[10px] uppercase tracking-wider text-gray-500">Aviso (seg)</span>
            <input type="number" min={0} max={3600} value={aviso} onChange={e => setAviso(e.target.value)}
              className="flex-1 min-w-0 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500" />
          </label>
          <div className="flex items-center gap-2">
            <span className="w-20 text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
              <Volume2 className="w-3 h-3" /> Som
            </span>
            <select value={som} onChange={e => setSom(e.target.value)}
              className="flex-1 min-w-0 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500">
              {SONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={() => tocarPreview(som)} aria-label="Testar som"
              className="text-gray-500 hover:text-brand-400 transition-colors">
              <PlayCircle className="w-4 h-4" />
            </button>
          </div>
          <button onClick={salvarConfig}
            className="w-full rounded-lg bg-brand-500 hover:bg-brand-400 py-1.5 text-[11px] font-bold text-white transition-colors">
            Salvar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────
export default function TimerWidget() {
  const { prefs } = usePreferences()
  const { timers, restantes, disponivel, alarmando, criar } = useTimers()

  const [aberto,   setAberto]   = useState(false)
  const [criando,  setCriando]  = useState(false)
  const [novoNome, setNovoNome] = useState('Rodada 1')
  const [novoMin,  setNovoMin]  = useState('30')
  const [novoSom,  setNovoSom]  = useState('bell')
  const [novoAviso, setNovoAviso] = useState('60')

  const corner  = prefs.timer?.corner ?? 'bottom-right'
  const ligado  = prefs.timer?.enabled ?? true
  const esquerda = ehEsquerda(corner)

  const temAlarme = alarmando.size > 0
  const rodando   = useMemo(() => timers.filter(t => t.state === 'running'), [timers])

  // Timer estourou com o painel fechado: abre sozinho, senão o som toca sem
  // que ninguém ache onde desligar.
  useEffect(() => { if (temAlarme) setAberto(true) }, [temAlarme])

  // ESC fecha, como em qualquer painel do sistema.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  if (!disponivel || !ligado) return null

  /** Tempo do timer mais urgente — vira o rótulo do botão fechado. */
  const destaque = rodando.length > 0
    ? rodando.reduce((a, b) => (restantes[a.id] ?? 0) <= (restantes[b.id] ?? 0) ? a : b)
    : null

  async function criarTimer() {
    try {
      await criar({
        name:            novoNome.trim() || 'Timer',
        durationSeconds: (parseInt(novoMin) || 30) * 60,
        soundPreset:     novoSom,
        warnAtSeconds:   parseInt(novoAviso) || 60,
      })
      setCriando(false)
      setNovoNome('Rodada 1')
    } catch { toast.error('Não deu pra criar o timer') }
  }

  return (
    <>
      {/* Aba lateral fechada */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir timers de torneio"
          className={clsx(
            'fixed z-[9998] flex items-center gap-2 py-3 px-2.5 shadow-2xl transition-all',
            'bg-surface-800 border border-surface-500 text-white hover:bg-surface-700',
            esquerda ? 'rounded-r-2xl border-l-0' : 'rounded-l-2xl border-r-0',
            temAlarme && 'animate-pulse border-red-500 bg-red-950',
            ANCORAS[corner] ?? ANCORAS['bottom-right'],
          )}
        >
          <Timer className={clsx('w-5 h-5', temAlarme ? 'text-red-400' : 'text-brand-400')} />
          {destaque && (
            <span className="font-mono text-xs font-bold tabular-nums">
              {fmtTempo(restantes[destaque.id] ?? 0)}
            </span>
          )}
          {temAlarme && <span className="text-[10px] font-black uppercase text-red-300">Fim!</span>}
        </button>
      )}

      {/* Painel aberto */}
      {aberto && (
        <div
          className={clsx(
            'fixed z-[9998] w-[19rem] max-w-[calc(100vw-1.5rem)] max-h-[70vh] flex flex-col',
            'rounded-2xl border border-surface-500 bg-surface-900 shadow-2xl',
            esquerda ? 'left-3' : 'right-3',
            corner.startsWith('top') ? 'top-20' : 'bottom-40',
          )}
        >
          <div className="flex items-center gap-2 border-b border-surface-500 px-3 py-2.5">
            <Timer className="w-4 h-4 text-brand-400 shrink-0" />
            <h2 className="flex-1 text-xs font-black uppercase tracking-wider text-white">Timers</h2>
            <button onClick={() => setCriando(c => !c)} aria-label="Novo timer"
              className="text-gray-400 hover:text-brand-400 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={() => setAberto(false)} aria-label="Fechar timers"
              className="text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {criando && (
              <div className="rounded-xl border border-brand-500/40 bg-surface-800 p-3 space-y-2">
                <input
                  autoFocus value={novoNome} onChange={e => setNovoNome(e.target.value)}
                  placeholder="Ex: Rodada 1, Intervalo…"
                  className="w-full bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-brand-500"
                />
                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Minutos</span>
                    <input type="number" min={1} max={999} value={novoMin} onChange={e => setNovoMin(e.target.value)}
                      className="w-full bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500" />
                  </label>
                  <label className="flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Aviso (seg)</span>
                    <input type="number" min={0} max={3600} value={novoAviso} onChange={e => setNovoAviso(e.target.value)}
                      className="w-full bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500" />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <select value={novoSom} onChange={e => setNovoSom(e.target.value)}
                    className="flex-1 min-w-0 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500">
                    {SONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <button onClick={() => tocarPreview(novoSom)} aria-label="Testar som"
                    className="text-gray-500 hover:text-brand-400 transition-colors">
                    <PlayCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCriando(false)}
                    className="flex-1 rounded-lg bg-surface-700 hover:bg-surface-500 py-1.5 text-[11px] font-bold text-gray-300 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={criarTimer}
                    className="flex-1 rounded-lg bg-brand-500 hover:bg-brand-400 py-1.5 text-[11px] font-bold text-white transition-colors">
                    Criar
                  </button>
                </div>
              </div>
            )}

            {timers.length === 0 && !criando ? (
              <div className="py-8 text-center">
                <p className="text-3xl">⏱</p>
                <p className="mt-2 text-xs font-semibold text-gray-400">Nenhum timer criado</p>
                <button onClick={() => setCriando(true)}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand-500 hover:bg-brand-400 px-3 py-1.5 text-[11px] font-bold text-white transition-colors">
                  <Plus className="w-3 h-3" /> Criar timer
                </button>
              </div>
            ) : (
              timers.map(t => (
                <TimerItem key={t.id} timer={t} restante={restantes[t.id] ?? t.durationSeconds} />
              ))
            )}
          </div>

          <button onClick={() => setAberto(false)}
            className="flex items-center justify-center gap-1 border-t border-surface-500 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white transition-colors">
            <ChevronDown className="w-3 h-3" /> Fechar
          </button>
        </div>
      )}
    </>
  )
}
