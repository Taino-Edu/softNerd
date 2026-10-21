'use client'
// =============================================================================
// app/error.tsx — quando uma tela quebra (erro de JavaScript na renderização)
//
// Antes não existia: o Next mostrava a página branca "Application error: a client-side
// exception has occurred" — pro cliente, "o sistema caiu" — e ninguém ficava sabendo.
// Agora: tela amigável com "tentar de novo" e o erro vai pro Vigia (Alertas do sistema).
// =============================================================================
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { reportarErro } from '@/lib/reportarErro'

export default function ErroNaTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportarErro(error.message, [error.digest && `digest ${error.digest}`, error.stack].filter(Boolean).join('\n'))
  }, [error])

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="card max-w-md w-full text-center space-y-4">
        <AlertTriangle className="w-10 h-10 mx-auto txt-alerta" />
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-white">Algo deu errado nesta tela</h1>
          <p className="text-sm text-gray-400">
            Já avisamos a loja. Toque em &quot;Tentar de novo&quot; — na maioria das vezes resolve.
            Sua comanda, seus pedidos e seu login continuam salvos.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={reset} className="btn-primary justify-center">
            <RotateCcw className="w-4 h-4" /> Tentar de novo
          </button>
          <Link href="/" className="btn-secondary justify-center">
            <Home className="w-4 h-4" /> Ir pro início
          </Link>
        </div>
      </div>
    </div>
  )
}
