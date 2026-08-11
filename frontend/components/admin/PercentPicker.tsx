'use client'
import { useState } from 'react'
import clsx from 'clsx'

const ATALHOS = [0, 5, 10, 15, 20]

/**
 * Seletor de desconto em %: os atalhos de sempre + campo pra digitar qualquer valor.
 * Antes só dava pra escolher 5/10/15/20 — qualquer outro percentual obrigava a fazer
 * a conta na mão e lançar em R$ (pedido do Maikon).
 */
export default function PercentPicker({ value, onChange, max = 100, disabled = false }: {
  value: number
  onChange: (v: number) => void
  max?: number
  disabled?: boolean
}) {
  // Enquanto o campo está em foco vale o que foi digitado (senão não dá nem pra apagar
  // o número pra trocar) — ao sair, volta a espelhar o valor de verdade.
  const [digitando, setDigitando] = useState<string | null>(null)

  function handleInput(txt: string) {
    setDigitando(txt)
    const n = parseInt(txt.replace(/\D/g, ''), 10)
    onChange(Number.isNaN(n) ? 0 : Math.min(max, Math.max(0, n)))
  }

  return (
    <div className="flex gap-1.5 items-stretch">
      {ATALHOS.map(d => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onClick={() => { setDigitando(null); onChange(d) }}
          className={clsx(
            'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40',
            value === d
              ? 'bg-accent-green/20 border-accent-green/50 text-accent-green'
              : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-500'
          )}
        >{d === 0 ? '—' : `${d}%`}</button>
      ))}

      <div className="relative w-[4.5rem] shrink-0">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder="outro"
          value={digitando ?? (value === 0 ? '' : String(value))}
          onChange={e => handleInput(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          onBlur={() => setDigitando(null)}
          className={clsx(
            'w-full h-full pl-2 pr-5 rounded-lg text-xs font-bold border text-center transition-all disabled:opacity-40',
            value > 0 && !ATALHOS.includes(value)
              ? 'bg-accent-green/20 border-accent-green/50 text-accent-green'
              : 'bg-surface-700 border-surface-500 text-white'
          )}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">%</span>
      </div>
    </div>
  )
}
