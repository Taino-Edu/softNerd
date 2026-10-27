'use client'
// Liga × Campeonato — duas modalidades diferentes:
//   Liga       = liguinha semanal, a colocação soma na Liga Mensal (10/7/5/3/1)
//   Campeonato = evento avulso — por enquanto só inscrição e venda; NÃO soma na Liga
// Usado na Central (criar) e na tela de Campeonatos.
import clsx from 'clsx'
import { Award, Trophy } from 'lucide-react'
import type { Modalidade } from '@/lib/api'

const OPCOES: { m: Modalidade; titulo: string; detalhe: string; icone: typeof Award }[] = [
  { m: 'Liga',       titulo: 'Liguinha',   detalhe: 'Semanal · soma na Liga Mensal',     icone: Award },
  { m: 'Campeonato', titulo: 'Campeonato', detalhe: 'Inscrição e venda · não soma',      icone: Trophy },
]

export default function EscolherModalidade({ valor, onChange }: { valor: Modalidade; onChange: (m: Modalidade) => void }) {
  return (
    <div role="radiogroup" aria-label="Modalidade" className="grid grid-cols-2 gap-2">
      {OPCOES.map(({ m, titulo, detalhe, icone: Icone }) => (
        <button key={m} type="button" role="radio" aria-checked={valor === m} onClick={() => onChange(m)}
          className={clsx('rounded-xl border px-3 py-2.5 text-left transition-colors',
            valor === m ? 'border-brand-500 bg-brand-500/10' : 'border-surface-500 hover:border-surface-400')}>
          <span className={clsx('flex items-center gap-2 text-sm font-semibold', valor === m ? 'text-white' : 'text-gray-300')}>
            <Icone className={clsx('w-4 h-4', valor === m ? 'text-brand-400' : 'text-gray-500')} /> {titulo}
          </span>
          <span className="block text-xs text-gray-400 mt-0.5">{detalhe}</span>
        </button>
      ))}
    </div>
  )
}
