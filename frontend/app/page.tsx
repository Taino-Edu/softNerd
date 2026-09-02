'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getRole } from '@/lib/auth'
import { championshipApi, productApi, announcementApi, deckApi, siteConfigApi, categoryApi, Championship, Product, AnnouncementDto, DeckListDto, SiteConfigDto, ProductCategory, PixCobrancaDto } from '@/lib/api'
import { calcPrecoVitrine, resolvePixPercent } from '@/lib/precoVitrine'
import { mixHex } from '@/lib/colors'
import Link from 'next/link'
import {
  Trophy, ShoppingBag, Star, Calendar, Users,
  X, MessageCircle, CheckCircle, Package,
  CreditCard, Award, QrCode, Shield, ChevronRight, ChevronLeft,
  Sun, Moon, Mail, Accessibility,
} from 'lucide-react'

// Espelha os defaults do backend (SiteConfig) — usado até a config real carregar,
// pra não piscar/mudar nada enquanto o admin nunca tiver personalizado o site.
const DEFAULT_SITE: SiteConfigDto = {
  siteName: 'Santuário Nerd',
  heroSubtitle: 'Produtos, torneios e a melhor experiência TCG da região. Acumule pontos, compre na mesa e participe de campeonatos.',
  addressLine: 'José Bonifácio — SP',
  contactPersonName: 'Maikon',
  logoUrl: null,
  faviconUrl: null,
  pwaIconUrl: null,
  adminIconUrl: null,
  whatsappNumber: '5517997633103',
  contactEmail: 'santuarionerd@gmail.com',
  navTorneiosLabel: 'Torneios',
  navProdutosLabel: 'Produtos',
  navMercadoLabel: 'Mercado de Cartas',
  navPontosLabel: 'Pontos',
  navLigaLabel: 'Liga Mensal',
  ctaVerEventosLabel: 'Ver Eventos',
  ctaVerTorneiosLabel: 'Ver Torneios',
  ctaVerProdutosLabel: 'Ver Produtos',
  torneiosEyebrow: 'Agenda',
  torneiosTitle: 'Próximos Torneios',
  produtosEyebrow: 'Vitrine',
  produtosTitle: 'Em Destaque',
  pontosEyebrow: 'Programa de Fidelidade',
  pontosTitle: 'Ganhe pontos a cada visita',
  pontosParagraph: 'Acumule pontos nas suas compras e troque por descontos. Só com CPF e WhatsApp — nada de senha ou aplicativo.',
  colorPrimary: '#3EC2F2',
  colorAccent: '#FFE45E',
  colorNavy: '#0C3D5A',
  colorBackground: '#EBF7FD',
  colorCard: '#FFFFFF',
  borderRadiusStyle: 'Padrao',
  pixDiscountPercent: 5,
  maxInstallments: 12,
  minInstallmentInCents: 500,
}

/** Valores originais hardcoded do Tailwind pra cada utilitário rounded-* usado na landing —
 * "Padrao" reproduz exatamente isso, então nada muda até o admin escolher outro estilo. */
const RADIUS_PRESETS: Record<SiteConfigDto['borderRadiusStyle'], { md: string; lg: string; xl: string; twoXl: string }> = {
  Padrao:           { md: '0.375rem', lg: '0.5rem', xl: '0.75rem', twoXl: '1rem' },
  Suave:            { md: '0.5rem',   lg: '0.75rem', xl: '1rem',   twoXl: '1.25rem' },
  MuitoArredondado: { md: '0.75rem',  lg: '1.25rem', xl: '1.75rem', twoXl: '2.25rem' },
}

/** Formata "5517999998888" como "(17) 99999-8888" — se não bater o formato esperado, devolve como veio. */
function formatWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const local  = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length !== 10 && local.length !== 11) return raw
  const ddd = local.slice(0, 2)
  const rest = local.slice(2)
  return rest.length === 9
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
}

type Theme = { bg: string; card: string; cardAlt: string; border: string; blue: string; yellow: string; text: string; navy: string; pix: string }

/** Preço no Pix mostrado na vitrine — null quando a loja/o item não anuncia desconto. */
type PixVitrine = { precoPix: number; pixPercent: number } | null

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }
function fmtPixPct(v: number) { return `${(Math.round(v * 10) / 10).toString().replace('.', ',')}%` }

export default function LandingPage() {
  const router = useRouter()
  const [championships, setChampionships] = useState<Championship[]>([])
  const [products,      setProducts]      = useState<Product[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementDto[]>([])
  const [loading,       setLoading]       = useState(true)
  const [registerModal, setRegisterModal] = useState<Championship | null>(null)
  const [productModal,  setProductModal]  = useState<Product | null>(null)
  const [annModal,      setAnnModal]      = useState<AnnouncementDto | null>(null)
  const [mobileMenu,    setMobileMenu]    = useState(false)
  const [isDark,        setIsDark]        = useState(false)
  const [navVisible,    setNavVisible]    = useState(true)
  const [navHover,      setNavHover]      = useState(false)
  const [bannerIdx,    setBannerIdx]  = useState(0)
  const [annIdx,       setAnnIdx]     = useState(0)
  const [site,         setSite]       = useState<SiteConfigDto>(DEFAULT_SITE)
  const [categorias,   setCategorias] = useState<ProductCategory[]>([])
  const carouselRef   = useRef<HTMLDivElement>(null)
  const carouselPaused = useRef(false)
  const bannerPaused   = useRef(false)
  const annPaused      = useRef(false)

  const heroBanners          = announcements.filter(a => a.type === 'Banner' && a.imageUrl)
  const visibleAnnouncements = announcements.filter(a => a.type !== 'Banner')

  // Nome do site em duas partes pro título do hero (primeira palavra em destaque, resto na
  // cor secundária) — generaliza o antigo "Santuário"/"Nerd" pra qualquer nome configurado.
  const [heroFirstWord, ...heroRestWords] = site.siteName.split(' ')
  const heroRest = heroRestWords.join(' ')

  // pix não sai da personalização de propósito: é a cor da forma de pagamento, não da
  // marca — e precisa de contraste garantido nos dois temas.
  const C = isDark ? {
    bg: '#121215', card: '#1A1A1F', cardAlt: '#1E1E24',
    border: 'rgba(255,255,255,0.07)', blue: site.colorPrimary,
    yellow: site.colorAccent, text: 'rgba(255,255,255,0.60)',
    navy: '#FFFFFF', pix: '#2DD4BF',
  } : {
    bg: site.colorBackground, card: site.colorCard, cardAlt: mixHex(site.colorCard, site.colorPrimary, 0.06),
    border: 'rgba(12,61,90,0.10)', blue: site.colorPrimary,
    yellow: site.colorAccent, text: '#4D8FAC',
    navy: '#0C3D5A', pix: '#00806D',
  }

  /** Pix do item, com a herança item → categoria → categoria pai → padrão da loja. */
  function pixDoProduto(p: Product): PixVitrine {
    const preco = p.isOnPromo && p.discountPriceInReais != null ? p.discountPriceInReais : p.priceInReais
    const { precoPix, pixPercent } = calcPrecoVitrine(
      preco, p.maxInstallments, site, resolvePixPercent(p, categorias, site.pixDiscountPercent))
    return pixPercent > 0 ? { precoPix, pixPercent } : null
  }

  // Fundo padrão do banner/anúncio quando não há imagem — antes era um navy fixo (#0D1B2A/
  // #112B45) que não respondia a nenhuma personalização. Agora deriva da cor de navbar
  // configurada, então muda junto quando o admin troca a cor em Personalizar Site.
  const bannerGradient = `linear-gradient(135deg, ${site.colorNavy} 0%, ${mixHex(site.colorNavy, '#000000', 0.35)} 100%)`

  function toggleDark() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('landing-theme', next ? 'dark' : 'light')
  }

  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setNavVisible(y < 80 || y < lastY)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!products.length) return
    const el = carouselRef.current
    if (!el) return
    const interval = setInterval(() => {
      if (carouselPaused.current) return
      const cardW = 192 + 12 // w-48 + gap-3
      const maxLeft = el.scrollWidth - el.clientWidth
      const next = el.scrollLeft + cardW
      el.scrollTo({ left: next >= maxLeft ? 0 : next, behavior: 'smooth' })
    }, 1500)
    return () => clearInterval(interval)
  }, [products])

  useEffect(() => {
    if (heroBanners.length <= 1) return
    const interval = setInterval(() => {
      if (!bannerPaused.current)
        setBannerIdx(i => (i + 1) % heroBanners.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [heroBanners.length])

  useEffect(() => {
    if (visibleAnnouncements.length <= 1) return
    const interval = setInterval(() => {
      if (!annPaused.current)
        setAnnIdx(i => (i + 1) % visibleAnnouncements.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [visibleAnnouncements.length])

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'dark') setIsDark(true)

    const returningToChampionship = new URLSearchParams(window.location.search).has('campeonato')
    if (getRole() === 'Customer' && !returningToChampionship) {
      router.replace('/cliente')
      return
    }
    Promise.allSettled([
      championshipApi.list().then(r =>
        setChampionships(r.data.filter(c => c.status === 'Planejado' || c.status === 'Inscricoes').slice(0, 8))
      ),
      productApi.list().then(r => {
        const visible  = r.data.filter(p => p.isActive && p.stockQuantity > 0 && p.showOnMarketplace !== false)
        const featured = visible.filter(p => p.isFeatured)
        setProducts(featured.length > 0 ? featured : visible)
      }),
      announcementApi.visible().then(r => setAnnouncements(r.data)),
      siteConfigApi.get().then(r => setSite(r.data)),
      // Só pra resolver o desconto do Pix da categoria no card/modal de produto.
      categoryApi.list().then(r => setCategorias(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [router])

  // Depois do login/cadastro, reabre exatamente o campeonato que iniciou o fluxo.
  // Sem isso o cliente caía no menu da conta e perdia a inscrição que estava fazendo.
  useEffect(() => {
    if (!championships.length) return
    const params = new URLSearchParams(window.location.search)
    const championshipId = params.get('campeonato')
    if (!championshipId) return
    const championship = championships.find(c => c.id === championshipId)
    if (championship) setRegisterModal(championship)
    params.delete('campeonato')
    const query = params.toString()
    window.history.replaceState(null, '', query ? `/?${query}` : '/')
  }, [championships])

  const radius = RADIUS_PRESETS[site.borderRadiusStyle] ?? RADIUS_PRESETS.Padrao

  return (
    <div className="site-shell min-h-screen" style={{ backgroundColor: C.bg, color: C.navy }}>
      {/* Retematiza os cantos (cards/botões/imagens) sem precisar editar cada className —
          [class~=...] só bate o token exato "rounded-xl" etc, então variantes responsivas
          (sm:rounded-2xl) e direcionais (rounded-t-3xl, usadas nos modais de bottom-sheet)
          ficam de fora de propósito, senão quebraria o desenho deles. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .site-shell [class~="rounded-md"]  { border-radius: ${radius.md} !important; }
        .site-shell [class~="rounded-lg"]  { border-radius: ${radius.lg} !important; }
        .site-shell [class~="rounded-xl"]  { border-radius: ${radius.xl} !important; }
        .site-shell [class~="rounded-2xl"] { border-radius: ${radius.twoXl} !important; }
      ` }} />

      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      {/* Trigger zone: permite hover revelar o nav mesmo quando escondido */}
      <div className="fixed top-0 inset-x-0 h-3 z-[51]"
        onMouseEnter={() => setNavHover(true)} />

      <nav className="fixed inset-x-0 top-0 z-50 h-16 flex items-center relative transition-transform duration-300"
        style={{ backgroundColor: '#0F3460', backdropFilter: 'blur(16px)', transform: (navVisible || navHover) ? 'translateY(0)' : 'translateY(-100%)' }}
        onMouseEnter={() => setNavHover(true)}
        onMouseLeave={() => setNavHover(false)}>

        {/* Marca centralizada absolutamente */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2">
          {site.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.siteName} className="h-8 w-auto object-contain" />
          )}
          <span className="font-black text-2xl leading-none" style={{ color: '#ffffff' }}>{site.siteName}</span>
        </div>

        <div className="w-full max-w-6xl mx-auto px-5 flex items-center justify-between">

          {/* Links desktop — esquerda */}
          <div className="hidden xl:flex items-center gap-4 text-sm font-medium">
            <a href="#eventos"  style={{ color: '#ffffff' }} className="hover:opacity-80 transition-opacity">{site.navTorneiosLabel}</a>
            <Link href="/produtos" style={{ color: '#ffffff' }} className="hover:opacity-80 transition-opacity">{site.navProdutosLabel}</Link>
            <Link href="/cliente/mercado" style={{ color: '#ffffff' }} className="hover:opacity-80 transition-opacity">{site.navMercadoLabel}</Link>
            <Link href="/liga" style={{ color: '#ffffff' }} className="hover:opacity-80 transition-opacity">{site.navLigaLabel}</Link>
            <a href="#pontos"   style={{ color: '#ffffff' }} className="hover:opacity-80 transition-opacity">{site.navPontosLabel}</a>
          </div>

          {/* Espaço mobile esquerda */}
          <div className="xl:hidden" />

          {/* Ações direita */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => (document.querySelector('[vw-access-button]') as HTMLElement | null)?.click()}
              title="Acessibilidade em Libras"
              className="hidden xl:block p-2 rounded-xl transition-colors hover:bg-white/10"
              style={{ color: '#ffffff' }}>
              <Accessibility className="w-4 h-4" />
            </button>
            <button onClick={toggleDark} title={isDark ? 'Modo claro' : 'Modo escuro'}
              className="p-2 rounded-xl transition-colors hover:bg-white/10"
              style={{ color: '#ffffff' }}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link href="/entrar"
              className="hidden xl:block text-sm px-4 py-2 rounded-xl border transition-colors hover:bg-white/10"
              style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.40)' }}>
              Minha Conta
            </Link>
            <a href="#eventos"
              className="hidden xl:block text-sm font-black px-5 py-2 rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: C.yellow, color: site.colorNavy }}>
              {site.ctaVerEventosLabel}
            </a>
            <button onClick={() => setMobileMenu(v => !v)} className="xl:hidden p-2" style={{ color: '#ffffff' }}>
              <div className="space-y-1.5">
                <span className={`block w-5 h-0.5 bg-current transition-transform ${mobileMenu ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block w-5 h-0.5 bg-current transition-opacity ${mobileMenu ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-0.5 bg-current transition-transform ${mobileMenu ? '-rotate-45 -translate-y-2' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Menu mobile */}
      {mobileMenu && (
        <div className="fixed inset-x-0 top-16 z-40 border-b xl:hidden px-5 py-4 space-y-1"
          style={{ backgroundColor: site.colorNavy, borderColor: 'rgba(255,255,255,0.10)' }}>
          <a href="#eventos" onClick={() => setMobileMenu(false)}
            className="block py-2.5 text-sm hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.70)' }}>
            {site.navTorneiosLabel}
          </a>
          <Link href="/produtos" onClick={() => setMobileMenu(false)}
            className="block py-2.5 text-sm hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.70)' }}>
            {site.navProdutosLabel}
          </Link>
          <Link href="/cliente/mercado" onClick={() => setMobileMenu(false)}
            className="block py-2.5 text-sm hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.70)' }}>
            {site.navMercadoLabel}
          </Link>
          <Link href="/liga" onClick={() => setMobileMenu(false)}
            className="block py-2.5 text-sm hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.70)' }}>
            {site.navLigaLabel}
          </Link>
          <a href="#pontos" onClick={() => setMobileMenu(false)}
            className="block py-2.5 text-sm hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.70)' }}>
            {site.navPontosLabel}
          </a>
          <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <Link href="/entrar" onClick={() => setMobileMenu(false)}
              className="flex-1 text-center py-2.5 text-sm rounded-xl border font-medium hover:text-white transition-colors"
              style={{ color: 'rgba(255,255,255,0.70)', borderColor: 'rgba(255,255,255,0.25)' }}>
              Minha Conta
            </Link>
            <button onClick={() => { toggleDark(); setMobileMenu(false) }}
              className="px-4 py-2.5 text-sm rounded-xl border font-medium hover:text-white transition-colors flex items-center gap-1.5"
              style={{ color: 'rgba(255,255,255,0.70)', borderColor: 'rgba(255,255,255,0.25)' }}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDark ? 'Claro' : 'Escuro'}
            </button>
            <button
              onClick={() => { (document.querySelector('[vw-access-button]') as HTMLElement | null)?.click(); setMobileMenu(false) }}
              className="px-4 py-2.5 text-sm rounded-xl border font-bold hover:text-white transition-colors"
              style={{ color: 'rgba(255,255,255,0.70)', borderColor: 'rgba(255,255,255,0.25)' }}>
              Libras
            </button>
            <a href="#eventos" onClick={() => setMobileMenu(false)}
              className="flex-1 text-center py-2.5 text-sm rounded-xl font-black"
              style={{ backgroundColor: C.blue, color: '#fff' }}>
              Eventos
            </a>
          </div>
        </div>
      )}

      {/* ── HERO + CAROUSEL DE FUNDO ───────────────────────────────────── */}
      <section
        className="relative pt-16 overflow-hidden"
        onMouseEnter={() => { bannerPaused.current = true }}
        onMouseLeave={() => { bannerPaused.current = false }}
        onTouchStart={() => { bannerPaused.current = true }}
        onTouchEnd={() => { bannerPaused.current = false }}
      >
        {/* Fundo: banners rotativos ou gradiente padrão */}
        {heroBanners.length > 0 ? (
          <>
            {heroBanners.map((banner, i) => (
              <div
                key={banner.id}
                className="absolute inset-0 transition-opacity duration-1000"
                style={{ opacity: i === bannerIdx ? 1 : 0 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.imageUrl!} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {/* Overlay escuro — mais forte à esquerda (onde fica o texto do site) e mais
                fraco à direita, pra não apagar o texto que já vem desenhado na imagem do banner */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-black/10" />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: bannerGradient }} />
        )}

        {/* Conteúdo do hero — por cima do fundo */}
        <div className="relative z-10 max-w-6xl mx-auto px-5 py-20 md:py-24">
          <div className="flex flex-col items-center gap-8 md:gap-12 md:flex-row">

            {/* Texto */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-4 leading-tight">
                <span style={{ color: C.yellow }}>{heroFirstWord}</span>
                {heroRest && <>{' '}<span style={{ color: C.blue }}>{heroRest}</span></>}
              </h1>
              <p className="text-base md:text-lg max-w-md mb-8 leading-relaxed" style={{ color: '#ffffff' }}>
                {site.heroSubtitle}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <a href="#eventos"
                  className="inline-flex items-center justify-center gap-2 font-black px-7 py-3.5 rounded-xl transition-all active:scale-95"
                  style={{ backgroundColor: C.yellow, color: site.colorNavy, boxShadow: `0 8px 28px rgba(255,228,94,0.22)` }}>
                  <Trophy className="w-5 h-5" /> {site.ctaVerTorneiosLabel}
                </a>
                <Link href="/produtos"
                  className="inline-flex items-center justify-center gap-2 font-semibold px-7 py-3.5 rounded-xl border transition-all hover:border-white/30 hover:text-white"
                  style={{ borderColor: 'rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.85)' }}>
                  <ShoppingBag className="w-5 h-5" /> {site.ctaVerProdutosLabel}
                </Link>
              </div>
            </div>

            {/* Logo principal — usa a logo configurada em Personalizar Site; sem uma, mantém o
                arquivo padrão original pra não quebrar o visual de quem nunca configurou nada. */}
            <div className="relative shrink-0 w-full max-w-xs sm:max-w-sm md:max-w-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.logoUrl || '/logo-santuario.svg'}
                alt={site.siteName}
                className="w-full h-auto object-contain drop-shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
              />
            </div>
          </div>
        </div>

        {/* Setas prev/next — só com múltiplos banners */}
        {heroBanners.length > 1 && (
          <>
            <button
              onClick={() => setBannerIdx(i => (i - 1 + heroBanners.length) % heroBanners.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(6px)' }}
              aria-label="Banner anterior"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => setBannerIdx(i => (i + 1) % heroBanners.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(6px)' }}
              aria-label="Próximo banner"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}

        {/* Dots — só com múltiplos banners */}
        {heroBanners.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {heroBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setBannerIdx(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === bannerIdx ? '24px' : '6px',
                  background: i === bannerIdx ? '#FFE45E' : 'rgba(255,255,255,0.45)',
                }}
                aria-label={`Ir para banner ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── CARROSSEL DE AVISOS & DESTAQUES ────────────────────────────── */}
      {visibleAnnouncements.length > 0 && (
        <section className="px-5 py-8 max-w-6xl mx-auto">
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{ height: 'clamp(220px, 36vw, 420px)' }}
            onMouseEnter={() => { annPaused.current = true }}
            onMouseLeave={() => { annPaused.current = false }}
            onTouchStart={() => { annPaused.current = true }}
            onTouchEnd={() => { annPaused.current = false }}
          >
            {visibleAnnouncements.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setAnnModal(a)}
                className="absolute inset-0 w-full text-left transition-opacity duration-600"
                style={{
                  opacity: i === annIdx ? 1 : 0,
                  pointerEvents: i === annIdx ? 'auto' : 'none',
                  background: bannerGradient,
                }}
              >
                {a.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 px-6 pb-6">
                      <span className="inline-block text-xs font-black uppercase tracking-widest mb-2 px-2 py-0.5 rounded"
                        style={{ background: a.type === 'Destaque' ? C.blue : C.yellow, color: a.type === 'Destaque' ? '#fff' : site.colorNavy }}>
                        {a.type === 'Destaque' ? 'Destaque' : 'Aviso'}
                      </span>
                      <p className="text-white font-black text-xl md:text-3xl leading-tight drop-shadow">{a.title}</p>
                      {a.body && <p className="text-white/80 text-sm md:text-base mt-1.5 line-clamp-2 drop-shadow">{a.body}</p>}
                      <p className="text-xs mt-3 font-bold" style={{ color: C.yellow }}>Ver mais →</p>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-8 text-center"
                    style={{ background: bannerGradient }}>
                    <span className="inline-block text-xs font-black uppercase tracking-widest px-3 py-1 rounded"
                      style={{ background: a.type === 'Destaque' ? C.blue : C.yellow, color: a.type === 'Destaque' ? '#fff' : site.colorNavy }}>
                      {a.type === 'Destaque' ? 'Destaque' : 'Aviso'}
                    </span>
                    <p className="text-white font-black text-2xl md:text-4xl leading-tight">{a.title}</p>
                    {a.body && <p className="text-white/70 text-sm md:text-lg max-w-lg leading-relaxed">{a.body}</p>}
                    <p className="text-xs font-bold" style={{ color: C.yellow }}>Ver mais →</p>
                  </div>
                )}
              </button>
            ))}

            {/* Setas prev/next */}
            {visibleAnnouncements.length > 1 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setAnnIdx(i => (i - 1 + visibleAnnouncements.length) % visibleAnnouncements.length) }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
                  aria-label="Anúncio anterior"
                >
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setAnnIdx(i => (i + 1) % visibleAnnouncements.length) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
                  aria-label="Próximo anúncio"
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </>
            )}

            {/* Dots */}
            {visibleAnnouncements.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
                {visibleAnnouncements.map((_, i) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); setAnnIdx(i) }}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === annIdx ? '24px' : '6px',
                      background: i === annIdx ? C.yellow : 'rgba(255,255,255,0.45)',
                    }}
                    aria-label={`Ir para anúncio ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── TORNEIOS ────────────────────────────────────────────────────── */}
      <section id="eventos" className="py-16 px-5 border-t" style={{ borderColor: C.border }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: C.blue }}>{site.torneiosEyebrow}</p>
              <h2 className="text-2xl md:text-3xl font-black" style={{ color: C.navy }}>{site.torneiosTitle}</h2>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-14">
              <div className="w-7 h-7 border-2 rounded-full animate-spin"
                style={{ borderColor: C.blue, borderTopColor: 'transparent' }} />
            </div>
          ) : championships.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border" style={{ borderColor: C.border, backgroundColor: C.card }}>
              <Trophy className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: C.navy }} />
              <p className="font-medium opacity-50" style={{ color: C.navy }}>Nenhum evento agendado no momento.</p>
              <p className="text-sm mt-1 opacity-40" style={{ color: C.text }}>Fique de olho nas novidades.</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Calendário */}
              <div className="shrink-0 lg:w-64">
                <EventCalendar championships={championships} onSelect={c => setRegisterModal(c)} C={C} />
              </div>
              {/* Cards */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
                {championships.map(c => (
                  <ChampionshipCard key={c.id} championship={c} onRegister={() => setRegisterModal(c)} C={C} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── PRODUTOS ────────────────────────────────────────────────────── */}
      <section id="produtos" className="py-16 px-5 border-t" style={{ borderColor: C.border }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: C.blue }}>{site.produtosEyebrow}</p>
              <h2 className="text-2xl md:text-3xl font-black" style={{ color: C.navy }}>{site.produtosTitle}</h2>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-14">
              <div className="w-7 h-7 border-2 rounded-full animate-spin"
                style={{ borderColor: C.blue, borderTopColor: 'transparent' }} />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border" style={{ borderColor: C.border, backgroundColor: C.card }}>
              <Package className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: C.navy }} />
              <p className="font-medium opacity-50" style={{ color: C.navy }}>Produtos em breve.</p>
            </div>
          ) : (
            <>
              {/* Carrossel lateral */}
              <div className="relative group">
                {/* Seta esquerda */}
                <button
                  onClick={() => {
                    carouselPaused.current = true
                    carouselRef.current?.scrollBy({ left: -204, behavior: 'smooth' })
                    setTimeout(() => { carouselPaused.current = false }, 1500)
                  }}
                  className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-9 h-9 rounded-full items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.navy }}>
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>

                {/* Scroll */}
                <div
                  ref={carouselRef}
                  className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  onMouseEnter={() => { carouselPaused.current = true }}
                  onMouseLeave={() => { carouselPaused.current = false }}
                  onTouchStart={() => { carouselPaused.current = true }}
                  onTouchEnd={() => { setTimeout(() => { carouselPaused.current = false }, 2000) }}
                >
                  {products.map(p => (
                    <div key={p.id} className="snap-start shrink-0 w-40 sm:w-48">
                      <ProductCard product={p} onClick={() => setProductModal(p)} C={C} pix={pixDoProduto(p)} />
                    </div>
                  ))}
                  {/* Card final "Ver todos" */}
                  <div className="snap-start shrink-0 w-40 sm:w-48 flex items-center justify-center">
                    <Link
                      href="/produtos"
                      className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-[220px] rounded-2xl border-2 border-dashed transition-all hover:opacity-80"
                      style={{ borderColor: C.blue, color: C.blue }}>
                      <ChevronRight className="w-8 h-8" />
                      <span className="text-xs font-black text-center leading-snug px-2">
                        Ver todos<br />{products.length} produtos
                      </span>
                    </Link>
                  </div>
                </div>

                {/* Seta direita */}
                <button
                  onClick={() => {
                    carouselPaused.current = true
                    carouselRef.current?.scrollBy({ left: 204, behavior: 'smooth' })
                    setTimeout(() => { carouselPaused.current = false }, 1500)
                  }}
                  className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-9 h-9 rounded-full items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.navy }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Indicadores + botão */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex gap-1.5">
                  {products.slice(0, 8).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        carouselPaused.current = true
                        carouselRef.current?.scrollTo({ left: i * 204, behavior: 'smooth' })
                        setTimeout(() => { carouselPaused.current = false }, 1500)
                      }}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{ backgroundColor: C.blue, opacity: 0.3 }}
                    />
                  ))}
                </div>
                <Link
                  href="/produtos"
                  className="flex items-center gap-2 text-sm font-black px-6 py-2.5 rounded-xl transition-all active:scale-95"
                  style={{ backgroundColor: C.blue, color: '#fff', boxShadow: `0 4px 16px rgba(62,194,242,0.25)` }}>
                  Ver todos os {products.length} produtos <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── PONTOS / FIDELIDADE ─────────────────────────────────────────── */}
      <section id="pontos" className="py-16 px-5 border-t" style={{ borderColor: C.border }}>
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl overflow-hidden border"
            style={{ backgroundColor: C.card, borderColor: `${C.blue}25` }}>
            <div className="p-8 md:p-12 flex flex-col md:flex-row gap-8 md:gap-16 items-center">

              {/* Texto */}
              <div className="flex-1 text-center md:text-left">
                <p className="text-xs font-black uppercase tracking-widest mb-3"
                  style={{ color: C.yellow }}>{site.pontosEyebrow}</p>
                <h2 className="text-2xl md:text-3xl font-black mb-4 leading-tight" style={{ color: C.navy }}>
                  {site.pontosTitle}
                </h2>
                <p className="text-sm leading-relaxed max-w-sm mb-6" style={{ color: C.text }}>
                  {site.pontosParagraph}
                </p>
                <a href="#" className="inline-flex items-center gap-2 text-sm font-bold hover:gap-3 transition-all"
                  style={{ color: C.blue }}>
                  Saiba mais <ChevronRight className="w-4 h-4" />
                </a>
              </div>

              {/* Cards de benefício */}
              <div className="grid grid-cols-3 gap-3 w-full md:w-auto md:min-w-[340px]">
                {[
                  { icon: QrCode, label: 'Sem senha', sub: 'Login só com CPF' },
                  { icon: Star,   label: 'Pontos válidos', sub: 'Enquanto você for ativo' },
                  { icon: Award,  label: '100pts = R$1', sub: 'Desconto na comanda' },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex flex-col items-center text-center p-4 rounded-xl border"
                    style={{ backgroundColor: `${C.blue}08`, borderColor: `${C.blue}20` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                      style={{ backgroundColor: `${C.blue}18` }}>
                      <Icon className="w-5 h-5" style={{ color: C.blue }} />
                    </div>
                    <p className="text-xs font-black leading-snug" style={{ color: C.navy }}>{label}</p>
                    <p className="text-[10px] mt-0.5 leading-snug" style={{ color: C.text }}>{sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Strip de garantia */}
            <div className="border-t px-8 py-4 flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2"
              style={{ borderColor: C.border }}>
              {[
                { icon: Shield, text: 'Dados protegidos — LGPD' },
                { icon: CheckCircle, text: 'Sem aplicativo necessário' },
                { icon: MessageCircle, text: `Suporte via WhatsApp` },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-2 text-xs font-medium" style={{ color: C.text }}>
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: C.blue }} /> {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t pt-8 pb-6 px-5" style={{ borderColor: C.border }}>
        <div className="max-w-6xl mx-auto">
          {/* Linha principal */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <img src={site.logoUrl || '/logo-maikon.png'} alt={site.siteName} className="h-8 w-auto object-contain" />
              <div>
                <p className="font-black text-sm leading-tight" style={{ color: C.navy }}>{site.siteName}</p>
                <p className="text-[10px]" style={{ color: C.text }}>{site.addressLine}</p>
              </div>
            </div>

            {/* Contato */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a href={`https://wa.me/${site.whatsappNumber}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: '#25D366' }}>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {formatWhatsapp(site.whatsappNumber)}
              </a>

              <a href={`mailto:${site.contactEmail}`}
                className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: C.blue }}>
                <Mail className="w-4 h-4 shrink-0" />
                {site.contactEmail}
              </a>

              <Link href="/lgpd"
                className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                style={{ color: C.text }}>
                <Shield className="w-3.5 h-3.5 shrink-0" />
                LGPD &amp; Privacidade
              </Link>
            </div>

            <Link href="/login"
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ color: C.text }}>
              <CreditCard className="w-3.5 h-3.5" /> Área do Admin
            </Link>
          </div>

          {/* Rodapé copyright */}
          <div className="border-t pt-4 text-center text-[11px]" style={{ borderColor: C.border, color: C.text }}>
            © {new Date().getFullYear()} {site.siteName} · {site.addressLine} · Todos os direitos reservados
          </div>
        </div>
      </footer>

      {/* ── WHATSAPP FLUTUANTE ──────────────────────────────────────────────
           bottom-20, não bottom-6: o botão do VLibras fica em bottom:10px com
           40px de altura e z-index 2147483639, então em bottom-6 os dois se
           cruzavam num quadrado de 26px e a mão cobria a ponta deste botão.
           Quem sobe é este, não o VLibras: acessibilidade tem canto escolhido
           pelo usuário nas preferências, e o plugin vive em Shadow DOM. */}
      <a
        href={`https://wa.me/${site.whatsappNumber}`}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-20 right-6 z-50 flex items-center gap-2.5 font-black text-sm px-4 py-3 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95"
        style={{ backgroundColor: '#25D366', color: '#fff', boxShadow: '0 8px 24px rgba(37,211,102,0.4)' }}
      >
        <MessageCircle className="w-5 h-5" />
        Falar com {site.contactPersonName}
      </a>

      {/* ── MODAIS ──────────────────────────────────────────────────────── */}
      {annModal      && <AnnouncementModal ann={annModal}               onClose={() => setAnnModal(null)}      C={C} />}
      {productModal  && <ProductModal      product={productModal}       onClose={() => setProductModal(null)}  C={C} pix={pixDoProduto(productModal)} />}
      {registerModal && <RegisterModal     championship={registerModal} onClose={() => setRegisterModal(null)} C={C} whatsapp={site.whatsappNumber} contactPersonName={site.contactPersonName} />}
    </div>
  )
}

// ── Event Calendar ────────────────────────────────────────────────────────────

function EventCalendar({ championships, onSelect, C }: {
  championships: Championship[]
  onSelect: (c: Championship) => void
  C: Theme
}) {
  const [view, setView] = useState(() => new Date())
  const year  = view.getFullYear()
  const month = view.getMonth()

  const firstWeekDay  = new Date(year, month, 1).getDay()
  const daysInMonth   = new Date(year, month + 1, 0).getDate()
  const monthLabel    = view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // { day: Championship } para o mês visível
  const eventDays = championships.reduce<Record<number, Championship>>((acc, c) => {
    const d = new Date(c.startDate)
    if (d.getMonth() === month && d.getFullYear() === year) acc[d.getDate()] = c
    return acc
  }, {})

  const today    = new Date()
  const isToday  = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  const prevMonth = () => setView(new Date(year, month - 1, 1))
  const nextMonth = () => setView(new Date(year, month + 1, 1))

  const cells: (number | null)[] = [
    ...Array(firstWeekDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="rounded-2xl border p-4" style={{ backgroundColor: C.card, borderColor: C.border }}>
      {/* Cabeçalho do mês */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
          style={{ color: C.text, backgroundColor: C.cardAlt }}>
          ‹
        </button>
        <p className="text-xs font-black capitalize" style={{ color: C.navy }}>{monthLabel}</p>
        <button onClick={nextMonth}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
          style={{ color: C.text, backgroundColor: C.cardAlt }}>
          ›
        </button>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 mb-1">
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-black pb-1" style={{ color: C.text }}>{d}</div>
        ))}
      </div>

      {/* Células */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const hasEvent = !!eventDays[day]
          const todayCell = isToday(day)
          return (
            <button
              key={i}
              onClick={() => hasEvent && onSelect(eventDays[day])}
              disabled={!hasEvent}
              className="relative flex flex-col items-center justify-center h-8 rounded-lg text-xs font-bold transition-all"
              style={{
                color:           hasEvent ? '#fff' : todayCell ? C.navy : C.text,
                backgroundColor: hasEvent ? C.blue  : todayCell ? `${C.blue}20` : 'transparent',
                fontWeight:      todayCell || hasEvent ? 900 : 500,
                cursor:          hasEvent ? 'pointer' : 'default',
              }}
            >
              {day}
              {hasEvent && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white opacity-80" />
              )}
            </button>
          )
        })}
      </div>

      {/* Legenda */}
      {Object.keys(eventDays).length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: C.border }}>
          {Object.entries(eventDays).map(([day, c]) => (
            <button key={day} onClick={() => onSelect(c)}
              className="w-full text-left flex items-center gap-2 text-[11px] hover:opacity-80 transition-opacity">
              <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 font-black text-[10px]"
                style={{ backgroundColor: C.blue, color: '#fff' }}>{day}</span>
              <span className="line-clamp-1 font-semibold" style={{ color: C.navy }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Championship Card ─────────────────────────────────────────────────────────

function ChampionshipCard({ championship: c, onRegister, C }: { championship: Championship; onRegister: () => void; C: Theme }) {
  const gameColors: Record<string, { bg: string; text: string }> = {
    'Pokemon':   { bg: 'rgba(234,179,8,0.15)',  text: '#FBBF24' },
    'Magic':     { bg: 'rgba(99,102,241,0.15)', text: '#818CF8' },
    'Yu-Gi-Oh':  { bg: 'rgba(168,85,247,0.15)', text: '#C084FC' },
    'One Piece': { bg: 'rgba(239,68,68,0.15)',  text: '#F87171' },
  }
  const gc = gameColors[c.game] ?? { bg: 'rgba(62,194,242,0.12)', text: '#3EC2F2' }

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col group transition-all hover:translate-y-[-2px]"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>

      {/* Imagem */}
      {c.imageUrl ? (
        <div className="w-full h-36 overflow-hidden">
          <img src={c.imageUrl} alt={c.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      ) : (
        <div className="w-full h-36 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${gc.bg}, ${C.cardAlt})` }}>
          <Trophy className="w-9 h-9 opacity-30" style={{ color: gc.text }} />
        </div>
      )}

      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Game badge + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full"
            style={{ backgroundColor: gc.bg, color: gc.text }}>
            {c.game}
          </span>
          {c.status === 'Inscricoes' && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ADE80' }}>
              Inscrições abertas
            </span>
          )}
        </div>

        {/* Nome */}
        <h3 className="font-black text-sm leading-snug line-clamp-2" style={{ color: C.navy }}>{c.name}</h3>

        {/* Data + vagas */}
        <div className="space-y-1.5 text-xs" style={{ color: C.text }}>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: C.blue }} />
            {new Date(c.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          {c.maxParticipants && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 shrink-0" style={{ color: C.blue }} />
              Até {c.maxParticipants} jogadores
            </div>
          )}
        </div>

        {/* Taxa + botão */}
        <div className="mt-auto pt-3 border-t flex items-center justify-between gap-2"
          style={{ borderColor: C.border }}>
          <span className="text-sm font-black" style={{ color: C.yellow }}>
            R$ {(c.entryFeeInCents / 100).toFixed(2).replace('.', ',')}
          </span>
          <button
            onClick={onRegister}
            className="text-xs font-black px-3.5 py-2 rounded-xl flex items-center gap-1 transition-all active:scale-95"
            style={{ backgroundColor: C.blue, color: '#fff' }}>
            Inscrever <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product: p, onClick, C, pix }: { product: Product; onClick: () => void; C: Theme; pix: PixVitrine }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl overflow-hidden group transition-all active:scale-95 hover:translate-y-[-2px]"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
    >
      <div className="relative w-full aspect-[3/4] overflow-hidden"
        style={{ backgroundColor: C.cardAlt }}>
        {p.imageUrl
          ? <img src={p.imageUrl} alt={p.name}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 p-2" />
          : <div className="w-full h-full flex items-center justify-center">
              <Package className="w-10 h-10 opacity-20" style={{ color: C.navy }} />
            </div>
        }
        {p.isPreVenda && (
          <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
            Pré-venda
          </span>
        )}
        {p.isOnPromo && !p.isPreVenda && (
          <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: '#FF3B3B', color: '#fff' }}>
            Promoção
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] uppercase tracking-wide mb-1 font-medium" style={{ color: C.text }}>
          {p.category}
        </p>
        <p className="text-xs font-bold leading-snug line-clamp-2 mb-2" style={{ color: C.navy }}>{p.name}</p>
        <div className="flex items-center justify-between">
          {p.isOnPromo && p.discountPriceInReais != null ? (
            <div className="flex flex-col">
              <span className="text-[10px] line-through" style={{ color: C.text }}>
                R$ {p.priceInReais.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-sm font-black" style={{ color: '#FF3B3B' }}>
                R$ {p.discountPriceInReais.toFixed(2).replace('.', ',')}
              </span>
            </div>
          ) : (
            <span className="text-sm font-black" style={{ color: C.yellow }}>
              R$ {p.priceInReais.toFixed(2).replace('.', ',')}
            </span>
          )}
          <span className="text-[10px] font-medium" style={{ color: C.text }}>
            {p.stockQuantity} un.
          </span>
        </div>

        {/* Preço no Pix já na vitrine — o cliente compara antes mesmo de abrir o produto */}
        {pix && (
          <p className="text-[10px] font-semibold leading-tight mt-1" style={{ color: C.pix }}>
            {fmtBRL(pix.precoPix)} no Pix
            <span className="font-normal" style={{ color: C.text }}> · {fmtPixPct(pix.pixPercent)} OFF</span>
          </p>
        )}
      </div>
    </button>
  )
}

// ── Modais ────────────────────────────────────────────────────────────────────

function AnnouncementModal({ ann, onClose, C }: { ann: AnnouncementDto; onClose: () => void; C: Theme }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-b-0 sm:border-b"
        style={{ backgroundColor: C.card, borderColor: C.border }}
        onClick={e => e.stopPropagation()}>
        {/* Handle visual — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full opacity-30" style={{ backgroundColor: C.navy }} />
        </div>
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/50 hover:bg-black/80 transition">
          <X className="w-4 h-4 text-white" />
        </button>
        {ann.imageUrl && (
          <img src={ann.imageUrl} alt={ann.title} className="w-full max-h-64 object-cover" />
        )}
        <div className="p-6 pb-8 sm:pb-6">
          <h3 className="text-xl font-black leading-snug" style={{ color: C.navy }}>{ann.title}</h3>
          {ann.body && (
            <p className="text-sm mt-3 leading-relaxed whitespace-pre-wrap" style={{ color: C.text }}>{ann.body}</p>
          )}
          {ann.linkUrl && (
            <a href={ann.linkUrl} target="_blank" rel="noreferrer"
              className="mt-5 flex items-center justify-center gap-2 w-full font-black py-3 rounded-xl transition active:scale-95"
              style={{ backgroundColor: C.blue, color: '#fff' }}>
              Saiba mais
            </a>
          )}
          <button onClick={onClose}
            className="mt-3 w-full py-2.5 text-sm rounded-xl border transition-colors hover:text-white"
            style={{ color: C.text, borderColor: C.border }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductModal({ product: p, onClose, C, pix }: { product: Product; onClose: () => void; C: Theme; pix: PixVitrine }) {
  const [imgIdx, setImgIdx] = useState(0)

  const images = p.imageUrls && p.imageUrls.length > 0
    ? p.imageUrls
    : p.imageUrl ? [p.imageUrl] : []
  const activeImg = images[imgIdx] ?? null

  const discountPct = p.isOnPromo && p.discountPriceInReais != null
    ? Math.round((1 - p.discountPriceInReais / p.priceInReais) * 100)
    : null

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-b-0 sm:border-b"
        style={{ backgroundColor: C.card, borderColor: C.border }}
        onClick={e => e.stopPropagation()}>

        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full opacity-30" style={{ backgroundColor: C.navy }} />
        </div>

        {/* Fechar */}
        <button onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/50 hover:bg-black/80 transition">
          <X className="w-4 h-4 text-white" />
        </button>

        <div className="sm:grid sm:grid-cols-[1fr_1fr]">

          {/* ── Galeria ── */}
          <div style={{ backgroundColor: C.cardAlt }}>
            <div className="relative w-full aspect-square flex items-center justify-center p-4">
              {activeImg
                ? <img src={activeImg} alt={p.name} className="w-full h-full object-contain" />
                : <Package className="w-16 h-16 opacity-20" style={{ color: C.navy }} />
              }

              {/* Badges */}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                {p.isPreVenda && (
                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg"
                    style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Pré-venda</span>
                )}
                {p.isOnPromo && !p.isPreVenda && (
                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg"
                    style={{ backgroundColor: '#FF3B3B', color: '#fff' }}>Promoção</span>
                )}
                {p.isFeatured && !p.isOnPromo && !p.isPreVenda && (
                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg"
                    style={{ backgroundColor: '#F59E0B', color: '#fff' }}>Destaque</span>
                )}
              </div>

              {/* % OFF */}
              {discountPct != null && (
                <div className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center font-black text-[11px] leading-none"
                  style={{ backgroundColor: '#FF3B3B', color: '#fff' }}>
                  -{discountPct}%
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 px-4 pb-4 overflow-x-auto">
                {images.map((img, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all"
                    style={{
                      borderColor: i === imgIdx ? C.blue : 'transparent',
                      backgroundColor: C.card,
                      opacity: i === imgIdx ? 1 : 0.55,
                    }}>
                    <img src={img} alt="" className="w-full h-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Info ── */}
          <div className="p-5 pb-8 sm:pb-5 flex flex-col gap-3 sm:overflow-y-auto sm:max-h-[480px]">

            {/* Categoria */}
            <span className="inline-block self-start text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: `${C.blue}20`, color: C.blue }}>
              {p.category}
            </span>

            {/* Nome */}
            <h3 className="text-xl font-black leading-snug" style={{ color: C.navy }}>{p.name}</h3>

            {/* Descrição */}
            {(p.fullDescription || p.description) && (
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                {p.fullDescription || p.description}
              </p>
            )}

            <div className="mt-auto pt-4 space-y-4 border-t" style={{ borderColor: C.border }}>

              {/* Preço */}
              {p.isOnPromo && p.discountPriceInReais != null ? (
                <div className="flex items-end gap-3">
                  <span className="text-3xl font-black leading-none" style={{ color: '#FF3B3B' }}>
                    R$ {p.discountPriceInReais.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-sm line-through mb-0.5" style={{ color: C.text }}>
                    R$ {p.priceInReais.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ) : (
                <span className="text-3xl font-black" style={{ color: C.yellow }}>
                  R$ {p.priceInReais.toFixed(2).replace('.', ',')}
                </span>
              )}

              {/* Preço no Pix — mesma informação da página do produto */}
              {pix && (
                <p className="text-sm -mt-2" style={{ color: C.text }}>
                  ou <strong style={{ color: C.pix }}>{fmtBRL(pix.precoPix)}</strong>
                  {' '}com <strong style={{ color: C.pix }}>{fmtPixPct(pix.pixPercent)} OFF</strong> no Pix
                </p>
              )}

              {/* Estoque */}
              <div className="flex items-center gap-2">
                {p.isLowStock ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="text-sm font-bold" style={{ color: '#F59E0B' }}>
                      Últimas {p.stockQuantity} unidade{p.stockQuantity !== 1 ? 's' : ''}!
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-sm" style={{ color: C.text }}>{p.stockQuantity} em estoque</span>
                  </>
                )}
              </div>

              {/* CTA */}
              <Link href={`/produtos/${p.id}`}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-black text-sm transition-all active:scale-95"
                style={{ backgroundColor: C.blue, color: '#fff', boxShadow: `0 4px 16px ${C.blue}40` }}>
                Ver produto completo <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function RegisterModal({ championship, onClose, C, whatsapp, contactPersonName }: { championship: Championship; onClose: () => void; C: Theme; whatsapp: string; contactPersonName: string }) {
  const [decks,        setDecks]        = useState<DeckListDto[]>([])
  const [selectedDeck, setSelectedDeck] = useState<string>('')
  const [loading,      setLoading]      = useState(false)
  const [erro,         setErro]         = useState<string | null>(null)
  // 'form' → escolhe deck | 'pagar' → campeonato gratuito confirmado | 'pix' → QR obrigatório
  const [etapa,        setEtapa]        = useState<'form' | 'pagar' | 'pix'>('form')
  const [pix,          setPix]          = useState<PixCobrancaDto | null>(null)
  const [copiado,      setCopiado]      = useState(false)

  const isLoggedIn = getRole() === 'Customer' || getRole() === 'Admin'
  const temTaxa    = championship.entryFeeInCents > 0
  const taxaFmt    = `R$ ${(championship.entryFeeInCents / 100).toFixed(2).replace('.', ',')}`

  useEffect(() => {
    if (!isLoggedIn || !championship.game) return
    deckApi.list(championship.game).then(r => setDecks(r.data)).catch(() => {})
  }, [isLoggedIn, championship.game])

  // Uma única chamada cria a inscrição e o Pix. Assim não existe estado intermediário
  // com vaga criada e botão de "pagar depois".
  async function handleInscrever(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro(null)
    const deck = decks.find(d => d.id === selectedDeck)
    try {
      const { data } = await championshipApi.selfRegister(championship.id, deck?.name, deck?.id)
      if (temTaxa) {
        if (!data.pix) throw new Error('Pix obrigatório não retornado pelo servidor.')
        setPix(data.pix)
        setEtapa('pix')
      } else {
        setEtapa('pagar')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setErro(msg ?? 'Não foi possível concluir a inscrição. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function copiar() {
    if (!pix?.pixCopiaCola) return
    try {
      await navigator.clipboard.writeText(pix.pixCopiaCola)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* clipboard bloqueado — o usuário ainda consegue selecionar o texto */ }
  }

  const btn = { backgroundColor: C.blue, color: '#fff' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-b-0 sm:border-b p-6 pb-8 sm:pb-6 max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: C.card, borderColor: C.border }}>
        <div className="flex justify-center -mt-3 mb-4 sm:hidden">
          <div className="w-10 h-1 rounded-full opacity-30" style={{ backgroundColor: C.navy }} />
        </div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-black text-lg" style={{ color: C.navy }}>Inscrição</h3>
            <p className="text-sm mt-0.5" style={{ color: C.text }}>{championship.name}</p>
          </div>
          <button onClick={onClose} className="p-1 transition-colors" style={{ color: C.text }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {erro && (
          <div className="text-sm px-4 py-3 rounded-xl border mb-4"
            style={{ color: '#b91c1c', borderColor: 'rgba(185,28,28,0.25)', backgroundColor: 'rgba(185,28,28,0.06)' }}>
            {erro}
          </div>
        )}

        {!isLoggedIn ? (
          <div className="space-y-4">
            <div className="text-sm px-4 py-3 rounded-xl border leading-relaxed"
              style={{ color: C.blue, borderColor: `${C.blue}30`, backgroundColor: `${C.blue}08` }}>
              Para garantir sua vaga é preciso ter conta — é assim que o lugar fica reservado
              no seu nome e seu histórico de torneios fica salvo.
              {temTaxa ? <> A taxa é de <strong>{taxaFmt}</strong>.</> : null}
            </div>
            <a href={`/entrar?returnTo=${encodeURIComponent(`/?campeonato=${championship.id}`)}`}
              className="w-full flex items-center justify-center gap-2 font-black py-3.5 rounded-xl transition-all active:scale-95"
              style={btn}>
              Entrar e me inscrever
            </a>
            <a href={`/cadastro?returnTo=${encodeURIComponent(`/?campeonato=${championship.id}`)}`}
              className="w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl border transition-all active:scale-95"
              style={{ color: C.navy, borderColor: C.border }}>
              Criar conta
            </a>
            <p className="text-xs text-center leading-relaxed" style={{ color: C.text }}>
              Prefere falar direto? Chame {contactPersonName} no{' '}
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"
                className="underline font-bold">WhatsApp</a>.
            </p>
          </div>
        ) : etapa === 'form' ? (
          <form onSubmit={handleInscrever} className="space-y-4">
            {temTaxa && (
              <div className="text-sm px-4 py-3 rounded-xl border"
                style={{ color: C.blue, borderColor: `${C.blue}30`, backgroundColor: `${C.blue}08` }}>
                Taxa de inscrição: <strong>{taxaFmt}</strong>
              </div>
            )}
            {decks.length > 0 && (
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: C.navy }}>Deck (opcional)</label>
                <select
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all"
                  style={{ backgroundColor: C.cardAlt, border: `1px solid ${C.border}`, color: C.navy }}
                  value={selectedDeck} onChange={e => setSelectedDeck(e.target.value)}>
                  <option value="">Não informar deck</option>
                  {decks.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.cardCount} cartas)</option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 font-black py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-60"
              style={btn}>
              {loading
                ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 62.8" /></svg>
                : <CheckCircle className="w-4 h-4" />
              }
              {loading ? 'Garantindo sua vaga...' : 'Confirmar inscrição'}
            </button>
          </form>
        ) : etapa === 'pagar' ? (
          <div className="space-y-4">
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <p className="font-black mb-1" style={{ color: C.navy }}>Vaga garantida!</p>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                Você já está inscrito em <strong>{championship.name}</strong>.
              </p>
            </div>

            <button onClick={onClose}
              className="w-full font-black py-3.5 rounded-xl transition-all active:scale-95"
              style={btn}>
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center font-black text-lg" style={{ color: C.navy }}>{taxaFmt}</p>
            {pix?.imagemQrCode && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pix.imagemQrCode} alt="QR Code do Pix" className="w-52 h-52 mx-auto rounded-xl" />
            )}
            {pix?.pixCopiaCola && (
              <>
                <p className="text-xs font-bold" style={{ color: C.navy }}>Pix Copia e Cola</p>
                <textarea readOnly value={pix.pixCopiaCola} rows={3}
                  className="w-full rounded-xl px-3 py-2 text-[10px] font-mono outline-none border resize-none"
                  style={{ backgroundColor: C.cardAlt, border: `1px solid ${C.border}`, color: C.navy }} />
                <button onClick={copiar}
                  className="w-full font-black py-3 rounded-xl transition-all active:scale-95"
                  style={btn}>
                  {copiado ? 'Código copiado!' : 'Copiar código'}
                </button>
              </>
            )}
            <p className="text-xs text-center leading-relaxed" style={{ color: C.text }}>
              A confirmação é automática. A vaga será confirmada assim que o pagamento cair.
            </p>
            <button onClick={onClose}
              className="w-full py-2.5 text-sm rounded-xl border transition-colors"
              style={{ color: C.text, borderColor: C.border }}>
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
