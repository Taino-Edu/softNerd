// =============================================================================
// lib/servidor.ts — o que o SERVIDOR do site (Next) busca na API pra montar o HTML
//
// Só pra metadados, sitemap e dados pro Google: título, descrição e foto de cada produto
// saem no HTML (antes tudo chegava como "Santuário Nerd — Sistema de gestão…", e a prévia do
// link no WhatsApp/Instagram ficava sem foto nem preço — revisão de SEO, 06/11).
// Nunca quebra a página: API fora do ar = null e a página segue com o padrão.
// =============================================================================

// Só importar de componentes de servidor (layout/sitemap/robots): usa fetch com cache do Next.

/** Endereço público do site (links absolutos, prévias, sitemap). */
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://santuarionerd.com.br').replace(/\/$/, '')

/**
 * API vista do servidor do site. Em produção dá pra apontar direto pro container
 * (API_INTERNA=http://api:5000) e não dar a volta pela Cloudflare; sem ela, usa o endereço público.
 */
const API = (process.env.API_INTERNA || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '')

/** GET na API com cache de alguns minutos. Falhou (fora do ar, 404, demora) = null. */
export async function daApi<T>(caminho: string, segundosDeCache = 300): Promise<T | null> {
  try {
    const r = await fetch(`${API}${caminho}`, {
      next: { revalidate: segundosDeCache },
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'application/json' },
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

/** Endereço absoluto de uma foto da loja. Com `jpg`, a versão leve em JPEG (prévia de link). */
export function fotoAbsoluta(url: string | null | undefined, opcoes?: { jpg?: boolean; largura?: number }): string | undefined {
  if (!url) return undefined
  const absoluta = url.startsWith('http') ? url : `${SITE}${url.startsWith('/') ? '' : '/'}${url}`
  const daLoja = absoluta.startsWith(`${SITE}/uploads/`) && !absoluta.includes('?')
  if (!daLoja || !opcoes?.jpg) return absoluta
  return `${absoluta}?w=${opcoes.largura ?? 960}&f=jpg`
}

/** Texto curto pra descrição (sem quebras e no tamanho que o Google mostra). */
export function resumo(texto: string | null | undefined, limite = 155): string | undefined {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  return t.length <= limite ? t : `${t.slice(0, limite - 1).replace(/\s+\S*$/, '')}…`
}

/** 8990 → "R$ 89,90" */
export const reais = (centavos: number) =>
  `R$ ${(centavos / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
