'use client'
import Sidebar from '@/components/admin/Sidebar'
import AiChatWidget from '@/components/admin/AiChatWidget'
import KeyboardShortcutsOverlay from '@/components/admin/KeyboardShortcutsOverlay'
import TimerWidget from '@/components/TimerWidget'
import { TimerProvider } from '@/contexts/TimerContext'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useFuncionalidade } from '@/lib/useFuncionalidade'

// A renovação de sessão saiu daqui pro layout raiz (lib/sessionKeepAlive): antes só
// o painel renovava, então a área do cliente caía sozinha.
//
// O timer faz o caminho contrário: mora AQUI, e não no raiz. Montado no raiz ele
// aparecia na vitrine e na tela da mesa sempre que o admin estava logado no mesmo
// navegador. O provider vem junto de propósito — deixá-lo no raiz mantinha o
// polling e o alarme rodando fora do painel, mesmo sem o botão à vista.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Telas do painel no azul da loja (v1.53.0): a classe troca a paleta brand/roxo por variável CSS
  // (globals.css → .painel-novo), sem mexer em classe de tela nenhuma. Chave desligada = como antes.
  const telasNovas = useFuncionalidade('admin-telas-novas') !== false
  // Também no <body>: janelas abertas por portal (Nova venda, detalhe da venda...) ficam fora deste
  // wrapper no DOM e não herdariam as variáveis. Sai ao deixar o painel, pra não vazar pro site.
  useEffect(() => {
    document.body.classList.toggle('painel-novo', telasNovas)
    return () => { document.body.classList.remove('painel-novo') }
  }, [telasNovas])
  return (
    <TimerProvider>
      <div className={`flex min-h-screen bg-surface-900 ${telasNovas ? 'painel-novo' : ''}`}>
        <Sidebar />
        <main className="flex-1 overflow-auto pt-14 md:pt-0 admin-main">
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#1A1A1F', color: '#fff', border: '1px solid #2D2D36', fontSize: '14px', borderRadius: '12px' },
              success: { iconTheme: { primary: '#00F0A8', secondary: '#000' } },
              error:   { iconTheme: { primary: '#FF3B30', secondary: '#fff' } },
            }}
          />
          {children}
        </main>
        <AiChatWidget />
        <TimerWidget />
        <KeyboardShortcutsOverlay />
      </div>
    </TimerProvider>
  )
}
