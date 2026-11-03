'use client'

// =============================================================================
// AvisoAlarme — selo flutuante do alarme da rodada no painel
//
// Campeonato licenciado, com premiação: o alarme do fim da rodada não pode sair mudo. O Chrome não
// deixa a página tocar som antes de alguém clicar ou teclar nela — painel aberto ou recarregado e
// sem ninguém mexer, o alarme não tocava e nada avisava. Aqui:
//   - som bloqueado → selo vermelho "Alarme sem som — clique pra ativar" (pulsa com rodada correndo)
//   - som liberado e rodada correndo → selo discreto "Alarme pronto · tela acordada"
//   - fora disso, some
// Pequeno pra não atrapalhar, e dá pra arrastar pela alça; a posição fica guardada no aparelho.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { GripVertical, Volume2, VolumeX, Sun, MoonStar } from 'lucide-react'
import { useTimers, tocarPreview } from '@/contexts/TimerContext'

const CHAVE_POSICAO = 'aviso-alarme-posicao'
type Posicao = { x: number; y: number }

function lerPosicao(): Posicao | null {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_POSICAO) ?? 'null') as Posicao | null
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
  } catch { return null }
}

/** Mantém o selo inteiro dentro da tela (janela redimensionada, monitor trocado). */
function dentroDaTela(p: Posicao, el: HTMLElement | null): Posicao {
  const w = el?.offsetWidth ?? 280, h = el?.offsetHeight ?? 40
  return {
    x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - h - 8)),
  }
}

export default function AvisoAlarme() {
  const { disponivel, somLiberado, emRodada, telaAcordada } = useTimers()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Posicao | null>(null)
  const arrasto = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => { setPos(lerPosicao()) }, [])
  useEffect(() => {
    const ajustar = () => setPos(p => p && dentroDaTela(p, ref.current))
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [])

  const comecar = useCallback((e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    arrasto.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])
  const mover = useCallback((e: React.PointerEvent) => {
    if (!arrasto.current) return
    setPos(dentroDaTela({ x: e.clientX - arrasto.current.dx, y: e.clientY - arrasto.current.dy }, ref.current))
  }, [])
  const soltar = useCallback(() => {
    if (!arrasto.current) return
    arrasto.current = null
    setPos(p => { try { if (p) localStorage.setItem(CHAVE_POSICAO, JSON.stringify(p)) } catch { /* sem armazenamento: só nesta tela */ } return p })
  }, [])

  const bloqueado = !somLiberado
  if (!disponivel || (!bloqueado && !emRodada)) return null

  function ativarSom() {
    // O próprio clique já libera o som; o bipe curto confirma que está saindo na caixa
    tocarPreview('bell', 'warn')
    toast.success('Som do alarme ligado')
  }

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={clsx(
        'fixed z-[9999] flex items-center gap-1.5 rounded-full border shadow-2xl select-none',
        'pl-1 pr-3 py-1.5 text-xs font-semibold',
        !pos && 'left-1/2 -translate-x-1/2 top-3',
        !bloqueado && 'bg-surface-800 border-surface-500',
      )}
      // Bloqueado: vermelho cheio com texto branco — chama a atenção igual no tema claro e no escuro
      // (cor no style, fora das classes que o html.light troca)
      style={{
        ...(pos ? { left: pos.x, top: pos.y } : {}),
        ...(bloqueado ? { backgroundColor: '#DC2626', borderColor: '#991B1B', color: '#FFFFFF' } : {}),
      }}
    >
      <span
        onPointerDown={comecar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        className={clsx('cursor-grab active:cursor-grabbing p-0.5 touch-none', !bloqueado && 'text-gray-500')}
        style={bloqueado ? { color: 'rgba(255,255,255,0.75)' } : undefined}
        title="Arraste pra mudar o lugar" aria-label="Mover aviso do alarme"
      >
        <GripVertical className="w-4 h-4" />
      </span>

      {bloqueado ? (
        <button onClick={ativarSom} className="flex items-center gap-1.5" style={{ color: '#FFFFFF' }}>
          {/* Rodada correndo e alarme mudo: pontinho piscando, sem apagar o selo */}
          {emRodada && (
            <span className="relative flex w-2 h-2 shrink-0">
              <span className="absolute inline-flex w-full h-full rounded-full animate-ping" style={{ backgroundColor: '#FFFFFF', opacity: 0.8 }} />
              <span className="relative inline-flex w-2 h-2 rounded-full" style={{ backgroundColor: '#FFFFFF' }} />
            </span>
          )}
          <VolumeX className="w-4 h-4 shrink-0" />
          <span>Alarme sem som — <u>clique aqui pra ativar</u></span>
        </button>
      ) : (
        <span className="flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 shrink-0 txt-ok" />
          <span className="txt-ok">Alarme pronto</span>
          <span className="text-gray-500">·</span>
          {telaAcordada === 'sim' ? (
            <span className="flex items-center gap-1 text-gray-400"><Sun className="w-3.5 h-3.5" /> tela acordada</span>
          ) : telaAcordada === 'aba-escondida' ? (
            <span className="flex items-center gap-1 txt-alerta" title="O navegador só segura a tela acordada com esta aba na frente">
              <MoonStar className="w-3.5 h-3.5" /> deixe esta aba na frente
            </span>
          ) : (
            <span className="flex items-center gap-1 txt-alerta"
              title="Este navegador não deixa o site manter a tela acordada: em Energia do Windows, ponha a tela e a suspensão em 'Nunca' nos dias de torneio">
              <MoonStar className="w-3.5 h-3.5" /> a tela pode apagar — ver energia do PC
            </span>
          )}
        </span>
      )}
    </div>
  )
}
