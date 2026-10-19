'use client'
// Janela (modal) da Central da Liguinha — mesmo visual das janelas do painel (card + fundo escurecido).
import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

export default function Janela({ titulo, icone, onFechar, children, largura = 'max-w-lg' }: {
  titulo: string; icone?: ReactNode; onFechar: () => void; children: ReactNode; largura?: string
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onFechar])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo}
        className={`card w-full ${largura} animate-bounce-in max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">{icone}{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar"><X className="w-5 h-5 text-gray-500 hover:text-gray-300" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
