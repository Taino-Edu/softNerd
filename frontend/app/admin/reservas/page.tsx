'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, productApi, reservationApi, userApi, variantApi, Product, AdminReservation, ReservationPixStatus, UserSummary, ProductVariant } from '@/lib/api'
import PixReservaModal from '@/components/PixReservaModal'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  Clock, CheckCircle, XCircle, Package, User as UserIcon,
  ShoppingBag, LayoutList, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertTriangle, TimerIcon, Plus, Users, ChevronDown, ChevronUp, X, Megaphone,
  Hourglass, Sparkles, QrCode, Layers, UserPlus,
} from 'lucide-react'

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Crediario']

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
  active:    'Em aberto',
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

/** 0–100: quanto da janela de expiração já passou desde a criação. */
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

// ── Modal: admin registra pré-venda/fila em nome do cliente (pedido pelo WhatsApp/balcão) ──
function NovaPreVendaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [userSearch,  setUserSearch]  = useState('')
  const [users,       setUsers]       = useState<UserSummary[]>([])
  const [userLoading, setUserLoading] = useState(false)
  const [user,        setUser]        = useState<UserSummary | null>(null)

  const [products,   setProducts]   = useState<Product[]>([])
  const [prodSearch, setProdSearch] = useState('')
  const [product,    setProduct]    = useState<Product | null>(null)

  const [variants,  setVariants]  = useState<ProductVariant[]>([])
  const [variantId, setVariantId] = useState('')

  const [qty,        setQty]        = useState(1)
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Cadastro rápido de cliente novo (pedido chegou pelo WhatsApp e a pessoa não tem conta)
  const [novoCliente, setNovoCliente] = useState(false)
  const [ncName,      setNcName]      = useState('')
  const [ncWhatsApp,  setNcWhatsApp]  = useState('')
  const [ncCpf,       setNcCpf]       = useState('')
  const [ncEmail,     setNcEmail]     = useState('')
  const [ncSaving,    setNcSaving]    = useState(false)

  // Produtos ativos — carrega uma vez ao abrir
  useEffect(() => {
    productApi.listAdmin()
      .then(r => setProducts(r.data.filter(p => p.isActive)))
      .catch(() => toast.error('Erro ao carregar produtos'))
  }, [])

  // Busca de cliente com debounce
  useEffect(() => {
    if (user) return
    const t = setTimeout(() => {
      setUserLoading(true)
      userApi.list(userSearch || undefined)
        .then(r => setUsers(r.data.slice(0, 8)))
        .catch(() => {})
        .finally(() => setUserLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [userSearch, user])

  // Variantes do produto escolhido
  useEffect(() => {
    setVariantId('')
    if (!product?.hasVariants) { setVariants([]); return }
    variantApi.list(product.id).then(r => setVariants(r.data)).catch(() => {})
  }, [product])

  const produtosFiltrados = products
    .filter(p => !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()))
    .slice(0, 8)

  const semEstoque = product ? product.stockQuantity <= 0 : false
  const qtyMax     = product ? (semEstoque ? 10 : Math.max(1, product.stockQuantity)) : 1

  async function handleSubmit() {
    if (!user)    { toast.error('Selecione o cliente'); return }
    if (!product) { toast.error('Selecione o produto'); return }
    if (product.hasVariants && !variantId) { toast.error('Selecione a variante'); return }
    setSubmitting(true)
    try {
      const { data } = await reservationApi.adminCreate({
        userId: user.id, productId: product.id,
        variantId: variantId || undefined, quantity: qty, notes: notes.trim() || undefined,
      })
      toast.success(data.kind === 'fila'
        ? `${user.name} entrou na fila de "${product.name}"`
        : `Pré-venda criada pra ${user.name} — estoque baixado`)
      onCreated()
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erro ao registrar')
    } finally { setSubmitting(false) }
  }

  // Cliente mandou print no WhatsApp e não tem conta: cadastra sem sair do modal
  async function handleCriarCliente() {
    if (!ncName.trim())     { toast.error('Informe o nome do cliente'); return }
    if (!ncWhatsApp.trim()) { toast.error('Informe o WhatsApp do cliente'); return }
    setNcSaving(true)
    try {
      const { data } = await userApi.adminCreate({
        name: ncName.trim(), whatsApp: ncWhatsApp.trim(),
        cpf: ncCpf.trim() || undefined, email: ncEmail.trim() || undefined,
      })
      toast.success(`Cliente ${data.name} cadastrado`)
      setUser(data)
      setNovoCliente(false)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erro ao cadastrar cliente')
    } finally { setNcSaving(false) }
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-surface-700 border border-surface-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-black text-white">Nova pré-venda para cliente</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pedido chegou pelo WhatsApp ou no balcão? Registra aqui em nome do cliente.
          </p>
        </div>

        {/* Cliente */}
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block font-semibold">Cliente *</label>
          {user ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/40">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                <p className="text-[11px] text-gray-400">{user.whatsApp ?? user.email ?? user.cpf ?? ''}</p>
              </div>
              <button onClick={() => { setUser(null); setUserSearch('') }}
                className="p-1 rounded hover:bg-surface-600 text-gray-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <input className={inputCls} placeholder="Buscar por nome, WhatsApp ou CPF..."
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <div className="mt-1.5 rounded-xl border border-surface-600 overflow-hidden">
                {userLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>
                ) : users.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">Nenhum cliente encontrado</p>
                ) : users.map(u => (
                  <button key={u.id} onClick={() => setUser(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-600 transition-colors border-b border-surface-700 last:border-0">
                    <UserIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-sm text-white truncate flex-1">{u.name}</span>
                    <span className="text-[11px] text-gray-500 shrink-0">{u.whatsApp ?? ''}</span>
                  </button>
                ))}
              </div>

              {/* Cliente sem conta (chegou pelo WhatsApp): cadastro rápido sem sair do modal */}
              {!novoCliente ? (
                <button type="button" onClick={() => { setNovoCliente(true); setNcName(userSearch) }}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-surface-600 text-xs font-semibold text-gray-400 hover:text-white hover:border-brand-500 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Cliente novo? Cadastrar agora
                </button>
              ) : (
                <div className="mt-2 rounded-xl border border-surface-600 p-3 space-y-2">
                  <p className="text-xs font-bold text-gray-300">Cadastro rápido do cliente</p>
                  <input className={inputCls} placeholder="Nome *" value={ncName} onChange={e => setNcName(e.target.value)} />
                  <input className={inputCls} placeholder="WhatsApp * (11999999999)" value={ncWhatsApp} onChange={e => setNcWhatsApp(e.target.value)} />
                  <input className={inputCls} placeholder="CPF (opcional)" value={ncCpf} onChange={e => setNcCpf(e.target.value)} />
                  <input className={inputCls} type="email" placeholder="E-mail (opcional)" value={ncEmail} onChange={e => setNcEmail(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCriarCliente} disabled={ncSaving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold disabled:opacity-60">
                      {ncSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Cadastrar e selecionar
                    </button>
                    <button type="button" onClick={() => setNovoCliente(false)}
                      className="px-3 py-2 rounded-xl border border-surface-600 text-xs font-semibold text-gray-400 hover:text-white transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Produto */}
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block font-semibold">Produto *</label>
          {product ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/40">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                <p className="text-[11px] text-gray-400">
                  R$ {product.priceInReais.toFixed(2).replace('.', ',')} · estoque {product.stockQuantity}
                </p>
              </div>
              <button onClick={() => { setProduct(null); setProdSearch(''); setQty(1) }}
                className="p-1 rounded hover:bg-surface-600 text-gray-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <input className={inputCls} placeholder="Buscar produto..."
                value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
              <div className="mt-1.5 rounded-xl border border-surface-600 overflow-hidden">
                {produtosFiltrados.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">Nenhum produto encontrado</p>
                ) : produtosFiltrados.map(p => (
                  <button key={p.id} onClick={() => { setProduct(p); setQty(1) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-600 transition-colors border-b border-surface-700 last:border-0">
                    <Package className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-sm text-white truncate flex-1">{p.name}</span>
                    <span className={clsx('text-[11px] shrink-0', p.stockQuantity > 0 ? 'text-emerald-400' : 'text-purple-300')}>
                      {p.stockQuantity > 0 ? `${p.stockQuantity} un.` : 'fila'}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Variante */}
        {product?.hasVariants && (
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block font-semibold">Variante *</label>
            <select className={inputCls} value={variantId} onChange={e => setVariantId(e.target.value)}>
              <option value="">Selecione...</option>
              {variants.map(v => (
                <option key={v.id} value={v.id}>{v.label} ({v.stockQuantity} un.)</option>
              ))}
            </select>
          </div>
        )}

        {/* Quantidade + obs */}
        <div className="flex gap-3">
          <div className="w-28 shrink-0">
            <label className="text-xs text-gray-400 mb-1.5 block font-semibold">Qtd *</label>
            <input className={inputCls} type="number" min={1} max={qtyMax} value={qty}
              onChange={e => setQty(Math.max(1, Math.min(qtyMax, parseInt(e.target.value || '1', 10) || 1)))} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1.5 block font-semibold">Observação</label>
            <input className={inputCls} placeholder='Ex.: "pedido pelo zap 16h32"'
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Consequência */}
        {product && (
          <div className={clsx('text-xs rounded-xl px-3 py-2.5 border',
            semEstoque
              ? 'bg-purple-500/10 border-purple-500/25 text-purple-300'
              : 'bg-blue-500/10 border-blue-500/25 text-blue-300')}>
            {semEstoque
              ? 'Sem estoque — o cliente entra na FILA e vira pré-venda quando o item chegar.'
              : 'Em estoque — vira PRÉ-VENDA na hora e o estoque já baixa. Regra de expiração normal.'}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting || !user || !product}
            className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReservasPage() {
  const router = useRouter()
  const [tab,         setTab]         = useState<'prevendas' | 'fila'>('prevendas')

  // ── aba Pré-vendas ──
  const [items,       setItems]       = useState<AdminReservation[]>([])
  const [loading,     setLoading]     = useState(true)
  const [statusFilter,setStatusFilter]= useState('active')
  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [totalCount,  setTotalCount]  = useState(0)
  const [activeCount, setActiveCount] = useState(0) // "em aberto" — independente do filtro atual
  const [pixByGroup,  setPixByGroup]  = useState<Record<string, ReservationPixStatus>>({})

  // Modal de homologação
  const [homModal,    setHomModal]    = useState<AdminReservation | null>(null)
  const [homMode,     setHomMode]     = useState<'pdv' | 'comanda'>('pdv')
  const [homPayment,  setHomPayment]  = useState('Dinheiro')
  const [comandas,    setComandas]    = useState<OpenComanda[]>([])
  const [homComanda,  setHomComanda]  = useState<string>('')
  const [submitting,  setSubmitting]  = useState(false)

  // Modal de nova pré-venda manual + modal de Pix (copiar código / mandar no zap)
  const [showNova,    setShowNova]    = useState(false)
  const [pixGroup,    setPixGroup]    = useState<AdminReservation | null>(null)

  // ── aba Fila (item que ainda não chegou) ──
  const [wlProducts,  setWlProducts]  = useState<Product[]>([])
  const [wlLoading,   setWlLoading]   = useState(false)
  const [wlExpanded,  setWlExpanded]  = useState<string | null>(null)
  const [wlData,      setWlData]      = useState<Record<string, AdminReservation[]>>({})
  const [totalNaFila, setTotalNaFila] = useState(0)

  // Carrega produtos que aceitam fila + as entradas waiting já agrupadas por produto,
  // pra alimentar a faixa de stats e os cards sem precisar expandir um por um.
  const loadFila = useCallback(async () => {
    setWlLoading(true)
    try {
      const [{ data: prods }, { data: filaRes }] = await Promise.all([
        productApi.listAdmin(),
        reservationApi.list({ kind: 'fila', status: 'waiting', pageSize: 200 }),
      ])
      setWlProducts(prods.filter(p => p.isPreVenda && p.isActive))

      const grouped: Record<string, AdminReservation[]> = {}
      for (const e of filaRes.items) (grouped[e.productId] ??= []).push(e)
      for (const k of Object.keys(grouped))
        grouped[k].sort((a, b) => (a.posicaoFila ?? 999) - (b.posicaoFila ?? 999))
      setWlData(grouped)
      setTotalNaFila(filaRes.total)
    } catch { toast.error('Erro ao carregar fila') }
    finally { setWlLoading(false) }
  }, [])

  useEffect(() => { loadFila() }, [loadFila])

  async function toggleProduct(productId: string) {
    setWlExpanded(prev => prev === productId ? null : productId)
  }

  async function avisarFila(p: Product) {
    const entries = wlData[p.id] ?? []
    const uids = [...new Set(entries.map(e => e.userId).filter((id): id is string => !!id))]
    if (uids.length === 0) { toast.error('Ninguém com conta cadastrada nesta fila ainda.'); return }

    const qs = new URLSearchParams({
      uids:        uids.join(','),
      productId:   p.id,
      productName: p.name,
      ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    })
    router.push(`/admin/mensageria?${qs.toString()}`)
  }

  async function removeFilaEntry(entryId: string, productId: string) {
    try {
      await reservationApi.updateStatus(entryId, 'cancelled')
      setWlData(prev => {
        const updated = (prev[productId] ?? []).filter(e => e.id !== entryId)
        return { ...prev, [productId]: updated }
      })
      setTotalNaFila(t => Math.max(0, t - 1))
      toast.success('Removido da fila')
    } catch { toast.error('Erro ao remover') }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data }, { data: activeData }] = await Promise.all([
        reservationApi.list({ kind: 'pre_venda', status: statusFilter || undefined, page, pageSize: 20 }),
        reservationApi.list({ kind: 'pre_venda', status: 'active', page: 1, pageSize: 1 }),
      ])
      setItems(data.items)
      setTotalPages(data.totalPages)
      setTotalCount(data.total)
      setActiveCount(activeData.total)
    } catch { toast.error('Erro ao carregar pré-vendas') }
    finally  { setLoading(false) }
  }, [statusFilter, page])

  useEffect(() => { load() }, [load])

  // Busca status de pagamento Pix por grupo (uma vez por grupo, não por item) — só pra grupos
  // que ainda não temos em cache, evita refetch a cada re-render.
  useEffect(() => {
    const groupIds = [...new Set(items.map(r => r.reservationGroupId))].filter(id => !(id in pixByGroup))
    if (groupIds.length === 0) return
    Promise.all(groupIds.map(id =>
      reservationApi.getPix(id).then(r => [id, r.data] as const).catch(() => [id, { hasPix: false }] as const)
    )).then(results => {
      setPixByGroup(prev => {
        const next = { ...prev }
        for (const [id, status] of results) next[id] = status
        return next
      })
    })
  }, [items, pixByGroup])

  // Quantos itens cada carrinho de pré-venda tem — pra mostrar "carrinho de N itens" quando > 1
  const groupCounts = items.reduce<Record<string, number>>((acc, r) => {
    acc[r.reservationGroupId] = (acc[r.reservationGroupId] ?? 0) + 1
    return acc
  }, {})

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

  async function openHomModal(r: AdminReservation) {
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
      toast.success('Pré-venda homologada!')
      setHomModal(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erro ao homologar')
    } finally { setSubmitting(false) }
  }

  async function handleCancel(r: AdminReservation) {
    if (!confirm(`Cancelar a pré-venda de "${r.productName}" para ${r.userName}? O estoque volta pra loja.`)) return
    try {
      await api.delete(`/api/reservations/${r.id}`)
      toast.success('Pré-venda cancelada — estoque devolvido')
      load()
    } catch { toast.error('Erro ao cancelar') }
  }

  async function handleExtend(r: AdminReservation) {
    try {
      await api.put(`/api/reservations/${r.id}/extend`)
      toast.success('+48h adicionadas')
      load()
    } catch { toast.error('Erro ao estender') }
  }

  function refreshAll() {
    load()
    loadFila()
  }

  const badges = [
    { value: 'active',    label: 'Em aberto' },
    { value: 'fulfilled', label: 'Homologadas' },
    { value: 'cancelled', label: 'Canceladas' },
    { value: 'expired',   label: 'Expiradas' },
    { value: '',          label: 'Todas' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Toaster />

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-xl bg-brand-500/10">
          <LayoutList className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Pré-vendas &amp; Fila</h1>
          <p className="text-xs text-gray-500 mt-0.5">Pré-venda baixa o estoque na hora · fila é pra item que ainda não chegou</p>
        </div>
        <button
          onClick={() => setShowNova(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold transition-colors">
          <Plus className="w-4 h-4" /> Nova pré-venda
        </button>
        <button
          onClick={refreshAll}
          className="p-2 rounded-xl bg-surface-700 hover:bg-surface-500 transition-colors text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Faixa de stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon={<Hourglass className="w-4.5 h-4.5 text-blue-400" />} tint="bg-blue-500/10"
          label="Em aberto" value={activeCount} />
        <StatCard icon={<Users className="w-4.5 h-4.5 text-purple-400" />} tint="bg-purple-500/10"
          label="Na fila" value={wlLoading ? '…' : totalNaFila} />
        <StatCard icon={<Sparkles className="w-4.5 h-4.5 text-amber-400" />} tint="bg-amber-500/10"
          label="Com fila aberta" value={wlLoading ? '…' : wlProducts.length} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl mb-5 w-fit">
        <button
          onClick={() => setTab('prevendas')}
          className={clsx('px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2',
            tab === 'prevendas' ? 'bg-surface-600 text-white' : 'text-gray-400 hover:text-gray-300')}>
          <ShoppingBag className="w-3.5 h-3.5" /> Pré-vendas
          {activeCount > 0 && (
            <span className="text-[10px] font-black bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">{activeCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('fila')}
          className={clsx('px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2',
            tab === 'fila' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:text-gray-300')}>
          <Users className="w-3.5 h-3.5" /> Fila
          {totalNaFila > 0 && (
            <span className="text-[10px] font-black bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">{totalNaFila}</span>
          )}
        </button>
      </div>

      {/* ── Conteúdo: Fila ── */}
      {tab === 'fila' && (
        wlLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
        ) : wlProducts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum produto com fila aberta</p>
            <p className="text-xs mt-1 opacity-70">Ative &quot;Fila de espera&quot; no cadastro do produto</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wlProducts.map(p => {
              const isOpen  = wlExpanded === p.id
              const entries = wlData[p.id] ?? []
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
                          entries.length > 0 ? 'text-purple-300' : 'text-gray-500')}>
                          {entries.length} na fila
                        </span>
                        <span className="text-[10px] text-gray-600">· estoque {p.stockQuantity}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-3 pb-3">
                    <button
                      onClick={() => avisarFila(p)}
                      disabled={entries.length === 0}
                      title="Avisar toda a fila pela Mensageria"
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-brand-500/15 text-brand-300
                                 border border-brand-500/25 hover:bg-brand-500/25 disabled:opacity-40 disabled:cursor-not-allowed
                                 text-xs font-bold transition-colors">
                      <Megaphone className="w-3.5 h-3.5" /> Avisar fila
                    </button>
                    <button
                      onClick={() => toggleProduct(p.id)}
                      disabled={entries.length === 0}
                      className="shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-700
                                 border border-surface-600 hover:border-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed
                                 text-xs font-semibold text-gray-300 transition-colors">
                      Ver
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-surface-700">
                      {entries.length === 0 ? (
                        <p className="text-center text-xs text-gray-500 py-5">Ninguém na fila ainda</p>
                      ) : (
                        <div className="divide-y divide-surface-700">
                          {entries.map(e => (
                            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-black text-purple-300 shrink-0">
                                {e.posicaoFila ?? '·'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">{e.userName ?? 'Cliente'}</p>
                                <p className="text-xs text-gray-500">
                                  {e.userWhatsApp ? `${e.userWhatsApp} · ` : ''}{new Date(e.reservedAt).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => removeFilaEntry(e.id, p.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-600/20 text-gray-500 hover:text-red-400 transition-colors"
                                  title="Remover da fila">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="px-4 py-2.5 text-[10px] text-gray-600 border-t border-surface-700">
                        Quando o estoque chegar, a fila vira pré-venda automaticamente na ordem e cada pessoa é avisada.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Conteúdo: Pré-vendas ── */}
      {tab === 'prevendas' && <>
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
          <p>Nenhuma pré-venda encontrada</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(r => {
            const expired = r.isExpired || (r.expiresAt ? new Date(r.expiresAt) < new Date() : false)
            const displayStatus = r.status === 'active' && expired ? 'expired' : r.status
            const pct = r.expiresAt ? progressPct(r.reservedAt, r.expiresAt) : 0
            const urgent = r.status === 'active' && !!r.expiresAt && !expired && pct > 75
            const pagaSemExpirar = r.status === 'active' && !r.expiresAt
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
                    {groupCounts[r.reservationGroupId] > 1 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/15 text-purple-300">
                        <Layers className="w-2.5 h-2.5" /> Carrinho de {groupCounts[r.reservationGroupId]}
                      </span>
                    )}
                    {pixByGroup[r.reservationGroupId]?.hasPix && (
                      pixByGroup[r.reservationGroupId]?.status === 'CONCLUIDA' ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/15 text-green-400">
                          <QrCode className="w-2.5 h-2.5" /> Pago via Pix
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-400">
                          <QrCode className="w-2.5 h-2.5" /> Pix pendente
                        </span>
                      )
                    )}
                    {r.preVendaReleaseDate && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-400">
                        Lançamento {new Date(r.preVendaReleaseDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </span>
                    )}
                    <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ml-auto',
                      statusCls[displayStatus] ?? statusCls['expired'])}>
                      {statusLabel[displayStatus] ?? displayStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{r.userName ?? 'Cliente'}</span>
                    <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" />Qtd: <strong className="text-white">{r.quantity}</strong></span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Criada: {fmtDate(r.reservedAt)}</span>
                  </div>

                  {r.status === 'active' && !expired && r.expiresAt && (
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

                  {pagaSemExpirar && (
                    <p className="flex items-center gap-1 text-xs text-green-400 mt-1.5">
                      <CheckCircle className="w-3 h-3" />Paga — não expira, aguardando retirada
                    </p>
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
                    {r.expiresAt && (
                      <button onClick={() => setPixGroup(r)}
                        title="Gerar/copiar o código Pix pra mandar no WhatsApp"
                        className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/25
                                   hover:bg-purple-500/20 text-xs font-semibold transition-colors flex items-center gap-1">
                        <QrCode className="w-3 h-3" /> Pix
                      </button>
                    )}
                    {r.expiresAt && (
                      <button onClick={() => handleExtend(r)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20
                                   hover:bg-amber-500/20 text-xs font-semibold transition-colors flex items-center gap-1">
                        <Plus className="w-3 h-3" /> +48h
                      </button>
                    )}
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

      {/* Modal de Homologação */}
      {homModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-black text-white">Homologar pré-venda</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {homModal.productName} · {homModal.quantity}x · {homModal.userName}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                O estoque já foi baixado quando a pré-venda foi criada — aqui só registra a venda.
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

      {/* Modal: registrar pré-venda/fila em nome do cliente */}
      {showNova && (
        <NovaPreVendaModal
          onClose={() => setShowNova(false)}
          onCreated={() => { setShowNova(false); refreshAll() }}
        />
      )}

      {/* Modal: Pix da pré-venda (copiar código e mandar no zap) */}
      {pixGroup && (
        <PixReservaModal
          groupId={pixGroup.reservationGroupId}
          dark
          clienteWhatsApp={pixGroup.userWhatsApp}
          onClose={() => setPixGroup(null)}
          onPago={load}
        />
      )}
    </div>
  )
}
