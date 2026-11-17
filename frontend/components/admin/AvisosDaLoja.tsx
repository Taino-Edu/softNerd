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
//
// v1.89.0 — botão direito (ou "⋯") num aviso: Ir até, Marcar como lida, Ignorar o tipo e Excluir.
// "Ignorar" silencia o TIPO (o começo do título antes dos dois-pontos, ex. "Fila de espera") nas
// preferências da pessoa: o aviso continua na lista, mas chega lido, sem aviso de tela e sem push
// (o servidor também respeita — ver EquipeDaLoja). Dá pra voltar a avisar no rodapé da lista.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { ArrowRight, Bell, BellOff, Check, CheckCheck, MoreHorizontal, Trash2, X } from 'lucide-react'
import { notificationsApi, AppNotification } from '@/lib/api'
import { usePreferences } from '@/hooks/usePreferences'

const INTERVALO_MS = 30_000

/** "Fila de espera: Ana" → "Fila de espera" (igual ao EquipeDaLoja.TipoDoAviso do servidor). */
export function tipoDoAviso(titulo: string) {
  const i = titulo.indexOf(':')
  return (i > 0 ? titulo.slice(0, i) : titulo).trim()
}

// ── Estado compartilhado ─────────────────────────────────────────────────────
let naoLidos = 0
let maisRecenteVisto = 0  // createdAt (ms) do aviso mais novo já conhecido
let iniciado = false
let timer: ReturnType<typeof setInterval> | null = null
const ouvintes = new Set<(n: number) => void>()
let abrir: ((link?: string) => void) | null = null
let silenciados = new Set<string>()           // tipos ignorados (minúsculo), vindos das preferências
let ignorar: ((tipo: string) => void) | null = null

const silenciado = (n: AppNotification) => silenciados.has(tipoDoAviso(n.title).toLowerCase())

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
    // A lista é olhada em toda volta (são no máximo 50): comparar só o número de não lidos perdia
    // o pedido novo quando, no mesmo intervalo, outro aviso era lido em outra aba/aparelho.
    // A primeira volta só marca o ponto de partida: o que já estava lá não vira aviso de tela.
    await olharLista(iniciado)
    iniciado = true
    const { data } = await notificationsApi.unreadCount()
    publicar(data.count)
  } catch { /* sem rede: tenta na próxima volta */ }
}

async function olharLista(mostrar: boolean) {
  const { data } = await notificationsApi.list()
  const ms = (n: AppNotification) => Date.parse(n.createdAt) || 0
  const novos = data.filter(n => !n.isRead && ms(n) > maisRecenteVisto)
  maisRecenteVisto = data.reduce((m, n) => Math.max(m, ms(n)), maisRecenteVisto)
  // Tipo ignorado que chegou não lido (aviso de fora da equipe, ou de antes de ignorar): lê sem avisar
  await Promise.all(data.filter(n => !n.isRead && silenciado(n)).map(n => notificationsApi.markRead(n.id).catch(() => {})))
  if (mostrar) novos.filter(n => !silenciado(n)).slice(0, 3).forEach(mostrarNaTela)
}

function mostrarNaTela(n: AppNotification) {
  const tipo = tipoDoAviso(n.title)
  toast.custom(t => (
    <div className={clsx('w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-surface-500 bg-surface-800 shadow-xl p-3 flex gap-3 transition-opacity',
      t.visible ? 'opacity-100' : 'opacity-0')}>
      <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
        <Bell className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{n.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-3">{n.body}</p>
        <div className="mt-2 flex items-center gap-4">
          {n.link && (
            <button onClick={() => { toast.dismiss(t.id); abrir?.(n.link); notificationsApi.markRead(n.id).then(consultar).catch(() => {}) }}
              className="text-xs font-bold text-brand-400 hover:underline">
              Abrir
            </button>
          )}
          <button onClick={() => { toast.dismiss(t.id); ignorar?.(tipo) }}
            title={`Parar de avisar "${tipo}"`}
            className="text-xs font-bold text-gray-400 hover:text-gray-200 hover:underline">
            Ignorar este tipo
          </button>
        </div>
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

type MenuDoAviso = { x: number; y: number; aviso: AppNotification }

// ── Sininho ──────────────────────────────────────────────────────────────────
/** lado: pra onde a lista abre — "direita" no menu do computador, "baixo" na barra do celular. */
export default function AvisosDaLoja({ lado = 'direita' }: { lado?: 'direita' | 'baixo' }) {
  const router = useRouter()
  const n = useNaoLidos()
  const { prefs, update } = usePreferences()
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<AppNotification[] | null>(null)
  const [menu, setMenu] = useState<MenuDoAviso | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const ignorados = prefs.notifications.silenciados ?? []

  // As preferências moram no contexto; o módulo (aviso de tela) lê daqui
  useEffect(() => {
    silenciados = new Set(ignorados.map(t => t.toLowerCase()))
  }, [ignorados])

  function salvarIgnorados(proximos: string[]) {
    update({ notifications: { ...prefs.notifications, silenciados: proximos } })
    silenciados = new Set(proximos.map(t => t.toLowerCase()))
  }

  async function ignorarTipo(tipo: string) {
    if (!ignorados.some(t => t.toLowerCase() === tipo.toLowerCase())) salvarIgnorados([...ignorados, tipo])
    // O que já está não lido desse tipo para de contar agora
    const atual = lista ?? (await notificationsApi.list().then(r => r.data).catch(() => [] as AppNotification[]))
    const doTipo = atual.filter(a => !a.isRead && tipoDoAviso(a.title).toLowerCase() === tipo.toLowerCase())
    await Promise.all(doTipo.map(a => notificationsApi.markRead(a.id).catch(() => {})))
    setLista(l => l?.map(a => doTipo.some(d => d.id === a.id) ? { ...a, isRead: true } : a) ?? null)
    toast.success(`"${tipo}" não vai mais apitar. Dá pra voltar no fim da lista do sininho.`)
    consultar()
  }

  function voltarAAvisar(tipo: string) {
    salvarIgnorados(ignorados.filter(t => t.toLowerCase() !== tipo.toLowerCase()))
  }

  useEffect(() => {
    abrir = link => { if (link) router.push(link) }
  }, [router])

  useEffect(() => {
    ignorar = tipo => { ignorarTipo(tipo) }
  })

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      const alvo = e.target as Node
      if (menuRef.current?.contains(alvo)) return
      setMenu(null)
      if (ref.current && !ref.current.contains(alvo)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Esc fecha primeiro o menu do aviso; o segundo Esc fecha a lista
      setMenu(m => { if (!m) setAberto(false); return null })
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  async function alternar() {
    const abrindo = !aberto
    setAberto(abrindo)
    setMenu(null)
    if (abrindo) {
      try { setLista((await notificationsApi.list()).data) } catch { setLista([]) }
    }
  }

  async function abrirAviso(a: AppNotification) {
    setAberto(false)
    setMenu(null)
    if (!a.isRead) { try { await notificationsApi.markRead(a.id) } catch {} consultar() }
    if (a.link) router.push(a.link)
  }

  async function marcarLida(a: AppNotification) {
    setMenu(null)
    try { await notificationsApi.markRead(a.id) } catch {}
    setLista(l => l?.map(x => x.id === a.id ? { ...x, isRead: true } : x) ?? null)
    consultar()
  }

  async function excluir(a: AppNotification) {
    setMenu(null)
    try { await notificationsApi.remove(a.id) } catch { toast.error('Não deu pra excluir o aviso.'); return }
    setLista(l => l?.filter(x => x.id !== a.id) ?? null)
    consultar()
  }

  async function lerTodas() {
    try { await notificationsApi.markAllRead() } catch {}
    setLista(l => l?.map(a => ({ ...a, isRead: true })) ?? null)
    consultar()
  }

  function abrirMenu(x: number, y: number, a: AppNotification) {
    // Preso dentro da tela (o menu tem ~230×190)
    setMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - 240)),
      y: Math.max(8, Math.min(y, window.innerHeight - 200)),
      aviso: a,
    })
  }

  const tipoDoMenu = menu ? tipoDoAviso(menu.aviso.title) : ''
  const menuIgnorado = menu ? silenciado(menu.aviso) : false

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
          // avisos-lista-celular: com a faixa do alarme no celular, a lista desce pra baixo dela (globals.css)
          lado === 'direita' ? 'absolute left-0 top-full mt-2' : 'avisos-lista-celular fixed right-2 top-14',
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-500">
            <p className="text-sm font-black text-white">Avisos da loja</p>
            {lista?.some(a => !a.isRead) && (
              <button onClick={lerTodas} className="flex items-center gap-1 text-xs font-bold text-brand-400 hover:underline">
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todos como lidos
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto" onScroll={() => setMenu(null)}>
            {lista === null && <p className="px-4 py-6 text-sm text-gray-400 text-center">Carregando…</p>}
            {lista?.length === 0 && (
              <p className="px-4 py-8 text-sm text-gray-400 text-center">Nada por aqui. Pedido e Pix do site aparecem aqui assim que chegam.</p>
            )}
            {lista?.map(a => {
              const quieto = silenciado(a)
              return (
                <div key={a.id} onContextMenu={e => { e.preventDefault(); abrirMenu(e.clientX, e.clientY, a) }}
                  className={clsx('group/aviso relative border-b border-surface-500 last:border-b-0 transition-colors hover:bg-surface-700',
                    !a.isRead && 'bg-surface-700', menu?.aviso.id === a.id && 'bg-surface-600')}>
                  <button onClick={() => abrirAviso(a)} className="w-full text-left pl-4 pr-10 py-3 flex gap-3">
                    {quieto
                      ? <BellOff className="mt-0.5 w-3.5 h-3.5 shrink-0 text-gray-500" aria-label="Tipo ignorado" />
                      : <span className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0', a.isRead ? 'bg-transparent' : 'bg-amber-400')} />}
                    <span className="flex-1 min-w-0">
                      <span className={clsx('block text-sm text-white', !a.isRead && 'font-bold')}>{a.title}</span>
                      <span className="block text-xs text-gray-400 mt-0.5 line-clamp-2">{a.body}</span>
                      <span className="block text-[11px] text-gray-500 mt-1">{quando(a.createdAt)}</span>
                    </span>
                  </button>
                  {/* Mesmo menu do botão direito, pra quem usa toque */}
                  <button onClick={e => { const r = e.currentTarget.getBoundingClientRect(); abrirMenu(r.right - 230, r.bottom + 4, a) }}
                    title="Opções do aviso" aria-label="Opções do aviso"
                    className="absolute right-2 top-2.5 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-500 md:opacity-0 md:group-hover/aviso:opacity-100 focus:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
          {ignorados.length > 0 && (
            <div className="px-4 py-2.5 border-t border-surface-500 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-500 mr-1">Ignorados:</span>
              {ignorados.map(t => (
                <button key={t} onClick={() => voltarAAvisar(t)} title={`Voltar a avisar "${t}"`}
                  className="flex items-center gap-1 text-[11px] font-bold text-gray-300 bg-surface-600 hover:bg-surface-500 rounded-full pl-2 pr-1.5 py-0.5">
                  {t} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {menu && (
        <div ref={menuRef} role="menu"
          className="fixed z-[70] w-[230px] rounded-xl border border-surface-500 bg-surface-800 shadow-2xl py-1.5 text-sm"
          style={{ left: menu.x, top: menu.y }}>
          {menu.aviso.link && (
            <button role="menuitem" onClick={() => abrirAviso(menu.aviso)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-white hover:bg-surface-700">
              <ArrowRight className="w-4 h-4 text-gray-400" /> Ir até
            </button>
          )}
          {!menu.aviso.isRead && (
            <button role="menuitem" onClick={() => marcarLida(menu.aviso)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-white hover:bg-surface-700">
              <Check className="w-4 h-4 text-gray-400" /> Marcar como lida
            </button>
          )}
          <button role="menuitem"
            onClick={() => { setMenu(null); if (menuIgnorado) voltarAAvisar(tipoDoMenu); else ignorarTipo(tipoDoMenu) }}
            className="w-full flex items-start gap-2.5 px-3 py-2 text-left text-white hover:bg-surface-700">
            {menuIgnorado ? <Bell className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" /> : <BellOff className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />}
            <span className="min-w-0">
              {menuIgnorado ? 'Voltar a avisar' : 'Ignorar este tipo'}
              <span className="block text-[11px] text-gray-500 truncate">&ldquo;{tipoDoMenu}&rdquo;</span>
            </span>
          </button>
          <div className="my-1 h-px bg-surface-500" />
          <button role="menuitem" onClick={() => excluir(menu.aviso)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
        </div>
      )}
    </div>
  )
}
