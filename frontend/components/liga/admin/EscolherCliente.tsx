'use client'
// Busca de cliente da Central da Liguinha: digita nome/CPF/WhatsApp, escolhe da lista.
// Mostra o fim do WhatsApp pra separar homônimos sem expor o número inteiro.
import { useEffect, useState } from 'react'
import { Loader2, Search, UserCheck } from 'lucide-react'
import { userApi, UserSummary } from '@/lib/api'

export function finalWhats(w?: string | null) {
  const d = (w ?? '').replace(/\D/g, '')
  return d.length >= 4 ? `zap …${d.slice(-4)}` : null
}

export default function EscolherCliente({ inicial = '', onEscolher, autoFocus = false, placeholder = 'Buscar cliente por nome, CPF ou WhatsApp' }: {
  inicial?: string; onEscolher: (c: UserSummary) => void; autoFocus?: boolean; placeholder?: string
}) {
  const [termo, setTermo] = useState(inicial)
  const [achados, setAchados] = useState<UserSummary[] | null>(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) { setAchados(null); return }
    let vivo = true
    setBuscando(true)
    const espera = setTimeout(() => {
      userApi.list(t, 'Customer')
        .then(r => { if (vivo) setAchados(r.data.slice(0, 8)) })
        .catch(() => { if (vivo) setAchados([]) })
        .finally(() => { if (vivo) setBuscando(false) })
    }, 300)
    return () => { vivo = false; clearTimeout(espera) }
  }, [termo])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={termo} onChange={e => setTermo(e.target.value)} autoFocus={autoFocus}
          placeholder={placeholder} className="input w-full pl-9" aria-label="Buscar cliente" />
        {buscando && <Loader2 className="w-4 h-4 text-brand-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>
      {achados && achados.length > 0 && (
        <ul className="rounded-xl border border-surface-500 divide-y divide-surface-500 overflow-hidden">
          {achados.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => onEscolher(c)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-700">
                <UserCheck className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-white truncate">{c.name}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  {[finalWhats(c.whatsApp), c.email ? 'tem login' : 'sem login'].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {achados && achados.length === 0 && !buscando && (
        <p className="text-xs text-gray-500">Nenhum cliente com esse nome.</p>
      )}
    </div>
  )
}
