'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { reservationApi, ReservationPixStatus } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { useReservationCart } from '@/hooks/useReservationCart'
import {
  ChevronLeft, Trash2, Minus, Plus, BookmarkPlus, QrCode, Copy, CheckCircle,
  Loader2, RefreshCw, Package,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

const NAVY = '#0C3D5A'

function fmt(cents: number) { return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}` }

export default function ReservationCartPage() {
  const router = useRouter()
  const { items, removeItem, updateQuantity, clear, totalCents } = useReservationCart()
  const [isDark, setIsDark] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [temFila, setTemFila] = useState(false)
  const [semEstoque, setSemEstoque] = useState<{ productId: string; name: string }[] | null>(null)
  const [pix, setPix] = useState<ReservationPixStatus | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const C = isDark ? {
    bg: '#121215', card: '#1A1A1F', border: 'rgba(255,255,255,0.07)',
    navy: '#FFFFFF', text: 'rgba(255,255,255,0.65)', muted: 'rgba(255,255,255,0.35)',
  } : {
    bg: '#F5F8FA', card: '#FFFFFF', border: 'rgba(12,61,90,0.10)',
    navy: NAVY, text: '#4D8FAC', muted: '#9CA3AF',
  }

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'dark') setIsDark(true)
    if (!isLoggedIn()) router.push('/')
  }, [router])

  // allowFila=true só vem do diálogo de "acabou o estoque" — nunca por padrão,
  // pra reserva (estoque na hora) e fila (ainda não chegou) não se misturarem sozinhas.
  async function handleConfirm(allowFila = false) {
    if (items.length === 0) return
    setSubmitting(true)
    try {
      const { data } = await reservationApi.createCart(
        items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
        allowFila
      )
      setGroupId(data.groupId)
      setTemFila(data.items.some(i => i.kind === 'fila'))
      clear()
      toast.success('Reserva confirmada!')
    } catch (e) {
      const resp = (e as { response?: { status?: number; data?: { message?: string; Message?: string; semEstoque?: { productId: string; name: string }[]; SemEstoque?: { productId: string; name: string }[] } } })?.response
      // A API serializa em camelCase; o fallback PascalCase é só proteção.
      const itensSemEstoque = resp?.data?.semEstoque ?? resp?.data?.SemEstoque
      if (resp?.status === 409 && itensSemEstoque?.length) {
        // Backend recusou o carrinho inteiro (sem vazar estoque): cliente decide — fila ou remover.
        setSemEstoque(itensSemEstoque)
      } else {
        toast.error(resp?.data?.message ?? resp?.data?.Message ?? 'Erro ao confirmar a reserva. Verifique o estoque disponível.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function removerSemEstoque() {
    semEstoque?.forEach(s => {
      items.filter(i => i.productId === s.productId)
        .forEach(i => removeItem(i.productId, i.variantId))
    })
    setSemEstoque(null)
  }

  async function handleGerarPix() {
    if (!groupId) return
    setPixLoading(true)
    try {
      const { data } = await reservationApi.gerarPix(groupId)
      setPix({ hasPix: true, ...data })
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string; Message?: string } } })?.response?.data
      toast.error(msg?.message ?? msg?.Message ?? 'Pix indisponível no momento — pague na retirada.')
    } finally {
      setPixLoading(false)
    }
  }

  async function handleVerificarPix() {
    if (!groupId) return
    setVerifying(true)
    try {
      const { data } = await reservationApi.verificarPix(groupId)
      setPix(prev => prev ? { ...prev, status: data.status, pagoEm: data.pagoEm } : prev)
      if (data.status === 'CONCLUIDA') toast.success('Pagamento confirmado!')
      else toast('Ainda não identificamos o pagamento. Tenta de novo em alguns segundos.')
    } catch {
      toast.error('Erro ao verificar pagamento.')
    } finally {
      setVerifying(false)
    }
  }

  function copiaCola() {
    if (!pix?.pixCopiaCola) return
    navigator.clipboard.writeText(pix.pixCopiaCola)
    toast.success('Código Pix copiado!')
  }

  // ── Confirmação pós-reserva ──────────────────────────────────────────────
  if (groupId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.navy }}>
        <Toaster position="top-center" />
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="rounded-2xl border p-6 text-center space-y-3"
            style={{ backgroundColor: C.card, borderColor: C.border }}>
            <CheckCircle className="w-12 h-12 mx-auto" style={{ color: '#22C55E' }} />
            <h1 className="text-xl font-black">{temFila ? 'Reserva registrada!' : 'Reserva confirmada!'}</h1>
            <p className="text-sm" style={{ color: C.text }}>
              {temFila
                ? 'Os itens em estoque já foram separados pra você. Os itens que entraram na fila serão garantidos quando chegarem — a gente avisa. Pague no Pix ou na retirada.'
                : 'O estoque já foi separado pra você — retirada no balcão. Pague agora no Pix ou na retirada: sem pagamento em 48h, a reserva expira e o item volta pra loja.'}
            </p>
          </div>

          <div className="rounded-2xl border p-5 mt-4 space-y-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <h2 className="font-bold text-sm flex items-center gap-2" style={{ color: C.navy }}>
              <QrCode className="w-4 h-4" /> Pagamento via Pix (opcional)
            </h2>

            {!pix?.hasPix && !pix?.pixCopiaCola ? (
              <button onClick={handleGerarPix} disabled={pixLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
                {pixLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Gerar Pix
              </button>
            ) : (
              <div className="space-y-3">
                {pix.imagemQrCode && (
                  <img src={pix.imagemQrCode} alt="QR Code Pix" className="w-40 h-40 mx-auto rounded-lg border" style={{ borderColor: C.border }} />
                )}
                {pix.pixCopiaCola && (
                  <button onClick={copiaCola}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border"
                    style={{ borderColor: C.border, color: C.text }}>
                    <Copy className="w-3.5 h-3.5" /> Copiar código Pix
                  </button>
                )}
                <p className="text-center text-sm font-bold" style={{ color: C.navy }}>
                  {pix.valorEmReais !== undefined && fmt(Math.round(pix.valorEmReais * 100))}
                </p>
                <p className="text-center text-xs" style={{ color: pix.status === 'CONCLUIDA' ? '#22C55E' : C.muted }}>
                  {pix.status === 'CONCLUIDA' ? 'Pago ✅' : 'Aguardando pagamento...'}
                </p>
                {pix.status !== 'CONCLUIDA' && (
                  <button onClick={handleVerificarPix} disabled={verifying}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-60"
                    style={{ borderColor: '#7C3AED', color: '#7C3AED' }}>
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Já paguei, verificar
                  </button>
                )}
              </div>
            )}
          </div>

          <Link href="/cliente/perfil"
            className="mt-4 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm border transition-all hover:opacity-80"
            style={{ borderColor: C.border, color: C.text, backgroundColor: C.card }}>
            Ver minhas reservas
          </Link>
        </div>
      </div>
    )
  }

  // ── Carrinho ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.navy }}>
      <Toaster position="top-center" />
      <div className="max-w-md mx-auto px-4 py-6">
        <Link href="/produtos" className="inline-flex items-center gap-1.5 text-sm font-semibold mb-4" style={{ color: C.text }}>
          <ChevronLeft className="w-4 h-4" /> Voltar aos produtos
        </Link>

        <h1 className="text-xl font-black mb-1 flex items-center gap-2">
          <BookmarkPlus className="w-5 h-5" style={{ color: '#7C3AED' }} /> Sua reserva
        </h1>
        <p className="text-sm mb-5" style={{ color: C.text }}>
          Reserva com retirada no balcão: ao confirmar, o estoque baixa na hora pra você. Pague no Pix ou na retirada em até 48h — se o item tiver data de lançamento, até 48h depois dela.
        </p>

        {items.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <Package className="w-10 h-10 mx-auto mb-3" style={{ color: C.muted }} />
            <p className="text-sm" style={{ color: C.text }}>Sua reserva está vazia.</p>
            <Link href="/produtos" className="text-sm font-bold mt-2 inline-block" style={{ color: '#7C3AED' }}>
              Ver produtos disponíveis
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map(item => (
                <div key={`${item.productId}:${item.variantId ?? ''}`}
                  className="rounded-2xl border p-3 flex items-center gap-3"
                  style={{ backgroundColor: C.card, borderColor: C.border }}>
                  {item.productImageUrl ? (
                    <img src={item.productImageUrl} alt={item.productName} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: C.bg }}>
                      <Package className="w-6 h-6" style={{ color: C.muted }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: C.navy }}>{item.productName}</p>
                    {item.variantLabel && <p className="text-xs" style={{ color: C.muted }}>{item.variantLabel}</p>}
                    <p className="text-sm font-semibold" style={{ color: '#7C3AED' }}>{fmt(item.priceInCents * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="w-7 h-7 rounded-lg border flex items-center justify-center disabled:opacity-40"
                      style={{ borderColor: C.border, color: C.text }}>
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                      className="w-7 h-7 rounded-lg border flex items-center justify-center"
                      style={{ borderColor: C.border, color: C.text }}>
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeItem(item.productId, item.variantId)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center ml-1" style={{ color: '#EF4444' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border p-4 mt-4 flex items-center justify-between"
              style={{ backgroundColor: C.card, borderColor: C.border }}>
              <span className="font-semibold text-sm" style={{ color: C.text }}>Total</span>
              <span className="text-xl font-black">{fmt(totalCents)}</span>
            </div>

            <button onClick={() => handleConfirm()} disabled={submitting}
              className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 shadow-lg disabled:opacity-60"
              style={{ backgroundColor: '#7C3AED', color: '#fff', boxShadow: '0 8px 24px rgba(124,58,237,0.30)' }}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookmarkPlus className="w-5 h-5" />}
              {submitting ? 'Confirmando...' : 'Confirmar reserva'}
            </button>
          </>
        )}
      </div>

      {/* ── Diálogo: itens que ficaram sem estoque no meio do caminho ── */}
      {semEstoque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{ backgroundColor: C.card, borderColor: C.border }}>
            <h2 className="font-black text-base" style={{ color: C.navy }}>Acabou enquanto você montava</h2>
            <p className="text-sm" style={{ color: C.text }}>
              Estes itens ficaram sem estoque agora. Quer entrar na fila de espera deles (a gente avisa quando chegar) ou remover da reserva?
            </p>
            <ul className="text-sm space-y-1">
              {semEstoque.map(s => (
                <li key={s.productId} className="font-semibold" style={{ color: C.navy }}>• {s.name}</li>
              ))}
            </ul>
            <button onClick={() => { setSemEstoque(null); handleConfirm(true) }} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
              style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Confirmando...' : 'Entrar na fila de espera'}
            </button>
            <button onClick={removerSemEstoque}
              className="w-full py-3 rounded-xl font-semibold text-sm border transition-all hover:opacity-80"
              style={{ borderColor: C.border, color: C.text }}>
              Remover e seguir sem eles
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
