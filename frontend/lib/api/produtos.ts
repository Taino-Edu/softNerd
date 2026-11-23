// lib/api/produtos.ts — Produtos, variantes, categorias, upload de imagem
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

export interface Product {
  id: string; name: string; description: string | null; category: string
  barcode: string | null
  priceInCents: number; costPriceInCents: number; stockQuantity: number; minimumStock: number
  discountPriceInCents: number | null; discountPriceInReais: number | null; isOnPromo: boolean
  isActive: boolean; isFeatured: boolean; showOnSite: boolean; showOnMarketplace: boolean; isPreVenda: boolean; imageUrl: string | null
  imageUrls: string[]; fullDescription: string | null
  isLowStock: boolean; priceInReais: number; costPriceInReais: number
  marginInReais: number; marginPercent: number
  hasVariants: boolean
  /** "Data de rua" da pré-venda (YYYY-MM-DD) — retirada/venda só a partir dela. Null = sem trava. */
  preVendaReleaseDate: string | null
  /** Parcelamento anunciado na página do produto. Null = este item não parcela (linha some). */
  maxInstallments: number | null
  /** Desconto do Pix anunciado neste item, em %. Null = herda da categoria / do padrão da loja. */
  pixDiscountPercent: number | null
  /** Carta avulsa (v1.91.0, chave cartas-como-produto): fica no Mercado de Cartas, fora de Produtos. */
  cartaAvulsa?: boolean
  /** "Pokémon", "Magic"... (lista JOGOS_DE_CARTA). */
  cartaJogo?: string | null
  /** NM, LP, MP, HP ou DMG. */
  cartaCondicao?: string | null
  /** Coleção ("Escarlate e Violeta 151") — o Mercado agrupa por ela. */
  cartaColecao?: string | null
  /** PT, EN, JP... */
  cartaIdioma?: string | null
  /** Número na coleção ("199/165"). */
  cartaNumero?: string | null
  /** Raridade como vem na carta ("Rara Dupla", "Promo"...). */
  cartaRaridade?: string | null
  // Preço de referência (v1.92.0, chave preco-referencia-cartas) — só na lista do painel (não sai no público)
  /** Produto da carta no TCGplayer (catálogo tcgcsv). Null = cadastrada à mão. */
  cartaTcgProdutoId?: number | null
  cartaTcgCategoria?: number | null
  cartaTcgGrupo?: number | null
  /** Acabamento do preço: "Normal", "Holofoil", "Reverse Holofoil"... */
  cartaTcgVariante?: string | null
  /** Último preço de mercado lido (dólar) e a referência em reais (centavos) — gravados pelo robô. */
  cartaRefUsd?: number | null
  cartaRefCentavos?: number | null
  cartaRefEm?: string | null
  /** O robô troca o preço de venda pela sugestão da regra todo dia. */
  cartaPrecoAutomatico?: boolean
  updatedAt: string; createdAt: string
}

export interface ProductVariant {
  id: string; productId: string
  size: string | null; color: string | null
  stockQuantity: number; priceInCents: number | null
  sku: string | null; label: string; createdAt: string
}

export interface ProductCategory {
  id: string; name: string; emoji: string | null
  displayOrder: number; isActive: boolean; createdAt: string
  parentCategoryId: string | null
  /** Desconto do Pix anunciado na vitrine, em %. Null = herda do pai / do padrão da loja. */
  pixDiscountPercent: number | null
}

export const categoryApi = {
  list:   ()                          => api.get<ProductCategory[]>('/api/category'),
  create: (c: Partial<ProductCategory>) => api.post<ProductCategory>('/api/category', c),
  update: (id: string, c: Partial<ProductCategory>) => api.put<ProductCategory>(`/api/category/${id}`, c),
  delete: (id: string)                => api.delete(`/api/category/${id}`),
}

export const productApi = {
  list:        (category?: string) => api.get<Product[]>('/api/product', { params: { category } }),
  listAdmin:   ()                  => api.get<Product[]>('/api/product/admin'),
  listStore:   ()                  => api.get<Product[]>('/api/product/store'),
  get:         (id: string)         => api.get<Product>(`/api/product/${id}`),
  /** Ids dos mais vendidos dos últimos 90 dias, em ordem (seção da home — só a ordem, sem números). */
  maisVendidos:(limite = 12)        => api.get<string[]>('/api/product/mais-vendidos', { params: { limite } }),
  /** Cartas avulsas à venda (Mercado de Cartas): ativas, na loja e com estoque, mais novas primeiro. */
  cartas:      (f: { jogo?: string; busca?: string } = {}) =>
                 api.get<Product[]>('/api/product/cartas', { params: { jogo: f.jogo || undefined, busca: f.busca || undefined } }),
  getByBarcode:(barcode: string)    => api.get<Product>(`/api/product/barcode/${encodeURIComponent(barcode)}`),
  create:      (p: Partial<Product>) => api.post<Product>('/api/product', p),
  update:      (id: string, p: Partial<Product>) => api.put<Product>(`/api/product/${id}`, p),
  deactivate:  (id: string)         => api.delete(`/api/product/${id}`),
  adjustStock: (id: string, delta: number) => api.patch(`/api/product/${id}/stock`, { delta }),
}

// ── Catálogo e preço de referência das cartas (v1.92.0, chave preco-referencia-cartas) ──
export interface ColecaoCatalogo {
  categoria: number; grupo: number; nome: string; nomeCompleto: string
  sigla: string | null; lancamento: string | null; japonesa: boolean
}
export interface PrecoCatalogo {
  variante: string; mercadoUsd: number | null; baixoUsd: number | null; medioUsd: number | null; altoUsd: number | null
  /** Mercado, senão médio, senão o mais baixo. */
  referencia: number | null
}
export interface CartaCatalogo {
  produtoId: number; categoria: number; grupo: number; nome: string
  numero: string | null; raridade: string | null; imagem: string | null; imagemGrande: string | null
  precos: PrecoCatalogo[]
}
/** Produto selado da coleção (booster, box, deck...) — v1.94.0, Estoque. */
export interface SeladoCatalogo {
  produtoId: number; categoria: number; grupo: number; nome: string
  imagem: string | null; imagemGrande: string | null; precos: PrecoCatalogo[]
}
export interface ReferenciaAgora {
  mercadoUsd: number | null; variante: string | null; cotacao: number; cotacaoDegradada: boolean
  avisoCotacao: string | null; referenciaCentavos: number | null; sugestaoCentavos: number | null
  precos: PrecoCatalogo[]
}
export interface RegraPrecoCarta { fatorPercent: number; arredondarCentavos: number; minimoCentavos: number; atualizadaEm: string }
export interface VariacaoPreco {
  productId: string; referenciaCentavos: number | null; referenciaEm: string | null; ha7Dias: number | null; ha30Dias: number | null
}
export interface ResultadoRodadaPreco {
  rodou: boolean; mensagem: string; cartas: number; atualizadas: number; precosTrocados: number
  semPreco: number; colecoesComErro: number; cotacao: number | null
}

export const catalogoCartasApi = {
  colecoes:   (jogo: string) => api.get<ColecaoCatalogo[]>(`/api/product/catalogo-cartas/colecoes`, { params: { jogo } }),
  cartas:     (categoria: number, grupo: number) => api.get<CartaCatalogo[]>(`/api/product/catalogo-cartas/cartas`, { params: { categoria, grupo } }),
  selados:    (categoria: number, grupo: number) => api.get<SeladoCatalogo[]>(`/api/product/catalogo-cartas/selados`, { params: { categoria, grupo } }),
  /** Liga (produtoId preenchido) ou desliga (null) um produto do Estoque ao catálogo; devolve o produto com a referência. */
  ligar:      (id: string, l: { produtoId: number | null; categoria: number | null; grupo: number | null; variante?: string | null; automatico: boolean }) =>
                api.put<Product>(`/api/product/catalogo-cartas/ligacao/${id}`, l),
  referencia: (c: { categoria: number; grupo: number; produtoId: number; variante?: string | null }) =>
                api.get<ReferenciaAgora>(`/api/product/catalogo-cartas/referencia`, { params: { ...c, variante: c.variante || undefined } }),
  variacoes:  () => api.get<VariacaoPreco[]>(`/api/product/catalogo-cartas/variacoes`),
  regra:      () => api.get<RegraPrecoCarta>(`/api/product/catalogo-cartas/regra`),
  salvarRegra:(r: Pick<RegraPrecoCarta, 'fatorPercent' | 'arredondarCentavos' | 'minimoCentavos'>) =>
                api.put<RegraPrecoCarta>(`/api/product/catalogo-cartas/regra`, r),
  atualizar:  (ids?: string[]) => api.post<ResultadoRodadaPreco>(`/api/product/catalogo-cartas/atualizar`, { ids: ids ?? null }),
}

export const variantApi = {
  list:   (productId: string) =>
            api.get<ProductVariant[]>(`/api/products/${productId}/variants`),
  update: (productId: string, variantId: string, v: Partial<ProductVariant>) =>
            api.put<ProductVariant>(`/api/products/${productId}/variants/${variantId}`, v),
  remove: (productId: string, variantId: string) =>
            api.delete(`/api/products/${productId}/variants/${variantId}`),
  bulk:   (productId: string, sizes: string[], colors: string[], stockQty: number) =>
            api.post<ProductVariant[]>(`/api/products/${productId}/variants/bulk`, { sizes, colors, baseStockQuantity: stockQty }),
}

// ── Upload de imagem ──────────────────────────────────────────────────────────

export const uploadApi = {
  /** Envia um arquivo de imagem e retorna a URL pública gerada pelo servidor. */
  image: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ url: string }>('/api/upload/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
