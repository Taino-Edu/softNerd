'use client'
import { useState } from 'react'
import { Printer } from 'lucide-react'
import clsx from 'clsx'
import {
  printConferencia, CONFERENCIA_FORMATOS,
  type ConferenciaItem, type ConferenciaFormato,
} from '@/lib/printConferencia'

/**
 * Botão "Imprimir conferência" com escolha de bobina (80mm/58mm) ou A4/PDF.
 * Usado no PDV (Nova Venda) e na comanda — mesma lista, mesmo papel sem valor fiscal.
 */
export default function ConferenciaButton({
  items, totalInCents, clienteNome, origem, compact = false,
}: {
  items: ConferenciaItem[]
  totalInCents: number
  clienteNome?: string | null
  origem?: string | null
  /** Versão miúda, pra cabeçalho de coluna estreita. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)

  function escolher(formato: ConferenciaFormato) {
    setOpen(false)
    printConferencia({ items, totalInCents, clienteNome, origem, formato })
  }

  if (items.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg bg-surface-700 border border-surface-500 font-semibold text-gray-300 hover:text-white hover:border-brand-500 transition-colors',
          compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        )}
        title="Lista dos itens pra conferir com o cliente — sem valor fiscal"
      >
        <Printer className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        {compact ? 'Conferência' : 'Imprimir conferência'}
      </button>

      {open && (
        <>
          {/* Fecha ao clicar fora */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl bg-surface-800 border border-surface-500 shadow-2xl overflow-hidden">
            {CONFERENCIA_FORMATOS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => escolher(f.value)}
                className="w-full px-3 py-2 text-left hover:bg-surface-700 transition-colors border-b border-surface-700 last:border-0"
              >
                <p className="text-xs font-semibold text-white">{f.label}</p>
                <p className="text-[10px] text-gray-500">{f.hint}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
