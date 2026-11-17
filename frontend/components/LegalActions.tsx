'use client'
import { useState } from 'react'
import { Printer, Copy, Check } from 'lucide-react'

export function LegalActions() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const el = document.querySelector('main')
    const text = el ? (el as HTMLElement).innerText : ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        aria-label="Salvar PDF"
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
      >
        <Printer className="w-4 h-4" />
        <span className="hidden sm:inline">Salvar PDF</span>
      </button>
      <button
        onClick={handleCopy}
        aria-label={copied ? 'Copiado!' : 'Copiar texto'}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        <span className="hidden sm:inline">{copied ? 'Copiado!' : 'Copiar texto'}</span>
      </button>
    </div>
  )
}
