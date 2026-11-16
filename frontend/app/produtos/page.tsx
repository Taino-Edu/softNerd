'use client'
// Loja (/produtos): barra com a marca e a Sacola (carrinho de reserva), título "Todos os produtos" e
// o cartão de produto (components/loja/CartaoProduto). ?categoria=X abre já filtrado (atalhos da home).
import MenuLoja from '@/components/loja/MenuLoja'
import { useEffect, useState, useMemo } from 'react'
import { productApi, siteConfigApi, categoryApi, Product, ProductCategory, SiteConfigDto } from '@/lib/api'
import { resolvePixPercent, calcPrecoVitrine } from '@/lib/precoVitrine'
import { setOptionalItem } from '@/lib/cookieConsent'
import {
  ShoppingBag,
  Search, Tag,
} from 'lucide-react'
import { mixHex } from '@/lib/colors'
import CartaoProduto, { rotuloCategoria } from '@/components/loja/CartaoProduto'
import AvisoSacola, { usePorNaSacola } from '@/components/loja/AvisoSacola'
import { useFuncionalidade } from '@/lib/useFuncionalidade'

type Theme = { bg: string; card: string; border: string; blue: string; yellow: string; text: string; navy: string; muted: string; pix: string }

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [isDark,   setIsDark]   = useState(false)
  const [siteCfg,    setSiteCfg]    = useState<SiteConfigDto | null>(null)
  const [categorias, setCategorias] = useState<ProductCategory[]>([])
  // "+ Sacola" no cartão junto com a home nova (chave home-que-vende)
  const vende = useFuncionalidade('home-que-vende') !== false
  const { porNaSacola, nome: naSacola } = usePorNaSacola()

  // pix: tom fechado no claro e aberto no escuro, pra manter contraste nos dois temas
  const C: Theme = isDark ? {
    bg: '#121215', card: '#1A1A1F', border: 'rgba(255,255,255,0.07)',
    blue: '#3EC2F2', yellow: '#FFE45E', text: 'rgba(255,255,255,0.60)', navy: '#FFFFFF', muted: 'rgba(255,255,255,0.35)',
    pix: '#2DD4BF',
  } : {
    bg: '#EBF7FD', card: '#FFFFFF', border: 'rgba(12,61,90,0.10)',
    blue: '#3EC2F2', yellow: '#FFE45E', text: '#4D8FAC', navy: '#0C3D5A', muted: '#9CA3AF',
    pix: '#00806D',
  }

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'dark') setIsDark(true)
    // Atalho de categoria vindo da home (/produtos?categoria=Pokémon)
    const params = new URLSearchParams(window.location.search)
    const cat = params.get('categoria')
    if (cat) setCatFilter(cat)
    // Busca feita no topo da home (/produtos?busca=booster)
    const q = params.get('busca')
    if (q) setSearch(q.slice(0, 80))
    productApi.list()
      .then(r => setProducts(r.data.filter(p => p.isActive && p.stockQuantity > 0 && p.showOnMarketplace !== false)))
      .finally(() => setLoading(false))

    // Aviso do Pix na vitrine: falhou, os cards seguem sem a linha (não trava a listagem).
    siteConfigApi.get().then(r => setSiteCfg(r.data)).catch(() => {})
    categoryApi.list().then(r => setCategorias(r.data)).catch(() => {})
  }, [])

  /** Pix e cartão no formato do cartão novo (null = a linha some). */
  function precosNovos(p: Product) {
    if (!siteCfg) return { pix: null, cartao: null }
    const preco = p.isOnPromo && p.discountPriceInReais != null ? p.discountPriceInReais : p.priceInReais
    const v = calcPrecoVitrine(preco, p.maxInstallments, siteCfg, resolvePixPercent(p, categorias, siteCfg.pixDiscountPercent))
    return {
      pix: v.pixPercent > 0 ? { precoPix: v.precoPix, pixPercent: v.pixPercent } : null,
      cartao: v.parcelas >= 2 ? { parcelas: v.parcelas, valorParcela: v.valorParcela } : null,
    }
  }

  const corTopo = siteCfg?.colorHero ?? '#1E4FD6'
  const CN = {
    card: C.card, cardAlt: isDark ? '#1E1E24' : mixHex(C.card, C.blue, 0.06), border: C.border,
    navy: C.navy, text: isDark ? C.text : '#5B6B84', blue: isDark ? C.blue : corTopo, pix: C.pix, yellow: C.yellow,
  }

  const categories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products])

  const filtered = useMemo(() => {
    // Sem acento e sem maiúscula: "pokemon" acha "Pokémon"
    const q = semAcento(search.trim())
    return products.filter(p => {
      const matchCat = catFilter ? p.category === catFilter : true
      const matchSearch = !q || semAcento(p.name).includes(q) || semAcento(p.category).includes(q)
      return matchCat && matchSearch
    })
  }, [products, search, catFilter])

  // Lista de [categoria, itens] — não objeto: a categoria pode vir do endereço (?categoria=)
  // e nunca deve virar nome de propriedade (CodeQL: remote property injection)
  const grouped = useMemo<[string, Product[]][]>(() => {
    if (catFilter) return filtered.length ? [[catFilter, filtered]] : []
    return categories
      .map((cat): [string, Product[]] => [cat, filtered.filter(p => p.category === cat)])
      .filter(([, items]) => items.length > 0)
  }, [filtered, categories, catFilter])

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>

      {/* Menu do site, igual ao da página principal (components/loja/MenuLoja) */}
      <MenuLoja site={siteCfg} isDark={isDark} espaco onToggleDark={() => {
        const next = !isDark
        setIsDark(next)
        setOptionalItem('landing-theme', next ? 'dark' : 'light')
      }} />

      <div className={`max-w-6xl mx-auto px-5 pb-16 pt-8`}>

        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: CN.blue }}>Catálogo completo</p>
          <h1 className={`text-3xl md:text-4xl ${vende ? 'lg:text-5xl' : ''} font-black`} style={{ color: C.navy }}>Todos os produtos</h1>
          <p className={`text-sm ${vende ? 'lg:text-base' : ''} mt-1`} style={{ color: CN.text }}>
            Busque e filtre pra achar o que precisa pra próxima partida{products.length ? ` — ${products.length} itens em estoque` : ''}.
          </p>
        </div>

        {/* Catálogo (modelo do Maikon, 16/11): filtros à esquerda e busca à direita na mesma linha no
            computador; no celular a busca vem em cima. Chave desligada: busca e filtros um embaixo do outro. */}
        <div className={vende ? 'flex flex-col lg:flex-row-reverse lg:items-center gap-3 lg:gap-6 mb-8' : ''}>
          {/* Busca */}
          <div className={vende ? 'relative lg:w-80 shrink-0' : 'relative mb-6'}>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
            <input
              className={`w-full pl-10 pr-4 py-3 rounded-2xl border text-sm ${vende ? 'lg:text-base shadow-sm' : ''} focus:outline-none transition-all`}
              style={{ backgroundColor: C.card, borderColor: C.border, color: C.navy }}
              placeholder={vende ? 'Buscar na loja…' : 'Buscar produto...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filtro de categorias */}
          {categories.length > 1 && (
            <div className={vende ? 'flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1' : 'flex gap-2 overflow-x-auto pb-2 mb-8'} style={{ scrollbarWidth: 'none' }}>
              {[null, ...categories].map(cat => {
                const ativo = catFilter === cat
                return (
                  <button key={cat ?? 'todos'}
                    onClick={() => setCatFilter(cat === null || catFilter === cat ? null : cat)}
                    className={vende
                      ? 'shrink-0 text-sm font-bold px-4 lg:px-5 py-2 lg:py-2.5 rounded-full border transition-all hover:-translate-y-px'
                      : `shrink-0 ${cat === null ? 'flex items-center gap-1.5' : ''} text-xs font-bold px-3.5 py-2 rounded-xl border transition-all`}
                    style={ativo
                      ? { backgroundColor: CN.blue, borderColor: CN.blue, color: '#fff', boxShadow: vende ? `0 8px 18px -10px ${CN.blue}` : undefined }
                      : { backgroundColor: C.card, borderColor: C.border, color: vende ? C.navy : C.text }}>
                    {cat === null ? <>{!vende && <Tag className="w-3 h-3" />} Todos</> : cat}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Produtos */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: C.blue, borderTopColor: 'transparent' }} />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: C.navy }} />
            <p className="font-bold opacity-40" style={{ color: C.navy }}>Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Catálogo: uma grade só, na ordem das categorias (os filtros de cima separam); antes, um bloco
                por categoria — com 1 ou 2 itens em cada sobrava a linha quase vazia */}
            {(vende ? [['', grouped.flatMap(([, items]) => items)] as [string, Product[]]] : grouped).map(([cat, items]) => (
              <section key={cat || 'todos'}>
                {cat && <div className="flex items-center gap-3 mb-5">
                  <h2 className={`text-lg ${vende ? 'lg:text-2xl' : ''} font-black`} style={{ color: C.navy }}>{cat}</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ backgroundColor: C.blue + '22', color: C.blue }}>
                    {items.length}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
                </div>}
                  {/* Catálogo (home-que-vende): 3 colunas no computador e cartão grande — fotos maiores (Maikon, 16/11) */}
                  <div className={`grid grid-cols-2 sm:grid-cols-3 ${vende ? 'gap-3 sm:gap-4 lg:gap-6' : 'lg:grid-cols-4 gap-3 sm:gap-4'}`}>
                    {items.map(p => {
                      const { pix, cartao } = precosNovos(p)
                      return <CartaoProduto key={p.id} p={p} C={CN} pix={pix} cartao={cartao} href={`/produtos/${p.id}`} grande={vende} categoria={rotuloCategoria(p.category, categorias)}
                        onAdd={vende && !p.hasVariants ? () => porNaSacola(p) : undefined} />
                    })}
                  </div>
                
              </section>
            ))}
          </div>
        )}
      </div>

      <AvisoSacola nome={naSacola} />
    </div>
  )
}
