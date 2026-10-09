'use client'

// Relógio da rodada da liguinha: conta no navegador a partir do timer do campeonato
// (mesma conta do servidor em lib/api/liga.ts → segundosRestantes).

import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { TimerTorneioDto, segundosRestantes } from '@/lib/api'

export default function Relogio({ timer, grande = false }: { timer: TimerTorneioDto | null; grande?: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const resta = segundosRestantes(timer)
  if (resta === null) return null
  const mm = String(Math.floor(resta / 60)).padStart(2, '0')
  const ss = String(resta % 60).padStart(2, '0')
  const acabou = resta === 0
  return (
    <div className={`bg-surface-800 border border-surface-500 rounded-2xl flex items-center justify-center gap-3 ${grande ? 'py-6' : 'py-3'}`}>
      <Timer className={`${grande ? 'w-10 h-10' : 'w-5 h-5'} ${acabou ? 'txt-erro' : 'text-brand-400'}`} />
      <span className={`font-mono font-bold ${grande ? 'text-7xl' : 'text-3xl'} ${acabou ? 'txt-erro' : 'text-white'}`}>
        {acabou ? 'TEMPO!' : `${mm}:${ss}`}
      </span>
      {timer?.state === 'paused' && <span className="text-xs txt-alerta">pausado</span>}
    </div>
  )
}
