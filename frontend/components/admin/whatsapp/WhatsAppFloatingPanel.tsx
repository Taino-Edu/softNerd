'use client'

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { ExternalLink, GripHorizontal, MessageCircle, Minus, Settings2, X } from 'lucide-react'
import WhatsAppInbox from './WhatsAppInbox'
import { whatsappAdminApi } from '@/lib/api'

const STORAGE_KEY = 'softnerd-whatsapp-panel-v1'
const DEFAULT = { x: 24, y: 72, width: 420, height: 620, glass: 94 }

type PanelState = typeof DEFAULT

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(value, max)) }

export default function WhatsAppFloatingPanel() {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [panel, setPanel] = useState<PanelState>(DEFAULT)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setPanel({ ...DEFAULT, ...JSON.parse(saved) })
    } catch { }
  }, [])

  useEffect(() => {
    let mounted = true
    const poll = async () => {
      try {
        const { data } = await whatsappAdminApi.conversations('', true)
        if (mounted) setUnread(data.reduce((sum, item) => sum + item.unreadCount, 0))
      } catch { }
    }
    poll()
    const timer = window.setInterval(poll, 15_000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!open || !panelRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (!rect || rect.width < 340 || rect.height < 420) return
      setPanel(current => {
        const next = { ...current, width: Math.round(rect.width), height: Math.round(rect.height) }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { }
        return next
      })
    })
    observer.observe(panelRef.current)
    return () => observer.disconnect()
  }, [open])

  function save(next: PanelState) {
    setPanel(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { }
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button,input')) return
    const startX = event.clientX, startY = event.clientY
    const origin = panel
    dragging.current = false

    function move(e: PointerEvent) {
      const dx = e.clientX - startX, dy = e.clientY - startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging.current = true
      if (!dragging.current) return
      setPanel(current => ({ ...current,
        x: clamp(origin.x + dx, 8, window.innerWidth - current.width - 8),
        y: clamp(origin.y + dy, 8, window.innerHeight - current.height - 8),
      }))
    }

    function up() {
      setPanel(current => {
        const next = {
          ...current,
          x: current.x + current.width / 2 < window.innerWidth / 2 ? 12 : window.innerWidth - current.width - 12,
          y: current.y + current.height / 2 < window.innerHeight / 2 ? 12 : window.innerHeight - current.height - 12,
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { }
        return next
      })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} aria-label="Abrir atendimento do WhatsApp"
      className="fixed z-40 right-5 bottom-24 w-14 h-14 rounded-2xl bg-emerald-500 text-black shadow-2xl grid place-items-center hover:scale-105 transition-transform">
      <MessageCircle size={26} />
      {unread > 0 && <span className="absolute -top-2 -right-2 min-w-6 h-6 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold grid place-items-center">{unread > 99 ? '99+' : unread}</span>}
    </button>
  )

  return (
    <div ref={panelRef}
      className="fixed z-[70] min-w-[340px] min-h-[420px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] resize overflow-hidden rounded-2xl border border-emerald-500/30 shadow-2xl flex flex-col"
      style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height,
        backgroundColor: `rgba(15,17,21,${panel.glass / 100})`, backdropFilter: 'blur(14px)' }}>
      <div onPointerDown={startDrag} className="h-11 px-3 shrink-0 flex items-center gap-2 cursor-grab active:cursor-grabbing border-b border-surface-500 bg-surface-900/85 select-none touch-none">
        <GripHorizontal size={16} className="text-gray-600" />
        <MessageCircle size={17} className="text-emerald-400" />
        <span className="text-sm font-semibold text-white flex-1">WhatsApp</span>
        <button onClick={() => setSettingsOpen(value => !value)} title="Transparência" className="p-1.5 text-gray-500 hover:text-white"><Settings2 size={15} /></button>
        <button onClick={() => window.open('/admin/whatsapp', 'softnerd-whatsapp', 'popup,width=1180,height=760,resizable=yes')}
          title="Abrir em janela" className="p-1.5 text-gray-500 hover:text-white"><ExternalLink size={15} /></button>
        <button onClick={() => setOpen(false)} title="Minimizar" className="p-1.5 text-gray-500 hover:text-white"><Minus size={16} /></button>
        <button onClick={() => { setOpen(false); setUnread(0) }} title="Fechar" className="p-1.5 text-gray-500 hover:text-white"><X size={16} /></button>
      </div>
      {settingsOpen && (
        <div className="px-3 py-2 border-b border-surface-500 bg-surface-900/90 flex items-center gap-3">
          <span className="text-[11px] text-gray-400">Fundo</span>
          <input type="range" min="55" max="100" value={panel.glass}
            onChange={e => save({ ...panel, glass: Number(e.target.value) })} className="flex-1 accent-emerald-500" />
          <span className="text-[11px] text-gray-500 w-8">{panel.glass}%</span>
        </div>
      )}
      <div className="flex-1 min-h-0 p-1.5"><WhatsAppInbox compact onUnreadChange={setUnread} /></div>
    </div>
  )
}
