'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, comandaApi, userApi, productApi, categoryApi, reservationApi, variantApi, ComandaDto, Product, ProductCategory, UserProfile, ProductVariant, PixCobrancaDto, MyReservation } from '@/lib/api'
import { getUserName } from '@/lib/auth'
import NotificationBell from '@/components/cliente/NotificationBell'
import { startHub, stopHub, ComandaOpenedEvent } from '@/lib/signalr'
import toast, { Toaster } from 'react-hot-toast'
import {
  ShoppingCart, Plus, Trash2, Loader2, Search,
  Receipt, PackageOpen, Star, User as UserIcon, Package, ChevronRight, ChevronDown,
  Trophy, Swords, Medal, BookOpen, Bell, ShoppingBag,
  QrCode, Copy, Share2,
} from 'lucide-react'
import Link from 'next/link'

interface MyParticipation {
  participationId: string
  championshipId: string
  championshipName: string
  game: string
  startDate: string
  status: string
  entryFeeInReais: number
  playerNumber: number
  deckName?: string
  placement?: number
  registeredAt: string
  entryFeePaidAt?: string | null
  entryFeePaymentMethod?: string | null
  /** Prazo pra pagar sem perder a vaga. Null = vaga firme (grátis, paga, ou antiga). */
  inscricaoExpiraEm?: string | null
}

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

function PlacementBadge({ place }: { place: number }) {
  if (place === 1) return <span className="text-xl">🥇</span>
  if (place === 2) return <span className="text-xl">🥈</span>
  if (place === 3) return <span className="text-xl">🥉</span>
  return <span className="text-sm font-black" style={{ color: '#4D8FAC' }}>{place}º</span>
}

function MeusCampeonatos() {
  const [participations, setParticipations] = useState<MyParticipation[]>([])
  const [loading, setLoading] = useState(true)
  const [pixInscricao, setPixInscricao] = useState<{ championshipId: string; pix: PixCobrancaDto } | null>(null)
  const [gerandoPix, setGerandoPix] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`${BASE}/api/championship/my-participations`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setParticipations(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function pagarInscricao(championshipId: string) {
    setGerandoPix(championshipId)
    try {
      const { data } = await api.post<PixCobrancaDto>(`/api/championship/${championshipId}/my-inscription/pix`)
      setPixInscricao({ championshipId, pix: data })
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível gerar o Pix agora.')
    } finally { setGerandoPix(null) }
  }

  // Polling: enquanto o Pix da inscrição está aberto, verifica a cada 6s
  useEffect(() => {
    if (!pixInscricao) return
    const id = setInterval(async () => {
      try {
        const { data } = await api.post(`/api/championship/${pixInscricao.championshipId}/my-inscription/pix/verificar`)
        if (data.status === 'CONCLUIDA') {
          setPixInscricao(null)
          toast.success('Inscrição paga! 🎉', { duration: 6000 })
          load()
        }
      } catch { /* tenta no próximo tick */ }
    }, 6000)
    return () => clearInterval(id)
  }, [pixInscricao, load])

  if (loading || participations.length === 0) return null

  const active   = participations.filter(p => p.status === 'Inscricoes' || p.status === 'Planejado' || p.status === 'EmAndamento')
  const finished = participations.filter(p => p.status === 'Finalizado')

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(12,61,90,0.06)' }}>
      <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: C.border }}>
        <Trophy className="w-4 h-4" style={{ color: C.blue }} />
        <h2 className="font-black text-sm" style={{ color: C.navy }}>Meus Campeonatos</h2>
      </div>

      <div className="divide-y" style={{ borderColor: C.border }}>
        {active.map(p => (
          <div key={p.participationId} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight truncate" style={{ color: C.navy }}>{p.championshipName}</p>
                <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: C.muted }}>
                  <Swords className="w-3 h-3 shrink-0" /> {p.game}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: C.muted }}>Nº jogador</p>
                <p className="text-lg font-black leading-tight" style={{ color: C.blue2 }}>#{p.playerNumber}</p>
              </div>
            </div>

            {/* Taxa de inscrição: paga (chip) ou botão de Pix */}
            {p.entryFeeInReais > 0 && (
              p.entryFeePaidAt ? (
                <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-black px-2 py-1 rounded-full"
                  style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                  ✓ Inscrição paga {p.entryFeePaymentMethod === 'Pix' ? 'via Pix' : 'no balcão'}
                </span>
              ) : pixInscricao?.championshipId === p.championshipId ? (
                <div className="mt-3 space-y-2">
                  <PixPagamentoCard pix={pixInscricao.pix} />
                  <button onClick={() => setPixInscricao(null)}
                    className="w-full text-center text-xs font-bold py-1" style={{ color: C.muted }}>
                    Fechar — pago depois
                  </button>
                </div>
              ) : (
                <>
                  {/* O jogador precisa saber que a vaga tem prazo — senão perde sem entender. */}
                  {p.inscricaoExpiraEm && (
                    <p className="mt-2 text-[11px] font-bold leading-snug"
                      style={{ color: new Date(p.inscricaoExpiraEm) > new Date() ? '#B45309' : '#DC2626' }}>
                      {new Date(p.inscricaoExpiraEm) > new Date()
                        ? `Sua vaga está guardada até ${new Date(p.inscricaoExpiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — pague pra confirmar.`
                        : 'O prazo de pagamento venceu e a vaga voltou pro público. Pague pra tentar garantir de novo, ou fale com a loja.'}
                    </p>
                  )}
                  <button onClick={() => pagarInscricao(p.championshipId)}
                  disabled={gerandoPix === p.championshipId}
                  className="mt-2 w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  style={{ backgroundColor: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC' }}>
                  {gerandoPix === p.championshipId
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <QrCode className="w-3.5 h-3.5" />}
                  Pagar inscrição via Pix — R$ {p.entryFeeInReais.toFixed(2).replace('.', ',')}
                  </button>
                </>
              )
            )}
          </div>
        ))}

        {finished.map(p => (
          <div key={p.participationId} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate" style={{ color: C.navy }}>{p.championshipName}</p>
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: C.muted }}>
                <Swords className="w-3 h-3 shrink-0" /> {p.game}
              </p>
            </div>
            <div className="text-right shrink-0 flex items-center gap-2">
              {p.placement ? (
                <div className="flex flex-col items-center">
                  <PlacementBadge place={p.placement} />
                  {p.placement > 3 && (
                    <p className="text-[10px]" style={{ color: C.muted }}>lugar</p>
                  )}
                </div>
              ) : (
                <Medal className="w-4 h-4" style={{ color: C.muted }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const C = {
  navy:   '#0C3D5A',
  blue:   '#3EC2F2',
  blue2:  '#1A9DD4',
  yellow: '#FFE45E',
  bg:     '#EBF7FD',
  white:  '#FFFFFF',
  muted:  '#4D8FAC',
  border: 'rgba(62,194,242,0.18)',
}

function ProductCard({ p, adding, onAdd }: {
  p: Product
  adding: string | null
  onAdd: () => void
}) {
  const isAdding        = adding === p.id
  const outOfStock      = p.stockQuantity === 0
  const canWaitList     = outOfStock && p.isPreVenda
  const unavailable     = outOfStock && !canWaitList

  const [filaEntry,     setFilaEntry]   = useState<MyReservation | null>(null)
  const [waitLoading,   setWaitLoading] = useState(false)

  useEffect(() => {
    if (!canWaitList) return
    reservationApi.mine()
      .then(r => setFilaEntry(r.data.find(x =>
        x.productId === p.id && x.kind === 'fila' && x.status === 'waiting') ?? null))
      .catch(() => {})
  }, [p.id, canWaitList])

  async function handleWaitList() {
    setWaitLoading(true)
    try {
      if (filaEntry) {
        await reservationApi.cancel(filaEntry.id)
        setFilaEntry(null)
        toast.success('Você saiu da fila.')
      } else {
        await reservationApi.create({ productId: p.id })
        const r = await reservationApi.mine()
        const entry = r.data.find(x =>
          x.productId === p.id && x.kind === 'fila' && x.status === 'waiting') ?? null
        setFilaEntry(entry)
        toast.success(entry?.posicaoFila
          ? `Você é o #${entry.posicaoFila} na fila!`
          : 'Você entrou na fila!')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao entrar na fila.')
    } finally { setWaitLoading(false) }
  }

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(12,61,90,0.06)', opacity: unavailable ? 0.7 : 1 }}>
      <button
        onClick={unavailable || canWaitList ? undefined : onAdd}
        disabled={isAdding || unavailable}
        className="text-left w-full"
        style={{ cursor: unavailable || canWaitList ? 'default' : undefined }}
      >
        <div className="relative w-full aspect-square overflow-hidden flex items-center justify-center p-2"
          style={{ backgroundColor: C.bg }}>
          {p.imageUrl
            ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
            : <Package className="w-10 h-10 opacity-20" style={{ color: C.blue2 }} />}
          {p.isPreVenda && !outOfStock && (
            <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Pré-venda</span>
          )}
          {canWaitList && (
            <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Em breve</span>
          )}
          {!p.isPreVenda && p.isOnPromo && !outOfStock && (
            <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#FF3B3B', color: '#fff' }}>Promoção</span>
          )}
          {unavailable && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.55)' }}>
              <span className="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-md"
                style={{ backgroundColor: '#6B7280', color: '#fff' }}>Indisponível</span>
            </div>
          )}
        </div>
        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <p className="text-xs font-bold leading-snug line-clamp-2 flex-1" style={{ color: C.navy }}>{p.name}</p>
          {!canWaitList && (
            <div className="flex items-center justify-between mt-1 gap-1">
              {p.isOnPromo && p.discountPriceInReais != null && !outOfStock ? (
                <div className="flex flex-col">
                  <span className="text-[10px] line-through" style={{ color: C.muted }}>R$ {p.priceInReais.toFixed(2).replace('.', ',')}</span>
                  <span className="text-sm font-black" style={{ color: '#FF3B3B' }}>R$ {p.discountPriceInReais.toFixed(2).replace('.', ',')}</span>
                </div>
              ) : (
                <span className="text-sm font-black" style={{ color: unavailable ? C.muted : C.blue2 }}>
                  R$ {p.priceInReais.toFixed(2).replace('.', ',')}
                </span>
              )}
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: unavailable ? '#E5E7EB' : isAdding ? `${C.blue}25` : C.blue }}>
                {isAdding
                  ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.blue }} />
                  : unavailable
                    ? <span className="text-[10px] font-bold text-gray-400">—</span>
                    : <Plus className="w-4 h-4 text-white" />}
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Botão de fila (produto que ainda não chegou) */}
      {canWaitList && (
        <div className="px-3 pb-3 space-y-1.5">
          <span className="text-sm font-black" style={{ color: C.blue2 }}>
            R$ {p.priceInReais.toFixed(2).replace('.', ',')}
          </span>
          <button
            onClick={handleWaitList}
            disabled={waitLoading}
            className="w-full py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all"
            style={{
              backgroundColor: filaEntry ? '#F0FDF4' : '#EDE9FE',
              color:           filaEntry ? '#16A34A' : '#7C3AED',
              border:          `1px solid ${filaEntry ? '#86EFAC' : '#C4B5FD'}`,
            }}
          >
            {waitLoading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Bell className="w-3 h-3" />}
            {filaEntry
              ? `Na fila${filaEntry.posicaoFila ? ` · #${filaEntry.posicaoFila}` : ''} — Sair da fila`
              : 'Entrar na fila'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Card de pagamento Pix na comanda do cliente ───────────────────────────────
// Aparece quando o admin gera uma cobrança: QR Code, copia-e-cola e botão que
// abre a lista de apps do celular (share sheet) com o código pronto pra colar.
function PixPagamentoCard({ pix }: { pix: PixCobrancaDto }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!pix.pixCopiaCola) return
    try {
      await navigator.clipboard.writeText(pix.pixCopiaCola)
      setCopiado(true)
      toast.success('Código Pix copiado!')
      setTimeout(() => setCopiado(false), 3000)
    } catch {
      toast.error('Não consegui copiar — selecione o código manualmente.')
    }
  }

  async function pagarNoBanco() {
    if (!pix.pixCopiaCola) return
    // Copia antes de compartilhar: mesmo que o app do banco não leia o texto
    // compartilhado, o cliente já tem o código no clipboard pra colar.
    try { await navigator.clipboard.writeText(pix.pixCopiaCola) } catch { /* segue */ }

    if (navigator.share) {
      try {
        await navigator.share({ text: pix.pixCopiaCola })
      } catch { /* usuário fechou o share sheet — sem erro */ }
    } else {
      toast.success('Código copiado! Abra o app do seu banco e cole na área Pix.', { duration: 6000 })
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: C.white, border: '2px solid #22c55e', boxShadow: '0 4px 20px rgba(34,197,94,0.25)' }}>
      <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: '#F0FDF4' }}>
        <QrCode className="w-4 h-4" style={{ color: '#16a34a' }} />
        <h2 className="font-black text-sm flex-1" style={{ color: '#15803d' }}>Pagamento Pix</h2>
        <span className="text-lg font-black" style={{ color: '#15803d' }}>
          R$ {pix.valorEmReais.toFixed(2).replace('.', ',')}
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        {pix.imagemQrCode && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pix.imagemQrCode} alt="QR Code Pix" className="w-44 h-44 rounded-xl"
              style={{ border: `1px solid ${C.border}` }} />
          </div>
        )}

        <button onClick={pagarNoBanco}
          className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ backgroundColor: '#16a34a', color: '#fff' }}>
          <Share2 className="w-4 h-4" /> Pagar no app do banco
        </button>

        <button onClick={copiar}
          className="w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-all active:scale-95"
          style={{ borderColor: C.border, color: C.blue2 }}>
          <Copy className="w-3.5 h-3.5" />
          {copiado ? 'Copiado!' : 'Copiar código Pix (copia e cola)'}
        </button>

        <p className="text-[11px] text-center font-medium" style={{ color: C.muted }}>
          Assim que o pagamento cair, sua comanda fecha sozinha. ✨
        </p>
      </div>
    </div>
  )
}

export default function ClientePage() {
  const [comanda,      setComanda]      = useState<ComandaDto | null>(null)
  const [products,     setProducts]     = useState<Product[]>([])
  const [categories,   setCategories]   = useState<ProductCategory[]>([])
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [adding,       setAdding]       = useState<string | null>(null)
  const [applyingPts,  setApplyingPts]  = useState(false)
  const [removingPts,  setRemovingPts]  = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [confirmItem,  setConfirmItem]  = useState<Product | null>(null)
  const [showComandaSheet, setShowComandaSheet] = useState(false)
  const [variantModal,    setVariantModal]    = useState<Product | null>(null)
  const [variants,        setVariants]        = useState<ProductVariant[]>([])
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [pix,             setPix]             = useState<PixCobrancaDto | null>(null)

  const fetchComanda = useCallback(async () => {
    try {
      const { data } = await comandaApi.myComanda()
      setComanda(data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) setComanda(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPix = useCallback(async () => {
    try {
      const { data } = await comandaApi.meuPix()
      setPix(data)
    } catch {
      setPix(null) // 404 = nenhuma cobrança ativa
    }
  }, [])

  // Enquanto há cobrança ativa, verifica no Inter a cada 6s — quando o
  // pagamento cai, o backend fecha a comanda e o ComandaClosed chega via SignalR.
  useEffect(() => {
    if (!pix || pix.status !== 'ATIVA') return
    const id = setInterval(async () => {
      try {
        const { data } = await comandaApi.verificarMeuPix()
        if (data.status === 'CONCLUIDA') {
          setPix(null)
          toast.success('Pagamento confirmado! 🎉', { duration: 6000 })
          fetchComanda()
        }
      } catch { /* rede/Inter fora — tenta de novo no próximo tick */ }
    }, 6000)
    return () => clearInterval(id)
  }, [pix, fetchComanda])

  useEffect(() => {
    fetchComanda()
    fetchPix()
    productApi.listStore().then(r => setProducts(r.data)).catch(() => {})
    categoryApi.list().then(r => setCategories(r.data)).catch(() => {})
    userApi.me().then(r => setProfile(r.data)).catch(() => {})

    startHub().then(hub => {
      hub.on('ComandaOpened', async (data: ComandaOpenedEvent) => {
        await hub.invoke('JoinComandaGroup', data.comandaId).catch(() => {})
        await fetchComanda()
        toast.success('Sua comanda foi aberta!', { duration: 5000 })
      })
      hub.on('ComandaClosed', () => {
        toast.success('Comanda fechada! Obrigado pela visita.', { duration: 6000 })
        setPix(null)
        fetchComanda()
      })
      hub.on('ComandaCancelled', () => {
        toast.error('Sua comanda foi cancelada.', { duration: 6000 })
        setPix(null)
        fetchComanda()
      })
      hub.on('ItemAddedByAdmin', (data: { itemName: string }) => {
        toast(`+${data.itemName} adicionado pelo atendente`, { icon: '🛒' })
        fetchComanda()
      })
      hub.on('PixCobrancaCriada', (data: PixCobrancaDto) => {
        setPix(data)
        toast('Cobrança Pix recebida — pague direto pelo app do seu banco!', { icon: '💸', duration: 8000 })
      })
      hub.on('ComandaUpdated', () => fetchComanda())
      hub.onreconnected(() => { fetchComanda(); fetchPix() })
    }).catch(() => {})

    return () => { stopHub() }
  }, [fetchComanda, fetchPix])

  // Carrega variantes quando um produto com grade é selecionado
  useEffect(() => {
    if (!variantModal) { setVariants([]); setSelectedVariant(null); return }
    setLoadingVariants(true)
    variantApi.list(variantModal.id)
      .then(r => setVariants(r.data))
      .catch(() => {})
      .finally(() => setLoadingVariants(false))
  }, [variantModal])

  async function addProduct(product: Product, variantId?: string) {
    if (!comanda) return
    setConfirmItem(null)
    setVariantModal(null)
    setAdding(product.id)
    try {
      const { data } = await comandaApi.addItem(comanda.id, {
        productId: product.id,
        variantId,
        itemName: product.name,
        unitPriceInCents: product.isOnPromo && product.discountPriceInCents != null
          ? product.discountPriceInCents
          : product.priceInCents,
        quantity: 1,
      })
      setComanda(data)
      toast.success(`${product.name} adicionado!`)
    } catch {
      toast.error('Não foi possível adicionar o item.')
    } finally {
      setAdding(null)
    }
  }

  async function applyPoints() {
    if (!comanda || !profile || profile.pointsBalance <= 0) return
    setApplyingPts(true)
    try {
      const { data } = await comandaApi.applyPoints(comanda.id, profile.pointsBalance)
      setComanda(data)
      setProfile(prev => prev ? { ...prev, pointsBalance: 0 } : prev)
      toast.success(`${profile.pointsBalance} pontos aplicados!`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao aplicar pontos.')
    } finally { setApplyingPts(false) }
  }

  async function removePoints() {
    if (!comanda) return
    setRemovingPts(true)
    try {
      const { data } = await comandaApi.removePoints(comanda.id)
      const devolvidos = comanda.pointsApplied
      setComanda(data)
      setProfile(prev => prev ? { ...prev, pointsBalance: (prev.pointsBalance ?? 0) + devolvidos } : prev)
      toast.success('Pontos devolvidos ao saldo!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao remover pontos.')
    } finally { setRemovingPts(false) }
  }

  // Total líquido de pontos já aplicados — os pontos só abatem "de verdade" no fechamento
  // (CloseComandaAsync), mas o cliente precisa ver o valor já descontado, senão parece que
  // "usar pontos" não fez nada.
  const netTotal = comanda ? Math.max(0, comanda.totalInReais - comanda.pointsApplied / 100) : 0

  // Backend já filtra isActive + showOnSite; exibimos todos inclusive sem estoque (badge "Indisponível")
  const activeProducts = products.filter(p => p.isActive)

  const filteredProducts = activeProducts.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCat    = !activeCategory || p.category === activeCategory
    return matchSearch && matchCat
  })

  const activeCategories = categories
    .filter(cat => cat.isActive && activeProducts.some(p => p.category === cat.name))
    .sort((a, b) => a.displayOrder - b.displayOrder)

  const groupedProducts = activeCategories
    .filter(cat => filteredProducts.some(p => p.category === cat.name))
    .map(cat => ({ category: cat, items: filteredProducts.filter(p => p.category === cat.name) }))

  const uncategorized = filteredProducts.filter(p =>
    !categories.some(cat => cat.name === p.category)
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <Toaster position="top-center" toastOptions={{
        style: { background: C.white, color: C.navy, border: `1px solid ${C.border}`, fontWeight: 600 }
      }} />

      {/* ── Modal de grade (tamanho/cor) ─────────────────────────────────── */}
      {variantModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setVariantModal(null)}>
          <div className="w-full max-w-lg rounded-t-3xl shadow-2xl"
            style={{ backgroundColor: C.white }}
            onClick={e => e.stopPropagation()}>

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: C.border.replace('0.18', '0.4') }} />
            </div>

            {/* Cabeçalho */}
            <div className="px-5 pt-2 pb-4 border-b" style={{ borderColor: C.border }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Selecione o tamanho/cor</p>
              <p className="font-black text-lg mt-0.5 leading-snug" style={{ color: C.navy }}>{variantModal.name}</p>
              <p className="text-base font-black mt-1" style={{ color: C.blue2 }}>
                R$ {(variantModal.isOnPromo && variantModal.discountPriceInReais != null
                  ? variantModal.discountPriceInReais
                  : variantModal.priceInReais
                ).toFixed(2).replace('.', ',')}
              </p>
            </div>

            {/* Variantes */}
            <div className="px-5 py-5">
              {loadingVariants ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.blue }} />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[...variants]
                    .sort((a, b) => {
                      const ord = ['PP','P','M','G','GG','XGG','EG','EGG','U','Único']
                      const ai = ord.indexOf(a.size ?? ''), bi = ord.indexOf(b.size ?? '')
                      if (ai === -1 && bi === -1) return (a.label ?? '').localeCompare(b.label ?? '')
                      if (ai === -1) return 1; if (bi === -1) return -1
                      return ai - bi
                    })
                    .map(v => {
                      const inStock = v.stockQuantity > 0
                      const label   = v.size || v.color || v.label
                      const sel     = selectedVariant?.id === v.id
                      return (
                        <button key={v.id}
                          onClick={() => inStock && setSelectedVariant(v)}
                          disabled={!inStock}
                          title={inStock ? `${v.stockQuantity} em estoque` : 'Sem estoque'}
                          className="relative px-4 py-2.5 rounded-xl text-sm font-black border-2 transition-all"
                          style={{
                            backgroundColor: sel ? C.navy : 'transparent',
                            color:           sel ? C.yellow : inStock ? C.navy : C.muted,
                            borderColor:     sel ? C.navy : inStock ? C.border.replace('0.18','0.5') : C.border,
                            opacity:         inStock ? 1 : 0.4,
                          }}>
                          {label}
                          {!inStock && (
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="w-full h-px rotate-45" style={{ backgroundColor: C.muted }} />
                            </span>
                          )}
                        </button>
                      )
                    })
                  }
                </div>
              )}
              {selectedVariant && (
                <p className="text-xs font-bold mt-3 text-center" style={{ color: C.blue2 }}>
                  {selectedVariant.stockQuantity} unidade{selectedVariant.stockQuantity !== 1 ? 's' : ''} em estoque
                </p>
              )}
            </div>

            {/* Ações */}
            <div className="px-5 pb-8 flex gap-3">
              <button onClick={() => setVariantModal(null)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm border-2 transition-colors"
                style={{ borderColor: C.border, color: C.muted }}>
                Cancelar
              </button>
              <button
                onClick={() => selectedVariant && addProduct(variantModal, selectedVariant.id)}
                disabled={!selectedVariant || adding === variantModal.id}
                className="flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                style={{ backgroundColor: C.yellow, color: C.navy }}>
                {adding === variantModal.id
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <><Plus className="w-5 h-5" /> Adicionar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação — z-[60] fica acima do bottom sheet (z-50) */}
      {confirmItem && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-20 pt-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmItem(null)}>
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl"
            style={{ backgroundColor: C.white }}
            onClick={e => e.stopPropagation()}>
            {confirmItem.imageUrl && (
              <div className="w-full h-48 flex items-center justify-center p-4"
                style={{ backgroundColor: C.bg }}>
                <img src={confirmItem.imageUrl} alt={confirmItem.name} className="h-full w-full object-contain" />
              </div>
            )}
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                  Adicionar à comanda
                </p>
                <p className="font-black text-lg leading-snug" style={{ color: C.navy }}>{confirmItem.name}</p>
                {confirmItem.isOnPromo && confirmItem.discountPriceInReais != null ? (
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black" style={{ color: '#FF3B3B' }}>
                      R$ {confirmItem.discountPriceInReais.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-sm line-through" style={{ color: C.muted }}>
                      R$ {confirmItem.priceInReais.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ) : (
                  <p className="text-xl font-black mt-1" style={{ color: C.blue2 }}>
                    R$ {confirmItem.priceInReais.toFixed(2).replace('.', ',')}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmItem(null)}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm border transition-colors"
                  style={{ borderColor: C.border, color: C.muted }}>
                  Cancelar
                </button>
                <button onClick={() => addProduct(confirmItem)}
                  disabled={adding === confirmItem.id}
                  className="flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ backgroundColor: C.yellow, color: C.navy }}>
                  {adding === confirmItem.id
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Plus className="w-5 h-5" /> Confirmar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header style={{ backgroundColor: C.navy }}>
        <div className="max-w-lg mx-auto px-5 pt-10 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-maikon.png" alt="Santuário Nerd" className="w-10 h-10 object-contain drop-shadow-md" />
            <div>
              <p className="text-white font-black text-base leading-tight">Santuário Nerd</p>
              {profile && (
                <p className="text-xs font-bold mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Olá, {profile.name.split(' ')[0]}!
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link href="/cliente/perfil">
              {profile?.profileImageUrl
                ? <img src={profile.profileImageUrl} alt={profile.name}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white/40" />
                : <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm"
                    style={{ backgroundColor: C.yellow, color: C.navy }}>
                    {profile?.name?.charAt(0).toUpperCase() ?? <UserIcon className="w-5 h-5" />}
                  </div>
              }
            </Link>
          </div>
        </div>
      </header>

      {/* ── CONTENT ─────────────────────────────────────────────────── */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-24">

        {/* Pontos */}
        {profile && (
          <div className="rounded-2xl p-4 flex items-center justify-between"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(12,61,90,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${C.blue}18` }}>
                <Star className="w-5 h-5" style={{ color: C.blue }} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Seus Pontos</p>
                <p className="text-xl font-black leading-tight" style={{ color: C.navy }}>
                  {profile.pointsBalance} <span className="text-xs font-semibold" style={{ color: C.muted }}>pts</span>
                </p>
              </div>
            </div>
            {profile.balanceInCents > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Cashback</p>
                <p className="text-base font-black" style={{ color: '#22c55e' }}>
                  R$ {(profile.balanceInCents / 100).toFixed(2).replace('.', ',')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Atalhos rápidos */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/cliente/mercado" className="flex items-center gap-3 rounded-2xl p-4 transition-all active:scale-95"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${C.blue}18` }}>
              <ShoppingBag className="w-4 h-4" style={{ color: C.blue }} />
            </div>
            <div>
              <p className="text-xs font-black" style={{ color: C.navy }}>Mercado de Cartas</p>
              <p className="text-[10px]" style={{ color: C.muted }}>Compre e venda cartas</p>
            </div>
          </Link>
          <Link href="/cliente/decks" className="flex items-center gap-3 rounded-2xl p-4 transition-all active:scale-95"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${C.blue}18` }}>
              <BookOpen className="w-4 h-4" style={{ color: C.blue }} />
            </div>
            <div>
              <p className="text-xs font-black" style={{ color: C.navy }}>Meus Decks</p>
              <p className="text-[10px]" style={{ color: C.muted }}>Gerenciar coleção</p>
            </div>
          </Link>
        </div>

        {/* Meus Campeonatos */}
        <MeusCampeonatos />


        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.blue }} />
            <p className="text-sm font-semibold" style={{ color: C.muted }}>Carregando sua comanda...</p>
          </div>
        ) : !comanda ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: C.white, border: `1px solid ${C.border}` }}>
              <PackageOpen className="w-10 h-10" style={{ color: C.muted }} />
            </div>
            <div>
              <h2 className="font-black text-lg" style={{ color: C.navy }}>Nenhuma comanda aberta</h2>
              <p className="text-sm mt-1" style={{ color: C.muted }}>
                Escaneie o QR Code da sua mesa ou peça pro atendente abrir — quando abrir,
                ela aparece aqui sozinha, sem precisar entrar de novo.
              </p>
            </div>
            {/* Sem comanda a conta continua útil: pontos, histórico e notas ficam no perfil. */}
            <Link href="/cliente/perfil"
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black transition-all active:scale-95"
              style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, color: C.navy }}>
              <UserIcon className="w-3.5 h-3.5" /> Ver minha conta e meus pontos
            </Link>
          </div>
        ) : (
          <>
            {/* ── PAGAMENTO PIX (quando o admin gera a cobrança) ────── */}
            {pix && pix.status === 'ATIVA' && pix.pixCopiaCola && (
              <PixPagamentoCard pix={pix} />
            )}

            {/* ── COMANDA ───────────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(12,61,90,0.06)' }}>

              {/* Header da comanda */}
              <div className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: C.border }}>
                <div className="flex items-center gap-3">
                  {profile?.profileImageUrl ? (
                    <img
                      src={profile.profileImageUrl}
                      alt={profile.name}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                      style={{ border: `2px solid ${C.border}` }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                      style={{ backgroundColor: C.yellow, color: C.navy }}
                    >
                      {profile?.name?.charAt(0).toUpperCase() ?? <UserIcon className="w-4 h-4" />}
                    </div>
                  )}
                  <div>
                    <span className="font-black text-sm block" style={{ color: C.navy }}>
                      Mesa {comanda.tableIdentifier || 'N/A'}
                    </span>
                    {profile && (
                      <span className="text-[11px] font-semibold block" style={{ color: C.muted }}>
                        {profile.name}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: `${C.blue}15`, color: C.blue2 }}>
                  {comanda.status}
                </span>
              </div>

              {/* Itens */}
              <div className="px-5 py-4">
                {comanda.items.length === 0 ? (
                  <p className="text-center text-sm py-4 italic font-medium" style={{ color: C.muted }}>
                    Nenhum item ainda...
                  </p>
                ) : (
                  <div className="space-y-3">
                    {comanda.items.map((item, idx) => (
                      <div key={item.id}>
                        <div className="flex justify-between items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold leading-tight truncate" style={{ color: C.navy }}>
                              {item.itemNameSnapshot}
                            </p>
                            <p className="text-xs mt-0.5 font-medium" style={{ color: C.muted }}>
                              {item.quantity}× R$ {item.unitPriceInReais.toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                          <span className="font-black text-sm shrink-0" style={{ color: C.blue2 }}>
                            R$ {item.subtotalInReais.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        {idx < comanda.items.length - 1 && (
                          <div className="mt-3 border-b" style={{ borderColor: C.border }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {comanda.items.length > 0 && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
                    <span className="font-black text-xs uppercase tracking-wide" style={{ color: C.muted }}>Total</span>
                    <span className="text-2xl font-black" style={{ color: C.navy }}>
                      R$ {netTotal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                )}
              </div>

              {/* Usar pontos */}
              {comanda.status !== 'Fechada' && comanda.status !== 'Cancelada' && (
                <div className="px-5 pb-5">
                  {comanda.pointsApplied > 0 ? (
                    <button onClick={removePoints} disabled={removingPts}
                      className="w-full p-3 rounded-xl flex items-center justify-between transition-opacity"
                      style={{ backgroundColor: '#22c55e18', color: '#16a34a' }}>
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <Star className="w-4 h-4" />
                        {(comanda.pointsApplied / 100).toFixed(2).replace('.', ',')} pts aplicados
                      </div>
                      <Trash2 className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  ) : profile && profile.pointsBalance > 0 && !profile.pointsExpired && (
                    <button onClick={applyPoints} disabled={applyingPts}
                      className="w-full p-3 rounded-xl flex items-center justify-between border border-dashed transition-all active:scale-95"
                      style={{ borderColor: `${C.blue}40`, color: C.blue2 }}>
                      <span className="font-bold text-xs">Usar {profile.pointsBalance} pontos acumulados</span>
                      {applyingPts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── PRODUTOS ──────────────────────────────────────────── */}
            {comanda.status !== 'Fechada' && comanda.status !== 'Cancelada' && (
              <div className="space-y-4">
                {/* Título */}
                <div className="flex items-center justify-between pt-2">
                  <h2 className="font-black text-xs uppercase tracking-widest flex items-center gap-2"
                    style={{ color: C.navy }}>
                    <ShoppingCart className="w-4 h-4" style={{ color: C.blue }} />
                    Itens para sua Jornada
                  </h2>
                  <span className="text-[10px] font-black uppercase" style={{ color: C.muted }}>
                    {filteredProducts.length} itens
                  </span>
                </div>

                {/* Busca */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: C.muted }} />
                  <input
                    type="text"
                    placeholder="Buscar item..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold outline-none transition-all"
                    style={{
                      backgroundColor: C.white,
                      border: `1.5px solid ${C.border}`,
                      color: C.navy,
                    }}
                  />
                </div>

                {/* Chips de categoria */}
                {activeCategories.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setActiveCategory(null)}
                      className="shrink-0 px-4 py-2 rounded-full text-xs font-black transition-all"
                      style={{
                        backgroundColor: activeCategory === null ? C.blue : C.white,
                        color: activeCategory === null ? C.white : C.muted,
                        border: `1.5px solid ${activeCategory === null ? C.blue : C.border}`,
                      }}>
                      Todos
                    </button>
                    {activeCategories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
                        className="shrink-0 px-4 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap"
                        style={{
                          backgroundColor: activeCategory === cat.name ? C.blue : C.white,
                          color: activeCategory === cat.name ? C.white : C.muted,
                          border: `1.5px solid ${activeCategory === cat.name ? C.blue : C.border}`,
                        }}>
                        {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Grid por categoria */}
                {groupedProducts.map(({ category, items }) => (
                  <div key={category.id} className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
                      style={{ color: C.blue2 }}>
                      {category.emoji && <span className="text-base">{category.emoji}</span>}
                      {category.name}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {items.map(p => (
                        <ProductCard key={p.id} p={p} adding={adding} onAdd={() => p.hasVariants ? setVariantModal(p) : setConfirmItem(p)} />
                      ))}
                    </div>
                  </div>
                ))}

                {uncategorized.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {uncategorized.map(p => (
                      <ProductCard key={p.id} p={p} adding={adding} onAdd={() => p.hasVariants ? setVariantModal(p) : setConfirmItem(p)} />
                    ))}
                  </div>
                )}

                {filteredProducts.length === 0 && (
                  <p className="text-center text-sm py-8 font-semibold" style={{ color: C.muted }}>
                    Nenhum item encontrado.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom sheet flutuante — comanda resumida */}
      {comanda && comanda.items.length > 0 && (
        <>
          {/* Overlay */}
          {showComandaSheet && (
            <div
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={() => setShowComandaSheet(false)}
            />
          )}

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out"
            style={{ transform: showComandaSheet ? 'translateY(0)' : 'translateY(calc(100% - 64px))' }}
          >
            <div className="max-w-lg mx-auto">
              {/* Handle — clique para abrir/fechar */}
              <button
                onClick={() => setShowComandaSheet(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-t-3xl shadow-[0_-4px_24px_rgba(12,61,90,0.22)]"
                style={{ backgroundColor: C.navy }}
              >
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-4 h-4 shrink-0" style={{ color: C.yellow }} />
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none"
                      style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {comanda.items.length} {comanda.items.length === 1 ? 'item' : 'itens'}
                    </p>
                    <p className="text-base font-black leading-tight text-white">
                      R$ {netTotal.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className="w-5 h-5 transition-transform duration-300"
                  style={{
                    color: C.yellow,
                    transform: showComandaSheet ? 'rotate(0deg)' : 'rotate(180deg)',
                  }}
                />
              </button>

              {/* Conteúdo da comanda */}
              <div className="max-h-72 overflow-y-auto px-5 pt-4 pb-6" style={{ backgroundColor: C.white }}>
                <div className="space-y-3">
                  {comanda.items.map((item, idx) => (
                    <div key={item.id}>
                      <div className="flex justify-between items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight truncate" style={{ color: C.navy }}>
                            {item.itemNameSnapshot}
                          </p>
                          <p className="text-xs mt-0.5 font-medium" style={{ color: C.muted }}>
                            {item.quantity}× R$ {item.unitPriceInReais.toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                        <span className="font-black text-sm shrink-0" style={{ color: C.blue2 }}>
                          R$ {item.subtotalInReais.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      {idx < comanda.items.length - 1 && (
                        <div className="mt-3 border-b" style={{ borderColor: C.border }} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
                  <span className="font-black text-xs uppercase tracking-wide" style={{ color: C.muted }}>Total</span>
                  <span className="text-2xl font-black" style={{ color: C.navy }}>
                    R$ {netTotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
