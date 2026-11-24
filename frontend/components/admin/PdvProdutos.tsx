import { useState, type RefObject } from 'react'
import clsx from 'clsx'
import { Camera, ChevronLeft, Loader2, Minus, PackageOpen, Plus, Search, ShoppingBag, Trash2, User, X } from 'lucide-react'
import type { Product, ProductCategory } from '@/lib/api'
import { brlDeCentavos } from '@/lib/format'
import CameraScanner from '@/components/CameraScanner'
import ConferenciaButton from './ConferenciaButton'

export interface ItemCarrinhoPdv {
  product: Product
  quantity: number
  variantId?: string
  variantLabel?: string
  cartKey: string
}

export interface CategoriaCatalogo { name: string; isChild: boolean }

interface Props {
  produtos: Product[]
  categorias: CategoriaCatalogo[]
  categoria: string | null
  selecionarCategoria: (categoria: string | null) => void
  busca: string
  buscar: (valor: string) => void
  buscaRef: RefObject<HTMLInputElement | null>
  carrinho: ItemCarrinhoPdv[]
  adicionar: (produto: Product) => void
  lerCodigo: (codigo: string) => void
  alterarQuantidade: (chave: string, delta: number) => void
  remover: (chave: string) => void
  cliente: string
  editarCliente: () => void
  subtotal: number
  desconto: number
  total: number
}

export function precoProdutoPdv(produto: Product) {
  return produto.isOnPromo && produto.discountPriceInCents != null
    ? produto.discountPriceInCents
    : produto.priceInCents
}

/**
 * Barra de ações das telas de caixa (Nova venda, Adicionar itens e Fechar comanda). No celular fica presa
 * no pé da tela: antes vinha depois do catálogo inteiro e o caixa rolava sem ver o total nem o botão de
 * avançar (teste no localhost, 23/11). A folga de baixo do painel (.admin-main, 136px no celular) deixa o
 * fim da tela rolar acima dela. Quem usa marca com useMarcarRodapeFixo (lib/rodapeFixo).
 */
export const RODAPE_PDV = 'flex flex-wrap items-center gap-2 border-t border-surface-500 px-3 py-3 sm:px-5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:bg-[var(--bg-card)] max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.45)]'

/** Cabeçalho das telas de caixa: título, botão de sair e as etapas. */
export function CabecalhoPdv({ titulo, tituloRef, icone, sair, rotuloSair, desabilitado, etapas, etapa, subtitulo }: {
  titulo: string
  tituloRef: RefObject<HTMLHeadingElement | null>
  icone: React.ReactNode
  sair: () => void
  rotuloSair: string
  desabilitado?: boolean
  etapas: string[]
  etapa: number
  subtitulo?: string
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-5">
      <div className="min-w-0">
        <h1 ref={tituloRef} tabIndex={-1} className="scroll-mt-20 flex items-center gap-2 text-lg font-black md:scroll-mt-4">
          {icone} {titulo}
        </h1>
        {subtitulo && <p className="truncate text-sm text-[var(--text-muted)]">{subtitulo}</p>}
      </div>
      <button type="button" onClick={sair} disabled={desabilitado} className="btn-secondary min-h-10 px-2.5 text-xs disabled:opacity-50 lg:order-last">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {rotuloSair}
      </button>
      <ol aria-label="Etapas" className="order-last flex w-full flex-wrap gap-x-4 gap-y-2 text-xs lg:order-none lg:w-auto">
        {etapas.map((rotulo, i) => (
          <li key={rotulo} aria-current={i + 1 === etapa ? 'step' : undefined} className={clsx('flex items-center gap-1.5', i + 1 === etapa ? 'font-black' : 'text-[var(--text-muted)]')}>
            <span className={clsx('grid h-5 w-5 place-items-center rounded-full border', i + 1 === etapa && 'bg-[var(--bg-input)]')}>{i + 1}</span>{rotulo}
          </li>
        ))}
      </ol>
    </header>
  )
}

/** Categorias que têm produto, cada subcategoria logo abaixo da categoria-pai (quando o pai também tem). */
export function categoriasDoCatalogo(produtos: Product[], todas: ProductCategory[]): CategoriaCatalogo[] {
  const emUso = new Set(produtos.map(p => p.category).filter(Boolean))
  const porNome = new Map(todas.map(c => [c.name, c]))
  const paiDe = (nome: string): string | null => {
    const categoria = porNome.get(nome)
    if (!categoria?.parentCategoryId) return null
    const pai = todas.find(c => c.id === categoria.parentCategoryId)
    return pai && emUso.has(pai.name) ? pai.name : null
  }
  const ordenadas: CategoriaCatalogo[] = []
  for (const topo of [...emUso].filter(n => !paiDe(n)).sort()) {
    ordenadas.push({ name: topo, isChild: false })
    for (const filha of [...emUso].filter(n => paiDe(n) === topo).sort()) ordenadas.push({ name: filha, isChild: true })
  }
  return ordenadas
}

export function FotoProdutoPdv({ produto, className }: { produto: Product; className: string }) {
  const [falhas, setFalhas] = useState<string[]>([])
  const imagem = [produto.imageUrl, ...(produto.imageUrls ?? [])]
    .find(url => url && !falhas.includes(url))
  return (
    <div className={clsx('relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--bg-input)]', className)}>
      {imagem ? (
        <img key={imagem} src={imagem} alt="" loading="lazy" onError={() => setFalhas(anteriores => [...anteriores, imagem])}
          className="absolute inset-0 h-full w-full object-contain p-1" />
      ) : <PackageOpen aria-hidden="true" className="h-6 w-6 text-[var(--text-muted)]" />}
    </div>
  )
}

/** Alternância Produtos × carrinho/comanda do celular e tablet (do lg pra cima ficam lado a lado). */
export function AbasPdv({ aba, mudar, rotuloLista }: {
  aba: 'catalogo' | 'lista'
  mudar: (aba: 'catalogo' | 'lista') => void
  rotuloLista: string
}) {
  return (
    <div role="group" aria-label="Exibição" className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg-input)] p-1 lg:hidden">
      {(['catalogo', 'lista'] as const).map(opcao => (
        <button key={opcao} type="button" aria-pressed={aba === opcao}
          className={clsx('min-h-10 rounded-lg px-2 text-sm', aba === opcao
            ? 'border bg-[var(--bg-card)] font-black shadow-sm'
            : 'font-semibold text-[var(--text-muted)]')}
          onClick={() => mudar(opcao)}>
          {opcao === 'catalogo' ? 'Produtos' : rotuloLista}
        </button>
      ))}
    </div>
  )
}

/**
 * Catálogo das telas de caixa (Nova venda e Adicionar itens da comanda): busca por nome ou código de
 * barras (Enter adiciona), câmera, categoria e os cards. As duas telas usam este mesmo componente.
 */
export function CatalogoPdv({
  produtos, categorias, categoria, selecionarCategoria, busca, buscar, buscaRef,
  podeAdicionar, adicionar, lerCodigo, adicionando = null, ocupado = false, escolheOpcao = true, className,
}: {
  /** Produto com variação abre a escolha de opção (PDV). A comanda lança o produto direto. */
  escolheOpcao?: boolean
  /** Já filtrados por busca e categoria. */
  produtos: Product[]
  categorias: CategoriaCatalogo[]
  categoria: string | null
  selecionarCategoria: (categoria: string | null) => void
  busca: string
  buscar: (valor: string) => void
  buscaRef?: RefObject<HTMLInputElement | null>
  podeAdicionar: (produto: Product) => boolean
  adicionar: (produto: Product) => void
  /** Código lido pela câmera. */
  lerCodigo: (codigo: string) => void
  /** Produto sendo gravado agora (comanda grava item a item). */
  adicionando?: string | null
  ocupado?: boolean
  className?: string
}) {
  const [camera, setCamera] = useState(false)

  function confirmarBusca() {
    const termo = busca.trim()
    if (!termo || ocupado) return
    // Leitor USB digita o código e dá Enter: código exato primeiro, senão o único resultado da busca.
    const produto = produtos.find(p => p.barcode === termo) ?? (produtos.length === 1 ? produtos[0] : undefined)
    if (produto && podeAdicionar(produto)) {
      adicionar(produto)
      buscar('')
    }
  }

  return (
    <section aria-label="Catálogo de produtos" className={clsx('min-w-0 flex-col gap-3', className)}>
      {camera && <CameraScanner onDetected={codigo => { setCamera(false); lerCodigo(codigo) }} onClose={() => setCamera(false)} />}
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-0 flex-[2_1_14rem] gap-2">
          <div className="relative min-w-0 flex-1">
            <label className="block">
              <span className="sr-only">Buscar produto, categoria ou código de barras</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" />
              <input ref={buscaRef} className="input min-h-11 pl-9 pr-10" placeholder="Produto ou código de barras"
                value={busca} onChange={e => buscar(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.repeat) confirmarBusca() }} />
            </label>
            {busca && (
              <button type="button" onClick={() => { buscar(''); buscaRef?.current?.focus() }} aria-label="Limpar busca"
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-[var(--text-muted)]">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          <button type="button" onClick={() => setCamera(true)} disabled={ocupado}
            aria-label="Ler código de barras pela câmera" title="Ler código pela câmera"
            className="btn-secondary min-h-11 shrink-0 px-3 disabled:opacity-50">
            <Camera aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {categorias.length > 0 && (
          <select aria-label="Categoria" className="input min-h-11 min-w-0 flex-[1_1_10rem]"
            value={categoria ?? ''} onChange={e => selecionarCategoria(e.target.value || null)}>
            <option value="">Todas as categorias</option>
            {categorias.map(({ name, isChild }) => (
              <option key={name} value={name}>{isChild ? `↳ ${name}` : name}</option>
            ))}
          </select>
        )}
      </div>
      {produtos.length === 0 ? (
        <p className="rounded-xl border bg-[var(--bg-card)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">Nenhum produto encontrado.</p>
      ) : (
        // Rolagem própria só do tablet pra cima. No celular a página rola sozinha (uma rolagem só) e o
        // total com o botão de avançar fica preso no pé da tela (RODAPE_PDV). No computador a lista desce
        // até o rodapé (17,5rem = cabeçalho, busca e rodapé); com 58dvh sobrava espaço vazio embaixo.
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] content-start items-stretch gap-2 md:max-h-[58dvh] lg:max-h-[max(20rem,calc(100dvh-17.5rem))] md:overflow-y-auto md:pr-1 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] sm:gap-3">
          {produtos.map(produto => (
            <li key={produto.id} className="flex min-w-0 flex-col gap-2 rounded-xl border bg-[var(--bg-card)] p-2 sm:p-3">
              {/* Foto com altura fixa (a imagem inteira cabe, sem corte): com a foto quadrada o card tinha
                  343px e no computador (1366×768) mal cabia uma fileira; agora cabem duas (teste no localhost, 24/11). */}
              <FotoProdutoPdv produto={produto} className="h-24 w-full" />
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-muted)]">
                <span>{produto.stockQuantity ? `${produto.stockQuantity} un. em estoque` : 'Sem estoque'}</span>
                {produto.isPreVenda ? <span className="txt-alerta font-bold">Pré-venda</span>
                  : produto.isOnPromo && <span className="txt-ok font-bold">Promoção</span>}
              </div>
              <h2 className="flex-1 break-words text-sm font-bold leading-snug line-clamp-2" title={produto.name}>{produto.name}</h2>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                <p className="text-base font-black tabular-nums">{brlDeCentavos(precoProdutoPdv(produto))}</p>
                <button type="button" onClick={() => adicionar(produto)} disabled={ocupado || !podeAdicionar(produto)}
                  aria-label={`${escolheOpcao && produto.hasVariants ? 'Escolher opção para' : 'Adicionar'} ${produto.name}`}
                  className="btn-secondary min-h-10 flex-1 justify-center gap-1 px-2 text-xs disabled:opacity-50">
                  {adicionando === produto.id
                    ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
                    : <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />}
                  {escolheOpcao && produto.hasVariants ? 'Escolher opção' : 'Adicionar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function PdvProdutos({
  produtos, categorias, categoria, selecionarCategoria, busca, buscar, buscaRef,
  carrinho, adicionar, lerCodigo, alterarQuantidade, remover, cliente, editarCliente, subtotal, desconto, total,
}: Props) {
  const [aba, setAba] = useState<'catalogo' | 'lista'>('catalogo')
  const quantidade = carrinho.reduce((soma, item) => soma + item.quantity, 0)
  const quantidades = new Map<string, number>()
  for (const item of carrinho) {
    quantidades.set(item.product.id, (quantidades.get(item.product.id) ?? 0) + item.quantity)
  }

  function podeAdicionar(produto: Product) {
    return produto.stockQuantity > 0 && (produto.hasVariants || (quantidades.get(produto.id) ?? 0) < produto.stockQuantity)
  }

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,1fr)_minmax(0,2fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-4">
      <button type="button" onClick={editarCliente} className="btn-secondary min-h-11 min-w-0 justify-between text-left text-sm lg:col-start-1 lg:row-start-1">
        <span className="flex min-w-0 items-center gap-2">
          <User aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="truncate">{cliente || 'Consumidor final'}</span>
        </span>
        <span className="shrink-0 text-xs">Alterar cliente</span>
      </button>

      <AbasPdv aba={aba} mudar={setAba} rotuloLista={`Carrinho (${quantidade})`} />

      <section aria-label="Carrinho" className={clsx('min-w-0 flex-col rounded-xl border bg-[var(--bg-card)] lg:col-start-1 lg:row-start-2 lg:flex', aba === 'lista' ? 'flex' : 'hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><ShoppingBag aria-hidden="true" className="h-4 w-4" /> Carrinho ({quantidade})</h2>
          <ConferenciaButton compact
            items={carrinho.map(({ product, quantity, variantLabel }) => ({
              name: product.name, quantity, variantLabel, unitPriceInCents: precoProdutoPdv(product),
            }))}
            totalInCents={subtotal} clienteNome={cliente || null} origem="Venda balcão (PDV)" />
        </div>
        {carrinho.length === 0 ? (
          <p className="flex-1 px-4 py-8 text-center text-sm text-[var(--text-muted)]">Adicione produtos para montar a venda.</p>
        ) : (
          <ul className="flex-1 divide-y px-3 md:max-h-[44dvh] md:overflow-y-auto">
            {carrinho.map(({ product, quantity, variantLabel, cartKey }) => (
              <li key={cartKey} className="flex items-start gap-2 py-3">
                <FotoProdutoPdv produto={product} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold leading-snug">{product.name}</p>
                  {variantLabel && <p className="text-xs text-[var(--text-muted)]">{variantLabel}</p>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
                    <span className="text-sm font-bold tabular-nums">{brlDeCentavos(precoProdutoPdv(product) * quantity)}</span>
                    <div className="flex items-center">
                      <button type="button" onClick={() => alterarQuantidade(cartKey, -1)} disabled={quantity === 1}
                        aria-label={`Diminuir quantidade de ${product.name}`} className="grid h-10 w-9 place-items-center rounded hover:bg-[var(--bg-input)] disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                      <span className="min-w-5 text-center text-sm tabular-nums">{quantity}</span>
                      <button type="button" onClick={() => alterarQuantidade(cartKey, 1)} disabled={quantity >= product.stockQuantity}
                        aria-label={`Aumentar quantidade de ${product.name}`} className="grid h-10 w-9 place-items-center rounded hover:bg-[var(--bg-input)] disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                      <button type="button" onClick={() => remover(cartKey)}
                        aria-label={`Remover ${product.name}`} className="txt-erro grid h-10 w-9 place-items-center rounded hover:bg-[var(--bg-input)]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <dl className="space-y-1 border-t px-4 py-3 text-sm">
          <div className="flex justify-between gap-2 text-[var(--text-muted)]"><dt>Subtotal</dt><dd>{brlDeCentavos(subtotal)}</dd></div>
          {desconto > 0 && <div className="txt-ok flex justify-between gap-2"><dt>Desconto</dt><dd>−{brlDeCentavos(desconto)}</dd></div>}
          <div className="flex items-baseline justify-between gap-2 pt-1 font-black"><dt>Total da venda</dt><dd className="text-xl tabular-nums">{brlDeCentavos(total)}</dd></div>
        </dl>
      </section>

      <CatalogoPdv produtos={produtos} categorias={categorias} categoria={categoria} selecionarCategoria={selecionarCategoria}
        busca={busca} buscar={buscar} buscaRef={buscaRef} podeAdicionar={podeAdicionar} adicionar={adicionar} lerCodigo={lerCodigo}
        className={clsx('lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex', aba === 'catalogo' ? 'flex' : 'hidden')} />
    </div>
  )
}
