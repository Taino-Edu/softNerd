'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, productApi, waitListApi, Product, WaitListEntry } from '@/lib/api'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  Clock, CheckCircle, XCircle, Package, User as UserIcon,
  ShoppingBag, LayoutList, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertTriangle, TimerIcon, Plus, Users, ChevronDown, ChevronUp, X, Megaphone,
  Hourglass, Sparkles,
} from 'lucide-react'

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Crediario']

type Reservation = {
  id: string
  userId: string
  userName?: string
  productId: string
  productName?: string
  productImageUrl?: string
  variantId?: string
  variantLabel?: string
  quantity: number
  status: string
  notes?: string
  reservedAt: string
  expiresAt: string
  fulfilledAt?: string
  cancelledAt?: string
  isExpired: boolean
}

type OpenComanda = {
  id: string
  mesaNumero?: number
  userName?: string
  totalInReais?: number
}

const statusCls: Record<string, string> = {
  active:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  fulfilled: 'bg-green-500/15 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  expired:   'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

const statusLabel: Record<string, string> = {
  active:    'Aguardando',
  fulfilled: 'Homologada',
  cancelled: 'Cancelada',
  expired:   'Expirada',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function timeUntil(d: string) {
  const diff = new Date(d).getTime() - Date.now()
  if (diff <= 0) return 'expirada'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}min`
}

/** 0–100: quanto da janela de 48h já passou desde a reserva. */
function progressPct(reservedAt: string, expiresAt: string) {
  const total = new Date(expiresAt).getTime() - new Date(reservedAt).getTime()
  const elapsed = Date.now() - new Date(reservedAt).getTime()
  if (total <= 0) return 100
  return Math.min(100, Math.max(0, (elapsed / total) * 100))
}

function StatCard({ icon, label, value, tint }: {
  icon: React.ReactNode; label: string; value: number | string; tint: string
}) {
  return (
    <div className="card flex items-center gap-3 py-3.5">
      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tint)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-black text-white leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide truncate">{label}</p>
      </div>
    </div>
  )
}

export default function ReservasPage() {
  const router = useRouter()
  const [tab,         setTab]         = useState<'reservas' | 'waitlist'>('reservas')

  // ── aba Reservas ──
  const [items,       setItems]       = useState<Reservation[]>([])
  const [loading,     setLoading]     = useState(true)
  const [statusFilter,setStatusFilter]= useState('active')
  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [totalCount,  setTotalCount]  = useState(0)
  const [activeCount, setActiveCount] = useState(0) // "aguardando" — independente do filtro atual

  // Modal de homologação
  const [homModal,    setHomModal]    = useState<Reservation | null>(null)
  const [homMode,     setHomMode]     = useState<'pdv' | 'comanda'>('pdv')
  const [homPayment,  setHomPayment]  = useState('Dinheiro')
  const [comandas,    setComandas]    = useState<OpenComanda[]>([])
  const [homComanda,  setHomComanda]  = useState<string>('')
  const [submitting,  setSubmitting]  = useState(false)

  // ── aba Lista de Espera ──
  const [wlProducts,  setWlProducts]  = useState<Product[]>([])
  const [wlLoading,   setWlLoading]   = useState(false)
  const [wlExpanded,  setWlExpanded]  = useState<string | null>(null)
  const [wlData,      setWlData]      = useState<Record<string, { entries: WaitListEntry[]; total: number }>>({})

  // Modal homologar entry da fila
  const [wlModal,     setWlModal]     = useState<{ entry: WaitListEntry; product: Product } | null>(null)
  const [wlMode,      setWlMode]      = useState<'pdv' | 'comanda'>('pdv')
  const [wlPayment,   setWlPayment]   = useState('Dinheiro')
  const [wlComanda,   setWlComanda]   = useState('')
  const [wlSubmit,    setWlSubmit]    = useState(false)

  // Carrega produtos em pré-venda + contagem da fila de cada um em paralelo,
  // pra alimentar a faixa de stats e os cards sem precisar expandir um por um.
  const loadWaitlistProducts = useCallback(async () => {
    setWlLoading(true)
    try {
      const { data } = await productApi.listAdmin()
      const preVenda = data.filter((p: Product) => p.isPreVenda && p.isActive)
      setWlProducts(preVenda)

      const results = await Promise.all(preVenda.map(p =>
        waitListApi.adminList(p.id).then(r => ({ id: p.id, entries: r.data.entries, total: r.data.total }))
          .catch(() => ({ id: p.id, entries: [] as WaitListEntry[], total: 0 }))
      ))
      setWlData(prev => {
        const next = { ...prev }
        for (const r of results) next[r.id] = { entries: r.entries, total: r.total }
        return next
      })
    } catch { toast.error('Erro ao carregar produtos pré-venda') }
    finally { setWlLoading(false) }
  }, [])

  useEffect(() => { loadWaitlistProducts() }, [loadWaitlistProducts])

  async function toggleProduct(productId: string) {
    setWlExpanded(prev => prev === productId ? null : productId)
  }

  async function avisarFila(p: Product) {
    const data = wlData[p.id]
    const uids = [...new Set((data?.entries ?? []).map(e => e.userId).filter((id): id is string => !!id))]
    if (uids.length === 0) { toast.error('Ninguém com conta cadastrada nesta fila ainda.'); return }

    const qs = new URLSearchParams({
      uids:        uids.join(','),
      productId:   p.id,
      productName: p.name,
      ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    })
    router.push(`/admin/mensageria?${qs.toString()}`)
  }

  async function removeWlEntry(productId: string, entryId: string) {
    try {
      await waitListApi.adminRemove(productId, entryId)
      setWlData(prev => {
        const updated = (prev[productId]?.entries ?? []).filter(e => e.id !== entryId)
        return { ...prev, [productId]: { entries: updated, total: updated.length } }
      })
      toast.success('Removido da fila')
    } catch { toast.error('Erro ao remover') }
  }

  function openWlModal(entry: WaitListEntry, product: Product) {
    setWlModal({ entry, product })
    setWlMode('pdv')
    setWlPayment('Dinheiro')
    setWlComanda('')
    loadComandas()
  }

  async function handleWlHomologar() {
    if (!wlModal) return
    const { entry, product } = wlModal
    if (wlMode === 'comanda') {
      if (!wlComanda) { toast.error('Selecione uma comanda'); return }
      setWlSubmit(true)
      try {
        await api.post(`/api/comanda/${wlComanda}/items`, { productId: product.id, quantity: 1 })
        toast.success(`Adicionado à comanda!`)
        setWlModal(null)
      } catch (e: any) { toast.error(e?.response?.data?.message ?? 'Erro ao adicionar à comanda') }
      finally { setWlSubmit(false) }
    } else {
      // PDV: passa via sessionStorage e navega
      sessionStorage.setItem('wl_pdv_preload', JSON.stringify({
        productId:   product.id,
        productName: product.name,
        userId:      entry.userId ?? null,
        userName:    entry.name,
      }))
      setWlModal(null)
      window.location.href = '/admin/venda-avulsa'
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data }, { data: activeData }] = await Promise.all([
        api.get('/api/reservations', { params: { status: statusFilter || undefined, page, pageSize: 20 } }),
        api.get('/api/reservations', { params: { status: 'active', page: 1, pageSize: 1 } }),
      ])
      setItems(data.items)
      setTotalPages(data.totalPages)
      setTotalCount(data.total)
      setActiveCount(activeData.total)
    } catch { toast.error('Erro ao carregar reservas') }
    finally  { setLoading(false) }
  }, [statusFilter, page])

  useEffect(() => { load() }, [load])

  async function loadComandas() {
    try {
      const { data } = await api.get('/api/comanda/dashboard')
      setComandas(data.map((c: any) => ({
        id: c.id,
        mesaNumero: c.mesaNumero,
        userName: c.userName,
        totalInReais: c.totalInReais,
      })))
    } catch { /* silencioso */ }
  }

  async function openHomModal(r: Reservation) {
    setHomModal(r)
    setHomMode('pdv')
    setHomPayment('Dinheiro')
    setHomComanda('')
    await loadComandas()
  }

  async function handleHomologar() {
    if (!homModal) return
    if (homMode === 'comanda' && !homComanda) {
      toast.error('Selecione uma comanda'); return
    }
    setSubmitting(true)
    try {
      await api.post(`/api/reservations/${homModal.id}/homologar`, {
        mode:          homMode,
        paymentMethod: homMode === 'pdv' ? homPayment : undefined,
        comandaId:     homMode === 'comanda' ? homComanda : undefined,
      })
      toast.success('Reserva homologada!')
      setHomModal(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erro ao homologar')
    } finally { setSubmitting(false) }
  }

  async function handleCancel(r: Reservation) {
    if (!confirm(`Cancelar reserva de "${r.productName}" para ${r.userName}?`)) return
    try {
      await api.delete(`/api/reservations/${r.id}`)
      toast.success('Reserva cancelada')
      load()
    } catch { toast.error('Erro ao cancelar') }
  }

  async function handleExtend(r: Reservation) {
    try {
      await api.put(`/api/reservations/${r.id}/extend`)
      toast.success('+48h adicionadas')
      load()
    } catch { toast.error('Erro ao estender') }
  }

  function refreshAll() {
    load()
    loadWaitlistProducts()
  }

  const badges = [
    { value: 'active',    label: 'Aguardando' },
    { value: 'fulfilled', label: 'Homologadas' },
    { value: 'cancelled', label: 'Canceladas' },
    { value: '',          label: 'Todas' },
  ]

  const totalNaFila = Object.values(wlData).reduce((s, d) => s + d.total, 0)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Toaster />

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-xl bg-brand-500/10">
          <LayoutList className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Pré-vendas</h1>
          <p className="text-xs text-gray-500 mt-0.5">Reservas antecipadas e fila de espera de produtos</p>
        </div>
        <button
          onClick={refreshAll}
          className="ml-auto p-2 rounded-xl bg-surface-700 hover:bg-surface-500 transition-colors text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Faixa de stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon={<Hourglass className="w-4.5 h-4.5 text-blue-400" />} tint="bg-blue-500/10"
          label="Aguardando" value={activeCount} />
        <StatCard icon={<Users className="w-4.5 h-4.5 text-purple-400" />} tint="bg-purple-500/10"
          label="Em fila" value={wlLoading ? '…' : totalNaFila} />
        <StatCard icon={<Sparkles className="w-4.5 h-4.5 text-amber-400" />} tint="bg-amber-500/10"
          label="Pré-vendas" value={wlLoading ? '…' : wlProducts.length} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl mb-5 w-fit">
        <button
          onClick={() => setTab('reservas')}
          className={clsx('px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2',
            tab === 'reservas' ? 'bg-surface-600 text-white' : 'text-gray-400 hover:text-gray-300')}>
          <ShoppingBag className="w-3.5 h-3.5" /> Reservas
          {activeCount > 0 && (
            <span className="text-[10px] font-black bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">{activeCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('waitlist')}
          className={clsx('px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2',
            tab === 'waitlist' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:text-gray-300')}>
          <Users className="w-3.5 h-3.5" /> Lista de Espera
          {totalNaFila > 0 && (
            <span className="text-[10px] font-black bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">{totalNaFila}</span>
          )}
        </button>
      </div>

      {/* ── Conteúdo: Lista de Espera ── */}
      {tab === 'waitlist' && (
        wlLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
        ) : wlProducts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum produto pré-venda cadastrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wlProducts.map(p => {
              const isOpen = wlExpanded === p.id
              const data   = wlData[p.id] ?? { entries: [], total: 0 }
              return (
                <div key={p.id}
                  className={clsx('card overflow-hidden p-0 transition-colors',
                    isOpen && 'ring-1 ring-purple-500/40')}>
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-12 h-12 rounded-xl bg-surface-700 shrink-0 flex items-center justify-center overflow-hidden">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        : <Package className="w-5 h-5 text-surface-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={clsx('text-xs font-black',
                          data.total > 0 ? 'text-purple-300' : 'text-gray-500')}>
                          {data.total} na fila
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-3 pb-3">
                    <button
                      onClick={() => avisarFila(p)}
                      disabled={data.total === 0}
                      title="Avisar toda a fila pela Mensageria"
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-brand-500/15 text-brand-300
                                 border border-brand-500/25 hover:bg-brand-500/25 disabled:opacity-40 disabled:cursor-not-allowed
                                 text-xs font-bold transition-colors">
                      <Megaphone className="w-3.5 h-3.5" /> Avisar fila
                    </button>
                    <button
                      onClick={() => toggleProduct(p.id)}
                      disabled={data.total === 0}
                      className="shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-700
                                 border border-surface-600 hover:border-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed
                                 text-xs font-semibold text-gray-300 transition-colors">
                      Ver
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-surface-700">
                      {data.entries.length === 0 ? (
                        <p className="text-center text-xs text-gray-500 py-5">Ninguém na fila ainda</p>
                      ) : (
                        <div className="divide-y divide-surface-700">
                          {data.entries.map(e => (
                            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-black text-purple-300 shrink-0">
                                {e.position}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">{e.name}</p>
                                <p className="text-xs text-gray-500">{e.whatsApp} · {new Date(e.createdAt).toLocaleDateString('pt-BR')}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => openWlModal(e, p)}
                                  title="Homologar — PDV ou Comanda"
                                  className="px-2 py-1 rounded-lg bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 text-[10px] font-bold transition-colors flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Vender
                                </button>
                                <button
                                  onClick={() => removeWlEntry(p.id, e.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-600/20 text-gray-500 hover:text-red-400 transition-colors"
                                  title="Remover da fila">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Conteúdo: Reservas ── */}
      {tab === 'reservas' && <>
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-5">
        {badges.map(b => (
          <button
            key={b.value}
            onClick={() => { setStatusFilter(b.value); setPage(1) }}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              statusFilter === b.value
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                : 'bg-surface-700 text-gray-400 border-surface-600 hover:border-surface-500'
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <LayoutList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma reserva encontrada</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(r => {
            const expired = r.isExpired || new Date(r.expiresAt) < new Date()
            const displayStatus = r.status === 'active' && expired ? 'expired' : r.status
            const pct = progressPct(r.reservedAt, r.expiresAt)
            const urgent = r.status === 'active' && !expired && pct > 75
            return (
              <div key={r.id} className="card flex gap-4 items-start">
                {/* Imagem */}
                <div className="w-16 h-16 rounded-xl bg-surface-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {r.productImageUrl
                    ? <img src={r.productImageUrl} alt={r.productName} className="w-full h-full object-cover" />
                    : <Package className="w-6 h-6 text-surface-500" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white text-sm truncate">{r.productName}</p>
                    {r.variantLabel && <span className="text-xs text-gray-400">· {r.variantLabel}</span>}
                    <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ml-auto',
                      statusCls[displayStatus] ?? statusCls['expired'])}>
                      {statusLabel[displayStatus] ?? displayStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{r.userName ?? 'Cliente'}</span>
                    <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" />Qtd: <strong className="text-white">{r.quantity}</strong></span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Reservado: {fmtDate(r.reservedAt)}</span>
                  </div>

                  {r.status === 'active' && !expired && (
                    <div className="mt-2 max-w-[240px]">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className={clsx('flex items-center gap-1 font-bold', urgent ? 'text-red-400' : 'text-amber-400')}>
                          <TimerIcon className="w-2.5 h-2.5" /> Expira em {timeUntil(r.expiresAt)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-600 overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full transition-all', urgent ? 'bg-red-400' : 'bg-amber-400')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {r.status === 'fulfilled' && r.fulfilledAt && (
                    <p className="flex items-center gap-1 text-xs text-green-400 mt-1.5">
                      <CheckCircle className="w-3 h-3" />Homologada: {fmtDate(r.fulfilledAt)}
                    </p>
                  )}

                  {r.notes && <p className="text-xs text-gray-500 mt-1 italic">"{r.notes}"</p>}
                </div>

                {/* Ações */}
                {r.status === 'active' && !expired && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => openHomModal(r)}
                      className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30
                                 hover:bg-green-500/30 text-xs font-semibold transition-colors flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Homologar
                    </button>
                    <button onClick={() => handleExtend(r)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20
                                 hover:bg-amber-500/20 text-xs font-semibold transition-colors flex items-center gap-1">
                      <Plus className="w-3 h-3" /> +48h
                    </button>
                    <button onClick={() => handleCancel(r)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20
                                 hover:bg-red-500/20 text-xs font-semibold transition-colors flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-lg bg-surface-700 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 rounded-lg bg-surface-700 disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      </>}

      {/* Modal de Homologação — Lista de Espera */}
      {wlModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-black text-white">Vender da fila de espera</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {wlModal.product.name} · #{wlModal.entry.position} {wlModal.entry.name}
              </p>
            </div>

            <div className="flex gap-2">
              {(['pdv', 'comanda'] as const).map(m => (
                <button key={m} onClick={() => setWlMode(m)}
                  className={clsx('flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                    wlMode === m ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-surface-700 text-gray-400 border-surface-600')}>
                  {m === 'pdv' ? '🧾 Frente de Caixa (PDV)' : '🪑 Adicionar a uma Comanda'}
                </button>
              ))}
            </div>

            {wlMode === 'pdv' && (
              <div className="bg-surface-700 rounded-xl p-4 text-sm text-gray-300 border border-surface-600">
                Vai abrir a Frente de Caixa com o produto e o cliente pré-carregados.
              </div>
            )}

            {wlMode === 'comanda' && (
              <div>
                <label className="text-xs text-gray-400 mb-2 block font-semibold">Selecionar comanda aberta</label>
                {comandas.length === 0 ? (
                  <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> Nenhuma comanda aberta
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                    {comandas.map(c => (
                      <button key={c.id} onClick={() => setWlComanda(c.id)}
                        className={clsx('flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                          wlComanda === c.id ? 'bg-brand-500/20 border-brand-500/40' : 'bg-surface-700 border-surface-600 hover:border-surface-500')}>
                        <div className="w-8 h-8 rounded-lg bg-surface-600 flex items-center justify-center text-xs font-bold text-white">
                          {c.mesaNumero ?? '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Mesa {c.mesaNumero ?? '—'}</p>
                          {c.userName && <p className="text-xs text-gray-400">{c.userName}</p>}
                        </div>
                        {c.totalInReais != null && (
                          <span className="ml-auto text-sm font-bold text-brand-300">
                            R$ {c.totalInReais.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setWlModal(null)} disabled={wlSubmit}
                className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={handleWlHomologar}
                disabled={wlSubmit || (wlMode === 'comanda' && !wlComanda)}
                className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {wlSubmit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {wlMode === 'pdv' ? 'Ir para o PDV' : 'Adicionar à Comanda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Homologação */}
      {homModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-black text-white">Homologar reserva</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {homModal.productName} · {homModal.quantity}x · {homModal.userName}
              </p>
            </div>

            {/* Modo */}
            <div className="flex gap-2">
              {(['pdv', 'comanda'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setHomMode(m)}
                  className={clsx(
                    'flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                    homMode === m
                      ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                      : 'bg-surface-700 text-gray-400 border-surface-600'
                  )}
                >
                  {m === 'pdv' ? '🧾 Frente de Caixa (PDV)' : '🪑 Adicionar a uma Comanda'}
                </button>
              ))}
            </div>

            {/* PDV — forma de pagamento */}
            {homMode === 'pdv' && (
              <div>
                <label className="text-xs text-gray-400 mb-2 block font-semibold">Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} onClick={() => setHomPayment(m)}
                      className={clsx(
                        'py-2 rounded-lg text-xs font-semibold border transition-colors',
                        homPayment === m
                          ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                          : 'bg-surface-700 text-gray-400 border-surface-600'
                      )}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comanda — seleção */}
            {homMode === 'comanda' && (
              <div>
                <label className="text-xs text-gray-400 mb-2 block font-semibold">Selecionar comanda aberta</label>
                {comandas.length === 0 ? (
                  <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Nenhuma comanda aberta no momento
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                    {comandas.map(c => (
                      <button key={c.id} onClick={() => setHomComanda(c.id)}
                        className={clsx(
                          'flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                          homComanda === c.id
                            ? 'bg-brand-500/20 border-brand-500/40'
                            : 'bg-surface-700 border-surface-600 hover:border-surface-500'
                        )}>
                        <div className="w-8 h-8 rounded-lg bg-surface-600 flex items-center justify-center text-xs font-bold text-white">
                          {c.mesaNumero ?? '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Mesa {c.mesaNumero ?? '—'}</p>
                          {c.userName && <p className="text-xs text-gray-400">{c.userName}</p>}
                        </div>
                        {c.totalInReais != null && (
                          <span className="ml-auto text-sm font-bold text-brand-300">
                            R$ {c.totalInReais.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setHomModal(null)} disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={handleHomologar} disabled={submitting || (homMode === 'comanda' && !homComanda)}
                className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40
                           text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
