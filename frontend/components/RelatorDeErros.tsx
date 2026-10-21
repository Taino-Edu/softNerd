'use client'
// Erros soltos (fora da renderização: cliques, promessas, timers) também vão pro Vigia.
// Os da renderização caem no app/error.tsx, que mostra a tela amigável e reporta.
import { useEffect } from 'react'
import { reportarErro } from '@/lib/reportarErro'

export default function RelatorDeErros() {
  useEffect(() => {
    const erro = (e: ErrorEvent) =>
      reportarErro(e.message || String(e.error), e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`)
    const promessa = (e: PromiseRejectionEvent) => {
      const r = e.reason
      // Erro de API (axios) já tem tratamento na tela e não é "a tela quebrou"
      if (r?.isAxiosError) return
      reportarErro(r?.message ?? String(r), r?.stack)
    }
    window.addEventListener('error', erro)
    window.addEventListener('unhandledrejection', promessa)
    return () => {
      window.removeEventListener('error', erro)
      window.removeEventListener('unhandledrejection', promessa)
    }
  }, [])
  return null
}
