'use client'
import { useEffect, useRef, useState } from 'react'
import { notificationsApi, pushApi, AppNotification } from '@/lib/api'
import { Bell, X, CheckCheck, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { usePreferences } from '@/hooks/usePreferences'

const NAVY   = '#0C3D5A'
const BLUE   = '#3EC2F2'
const MUTED  = '#4D8FAC'
const BORDER = 'rgba(12,61,90,0.12)'

function urlBase64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function NotificationBell() {
  const { prefs, loading } = usePreferences()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open,   setOpen]   = useState(false)
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Polling unread count a cada 30s
  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, 30_000)
    return () => clearInterval(id)
  }, [])

  // A preferência agora é efetiva: liga a subscrição apenas com permissão já
  // concedida e remove a subscrição quando o usuário desliga a opção.
  useEffect(() => {
    if (loading) return
    if (prefs.notifications.browserEnabled) registerPush()
    else unregisterPush()
  }, [loading, prefs.notifications.browserEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function fetchCount() {
    try {
      const r = await notificationsApi.unreadCount()
      setUnread(r.data.count)
    } catch {}
  }

  async function openPanel() {
    setOpen(o => !o)
    if (!open) {
      try {
        const r = await notificationsApi.list()
        setNotifications(r.data)
      } catch {}
    }
  }

  async function markRead(id: string) {
    await notificationsApi.markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    setUnread(u => Math.max(0, u - 1))
  }

  async function markAllRead() {
    await notificationsApi.markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnread(0)
  }

  async function remove(id: string) {
    await notificationsApi.remove(id)
    const wasUnread = notifications.find(n => n.id === id)?.isRead === false
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (wasUnread) setUnread(u => Math.max(0, u - 1))
  }

  async function registerPush() {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const reg  = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const { data } = await pushApi.publicKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      })
      const json = sub.toJSON()
      await pushApi.subscribe({
        endpoint: sub.endpoint,
        p256dh:   json.keys?.p256dh   ?? '',
        auth:     json.keys?.auth     ?? '',
      })
    } catch {
      // Push não disponível ou negado pelo usuário — sem impacto
    }
  }

  async function unregisterPush() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (!sub) return
      await pushApi.unsubscribe(sub.endpoint).catch(() => {})
      await sub.unsubscribe()
    } catch {
      // Preferência já foi salva; uma subscrição inexistente não deve quebrar a tela.
    }
  }

  function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60)    return 'agora'
    if (diff < 3600)  return `${Math.floor(diff / 60)}min`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  return (
    <div className="relative" ref={ref}>
      {/* Botão do sino */}
      <button
        onClick={openPanel}
        className="relative p-2 rounded-xl transition-colors"
        style={{ color: 'rgba(255,255,255,0.75)' }}
        title="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown — fundo branco sólido, funciona em qualquer contexto */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-2xl z-50 overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            boxShadow: '0 20px 60px rgba(12,61,90,0.18)',
          }}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORDER }}>
            <span className="font-black text-sm" style={{ color: NAVY }}>
              Notificações{unread > 0 && <span className="text-red-500 ml-1">({unread})</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-semibold transition-colors"
                style={{ color: MUTED }}
              >
                <CheckCheck className="w-3.5 h-3.5" /> Todas lidas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: NAVY }} />
                <p className="text-sm font-bold" style={{ color: MUTED }}>Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className="flex gap-3 px-4 py-3 border-b transition-colors"
                  style={{
                    borderColor: BORDER,
                    backgroundColor: !n.isRead ? `rgba(62,194,242,0.06)` : 'transparent',
                  }}
                >
                  {/* Indicador não lida */}
                  <div className="mt-1.5 shrink-0">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: !n.isRead ? BLUE : 'transparent' }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black leading-snug" style={{ color: NAVY }}>{n.title}</p>
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: MUTED }}>{n.body}</p>
                    {n.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.imageUrl} alt=""
                        className="mt-2 rounded-lg w-full max-h-32 object-cover"
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px]" style={{ color: MUTED }}>{timeAgo(n.createdAt)}</span>
                      {n.link && (
                        <Link
                          href={n.link}
                          onClick={() => { markRead(n.id); setOpen(false) }}
                          className="text-[10px] font-bold flex items-center gap-0.5"
                          style={{ color: BLUE }}
                        >
                          Ver <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      )}
                      {!n.isRead && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="text-[10px] font-semibold"
                          style={{ color: MUTED }}
                        >
                          Marcar lida
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => remove(n.id)}
                    className="shrink-0 p-1 rounded-lg mt-0.5 transition-colors"
                    style={{ color: MUTED }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
