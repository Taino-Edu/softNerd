'use client'
import { useEffect, useState } from 'react'
import { usePreferences } from '@/hooks/usePreferences'
import { Bell, Check, Loader2, ArrowLeft, Accessibility } from 'lucide-react'
import clsx from 'clsx'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import { UserPreferences } from '@/lib/api'

const C = {
  navy: '#0C3D5A', blue: '#3EC2F2', blue2: '#1A9DD4',
  yellow: '#FFE45E', bg: '#EBF7FD', white: '#FFFFFF',
  muted: '#4D8FAC', border: 'rgba(62,194,242,0.18)',
}

const CORNERS = [
  { value: 'bottom-right', label: 'Inferior direito' },
  { value: 'bottom-left',  label: 'Inferior esquerdo' },
  { value: 'top-right',    label: 'Superior direito' },
  { value: 'top-left',     label: 'Superior esquerdo' },
] as const

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors duration-200"
      style={{ backgroundColor: value ? C.blue : '#CBD5E1' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
        style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}

export default function ClienteConfiguracoesPage() {
  const { prefs, loading, saving, update } = usePreferences()
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>('default')

  useEffect(() => {
    setBrowserPermission('Notification' in window ? Notification.permission : 'unsupported')
  }, [])

  function set<K extends keyof UserPreferences>(section: K, patch: Partial<UserPreferences[K]>) {
    update({ ...prefs, [section]: { ...prefs[section], ...patch } })
    toast.success('Salvo!', { duration: 1500 })
  }

  async function setBrowserNotifications(enabled: boolean) {
    if (!enabled) {
      set('notifications', { browserEnabled: false })
      return
    }
    if (!('Notification' in window)) {
      toast.error('Este navegador não oferece notificações.')
      return
    }
    const permission = await Notification.requestPermission()
    setBrowserPermission(permission)
    if (permission !== 'granted') {
      toast.error('Autorize as notificações nas configurações do navegador.')
      return
    }
    set('notifications', { browserEnabled: true })
  }

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: C.bg }}>
      <Toaster position="top-center" toastOptions={{
        style: { background: C.white, color: C.navy, border: `1px solid ${C.border}`, fontWeight: 600 }
      }} />

      {/* Header */}
      <header style={{ backgroundColor: C.navy }}>
        <div className="max-w-lg mx-auto px-5 pt-10 pb-6 flex items-center gap-4">
          <Link href="/cliente/perfil" className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-white font-black text-base leading-tight">Configurações</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Suas preferências pessoais</p>
          </div>
          {saving && <Loader2 className="w-4 h-4 animate-spin ml-auto" style={{ color: 'rgba(255,255,255,0.5)' }} />}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.blue }} />
        </div>
      ) : (
        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">

          {/* VLibras */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(12,61,90,0.06)' }}>
            <h2 className="font-black text-sm flex items-center gap-2" style={{ color: C.navy }}>
              <Accessibility className="w-4 h-4 text-blue-500" /> VLibras
            </h2>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold" style={{ color: C.navy }}>Ativar VLibras</p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>Tradução em Língua Brasileira de Sinais</p>
              </div>
              <Toggle value={prefs.vlibras.enabled} onChange={v => set('vlibras', { enabled: v })} />
            </div>

            {prefs.vlibras.enabled && (
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: C.muted }}>Posição na tela</p>
                <div className="grid grid-cols-2 gap-2">
                  {CORNERS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => set('vlibras', { corner: c.value })}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{
                        backgroundColor: prefs.vlibras.corner === c.value ? `${C.blue}18` : C.bg,
                        border: `1.5px solid ${prefs.vlibras.corner === c.value ? C.blue : C.border}`,
                        color: prefs.vlibras.corner === c.value ? C.blue2 : C.muted,
                      }}
                    >
                      {prefs.vlibras.corner === c.value && <Check className="w-3.5 h-3.5" />}
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notificações */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(12,61,90,0.06)' }}>
            <h2 className="font-black text-sm flex items-center gap-2" style={{ color: C.navy }}>
              <Bell className="w-4 h-4 text-amber-500" /> Notificações
            </h2>

            {[
              { key: 'soundEnabled'   as const, label: 'Sons',                    desc: 'Toca um som ao receber notificações' },
              { key: 'browserEnabled' as const, label: 'Notificações do navegador', desc: 'Alertas em segundo plano' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: C.navy }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>{desc}</p>
                </div>
                <Toggle
                  value={key === 'browserEnabled'
                    ? prefs.notifications.browserEnabled && browserPermission === 'granted'
                    : prefs.notifications.soundEnabled}
                  onChange={key === 'browserEnabled'
                    ? setBrowserNotifications
                    : v => set('notifications', { soundEnabled: v })}
                />
              </div>
            ))}
          </div>

        </main>
      )}
    </div>
  )
}
