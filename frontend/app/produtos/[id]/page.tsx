'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { productApi, waitListApi, authApi, userApi, Product, UserProfile } from '@/lib/api'
import { saveAuth, isLoggedIn, getUserName } from '@/lib/auth'
import { useReservationCart } from '@/hooks/useReservationCart'
import Link from 'next/link'
import { ChevronLeft, Package, ShoppingBag, MessageCircle, Sun, Moon, Share2, Tag, CheckCircle, Clock, LogIn, X, Loader2, Mail, KeyRound, User as UserIcon, BookmarkPlus } from 'lucide-react'

const NAVY = '#0C3D5A'
const BLUE = '#3EC2F2'
const WA_NUM = '5517997633103'

function fmt(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [product,  setProduct]  = useState<Product | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [mainImg,  setMainImg]  = useState<string | null>(null)
  const [isDark,   setIsDark]   = useState(false)
  const [wl,       setWl]       = useState<{ inList: boolean; position?: number; entryId?: string } | null>(null)
  const [wlAuth,   setWlAuth]   = useState(false)
  const [wlLoading, setWlLoading] = useState(false)

  // login modal
  const [showLogin,    setShowLogin]    = useState(false)
  const [loginEmail,   setLoginEmail]   = useState('')
  const [loginPass,    setLoginPass]    = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError,   setLoginError]   = useState('')

  // usuário logado
  const [profile, setProfile] = useState<UserProfile | null>(null)

  const { items: cartItems, addItem, totalItems: cartCount } = useReservationCart()
  const inCart = product ? cartItems.some(i => i.productId === product.id) : false

  function handleAddToCart() {
    if (!product) return
    if (!isLoggedIn()) { setShowLogin(true); return }
    addItem({
      productId: product.id,
      quantity: 1,
      productName: product.name,
      productImageUrl: product.imageUrl ?? undefined,
      priceInCents: product.discountPriceInCents ?? product.priceInCents,
    })
  }

  const C = isDark ? {
    bg: '#121215', card: '#1A1A1F', border: 'rgba(255,255,255,0.07)',
    navy: '#FFFFFF', text: 'rgba(255,255,255,0.65)', muted: 'rgba(255,255,255,0.35)',
    chip: '#1E1E24',
  } : {
    bg: '#F5F8FA', card: '#FFFFFF', border: 'rgba(12,61,90,0.10)',
    navy: NAVY, text: '#4D8FAC', muted: '#9CA3AF',
    chip: '#EBF7FD',
  }

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'dark') setIsDark(true)
  }, [])

  // Verifica autenticação e carrega produto
  useEffect(() => {
    if (!id) return

    if (isLoggedIn()) {
      setWlAuth(true)
      userApi.me().then(r => setProfile(r.data)).catch(() => {})
    }

    productApi.get(id)
      .then(r => {
        setProduct(r.data)
        setMainImg(r.data.imageUrl)
        if (r.data.isPreVenda && isLoggedIn()) {
          waitListApi.myPosition(id)
            .then((res: { data: { inList: boolean; position?: number; entryId?: string } }) => setWl(res.data))
            .catch(() => {})
        }
      })
      .catch(() => router.replace('/produtos'))
      .finally(() => setLoading(false))
  }, [id, router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      const { data } = await authApi.clientLogin(loginEmail, loginPass)
      saveAuth(data)
      setWlAuth(true)
      setShowLogin(false)
      setLoginEmail('')
      setLoginPass('')
      // carrega perfil e posição na fila
      userApi.me().then(r => setProfile(r.data)).catch(() => {})
      if (id) {
        waitListApi.myPosition(id)
          .then((res: { data: { inList: boolean; position?: number; entryId?: string } }) => setWl(res.data))
          .catch(() => {})
      }
    } catch {
      setLoginError('E-mail ou senha inválidos.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function joinQueue() {
    if (!id) return
    setWlLoading(true)
    try {
      await waitListApi.join(id)
      const res = await waitListApi.myPosition(id)
      setWl(res.data)
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setWlAuth(false)
      } else {
        const msg = err?.response?.data?.message || err?.response?.data?.Message
        alert(msg || 'Não foi possível entrar na lista. Tente novamente.')
      }
    } finally { setWlLoading(false) }
  }

  async function leaveQueue() {
    if (!id) return
    setWlLoading(true)
    try {
      await waitListApi.leave(id)
      setWl({ inList: false })
    } finally { setWlLoading(false) }
  }

  const allImgs = product
    ? [product.imageUrl, ...(product.imageUrls ?? [])].filter(Boolean) as string[]
    : []

  const waMsg = encodeURIComponent(
    `Olá! Tenho interesse no produto: ${product?.name ?? ''}\n${typeof window !== 'undefined' ? window.location.href : ''}`
  )

  const userName = profile?.name || getUserName()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F8FA' }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BLUE }} />
    </div>
  )

  if (!product) return null

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>

      {/* Nav */}
      <nav className="sticky top-0 z-40 h-14 flex items-center px-4 gap-3 border-b"
        style={{ backgroundColor: '#0F3460', borderColor: 'rgba(255,255,255,0.08)' }}>
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm hover:opacity-70 transition-opacity" style={{ color: '#fff' }}>
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#fff' }}>{product.name}</p>
        </div>
        <button onClick={() => { const n = !isDark; setIsDark(n); localStorage.setItem('landing-theme', n ? 'dark' : 'light') }}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors" style={{ color: '#fff' }}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => navigator.share?.({ title: product.name, url: window.location.href }).catch(() => navigator.clipboard?.writeText(window.location.href))}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors" style={{ color: '#fff' }}>
          <Share2 className="w-4 h-4" />
        </button>

        {/* Avatar do usuário logado */}
        {wlAuth && (
          <Link href="/cliente" title="Minha conta">
            {profile?.profileImageUrl ? (
              <img src={profile.profileImageUrl} alt={userName}
                className="w-8 h-8 rounded-full object-cover border-2 border-white/30 hover:border-white/70 transition-all" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-white/30 hover:border-white/70 transition-all text-xs font-black"
                style={{ backgroundColor: '#3EC2F2', color: '#0C3D5A' }}>
                {userName.charAt(0).toUpperCase() || <UserIcon className="w-4 h-4" />}
              </div>
            )}
          </Link>
        )}
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Galeria ── */}
          <div className="lg:w-[420px] shrink-0 space-y-3">
            <div className="rounded-2xl overflow-hidden border flex items-center justify-center"
              style={{ backgroundColor: C.card, borderColor: C.border, aspectRatio: '1' }}>
              {mainImg
                ? <img src={mainImg} alt={product.name} className="w-full h-full object-contain p-6" />
                : <Package className="w-20 h-20 opacity-10" style={{ color: C.navy }} />
              }
            </div>
            {allImgs.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {allImgs.map((url, i) => (
                  <button key={i} onClick={() => setMainImg(url)}
                    className="shrink-0 w-16 h-16 rounded-xl border-2 overflow-hidden transition-all"
                    style={{ borderColor: mainImg === url ? BLUE : C.border, backgroundColor: C.card }}>
                    <img src={url} alt="" className="w-full h-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Info do produto ── */}
          <div className="flex-1 space-y-5">

            <div className="flex flex-wrap gap-2">
              {product.isPreVenda && (
                <span className="text-xs font-black uppercase tracking-wide px-3 py-1 rounded-full"
                  style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Pré-venda</span>
              )}
              {!product.isPreVenda && product.isOnPromo && (
                <span className="text-xs font-black uppercase tracking-wide px-3 py-1 rounded-full"
                  style={{ backgroundColor: '#EF4444', color: '#fff' }}>Promoção</span>
              )}
              <span className="text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1"
                style={{ backgroundColor: C.chip, color: C.text }}>
                <Tag className="w-3 h-3" />{product.category}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black leading-tight" style={{ color: C.navy }}>
              {product.name}
            </h1>

            <div className="rounded-2xl p-5 border" style={{ backgroundColor: C.card, borderColor: C.border }}>
              {product.isOnPromo && product.discountPriceInReais != null ? (
                <div>
                  <p className="text-sm line-through mb-1" style={{ color: C.muted }}>{fmt(product.priceInReais)}</p>
                  <p className="text-4xl font-black" style={{ color: '#EF4444' }}>{fmt(product.discountPriceInReais)}</p>
                  <p className="text-xs mt-1 font-semibold" style={{ color: '#22C55E' }}>
                    Economia de {fmt(product.priceInReais - product.discountPriceInReais)}
                  </p>
                </div>
              ) : (
                <p className="text-4xl font-black" style={{ color: BLUE }}>{fmt(product.priceInReais)}</p>
              )}
              <p className="text-xs mt-3 flex items-center gap-1.5" style={{ color: (product.availableQuantity ?? product.stockQuantity) > 0 ? '#22C55E' : '#EF4444' }}>
                <CheckCircle className="w-3.5 h-3.5" />
                {(product.availableQuantity ?? product.stockQuantity) > 0
                  ? `${product.availableQuantity ?? product.stockQuantity} unidades disponíveis`
                  : product.stockQuantity > 0
                    ? 'Todas as unidades estão reservadas no momento'
                    : 'Produto esgotado'}
              </p>
              {(product.reservedQuantity ?? 0) > 0 && (
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  {product.reservedQuantity} un. reservadas aguardando retirada (ficam bloqueadas por até 48h)
                </p>
              )}
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              {product.isPreVenda ? (
                <>
                  {!wlAuth ? (
                    <button
                      onClick={() => setShowLogin(true)}
                      className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 shadow-lg"
                      style={{ backgroundColor: '#7C3AED', color: '#fff', boxShadow: '0 8px 24px rgba(124,58,237,0.30)' }}>
                      <LogIn className="w-5 h-5" /> Entre para garantir sua vaga
                    </button>
                  ) : wl?.inList ? (
                    <div className="rounded-2xl border p-4 flex items-center justify-between gap-3"
                      style={{ backgroundColor: isDark ? '#1a1435' : '#f5f0ff', borderColor: '#7C3AED' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg"
                          style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
                          {wl.position}
                        </div>
                        <div>
                          <p className="font-bold text-sm" style={{ color: '#7C3AED' }}>Você está na fila!</p>
                          <p className="text-xs" style={{ color: C.muted }}>Posição #{wl.position} — avisaremos pelo WhatsApp</p>
                        </div>
                      </div>
                      <button onClick={leaveQueue} disabled={wlLoading}
                        className="p-2 rounded-xl transition-colors" title="Sair da fila"
                        style={{ color: '#EF4444' }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button onClick={joinQueue} disabled={wlLoading}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 shadow-lg disabled:opacity-60"
                        style={{ backgroundColor: '#7C3AED', color: '#fff', boxShadow: '0 8px 24px rgba(124,58,237,0.30)' }}>
                        <Clock className="w-5 h-5" />
                        {wlLoading ? 'Aguarde...' : 'Reservar meu produto'}
                      </button>
                      <p className="text-xs text-center mt-1.5" style={{ color: C.muted }}>
                        Pré-venda: ainda não chegou — avisamos você pelo WhatsApp assim que estiver disponível
                      </p>
                    </div>
                  )}
                  {(product.availableQuantity ?? product.stockQuantity) > 0 && (
                    <div>
                      <button onClick={handleAddToCart} disabled={inCart}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border transition-all hover:opacity-80 disabled:opacity-60"
                        style={{ borderColor: '#7C3AED', color: '#7C3AED', backgroundColor: C.card }}>
                        <BookmarkPlus className="w-4 h-4" />
                        {inCart ? 'Já está guardado pra você' : 'Guardar para retirar depois'}
                      </button>
                      <p className="text-xs text-center mt-1.5" style={{ color: C.muted }}>
                        Já tem em estoque — a gente guarda por 48h, você paga na retirada ou no Pix.
                        Pode guardar vários produtos e finalizar tudo junto no botão roxo "Ver reserva".
                      </p>
                    </div>
                  )}
                  <Link href="/produtos"
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm border transition-all hover:opacity-80"
                    style={{ borderColor: C.border, color: C.text, backgroundColor: C.card }}>
                    <ShoppingBag className="w-4 h-4" /> Ver mais produtos
                  </Link>
                </>
              ) : (
                <>
                  <div>
                    <a href={`https://wa.me/${WA_NUM}?text=${waMsg}`}
                      target="_blank" rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 shadow-lg"
                      style={{ backgroundColor: '#25D366', color: '#fff', boxShadow: '0 8px 24px rgba(37,211,102,0.30)' }}>
                      <MessageCircle className="w-5 h-5" /> Comprar pelo WhatsApp
                    </a>
                    <p className="text-xs text-center mt-1.5" style={{ color: C.muted }}>
                      Você compra agora e combina a retirada direto com a gente
                    </p>
                  </div>
                  {(product.availableQuantity ?? product.stockQuantity) > 0 && (
                    <div>
                      <button onClick={handleAddToCart} disabled={inCart}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border transition-all hover:opacity-80 disabled:opacity-60"
                        style={{ borderColor: '#7C3AED', color: '#7C3AED', backgroundColor: C.card }}>
                        <BookmarkPlus className="w-4 h-4" />
                        {inCart ? 'Já está guardado pra você' : 'Guardar para retirar depois'}
                      </button>
                      <p className="text-xs text-center mt-1.5" style={{ color: C.muted }}>
                        Já tem em estoque — a gente guarda por 48h, você paga na retirada ou no Pix.
                        Pode guardar vários produtos e finalizar tudo junto no botão roxo "Ver reserva".
                      </p>
                    </div>
                  )}
                  <Link href="/produtos"
                    className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-semibold text-sm border transition-all hover:opacity-80"
                    style={{ borderColor: C.border, color: C.text, backgroundColor: C.card }}>
                    <ShoppingBag className="w-4 h-4" /> Ver mais produtos
                  </Link>
                </>
              )}
            </div>

            {cartCount > 0 && (
              <Link href="/cliente/reserva/carrinho"
                key={cartCount}
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-xl transition-transform active:scale-95 animate-bounce-in"
                style={{ backgroundColor: '#7C3AED', color: '#fff', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' }}>
                <BookmarkPlus className="w-4 h-4" />
                Ver reserva ({cartCount}) — finalizar
              </Link>
            )}

            {product.description && (
              <p className="text-base leading-relaxed" style={{ color: C.text }}>{product.description}</p>
            )}

            {product.fullDescription && (
              <div className="rounded-2xl border p-5 space-y-2" style={{ backgroundColor: C.card, borderColor: C.border }}>
                <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: C.navy }}>Descrição do produto</h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: C.text }}>{product.fullDescription}</p>
              </div>
            )}

            <div className="rounded-2xl border divide-y text-sm" style={{ backgroundColor: C.card, borderColor: C.border }}>
              {([
                ['Categoria', product.category],
                ['Disponibilidade', (product.availableQuantity ?? product.stockQuantity) > 0 ? 'Em estoque' : product.stockQuantity > 0 ? 'Tudo reservado' : 'Esgotado'],
                product.barcode ? ['Código', product.barcode] : null,
              ].filter(Boolean) as string[][]).map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between px-5 py-3">
                  <span style={{ color: C.muted }}>{label}</span>
                  <span className="font-semibold" style={{ color: C.navy }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal de login inline ── */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowLogin(false)}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-5"
            style={{ backgroundColor: '#FFFFFF' }}
            onClick={e => e.stopPropagation()}>

            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#3EC2F2' }}>Santuário Nerd</p>
                <h2 className="text-xl font-black mt-0.5" style={{ color: '#0C3D5A' }}>Entre na sua conta</h2>
              </div>
              <button onClick={() => setShowLogin(false)}
                className="p-2 rounded-xl transition-colors"
                style={{ color: '#4D8FAC' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm" style={{ color: '#4D8FAC' }}>
              Faça login para reservar <strong style={{ color: '#0C3D5A' }}>{product.name}</strong>.
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4D8FAC' }} />
                <input
                  type="email"
                  placeholder="Seu e-mail"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition-all"
                  style={{ borderColor: 'rgba(12,61,90,0.2)', color: '#0C3D5A', backgroundColor: '#F8FAFC' }}
                />
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4D8FAC' }} />
                <input
                  type="password"
                  placeholder="Senha"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition-all"
                  style={{ borderColor: 'rgba(12,61,90,0.2)', color: '#0C3D5A', backgroundColor: '#F8FAFC' }}
                />
              </div>

              {loginError && (
                <p className="text-xs font-semibold text-center" style={{ color: '#EF4444' }}>{loginError}</p>
              )}

              <button type="submit" disabled={loginLoading}
                className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: '#0C3D5A', color: '#FFE45E' }}>
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <div className="flex items-center justify-between text-xs" style={{ color: '#9CA3AF' }}>
              <Link href="/primeiro-acesso" className="hover:underline" style={{ color: '#3EC2F2' }}>
                Criar conta grátis
              </Link>
              <Link href="/reset-password" className="hover:underline">
                Esqueci a senha
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
