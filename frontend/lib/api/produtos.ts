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
  /** NCM (Nomenclatura Comum do Mercosul) — obrigatório para emitir NFC-e deste produto. */
  ncm: string | null
  /** CEST (7 dígitos) — obrigatório só nos CSOSNs de substituição tributária (201/202/203/500). */
  cest: string | null
  /** Natureza de operação (CFOP/CSOSN) usada na emissão fiscal. Null = usa a marcada como padrão. */
  naturezaOperacaoId: string | null
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
  getByBarcode:(barcode: string)    => api.get<Product>(`/api/product/barcode/${encodeURIComponent(barcode)}`),
  create:      (p: Partial<Product>) => api.post<Product>('/api/product', p),
  update:      (id: string, p: Partial<Product>) => api.put<Product>(`/api/product/${id}`, p),
  deactivate:  (id: string)         => api.delete(`/api/product/${id}`),
  lowStock:    ()                   => api.get<Product[]>('/api/product/low-stock'),
  adjustStock: (id: string, delta: number) => api.patch(`/api/product/${id}/stock`, { delta }),
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
