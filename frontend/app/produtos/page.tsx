'use client'
import { useEffect, useState, useMemo } from 'react'
import { productApi, Product } from '@/lib/api'
import Link from 'next/link'
import {
  Package, ShoppingBag, ChevronLeft,
  Sun, Moon, Search, Tag,
} from 'lucide-react'

const NAVY = '#0C3D5A'

type Theme = { bg: string; card: string; border: string; blue: string; yellow: string; text: string; navy: string; muted: string }

function fmt(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

function ProductBadge({ p }: { p: Product }) {
  if (p.isPreVenda) return (
    <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded z-10"
      style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Pré-venda</span>
  )
  if (p.isOnPromo) return (
    <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded z-10"
      style={{ backgroundColor: '#EF4444', color: '#fff' }}>Promoção</span>
  )
  return null
}

function ProductCard({ p, C }: { p: Product; C: Theme }) {
  return (
    <Link
      href={`/produtos/${p.id}`}
      className="relative text-left rounded-2xl overflow-hidden border transition-all hover:scale-[1.02] active:scale-95 flex flex-col"
      style={{ backgroundColor: C.card, borderColor: C.border }}
    >
      <ProductBadge p={p} />
      <div className="w-full aspect-square overflow-hidden flex items-center justify-center p-3"
        style={{ backgroundColor: C.bg }}>
        {p.imageUrl
          ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
          : <Package className="w-10 h-10 opacity-20" style={{ color: C.blue }} />
        }
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-xs font-bold leading-snug line-clamp-2 flex-1" style={{ color: C.navy }}>{p.name}</p>
        <div className="flex items-center justify-between mt-1 gap-1">
          {p.isOnPromo && p.discountPriceInReais != null ? (
            <div className="flex flex-col">
              <span className="text-[10px] line-through" style={{ color: C.muted }}>
                {fmt(p.priceInReais)}
              </span>
              <span className="text-sm font-black" style={{ color: '#EF4444' }}>
                {fmt(p.discountPriceInReais)}
              </span>
            </div>
          ) : (
            <span className="text-sm font-black" style={{ color: C.blue }}>{fmt(p.priceInReais)}</span>
          )}
          <span className="text-[10px]" style={{ color: C.muted }}>
            {p.stockQuantity > 0 ? `${p.stockQuantity} un.` : 'Esgotado'}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [isDark,   setIsDark]   = useState(false)

  const C: Theme = isDark ? {
    bg: '#121215', card: '#1A1A1F', border: 'rgba(255,255,255,0.07)',
    blue: '#3EC2F2', yellow: '#FFE45E', text: 'rgba(255,255,255,0.60)', navy: '#FFFFFF', muted: 'rgba(255,255,255,0.35)',
  } : {
    bg: '#EBF7FD', card: '#FFFFFF', border: 'rgba(12,61,90,0.10)',
    blue: '#3EC2F2', yellow: '#FFE45E', text: '#4D8FAC', navy: '#0C3D5A', muted: '#9CA3AF',
  }

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'dark') setIsDark(true)
    productApi.list()
      .then(r => setProducts(r.data.filter(p => p.isActive && p.stockQuantity > 0 && p.showOnMarketplace !== false)))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      const matchCat = catFilter ? p.category === catFilter : true
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [products, search, catFilter])

  const grouped = useMemo(() => {
    if (catFilter) return { [catFilter]: filtered }
    return categories.reduce<Record<string, Product[]>>((acc, cat) => {
      const items = filtered.filter(p => p.category === cat)
      if (items.length) acc[cat] = items
      return acc
    }, {})
  }, [filtered, categories, catFilter])

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>

      {/* Navbar */}
      <nav className="fixed inset-x-0 top-0 z-50 h-14 flex items-center px-5 gap-4"
        style={{ backgroundColor: '#0F3460', backdropFilter: 'blur(16px)' }}>
        <Link href="/" className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
          style={{ color: '#ffffff' }}>
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Início</span>
        </Link>
        <div className="flex-1 flex justify-center">
          <span className="font-black text-lg" style={{ color: '#ffffff' }}>Loja</span>
        </div>
        <button onClick={() => {
          const next = !isDark
          setIsDark(next)
          localStorage.setItem('landing-theme', next ? 'dark' : 'light')
        }} className="p-2 rounded-xl hover:bg-white/10 transition-colors" style={{ color: '#ffffff' }}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-5 pt-20 pb-16">

        {/* Busca */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
          <input
            className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm focus:outline-none transition-all"
            style={{ backgroundColor: C.card, borderColor: C.border, color: C.navy }}
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filtro de categorias */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-8" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setCatFilter(null)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all"
              style={!catFilter
                ? { backgroundColor: C.blue, borderColor: C.blue, color: '#fff' }
                : { backgroundColor: C.card, borderColor: C.border, color: C.text }}>
              <Tag className="w-3 h-3" /> Todos
            </button>
            {categories.map(cat => (
              <button key={cat}
                onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                className="shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all"
                style={catFilter === cat
                  ? { backgroundColor: C.blue, borderColor: C.blue, color: '#fff' }
                  : { backgroundColor: C.card, borderColor: C.border, color: C.text }}>
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Produtos */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: C.blue, borderTopColor: 'transparent' }} />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: C.navy }} />
            <p className="font-bold opacity-40" style={{ color: C.navy }}>Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.entries(grouped).map(([cat, items]) => (
              <section key={cat}>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-lg font-black" style={{ color: C.navy }}>{cat}</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ backgroundColor: C.blue + '22', color: C.blue }}>
                    {items.length}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {items.map(p => (
                    <ProductCard key={p.id} p={p} C={C} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
