'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Keyboard } from 'lucide-react'

interface Shortcut {
  key: string
  label: string
  description: string
  category: string
}

const SHORTCUTS: Shortcut[] = [
  { key: 'd', label: 'D', description: 'Painel Geral (Dashboard)',    category: 'Navegação' },
  { key: 'p', label: 'P', description: 'Frente de Caixa (PDV)',       category: 'Navegação' },
  { key: 'e', label: 'E', description: 'Estoque',                     category: 'Navegação' },
  { key: 'u', label: 'U', description: 'Clientes / Usuários',         category: 'Navegação' },
  { key: 'c', label: 'C', description: 'Crediário',                   category: 'Navegação' },
  { key: 'f', label: 'F', description: 'Financeiro',                  category: 'Navegação' },
  { key: 'r', label: 'R', description: 'Relatórios',                  category: 'Navegação' },
  { key: 'a', label: 'A', description: 'Campeonatos',                 category: 'Navegação' },
  { key: '?', label: '?', description: 'Mostrar / esconder esta ajuda', category: 'Geral'    },
  { key: 'Escape', label: 'Esc', description: 'Fechar modal ou painel aberto', category: 'Geral' },
]

const NAV_MAP: Record<string, string> = {
  d: '/admin/dashboard',
  p: '/admin/venda-avulsa',
  e: '/admin/estoque',
  u: '/admin/usuarios',
  c: '/admin/crediario',
  f: '/admin/financeiro',
  r: '/admin/relatorios',
  a: '/admin/campeonatos',
}

export const SIDEBAR_SHORTCUT_KEYS: Record<string, string> = {
  '/admin/dashboard':    'D',
  '/admin/venda-avulsa': 'P',
  '/admin/estoque':      'E',
  '/admin/usuarios':     'U',
  '/admin/crediario':    'C',
  '/admin/financeiro':   'F',
  '/admin/relatorios':   'R',
  '/admin/campeonatos':  'A',
}

export default function KeyboardShortcutsOverlay() {
  const router  = useRouter()
  const [open, setOpen] = useState(false)

  const handleKey = useCallback((e: KeyboardEvent) => {
    const target   = e.target as HTMLElement
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
                     || target.isContentEditable

    // ? — toggle overlay (funciona mesmo digitando, para não perder)
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      setOpen(v => !v)
      return
    }

    // Esc — fecha overlay
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }

    // Atalhos de navegação — apenas fora de campos de texto
    if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return

    const dest = NAV_MAP[e.key.toLowerCase()]
    if (dest) {
      e.preventDefault()
      router.push(dest)
    }
  }, [router])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!open) return null

  const categories = [...new Set(SHORTCUTS.map(s => s.category))]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Atalhos de Teclado</h3>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2">{cat}</p>
              <div className="space-y-0.5">
                {SHORTCUTS.filter(s => s.category === cat).map(s => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-4 py-1.5 px-2 rounded-lg hover:bg-surface-700 transition-colors"
                  >
                    <span className="text-sm text-gray-300">{s.description}</span>
                    <kbd className="shrink-0 text-[11px] text-gray-200 bg-surface-700 border border-surface-500 rounded-md px-2 py-0.5 font-mono font-bold min-w-[28px] text-center">
                      {s.label}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[11px] text-gray-600 text-center pt-1 border-t border-surface-700">
            Atalhos de navegação só funcionam quando nenhum campo de texto está focado
          </p>
        </div>
      </div>
    </div>
  )
}
