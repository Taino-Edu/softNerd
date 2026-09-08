'use client'
import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { setOptionalItem } from '@/lib/cookieConsent'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled]           = useState(false)
  const [visible, setVisible]               = useState(false)
  // Persiste a recusa no localStorage — não volta a aparecer até o usuário limpar
  const [dismissed, setDismissed]           = useState(() => {
    try { return localStorage.getItem('pwa-dismissed') === '1' } catch { return false }
  })

  useEffect(() => {
    // Já instalado como PWA — não mostra
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    // Usuário já recusou antes — não mostra
    if (localStorage.getItem('pwa-dismissed') === '1') return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)

      // Auto-oculta após 12 segundos
      const timer   = setTimeout(() => setVisible(false), 12000)
      const cleanup = setTimeout(() => setDeferredPrompt(null), 12350)
      return () => { clearTimeout(timer); clearTimeout(cleanup) }
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (installed || dismissed || !deferredPrompt) return null

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    setVisible(false)
    setTimeout(() => {
      setDismissed(true)
      setOptionalItem('pwa-dismissed', '1')
    }, 350)
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-[#6C3FC5] text-white text-sm font-semibold pl-4 pr-2 py-2.5 rounded-2xl shadow-xl shadow-purple-900/40 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <button onClick={handleInstall} className="flex items-center gap-2 hover:opacity-90 active:scale-95 transition-transform">
        <Download className="w-4 h-4" />
        Instalar App
      </button>
      <button
        onClick={handleDismiss}
        className="ml-1 p-1 rounded-lg hover:bg-white/20 transition-colors"
        title="Fechar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
