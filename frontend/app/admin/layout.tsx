'use client'
import Sidebar from '@/components/admin/Sidebar'
import AiChatWidget from '@/components/admin/AiChatWidget'
import KeyboardShortcutsOverlay from '@/components/admin/KeyboardShortcutsOverlay'
import WhatsAppFloatingPanel from '@/components/admin/whatsapp/WhatsAppFloatingPanel'
import TimerWidget from '@/components/TimerWidget'
import { TimerProvider } from '@/contexts/TimerContext'
import { Toaster } from 'react-hot-toast'

// A renovação de sessão saiu daqui pro layout raiz (lib/sessionKeepAlive): antes só
// o painel renovava, então a área do cliente caía sozinha.
//
// O timer faz o caminho contrário: mora AQUI, e não no raiz. Montado no raiz ele
// aparecia na vitrine e na tela da mesa sempre que o admin estava logado no mesmo
// navegador. O provider vem junto de propósito — deixá-lo no raiz mantinha o
// polling e o alarme rodando fora do painel, mesmo sem o botão à vista.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <TimerProvider>
      <div className="flex min-h-screen bg-surface-900">
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
        <WhatsAppFloatingPanel />
        <TimerWidget />
        <KeyboardShortcutsOverlay />
      </div>
    </TimerProvider>
  )
}
