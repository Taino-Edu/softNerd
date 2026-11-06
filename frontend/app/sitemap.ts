// =============================================================================
// /sitemap.xml — a lista de páginas que o Google deve conhecer
// Antes não existia (404): o Google só achava produto seguindo link e rodando o JavaScript.
// Entram a principal, Produtos, a Liga e cada produto que aparece no site (ativo e na vitrine).
// =============================================================================

import type { MetadataRoute } from 'next'
import { daApi, SITE } from '@/lib/servidor'

// Refeito no máximo a cada hora (produto novo entra sem deploy)
export const revalidate = 3600

interface ProdutoDaLista { id: string; isActive: boolean; showOnMarketplace?: boolean; updatedAt?: string }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agora = new Date()
  const fixas: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,         lastModified: agora, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/produtos`, lastModified: agora, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/liga`,     lastModified: agora, changeFrequency: 'weekly', priority: 0.5 },
  ]
  const produtos = (await daApi<ProdutoDaLista[]>('/api/product', 3600)) ?? []
  return [
    ...fixas,
    ...produtos
      .filter(p => p.isActive && p.showOnMarketplace !== false)
      .map(p => ({
        url: `${SITE}/produtos/${p.id}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : agora,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
  ]
}
