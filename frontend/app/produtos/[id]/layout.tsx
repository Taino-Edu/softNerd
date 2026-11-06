// =============================================================================
// Página do produto — parte do SERVIDOR (a tela continua em page.tsx, no navegador)
//
// Antes o HTML de todo produto chegava como "Santuário Nerd — Sistema de gestão da loja de
// Card Games", sem nome, foto nem preço: a prévia do link no WhatsApp/Instagram saía genérica e
// o Google dependia de rodar o JavaScript. Aqui sai o título, a descrição, a foto (JPEG leve,
// que o WhatsApp aceita) e os dados de produto no formato do Google (schema.org/Product).
// =============================================================================

import type { Metadata } from 'next'
import { daApi, fotoAbsoluta, reais, resumo, SITE } from '@/lib/servidor'

interface ProdutoDaApi {
  id: string; name: string; description?: string | null; fullDescription?: string | null
  category: string; barcode?: string | null; priceInCents: number; discountPriceInCents?: number | null
  isOnPromo: boolean; stockQuantity: number; imageUrl?: string | null; imageUrls?: string[]
  isActive: boolean; showOnMarketplace?: boolean; isPreVenda?: boolean; updatedAt?: string
  pixDiscountPercent?: number | null
}

type Props = { params: Promise<{ id: string }>; children: React.ReactNode }

const buscar = (id: string) => (/^[0-9a-f-]{36}$/i.test(id) ? daApi<ProdutoDaApi>(`/api/product/${id}`) : Promise.resolve(null))
const precoAtual = (p: ProdutoDaApi) => (p.isOnPromo && p.discountPriceInCents ? p.discountPriceInCents : p.priceInCents)
const visivel = (p: ProdutoDaApi | null): p is ProdutoDaApi => !!p && p.isActive && p.showOnMarketplace !== false

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { id } = await params
  const p = await buscar(id)
  if (!visivel(p)) return { title: 'Produto', robots: { index: false } }

  const nome = p.name.trim()
  const preco = reais(precoAtual(p))
  const disponibilidade = p.stockQuantity > 0 ? 'Em estoque' : p.isPreVenda ? 'Pré-venda' : 'Esgotado'
  const descricao = resumo(p.description || p.fullDescription)
    ?? `${nome} por ${preco}. ${p.category}. ${disponibilidade} — retire na loja em José Bonifácio, SP, ou reserve pelo site.`
  const foto = fotoAbsoluta(p.imageUrl, { jpg: true })
  const url = `${SITE}/produtos/${p.id}`

  return {
    title: { absolute: `${nome} — ${preco} | Santuário Nerd` },
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Santuário Nerd',
      locale: 'pt_BR',
      title: { absolute: `${nome} — ${preco} | Santuário Nerd` },
      description: descricao,
      images: foto ? [{ url: foto, alt: nome }] : undefined,
    },
    twitter: { card: foto ? 'summary_large_image' : 'summary', title: `${nome} — ${preco}`, description: descricao, images: foto ? [foto] : undefined },
  }
}

export default async function LayoutDoProduto({ params, children }: Props) {
  const { id } = await params
  const p = await buscar(id)

  // Dados de produto pro Google (resultado com preço/estoque e Google Shopping)
  const dados = visivel(p) ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name.trim(),
    description: resumo(p.description || p.fullDescription, 500) ?? `${p.name.trim()} — ${p.category}`,
    image: [p.imageUrl, ...(p.imageUrls ?? [])].map(u => fotoAbsoluta(u, { jpg: true, largura: 1280 })).filter(Boolean),
    sku: p.id,
    ...(p.barcode && /^\d{8,14}$/.test(p.barcode) ? { gtin: p.barcode } : {}),
    category: p.category,
    offers: {
      '@type': 'Offer',
      url: `${SITE}/produtos/${p.id}`,
      priceCurrency: 'BRL',
      price: (precoAtual(p) / 100).toFixed(2),
      availability: p.stockQuantity > 0 ? 'https://schema.org/InStock'
        : p.isPreVenda ? 'https://schema.org/PreOrder' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Santuário Nerd' },
      // Retirada na loja física (sem frete)
      availableDeliveryMethod: 'https://schema.org/OnSitePickup',
    },
  } : null

  return (
    <>
      {dados && (
        <script type="application/ld+json"
          // JSON gerado aqui, sem texto de usuário fora de string: "<" vira < pra não fechar a tag
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, '\\u003c') }} />
      )}
      {children}
    </>
  )
}
