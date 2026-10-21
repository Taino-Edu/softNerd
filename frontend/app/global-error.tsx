'use client'
// =============================================================================
// app/global-error.tsx — quando até o layout raiz quebra (o app/error.tsx não alcança)
// Substitui a página inteira, então tem o próprio <html> e estilo mínimo embutido.
// =============================================================================
import { useEffect } from 'react'
import { reportarErro } from '@/lib/reportarErro'

export default function ErroGeral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportarErro(error.message, ['layout raiz', error.digest && `digest ${error.digest}`, error.stack].filter(Boolean).join('\n'))
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0F1B33', color: '#FFFFFF', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Algo deu errado</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.5 }}>
            Já avisamos a loja. Tente de novo — sua comanda, seus pedidos e seu login continuam salvos.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={reset} style={{ background: '#3EC2F2', color: '#0F1B33', border: 0, borderRadius: 12,
              padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>Tentar de novo</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12,
              padding: '10px 16px', fontWeight: 700, textDecoration: 'none' }}>Ir pro início</a>
          </div>
        </div>
      </body>
    </html>
  )
}
