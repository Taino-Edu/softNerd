'use client'
// Cartão de produto da vitrine nova (chave "vitrine-nova", v1.48.0) — usado na home e em /produtos.
// Desenho do modelo do Maikon: área da foto com fundo suave, selo, categoria, nome, preço grande,
// parcelamento no cartão, preço no Pix e um botão "Ver produto". Só mostra dado que existe de
// verdade (nada de estrela de avaliação inventada); "Últimas N" sai do estoque mínimo do produto.
import Link from 'next/link'
import { Package, ChevronRight } from 'lucide-react'
import type { Product } from '@/lib/api'
import { brl } from '@/lib/format'
import { fotoLeve } from '@/lib/fotoLeve'

export type CoresVitrine = {
  card: string; cardAlt: string; border: string
  navy: string; text: string; blue: string; pix: string; yellow: string
}

export type PixVitrine    = { precoPix: number; pixPercent: number } | null
export type CartaoVitrine = { parcelas: number; valorParcela: number } | null

function pct(v: number) { return `${(Math.round(v * 10) / 10).toString().replace('.', ',')}%` }

/** Selo do canto da foto: pré-venda > promoção > destaque. */
function Selo({ p }: { p: Product }) {
  const [texto, fundo, cor] =
    p.isPreVenda ? ['Pré-venda', '#7C3AED', '#FFFFFF']
    : p.isOnPromo ? ['Promoção', '#EF4444', '#FFFFFF']
    : p.isFeatured ? ['Destaque', '#FFE45E', '#3D2E00']
    : [null, '', '']
  if (!texto) return null
  return (
    <span className="absolute top-3 left-3 z-10 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm"
      style={{ backgroundColor: fundo, color: cor }}>
      {texto}
    </span>
  )
}

export default function CartaoProduto({ p, C, pix, cartao, href, onClick }: {
  p: Product
  C: CoresVitrine
  pix: PixVitrine
  cartao: CartaoVitrine
  /** Com href vira link (página /produtos); com onClick abre a espiada (home). */
  href?: string
  onClick?: () => void
}) {
  const promo   = p.isOnPromo && p.discountPriceInReais != null
  const preco   = promo ? p.discountPriceInReais! : p.priceInReais
  // "Últimas N" segue o estoque mínimo de cada produto (isLowStock do servidor), não um número fixo
  const ultimas = p.stockQuantity > 0 && p.isLowStock

  const conteudo = (
    <>
      <Selo p={p} />
      {/* Foto: fundo suave com um círculo de enfeite, foto inteira (object-contain) */}
      <div className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: C.cardAlt }}>
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-60 pointer-events-none" aria-hidden
          style={{ backgroundColor: C.card }} />
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={fotoLeve(p.imageUrl, 480)} alt={p.name} loading="lazy" decoding="async"
              className="relative w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105" />
          : <div className="relative w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 opacity-20" style={{ color: C.navy }} />
            </div>}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider truncate" style={{ color: C.blue }}>{p.category}</p>
        <h3 className="mt-1 text-sm font-black leading-snug line-clamp-2" style={{ color: C.navy }}>{p.name}</h3>

        <div className="mt-auto pt-3">
          {promo && (
            <span className="block text-[11px] line-through" style={{ color: C.text }}>{brl(p.priceInReais)}</span>
          )}
          <span className="block text-lg font-black leading-tight" style={{ color: promo ? '#E11D48' : C.navy }}>
            {brl(preco)}
          </span>
          {cartao && (
            <span className="block text-[11px] mt-0.5" style={{ color: C.text }}>
              {cartao.parcelas}x de {brl(cartao.valorParcela)} no cartão
            </span>
          )}
          {pix && (
            <span className="block text-[11px] font-bold" style={{ color: C.pix }}>
              {brl(pix.precoPix)} no Pix · {pct(pix.pixPercent)} OFF
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {/* No celular (2 colunas) só aparece o "Últimas N"; o "Em estoque" fica pro PC */}
          <span className={`text-[11px] font-semibold ${ultimas ? '' : 'hidden sm:inline'}`} style={{ color: ultimas ? '#E11D48' : C.text }}>
            {ultimas ? `Últimas ${p.stockQuantity}!` : 'Em estoque'}
          </span>
          <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-black px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap"
            style={{ backgroundColor: `${C.blue}1A`, color: C.blue }}>
            Ver<span className="hidden sm:inline">&nbsp;produto</span> <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </>
  )

  const classe = 'group relative text-left rounded-2xl overflow-hidden border flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(15,27,51,0.35)]'
  const estilo = { backgroundColor: C.card, borderColor: C.border }

  return href
    ? <Link href={href} className={classe} style={estilo}>{conteudo}</Link>
    : <button type="button" onClick={onClick} className={classe} style={estilo}>{conteudo}</button>
}
