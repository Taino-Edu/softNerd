'use client'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getRole, getUserName } from '@/lib/auth'
import { championshipApi, productApi, announcementApi, deckApi, siteConfigApi, categoryApi, Championship, Product, AnnouncementDto, DeckListDto, SiteConfigDto, ProductCategory, PixCobrancaDto } from '@/lib/api'
import { calcPrecoVitrine, resolvePixPercent } from '@/lib/precoVitrine'
import { fmtRestante } from '@/lib/prazo'
import { mixHex } from '@/lib/colors'
import { setOptionalItem } from '@/lib/cookieConsent'
import Link from 'next/link'
import {
  Trophy, ShoppingBag, Star, Calendar, Users,
  X, MessageCircle, CheckCircle, Package,
  CreditCard, Award, QrCode, Shield, ChevronRight, ChevronLeft,
  Mail, Heart, Store, Flame, Sparkles, CalendarDays,
} from 'lucide-react'
import { brl, dataHoraBR } from '@/lib/format'
import { fotoLeve } from '@/lib/fotoLeve'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import CartaoProduto, { rotuloCategoria, ehNovidade } from '@/components/loja/CartaoProduto'
import AvisoSacola, { usePorNaSacola } from '@/components/loja/AvisoSacola'
import MenuLoja from '@/components/loja/MenuLoja'

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
  heroImageUrl: null,
  heroEyebrow: 'O ponto de encontro da comunidade TCG',
  // Igual ao padrão do servidor: a faixa já nasce no lugar e não empurra o menu quando a config chega
  avisoTopo: 'Jogue, evolua e divirta-se — encontre tudo para sua próxima partida!',
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
  colorHero: '#1E4FD6',
  borderRadiusStyle: 'Padrao',
  pixDiscountPercent: 5,
  maxInstallments: 12,
  minInstallmentInCents: 500,
}

/** Cores do modelo do Maikon (17/11, o :root do index.html dele) — home com a chave home-vitrines.
 *  blue2 → blue → deep são os 3 tons do topo; ink/muted os textos; pale o fundo; line as bordas. */
const PALETA_MAIKON = {
  blue: '#174CC3', blue2: '#2867E8', deep: '#123A9B', yellow: '#FFD84D',
  ink: '#172B52', muted: '#72809A', pale: '#EDF3FF', line: '#E3EAF6', green: '#21825D',
  sombra: '0 16px 40px rgba(23, 60, 130, 0.10)',
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

/** Parcelamento no cartão mostrado no cartão do produto — null quando o item não parcela. */
type CartaoVitrine = { parcelas: number; valorParcela: number } | null

function fmtBRL(v: number) { return `${brl(v)}` }
/** Letreiro do topo da home que vende (modelo do Maikon, 16/11). O nome da loja fica só no menu. */
const TITULO_VENDE = { linha1: 'Prepare seu', antes: 'próximo ', destaque: 'grande jogo', depois: '!' }

function fmtPixPct(v: number) { return `${(Math.round(v * 10) / 10).toString().replace('.', ',')}%` }

export default function LandingPage() {
  const router = useRouter()
  const [championships, setChampionships] = useState<Championship[]>([])
  // Vitrine nova: todos os visíveis (destaques primeiro) — a grade mostra 8 e as categorias saem daqui
  const [vitrine,       setVitrine]       = useState<Product[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementDto[]>([])
  const [loading,       setLoading]       = useState(true)
  const [registerModal, setRegisterModal] = useState<Championship | null>(null)
  // Cliente que veio da área dele (/cliente → "Inscrever-se") volta pra lá ao fechar a inscrição;
  // antes ficava na página pública, longe da comanda e dos campeonatos (teste do fluxo, 06/11).
  const [voltarProCliente, setVoltarProCliente] = useState(false)
  const [productModal,  setProductModal]  = useState<Product | null>(null)
  const [annModal,      setAnnModal]      = useState<AnnouncementDto | null>(null)
  const [isDark,        setIsDark]        = useState(false)
  const [bannerIdx,    setBannerIdx]  = useState(0)
  const [annIdx,       setAnnIdx]     = useState(0)
  const [site,         setSite]       = useState<SiteConfigDto>(DEFAULT_SITE)
  const [siteCarregado, setSiteCarregado] = useState(false)
  const [categorias,   setCategorias] = useState<ProductCategory[]>([])
  const [maisVendidosIds, setMaisVendidosIds] = useState<string[]>([])
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
  const C0 = isDark ? {
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
  // Visual uniforme (chave "home-visual-uniforme", v1.66.0 — pedido do Maikon: "3 tons de azul"):
  // títulos, textos, destaques e fundo saem TODOS do azul da marca (colorHero, em Personalizar Site)
  // em vez de misturar o azul-céu (colorPrimary) e o azul-petróleo (colorNavy). Desligada = C0.
  const uniforme = useFuncionalidade('home-visual-uniforme') !== false
  // Home que vende (chave "home-que-vende", v1.87.0): topo do modelo do Maikon (letreiro "Prepare seu
  // próximo grande jogo!", 3 tons), categorias e vantagens logo abaixo, produtos antes de avisos/torneios,
  // "+ Sacola" no cartão e torneios somem quando não há nenhum. A busca fica em Produtos (?busca=).
  // Desligada = a ordem de antes (torneios, 3 cartões curtos, produtos depois).
  const vende = useFuncionalidade('home-que-vende') !== false
  // Agenda, Mais vendidos e Novidades (chave "home-vitrines", v1.90.0 — pedido do Maikon, 17/11): os 3 cartões
  // e a agenda "Campeonatos & eventos" logo abaixo do topo, categorias só em Produtos, topo mais baixo (arte com
  // 390px) e as cores do modelo dele. Vale em cima da home que vende. Desligada = a home da v1.87.
  const chaveVitrines = useFuncionalidade('home-vitrines')
  const vitrines = vende && chaveVitrines !== false
  const { porNaSacola, nome: naSacola } = usePorNaSacola()
  const marcaEscura = mixHex(site.colorHero, '#000000', 0.55)
  const Cbase = !uniforme ? C0 : isDark ? {
    ...C0, blue: mixHex(site.colorHero, '#FFFFFF', 0.38),
  } : {
    ...C0,
    bg: mixHex(site.colorHero, '#FFFFFF', 0.94),
    cardAlt: mixHex(site.colorCard, site.colorHero, 0.05),
    border: mixHex(site.colorHero, '#FFFFFF', 0.86),
    blue: site.colorHero,
    text: mixHex(marcaEscura, '#FFFFFF', 0.38),
    navy: marcaEscura,
  }
  // Home com vitrines: as cores do modelo do Maikon no tema claro (no escuro só o amarelo dele)
  const C = !vitrines ? Cbase : isDark ? { ...Cbase, yellow: PALETA_MAIKON.yellow } : {
    ...Cbase,
    bg: PALETA_MAIKON.pale, card: '#FFFFFF', cardAlt: mixHex(PALETA_MAIKON.pale, '#FFFFFF', 0.4),
    border: PALETA_MAIKON.line, blue: PALETA_MAIKON.blue, yellow: PALETA_MAIKON.yellow,
    text: PALETA_MAIKON.muted, navy: PALETA_MAIKON.ink,
  }
  /** Segunda palavra do título no topo ("Nerd"): o azul padrão da loja (Cor principal em Personalizar
   *  Site, o mesmo do "NERD" da logo) — pedido do Taino, mesmo com o resto da home num azul só. */
  const corTituloHero = site.colorPrimary

  /** Pix do item, com a herança item → categoria → categoria pai → padrão da loja. */
  function pixDoProduto(p: Product): PixVitrine {
    const preco = p.isOnPromo && p.discountPriceInReais != null ? p.discountPriceInReais : p.priceInReais
    const { precoPix, pixPercent } = calcPrecoVitrine(
      preco, p.maxInstallments, site, resolvePixPercent(p, categorias, site.pixDiscountPercent))
    return pixPercent > 0 ? { precoPix, pixPercent } : null
  }

  /** "3x de R$ 8,30 no cartão" — null quando o item não parcela (mesma regra da página do produto). */
  function cartaoDoProduto(p: Product): CartaoVitrine {
    const preco = p.isOnPromo && p.discountPriceInReais != null ? p.discountPriceInReais : p.priceInReais
    const { parcelas, valorParcela } = calcPrecoVitrine(preco, p.maxInstallments, site, 0)
    return parcelas >= 2 ? { parcelas, valorParcela } : null
  }

  // Fundo padrão do banner/anúncio quando não há imagem — antes era um navy fixo (#0D1B2A/
  // #112B45) que não respondia a nenhuma personalização. Agora deriva da cor de navbar
  // configurada, então muda junto quando o admin troca a cor em Personalizar Site.
  const bannerGradient = `linear-gradient(135deg, ${site.colorNavy} 0%, ${mixHex(site.colorNavy, '#000000', 0.35)} 100%)`

  // Topo (pedido do Maikon, 14/10): azul do topo, etiqueta e ilustração próprias de Personalizar Site
  const heroGradient = `linear-gradient(135deg, ${mixHex(site.colorHero, '#FFFFFF', 0.10)} 0%, ${site.colorHero} 45%, ${mixHex(site.colorHero, '#000000', 0.38)} 100%)`
  const navBg = mixHex(site.colorHero, '#000000', 0.32)
  // Home que vende — 3 tons: faixa (mais escura, cor no MenuLoja) → menu (navBg) → topo no azul da marca,
  // mais claro à esquerda (atrás do texto) e fechando à direita, como no modelo do Maikon (16/11)
  const heroVende = vitrines
    ? `linear-gradient(120deg, ${PALETA_MAIKON.blue2} 0%, ${PALETA_MAIKON.blue} 50%, ${PALETA_MAIKON.deep} 100%)`
    : `linear-gradient(120deg, ${mixHex(site.colorHero, '#FFFFFF', 0.12)} 0%, ${site.colorHero} 50%, ${mixHex(site.colorHero, '#000000', 0.16)} 100%)`
  // Pedido do Taino (04/11): topo sem o mascote de IA. A logo enviada em Personalizar Site (o mascote)
  // entrava depois que a configuração chegava — a página abria com a nuvem "Santuário Nerd" e trocava.
  // Agora a ilustração do topo é a nuvem fixa (public/logo-santuario.webp), a não ser que se escolha
  // uma "Imagem do topo" própria; a logo enviada continua só no menu.
  // Home que vende: o modelo do Maikon (16/11) tem o mascote à direita — a logo enviada em Personalizar Site.
  // Pra não abrir com a nuvem e trocar, a imagem só aparece (com fade) depois que a configuração chega.
  const heroImagem = vende
    ? site.heroImageUrl || site.logoUrl || '/logo-santuario.webp'
    : uniforme
      ? site.heroImageUrl || '/logo-santuario.webp'
      : site.heroImageUrl || site.logoUrl || '/logo-santuario.webp'

  // Detalhes do modelo do Maikon (14/10): faixa acima do menu, topo arredondado, 3 cartões, chamada
  // "Quero jogar", rodapé no azul e parcelamento no cartão de produto. Vitrine em grade com o botão
  // Sacola. O copyright fica no rodapé geral (components/Footer.tsx).
  const categoriasVitrine = Object.entries(
    vitrine.reduce<Record<string, number>>((acc, p) => { acc[p.category] = (acc[p.category] ?? 0) + 1; return acc }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const avisoTopo = (site.avisoTopo ?? '').trim()
  const faixa     = avisoTopo ? 32 : 0          // altura da faixa (px): empurra menu e topo pra baixo
  const corRodape = uniforme ? navBg : mixHex(site.colorHero, '#000000', 0.45)
  const F = { navy: '#FFFFFF', text: 'rgba(255,255,255,0.72)', blue: '#FFFFFF', border: 'rgba(255,255,255,0.14)' }

  function toggleDark() {
    const next = !isDark
    setIsDark(next)
    setOptionalItem('landing-theme', next ? 'dark' : 'light')
  }

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
        // Lista inteira (o ?campeonato=id da área do cliente pode ser o 9º); a tela mostra só 8
        setChampionships(r.data.filter(c => c.status === 'Planejado' || c.status === 'Inscricoes'))
      ),
      productApi.list().then(r => {
        const visible  = r.data.filter(p => p.isActive && p.stockQuantity > 0 && p.showOnMarketplace !== false)
        const featured = visible.filter(p => p.isFeatured)
        setVitrine([...featured, ...visible.filter(p => !p.isFeatured)])
      }),
      announcementApi.visible().then(r => setAnnouncements(r.data)),
      siteConfigApi.get().then(r => setSite(r.data)).finally(() => setSiteCarregado(true)),
      // Só pra resolver o desconto do Pix da categoria no card/modal de produto.
      categoryApi.list().then(r => setCategorias(r.data)).catch(() => {}),
      // Seção "Mais vendidos" (chave home-vitrines): só a ordem; os produtos saem da vitrine já carregada
      productApi.maisVendidos().then(r => setMaisVendidosIds(r.data)).catch(() => {}),
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
    if (getRole() === 'Customer') setVoltarProCliente(true)
    params.delete('campeonato')
    const query = params.toString()
    window.history.replaceState(null, '', query ? `/?${query}` : '/')
  }, [championships])

  const radius = RADIUS_PRESETS[site.borderRadiusStyle] ?? RADIUS_PRESETS.Padrao

  // Vantagens da loja na home nova — só o que existe de verdade (parcelas vêm de Personalizar Site).
  // Sem "X% OFF no Pix": desde a v1.86.1 o Pix do pedido cobra preço cheio e o desconto só existe
  // quando o Maikon dá na finalização — anunciar aqui prometeria o que o site não cobra.
  const vantagens: { icon: typeof Store; titulo: string; texto: string }[] = [
    ...(site.maxInstallments > 1 ? [{ icon: CreditCard, titulo: `Até ${site.maxInstallments}x no cartão`, texto: 'Parcelado na retirada' }] : []),
    { icon: Store, titulo: 'Retire na loja', texto: site.addressLine || 'Reserve pelo site' },
    { icon: Award, titulo: 'Pontos a cada compra', texto: 'Viram desconto na loja' },
  ]
  // Blocos da home: a chave home-que-vende muda a ORDEM e o que aparece, não o desenho de cada um
  const secCartoes = (
    <>
      {/* ── 3 CARTÕES CURTOS (modelo do Maikon) ────────────────────────── */}
      <section className="px-5 pt-6 max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Package, titulo: 'Produtos para jogar',     texto: 'Cartas e acessórios para seu deck',   href: '/produtos' },
          { icon: Trophy,  titulo: 'Feito para a comunidade', texto: 'Jogue junto, troque ideias e evolua', href: '#eventos' },
          { icon: Heart,   titulo: 'Uma loja de quem joga',   texto: 'Encontre sua próxima aventura TCG',   href: '/liga' },
        ].map(({ icon: Icon, titulo, texto, href }) => (
          <a key={titulo} href={href}
            className="flex items-center gap-3 p-4 rounded-2xl border transition-all hover:translate-y-[-2px]"
            style={{ backgroundColor: C.card, borderColor: C.border }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${C.blue}18` }}>
              <Icon className="w-5 h-5" style={{ color: C.blue }} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black leading-tight" style={{ color: C.navy }}>{titulo}</span>
              <span className="block text-xs mt-0.5" style={{ color: C.text }}>{texto}</span>
            </span>
          </a>
        ))}
      </section>
    </>
  )
  const secAvisos = (
    <>
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
                    <img src={fotoLeve(a.imageUrl, 960)} alt={a.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
    </>
  )
  const secTorneios = (
    <>
      {/* ── TORNEIOS ────────────────────────────────────────────────────── */}
      <section id="eventos" className="py-16 px-5">
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
                <EventCalendar championships={championships.slice(0, 8)} onSelect={c => setRegisterModal(c)} C={C} />
              </div>
              {/* Cards */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
                {championships.slice(0, 8).map(c => (
                  <ChampionshipCard key={c.id} championship={c} onRegister={() => setRegisterModal(c)} C={C} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
  const noTopo = vende ? 9 : 8   // grade de 3 (home que vende) ou 4 colunas, sempre completa no computador
  const secProdutos = (
    <>
      {/* ── PRODUTOS: VITRINE NOVA (grade, sem carrossel parado) ─────────── */}
      <section id="produtos" className={`${vende ? 'pt-8 pb-14' : 'py-16'} px-5`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: C.blue }}>{site.produtosEyebrow}</p>
              <h2 className={`text-2xl md:text-3xl ${vende ? 'lg:text-4xl' : ''} font-black`} style={{ color: C.navy }}>{site.produtosTitle}</h2>
              <p className={`text-sm ${vende ? 'lg:text-base' : ''} mt-1`} style={{ color: C.text }}>Cartas, acessórios e colecionáveis pra sua próxima partida.</p>
            </div>
            {vitrine.length > 0 && (
              <Link href="/produtos" className={`inline-flex items-center gap-1 text-sm ${vende ? 'lg:text-base' : ''} font-black shrink-0 hover:underline`} style={{ color: C.blue }}>
                Ver todos os {vitrine.length} produtos <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {/* Atalhos das categorias com mais itens — levam pra loja já filtrada */}
          {categoriasVitrine.length > 1 && !vende && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' }}>
              {categoriasVitrine.map(([cat, n]) => (
                <Link key={cat} href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full border transition-colors hover:opacity-80"
                  style={{ backgroundColor: C.card, borderColor: C.border, color: C.navy }}>
                  {cat} <span style={{ color: C.text }}>{n}</span>
                </Link>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-14">
              <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: C.blue, borderTopColor: 'transparent' }} />
            </div>
          ) : vitrine.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border" style={{ borderColor: C.border, backgroundColor: C.card }}>
              <Package className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: C.navy }} />
              <p className="font-medium opacity-50" style={{ color: C.navy }}>Produtos em breve.</p>
            </div>
          ) : (
            <>
              {/* Home que vende: 3 colunas no computador (fotos maiores — figures precisam de detalhe) e 9 itens */}
              <div className={`grid grid-cols-2 sm:grid-cols-3 ${vende ? 'gap-3 sm:gap-4 lg:gap-6' : 'lg:grid-cols-4 gap-3 sm:gap-4'}`}>
                {vitrine.slice(0, noTopo).map((p, i) => (
                  // 9º item some no celular (2 colunas): senão sobra um sozinho na última linha
                  <div key={p.id} className={i === 8 ? 'max-sm:hidden flex flex-col' : 'contents'}>
                    <CartaoProduto p={p} C={C} onClick={() => setProductModal(p)}
                      pix={pixDoProduto(p)} cartao={cartaoDoProduto(p)} grande={vende} categoria={rotuloCategoria(p.category, categorias)}
                      onAdd={vende && !p.hasVariants ? () => porNaSacola(p) : undefined} />
                  </div>
                ))}
              </div>
              {vitrine.length > noTopo && (
                <div className="flex justify-center mt-8">
                  <Link href="/produtos"
                    className="inline-flex items-center gap-2 text-sm font-black px-7 py-3 rounded-xl transition-all active:scale-95"
                    style={{ backgroundColor: site.colorHero, color: '#FFFFFF', boxShadow: `0 10px 24px -10px ${site.colorHero}` }}>
                    Ver todos os {vitrine.length} produtos <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  )
  const secVitrineTopo = (
    <>
      {/* ── LOGO ABAIXO DO TOPO: CATEGORIAS + VANTAGENS (home que vende) ── */}
      {/* Com vitrines as categorias saem ("está duplicada, deixa só na segunda página" — Maikon, 17/11) */}
      <section className="px-5 pt-6 max-w-6xl mx-auto">
        {categoriasVitrine.length > 1 && !vitrines && (
          <nav aria-label="Categorias" className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap" style={{ scrollbarWidth: 'none' }}>
            <Link href="/produtos"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm lg:text-base font-black px-4 lg:px-5 py-2.5 lg:py-3 rounded-full transition-all active:scale-95"
              style={{ backgroundColor: site.colorHero, color: '#FFFFFF' }}>
              <ShoppingBag className="w-4 h-4" /> Tudo
            </Link>
            {categoriasVitrine.map(([cat, n]) => (
              <Link key={cat} href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                className="shrink-0 inline-flex items-center gap-1.5 text-sm lg:text-base font-bold px-4 lg:px-5 py-2.5 lg:py-3 rounded-full border transition-colors hover:opacity-80"
                style={{ backgroundColor: C.card, borderColor: C.border, color: C.navy }}>
                {cat} <span className="text-xs lg:text-sm" style={{ color: C.text }}>{n}</span>
              </Link>
            ))}
          </nav>
        )}
        {/* Vantagens: só o que a loja oferece de verdade (parcelas saem de Personalizar Site).
            2 ou 3 itens: no desktop uma coluna por item; no celular o último ímpar ocupa a linha toda */}
        <ul className={`${vitrines ? '' : 'mt-4'} grid grid-cols-2 ${vantagens.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-2 sm:gap-3`}>
          {vantagens.map(({ icon: Icon, titulo, texto }) => (
            <li key={titulo} className="flex items-center gap-3 p-3 lg:p-4 rounded-2xl border min-w-0 max-lg:last:odd:col-span-2" style={{ backgroundColor: C.card, borderColor: C.border }}>
              <span className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${C.blue}18` }}>
                <Icon className="w-[18px] h-[18px] lg:w-[22px] lg:h-[22px]" style={{ color: C.blue }} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] lg:text-base font-black leading-tight" style={{ color: C.navy }}>{titulo}</span>
                <span className="block text-xs lg:text-sm mt-0.5 leading-snug line-clamp-2" style={{ color: C.text }}>{texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
  // ── Home com vitrines (chave home-vitrines) ─────────────────────────────────
  const temCampeonatos = !loading && championships.length > 0
  const proximoCampeonato = [...championships].sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  // Mais vendidos: a ordem vem da API; só entra o que está na vitrine (ativo, com estoque, no site)
  const porId = new Map(vitrine.map(p => [p.id, p]))
  const maisVendidos = maisVendidosIds.map(id => porId.get(id)).filter((p): p is Product => !!p).slice(0, 4)
  // Novidades: cadastrados nos últimos 30 dias (selo "Novo"), os mais novos primeiro
  const novidades = vitrine.filter(p => ehNovidade(p))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4)

  const secAgenda = (
    <>
      {/* ── AGENDA DA COMUNIDADE (modelo do Maikon, 17/11) ─────────────────────
          Aparece sempre: sem campeonato marcado, antes sobrava o bloco branco "Nenhum evento agendado". */}
      <section id="agenda" className="px-5 pt-10 max-w-6xl mx-auto scroll-mt-24">
        {/* Sem a lista de torneios mais abaixo, o #eventos do menu ("Torneios") cai aqui */}
        {!temCampeonatos && <span id="eventos" className="block scroll-mt-24" aria-hidden />}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: C.blue }}>Agenda da comunidade</p>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-black" style={{ color: C.navy }}>Campeonatos &amp; eventos</h2>
            <p className="text-sm lg:text-base mt-1" style={{ color: C.text }}>Acompanhe as novidades da loja e fique por dentro dos próximos encontros.</p>
          </div>
          <span className="self-start md:self-auto inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-full"
            style={{ backgroundColor: mixHex(C.yellow, C.card, isDark ? 0.8 : 0.55), color: isDark ? C.navy : '#5C4500' }}>
            <CalendarDays className="w-4 h-4" /> Horários e inscrições direto com a loja
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4">
          {[
            {
              icon: Trophy, titulo: 'Campeonato semanal', etiqueta: 'Toda semana', cheio: true,
              texto: proximoCampeonato
                ? `Próximo: ${proximoCampeonato.name} — ${dataHoraBR(proximoCampeonato.startDate)}.`
                : 'A próxima rodada, o horário e as informações de inscrição ficam por aqui.',
              cta: 'Ver programação', href: temCampeonatos ? '#eventos' : '/liga',
            },
            { icon: Star, titulo: 'Liga mensal', etiqueta: 'Todo mês', cheio: false,
              texto: 'Acompanhe as etapas, a pontuação e o ranking da temporada.', cta: 'Ver etapas', href: '/liga' },
            { icon: Award, titulo: 'Torneios especiais', etiqueta: 'Fique de olho', cheio: false,
              texto: 'Eventos maiores e campeonatos com premiação, avisados com antecedência.', cta: 'Acompanhar agenda',
              href: temCampeonatos ? '#eventos' : '/liga' },
          ].map(({ icon: Icon, titulo, etiqueta, cheio, texto, cta, href }) => (
            <a key={titulo} href={href}
              className="group flex flex-col gap-3 p-5 lg:p-6 rounded-2xl border transition-all hover:-translate-y-0.5"
              style={cheio
                ? { background: `linear-gradient(140deg, ${PALETA_MAIKON.blue2}, ${PALETA_MAIKON.blue} 55%, ${PALETA_MAIKON.deep})`, borderColor: 'transparent', boxShadow: PALETA_MAIKON.sombra }
                : { backgroundColor: C.card, borderColor: C.border, boxShadow: isDark ? undefined : PALETA_MAIKON.sombra }}>
              <div className="flex items-start justify-between gap-3">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: cheio ? 'rgba(255,255,255,0.16)' : `${C.blue}14` }}>
                  <Icon className="w-5 h-5" style={{ color: cheio ? '#FFFFFF' : C.blue }} />
                </span>
                <span className="text-[10px] lg:text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: PALETA_MAIKON.yellow, color: '#3D2E00' }}>{etiqueta}</span>
              </div>
              <div className="flex-1">
                <p className="text-base lg:text-lg font-black leading-tight" style={{ color: cheio ? '#FFFFFF' : C.navy }}>{titulo}</p>
                <p className="text-sm mt-1 leading-snug" style={{ color: cheio ? 'rgba(255,255,255,0.82)' : C.text }}>{texto}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-black group-hover:gap-2 transition-all"
                style={{ color: cheio ? PALETA_MAIKON.yellow : C.blue }}>
                {cta} <ChevronRight className="w-4 h-4" />
              </span>
            </a>
          ))}
        </div>
      </section>
    </>
  )

  /** Vitrine curta da home (Mais vendidos / Novidades): 2 colunas no celular, 4 no computador. */
  function vitrineCurta(id: string, icone: typeof Flame, eyebrow: string, titulo: string, texto: string, lista: Product[]) {
    if (lista.length === 0) return null
    const Icone = icone
    return (
      <section id={id} className="px-5 pb-14 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: C.blue }}>
                <Icone className="w-3.5 h-3.5" /> {eyebrow}
              </p>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-black" style={{ color: C.navy }}>{titulo}</h2>
              <p className="text-sm lg:text-base mt-1" style={{ color: C.text }}>{texto}</p>
            </div>
            <Link href="/produtos" className="inline-flex items-center gap-1 text-sm lg:text-base font-black shrink-0 hover:underline" style={{ color: C.blue }}>
              Ver todos <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {lista.map(p => (
              <CartaoProduto key={p.id} p={p} C={C} onClick={() => setProductModal(p)}
                pix={pixDoProduto(p)} cartao={cartaoDoProduto(p)} grande categoria={rotuloCategoria(p.category, categorias)}
                onAdd={!p.hasVariants ? () => porNaSacola(p) : undefined} />
            ))}
          </div>
        </div>
      </section>
    )
  }
  const secMaisVendidos = vitrineCurta('mais-vendidos', Flame, 'Os queridinhos da loja', 'Mais vendidos',
    'O que mais saiu no balcão e nas mesas nos últimos 3 meses.', maisVendidos)
  const secNovidades = vitrineCurta('novidades', Sparkles, 'Acabou de chegar', 'Novidades',
    'Produtos que entraram na loja nos últimos 30 dias.', novidades)

  // Sem torneio marcado a seção some na home nova (o "Nenhum evento agendado" só tomava espaço)
  // Com vitrines a agenda fica sempre, então o #eventos sempre tem pra onde ir
  const mostraTorneios = !vende || vitrines || loading || championships.length > 0
  // Sem a seção, os links "Torneios"/"Ver Eventos" do menu (#eventos, ou /#eventos de outra página)
  // não levariam a lugar nenhum: vão pra Liga, como o "Ver campeonatos" do topo (revisão do PR #170)
  useEffect(() => {
    if (mostraTorneios) return
    const irPraLiga = () => { if (window.location.hash === '#eventos') router.replace('/liga') }
    irPraLiga()
    window.addEventListener('hashchange', irPraLiga)
    return () => window.removeEventListener('hashchange', irPraLiga)
  }, [mostraTorneios, router])

  return (
    <div className={`site-shell min-h-screen ${uniforme ? 'home-uniforme' : ''}`} style={{ backgroundColor: C.bg, color: C.navy }}>
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

      {/* ── MENU (o mesmo de Produtos, produto e Sacola — components/loja/MenuLoja) ── */}
      {/* Home que vende: cabeçalho em 3 tons (faixa mais escura, menu, topo no azul da marca) —
          "aqui ficou tudo da mesma cor, eles ficam grudados" (Maikon, 16/11) */}
      <MenuLoja site={site} isDark={isDark} onToggleDark={toggleDark} naHome
        corFaixa={vende || uniforme ? undefined : mixHex(site.colorHero, '#000000', 0.5)} />

      {/* ── HERO + CAROUSEL DE FUNDO ───────────────────────────────────── */}
      <section
        className={`relative pt-16 overflow-hidden rounded-b-[2rem] md:rounded-b-[2.75rem]`}
        style={faixa ? { paddingTop: 64 + faixa } : undefined}
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
                <img src={fotoLeve(banner.imageUrl, 1280)} alt="" className="w-full h-full object-cover" fetchPriority={i === 0 ? 'high' : 'low'} />
              </div>
            ))}
            {/* Overlay escuro — mais forte à esquerda (onde fica o texto do site) e mais
                fraco à direita, pra não apagar o texto que já vem desenhado na imagem do banner */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-black/10" />
          </>
        ) : (
          // Topo inteiro no azul da barra do menu (pedido do Taino, 04/11): sem degradê mais claro embaixo dela
          <div className="absolute inset-0" style={{ background: vende ? heroVende : uniforme ? navBg : heroGradient }}>
            {(!uniforme || vende) && (
              // Anéis de fundo do mockup (também no modelo de 16/11): só decoração, não pegam clique
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
                <div className="absolute -right-24 top-1/2 -translate-y-1/2 w-[34rem] h-[34rem] rounded-full border border-white/10" />
                <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-[24rem] h-[24rem] rounded-full border border-white/10 bg-white/[0.03]" />
                <div className="absolute -left-32 -bottom-40 w-96 h-96 rounded-full bg-white/[0.04] blur-2xl" />
              </div>
            )}
          </div>
        )}

        {/* Conteúdo do hero — por cima do fundo */}
        <div className={`relative z-10 max-w-6xl mx-auto px-5 ${vitrines ? 'py-9 md:py-8' : vende ? 'py-10 md:py-14' : uniforme ? 'py-10 md:py-14' : 'py-20 md:py-24'}`}>
          <div className="flex flex-col items-center gap-8 md:gap-12 md:flex-row">

            {/* Texto à esquerda, arte à direita (no celular a arte sai na home que vende) */}
            <div className="flex-1 text-center md:text-left">
              {site.heroEyebrow && (
                <span className={`inline-flex items-center gap-2 mb-5 px-3 sm:px-3.5 py-1.5 rounded-full border ${vende ? 'text-[11px] sm:text-xs lg:text-sm lg:px-4 lg:py-2' : 'text-[10px] sm:text-[11px] md:text-xs'} font-black uppercase tracking-[0.06em] sm:tracking-[0.14em] whitespace-nowrap`}
                  style={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.10)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: C.yellow }} />
                  {site.heroEyebrow}
                </span>
              )}
              {vende ? (
                // Chamada pra ação no lugar do nome da loja (que já está no menu) — o letreiro do modelo
                // que o Maikon mandou: "fica mais visual, a pessoa vê melhor o que a loja trabalha"
                <h1 className={`${vitrines ? 'text-[2.5rem] sm:text-5xl lg:text-6xl mb-4' : 'text-[2.75rem] sm:text-6xl xl:text-7xl mb-5'} font-black leading-[1.05] tracking-tight max-w-3xl mx-auto md:mx-0`} style={{ color: '#FFFFFF' }}>
                  {/* Quebra depois de "seu", como no modelo (só do tablet pra cima; no celular quebra sozinho) */}
                  {TITULO_VENDE.linha1}<br className="hidden sm:block" />{' '}{TITULO_VENDE.antes}<span style={{ color: C.yellow }}>{TITULO_VENDE.destaque}</span>{TITULO_VENDE.depois}
                </h1>
              ) : (
                <h1 className={`${uniforme ? 'text-4xl md:text-5xl' : 'text-4xl md:text-5xl lg:text-6xl'} font-black mb-4 leading-tight`}>
                  <span style={{ color: C.yellow }}>{heroFirstWord}</span>
                  {heroRest && <>{' '}<span style={{ color: corTituloHero }}>{heroRest}</span></>}
                </h1>
              )}
              <p className={vitrines
                  ? 'text-base sm:text-lg lg:text-xl font-semibold max-w-xl mx-auto md:mx-0 mb-7 leading-relaxed'
                  : vende
                  ? 'text-lg sm:text-xl lg:text-[1.375rem] font-semibold max-w-2xl mx-auto md:mx-0 mb-8 leading-relaxed'
                  : 'text-base md:text-lg max-w-md mb-8 leading-relaxed'}
                style={{ color: vende ? 'rgba(255,255,255,0.92)' : '#ffffff' }}>
                {site.heroSubtitle}
              </p>

              {vende ? (
                // Os dois botões do modelo do Maikon (16/11). Sem torneio marcado a seção de torneios
                // some, então o "Ver campeonatos" leva pra Liga (onde ficam os campeonatos do mês).
                <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                  <Link href="/produtos"
                    className="inline-flex items-center justify-center gap-2 font-black lg:text-lg px-7 py-3.5 rounded-xl transition-all hover:brightness-105 active:scale-95"
                    style={{ backgroundColor: C.yellow, color: site.colorNavy, boxShadow: `0 10px 28px -8px rgba(0,0,0,0.35)` }}>
                    Explorar produtos <span aria-hidden>→</span>
                  </Link>
                  <a href={vitrines ? '#agenda' : championships.length > 0 ? '#eventos' : '/liga'}
                    className="inline-flex items-center justify-center gap-2 font-bold lg:text-lg px-7 py-3.5 rounded-xl border transition-all hover:bg-white/10"
                    style={{ borderColor: 'rgba(255,255,255,0.55)', color: '#FFFFFF' }}>
                    Ver campeonatos
                  </a>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                  <a href="#eventos"
                    className="inline-flex items-center justify-center gap-2 font-black px-7 py-3.5 rounded-xl transition-all active:scale-95"
                    style={{ backgroundColor: C.yellow, color: site.colorNavy, boxShadow: `0 8px 28px rgba(255,228,94,0.22)` }}>
                    <Trophy className="w-5 h-5" /> {site.ctaVerTorneiosLabel} →
                  </a>
                  <Link href="/produtos"
                    className="inline-flex items-center justify-center gap-2 font-semibold px-7 py-3.5 rounded-xl border transition-all hover:border-white/30 hover:text-white"
                    style={{ borderColor: 'rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.85)' }}>
                    <ShoppingBag className="w-5 h-5" /> {site.ctaVerProdutosLabel}
                  </Link>
                </div>
              )}
            </div>

            {/* Logo principal — usa a logo configurada em Personalizar Site; sem uma, mantém o
                arquivo padrão original pra não quebrar o visual de quem nunca configurou nada. */}
            {/* Home que vende: o mascote (logo de Personalizar Site) à direita, como no modelo; no celular ele
                sai (empurrava os produtos 1 tela e meia pra baixo). O "rostinho" que saiu em 16/11 era o do menu. */}
            {/* Com vitrines a arte tem 390px de altura: "com 448 o banner fica muito grande" (Maikon, 17/11) */}
            <div className={`relative shrink-0 w-full ${vitrines
              ? 'hidden md:flex md:max-w-[17rem] lg:max-w-[26rem] h-[20rem] lg:h-[390px] items-center justify-center'
              : vende ? 'hidden md:flex md:max-w-[16rem] lg:max-w-[20rem] h-[22rem] lg:h-[28rem] items-center justify-center' : 'max-w-xs sm:max-w-sm md:max-w-md'}`}>
              {(!vende || siteCarregado) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoLeve(heroImagem, 960) ?? heroImagem}
                  alt={site.siteName}
                  className={`object-contain drop-shadow-[0_16px_48px_rgba(0,0,0,0.5)] ${vende ? 'w-full h-full animate-fade-in' : uniforme ? 'w-full h-auto max-h-[min(52vh,24rem)]' : 'w-full h-auto'}`}
                />
              )}
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

      {vitrines
        // Modelo do Maikon de 17/11: cartões e agenda logo abaixo do topo, depois vantagens e as vitrines
        ? <>{secCartoes}{secAgenda}{secVitrineTopo}{secProdutos}{secMaisVendidos}{secNovidades}{secAvisos}{temCampeonatos && secTorneios}</>
        : vende
        ? <>{secVitrineTopo}{secProdutos}{secAvisos}{mostraTorneios && secTorneios}</>
        : <>{secCartoes}{secAvisos}{secTorneios}{secProdutos}</>}

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

      {/* ── CHAMADA "QUERO JOGAR" (modelo do Maikon) ──────────────────────── */}
      <section className="px-5 pb-16">
        <div className="max-w-6xl mx-auto rounded-2xl border p-6 md:px-8 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left"
          style={{ backgroundColor: mixHex(C.yellow, C.card, isDark ? 0.86 : 0.72), borderColor: `${C.yellow}66` }}>
          <div>
            <h2 className={`${uniforme ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'} font-black leading-tight`} style={{ color: C.navy }}>
              Partidas, amizades e muita diversão 💛
            </h2>
            <p className="text-sm mt-1.5" style={{ color: isDark ? C.text : mixHex(C.navy, '#FFFFFF', 0.2) }}>
              Conheça os campeonatos semanais e faça parte da comunidade do {site.siteName}.
            </p>
          </div>
          <a href={mostraTorneios ? '#eventos' : '/liga'}
            className="shrink-0 inline-flex items-center gap-2 font-black text-sm px-6 py-3 rounded-xl transition-all active:scale-95"
            style={{ backgroundColor: site.colorHero, color: '#FFFFFF', boxShadow: `0 10px 24px -10px ${site.colorHero}` }}>
            Quero jogar →
          </a>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      {/* Rodapé no azul do topo; as cores do texto vêm de F */}
      <footer className="pt-8 pb-6 px-5" style={{ backgroundColor: corRodape }}>
        <div className="max-w-6xl mx-auto">
          {/* Linha principal */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              {/* Visual novo: sem o logo (é o mascote de IA), igual ao menu */}
              {!uniforme && <img src={site.logoUrl || '/logo-maikon-128.png'} alt={site.siteName} className="h-8 w-auto object-contain" />}
              <div>
                <p className="font-black text-sm leading-tight" style={{ color: F.navy }}>{site.siteName}</p>
                <p className="text-[10px]" style={{ color: F.text }}>{site.addressLine}</p>
              </div>
            </div>

            {/* Contato */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {site.whatsappNumber?.trim() && (
              <a href={`https://wa.me/${site.whatsappNumber}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: '#25D366' }}>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {formatWhatsapp(site.whatsappNumber)}
              </a>
              )}

              <a href={`mailto:${site.contactEmail}`}
                className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: F.blue }}>
                <Mail className="w-4 h-4 shrink-0" />
                {site.contactEmail}
              </a>

              <Link href="/lgpd"
                className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                style={{ color: F.text }}>
                <Shield className="w-3.5 h-3.5 shrink-0" />
                LGPD &amp; Privacidade
              </Link>
            </div>

            <Link href="/login"
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ color: F.text }}>
              <CreditCard className="w-3.5 h-3.5" /> Área do Admin
            </Link>
          </div>

        </div>
      </footer>

      {/* ── WHATSAPP FLUTUANTE ──────────────────────────────────────────────
           bottom-20, não bottom-6: o botão do VLibras fica em bottom:10px com
           40px de altura e z-index 2147483639, então em bottom-6 os dois se
           cruzavam num quadrado de 26px e a mão cobria a ponta deste botão.
           Quem sobe é este, não o VLibras: acessibilidade tem canto escolhido
           pelo usuário nas preferências, e o plugin vive em Shadow DOM. */}
      {site.whatsappNumber?.trim() && (
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
      )}

      {/* Aviso depois do "+ Sacola" — com atalho pra Sacola */}
      <AvisoSacola nome={naSacola} />

      {/* ── MODAIS ──────────────────────────────────────────────────────── */}
      {annModal      && <AnnouncementModal ann={annModal}               onClose={() => setAnnModal(null)}      C={C} />}
      {productModal  && <ProductModal      product={productModal}       onClose={() => setProductModal(null)}  C={C} pix={pixDoProduto(productModal)} />}
      {registerModal && <RegisterModal     championship={registerModal} onClose={() => { setRegisterModal(null); if (voltarProCliente) router.replace('/cliente') }} C={C} whatsapp={site.whatsappNumber} contactPersonName={site.contactPersonName} />}
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
          <img src={fotoLeve(c.imageUrl, 640)} alt={c.name} loading="lazy" decoding="async"
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
            {brl((c.entryFeeInCents / 100))}
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
          <img src={fotoLeve(ann.imageUrl, 960)} alt={ann.title} className="w-full max-h-64 object-cover" />
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
                    style={{ backgroundColor: '#1E4FD6', color: '#fff' }}>Pré-venda</span>
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
                    {brl(p.discountPriceInReais)}
                  </span>
                  <span className="text-sm line-through mb-0.5" style={{ color: C.text }}>
                    {brl(p.priceInReais)}
                  </span>
                </div>
              ) : (
                <span className="text-3xl font-black" style={{ color: C.yellow }}>
                  {brl(p.priceInReais)}
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
  // 'form' → escolhe deck | 'pagar' → vaga firme (gratuito ou Pix confirmado) | 'pix' → QR obrigatório
  const [etapa,        setEtapa]        = useState<'form' | 'pagar' | 'pix'>('form')
  const [pix,          setPix]          = useState<PixCobrancaDto | null>(null)
  const [copiado,      setCopiado]      = useState(false)
  // Prazo da vaga e relógio de 1s: sem ver a contagem, o jogador não sabe que a
  // reserva tem hora pra vencer e some da lista sem entender o motivo.
  const [expiraEm,     setExpiraEm]     = useState<string | null>(null)
  const [agora,        setAgora]        = useState(() => Date.now())
  const [conferindo,   setConferindo]   = useState(false)
  const [aviso,        setAviso]        = useState<string | null>(null)
  const [pago,         setPago]         = useState(false)
  // Numero do jogador: e a prova, pro cliente, de que a cobranca esta no nome dele.
  const [numeroJogador, setNumeroJogador] = useState<number | null>(null)

  const isLoggedIn = getRole() === 'Customer' || getRole() === 'Admin'
  const temTaxa    = championship.entryFeeInCents > 0
  const taxaFmt    = `${brl((championship.entryFeeInCents / 100))}`

  useEffect(() => {
    if (!isLoggedIn || !championship.game) return
    deckApi.list(championship.game).then(r => setDecks(r.data)).catch(() => {})
  }, [isLoggedIn, championship.game])

  const restante = expiraEm ? new Date(expiraEm).getTime() - agora : null
  const venceu   = restante !== null && restante <= 0

  // Relógio da contagem. Só corre na etapa do Pix e enquanto sobra tempo.
  useEffect(() => {
    if (etapa !== 'pix' || !expiraEm || venceu) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [etapa, expiraEm, venceu])

  /** Pergunta ao banco se a taxa caiu. `manual` = veio do botão "Já paguei". */
  const conferirPagamento = useCallback(async (manual: boolean) => {
    if (manual) { setConferindo(true); setAviso(null) }
    try {
      const { data } = await championshipApi.verificarPixInscricao(championship.id)
      if (data.status === 'CONCLUIDA') {
        setPago(true)
        setEtapa('pagar')
        return true
      }
      if (manual) setAviso('O pagamento ainda não apareceu no banco. Se você acabou de pagar, aguarde alguns segundos — a confirmação também chega sozinha.')
    } catch (err: unknown) {
      if (manual) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        setAviso(msg ?? 'Não deu pra conferir agora. Tente de novo em instantes.')
      }
    } finally {
      if (manual) setConferindo(false)
    }
    return false
  }, [championship.id])

  // Enquanto o QR está na tela, confere sozinho a cada 6s — o robô do servidor só
  // roda de 5 em 5 minutos, e ninguém fica olhando um QR por 5 minutos.
  useEffect(() => {
    if (etapa !== 'pix') return
    const id = setInterval(() => { conferirPagamento(false) }, 6000)
    return () => clearInterval(id)
  }, [etapa, conferirPagamento])

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
        setExpiraEm(data.participant?.inscricaoExpiraEm ?? null)
        setNumeroJogador(data.participant?.playerNumber ?? null)
        setAgora(Date.now())
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
            {/* Quando, quanto e quantas vagas: a janela só mostrava o nome (teste do fluxo, 06/11) */}
            <p className="text-xs font-bold mt-1.5" style={{ color: C.navy }}>
              {dataHoraBR(championship.startDate)}
              {' · '}{temTaxa ? taxaFmt : 'Grátis'}
              {championship.maxParticipants
                ? (() => {
                    const livres = Math.max(0, championship.maxParticipants - (championship.participantCount ?? 0))
                    return ` · ${livres} ${livres === 1 ? 'vaga livre' : 'vagas livres'} de ${championship.maxParticipants}`
                  })()
                : ''}
            </p>
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
              <p className="font-black mb-1" style={{ color: C.navy }}>
                {pago ? 'Pagamento confirmado!' : 'Vaga garantida!'}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                {pago
                  ? <>Sua inscrição em <strong>{championship.name}</strong> está confirmada — a vaga é sua.</>
                  : <>Você já está inscrito em <strong>{championship.name}</strong>.</>}
              </p>
              <p className="text-sm mt-2 font-bold" style={{ color: C.navy }}>
                {getUserName() || 'Sua conta'}
                {numeroJogador !== null && <> · jogador <span style={{ color: C.blue }}>#{numeroJogador}</span></>}
              </p>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: C.text }}>
                Confira quando quiser em <a href="/cliente" className="underline font-bold">Meus Campeonatos</a>.
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
            {/* Quem paga precisa ver que a cobranca esta no nome dele — sem isso a
                sensacao e de ter mandado um Pix solto pra loja. */}
            <div className="rounded-xl px-4 py-3 border text-center"
              style={{ borderColor: C.border, backgroundColor: C.cardAlt }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.text }}>
                Inscrição de
              </p>
              <p className="font-black text-sm mt-0.5" style={{ color: C.navy }}>
                {getUserName() || 'sua conta'}
                {numeroJogador !== null && (
                  <span style={{ color: C.blue }}> · jogador #{numeroJogador}</span>
                )}
              </p>
            </div>
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
            {restante !== null && (
              <div className="rounded-xl px-4 py-3 text-center border"
                style={venceu
                  ? { color: '#b91c1c', borderColor: 'rgba(185,28,28,0.25)', backgroundColor: 'rgba(185,28,28,0.06)' }
                  : { color: '#B45309', borderColor: 'rgba(180,83,9,0.25)',  backgroundColor: 'rgba(180,83,9,0.06)' }}>
                {venceu ? (
                  <p className="text-xs font-bold leading-relaxed">
                    O prazo acabou e a vaga voltou pro público. Pagar ainda vale a inscrição
                    se o campeonato não tiver lotado — na dúvida, fale com {contactPersonName}.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">Sua vaga está guardada por</p>
                    <p className="text-2xl font-black tabular-nums leading-tight my-0.5">{fmtRestante(restante)}</p>
                    <p className="text-[11px] font-medium">
                      Pague dentro do prazo pra confirmar. Depois disso a vaga volta pro público.
                    </p>
                  </>
                )}
              </div>
            )}

            {aviso && (
              <p className="text-xs text-center leading-relaxed px-3 py-2 rounded-xl border"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.cardAlt }}>
                {aviso}
              </p>
            )}

            <button onClick={() => conferirPagamento(true)} disabled={conferindo}
              className="w-full flex items-center justify-center gap-2 font-black py-3 rounded-xl border transition-all active:scale-95 disabled:opacity-60"
              style={{ color: C.navy, borderColor: C.border }}>
              {conferindo
                ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 62.8" /></svg>
                : <CheckCircle className="w-4 h-4" />
              }
              {conferindo ? 'Conferindo com o banco...' : 'Já paguei'}
            </button>

            <p className="text-xs text-center leading-relaxed" style={{ color: C.text }}>
              Não precisa apertar nada: esta tela confere sozinha e avisa quando o pagamento cair.
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
