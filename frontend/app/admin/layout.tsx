'use client'
import Sidebar from '@/components/admin/Sidebar'
import AiChatWidget from '@/components/admin/AiChatWidget'
import KeyboardShortcutsOverlay from '@/components/admin/KeyboardShortcutsOverlay'
import WhatsAppFloatingPanel from '@/components/admin/whatsapp/WhatsAppFloatingPanel'
import TimerWidget from '@/components/TimerWidget'
import { Toaster } from 'react-hot-toast'

// A renovação de sessão saiu daqui pro layout raiz (lib/sessionKeepAlive): antes só
// o painel renovava, então a área do cliente caía sozinha. O TimerWidget voltou pro
// painel: montado no layout raiz, ele aparecia na vitrine e na tela da mesa sempre
// que o admin estava logado no mesmo navegador.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
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
      {/* Timer de torneio: acompanha o operador nas telas do painel. Fora daqui
          ele aparecia na vitrine pro cliente quando o admin estava logado. */}
      <TimerWidget />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
