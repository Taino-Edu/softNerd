'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { comandaApi, crediarioApi, userApi, productApi, analyticsApi, championshipApi, lgpdAdminApi, notificationsApi, reservationApi, fiscalApi, ComandaDto, ComandaItemDto, UserSummary, Product, COMANDA_PAYMENT_METHODS, FinanceiroDto, ClienteInsightDto, LgpdRequestDto, DashChartScheme, EditarComandaRequest, EditarItemRequest, CrediariosDto } from '@/lib/api'
import { usePreferences } from '@/hooks/usePreferences'
import { startHub, stopHub, ComandaUpdatedEvent } from '@/lib/signalr'
import { playGoalSound } from '@/lib/sounds'
import { tocarSom, notificarBrowser, pedirPermissaoNotificacao, incrementBadge, clearBadge } from '@/lib/notificacoes'
import CameraScanner from '@/components/CameraScanner'
import { CobrancaPixModal } from '@/components/admin/CobrancaPixModal'
import toast from 'react-hot-toast'
import {
  Wifi, WifiOff, RefreshCw, Users, TrendingUp,
  Clock, CheckCircle, XCircle, Plus, ChevronDown, ChevronUp,
  History, Search, Loader2, TableProperties, Trash2, CreditCard, ScanBarcode, Camera,
  AlertTriangle, DollarSign, BarChart2, Trophy, Medal, Star, FolderOpen, Package, Shield, MessageCircle,
  Pencil, X, UserSearch, QrCode, Receipt,
} from 'lucide-react'
import clsx from 'clsx'

const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

/** Após um fechamento com "Emitir cupom fiscal" marcado: abre o cupom sozinho se autorizou,
 * ou avisa o motivo se rejeitou/ficou pendente (SEFAZ fora do ar — o retry automático tenta de novo). */
function handleNotaFiscalResult(notaId?: string | null, status?: string | null, motivo?: string | null) {
  if (!status) return
  if (status === 'Autorizada' && notaId) {
    window.open(`/admin/fiscal/cupom/${notaId}`, '_blank')
  } else {
    toast.error(`Nota fiscal não autorizou ainda (${status})${motivo ? ' — ' + motivo : ''}. O sistema tenta de novo automaticamente.`)
  }
}

/** Data de hoje no fuso de Brasília como YYYY-MM-DD (nunca usa UTC). */
const brToday = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

// ── Mini gráfico de barras (últimos 7 dias) ───────────────────────────────────
const CHART_SCHEMES: Record<DashChartScheme, { melhor: string; acima: string; normal: string; abaixo: string; hoje: string }> = {
  default: { melhor: 'bg-accent-gold', acima: 'bg-accent-green', normal: 'bg-brand-600', abaixo: 'bg-red-400',    hoje: 'bg-brand-400'   },
  blue:    { melhor: 'bg-cyan-300',    acima: 'bg-brand-400',    normal: 'bg-brand-600', abaixo: 'bg-blue-900',   hoje: 'bg-cyan-400'    },
  neon:    { melhor: 'bg-violet-400',  acima: 'bg-emerald-400',  normal: 'bg-fuchsia-500', abaixo: 'bg-orange-500', hoje: 'bg-violet-300' },
}

function MiniBarChart({ dias, open, onToggle, scheme }: { dias: FinanceiroDto['diaDia']; open: boolean; onToggle: () => void; scheme: DashChartScheme }) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (!dias || dias.length === 0) return null

  const colors  = CHART_SCHEMES[scheme] ?? CHART_SCHEMES.default
  const maxVal  = Math.max(...dias.map(d => d.receita), 1)
  const avgVal  = dias.reduce((s, d) => s + d.receita, 0) / dias.length
  const lastIdx = dias.length - 1
  const BAR_H   = 60

  function barClass(receita: number, i: number) {
    const isToday = i === lastIdx
    const isMax   = receita === maxVal && receita > 0
    const ratio   = avgVal > 0 ? receita / avgVal : 1
    if (isToday && isMax) return colors.melhor
    if (isToday)          return colors.hoje
    if (isMax)            return colors.melhor
    if (ratio >= 1.15)    return colors.acima
    if (ratio <= 0.6)     return colors.abaixo
    return colors.normal
  }

  return (
    <div className="card">
      <button onClick={onToggle} className="w-full flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-400" /> Receita — últimos 7 dias
        </h3>
        <div className="flex items-center gap-3">
          <a href="/admin/financeiro" onClick={e => e.stopPropagation()} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
            Ver relatório →
          </a>
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {open && <>
        <div className="flex items-end gap-1.5 mt-3" style={{ height: `${BAR_H}px` }}>
          {dias.map((d, i) => {
            const barH    = Math.max(3, Math.round((d.receita / maxVal) * BAR_H))
            const isHov   = hovered === i
            const isToday = i === lastIdx
            return (
              <div
                key={d.dia}
                className="flex-1 relative cursor-pointer"
                style={{ height: `${barH}px` }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {isHov && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-surface-700 border border-surface-500 rounded px-2 py-1 text-xs text-white whitespace-nowrap z-10 pointer-events-none">
                    {isToday ? 'Hoje' : d.dia.slice(5).replace('-', '/')}: {fmt(d.receita)}
                  </div>
                )}
                <div className={`w-full h-full rounded-t transition-all duration-150 ${barClass(d.receita, i)} ${isHov ? 'opacity-70' : ''}`} />
              </div>
            )
          })}
        </div>
        <div className="flex gap-1.5 mt-1">
          {dias.map((d, i) => (
            <span key={d.dia} className={`flex-1 text-center text-[9px] leading-none ${i === lastIdx ? 'text-brand-400 font-semibold' : 'text-gray-500'}`}>
              {i === lastIdx ? 'hoje' : d.dia.slice(8)}
            </span>
          ))}
        </div>
      </>}
    </div>
  )
}

function elapsedLabel(openedAt: string) {
  const mins = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000)
  return mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${mins % 60}min`
}

function elapsedColor(openedAt: string) {
  const mins = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000)
  if (mins < 20) return 'text-accent-green'
  if (mins < 45) return 'text-amber-400'
  return 'text-red-400'
}

// ── Modal: adicionar item a uma comanda ───────────────────────────────────────

function AddItemModal({
  comandaId, onClose, onAdded,
}: {
  comandaId: string
  onClose: () => void
  onAdded: (updated: ComandaDto) => void
}) {
  const [products, setProducts]         = useState<Product[]>([])
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [mode, setMode]                 = useState<'search' | 'barcode'>('search')
  const [cameraOpen, setCameraOpen]     = useState(false)
  const barcodeRef                      = useRef<HTMLInputElement>(null)

  useEffect(() => {
    productApi.listAdmin()
      .then(r => setProducts(r.data.filter(p => p.isActive && p.stockQuantity > 0)))
      .catch(() => toast.error('Erro ao carregar produtos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mode === 'barcode') setTimeout(() => barcodeRef.current?.focus(), 100)
  }, [mode])

  async function handleAdd(product: Product) {
    setAdding(product.id)
    try {
      const effectivePrice = product.isOnPromo && product.discountPriceInCents != null
        ? product.discountPriceInCents : product.priceInCents
      const { data } = await comandaApi.addItem(comandaId, {
        productId:        product.id,
        itemName:         product.name,
        unitPriceInCents: effectivePrice,
        quantity:         1,
      })
      onAdded(data)
      toast.success(`${product.name} adicionado!`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao adicionar item.')
    } finally {
      setAdding(null)
    }
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code) return
    setBarcodeLoading(true)
    try {
      const { data } = await productApi.getByBarcode(code)
      await handleAdd(data)
      setBarcodeInput('')
    } catch {
      toast.error('Produto não encontrado para este código de barras.')
    } finally {
      setBarcodeLoading(false)
      barcodeRef.current?.focus()
    }
  }

  async function handleCameraDetect(code: string) {
    setCameraOpen(false)
    setBarcodeLoading(true)
    try {
      const { data } = await productApi.getByBarcode(code)
      await handleAdd(data)
      setBarcodeInput('')
    } catch {
      toast.error('Produto não encontrado para este código de barras.')
    } finally {
      setBarcodeLoading(false)
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
    {cameraOpen && (
      <CameraScanner
        onDetected={handleCameraDetect}
        onClose={() => setCameraOpen(false)}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-md max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-500">
          <h3 className="font-semibold text-white">Adicionar produto à comanda</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs busca / barcode */}
        <div className="flex border-b border-surface-500">
          <button
            onClick={() => setMode('search')}
            className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
              mode === 'search' ? 'text-brand-400 border-b-2 border-brand-400 -mb-px' : 'text-gray-500 hover:text-gray-300')}
          >
            <Search className="w-3.5 h-3.5" /> Buscar
          </button>
          <button
            onClick={() => setMode('barcode')}
            className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
              mode === 'barcode' ? 'text-brand-400 border-b-2 border-brand-400 -mb-px' : 'text-gray-500 hover:text-gray-300')}
          >
            <ScanBarcode className="w-3.5 h-3.5" /> Código de Barras
          </button>
        </div>

        {mode === 'barcode' ? (
          <form onSubmit={handleBarcodeSubmit} className="p-4 space-y-3">
            <p className="text-xs text-gray-500">Clique no campo e escaneie com o leitor USB ou use a câmera.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  ref={barcodeRef}
                  className="input pl-9 font-mono"
                  placeholder="Aguardando leitura..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="shrink-0 px-3 rounded-lg bg-surface-600 hover:bg-brand-600/20 border border-surface-500 hover:border-brand-500/40 text-gray-400 hover:text-brand-400 transition-colors"
                title="Usar câmera"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <button
              type="submit"
              disabled={!barcodeInput.trim() || barcodeLoading}
              className="btn-primary w-full justify-center"
            >
              {barcodeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {barcodeLoading ? 'Buscando...' : 'Adicionar'}
            </button>
          </form>
        ) : (
          <>
            <div className="p-3 border-b border-surface-500">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  autoFocus
                  className="input pl-9 text-sm"
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Nenhum produto encontrado</p>
              ) : (
                filtered.map(p => {
                  const onPromo = p.isOnPromo && p.discountPriceInReais != null
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleAdd(p)}
                      disabled={adding === p.id}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-500 transition-colors text-left disabled:opacity-50"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-white font-medium">{p.name}</p>
                          {onPromo && (
                            <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400">
                              Promoção
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{p.category} · {p.stockQuantity} un.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {onPromo ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-gray-500 line-through">{fmt(p.priceInReais)}</span>
                            <span className="text-red-400 text-sm font-bold">{fmt(p.discountPriceInReais!)}</span>
                          </div>
                        ) : (
                          <span className="text-accent-gold text-sm font-bold">{fmt(p.priceInReais)}</span>
                        )}
                        {adding === p.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                          : <Plus className="w-4 h-4 text-brand-400" />
                        }
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}

// ── Modal: Admin abre comanda por um cliente ──────────────────────────────────

function AdminOpenModal({
  onConfirm, onCancel,
}: {
  onConfirm: (userId: string, tableIdentifier: string) => Promise<void>
  onCancel:  () => void
}) {
  const [search,   setSearch]   = useState('')
  const [users,    setUsers]    = useState<UserSummary[]>([])
  const [selected, setSelected] = useState<UserSummary | null>(null)
  const [table,    setTable]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    setLoading(true)
    userApi.list(search || undefined)
      .then(r => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search])

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await onConfirm(selected.id, table.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-sm flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-500">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-brand-400" /> Abrir Comanda
          </h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300"><XCircle className="w-5 h-5" /></button>
        </div>

        <div className="p-3 border-b border-surface-500">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              autoFocus
              className="input pl-9 text-sm"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">Nenhum cliente encontrado</p>
          ) : (
            users.map(u => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors text-white',
                  selected?.id === u.id
                    ? 'bg-brand-500/25 border-l-2 border-brand-400'
                    : 'hover:bg-surface-700'
                )}
              >
                <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 font-bold text-sm shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.name}</p>
                  {u.email && <p className="text-xs text-gray-400 truncate">{u.email}</p>}
                </div>
                {selected?.id === u.id && <CheckCircle className="w-4 h-4 text-brand-400 ml-auto shrink-0" />}
              </button>
            ))
          )}
        </div>

        {selected && (
          <div className="p-3 border-t border-surface-500 space-y-3">
            <div>
              <label className="label text-xs">Mesa / Identificador (opcional)</label>
              <input
                className="input text-sm"
                placeholder="Ex: Mesa 3, Balcão..."
                value={table}
                onChange={e => setTable(e.target.value)}
              />
            </div>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="btn-primary w-full justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
              Abrir para {selected.name.split(' ')[0]}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card de Comanda ───────────────────────────────────────────────────────────

// Métodos aceitos como segundo pagamento (Crediario não faz sentido como secundário)
const SECOND_PAYMENT_METHODS = [
  { value: 'Cashback',      label: 'Cashback (Saldo)' },
  { value: 'Pontos',        label: 'Pontos de Fidelidade' },
  { value: 'Dinheiro',      label: 'Dinheiro' },
  { value: 'Pix',           label: 'Pix' },
  { value: 'CartaoCredito', label: 'Cartão de Crédito' },
  { value: 'CartaoDebito',  label: 'Cartão de Débito' },
]

// ── Modal: escolher conta de crediário ───────────────────────────────────────

function EscolherContaCrediarioModal({
  userName,
  contasAbertas,
  valorNovo,
  onEscolher,
  onNova,
  onCancel,
}: {
  userName:      string
  contasAbertas: CrediariosDto[]
  valorNovo:     number
  onEscolher:    (crediarioId: string) => void
  onNova:        () => void
  onCancel:      () => void
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-surface-600">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" /> Conta de Crediário
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {userName} já tem {contasAbertas.length} conta{contasAbertas.length > 1 ? 's' : ''} em aberto
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Adicionar a uma conta existente</p>

          {contasAbertas.map(c => {
            const sel = escolhido === c.id
            return (
              <button
                key={c.id}
                onClick={() => setEscolhido(sel ? null : c.id)}
                className={clsx(
                  'w-full text-left rounded-xl border px-4 py-3 transition-all',
                  sel
                    ? 'border-amber-400 bg-amber-400/10'
                    : 'border-surface-500 bg-surface-700 hover:border-surface-400'
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-white">
                    Saldo em aberto: <span className="text-accent-gold">{fmt(c.saldoRestanteEmReais)}</span>
                    {c.vencido && <span className="ml-2 text-[10px] text-red-400 font-semibold">[VENCIDO]</span>}
                  </span>
                  <span className={clsx('w-4 h-4 rounded-full border-2 shrink-0',
                    sel ? 'border-amber-400 bg-amber-400' : 'border-gray-500'
                  )} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Vence {new Date(c.dataVencimento).toLocaleDateString('pt-BR')} ·{' '}
                  {c.observacao ?? 'Sem observação'}
                </p>
                {sel && (
                  <p className="text-xs text-amber-300 mt-1">
                    Novo total: {fmt(c.saldoRestanteEmReais + valorNovo / 100)}
                  </p>
                )}
              </button>
            )
          })}

          <div className="border-t border-surface-600 pt-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">Ou criar conta nova</p>
            <button
              onClick={() => setEscolhido('__nova__')}
              className={clsx(
                'w-full text-left rounded-xl border px-4 py-3 transition-all',
                escolhido === '__nova__'
                  ? 'border-brand-400 bg-brand-400/10'
                  : 'border-surface-500 bg-surface-700 hover:border-surface-400'
              )}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-white">Nova conta — prazo 30 dias</span>
                <span className={clsx('w-4 h-4 rounded-full border-2 shrink-0',
                  escolhido === '__nova__' ? 'border-brand-400 bg-brand-400' : 'border-gray-500'
                )} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Dívida independente com vencimento próprio</p>
            </button>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!escolhido) return
              if (escolhido === '__nova__') onNova()
              else onEscolher(escolhido)
            }}
            disabled={!escolhido}
            className="btn-primary flex-1 justify-center"
          >
            <CheckCircle className="w-4 h-4" /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: selecionar pagamento ao fechar comanda ────────────────────────────

function CloseComandaModal({
  comanda, onConfirm, onCancel, onGerarPix, autoEmitMethods,
}: {
  comanda:   ComandaDto
  onConfirm: (paymentMethod: string, secondMethod?: string, secondAmountInCents?: number, discountInCents?: number, emitirNotaFiscal?: boolean) => void
  onCancel:  () => void
  onGerarPix: () => void
  autoEmitMethods: string[]
}) {
  const [method,        setMethod]        = useState('Dinheiro')
  const [splitEnabled,  setSplitEnabled]  = useState(false)
  const [secondMethod,  setSecondMethod]  = useState('Cashback')
  const [secondAmtStr,  setSecondAmtStr]  = useState('')
  const [descontoStr,   setDescontoStr]   = useState('')
  const [emitirNota,    setEmitirNota]    = useState(() => autoEmitMethods.includes('Dinheiro'))
  const [notaTouched,   setNotaTouched]   = useState(false)

  useEffect(() => {
    if (!notaTouched) setEmitirNota(autoEmitMethods.includes(method))
  }, [method, autoEmitMethods, notaTouched])

  const totalAntesDesconto = comanda.totalInReais - comanda.pointsApplied / 100
  const descontoCents  = Math.min(
    Math.round(parseFloat(descontoStr.replace(',', '.') || '0') * 100),
    Math.round(totalAntesDesconto * 100),
  )
  const totalRestante  = totalAntesDesconto - descontoCents / 100
  const saldoCashback  = comanda.userBalanceInCents / 100
  const saldoPontos    = comanda.userPointsBalance

  const secondAmtCents = splitEnabled ? Math.round(parseFloat(secondAmtStr || '0') * 100) : 0
  const primaryAmtCents = Math.round(totalRestante * 100) - secondAmtCents
  const primaryAmtReais = primaryAmtCents / 100

  // Validações
  const semSaldoCashback = method === 'Cashback' && !splitEnabled && saldoCashback < totalRestante
  const semSaldoPontos   = method === 'Pontos'   && !splitEnabled && saldoPontos < Math.round(totalRestante * 100)
  const splitInvalido    = splitEnabled && (secondAmtCents <= 0 || secondAmtCents >= Math.round(totalRestante * 100))
  const splitSemCashback = splitEnabled && secondMethod === 'Cashback' && secondAmtCents > comanda.userBalanceInCents
  const splitSemPontos   = splitEnabled && secondMethod === 'Pontos'   && secondAmtCents > saldoPontos
  const bloqueado = semSaldoCashback || semSaldoPontos || splitInvalido || splitSemCashback || splitSemPontos

  function handleConfirm() {
    if (splitEnabled && secondAmtCents > 0)
      onConfirm(method, secondMethod, secondAmtCents, descontoCents, emitirNota)
    else
      onConfirm(method, undefined, undefined, descontoCents, emitirNota)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-semibold text-white text-lg">Fechar comanda</h3>
          <p className="text-gray-400 text-sm mt-1">
            {comanda.userName} · <span className="text-accent-gold font-bold">{`R$ ${totalRestante.toFixed(2).replace('.', ',')}`}</span>
          </p>
          {(saldoPontos > 0 || saldoCashback > 0) && (
            <div className="flex gap-3 mt-2">
              {saldoPontos > 0 && (
                <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                  {saldoPontos} pts
                </span>
              )}
              {saldoCashback > 0 && (
                <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                  R$ {saldoCashback.toFixed(2).replace('.', ',')} cashback
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Desconto (R$)</p>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={descontoStr}
            onChange={e => setDescontoStr(e.target.value)}
            className="input text-sm w-full font-mono"
          />
          {descontoCents > 0 && (
            <p className="text-xs text-accent-green mt-1">
              Total após desconto: R$ {totalRestante.toFixed(2).replace('.', ',')}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
            {splitEnabled ? 'Pagamento principal (restante)' : 'Forma de pagamento'}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {COMANDA_PAYMENT_METHODS.map(pm => (
              <button
                key={pm.value}
                onClick={() => setMethod(pm.value)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                  method === pm.value
                    ? pm.value === 'Crediario'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                      : 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'border-surface-500 text-gray-400 hover:border-surface-400 hover:text-gray-200'
                )}
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span className="flex-1">{pm.label}</span>
                {splitEnabled && method === pm.value && (
                  <span className="text-xs font-mono text-white">
                    R$ {primaryAmtReais > 0 ? primaryAmtReais.toFixed(2).replace('.', ',') : '—'}
                  </span>
                )}
                {!splitEnabled && pm.value === 'Crediario' && (
                  <span className="text-xs text-amber-400/70 font-normal">acumula no saldo</span>
                )}
                {!splitEnabled && pm.value === 'Cashback' && saldoCashback > 0 && (
                  <span className="text-xs text-emerald-400/70 font-normal">
                    R$ {saldoCashback.toFixed(2).replace('.', ',')} disp.
                  </span>
                )}
                {!splitEnabled && pm.value === 'Pontos' && saldoPontos > 0 && (
                  <span className="text-xs text-amber-400/70 font-normal">
                    {saldoPontos} pts disp.
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle split */}
        <button
          onClick={() => { setSplitEnabled(v => !v); setSecondAmtStr('') }}
          className={clsx(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all',
            splitEnabled
              ? 'bg-brand-600/10 border-brand-500/40 text-brand-300'
              : 'border-surface-500 text-gray-500 hover:border-surface-400 hover:text-gray-300'
          )}
        >
          <span className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5" />
            Dividir em dois métodos de pagamento
          </span>
          <span className={clsx('w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0',
            splitEnabled ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-400'
          )}>
            {splitEnabled && '✓'}
          </span>
        </button>

        {/* Segundo pagamento */}
        {splitEnabled && (
          <div className="bg-surface-800 rounded-xl p-3 space-y-3">
            <p className="text-xs text-gray-400 font-medium">Segundo pagamento</p>
            <select
              value={secondMethod}
              onChange={e => setSecondMethod(e.target.value)}
              className="input text-sm w-full"
            >
              {SECOND_PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor (R$)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={(totalRestante - 0.01).toFixed(2)}
                placeholder="0,00"
                value={secondAmtStr}
                onChange={e => setSecondAmtStr(e.target.value)}
                className="input text-sm w-full font-mono"
              />
              {secondMethod === 'Cashback' && saldoCashback > 0 && (
                <button
                  type="button"
                  onClick={() => setSecondAmtStr(Math.min(saldoCashback, totalRestante - 0.01).toFixed(2))}
                  className="mt-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Usar tudo (R$ {saldoCashback.toFixed(2).replace('.', ',')})
                </button>
              )}
              {secondMethod === 'Pontos' && saldoPontos > 0 && (
                <button
                  type="button"
                  onClick={() => setSecondAmtStr((Math.min(saldoPontos, Math.round(totalRestante * 100) - 1) / 100).toFixed(2))}
                  className="mt-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Usar tudo ({saldoPontos} pts = R$ {(saldoPontos / 100).toFixed(2).replace('.', ',')})
                </button>
              )}
            </div>
            {secondAmtCents > 0 && primaryAmtCents > 0 && !splitInvalido && (
              <div className="text-xs text-gray-400 pt-1 border-t border-surface-600 space-y-1">
                <div className="flex justify-between">
                  <span>{SECOND_PAYMENT_METHODS.find(m => m.value === secondMethod)?.label}:</span>
                  <span className="text-white font-mono">R$ {(secondAmtCents / 100).toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{COMANDA_PAYMENT_METHODS.find(m => m.value === method)?.label ?? method}:</span>
                  <span className="text-white font-mono">R$ {(primaryAmtCents / 100).toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {method === 'Crediario' && !splitEnabled && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
            O valor será acumulado no saldo devedor do cliente. Novas comandas podem ser abertas normalmente.
          </div>
        )}
        {method === 'Crediario' && splitEnabled && secondAmtCents > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
            R$ {(primaryAmtCents / 100).toFixed(2).replace('.', ',')} irá para o crediário. O restante já foi quitado.
          </div>
        )}
        {semSaldoCashback && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Saldo insuficiente. Cliente tem R$ {saldoCashback.toFixed(2).replace('.', ',')} mas a comanda custa R$ {totalRestante.toFixed(2).replace('.', ',')}.
          </div>
        )}
        {semSaldoPontos && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Pontos insuficientes. Cliente tem {saldoPontos} pts mas a comanda requer {Math.round(totalRestante * 100)} pts.
          </div>
        )}
        {splitSemCashback && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Cashback insuficiente. Cliente tem R$ {saldoCashback.toFixed(2).replace('.', ',')} mas foi solicitado R$ {(secondAmtCents / 100).toFixed(2).replace('.', ',')}.
          </div>
        )}
        {splitSemPontos && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Pontos insuficientes para o segundo pagamento. Cliente tem {saldoPontos} pts, solicitado {secondAmtCents} pts.
          </div>
        )}
        {splitEnabled && splitInvalido && secondAmtStr !== '' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            O segundo valor deve ser maior que zero e menor que o total (R$ {totalRestante.toFixed(2).replace('.', ',')}).
          </div>
        )}

        {method === 'Pix' && !splitEnabled && (
          <p className="text-xs text-gray-500 -mt-1">
            Cliente já pagou por fora? Use "Confirmar" direto. Pra gerar um QR Code de cobrança, use "Gerar QR Pix".
          </p>
        )}

        <button
          type="button"
          onClick={() => { setEmitirNota(v => !v); setNotaTouched(true) }}
          className={clsx(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all',
            emitirNota
              ? 'bg-brand-600/10 border-brand-500/40 text-brand-300'
              : 'border-surface-500 text-gray-500 hover:border-surface-400 hover:text-gray-300'
          )}
        >
          <span>Emitir cupom fiscal (NFC-e) agora</span>
          <span className={clsx('w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0',
            emitirNota ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-400'
          )}>
            {emitirNota && '✓'}
          </span>
        </button>
        {!emitirNota && (
          <p className="text-xs text-gray-500 -mt-1">
            Sem nota agora. Depois é possível emitir pelo histórico da comanda.
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Voltar</button>
          {method === 'Pix' && !splitEnabled ? (
            <>
              <button
                onClick={handleConfirm}
                disabled={bloqueado}
                className="btn-secondary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4" /> Confirmar
              </button>
              <button
                onClick={onGerarPix}
                className="btn-success flex-1 justify-center"
              >
                <QrCode className="w-4 h-4" /> Gerar QR Pix
              </button>
            </>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={bloqueado}
              className="btn-success flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-4 h-4" /> Confirmar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal de confirmação genérico (cancelar) ──────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, confirmClass, onConfirm, onCancel,
}: {
  title:        string
  message:      string
  confirmLabel: string
  confirmClass: string
  onConfirm:    () => void
  onCancel:     () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white text-lg mb-2">{title}</h3>
        <p className="text-gray-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Voltar</button>
          <button onClick={onConfirm} className={`${confirmClass} flex-1 justify-center`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Card de Comanda ───────────────────────────────────────────────────────────

function ComandaCard({
  comanda, onClose, onCancel, onUpdate, onClosedExternally, isNew, recentChange, autoEmitMethods,
}: {
  comanda: ComandaDto
  onClose:  (id: string, paymentMethod: string, secondMethod?: string, secondAmountInCents?: number, discountInCents?: number, emitirNotaFiscal?: boolean) => void
  onCancel: (id: string) => void
  onUpdate: (updated: ComandaDto, changeType?: 'add' | 'remove') => void
  onClosedExternally: () => void
  isNew:    boolean
  recentChange: 'add' | 'remove' | null
  autoEmitMethods: string[]
}) {
  const [expanded, setExpanded]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [addOpen, setAddOpen]     = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [pixOpen, setPixOpen]     = useState(false)
  const [confirm, setConfirm]     = useState<'cancel' | null>(null)
  const [removingItem, setRemovingItem]   = useState<string | null>(null)
  const [updatingItem, setUpdatingItem]   = useState<string | null>(null)
  const [removingPts,  setRemovingPts]    = useState(false)
  const [, forceRender]           = useState(0)

  // Atualiza o tempo exibido a cada minuto
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Pontos só abatem "de verdade" no fechamento — enquanto aberta, mostra o total já líquido
  // pra não parecer que "usar pontos" não fez nada.
  const netTotal = Math.max(0, comanda.totalInReais - comanda.pointsApplied / 100)

  const statusMap: Record<string, string> = {
    Aberta: 'badge-aberta', EmAndamento: 'badge-andamento',
  }
  const statusLabel: Record<string, string> = {
    Aberta: '● Aberta', EmAndamento: '● Em Andamento',
  }

  async function handleClose(paymentMethod: string, secondMethod?: string, secondAmountInCents?: number, discountInCents?: number, emitirNotaFiscal?: boolean) {
    setCloseOpen(false)
    setLoading(true)
    try { await onClose(comanda.id, paymentMethod, secondMethod, secondAmountInCents, discountInCents, emitirNotaFiscal) } finally { setLoading(false) }
  }
  async function handleCancel() {
    setConfirm(null)
    setLoading(true)
    try { await onCancel(comanda.id) } finally { setLoading(false) }
  }
  async function handleRemoveItem(itemId: string, itemName: string) {
    if (!window.confirm(`Remover "${itemName}" da comanda?`)) return
    setRemovingItem(itemId)
    try {
      const { data } = await comandaApi.removeItem(comanda.id, itemId)
      onUpdate(data, 'remove')
      toast.success('Item removido.')
    } catch {
      toast.error('Erro ao remover item.')
    } finally {
      setRemovingItem(null)
    }
  }
  async function handleRemovePoints() {
    if (!window.confirm('Remover os pontos aplicados e devolver ao saldo do cliente?')) return
    setRemovingPts(true)
    try {
      const { data } = await comandaApi.removePoints(comanda.id)
      onUpdate(data, 'remove')
      toast.success('Pontos removidos e devolvidos ao cliente!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao remover pontos.')
    } finally {
      setRemovingPts(false)
    }
  }

  async function handleUpdateQty(itemId: string, newQty: number) {
    if (newQty < 0) return
    setUpdatingItem(itemId)
    try {
      const { data } = await comandaApi.updateItem(comanda.id, itemId, newQty)
      onUpdate(data)
    } catch {
      toast.error('Erro ao atualizar quantidade.')
    } finally {
      setUpdatingItem(null)
    }
  }

  return (
    <>
      {addOpen && (
        <AddItemModal
          comandaId={comanda.id}
          onClose={() => setAddOpen(false)}
          onAdded={updated => { onUpdate(updated, 'add'); setAddOpen(false) }}
        />
      )}
      {closeOpen && (
        <CloseComandaModal
          comanda={comanda}
          onConfirm={handleClose}
          onCancel={() => setCloseOpen(false)}
          onGerarPix={() => { setCloseOpen(false); setPixOpen(true) }}
          autoEmitMethods={autoEmitMethods}
        />
      )}
      {pixOpen && (
        <CobrancaPixModal
          clienteNome={comanda.userName}
          gerar={() => comandaApi.gerarPix(comanda.id)}
          verificar={txid => comandaApi.statusPix(comanda.id, txid)}
          onClose={() => setPixOpen(false)}
          onSuccess={onClosedExternally}
        />
      )}
      {confirm === 'cancel' && (
        <ConfirmModal
          title="Cancelar comanda"
          message={`Cancelar a comanda de ${comanda.userName}? Esta ação não pode ser desfeita.`}
          confirmLabel="Cancelar comanda"
          confirmClass="btn-danger"
          onConfirm={handleCancel}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className={clsx(
        'card flex flex-col gap-3 transition-all duration-300',
        isNew && 'flash-new border-brand-500/50',
        recentChange === 'add'    && 'ring-2 ring-green-500/60 shadow-[0_0_12px_rgba(34,197,94,0.25)]',
        recentChange === 'remove' && 'ring-2 ring-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]',
      )}>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {/* Avatar */}
            {comanda.profileImageUrl ? (
              <img
                src={comanda.profileImageUrl}
                alt=""
                className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5 ring-2 ring-surface-600"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-brand-600/25 flex items-center justify-center shrink-0 mt-0.5 ring-2 ring-surface-600">
                <span className="text-sm font-bold text-brand-300 leading-none">
                  {comanda.userName[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={statusMap[comanda.status] ?? 'badge'}>{statusLabel[comanda.status]}</span>
                {recentChange === 'add' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">+ adicionado</span>
                )}
                {recentChange === 'remove' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">− removido</span>
                )}
              </div>
              <p className="font-semibold text-white truncate">{comanda.userName}</p>
              {comanda.tableIdentifier && (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  <TableProperties className="w-3 h-3" /> {comanda.tableIdentifier}
                </div>
              )}
            </div>
          </div>
          <div className="text-right ml-3">
            <p className="text-xl font-bold text-accent-gold">{fmt(netTotal)}</p>
            <div className={clsx('flex items-center gap-1 text-xs justify-end mt-0.5', elapsedColor(comanda.openedAt))}>
              <Clock className="w-3 h-3" />{elapsedLabel(comanda.openedAt)}
            </div>
          </div>
        </div>

        {/* Itens resumo */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">{comanda.items.length} {comanda.items.length === 1 ? 'item' : 'itens'}</span>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-gray-500 hover:text-gray-300 flex items-center gap-1 text-xs transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Ocultar' : 'Ver itens'}
          </button>
        </div>

        {expanded && comanda.items.length > 0 && (
          <div className="bg-surface-800 rounded-lg p-3 space-y-1.5 animate-fade-in">
            {comanda.items.map(item => {
              const busy = updatingItem === item.id || removingItem === item.id
              return (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  {/* Controles de quantidade */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                      disabled={busy}
                      className="w-5 h-5 rounded flex items-center justify-center bg-surface-600 hover:bg-red-600/30 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40 text-base leading-none"
                    >−</button>
                    <span className="w-5 text-center text-xs font-mono text-white">
                      {busy && updatingItem === item.id
                        ? <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                        : item.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                      disabled={busy}
                      className="w-5 h-5 rounded flex items-center justify-center bg-surface-600 hover:bg-emerald-600/30 text-gray-400 hover:text-emerald-400 transition-colors disabled:opacity-40 text-base leading-none"
                    >+</button>
                  </div>
                  <span className="text-gray-300 flex-1 truncate">{item.itemNameSnapshot}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-gray-400 text-xs">{fmt(item.subtotalInReais)}</span>
                    <button
                      onClick={() => handleRemoveItem(item.id, item.itemNameSnapshot)}
                      disabled={busy}
                      className="p-0.5 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Remover item"
                    >
                      {removingItem === item.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )
            })}
            {comanda.pointsApplied > 0 && (
              <div className="flex items-center justify-between text-sm border-t border-surface-500 pt-1.5 gap-2">
                <span className="text-brand-300 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Pontos aplicados
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-brand-300">−{fmt(comanda.pointsApplied / 100)}</span>
                  <button
                    onClick={handleRemovePoints}
                    disabled={removingPts}
                    title="Remover pontos (devolver ao cliente)"
                    className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    {removingPts
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            )}
            <div className="border-t border-surface-500 pt-1.5 flex justify-between text-sm font-semibold">
              <span className="text-gray-300">Total</span>
              <span className="text-accent-gold">{fmt(netTotal)}</span>
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setAddOpen(true)}
            className="btn-secondary py-1.5 px-3"
            title="Adicionar item"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCloseOpen(true)} disabled={loading}
            className="btn-success flex-1 justify-center text-sm py-1.5"
          >
            <CheckCircle className="w-4 h-4" /> Fechar
          </button>
          <button
            onClick={() => setConfirm('cancel')} disabled={loading}
            className="btn-danger py-1.5 px-3"
            title="Cancelar comanda"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}

function usePersistentPanel(key: string, defaultOpen = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen
    try {
      const v = localStorage.getItem(`dash_panel_${key}`)
      return v === null ? defaultOpen : v === 'true'
    } catch { return defaultOpen }
  })
  const toggle = () => setOpen(v => {
    const next = !v
    try { localStorage.setItem(`dash_panel_${key}`, String(next)) } catch {}
    return next
  })
  return [open, toggle]
}

// ── Modal de edição de comanda fechada ────────────────────────────────────────

interface EditItemState {
  id?: string         // undefined = novo item
  productId?: string
  itemName: string
  unitPriceInCents: number
  quantity: number
  remover: boolean
}

function EditarComandaModal({
  comanda,
  clientes,
  produtos,
  onSave,
  onClose,
}: {
  comanda: ComandaDto
  clientes: UserSummary[]
  produtos: Product[]
  onSave: (req: EditarComandaRequest) => Promise<void>
  onClose: () => void
}) {
  const [pm,       setPm]       = useState(comanda.paymentMethod ?? 'Dinheiro')
  const [pm2,      setPm2]      = useState(comanda.secondPaymentMethod ?? '')
  const [pm2val,   setPm2val]   = useState(String(comanda.secondPaymentAmountInCents / 100))
  const [desconto, setDesconto] = useState(String(comanda.discountInCents / 100))
  const [clienteId, setClienteId] = useState(comanda.userId)
  const [clienteSearch, setClienteSearch] = useState('')
  const [showClienteList, setShowClienteList] = useState(false)
  const [items, setItems] = useState<EditItemState[]>(
    comanda.items.map(i => ({
      id: i.id, productId: i.productId ?? undefined,
      itemName: i.itemNameSnapshot, unitPriceInCents: i.unitPriceInCents,
      quantity: i.quantity, remover: false,
    }))
  )
  const [prodSearch, setProdSearch] = useState('')
  const [showProdList, setShowProdList] = useState(false)
  const [saving, setSaving] = useState(false)

  const nomeCliente = clientes.find(u => u.id === clienteId)?.name ?? comanda.userName
  const filteredClientes = clientes.filter(u =>
    u.name.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    (u.cpf ?? '').includes(clienteSearch)
  ).slice(0, 8)
  const filteredProds = produtos.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase()) && p.isActive
  ).slice(0, 6)

  function updateItem(idx: number, patch: Partial<EditItemState>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function removeItem(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, remover: true } : it))
  }
  function addManualItem() {
    setItems(prev => [...prev, { itemName: '', unitPriceInCents: 0, quantity: 1, remover: false }])
  }
  function addProductItem(p: Product) {
    const effectivePrice = p.isOnPromo && p.discountPriceInCents != null
      ? p.discountPriceInCents : p.priceInCents
    setItems(prev => [...prev, {
      productId: p.id, itemName: p.name,
      unitPriceInCents: effectivePrice, quantity: 1, remover: false,
    }])
    setProdSearch(''); setShowProdList(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const descontoNum = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
      const pm2valNum   = Math.round(parseFloat(pm2val.replace(',', '.') || '0') * 100)

      const itens: EditarItemRequest[] = items.map(it => ({
        comandaItemId: it.id,
        remover: it.remover,
        productId: it.productId,
        itemName: it.itemName,
        unitPriceInCents: it.unitPriceInCents,
        quantity: it.quantity,
      }))

      await onSave({
        paymentMethod: pm || undefined,
        secondPaymentMethod: pm2 === '' ? '' : pm2 || undefined,
        secondPaymentAmountInCents: pm2 ? pm2valNum : 0,
        novoClienteId: clienteId !== comanda.userId ? clienteId : undefined,
        descontoEmCentavos: descontoNum,
        itens,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg bg-surface-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white">Editar Comanda</h2>
            <p className="text-xs text-gray-500 mt-0.5">{comanda.userName} · {fmt(comanda.totalInReais)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300 rounded-xl hover:bg-surface-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Pagamento */}
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Forma de Pagamento</p>
            <select value={pm} onChange={e => setPm(e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm">
              {COMANDA_PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Segundo pagamento */}
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Segundo Pagamento (split)</p>
            <div className="flex gap-2">
              <select value={pm2} onChange={e => setPm2(e.target.value)}
                className="flex-1 bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm">
                <option value="">Nenhum</option>
                {COMANDA_PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {pm2 && (
                <input type="number" step="0.01" min="0" value={pm2val} onChange={e => setPm2val(e.target.value)}
                  placeholder="Valor R$"
                  className="w-28 bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm" />
              )}
            </div>
          </div>

          {/* Desconto */}
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Desconto (R$)</p>
            <input type="number" step="0.01" min="0" value={desconto} onChange={e => setDesconto(e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm" />
          </div>

          {/* Cliente */}
          <div className="relative">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Cliente</p>
            <div className="flex items-center gap-2 bg-surface-700 border border-surface-500 rounded-xl px-3 py-2">
              <UserSearch className="w-4 h-4 text-gray-500 shrink-0" />
              <input
                value={showClienteList ? clienteSearch : nomeCliente}
                onFocus={() => { setClienteSearch(''); setShowClienteList(true) }}
                onBlur={() => setTimeout(() => setShowClienteList(false), 150)}
                onChange={e => { setClienteSearch(e.target.value); setShowClienteList(true) }}
                className="flex-1 bg-transparent text-sm text-white outline-none"
                placeholder="Buscar cliente..."
              />
            </div>
            {showClienteList && filteredClientes.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-600 rounded-xl shadow-xl overflow-hidden">
                {filteredClientes.map(u => (
                  <button key={u.id} onMouseDown={() => { setClienteId(u.id); setShowClienteList(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-surface-500 transition-colors text-left">
                    <span className="text-sm text-white truncate">{u.name}</span>
                    {u.cpf && <span className="text-xs text-gray-500 shrink-0 font-mono">{u.cpf}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Itens */}
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Itens</p>
            <div className="space-y-2">
              {items.map((it, idx) => !it.remover && (
                <div key={idx} className="flex items-center gap-2 bg-surface-700 rounded-xl px-3 py-2">
                  <input value={it.itemName} onChange={e => updateItem(idx, { itemName: e.target.value })}
                    className="flex-1 bg-transparent text-xs text-white outline-none min-w-0"
                    placeholder="Nome do item" />
                  <input type="number" min="0.01" step="0.01"
                    value={(it.unitPriceInCents / 100).toFixed(2)}
                    onChange={e => updateItem(idx, { unitPriceInCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                    className="w-16 bg-surface-600 rounded-lg px-2 py-1 text-xs text-white text-right outline-none" />
                  <input type="number" min="1" step="1"
                    value={it.quantity}
                    onChange={e => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-10 bg-surface-600 rounded-lg px-2 py-1 text-xs text-white text-center outline-none" />
                  <button onClick={() => removeItem(idx)}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Adicionar produto */}
            <div className="mt-3 relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input value={prodSearch}
                    onChange={e => { setProdSearch(e.target.value); setShowProdList(true) }}
                    onFocus={() => setShowProdList(true)}
                    onBlur={() => setTimeout(() => setShowProdList(false), 150)}
                    placeholder="Buscar produto no estoque..."
                    className="w-full pl-8 pr-3 py-2 bg-surface-700 border border-surface-600 rounded-xl text-xs text-white placeholder-gray-500 outline-none" />
                  {showProdList && filteredProds.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-600 rounded-xl shadow-xl overflow-hidden">
                      {filteredProds.map(p => {
                        const onPromo = p.isOnPromo && p.discountPriceInReais != null
                        return (
                          <button key={p.id} onMouseDown={() => addProductItem(p)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-500 transition-colors text-left">
                            <span className="text-xs text-white truncate">
                              {p.name}{onPromo && <span className="text-red-400 ml-1">· promo</span>}
                            </span>
                            {onPromo ? (
                              <span className="text-xs shrink-0">
                                <span className="text-gray-500 line-through mr-1">{fmt(p.priceInReais)}</span>
                                <span className="text-red-400 font-semibold">{fmt(p.discountPriceInReais!)}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 shrink-0">{fmt(p.priceInReais)}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <button onClick={addManualItem}
                  className="shrink-0 flex items-center gap-1 px-3 py-2 bg-surface-700 border border-surface-600 rounded-xl text-xs text-gray-300 hover:text-white hover:border-brand-500 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Manual
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-600 shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="w-full btn-primary justify-center py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { prefs } = usePreferences()
  const dp = prefs.dashboard
  const [tab, setTab]             = useState<'ativas' | 'historico' | 'analises'>('ativas')
  const [comandas, setComandas]   = useState<ComandaDto[]>([])
  const [history, setHistory]     = useState<ComandaDto[]>([])
  const [histData, setHistData]   = useState(() => brToday())
  const [loading, setLoading]     = useState(true)
  const [histLoading, setHistLoad]= useState(false)
  const [connected, setConnected] = useState(false)
  const [newIds, setNewIds]       = useState<Set<string>>(new Set())
  const [recentChanges, setRecentChanges] = useState<Map<string, { type: 'add' | 'remove'; at: number }>>(new Map())
  const [search, setSearch]       = useState('')
  const [fin7d, setFin7d]         = useState<FinanceiroDto | null>(null)
  const [finHoje, setFinHoje]     = useState<FinanceiroDto | null>(null)
  const [lowStock, setLowStock]   = useState(0)
  const [unreadNotif, setUnreadNotif] = useState(0)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [ranking, setRanking]     = useState<ClienteInsightDto[]>([])
  const [allUsers, setAllUsers]   = useState<UserSummary[]>([])
  const [openModal, setOpenModal] = useState(false)
  const [finOpen, setFinOpen] = useState(false)
  const [expandedHist, setExpandedHist] = useState<string | null>(null)
  const [editComanda, setEditComanda]   = useState<ComandaDto | null>(null)
  // Crediário — escolha de conta ao fechar comanda
  const [pendingClose, setPendingClose] = useState<{
    id: string; pm: string; pm2?: string; amt2?: number; discount?: number; emitirNota?: boolean
    userId: string; userName: string; valorPrincipal: number
  } | null>(null)
  const [autoEmitMethods, setAutoEmitMethods] = useState<string[]>([])
  const [emitindoNotaId, setEmitindoNotaId]   = useState<string | null>(null)
  const [contasAbertas, setContasAbertas] = useState<CrediariosDto[]>([])
  const [histSearch,   setHistSearch]   = useState('')
  const [histHoraDe,   setHistHoraDe]   = useState('')
  const [histHoraAte,  setHistHoraAte]  = useState('')
  const [panelGrafico,      togglePanelGrafico]      = usePersistentPanel('grafico')
  const [panelPrevisao,     togglePanelPrevisao]     = usePersistentPanel('previsao')
  const [panelPatrimonio,   togglePanelPatrimonio]   = usePersistentPanel('patrimonio')
  const [panelClientes,     togglePanelClientes]     = usePersistentPanel('clientes')
  const [panelProdutos,     togglePanelProdutos]     = usePersistentPanel('produtos')
  const [panelLgpd,         togglePanelLgpd]         = usePersistentPanel('lgpd')
  const [panelPreInscricoes,togglePanelPreInscricoes]= usePersistentPanel('preinscricoes')
  const [panelPreVenda,     togglePanelPreVenda]     = usePersistentPanel('prevenda')
  const [pendingPI, setPendingPI]       = useState(0)
  const [pendingPreVenda, setPendingPreVenda] = useState(0)
  const [pendingLgpd, setPendingLgpd]   = useState<LgpdRequestDto[]>([])
  const [finProdutos, setFinProdutos]   = useState<FinanceiroDto | null>(null)
  const [prodDe,  setProdDe]  = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
  })
  const [prodAte, setProdAte] = useState(brToday)
  const prevCountRef              = useRef(0)
  const knownIdsRef               = useRef<Set<string>>(new Set())

  const fetchComandas = useCallback(async () => {
    try {
      const { data } = await comandaApi.dashboard()
      // Detecta novas comandas e toca o som de gol
      data.forEach(c => {
        if (!knownIdsRef.current.has(c.id) && knownIdsRef.current.size > 0) {
          playGoalSound()
        }
        knownIdsRef.current.add(c.id)
      })
      setComandas(data)
    } catch {
      toast.error('Erro ao carregar comandas')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async (data?: string) => {
    setHistLoad(true)
    try {
      const { data: res } = await comandaApi.history(data)
      setHistory(res)
    } catch {
      toast.error('Erro ao carregar histórico')
    } finally {
      setHistLoad(false)
    }
  }, [])

  // Carrega dados financeiros e estoque baixo
  useEffect(() => {
    const hoje  = brToday()
    const ini7d = new Date(); ini7d.setDate(ini7d.getDate() - 6)
    const ini7s = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(ini7d)

    analyticsApi.financeiro(hoje, hoje).then(r => setFinHoje(r.data)).catch(() => {})
    analyticsApi.financeiro(ini7s, hoje).then(r => { setFin7d(r.data); setFinProdutos(r.data) }).catch(() => {})
    productApi.listAdmin().then(r => {
      const prods = r.data.filter(p => p.isActive)
      setLowStock(prods.filter(p => p.isLowStock).length)
      setAllProducts(prods)
    }).catch(() => {})
    analyticsApi.clientes().then(r => setRanking(r.data.filter(c => c.gastoTotal > 0).slice(0, 5))).catch(() => {})
    championshipApi.list().then(r => {
      const total = r.data.reduce((s, c) => s + (c.preInscricaoCount ?? 0), 0)
      setPendingPI(total)
    }).catch(() => {})
    lgpdAdminApi.listRequests('Pendente').then(r => setPendingLgpd(r.data)).catch(() => {})
    notificationsApi.unreadCount().then(r => setUnreadNotif(r.data.count)).catch(() => {})
    reservationApi.filaPendentesCount().then(r => setPendingPreVenda(r.data.count)).catch(() => {})
    fiscalApi.getConfig().then(r => setAutoEmitMethods(r.data.formasPagamentoAutoEmissao ?? [])).catch(() => {})
  }, [])

  async function fetchProdutos(de: string, ate: string) {
    try {
      const { data } = de || ate
        ? await analyticsApi.financeiro(de || undefined, ate || undefined)
        : await analyticsApi.financeiro()
      setFinProdutos(data)
    } catch {}
  }

  useEffect(() => {
    fetchComandas()
    let hub: Awaited<ReturnType<typeof startHub>>

    pedirPermissaoNotificacao()

    startHub().then(h => {
      hub = h
      setConnected(true)

      hub.on('ComandaUpdated', (event: ComandaUpdatedEvent) => {
        setNewIds(s => new Set(s).add(event.comandaId))
        setTimeout(() => setNewIds(s => { const n = new Set(s); n.delete(event.comandaId); return n }), 3000)
        fetchComandas()
        tocarSom('nova')
        incrementBadge()
        notificarBrowser('Nova atividade — Santuário Nerd', `${event.userName}: +${event.lastItemAdded ?? 'item'}`)
        toast(`📋 ${event.userName}: +${event.lastItemAdded ?? 'item'}`, {
          icon: '🃏',
          style: { background: '#1A1A1F', color: '#fff', border: '1px solid #42B6EE', borderRadius: '12px' }
        })
      })

      hub.on('ComandaOpened', () => {
        fetchComandas()
      })

      hub.on('ComandaClosed', () => {
        fetchComandas()
        fetchHistory(histData)
        tocarSom('fechada')
      })
      hub.onclose(() => setConnected(false))
      hub.onreconnecting(() => setConnected(false))
      hub.onreconnected(() => { setConnected(true); fetchComandas() })
    }).catch(() => setConnected(false))

    // Limpa badge quando admin foca na aba
    const onFocus = () => clearBadge()
    window.addEventListener('focus', onFocus)

    return () => {
      stopHub()
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchComandas, fetchHistory])

  // Polling separado — reage em tempo real quando o usuário muda o intervalo nas configurações
  useEffect(() => {
    if (dp.refreshInterval === 0) return
    const intervalMs = dp.refreshInterval * 1000
    const poll = setInterval(async () => {
      const { HubConnectionState } = await import('@microsoft/signalr')
      const hub = (await import('@/lib/signalr')).getComandaHub()
      if (hub.state === HubConnectionState.Disconnected) {
        try { await hub.start(); setConnected(true) } catch { /* ignora */ }
      }
      fetchComandas()
    }, intervalMs)
    return () => clearInterval(poll)
  }, [dp.refreshInterval, fetchComandas])

  useEffect(() => {
    if (tab === 'historico') fetchHistory(histData)
  }, [tab, histData, fetchHistory])

  useEffect(() => {
    if (comandas.length > prevCountRef.current && prevCountRef.current > 0)
      toast('🎉 Nova comanda aberta!', { duration: 3000 })
    prevCountRef.current = comandas.length
  }, [comandas.length])

  function markChange(id: string, type: 'add' | 'remove') {
    const now = Date.now()
    setRecentChanges(prev => new Map(prev).set(id, { type, at: now }))
    setTimeout(() => setRecentChanges(prev => {
      const next = new Map(prev)
      if (next.get(id)?.at === now) next.delete(id)
      return next
    }), 5 * 60 * 1000) // 5 minutos
  }

  function handleUpdate(updated: ComandaDto, changeType?: 'add' | 'remove') {
    setComandas(prev => prev.map(c => c.id === updated.id ? updated : c))
    if (changeType) markChange(updated.id, changeType)
  }

  async function handleClose(id: string, paymentMethod: string, secondMethod?: string, secondAmountInCents?: number, discountInCents?: number, emitirNotaFiscal?: boolean) {
    if (paymentMethod === 'Crediario') {
      // Descobre o cliente da comanda
      const comanda = comandas.find(c => c.id === id)
      if (comanda?.userId) {
        try {
          const { data } = await crediarioApi.byUser(comanda.userId)
          const abertas = data.filter(c => c.status === 'Aberto')
          if (abertas.length > 0) {
            // Calcula valor principal (total - desconto - segundo pagamento)
            const totalCents = comanda.items.reduce((s, i) => s + i.unitPriceInCents * i.quantity, 0)
            const valorPrincipal = totalCents - (discountInCents ?? 0) - (secondAmountInCents ?? 0)
            setPendingClose({ id, pm: paymentMethod, pm2: secondMethod, amt2: secondAmountInCents, discount: discountInCents, emitirNota: emitirNotaFiscal, userId: comanda.userId, userName: comanda.userName, valorPrincipal })
            setContasAbertas(abertas)
            return
          }
        } catch { /* se falhar na busca, fecha normalmente */ }
      }
    }
    await executarClose(id, paymentMethod, secondMethod, secondAmountInCents, undefined, discountInCents, emitirNotaFiscal)
  }

  async function executarClose(id: string, paymentMethod: string, secondMethod?: string, secondAmountInCents?: number, crediarioExistenteId?: string, discountInCents?: number, emitirNotaFiscal?: boolean) {
    try {
      const { data } = await comandaApi.close(id, paymentMethod, undefined, secondMethod, secondAmountInCents, crediarioExistenteId, discountInCents, emitirNotaFiscal)
      const label = paymentMethod === 'Crediario' ? 'Comanda fechada no crediário!' : 'Comanda fechada!'
      toast.success(label)
      handleNotaFiscalResult(data.notaFiscalId, data.notaFiscalStatus, data.notaFiscalMotivoRejeicao)
      fetchComandas()
      fetchHistory(histData)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao fechar comanda.')
    }
  }
  async function openEditModal(c: ComandaDto) {
    setEditComanda(c)
    if (allUsers.length === 0) {
      try { const r = await userApi.list(); setAllUsers(r.data) } catch {}
    }
  }

  async function handleEditar(req: EditarComandaRequest) {
    if (!editComanda) return
    try {
      await comandaApi.editar(editComanda.id, req)
      toast.success('Comanda atualizada!')
      setEditComanda(null)
      fetchHistory(histData)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao editar comanda.')
      throw err
    }
  }

  async function handleCancel(id: string) {
    try {
      await comandaApi.cancel(id)
      toast.success('Comanda cancelada.')
      fetchComandas()
      fetchHistory(histData)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao cancelar comanda.')
    }
  }

  async function emitirNotaComanda(id: string) {
    setEmitindoNotaId(id)
    try {
      const { data } = await fiscalApi.emitirNotaComanda(id)
      if (data.status === 'Autorizada') {
        toast.success('Nota fiscal autorizada!')
        window.open(`/admin/fiscal/cupom/${data.id}`, '_blank')
      } else {
        toast.error(`Nota registrada, aguardando: ${data.status}${data.motivoRejeicao ? ' — ' + data.motivoRejeicao : ''}`)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao emitir nota fiscal.')
    } finally {
      setEmitindoNotaId(null)
    }
  }

  async function handleAdminOpen(userId: string, tableIdentifier: string) {
    try {
      await comandaApi.adminOpen(userId, tableIdentifier || undefined)
      toast.success('Comanda aberta!')
      setOpenModal(false)
      fetchComandas()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao abrir comanda.')
    }
  }

  const { patrimonioCusto, patrimonioVenda, lucroEstoque, totalPecas } = useMemo(() => {
    const custo  = allProducts.reduce((s, p) => s + p.costPriceInCents  * p.stockQuantity, 0) / 100
    const venda  = allProducts.reduce((s, p) => s + p.priceInCents      * p.stockQuantity, 0) / 100
    const lucro  = venda - custo
    const pecas  = allProducts.reduce((s, p) => s + p.stockQuantity, 0)
    return { patrimonioCusto: custo, patrimonioVenda: venda, lucroEstoque: lucro, totalPecas: pecas }
  }, [allProducts])

  const { totalAberto, emAndamento } = useMemo(() => ({
    totalAberto: comandas.reduce((s, c) => s + c.totalInReais, 0),
    emAndamento: comandas.filter(c => c.status === 'EmAndamento').length,
  }), [comandas])

  const prevFin = fin7d && fin7d.diaDia.length > 0 ? (() => {
    const hojeStr = brToday()
    const diaAtual = parseInt(hojeStr.slice(8))
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const diasRestantes = daysInMonth - diaAtual
    const n = fin7d.diaDia.length
    const mediaDiaria = fin7d.receita / n
    const projecaoMes = mediaDiaria * daysInMonth
    const margemPct = fin7d.receita > 0 ? fin7d.margem / fin7d.receita : 0
    const projecaoMargem = projecaoMes * margemPct
    const realizadoEstimado = mediaDiaria * diaAtual
    const percentual = Math.min(realizadoEstimado / projecaoMes, 1)
    return { mediaDiaria, projecaoMes, projecaoMargem, diasRestantes, daysInMonth, percentual, diaAtual, realizadoEstimado, n }
  })() : null
  const filteredHistory = history.filter(c => {
    if (histSearch && !c.userName.toLowerCase().includes(histSearch.toLowerCase())) return false
    if ((histHoraDe || histHoraAte) && c.closedAt) {
      const t = new Date(c.closedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' })
      if (histHoraDe && t < histHoraDe) return false
      if (histHoraAte && t > histHoraAte) return false
    }
    return true
  })

  const fechadas     = filteredHistory.filter(c => c.status === 'Fechada')
  const totalFechado = fechadas.reduce((s, c) => s + c.totalInReais, 0)

  const paymentBreakdown = [
    { key: 'Dinheiro',      label: 'Dinheiro',  color: 'text-accent-green' },
    { key: 'Pix',           label: 'Pix',        color: 'text-brand-400' },
    { key: 'CartaoCredito', label: 'Crédito',    color: 'text-amber-400' },
    { key: 'CartaoDebito',  label: 'Débito',     color: 'text-blue-400' },
    { key: 'Crediario',     label: 'Crediário',  color: 'text-red-400'    },
    { key: 'Pontos',        label: 'Pontos',     color: 'text-amber-400'  },
    { key: 'Cashback',      label: 'Cashback',   color: 'text-purple-400' },
  ].map(pm => ({
    ...pm,
    // Para split payment, calcula o valor real de cada método:
    // primaryAmt = total (já líquido de pontos/desconto no fechamento) - valor do segundo método
    // secondAmt  = secondPaymentAmountInCents / 100
    total: fechadas.reduce((sum, c) => {
      const net        = c.totalInReais // totalInReais já sai líquido de pontos/desconto do CloseComandaAsync
      const hasSecond  = !!c.secondPaymentMethod && c.secondPaymentAmountInCents > 0
      const secondAmt  = c.secondPaymentAmountInCents / 100
      const primaryAmt = hasSecond ? net - secondAmt : net
      let contrib = 0
      if (c.paymentMethod       === pm.key) contrib += primaryAmt
      if (c.secondPaymentMethod === pm.key) contrib += secondAmt
      return sum + contrib
    }, 0),
  })).filter(pm => pm.total > 0)

  const filtered = comandas.filter(c =>
    !search || c.userName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      {openModal && (
        <AdminOpenModal
          onConfirm={handleAdminOpen}
          onCancel={() => setOpenModal(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard ao Vivo</h1>
          <p className="text-gray-400 text-sm mt-0.5">Comandas abertas em tempo real</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border',
            connected
              ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          )}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'Conectado' : 'Desconectado'}
          </div>
          <button onClick={() => setOpenModal(true)} className="btn-primary text-sm py-1.5">
            <FolderOpen className="w-4 h-4" /> <span className="hidden sm:inline">Abrir Comanda</span>
          </button>
          <button onClick={fetchComandas} className="btn-secondary text-sm py-1.5">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Métricas ao vivo — grid 2×2 no mobile, barra slim no desktop */}
      <div className="card py-2.5 px-3 sm:px-4">
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:divide-x sm:divide-surface-600 gap-3 sm:gap-0">
          {[
            { label: 'Ativas',        value: String(comandas.length),                 icon: Users,         color: 'text-brand-400'   },
            { label: 'Receita hoje',  value: finHoje ? fmt(finHoje.receita) : '—',   icon: DollarSign,    color: 'text-accent-gold'  },
            { label: 'Em aberto',     value: fmt(totalAberto),                         icon: Clock,         color: 'text-orange-400'   },
            { label: 'Estoque baixo', value: String(lowStock),                         icon: AlertTriangle, color: lowStock > 0 ? 'text-red-400' : 'text-gray-500' },
          ].map((m, i) => (
            <div key={m.label} className={clsx(
              'flex items-center gap-2',
              'sm:shrink-0',
              i === 0 ? 'sm:pr-4' : 'sm:px-4',
              'bg-surface-800 sm:bg-transparent rounded-lg sm:rounded-none p-2.5 sm:p-0'
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

      {/* Tabs + controles */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex gap-1 bg-surface-800 p-1 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setTab('ativas')}
            className={clsx('flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
              tab === 'ativas' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200')}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span>Ativas ({comandas.length})</span>
          </button>
          <button
            onClick={() => setTab('historico')}
            className={clsx('flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
              tab === 'historico' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200')}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span>Histórico</span>
          </button>
          <button
            onClick={() => setTab('analises')}
            className={clsx('flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
              tab === 'analises' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200')}
          >
            <div className="relative">
              <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {(unreadNotif > 0 || lowStock > 0) && tab !== 'analises' && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <span>Análises</span>
          </button>
        </div>

        {tab === 'historico' && (
          <input
            type="date"
            value={histData}
            max={brToday()}
            onChange={e => setHistData(e.target.value)}
            className="input text-sm w-full sm:w-40 py-1.5"
          />
        )}

        {tab === 'ativas' && (
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              className="input pl-9 text-sm w-full sm:w-56"
              placeholder="Buscar por cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Tab: Ativas ──────────────────────────────────────────────────────── */}
      {tab === 'ativas' && (
        loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-surface-700 rounded-2xl flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-400 font-medium">
              {search ? `Nenhuma comanda para "${search}"` : 'Nenhuma comanda aberta no momento'}
            </p>
            {!search && <p className="text-gray-400 text-sm mt-1">Clientes acessam via QR Code nas mesas</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filtered.map(c => (
              <ComandaCard
                key={c.id}
                comanda={c}
                onClose={handleClose}
                onCancel={handleCancel}
                onUpdate={handleUpdate}
                onClosedExternally={() => { fetchComandas(); fetchHistory(histData) }}
                isNew={newIds.has(c.id)}
                recentChange={recentChanges.get(c.id)?.type ?? null}
                autoEmitMethods={autoEmitMethods}
              />
            ))}
          </div>
        )
      )}

      {/* ── Tab: Histórico ───────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        histLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-surface-700 rounded-2xl flex items-center justify-center mb-4">
              <History className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-400 font-medium">Nenhuma comanda encerrada neste dia</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filtros do histórico */}
            <div className="card py-2.5 px-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <div className="relative flex-1 min-w-0 sm:min-w-36">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  className="input pl-8 text-sm py-1.5 w-full"
                  placeholder="Filtrar por nome..."
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <input
                  type="time"
                  value={histHoraDe}
                  onChange={e => setHistHoraDe(e.target.value)}
                  className="input text-sm py-1.5 flex-1 sm:w-28 sm:flex-none"
                  title="Horário de"
                />
                <span className="text-xs text-gray-500">até</span>
                <input
                  type="time"
                  value={histHoraAte}
                  onChange={e => setHistHoraAte(e.target.value)}
                  className="input text-sm py-1.5 flex-1 sm:w-28 sm:flex-none"
                  title="Horário até"
                />
              </div>
              {(histSearch || histHoraDe || histHoraAte) && (
                <button
                  onClick={() => { setHistSearch(''); setHistHoraDe(''); setHistHoraAte('') }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2.5 py-1.5 rounded-lg border border-surface-500 hover:border-surface-400 w-full sm:w-auto text-center"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {/* Breakdown por pagamento */}
            {paymentBreakdown.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Fechamento por forma de pagamento</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {paymentBreakdown.map(pm => (
                    <div key={pm.key} className="bg-surface-800 rounded-xl p-3 text-center">
                      <p className={`text-lg font-bold ${pm.color}`}>{fmt(pm.total)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{pm.label}</p>
                    </div>
                  ))}
                  <div className="bg-surface-800 rounded-xl p-3 text-center border border-surface-500">
                    <p className="text-lg font-bold text-accent-gold">{fmt(totalFechado)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total</p>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de comandas */}
            <div className="space-y-2">
              {filteredHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-8 h-8 text-gray-600 mb-3" />
                  <p className="text-gray-500 text-sm">Nenhuma comanda encontrada com esses filtros</p>
                  <button onClick={() => { setHistSearch(''); setHistHoraDe(''); setHistHoraAte('') }} className="mt-2 text-xs text-brand-400 hover:text-brand-300 transition-colors">Limpar filtros</button>
                </div>
              )}
              {filteredHistory.map(c => {
                const isExpanded = expandedHist === c.id
                return (
                  <div key={c.id} className="card">
                    <button
                      onClick={() => setExpandedHist(isExpanded ? null : c.id)}
                      className="w-full flex items-center justify-between gap-4 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={clsx(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          c.status === 'Fechada' ? 'bg-accent-green/10' : 'bg-red-500/10'
                        )}>
                          {c.status === 'Fechada'
                            ? <CheckCircle className="w-4 h-4 text-accent-green" />
                            : <Trash2 className="w-4 h-4 text-red-400" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{c.userName}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {c.closedAt
                              ? new Date(c.closedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                              : '—'
                            }
                            <span>·</span>
                            {c.items.length} {c.items.length === 1 ? 'item' : 'itens'}
                            {c.paymentMethod && (
                              <>
                                <span>·</span>
                                <span className="text-gray-400 font-medium">
                                  {COMANDA_PAYMENT_METHODS.find(m => m.value === c.paymentMethod)?.label ?? c.paymentMethod}
                                  {c.secondPaymentMethod && ` + ${COMANDA_PAYMENT_METHODS.find(m => m.value === c.secondPaymentMethod)?.label ?? c.secondPaymentMethod}`}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className={clsx('font-bold', c.status === 'Fechada' ? 'text-accent-gold' : 'text-gray-500')}>
                            {fmt(c.totalInReais)}
                          </p>
                          <p className={clsx('text-xs', c.status === 'Fechada' ? 'text-accent-green' : 'text-red-400')}>
                            {c.status === 'Fechada' ? 'Fechada' : 'Cancelada'}
                          </p>
                        </div>
                        {c.items.length > 0 && (
                          isExpanded
                            ? <ChevronUp className="w-4 h-4 text-gray-500" />
                            : <ChevronDown className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                    </button>

                    {isExpanded && c.items.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-surface-600 space-y-1">
                        {c.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between text-xs text-gray-300 py-0.5">
                            <span className="flex-1 truncate">{item.quantity}× {item.itemNameSnapshot}</span>
                            <span className="text-gray-500 ml-2 shrink-0">{fmt(item.subtotalInReais)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-semibold text-gray-200 pt-1 border-t border-surface-600">
                          <span>Total</span>
                          <span className="text-accent-gold">{fmt(c.totalInReais)}</span>
                        </div>
                        {c.status === 'Fechada' && (
                          <button
                            onClick={e => { e.stopPropagation(); openEditModal(c) }}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 hover:bg-brand-600/10 border border-brand-600/30 hover:border-brand-500/50 rounded-xl py-1.5 transition-colors">
                            <Pencil className="w-3.5 h-3.5" /> Editar comanda
                          </button>
                        )}
                        {c.status === 'Fechada' && (
                          <button
                            disabled={emitindoNotaId === c.id}
                            onClick={e => { e.stopPropagation(); emitirNotaComanda(c.id) }}
                            className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-600/10 border border-amber-600/30 hover:border-amber-500/50 rounded-xl py-1.5 transition-colors disabled:opacity-50">
                            {emitindoNotaId === c.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Receipt className="w-3.5 h-3.5" />}
                            Emitir nota fiscal
                          </button>
                        )}
                        {c.status === 'Fechada' && c.paymentMethod && (() => {
                          const net        = c.totalInReais // já líquido de pontos/desconto (CloseComandaAsync)
                          const hasSecond  = !!c.secondPaymentMethod && c.secondPaymentAmountInCents > 0
                          const secondAmt  = c.secondPaymentAmountInCents / 100
                          const primaryAmt = hasSecond ? net - secondAmt : net
                          const pmLabel    = (key: string) => COMANDA_PAYMENT_METHODS.find(m => m.value === key)?.label ?? key
                          return (
                            <div className="space-y-0.5 pt-1">
                              {c.pointsApplied > 0 && (
                                <div className="flex justify-between text-xs text-gray-500">
                                  <span>Pontos aplicados</span>
                                  <span className="text-amber-400">− {fmt(c.pointsApplied / 100)}</span>
                                </div>
                              )}
                              {c.discountInCents > 0 && (
                                <div className="flex justify-between text-xs text-gray-500">
                                  <span>Desconto</span>
                                  <span className="text-accent-green">− {fmt(c.discountInCents / 100)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>{pmLabel(c.paymentMethod)}</span>
                                <span>{fmt(primaryAmt)}</span>
                              </div>
                              {hasSecond && (
                                <div className="flex justify-between text-xs text-gray-500">
                                  <span>{pmLabel(c.secondPaymentMethod!)}</span>
                                  <span>{fmt(secondAmt)}</span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      )}

      {/* ── Tab: Análises ────────────────────────────────────────────────────── */}
      {tab === 'analises' && (
        <div className="space-y-6">

          {/* ── Hoje ── */}
          {dp.panels.finHoje && finHoje && <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest -mb-3">Hoje</p>}
          {dp.panels.finHoje && finHoje && (
            <div className="card">
              <button onClick={() => setFinOpen(v => !v)} className="w-full flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-brand-400" /> Detalhe financeiro hoje
                </h3>
                <div className="flex items-center gap-3">
                  <span className={clsx('text-sm font-bold', finHoje.margem >= 0 ? 'text-accent-green' : 'text-red-400')}>
                    Margem {fmt(finHoje.margem)}
                  </span>
                  {finOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </div>
              </button>
              {finOpen && (() => {
                const totalTx = (finHoje.pagamentosPorForma ?? []).reduce((s, f) => s + f.quantidade, 0)
                const ticketMedio = totalTx > 0 ? finHoje.receita / totalTx : 0
                return (
                  <div className="mt-4 pt-4 border-t border-surface-600 animate-fade-in space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Receita total',  value: fmt(finHoje.receita),  color: 'text-accent-gold',  sub: finHoje.receitaComandas > 0 ? 'cmd + avulsa' : undefined },
                        { label: 'CMV / Custo',    value: fmt(finHoje.custo),    color: 'text-red-400',      sub: undefined },
                        { label: 'Margem bruta',   value: fmt(finHoje.margem),   color: finHoje.margem >= 0 ? 'text-accent-green' : 'text-red-400', sub: finHoje.receita > 0 ? `${((finHoje.margem / finHoje.receita) * 100).toFixed(1)}%` : undefined },
                        { label: 'Ticket médio',   value: fmt(ticketMedio),      color: 'text-brand-400',    sub: totalTx > 0 ? `${totalTx} transações` : undefined },
                      ].map(m => (
                        <div key={m.label} className="bg-surface-800 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                          <p className={clsx('text-base font-bold font-mono', m.color)}>{m.value}</p>
                          {m.sub && <p className="text-[10px] text-gray-600 mt-0.5">{m.sub}</p>}
                        </div>
                      ))}
                    </div>
                    {finHoje.receitaComandas > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface-800 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">Receita comandas</p>
                          <p className="text-base font-bold font-mono text-white">{fmt(finHoje.receitaComandas)}</p>
                        </div>
                        <div className="bg-surface-800 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">Receita avulsa</p>
                          <p className="text-base font-bold font-mono text-white">{fmt(finHoje.receitaAvulsa)}</p>
                        </div>
                      </div>
                    )}
                    {(finHoje.pagamentosPorForma ?? []).filter(f => f.total > 0).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Formas de pagamento</p>
                        <div className="flex flex-wrap gap-2">
                          {finHoje.pagamentosPorForma.filter(f => f.total > 0).map(f => (
                            <div key={f.forma} className="bg-surface-800 rounded-lg px-3 py-2 text-center">
                              <p className="text-sm font-bold text-white">{fmt(f.total)}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{f.forma}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── 7 dias / Mês ── */}
          {(dp.panels.grafico || dp.panels.previsao) && (
            <div>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-3">7 dias / Mês</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dp.panels.grafico && fin7d && fin7d.diaDia.length > 1 && (
                  <MiniBarChart dias={fin7d.diaDia} open={panelGrafico} onToggle={togglePanelGrafico} scheme={dp.chartScheme} />
                )}
                {dp.panels.previsao && prevFin && (
            <div className="card">
              <button onClick={togglePanelPrevisao} className="w-full flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" /> Previsão financeira —{' '}
                  {new Date().toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' })}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{prevFin.diasRestantes} dias restantes</span>
                  {panelPrevisao ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </div>
              </button>
              {panelPrevisao && (
                <div className="mt-4 pt-4 border-t border-surface-600">
                  <div className="flex flex-wrap gap-6 items-end mb-4">
                    <div>
                      <p className="text-2xl font-bold text-accent-gold">{fmt(prevFin.projecaoMes)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">projeção de receita</p>
                    </div>
                    <div>
                      <p className={clsx('text-sm font-semibold', prevFin.projecaoMargem >= 0 ? 'text-accent-green' : 'text-red-400')}>{fmt(prevFin.projecaoMargem)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">projeção margem</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-brand-400">{fmt(prevFin.mediaDiaria)}<span className="text-xs font-normal text-gray-500">/dia</span></p>
                      <p className="text-xs text-gray-500 mt-0.5">média últimos {prevFin.n}d</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Estimado realizado: {fmt(prevFin.realizadoEstimado)}</span>
                    <span>{Math.round(prevFin.percentual * 100)}% do mês ({prevFin.diaAtual}/{prevFin.daysInMonth})</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-600 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-500"
                      style={{ width: `${prevFin.percentual * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
              </div>
            </div>
          )}

          {/* ── Rankings & Alertas ── */}
          {(dp.panels.patrimonio || dp.panels.clientes || dp.panels.lgpd) && (
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest -mb-3">Rankings & alertas</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {dp.panels.patrimonio && allProducts.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between">
                  <button onClick={togglePanelPatrimonio} className="flex items-center gap-2 flex-1 text-left">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" /> Patrimônio
                    </h3>
                    {panelPatrimonio ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  <a href="/admin/estoque" className="text-xs text-brand-400 hover:text-brand-300 transition-colors ml-2">→</a>
                </div>
                {panelPatrimonio && (
                  <div className="mt-3 space-y-1.5">
                    {[
                      { label: 'Custo total',  value: fmt(patrimonioCusto),  color: 'text-white' },
                      { label: 'Valor venda',  value: fmt(patrimonioVenda),  color: 'text-accent-gold' },
                      { label: 'Margem',       value: fmt(lucroEstoque),     color: lucroEstoque >= 0 ? 'text-emerald-400' : 'text-red-400' },
                      { label: 'Total peças',  value: totalPecas.toLocaleString('pt-BR'), color: 'text-brand-400' },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between items-center text-xs py-1 border-b border-surface-600 last:border-0">
                        <span className="text-gray-500">{r.label}</span>
                        <span className={clsx('font-mono font-bold', r.color)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {dp.panels.clientes && (
              <div className="card">
                <div className="flex items-center justify-between">
                  <button onClick={togglePanelClientes} className="flex items-center gap-2 flex-1 text-left">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-accent-gold" /> Top Clientes
                    </h3>
                    {panelClientes ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  <a href="/admin/usuarios" className="text-xs text-brand-400 hover:text-brand-300 transition-colors ml-3">Ver todos →</a>
                </div>
                {panelClientes && (ranking.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">Nenhuma compra registrada ainda</p>
                ) : (
                  <div className="space-y-2 mt-3">
                    {ranking.map((c, i) => {
                      const medalColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-400'
                      const MedalIcon  = i === 0 ? Star : i <= 2 ? Medal : Trophy
                      return (
                        <div key={c.userId} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors">
                          <MedalIcon className={clsx('w-4 h-4 shrink-0', medalColor)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{c.nome}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-gray-500">{c.numVisitas} visita{c.numVisitas !== 1 ? 's' : ''} · {fmt(c.ticketMedio)}/visita</span>
                              {c.inativo30 && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">inativo</span>
                              )}
                              {c.pontosVencemEm !== null && c.pontos > 0 && c.pontosVencemEm <= 14 && (
                                <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                                  c.pontosVencemEm < 0 ? 'bg-red-500/15 text-red-400 border-red-500/20' : 'bg-orange-500/15 text-orange-400 border-orange-500/20'
                                )}>
                                  {c.pontosVencemEm < 0 ? `${c.pontos}pts vencidos` : `${c.pontos}pts vencem em ${c.pontosVencemEm}d`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-sm font-bold text-accent-gold font-mono">{fmt(c.gastoTotal)}</p>
                            {c.whatsApp && (
                              <a href={`https://wa.me/${c.whatsApp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 transition-colors"
                                title={`WhatsApp: ${c.whatsApp}`}>
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {dp.panels.lgpd && (
              <div className="card">
                <button onClick={togglePanelLgpd} className="w-full flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand-400" /> LGPD
                  </h3>
                  {panelLgpd ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {panelLgpd && (
                  <a href="/admin/lgpd" className="mt-3 flex items-center gap-3 p-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors">
                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      pendingLgpd.some(r => r.isOverdue) ? 'bg-red-500/15' : pendingLgpd.length > 0 ? 'bg-brand-500/15' : 'bg-surface-600')}>
                      <Shield className={clsx('w-4 h-4',
                        pendingLgpd.some(r => r.isOverdue) ? 'text-red-400' : pendingLgpd.length > 0 ? 'text-brand-400' : 'text-gray-500')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Solicitações LGPD</p>
                      <p className="text-xs text-gray-500">
                        {pendingLgpd.some(r => r.isOverdue) ? 'Solicitação vencida!' : 'Pendentes de resposta'}
                      </p>
                    </div>
                    <span className={clsx('text-sm font-bold tabular-nums',
                      pendingLgpd.some(r => r.isOverdue) ? 'text-red-400' : pendingLgpd.length > 0 ? 'text-brand-400' : 'text-gray-600')}>
                      {pendingLgpd.length}
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ── Produtos & Eventos ── */}
          {(dp.panels.produtos || dp.panels.preInscricoes || dp.panels.preVenda) && (
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest -mb-3">Produtos & eventos</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {dp.panels.produtos && (
              <div className="card">
                <button onClick={togglePanelProdutos} className="w-full flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Star className="w-4 h-4 text-accent-gold" />
                    Top produtos
                    <span className="text-xs font-normal text-gray-500">
                      {prodDe || prodAte ? `${prodDe || '…'} → ${prodAte || '…'}` : '(todos os tempos)'}
                    </span>
                  </h3>
                  {panelProdutos ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {panelProdutos && (
                  <div className="mt-3 space-y-3">
                    {/* Seletor de período — calendário De/Até */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 shrink-0">De</span>
                        <input
                          type="date"
                          value={prodDe}
                          max={prodAte || brToday()}
                          onChange={e => { setProdDe(e.target.value); fetchProdutos(e.target.value, prodAte) }}
                          className="input text-xs py-1 w-32"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 shrink-0">Até</span>
                        <input
                          type="date"
                          value={prodAte}
                          max={brToday()}
                          min={prodDe || undefined}
                          onChange={e => { setProdAte(e.target.value); fetchProdutos(prodDe, e.target.value) }}
                          className="input text-xs py-1 w-32"
                        />
                      </div>
                      <button
                        onClick={() => { setProdDe(''); setProdAte(''); fetchProdutos('', '') }}
                        className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-surface-700 text-gray-500 border border-surface-600 hover:text-gray-300 transition-colors"
                      >
                        Geral
                      </button>
                    </div>

                    {/* Lista */}
                    {finProdutos && finProdutos.topProdutos.length > 0 ? (
                      <div className="space-y-1">
                        {finProdutos.topProdutos.slice(0, 5).map((p, i) => (
                          <div key={p.nome} className="flex items-center gap-2 py-1.5 border-b border-surface-600 last:border-0">
                            <span className="text-xs text-gray-600 w-3.5 shrink-0">{i + 1}</span>
                            <span className="text-sm text-gray-300 flex-1 truncate">{p.nome}</span>
                            <span className="text-xs text-gray-500 shrink-0">{p.qtd}un</span>
                            <span className="text-sm font-bold text-accent-gold shrink-0">{fmt(p.receita)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600 text-center py-3">Nenhum produto no período</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {dp.panels.preInscricoes && (
              <div className="card">
                <button onClick={togglePanelPreInscricoes} className="w-full flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-amber-400" /> Pré-inscrições
                  </h3>
                  {panelPreInscricoes ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {panelPreInscricoes && (
                  <a href="/admin/campeonatos" className="mt-3 flex items-center gap-3 p-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors">
                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      pendingPI > 0 ? 'bg-amber-500/15' : 'bg-surface-600')}>
                      <MessageCircle className={clsx('w-4 h-4', pendingPI > 0 ? 'text-amber-400' : 'text-gray-500')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Campeonatos</p>
                      <p className="text-xs text-gray-500">Pré-inscrições pendentes</p>
                    </div>
                    <span className={clsx('text-sm font-bold tabular-nums', pendingPI > 0 ? 'text-amber-400' : 'text-gray-600')}>
                      {pendingPI}
                    </span>
                  </a>
                )}
              </div>
            )}

            {dp.panels.preVenda && (
              <div className="card">
                <button onClick={togglePanelPreVenda} className="w-full flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" /> Pré-venda &amp; Fila
                  </h3>
                  {panelPreVenda ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {panelPreVenda && (
                  <a href="/admin/reservas" className="mt-3 flex items-center gap-3 p-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors">
                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      pendingPreVenda > 0 ? 'bg-amber-500/15' : 'bg-surface-600')}>
                      <Package className={clsx('w-4 h-4', pendingPreVenda > 0 ? 'text-amber-400' : 'text-gray-500')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Fila de espera</p>
                      <p className="text-xs text-gray-500">Aguardando chegada do item</p>
                    </div>
                    <span className={clsx('text-sm font-bold tabular-nums', pendingPreVenda > 0 ? 'text-amber-400' : 'text-gray-600')}>
                      {pendingPreVenda}
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Modal editar comanda fechada */}
      {editComanda && (
        <EditarComandaModal
          comanda={editComanda}
          clientes={allUsers}
          produtos={allProducts}
          onSave={handleEditar}
          onClose={() => setEditComanda(null)}
        />
      )}

      {pendingClose && (
        <EscolherContaCrediarioModal
          userName={pendingClose.userName}
          contasAbertas={contasAbertas}
          valorNovo={pendingClose.valorPrincipal}
          onEscolher={async (credId) => {
            setPendingClose(null)
            await executarClose(pendingClose.id, pendingClose.pm, pendingClose.pm2, pendingClose.amt2, credId, pendingClose.discount, pendingClose.emitirNota)
          }}
          onNova={async () => {
            setPendingClose(null)
            await executarClose(pendingClose.id, pendingClose.pm, pendingClose.pm2, pendingClose.amt2, undefined, pendingClose.discount, pendingClose.emitirNota)
          }}
          onCancel={() => setPendingClose(null)}
        />
      )}
    </div>
  )
}
