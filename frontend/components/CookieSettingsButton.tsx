'use client'
// =============================================================================
// CookieSettingsButton.tsx — Reabre o banner de cookies já em "Personalizar".
// Fica no rodapé: sem ele, quem decidiu uma vez não teria como mudar de ideia.
// =============================================================================

import { Settings2 } from 'lucide-react'
import { OPEN_SETTINGS_EVENT } from '@/lib/cookieConsent'

export default function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
      className={className ?? 'inline-flex items-center gap-1.5 hover:text-white transition-colors'}
    >
      <Settings2 className="w-3.5 h-3.5" /> Preferências de cookies
    </button>
  )
}
