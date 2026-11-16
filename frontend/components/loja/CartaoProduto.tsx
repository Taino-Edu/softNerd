'use client'
// Cartão de produto da vitrine — usado na home, em /produtos e no "Você também pode gostar".
//
// Dois desenhos:
//  - Cartão (chave home-que-vende desligada): o modelo do Maikon de 14/10 — foto com fundo suave, selo,
//    categoria, nome, preço, parcelas, Pix e "Ver produto".
//  - CartaoCatalogo (grande = chave ligada): o modelo de catálogo que o Maikon mandou em 16/11 — fundo da
//    foto colorido pelo selo, selo amarelo, "CATEGORIA · SUBCATEGORIA", descrição curta, "X% OFF no Pix"
//    e o botão "Adicionar" suave. Estrela de avaliação e coração de favorito do modelo ficam de fora:
//    a loja não tem avaliações nem favoritos (nada de dado inventado).
// "Últimas N" sai do estoque mínimo do produto.
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Package, ChevronRight, Plus, Check } from 'lucide-react'
import type { Product, ProductCategory } from '@/lib/api'
import { brl } from '@/lib/format'
import { fotoLeve } from '@/lib/fotoLeve'
import { voarParaSacola } from '@/lib/voarParaSacola'

export type CoresVitrine = {
  card: string; cardAlt: string; border: string
  navy: string; text: string; blue: string; pix: string; yellow: string
}

export type PixVitrine    = { precoPix: number; pixPercent: number } | null
export type CartaoVitrine = { parcelas: number; valorParcela: number } | null

function pct(v: number) { return `${(Math.round(v * 10) / 10).toString().replace('.', ',')}%` }

/** "Card Games · Pokémon": a categoria-pai antes da do produto (o produto guarda só o nome da dele). */
export function rotuloCategoria(nome: string, categorias: ProductCategory[]): string {
  const cat = categorias.find(c => c.name.toLowerCase() === nome.toLowerCase())
  const pai = cat?.parentCategoryId ? categorias.find(c => c.id === cat.parentCategoryId) : undefined
  return pai ? `${pai.name} · ${nome}` : nome
}

/** Selo do canto da foto: pré-venda > promoção > destaque. */
function seloDe(p: Product): 'Pré-venda' | 'Promoção' | 'Destaque' | null {
  return p.isPreVenda ? 'Pré-venda' : p.isOnPromo ? 'Promoção' : p.isFeatured ? 'Destaque' : null
}

function Selo({ p }: { p: Product }) {
  const texto = seloDe(p)
  const [fundo, cor] =
    texto === 'Pré-venda' ? ['#1E4FD6', '#FFFFFF']
    : texto === 'Promoção' ? ['#EF4444', '#FFFFFF']
    : ['#FFE45E', '#3D2E00']
  if (!texto) return null
  return (
    <span className="absolute top-3 left-3 z-10 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm"
      style={{ backgroundColor: fundo, color: cor }}>
      {texto}
    </span>
  )
}

type Props = {
  p: Product
  C: CoresVitrine
  pix: PixVitrine
  cartao: CartaoVitrine
  /** Com href vira link (página /produtos); com onClick abre a espiada (home). */
  href?: string
  onClick?: () => void
  /** Com onAdd aparece o botão de pôr na sacola (chave home-que-vende); produto com tamanho/cor
   *  não recebe onAdd (precisa escolher a variação na página dele). */
  onAdd?: () => void
  /** Catálogo (chave home-que-vende): o desenho novo, com foto e letras maiores no computador —
   *  "no computador as imagens são muito pequenininhas", principalmente as figures (Maikon, 16/11). */
  grande?: boolean
  /** Rótulo da categoria no catálogo ("Card Games · Pokémon" — ver rotuloCategoria). */
  categoria?: string
}

export default function CartaoProduto(props: Props) {
  return props.grande ? <CartaoCatalogo {...props} /> : <Cartao {...props} />
}

// ─── Catálogo (modelo de 16/11) ──────────────────────────────────────────────

/** Tom do fundo da foto, pelo selo — translúcido, funciona no tema claro e no escuro. */
const TOM_DO_SELO: Record<string, string> = {
  'Pré-venda': 'rgba(91,111,255,0.20)',
  'Promoção':  'rgba(255,196,46,0.30)',
  'Destaque':  'rgba(45,212,160,0.22)',
}

function CartaoCatalogo({ p, C, pix, cartao, href, onClick, onAdd, categoria }: Props) {
  const promo   = p.isOnPromo && p.discountPriceInReais != null
  const preco   = promo ? p.discountPriceInReais! : p.priceInReais
  const ultimas = p.stockQuantity > 0 && p.isLowStock
  const selo    = seloDe(p)
  const [posto, setPosto] = useState(false)
  const fotoRef = useRef<HTMLImageElement>(null)
  const tom = selo ? TOM_DO_SELO[selo] : `${C.blue}14`

  // O cartão inteiro abre o produto (link "esticado" por baixo); o "Adicionar" fica por cima dele —
  // botão dentro de link não vale.
  const abrir = href
    ? <Link href={href} aria-label={p.name} className="absolute inset-0 z-0 rounded-[inherit]" />
    : <button type="button" onClick={onClick} aria-label={p.name} className="absolute inset-0 z-0 rounded-[inherit]" />

  return (
    <div className="group relative flex flex-col flex-1 rounded-3xl border overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_48px_-26px_rgba(15,27,51,0.45)]"
      style={{ backgroundColor: C.card, borderColor: C.border, boxShadow: '0 12px 32px -26px rgba(15,27,51,0.40)' }}>
      {abrir}

      {/* Foto: fundo no tom do selo, dois círculos de enfeite, foto inteira */}
      <div className="relative w-full aspect-square overflow-hidden pointer-events-none"
        style={{ background: `linear-gradient(155deg, ${tom} 0%, transparent 75%), ${C.cardAlt}` }}>
        <div className="absolute -right-12 -top-12 w-44 h-44 lg:w-56 lg:h-56 rounded-full opacity-50" aria-hidden style={{ backgroundColor: C.card }} />
        <div className="absolute -left-10 -bottom-14 w-36 h-36 lg:w-44 lg:h-44 rounded-full opacity-30" aria-hidden style={{ backgroundColor: C.card }} />
        {selo && (
          <span className="absolute top-3 left-3 lg:top-4 lg:left-4 z-10 text-[10px] lg:text-[11px] font-black uppercase tracking-wide px-2.5 lg:px-3 py-1 rounded-full shadow-sm"
            style={{ backgroundColor: '#FFD84D', color: '#3D2E00' }}>
            {selo}
          </span>
        )}
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img ref={fotoRef} src={fotoLeve(p.imageUrl, 640)} alt="" loading="lazy" decoding="async"
              className="relative w-full h-full object-contain p-5 lg:p-6 drop-shadow-[0_14px_22px_rgba(15,27,51,0.22)] transition-transform duration-300 group-hover:scale-105" />
          : <div className="relative w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 opacity-20" style={{ color: C.navy }} />
            </div>}
      </div>

      <div className="relative p-4 lg:p-5 flex flex-col flex-1 pointer-events-none">
        <p className="text-[10px] lg:text-[11px] font-black uppercase tracking-wider truncate" style={{ color: C.text }}>
          {categoria ?? p.category}
        </p>
        <h3 className="mt-1 text-sm sm:text-base lg:text-lg font-black leading-snug line-clamp-2" style={{ color: C.navy }}>{p.name}</h3>
        {p.description && (
          <p className="hidden sm:block mt-1 text-xs lg:text-sm leading-snug line-clamp-2" style={{ color: C.text }}>{p.description}</p>
        )}
        {ultimas && (
          <p className="mt-1.5 text-[11px] lg:text-xs font-bold" style={{ color: '#E11D48' }}>Últimas {p.stockQuantity}!</p>
        )}

        {/* Até o computador (cartão < ~300 px: 2 colunas no celular, 3 colunas a partir de 640 px) o botão
            desce pra baixo do preço, na largura toda — lado a lado o preço invadia o botão */}
        <div className="mt-auto pt-4 flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {promo && (
              <span className="block text-[11px] lg:text-xs line-through" style={{ color: C.text }}>{brl(p.priceInReais)}</span>
            )}
            <span className="block text-lg lg:text-2xl font-black leading-tight" style={{ color: promo ? '#E11D48' : C.navy }}>
              {brl(preco)}
            </span>
            {cartao && (
              <span className="block text-[11px] lg:text-xs mt-0.5" style={{ color: C.text }}>
                {cartao.parcelas}x de {brl(cartao.valorParcela)} no cartão
              </span>
            )}
            {pix && (
              <span className="block text-[11px] lg:text-xs font-bold" style={{ color: C.pix }}>
                <span className="whitespace-nowrap">{pct(pix.pixPercent)} OFF no Pix</span> · <span className="whitespace-nowrap">{brl(pix.precoPix)}</span>
              </span>
            )}
          </div>

          {onAdd ? (
            <button type="button" aria-label={`Pôr ${p.name} na sacola`}
              onClick={() => { onAdd(); voarParaSacola(fotoRef.current); setPosto(true); setTimeout(() => setPosto(false), 1600) }}
              className="pointer-events-auto relative z-10 shrink-0 w-full lg:w-auto inline-flex items-center justify-center gap-1 h-9 lg:h-10 px-3 lg:px-4 text-xs lg:text-sm font-black rounded-xl transition-all hover:brightness-95 active:scale-95 whitespace-nowrap"
              style={posto ? { backgroundColor: C.pix, color: '#FFFFFF' } : { backgroundColor: `${C.blue}1A`, color: C.blue }}>
              {posto ? <><Check className="w-3.5 h-3.5" /> Na sacola</> : 'Adicionar'}
            </button>
          ) : (
            <span className="shrink-0 w-full lg:w-auto inline-flex items-center justify-center gap-0.5 h-9 lg:h-10 px-3 lg:px-4 text-xs lg:text-sm font-black rounded-xl whitespace-nowrap"
              style={{ backgroundColor: `${C.blue}1A`, color: C.blue }}>
              Ver <ChevronRight className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Cartão de antes (chave desligada) ───────────────────────────────────────

function Cartao({ p, C, pix, cartao, href, onClick, onAdd }: Props) {
  const promo   = p.isOnPromo && p.discountPriceInReais != null
  const preco   = promo ? p.discountPriceInReais! : p.priceInReais
  // "Últimas N" segue o estoque mínimo de cada produto (isLowStock do servidor), não um número fixo
  const ultimas = p.stockQuantity > 0 && p.isLowStock
  // "✓ Na sacola" por um instante depois do toque (o número da Sacola no menu também sobe)
  const [posto, setPosto] = useState(false)

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
              {/* nowrap em cada pedaço: no celular "10%" ficava numa linha e "OFF" na outra */}
              <span className="whitespace-nowrap">{brl(pix.precoPix)} no Pix</span> · <span className="whitespace-nowrap">{pct(pix.pixPercent)} OFF</span>
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {/* No celular (2 colunas) só aparece o "Últimas N"; o "Em estoque" fica pro PC */}
          <span className={`text-[11px] font-semibold ${ultimas ? '' : 'hidden sm:inline'}`} style={{ color: ultimas ? '#E11D48' : C.text }}>
            {ultimas ? `Últimas ${p.stockQuantity}!` : 'Em estoque'}
          </span>
          {onAdd
            // Lugar do "+ Sacola", que fica por cima (fora do link: botão dentro de link não vale)
            ? <span className="ml-auto h-8 w-[5.5rem] sm:w-24" aria-hidden />
            : <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-black px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap"
                style={{ backgroundColor: `${C.blue}1A`, color: C.blue }}>
                Ver<span className="hidden sm:inline">&nbsp;produto</span> <ChevronRight className="w-3.5 h-3.5" />
              </span>}
        </div>
      </div>
    </>
  )

  // Com o "+ Sacola" quem sobe no hover é a caixa de fora (o botão sobe junto com o cartão)
  const classe = `group relative text-left rounded-2xl overflow-hidden border flex flex-col flex-1 transition-all duration-200 hover:shadow-[0_18px_40px_-20px_rgba(15,27,51,0.35)] ${onAdd ? '' : 'hover:-translate-y-1'}`
  const estilo = { backgroundColor: C.card, borderColor: C.border }

  const cartao_ = href
    ? <Link href={href} className={classe} style={estilo}>{conteudo}</Link>
    : <button type="button" onClick={onClick} className={classe} style={estilo}>{conteudo}</button>
  if (!onAdd) return cartao_

  return (
    <div className="relative flex flex-col transition-transform duration-200 hover:-translate-y-1">
      {cartao_}
      <button type="button" aria-label={`Pôr ${p.name} na sacola`}
        onClick={() => { onAdd(); setPosto(true); setTimeout(() => setPosto(false), 1600) }}
        className="absolute bottom-4 right-4 z-10 inline-flex items-center justify-center gap-1 h-8 w-[5.5rem] sm:w-24 text-xs font-black rounded-xl transition-all active:scale-95 whitespace-nowrap"
        style={posto
          ? { backgroundColor: C.pix, color: '#FFFFFF' }
          : { backgroundColor: C.blue, color: '#FFFFFF', boxShadow: `0 8px 18px -10px ${C.blue}` }}>
        {posto ? <><Check className="w-3.5 h-3.5" /> Na sacola</> : <><Plus className="w-3.5 h-3.5" /> Sacola</>}
      </button>
    </div>
  )
}
