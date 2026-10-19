'use client'
// Preço da entrada de cada evento (liguinha ou campeonato) — o Maikon decide por evento:
// grátis, o valor de sempre ou um valor a mais numa edição especial. Atalhos com os
// valores usados por último pra não digitar toda semana.
import { useState } from 'react'
import clsx from 'clsx'
import { brlDeCentavos } from '@/lib/format'

export default function EscolherEntrada({ centavos, onChange, sugestoes = [] }: {
  centavos: number; onChange: (centavos: number) => void; sugestoes?: number[]
}) {
  const [paga, setPaga] = useState(centavos > 0)
  const [texto, setTexto] = useState(centavos > 0 ? (centavos / 100).toFixed(2).replace('.', ',') : '')

  function digitar(v: string) {
    setTexto(v)
    const n = Math.round(parseFloat(v.replace(/\./g, '').replace(',', '.') || '0') * 100)
    onChange(isNaN(n) || n < 0 ? 0 : n)
  }

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Entrada" className="grid grid-cols-2 gap-2">
        {[{ v: false, rotulo: 'Grátis' }, { v: true, rotulo: 'Paga' }].map(({ v, rotulo }) => (
          <button key={rotulo} type="button" role="radio" aria-checked={paga === v}
            onClick={() => { setPaga(v); if (!v) { setTexto(''); onChange(0) } }}
            className={clsx('rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              paga === v ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-surface-500 text-gray-400 hover:border-surface-400')}>
            {rotulo}
          </button>
        ))}
      </div>
      {paga && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-36">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
            <input inputMode="decimal" value={texto} onChange={e => digitar(e.target.value)} autoFocus
              placeholder="0,00" aria-label="Valor da entrada" className="input w-full pl-9" />
          </div>
          {sugestoes.filter(s => s > 0).slice(0, 4).map(s => (
            <button key={s} type="button" onClick={() => digitar((s / 100).toFixed(2).replace('.', ','))}
              className={clsx('text-xs px-2.5 py-1 rounded-full border', s === centavos ? 'border-brand-500 text-white' : 'border-surface-500 text-gray-400 hover:text-white')}>
              {brlDeCentavos(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Valores de entrada mais usados por último (mais recentes primeiro, sem repetir, só pagos). */
export function precosRecentes(eventos: { entryFeeInCents: number; startDate: string }[]): number[] {
  return [...eventos]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .map(e => e.entryFeeInCents)
    .filter((v, i, todos) => v > 0 && todos.indexOf(v) === i)
}
