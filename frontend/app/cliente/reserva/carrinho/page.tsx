'use client'
// Sacola (carrinho de reserva). Com a chave "sacola-nova" (v1.50.0): barra da loja, passos,
// itens com foto maior e "+" travado no estoque, resumo ao lado com o total no Pix, e quem não
// está logado vê "Entre pra ver sua sacola" (antes era jogado pra página inicial sem aviso).
// Reserva, fila de espera e Pix são a mesma lógica nos dois visuais.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { reservationApi, productApi, siteConfigApi, categoryApi, ReservationPixStatus, Product, ProductCategory, SiteConfigDto } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { useReservationCart } from '@/hooks/useReservationCart'
import { calcPrecoVitrine, resolvePixPercent } from '@/lib/precoVitrine'
import {
  ChevronLeft, Trash2, Minus, Plus, BookmarkPlus, QrCode, Copy, CheckCircle,
  Loader2, RefreshCw, Package, ShoppingBag, PackageCheck, Wallet, Store, LogIn, ChevronRight,
} from 'lucide-react'
import { mixHex } from '@/lib/colors'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import toast, { Toaster } from 'react-hot-toast'
import { brl } from '@/lib/format'
import { fotoLeve } from '@/lib/fotoLeve'

const NAVY = '#0C3D5A'

function fmt(cents: number) { return `${brl((cents / 100))}` }

export default function ReservationCartPage() {
  const router = useRouter()
  const { items, removeItem, updateQuantity, clear, totalCents } = useReservationCart()
  const [isDark, setIsDark] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [temFila, setTemFila] = useState(false)
  const [semEstoque, setSemEstoque] = useState<{ productId: string; name: string }[] | null>(null)
  const [catalogo,   setCatalogo]   = useState<Product[]>([])
  const [categorias, setCategorias] = useState<ProductCategory[]>([])
  const [siteCfg,    setSiteCfg]    = useState<SiteConfigDto | null>(null)
  const [pix, setPix] = useState<ReservationPixStatus | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const chaveNova = useFuncionalidade('sacola-nova')
  const nova = chaveNova !== false
  const [semLogin, setSemLogin] = useState(false)

  const C = isDark ? {
    bg: '#121215', card: '#1A1A1F', border: 'rgba(255,255,255,0.07)',
    navy: '#FFFFFF', text: 'rgba(255,255,255,0.65)', muted: 'rgba(255,255,255,0.35)',
    pix: '#2DD4BF',
  } : {
    bg: '#F5F8FA', card: '#FFFFFF', border: 'rgba(12,61,90,0.10)',
    navy: NAVY, text: '#4D8FAC', muted: '#9CA3AF',
    pix: '#00806D',
  }

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'dark') setIsDark(true)
  }, [])

  // Sem login: na sacola nova mostra "Entre pra ver sua sacola" (volta pra cá depois de entrar);
  // no visual antigo, como antes, volta pra página inicial. Espera a chave carregar pra decidir.
  useEffect(() => {
    if (chaveNova === undefined || isLoggedIn()) return
    if (chaveNova) setSemLogin(true)
    else router.push('/')
  }, [chaveNova, router])

  // Quanto o carrinho inteiro sai no Pix — é aqui que o cliente decide como vai pagar.
  // O percentual pode ser diferente item a item (Pokémon 3%, resto no padrão), então a
  // conta é feita por item e somada; nada disso trava a tela se a API não responder.
  useEffect(() => {
    productApi.list().then(r => setCatalogo(r.data)).catch(() => {})
    siteConfigApi.get().then(r => setSiteCfg(r.data)).catch(() => {})
    categoryApi.list().then(r => setCategorias(r.data)).catch(() => {})
  }, [])

  const pixTotalCents = siteCfg && catalogo.length > 0
    ? items.reduce((soma, i) => {
        const prod = catalogo.find(p => p.id === i.productId)
        const pct  = resolvePixPercent(prod, categorias, siteCfg.pixDiscountPercent)
        const { precoPix } = calcPrecoVitrine(i.priceInCents / 100, null, siteCfg, pct)
        return soma + Math.round(precoPix * 100) * i.quantity
      }, 0)
    : null
  const pixEconomiaCents = pixTotalCents != null ? totalCents - pixTotalCents : 0

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
      // Chave pedido-pix-junto: somou no pedido sem pagar que ele já tinha — um Pix só com o total
      toast.success(data.juntou
        ? 'Reserva confirmada! Somamos ao seu pedido que ainda não foi pago — é um Pix só com o total.'
        : 'Reserva confirmada!', { duration: data.juntou ? 6000 : 4000 })
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

  // ── Visual novo ──────────────────────────────────────────────────────────
  const corTopo  = siteCfg?.colorHero ?? '#1E4FD6'
  const destaque = isDark ? '#3EC2F2' : corTopo
  const fundoFoto = isDark ? '#1E1E24' : mixHex('#FFFFFF', corTopo, 0.05)
  const estoqueDe = (productId: string) => catalogo.find(p => p.id === productId)?.stockQuantity
  const qtdItens  = items.reduce((n, i) => n + i.quantity, 0)
  const voltar    = '/cliente/reserva/carrinho'

  const barra = (
    <nav className="sticky top-0 z-40 h-16 flex items-center border-b"
      style={{ backgroundColor: mixHex(corTopo, '#000000', 0.32), borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="w-full max-w-5xl mx-auto px-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink hover:opacity-90">
          {siteCfg?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoLeve(siteCfg.logoUrl, 160) ?? siteCfg.logoUrl} alt="" className="h-10 w-10 object-contain shrink-0" />
          )}
          <span className="font-black text-lg leading-none truncate" style={{ color: '#FFFFFF' }}>{siteCfg?.siteName ?? 'Santuário Nerd'}</span>
        </Link>
        <Link href="/produtos" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-white/10 shrink-0"
          style={{ color: '#FFFFFF' }}>
          <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Continuar comprando</span><span className="sm:hidden">Loja</span>
        </Link>
      </div>
    </nav>
  )

  // Passos: 1 Sacola → 2 Reserva → 3 Retirada
  const passos = (atual: 1 | 2) => (
    <ol className="flex items-center gap-2 text-[11px] font-bold mb-5" aria-label="Etapas">
      {['Sacola', 'Reserva confirmada', 'Retirada na loja'].map((nome, i) => {
        const n = i + 1
        const feito = n < atual, agora = n === atual
        return (
          <li key={nome} className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black"
              style={agora || feito
                ? { backgroundColor: destaque, color: '#FFFFFF' }
                : { backgroundColor: C.card, color: C.muted, border: `1px solid ${C.border}` }}>
              {feito ? '✓' : n}
            </span>
            <span className={`truncate ${agora ? '' : 'hidden sm:inline'}`} style={{ color: agora ? C.navy : C.muted }}>{nome}</span>
            {n < 3 && <span className="w-6 sm:w-10 h-px shrink-0" style={{ backgroundColor: C.border }} />}
          </li>
        )
      })}
    </ol>
  )

  const garantias = (
    <div className="grid grid-cols-3 gap-2">
      {[
        { icon: PackageCheck, titulo: 'Separado na hora', texto: 'O estoque baixa pra você' },
        { icon: Wallet,       titulo: 'Pix ou na retirada', texto: 'Você escolhe como pagar' },
        { icon: Store,        titulo: 'Retire na loja', texto: 'José Bonifácio, SP' },
      ].map(({ icon: Icon, titulo, texto }) => (
        <div key={titulo} className="rounded-xl border p-2.5 text-center" style={{ backgroundColor: C.card, borderColor: C.border }}>
          <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: destaque }} />
          <p className="text-[11px] font-black leading-tight" style={{ color: C.navy }}>{titulo}</p>
          <p className="text-[10px] leading-tight mt-0.5" style={{ color: C.muted }}>{texto}</p>
        </div>
      ))}
    </div>
  )

  if (nova && semLogin) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.navy }}>
        {barra}
        <div className="max-w-md mx-auto px-4 py-12">
          <div className="rounded-3xl border p-8 text-center" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <span className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: `${destaque}1A` }}>
              <ShoppingBag className="w-7 h-7" style={{ color: destaque }} />
            </span>
            <h1 className="text-2xl font-black">Entre pra ver sua sacola</h1>
            <p className="text-sm mt-2" style={{ color: C.text }}>
              A sacola fica guardada na sua conta: você separa os produtos, a gente reserva o estoque e você retira na loja.
            </p>
            <Link href={`/entrar?returnTo=${encodeURIComponent(voltar)}`}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95"
              style={{ backgroundColor: corTopo, color: '#FFFFFF', boxShadow: `0 10px 26px -10px ${corTopo}` }}>
              <LogIn className="w-4 h-4" /> Entrar na minha conta
            </Link>
            <p className="text-xs mt-4" style={{ color: C.muted }}>
              Ainda não tem conta?{' '}
              <Link href={`/cadastro?returnTo=${encodeURIComponent(voltar)}`} className="font-bold hover:underline" style={{ color: destaque }}>Cadastre-se</Link>
            </p>
          </div>
          <Link href="/produtos" className="mt-5 flex items-center justify-center gap-1 text-sm font-semibold hover:underline" style={{ color: C.text }}>
            Ver os produtos da loja <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  if (nova && groupId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.navy }}>
        <Toaster position="top-center" />
        {barra}
        <div className="max-w-lg mx-auto px-4 py-8">
          {passos(2)}
          <div className="rounded-3xl border p-7 text-center space-y-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <span className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
              <CheckCircle className="w-8 h-8" style={{ color: '#16A34A' }} />
            </span>
            <h1 className="text-2xl font-black">{temFila ? 'Reserva registrada!' : 'Reserva confirmada!'}</h1>
            <p className="text-sm" style={{ color: C.text }}>
              {temFila
                ? 'Os itens em estoque já foram separados pra você. Os itens que entraram na fila serão garantidos quando chegarem — a gente avisa. Pague no Pix ou na retirada.'
                : 'O estoque já foi separado pra você — retirada no balcão. Pague agora no Pix ou na retirada.'}
            </p>
          </div>

          <div className="rounded-3xl border p-5 mt-4 space-y-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <h2 className="font-black text-sm flex items-center gap-2" style={{ color: C.navy }}>
              <QrCode className="w-4 h-4" style={{ color: C.pix }} /> Quer adiantar? Pague no Pix
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${C.pix}1A`, color: C.pix }}>opcional</span>
            </h2>
            {!pix?.hasPix && !pix?.pixCopiaCola ? (
              <button onClick={handleGerarPix} disabled={pixLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: corTopo, color: '#fff' }}>
                {pixLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Gerar Pix
              </button>
            ) : (
              <div className="space-y-3">
                {pix.imagemQrCode && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pix.imagemQrCode} alt="QR Code Pix" className="w-44 h-44 mx-auto rounded-xl border bg-white p-1" style={{ borderColor: C.border }} />
                )}
                {pix.pixCopiaCola && (
                  <button onClick={copiaCola}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold border"
                    style={{ borderColor: C.border, color: C.navy }}>
                    <Copy className="w-4 h-4" /> Copiar código Pix
                  </button>
                )}
                <p className="text-center text-lg font-black" style={{ color: C.navy }}>
                  {pix.valorEmReais !== undefined && fmt(Math.round(pix.valorEmReais * 100))}
                </p>
                <p className="text-center text-xs font-semibold" style={{ color: pix.status === 'CONCLUIDA' ? '#16A34A' : C.muted }}>
                  {pix.status === 'CONCLUIDA' ? 'Pago ✅' : 'Aguardando pagamento...'}
                </p>
                {pix.status !== 'CONCLUIDA' && (
                  <button onClick={handleVerificarPix} disabled={verifying}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold border transition-all disabled:opacity-60"
                    style={{ borderColor: destaque, color: destaque }}>
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Já paguei, verificar
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">{garantias}</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/cliente/perfil"
              className="flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border transition-all hover:opacity-80"
              style={{ borderColor: C.border, color: C.navy, backgroundColor: C.card }}>
              Minhas reservas
            </Link>
            <Link href="/produtos"
              className="flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border transition-all hover:opacity-80"
              style={{ borderColor: C.border, color: C.navy, backgroundColor: C.card }}>
              Continuar comprando
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (nova) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.navy }}>
        <Toaster position="top-center" />
        {barra}
        <div className="max-w-5xl mx-auto px-4 py-6">
          {passos(1)}
          <div className="flex items-end justify-between gap-3 mb-5">
            <div>
              <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
                <ShoppingBag className="w-6 h-6" style={{ color: destaque }} /> Sua sacola
              </h1>
              <p className="text-sm mt-1" style={{ color: C.text }}>
                Retirada no balcão: ao confirmar, o estoque baixa na hora pra você. Pague no Pix ou na retirada.
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-3xl border p-10 text-center max-w-md mx-auto" style={{ backgroundColor: C.card, borderColor: C.border }}>
              <span className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: `${destaque}1A` }}>
                <Package className="w-7 h-7" style={{ color: destaque }} />
              </span>
              <p className="text-lg font-black">Sua sacola está vazia</p>
              <p className="text-sm mt-1" style={{ color: C.text }}>Escolha os produtos e eles ficam guardados aqui até você confirmar.</p>
              <Link href="/produtos"
                className="mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all active:scale-95"
                style={{ backgroundColor: corTopo, color: '#FFFFFF' }}>
                Ver produtos <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-5 items-start">
              {/* Itens */}
              <div className="flex-1 w-full space-y-3">
                {items.map(item => {
                  const estoque = estoqueDe(item.productId)
                  const noLimite = estoque != null && item.quantity >= estoque
                  return (
                    <div key={`${item.productId}:${item.variantId ?? ''}`}
                      className="rounded-2xl border p-3 sm:p-4 flex gap-3 sm:gap-4"
                      style={{ backgroundColor: C.card, borderColor: C.border }}>
                      <Link href={`/produtos/${item.productId}`} className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: fundoFoto }}>
                        {item.productImageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={fotoLeve(item.productImageUrl, 160)} alt={item.productName} className="w-full h-full object-contain p-1.5" />
                          : <Package className="w-7 h-7" style={{ color: C.muted }} />}
                      </Link>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <Link href={`/produtos/${item.productId}`} className="font-black text-sm leading-snug line-clamp-2 hover:underline" style={{ color: C.navy }}>
                          {item.productName}
                        </Link>
                        {item.variantLabel && <p className="text-xs mt-0.5" style={{ color: C.muted }}>{item.variantLabel}</p>}
                        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{fmt(item.priceInCents)} cada</p>
                        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
                            <button onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                              disabled={item.quantity <= 1} aria-label="Diminuir quantidade"
                              className="w-8 h-8 flex items-center justify-center disabled:opacity-30" style={{ color: C.navy }}>
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-black tabular-nums">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                              disabled={noLimite} aria-label="Aumentar quantidade"
                              title={noLimite ? `Só ${estoque} em estoque` : undefined}
                              className="w-8 h-8 flex items-center justify-center disabled:opacity-30" style={{ color: C.navy }}>
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-base font-black tabular-nums" style={{ color: C.navy }}>{fmt(item.priceInCents * item.quantity)}</p>
                        </div>
                        {noLimite && (
                          <p className="text-[11px] mt-1 font-semibold" style={{ color: '#E11D48' }}>Só {estoque} em estoque</p>
                        )}
                      </div>
                      <button onClick={() => removeItem(item.productId, item.variantId)} aria-label={`Remover ${item.productName}`}
                        className="self-start w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors" style={{ color: '#EF4444' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Resumo */}
              <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-24 space-y-3">
                <div className="rounded-2xl border p-5 space-y-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
                  <h2 className="font-black">Resumo</h2>
                  <div className="flex items-center justify-between text-sm" style={{ color: C.text }}>
                    <span>{qtdItens} {qtdItens === 1 ? 'item' : 'itens'}</span>
                    <span className="tabular-nums">{fmt(totalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: C.border }}>
                    <span className="font-bold text-sm">Total</span>
                    <span className="text-2xl font-black tabular-nums">{fmt(totalCents)}</span>
                  </div>
                  {pixTotalCents != null && pixEconomiaCents > 0 && (
                    <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: `${C.pix}14` }}>
                      <span className="text-sm font-bold" style={{ color: C.pix }}>No Pix</span>
                      <div className="text-right">
                        <p className="text-lg font-black tabular-nums" style={{ color: C.pix }}>{fmt(pixTotalCents)}</p>
                        <p className="text-[11px]" style={{ color: C.muted }}>economia de {fmt(pixEconomiaCents)}</p>
                      </div>
                    </div>
                  )}
                  <button onClick={() => handleConfirm()} disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-60"
                    style={{ backgroundColor: corTopo, color: '#fff', boxShadow: `0 10px 26px -10px ${corTopo}` }}>
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookmarkPlus className="w-5 h-5" />}
                    {submitting ? 'Confirmando...' : 'Confirmar reserva'}
                  </button>
                  <p className="text-[11px] text-center" style={{ color: C.muted }}>
                    Nada é cobrado agora — você escolhe pagar no Pix ou na retirada.
                  </p>
                </div>
                {garantias}
              </aside>
            </div>
          )}
        </div>

        {/* ── Diálogo: itens que ficaram sem estoque no meio do caminho (mesma lógica) ── */}
        {semEstoque && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl border p-6 space-y-4" style={{ backgroundColor: C.card, borderColor: C.border }}>
              <h2 className="font-black text-lg" style={{ color: C.navy }}>Acabou enquanto você montava</h2>
              <p className="text-sm" style={{ color: C.text }}>
                Estes itens ficaram sem estoque agora. Quer entrar na fila de espera deles (a gente avisa quando chegar) ou remover da sacola?
              </p>
              <ul className="text-sm space-y-1">
                {semEstoque.map(s => (
                  <li key={s.productId} className="font-semibold" style={{ color: C.navy }}>• {s.name}</li>
                ))}
              </ul>
              <button onClick={() => { setSemEstoque(null); handleConfirm(true) }} disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all disabled:opacity-60"
                style={{ backgroundColor: corTopo, color: '#fff' }}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? 'Confirmando...' : 'Entrar na fila de espera'}
              </button>
              <button onClick={removerSemEstoque}
                className="w-full py-3 rounded-2xl font-bold text-sm border transition-all hover:opacity-80"
                style={{ borderColor: C.border, color: C.text }}>
                Remover e seguir sem eles
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Visual antigo (chave "sacola-nova" desligada) ────────────────────────
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
                : 'O estoque já foi separado pra você — retirada no balcão. Pague agora no Pix ou na retirada.'}
            </p>
          </div>

          <div className="rounded-2xl border p-5 mt-4 space-y-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <h2 className="font-bold text-sm flex items-center gap-2" style={{ color: C.navy }}>
              <QrCode className="w-4 h-4" /> Pagamento via Pix (opcional)
            </h2>

            {!pix?.hasPix && !pix?.pixCopiaCola ? (
              <button onClick={handleGerarPix} disabled={pixLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                style={{ backgroundColor: '#1E4FD6', color: '#fff' }}>
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
                    style={{ borderColor: '#1E4FD6', color: '#1E4FD6' }}>
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
          <BookmarkPlus className="w-5 h-5" style={{ color: '#1E4FD6' }} /> Sua reserva
        </h1>
        <p className="text-sm mb-5" style={{ color: C.text }}>
          Reserva com retirada no balcão: ao confirmar, o estoque baixa na hora pra você. Pague no Pix ou na retirada.
        </p>

        {items.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: C.card, borderColor: C.border }}>
            <Package className="w-10 h-10 mx-auto mb-3" style={{ color: C.muted }} />
            <p className="text-sm" style={{ color: C.text }}>Sua reserva está vazia.</p>
            <Link href="/produtos" className="text-sm font-bold mt-2 inline-block" style={{ color: '#1E4FD6' }}>
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
                    <img src={fotoLeve(item.productImageUrl, 160)} alt={item.productName} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: C.bg }}>
                      <Package className="w-6 h-6" style={{ color: C.muted }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: C.navy }}>{item.productName}</p>
                    {item.variantLabel && <p className="text-xs" style={{ color: C.muted }}>{item.variantLabel}</p>}
                    <p className="text-sm font-semibold" style={{ color: '#1E4FD6' }}>{fmt(item.priceInCents * item.quantity)}</p>
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

            <div className="rounded-2xl border p-4 mt-4 space-y-2"
              style={{ backgroundColor: C.card, borderColor: C.border }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm" style={{ color: C.text }}>Total</span>
                <span className="text-xl font-black">{fmt(totalCents)}</span>
              </div>
              {pixTotalCents != null && pixEconomiaCents > 0 && (
                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: C.border }}>
                  <span className="text-sm font-semibold" style={{ color: C.pix }}>Pagando no Pix</span>
                  <div className="text-right">
                    <p className="text-lg font-black" style={{ color: C.pix }}>{fmt(pixTotalCents)}</p>
                    <p className="text-[11px]" style={{ color: C.muted }}>
                      economia de {fmt(pixEconomiaCents)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => handleConfirm()} disabled={submitting}
              className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 shadow-lg disabled:opacity-60"
              style={{ backgroundColor: '#1E4FD6', color: '#fff', boxShadow: '0 8px 24px rgba(30,79,214,0.30)' }}>
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
              style={{ backgroundColor: '#1E4FD6', color: '#fff' }}>
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
