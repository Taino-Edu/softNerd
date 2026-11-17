'use client'
// =============================================================================
// AvisosDaLoja — sininho do painel (chave "avisos-pra-equipe", v1.88.0)
//
// Pré-venda nova, fila de espera e Pix pago de pedido do site já viravam notificação no banco,
// mas o painel não tinha onde ler: só uma bolinha em Mensageria. O operador só sabia do pedido
// abrindo a tela. Aqui: o sininho com o número de não lidos, a lista ao clicar e, quando chega
// aviso novo com o painel aberto, um aviso no canto da tela com "Abrir".
//
// O sininho aparece duas vezes (barra do celular e menu do computador), mas a consulta é uma só:
// o estado mora no módulo e os dois só escutam — senão o aviso de tela saía duplicado.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Bell, CheckCheck, X } from 'lucide-react'
import { notificationsApi, AppNotification } from '@/lib/api'

const INTERVALO_MS = 30_000

// ── Estado compartilhado ─────────────────────────────────────────────────────
let naoLidos = 0
let maisRecenteVisto = 0  // createdAt (ms) do aviso mais novo já conhecido
let iniciado = false
let timer: ReturnType<typeof setInterval> | null = null
const ouvintes = new Set<(n: number) => void>()
let abrir: ((link?: string) => void) | null = null

function publicar(n: number) {
  naoLidos = n
  ouvintes.forEach(f => f(n))
  // "(2) Painel" na aba: dá pra ver de outra aba que chegou pedido
  if (typeof document !== 'undefined') {
    document.title = document.title.replace(/^\(\d+\)\s*/, '')
    if (n > 0) document.title = `(${n}) ${document.title}`
  }
}

async function consultar() {
  try {
    const { data } = await notificationsApi.unreadCount()
    // A primeira consulta só marca o ponto de partida: o que já estava lá não vira aviso de tela.
    // Depois, a lista é olhada em toda volta (são no máximo 50): comparar só o número de não lidos
    // perdia o pedido novo quando, no mesmo intervalo, outro aviso era lido em outra aba/aparelho.
    await avisarNovos(iniciado)
    iniciado = true
    publicar(data.count)
  } catch { /* sem rede: tenta na próxima volta */ }
}

async function avisarNovos(mostrar: boolean) {
  const { data } = await notificationsApi.list()
  const ms = (n: AppNotification) => Date.parse(n.createdAt) || 0
  const novos = data.filter(n => !n.isRead && ms(n) > maisRecenteVisto)
  maisRecenteVisto = data.reduce((m, n) => Math.max(m, ms(n)), maisRecenteVisto)
  if (mostrar) novos.slice(0, 3).forEach(mostrarNaTela)
}

function mostrarNaTela(n: AppNotification) {
  toast.custom(t => (
    <div className={clsx('w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-surface-500 bg-surface-800 shadow-xl p-3 flex gap-3 transition-opacity',
      t.visible ? 'opacity-100' : 'opacity-0')}>
      <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
        <Bell className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{n.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-3">{n.body}</p>
        {n.link && (
          <button onClick={() => { toast.dismiss(t.id); abrir?.(n.link); notificationsApi.markRead(n.id).then(consultar).catch(() => {}) }}
            className="mt-2 text-xs font-bold text-brand-400 hover:underline">
            Abrir
          </button>
        )}
      </div>
      <button onClick={() => toast.dismiss(t.id)} className="self-start text-gray-500 hover:text-gray-300" aria-label="Fechar aviso">
        <X className="w-4 h-4" />
      </button>
    </div>
  ), { id: `aviso-${n.id}`, duration: 45_000, position: 'top-right' }) // no balcão ninguém olha a tela o tempo todo
}

function useNaoLidos() {
  const [n, setN] = useState(naoLidos)
  useEffect(() => {
    ouvintes.add(setN)
    if (!timer) {
      consultar()
      timer = setInterval(consultar, INTERVALO_MS)
    }
    return () => {
      ouvintes.delete(setN)
      if (ouvintes.size === 0 && timer) { clearInterval(timer); timer = null }
    }
  }, [])
  return n
}

function quando(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
}

// ── Sininho ──────────────────────────────────────────────────────────────────
/** lado: pra onde a lista abre — "direita" no menu do computador, "baixo" na barra do celular. */
export default function AvisosDaLoja({ lado = 'direita' }: { lado?: 'direita' | 'baixo' }) {
  const router = useRouter()
  const n = useNaoLidos()
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<AppNotification[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    abrir = link => { if (link) router.push(link) }
  }, [router])

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  async function alternar() {
    const abrindo = !aberto
    setAberto(abrindo)
    if (abrindo) {
      try { setLista((await notificationsApi.list()).data) } catch { setLista([]) }
    }
  }

  async function abrirAviso(a: AppNotification) {
    setAberto(false)
    if (!a.isRead) { try { await notificationsApi.markRead(a.id) } catch {} consultar() }
    if (a.link) router.push(a.link)
  }

  async function lerTodas() {
    try { await notificationsApi.markAllRead() } catch {}
    setLista(l => l?.map(a => ({ ...a, isRead: true })) ?? null)
    consultar()
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={alternar}
        title={n > 0 ? `${n} aviso(s) novo(s)` : 'Avisos'}
        aria-label={n > 0 ? `Avisos: ${n} novo(s)` : 'Avisos'}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/15"
        style={{ color: '#FFFFFF' }}>
        <Bell className="w-5 h-5" />
        {n > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-[18px] text-center"
            style={{ backgroundColor: '#FFE45E', color: '#3D2E00' }}>
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>

      {aberto && (
        <div className={clsx(
          'z-[60] w-[340px] max-w-[calc(100vw-1rem)] rounded-2xl border border-surface-500 bg-surface-800 shadow-2xl overflow-hidden',
          lado === 'direita' ? 'absolute left-0 top-full mt-2' : 'fixed right-2 top-14',
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-500">
            <p className="text-sm font-black text-white">Avisos da loja</p>
            {lista?.some(a => !a.isRead) && (
              <button onClick={lerTodas} className="flex items-center gap-1 text-xs font-bold text-brand-400 hover:underline">
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todos como lidos
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {lista === null && <p className="px-4 py-6 text-sm text-gray-400 text-center">Carregando…</p>}
            {lista?.length === 0 && (
              <p className="px-4 py-8 text-sm text-gray-400 text-center">Nada por aqui. Pedido e Pix do site aparecem aqui assim que chegam.</p>
            )}
            {lista?.map(a => (
              <button key={a.id} onClick={() => abrirAviso(a)}
                className={clsx('w-full text-left px-4 py-3 border-b border-surface-500 last:border-b-0 flex gap-3 transition-colors hover:bg-surface-700',
                  !a.isRead && 'bg-surface-700')}>
                <span className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0', a.isRead ? 'bg-transparent' : 'bg-amber-400')} />
                <span className="flex-1 min-w-0">
                  <span className={clsx('block text-sm text-white', !a.isRead && 'font-bold')}>{a.title}</span>
                  <span className="block text-xs text-gray-400 mt-0.5 line-clamp-2">{a.body}</span>
                  <span className="block text-[11px] text-gray-500 mt-1">{quando(a.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
