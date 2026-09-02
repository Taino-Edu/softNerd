'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, productApi, reservationApi, userApi, variantApi, Product, AdminReservation, ReservationPixStatus, UserSummary, ProductVariant } from '@/lib/api'
import PixReservaModal from '@/components/PixReservaModal'
import PercentPicker from '@/components/admin/PercentPicker'
import { PageHeader } from '@/components/ui/PageHeader'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  Clock, CheckCircle, XCircle, Package, User as UserIcon,
  LayoutList, RefreshCw, Loader2,
  TimerIcon, Plus, Users, ChevronDown, ChevronUp, X, Megaphone,
  QrCode, Layers, UserPlus, Wallet, ShoppingCart, Trophy, Pencil, Tag, Trash2,
  AlertTriangle,
} from 'lucide-react'

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Crediario']

type ReservationCart = {
  groupId: string
  items: AdminReservation[]
  representative: AdminReservation
  isPreVenda: boolean
  expiresAt: string | null
  totalEmReais: number
}

type Lanes = { aPagar: ReservationCart[]; pago: ReservationCart[] }

type CustomerGroup = { userId: string; name: string; carts: ReservationCart[]; total: number }

/**
 * Reserva feita item a item vira um grupo de 1 (ReservationController: "avulsa = grupo
 * de 1 item só"), então o mesmo cliente que compra em dias diferentes gera vários
 * carrinhos soltos, embaralhados com os de todo mundo. Aqui eles ficam debaixo do nome
 * dele. É só arrumação de tela: o carrinho continua sendo a unidade de Pix, entrega e
 * homologação — nada é fundido.
 */
function groupByCustomer(items: ReservationCart[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>()
  for (const cart of items) {
    const { userId, userName } = cart.representative
    const found = map.get(userId)
    if (found) {
      found.carts.push(cart)
      found.total += cart.totalEmReais
    } else {
      map.set(userId, { userId, name: userName ?? 'Cliente', carts: [cart], total: cart.totalEmReais })
    }
  }
  return [...map.values()]
}

/** Gaveta de um cliente com mais de um pedido na mesma raia. Abre por padrão: agrupar
 *  é pra juntar o que é do mesmo dono, não pra esconder pedido do Maikon. */
function CustomerGroupCard({ group, renderCard }: {
  group: CustomerGroup; renderCard: (cart: ReservationCart) => React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-500/5 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-2.5 py-2 flex items-center gap-2 text-left hover:bg-brand-500/10 transition-colors">
        <UserIcon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        <span className="text-xs font-bold text-white truncate flex-1">{group.name}</span>
        <span className="text-[10px] text-gray-400 shrink-0">
          {group.carts.length} pedidos · R$ {group.total.toFixed(2).replace('.', ',')}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
      </button>
      {open && <div className="flex flex-col gap-2 p-2 pt-0">{group.carts.map(renderCard)}</div>}
    </div>
  )
}

function Lane({ title, tint, items, renderCard, emptyText }: {
  title: string; tint: string; items: ReservationCart[]
  renderCard: (cart: ReservationCart) => React.ReactNode; emptyText: string
}) {
  const groups = groupByCustomer(items)
  return (
    <div>
      <p className={clsx('text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5', tint)}>
        {title} <span className="text-gray-600">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-gray-600 italic py-2">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map(group => group.carts.length === 1
            // Cliente com um pedido só continua exatamente como era — gaveta de 1 seria ruído.
            ? <div key={group.userId}>{renderCard(group.carts[0])}</div>
            : <CustomerGroupCard key={group.userId} group={group} renderCard={renderCard} />)}
        </div>
      )}
    </div>
  )
}

// ── Coluna operacional do kanban (Vendas ou Pré-vendas): A pagar → Pago ──
function KanbanColumn({ title, subtitle, icon, tint, lanesData, renderCard }: {
  title: string; subtitle: string; icon: React.ReactNode; tint: string
  lanesData: Lanes
  renderCard: (cart: ReservationCart) => React.ReactNode
}) {
  return (
    <div className={clsx('card !p-4 space-y-5 border', tint)}>
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="font-black text-white text-sm">{title}</p>
          <p className="text-[10px] text-gray-500">{subtitle}</p>
        </div>
      </div>

      <Lane title="A pagar" tint="text-amber-400" items={lanesData.aPagar} renderCard={renderCard}
        emptyText="Nada aguardando pagamento." />
      <Lane title="Pago · aguardando retirada" tint="text-blue-400" items={lanesData.pago} renderCard={renderCard}
        emptyText="Nada pago aguardando retirada." />
    </div>
  )
}

// ── Modal: admin registra pré-venda/fila em nome do cliente (pedido pelo WhatsApp/balcão) ──
/** Item já adicionado ao pedido manual (ainda não enviado pra API). */
type CartLine = { key: string; product: Product; variant?: ProductVariant; qty: number }

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

  // Pedido do cliente pode ter vários itens (era o limite antigo: 1 produto por vez,
  // e o balconista tinha que refazer o modal inteiro pra cada item do mesmo pedido).
  const [cart, setCart] = useState<CartLine[]>([])

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
  const totalItens = cart.length + (product ? 1 : 0)

  /** Manda o item que está selecionado pra lista do pedido e limpa a busca pro próximo. */
  function handleAddItem() {
    if (!product) { toast.error('Selecione o produto'); return }
    if (product.hasVariants && !variantId) { toast.error('Selecione a variante'); return }
    setCart(c => [...c, {
      key: `${product.id}-${variantId}-${Date.now()}`,
      product, variant: variants.find(v => v.id === variantId), qty,
    }])
    setProduct(null); setProdSearch(''); setQty(1)
  }

  async function handleSubmit() {
    if (!user) { toast.error('Selecione o cliente'); return }

    // Item ainda selecionado (não clicou em "adicionar") entra junto — ninguém perde item
    // por não ter apertado o botão certo.
    const linhas = [...cart]
    if (product) {
      if (product.hasVariants && !variantId) { toast.error('Selecione a variante'); return }
      linhas.push({ key: 'pendente', product, variant: variants.find(v => v.id === variantId), qty })
    }
    if (linhas.length === 0) { toast.error('Adicione pelo menos um item'); return }

    setSubmitting(true)
    try {
      const { data } = await reservationApi.adminCreate({
        userId: user.id,
        items: linhas.map(l => ({ productId: l.product.id, variantId: l.variant?.id, quantity: l.qty })),
        notes: notes.trim() || undefined,
      })
      const soFila = data.items.every(i => i.kind === 'fila')
      const quanto = linhas.length === 1 ? `"${linhas[0].product.name}"` : `${linhas.length} itens`
      toast.success(soFila
        ? `${user.name} entrou na fila de ${quanto}`
        : `Pré-venda criada pra ${user.name} (${quanto}) — estoque baixado`)
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

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-surface-700 border border-surface-500 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-black text-white">Nova pré-venda para cliente</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pedido chegou pelo WhatsApp ou no balcão? Registra aqui em nome do cliente —
            pode colocar quantos itens quiser no mesmo pedido.
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
                className="p-1 rounded hover:bg-surface-700 text-gray-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <input className={inputCls} placeholder="Buscar por nome, WhatsApp ou CPF..."
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <div className="mt-1.5 rounded-xl border border-surface-500 overflow-hidden">
                {userLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>
                ) : users.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">Nenhum cliente encontrado</p>
                ) : users.map(u => (
                  <button key={u.id} onClick={() => setUser(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-700 transition-colors border-b border-surface-700 last:border-0">
                    <UserIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-sm text-white truncate flex-1">{u.name}</span>
                    <span className="text-[11px] text-gray-500 shrink-0">{u.whatsApp ?? ''}</span>
                  </button>
                ))}
              </div>

              {/* Cliente sem conta (chegou pelo WhatsApp): cadastro rápido sem sair do modal */}
              {!novoCliente ? (
                <button type="button" onClick={() => { setNovoCliente(true); setNcName(userSearch) }}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-surface-500 text-xs font-semibold text-gray-400 hover:text-white hover:border-brand-500 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Cliente novo? Cadastrar agora
                </button>
              ) : (
                <div className="mt-2 rounded-xl border border-surface-500 p-3 space-y-2">
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
                      className="px-3 py-2 rounded-xl border border-surface-500 text-xs font-semibold text-gray-400 hover:text-white transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Itens já adicionados ao pedido */}
        {cart.length > 0 && (
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block font-semibold">
              Itens do pedido ({cart.length})
            </label>
            <div className="rounded-xl border border-surface-500 overflow-hidden">
              {cart.map(l => (
                <div key={l.key}
                  className="flex items-center gap-2 px-3 py-2 border-b border-surface-700 last:border-0">
                  <Package className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{l.product.name}</p>
                    {l.variant && <p className="text-[11px] text-gray-500">{l.variant.label}</p>}
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{l.qty}x</span>
                  <button onClick={() => setCart(c => c.filter(x => x.key !== l.key))}
                    className="p-1 rounded hover:bg-surface-700 text-gray-500 hover:text-red-400 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Produto */}
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block font-semibold">
            {cart.length > 0 ? 'Outro produto' : 'Produto *'}
          </label>
          {product ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/40">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                <p className="text-[11px] text-gray-400">
                  R$ {product.priceInReais.toFixed(2).replace('.', ',')} · estoque {product.stockQuantity}
                </p>
              </div>
              <button onClick={() => { setProduct(null); setProdSearch(''); setQty(1) }}
                className="p-1 rounded hover:bg-surface-700 text-gray-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <input className={inputCls} placeholder="Buscar produto..."
                value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
              <div className="mt-1.5 rounded-xl border border-surface-500 overflow-hidden">
                {produtosFiltrados.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">Nenhum produto encontrado</p>
                ) : produtosFiltrados.map(p => (
                  <button key={p.id} onClick={() => { setProduct(p); setQty(1) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-700 transition-colors border-b border-surface-700 last:border-0">
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

        {/* Adiciona o item selecionado e libera a busca pro próximo produto do mesmo pedido */}
        {product && (
          <button type="button" onClick={handleAddItem}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-surface-500 text-xs font-semibold text-gray-300 hover:text-white hover:border-brand-500 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Adicionar este item e escolher outro
          </button>
        )}

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
          <button onClick={handleSubmit} disabled={submitting || !user || (cart.length === 0 && !product)}
            className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Registrar{totalItens > 1 ? ` ${totalItens} itens` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReservasPage() {
  const router = useRouter()

  // ── Pedidos (kanban Vendas × Pré-vendas) ──
  const [items,       setItems]       = useState<AdminReservation[]>([])
  const [loading,     setLoading]     = useState(true)
  const [pixByGroup,  setPixByGroup]  = useState<Record<string, ReservationPixStatus>>({})

  // Modal de homologação — sempre PDV (homologar por comanda misturava o valor
  // com outros itens do cliente e não dava pra separar "Pré-venda" no Financeiro).
  const [homModal,    setHomModal]    = useState<AdminReservation | null>(null)
  const [homPayment,  setHomPayment]  = useState('Dinheiro')
  const [homSplit,    setHomSplit]    = useState(false)
  const [homSecondPayment, setHomSecondPayment] = useState('')
  const [homSecondAmount,  setHomSecondAmount]  = useState('')
  // Desconto decidido só agora, na homologação — nunca visto pelo cliente antes (ver
  // PLANEJAMENTO/contexto: cliente já pode ter pago o valor cheio via Pix).
  const [homDiscountMode,     setHomDiscountMode]     = useState<'percent' | 'cents'>('percent')
  const [homDiscountPct,      setHomDiscountPct]      = useState(0)
  const [homDiscountValueStr, setHomDiscountValueStr] = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  // Modal de nova pré-venda manual + modal de Pix (copiar código / mandar no zap)
  const [showNova,    setShowNova]    = useState(false)
  const [pixGroup,    setPixGroup]    = useState<AdminReservation | null>(null)

  // Modal de editar quantidade (corrigir pedido lançado errado)
  const [editQty,        setEditQty]        = useState<AdminReservation | null>(null)
  const [editQtyValue,   setEditQtyValue]   = useState(1)
  const [editQtySaving,  setEditQtySaving]  = useState(false)
  /** 409 do backend: existe cobrança Pix aberta travando a edição. */
  const [pixTravando,    setPixTravando]    = useState(false)
  const [cancelandoPix,  setCancelandoPix]  = useState(false)

  // ── Fila (item que ainda não chegou) — seção dobrável dentro da mesma tela ──
  const [showFila,    setShowFila]    = useState(false)
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

  // O kanban é operacional: finalizadas e canceladas continuam no histórico/banco,
  // mas deixam de aparecer aqui assim que o carrinho é encerrado.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await reservationApi.list({ kind: 'pre_venda', status: 'active', pageSize: 300 })
      setItems(data.items)
    } catch { toast.error('Erro ao carregar pedidos') }
    finally  { setLoading(false) }
  }, [])

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

  // Um reservationGroupId é um carrinho. A classificação é feita no carrinho inteiro;
  // pedido misto fica em Vendas, igual à regra usada ao lançar a venda no financeiro.
  const grouped = items.reduce<Record<string, AdminReservation[]>>((acc, item) => {
    const cartItems = acc[item.reservationGroupId] ?? []
    cartItems.push(item)
    acc[item.reservationGroupId] = cartItems
    return acc
  }, {})
  const carts: ReservationCart[] = Object.entries(grouped).map(([groupId, cartItems]) => ({
    groupId,
    items: cartItems,
    representative: cartItems[0],
    isPreVenda: cartItems.every(item => item.productIsPreVenda),
    expiresAt: cartItems.find(item => item.expiresAt)?.expiresAt ?? null,
    totalEmReais: cartItems.reduce((sum, item) => sum + (item.subtotalEmReais ?? 0), 0),
  }))

  const vendas    = carts.filter(cart => !cart.isPreVenda)
  const preVendas = carts.filter(cart => cart.isPreVenda)

  function lanes(list: ReservationCart[]) {
    return {
      aPagar: list.filter(cart => !!cart.expiresAt),
      pago:   list.filter(cart => !cart.expiresAt),
    }
  }
  const vendasLanes    = lanes(vendas)
  const preVendasLanes = lanes(preVendas)

  // ── Análises de valor (pedido do Maikon): quanto já entrou × quanto ainda falta
  // entrar. "A receber" junta quem ainda não pagou (Pix pendente ou combinou pagar
  // na retirada) com quem tá na fila esperando o produto chegar pra decidir.
  const somaSubtotal = (list: ReservationCart[]) => list.reduce((sum, cart) => sum + cart.totalEmReais, 0)
  const jaPagoValor    = somaSubtotal([...vendasLanes.pago,   ...preVendasLanes.pago])
  const aPagarValor    = somaSubtotal([...vendasLanes.aPagar, ...preVendasLanes.aPagar])
  const filaValor      = Object.values(wlData).flat().reduce((sum, item) => sum + (item.subtotalEmReais ?? 0), 0)
  const aReceberValor  = aPagarValor + filaValor
  const totalEmAberto  = vendasLanes.aPagar.length + vendasLanes.pago.length
                        + preVendasLanes.aPagar.length + preVendasLanes.pago.length

  function openHomModal(r: AdminReservation) {
    setHomModal(r)
    setHomPayment('Dinheiro')
    setHomSplit(false)
    setHomSecondPayment('')
    setHomSecondAmount('')
    setHomDiscountMode('percent')
    setHomDiscountPct(0)
    setHomDiscountValueStr('')
  }

  // Homologar resolve o CARRINHO inteiro, não a linha clicada: o valor, o desconto e o
  // aviso do modal têm que falar do grupo todo. Reserva avulsa cai aqui como grupo de 1.
  const homGroupItems = homModal
    ? items.filter(r => r.reservationGroupId === homModal.reservationGroupId
                     && r.status === 'active' && r.kind === 'pre_venda')
    : []
  const homSubtotalCents = Math.round(
    homGroupItems.reduce((sum, r) => sum + (r.subtotalEmReais ?? 0), 0) * 100
  )
  const homDiscountCents = homDiscountMode === 'cents'
    ? Math.min(Math.round(parseFloat(homDiscountValueStr.replace(',', '.') || '0') * 100), homSubtotalCents)
    : Math.round(homSubtotalCents * homDiscountPct / 100)
  const homTotalCents = homSubtotalCents - homDiscountCents

  async function handleHomologar() {
    if (!homModal) return
    const secondAmountInCents = homSplit ? Math.round(parseFloat(homSecondAmount.replace(',', '.') || '0') * 100) : 0
    if (homSplit) {
      if (!homSecondPayment) { toast.error('Selecione a segunda forma de pagamento'); return }
      if (homSecondPayment === homPayment) { toast.error('A segunda forma não pode ser igual à primeira'); return }
      if (!secondAmountInCents || secondAmountInCents <= 0) { toast.error('Informe o valor pago na segunda forma'); return }
    }
    setSubmitting(true)
    try {
      // Sempre pelo grupo: reserva avulsa tem reservationGroupId = o próprio id, então
      // um clique resolve tanto o item solto quanto o carrinho de N itens.
      const { data } = await reservationApi.homologarGrupo(homModal.reservationGroupId, {
        paymentMethod: homPayment,
        secondPaymentMethod:        homSplit ? homSecondPayment : undefined,
        secondPaymentAmountInCents: homSplit ? secondAmountInCents : undefined,
        discountPercent: homDiscountMode === 'percent' ? homDiscountPct : 0,
        discountInCents: homDiscountMode === 'cents' ? homDiscountCents : undefined,
      })
      const oQue = data.itemCount > 1 ? `${data.itemCount} itens do carrinho homologados` : 'Pré-venda homologada'
      toast.success(data.discountInReais > 0
        ? `${oQue} com desconto de R$ ${data.discountInReais.toFixed(2).replace('.', ',')}!`
        : `${oQue}!`)
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

  function refreshAll() {
    load()
    loadFila()
  }

  function openEditQty(r: AdminReservation) {
    setEditQty(r)
    setEditQtyValue(r.quantity)
    setPixTravando(false)
  }

  async function handleSaveQty() {
    if (!editQty || editQtyValue < 1) return
    setEditQtySaving(true)
    try {
      await reservationApi.updateQuantity(editQty.id, editQtyValue)
      toast.success('Quantidade atualizada')
      setEditQty(null)
      load()
    } catch (e: any) {
      // 409 = cobrança Pix aberta. Em vez de só repetir a mensagem, mostra o botão
      // que resolve — antes o aviso mandava cancelar o Pix sem existir onde cancelar.
      if (e?.response?.status === 409) setPixTravando(true)
      else toast.error(e?.response?.data?.message ?? 'Erro ao alterar quantidade')
    } finally { setEditQtySaving(false) }
  }

  /** Encerra a cobrança aberta do pedido e libera a edição da quantidade. */
  async function handleCancelarPix() {
    if (!editQty) return
    setCancelandoPix(true)
    try {
      await reservationApi.cancelarPix(editQty.reservationGroupId)
      toast.success('Cobrança Pix cancelada — pode salvar a nova quantidade')
      setPixTravando(false)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Não deu pra cancelar a cobrança')
    } finally { setCancelandoPix(false) }
  }

  // Um card por carrinho; editar quantidade/cancelar continuam sendo ações por item.
  function renderCard(cart: ReservationCart) {
    const r = cart.representative
    const aguardandoPagamento = !!cart.expiresAt
    const releaseDate = cart.items.find(item => item.preVendaReleaseDate)?.preVendaReleaseDate
    return (
      <div key={cart.groupId} className="card !p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-white text-xs">
              {cart.items.length > 1 ? `Carrinho com ${cart.items.length} itens` : r.productName}
            </p>
            <strong className="text-emerald-400 text-xs whitespace-nowrap">
              R$ {cart.totalEmReais.toFixed(2).replace('.', ',')}
            </strong>
          </div>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><UserIcon className="w-2.5 h-2.5" />{r.userName ?? 'Cliente'}</span>
          </div>

          <div className="mt-2 space-y-1.5">
            {cart.items.map(item => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg bg-surface-700/60 px-2 py-1.5">
                <div className="w-8 h-8 rounded-md bg-surface-600 shrink-0 overflow-hidden flex items-center justify-center">
                  {item.productImageUrl
                    ? <img src={item.productImageUrl} alt={item.productName} className="w-full h-full object-cover" />
                    : <Package className="w-3.5 h-3.5 text-surface-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-200 truncate">
                    {item.productName}{item.variantLabel ? ` · ${item.variantLabel}` : ''}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {item.quantity}×{item.subtotalEmReais != null ? ` · R$ ${item.subtotalEmReais.toFixed(2).replace('.', ',')}` : ''}
                  </p>
                </div>
                <button onClick={() => openEditQty(item)} title="Corrigir quantidade"
                  className="p-1 rounded text-brand-300 hover:bg-brand-500/15"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => handleCancel(item)} title="Cancelar este item"
                  className="p-1 rounded text-red-400 hover:bg-red-500/15"><XCircle className="w-3 h-3" /></button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {cart.items.length > 1 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/15 text-purple-300">
                <Layers className="w-2.5 h-2.5" />
                Mesmo pedido
              </span>
            )}
            {pixByGroup[r.reservationGroupId]?.hasPix && (
              pixByGroup[r.reservationGroupId]?.status === 'CONCLUIDA' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-500/30 bg-green-500/15 text-green-400">
                  <QrCode className="w-2.5 h-2.5" /> Pago via Pix
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-400">
                  <QrCode className="w-2.5 h-2.5" /> Pix pendente
                </span>
              )
            )}
            {releaseDate && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-400">
                Lançamento {new Date(releaseDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
              </span>
            )}
          </div>

          {aguardandoPagamento && (
            <p className="flex items-center gap-1 text-[11px] text-amber-400 mt-1 font-semibold">
              <TimerIcon className="w-2.5 h-2.5" />Aguardando pagamento
            </p>
          )}
          {!aguardandoPagamento && (
            <p className="flex items-center gap-1 text-[11px] text-green-400 mt-1">
              <CheckCircle className="w-2.5 h-2.5" />Paga — aguardando retirada
            </p>
          )}
          {r.notes && <p className="text-[11px] text-gray-500 mt-1 italic truncate">"{r.notes}"</p>}

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button onClick={() => openHomModal(r)}
                className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30
                           hover:bg-green-500/30 text-[11px] font-semibold transition-colors flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Homologar
              </button>
              {cart.expiresAt && (
                <button onClick={() => setPixGroup(r)}
                  title="Gerar/copiar o código Pix pra mandar no WhatsApp"
                  className="px-2 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/25
                             hover:bg-purple-500/20 text-[11px] font-semibold transition-colors flex items-center gap-1">
                  <QrCode className="w-3 h-3" /> Pix
                </button>
              )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <Toaster />

      <PageHeader
        title="Pedidos"
        subtitle="Vendas e pré-vendas do site · mesma lógica, colunas separadas pela tag do produto"
        actions={
          <>
            <button
              onClick={() => setShowNova(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold transition-colors">
              <Plus className="w-4 h-4" /> Nova pré-venda
            </button>
            <button
              onClick={refreshAll}
              className="p-2 rounded-xl bg-surface-700 hover:bg-surface-500 transition-colors text-gray-400">
              <RefreshCw className="w-4 h-4" />
            </button>
          </>
        }
      />

      {/* Faixa de métricas — mesmo padrão da barra do Painel Geral (slim, divisória entre itens) */}
      <div className="card py-2.5 px-3 sm:px-4">
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:divide-x sm:divide-surface-500 gap-3 sm:gap-0">
          {[
            { label: 'Em aberto', value: String(totalEmAberto),                                    icon: LayoutList,   color: 'text-brand-400' },
            { label: 'Já pago',   value: `R$ ${jaPagoValor.toFixed(2).replace('.', ',')}`,          icon: CheckCircle,  color: 'text-emerald-400' },
            { label: 'A receber', value: `R$ ${aReceberValor.toFixed(2).replace('.', ',')}`,        icon: Wallet,       color: 'text-amber-400' },
            { label: 'Na fila',   value: String(totalNaFila),                                       icon: Users,        color: totalNaFila > 0 ? 'text-purple-400' : 'text-gray-500' },
          ].map((m, i) => (
            <div key={m.label} className={clsx(
              'flex items-center gap-2 sm:shrink-0',
              i === 0 ? 'sm:pr-4' : 'sm:px-4',
              'bg-surface-700 sm:bg-transparent rounded-lg sm:rounded-none p-2.5 sm:p-0'
            )}>
              <m.icon className={clsx('w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0', m.color)} />
              <div className="min-w-0">
                <span className={clsx('text-sm font-bold font-mono block', m.color)}>{m.value}</span>
                <span className="text-xs text-gray-500 block sm:inline sm:ml-1">{m.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Kanban de pedidos: Vendas × Pré-vendas ── */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <KanbanColumn
            title="Vendas" subtitle="produto sem tag de pré-venda"
            icon={<ShoppingCart className="w-4 h-4 text-blue-400" />} tint="border-blue-500/20"
            lanesData={vendasLanes} renderCard={renderCard}
          />
          <KanbanColumn
            title="Pré-vendas" subtitle="produto marcado como pré-venda"
            icon={<Trophy className="w-4 h-4 text-amber-400" />} tint="border-amber-500/20"
            lanesData={preVendasLanes} renderCard={renderCard}
          />
        </div>
      )}

      {/* ── Fila de espera (manual): dobrável, na mesma tela — pedido sem estoque
           combinado pelo WhatsApp. Não é mais uma aba separada: é só mais uma
           seção do mesmo painel de pedidos. ── */}
      <div className="card !p-4 mt-5">
        <button onClick={() => setShowFila(v => !v)} className="w-full flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400 shrink-0" />
          <div className="text-left flex-1 min-w-0">
            <p className="font-black text-white text-sm flex items-center gap-1.5">
              Fila de espera (manual)
              {totalNaFila > 0 && (
                <span className="text-[10px] font-black bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">{totalNaFila}</span>
              )}
            </p>
            <p className="text-[10px] text-gray-500">Pedido de item sem estoque combinado pelo WhatsApp</p>
          </div>
          {showFila ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>

      {showFila && (
        <div className="mt-4">
        {wlLoading ? (
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
                                 border border-surface-500 hover:border-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed
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
        )}
        </div>
      )}
      </div>

      {/* Modal de Homologação */}
      {homModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-black text-white">
                {homGroupItems.length > 1 ? `Homologar carrinho de ${homGroupItems.length} itens` : 'Homologar pré-venda'}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">{homModal.userName}</p>

              {homGroupItems.length > 1 ? (
                <>
                  <div className="mt-2 rounded-xl bg-surface-700 border border-surface-500 divide-y divide-surface-500">
                    {homGroupItems.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-xs text-gray-300 truncate">
                          {r.quantity}x {r.productName}
                          {r.variantLabel && <span className="text-gray-500"> · {r.variantLabel}</span>}
                        </span>
                        <span className="text-xs text-gray-400 font-mono shrink-0">
                          R$ {(r.subtotalEmReais ?? 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-300/90 mt-2 flex items-start gap-1.5">
                    <Layers className="w-3.5 h-3.5 shrink-0 mt-px" />
                    O cliente reservou tudo junto: confirmar aqui marca os {homGroupItems.length} itens como
                    retirados e lança <strong>uma venda só</strong>, com todos eles.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">
                  {homModal.productName} · {homModal.quantity}x
                </p>
              )}

              <p className="text-xs text-gray-500 mt-1">
                O estoque já foi baixado quando a pré-venda foi criada — aqui só registra a venda.
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-2 block font-semibold">Forma de pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m} onClick={() => setHomPayment(m)}
                    className={clsx(
                      'py-2 rounded-lg text-xs font-semibold border transition-colors',
                      homPayment === m
                        ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                        : 'bg-surface-700 text-gray-400 border-surface-500'
                    )}>
                    {m}
                  </button>
                ))}
              </div>

              <button onClick={() => setHomSplit(v => !v)}
                className="text-xs text-brand-300 hover:text-brand-200 font-semibold mt-3 flex items-center gap-1">
                {homSplit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Dividir pagamento em duas formas
              </button>

              {homSplit && (
                <div className="mt-3 p-3 rounded-xl bg-surface-700 border border-surface-500 space-y-2">
                  <label className="text-xs text-gray-400 block font-semibold">Segunda forma de pagamento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.filter(m => m !== homPayment).map(m => (
                      <button key={m} onClick={() => setHomSecondPayment(m)}
                        className={clsx(
                          'py-2 rounded-lg text-xs font-semibold border transition-colors',
                          homSecondPayment === m
                            ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                            : 'bg-surface-800 text-gray-400 border-surface-500'
                        )}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <label className="text-xs text-gray-400 block font-semibold mt-1">Valor pago nessa segunda forma (R$)</label>
                  <input
                    type="text" inputMode="decimal" value={homSecondAmount}
                    onChange={e => setHomSecondAmount(e.target.value)}
                    placeholder="0,00"
                    className="input w-full"
                  />
                  {homSubtotalCents > 0 && (
                    <p className="text-[11px] text-gray-500">
                      Total do pedido: R$ {(homSubtotalCents / 100).toFixed(2).replace('.', ',')} · resto fica em {homPayment || '—'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Desconto — decidido só agora, na homologação; o cliente não viu isso antes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Desconto
                </p>
                <div className="flex gap-1 bg-surface-900 rounded-lg p-0.5">
                  {(['percent', 'cents'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setHomDiscountMode(mode)}
                      className={clsx(
                        'px-2.5 py-1 rounded-md text-[11px] font-bold transition-all',
                        homDiscountMode === mode
                          ? 'bg-accent-green/20 text-accent-green'
                          : 'text-gray-500 hover:text-gray-300'
                      )}
                    >{mode === 'percent' ? '%' : 'R$'}</button>
                  ))}
                </div>
              </div>

              {homDiscountMode === 'percent' ? (
                <PercentPicker value={homDiscountPct} onChange={setHomDiscountPct} />
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={homDiscountValueStr}
                  onChange={e => setHomDiscountValueStr(e.target.value)}
                  className="input text-sm w-full font-mono"
                />
              )}

              {homSubtotalCents > 0 && homDiscountCents > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">
                  Subtotal R$ {(homSubtotalCents / 100).toFixed(2).replace('.', ',')} − desconto
                  R$ {(homDiscountCents / 100).toFixed(2).replace('.', ',')} = <span className="text-gray-300 font-semibold">
                  R$ {(homTotalCents / 100).toFixed(2).replace('.', ',')}</span>
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setHomModal(null)} disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={handleHomologar} disabled={submitting}
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

      {/* Modal: corrigir a quantidade de um pedido lançado errado */}
      {editQty && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-2xl w-full max-w-sm p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-black text-white">Editar quantidade</h2>
              <p className="text-sm text-gray-400 mt-0.5">{editQty.productName} · {editQty.userName}</p>
              {editQty.kind === 'pre_venda' && (
                <p className="text-xs text-gray-500 mt-1">
                  Aumentar baixa mais estoque; diminuir devolve a diferença pra loja.
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setEditQtyValue(v => Math.max(1, v - 1))}
                className="w-10 h-10 rounded-xl bg-surface-700 hover:bg-surface-500 text-white text-lg font-bold transition-colors">
                −
              </button>
              <input
                type="number" min={1} value={editQtyValue}
                onChange={e => setEditQtyValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 text-center bg-surface-700 border border-surface-500 rounded-xl py-2 text-white text-lg font-black"
              />
              <button onClick={() => setEditQtyValue(v => v + 1)}
                className="w-10 h-10 rounded-xl bg-surface-700 hover:bg-surface-500 text-white text-lg font-bold transition-colors">
                +
              </button>
            </div>

            {pixTravando && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200 leading-relaxed">
                    Este pedido tem uma cobrança Pix aberta. Mudar a quantidade agora deixaria
                    o valor cobrado errado. Se o cliente pagou por fora (chave da loja) ou
                    desistiu do Pix, cancele a cobrança e salve de novo.
                  </p>
                </div>
                <button onClick={handleCancelarPix} disabled={cancelandoPix}
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40
                             text-surface-900 text-xs font-black transition-colors flex items-center justify-center gap-2">
                  {cancelandoPix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Cancelar cobrança Pix
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditQty(null)} disabled={editQtySaving}
                className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={handleSaveQty} disabled={editQtySaving || editQtyValue === editQty.quantity}
                className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40
                           text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {editQtySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
