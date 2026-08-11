// =============================================================================
// lib/precoVitrine.ts — parcelamento no cartão + preço no Pix da vitrine
//
// Pedido do Maikon (03/08/2026): a página do produto tem que mostrar que dá pra
// parcelar no cartão e quanto sai pagando no Pix, igual às lojas grandes.
//
// É texto de VITRINE, não regra de cobrança: o desconto do Pix real continua sendo
// aplicado pelo admin na hora de fechar. Por isso tudo mora em configuração
// (SiteConfig) e não em constante no código — o percentual muda por linha de
// produto (Pokémon tem margem menor e sai com 3%, o resto da loja com o padrão).
// =============================================================================

import type { Product, ProductCategory, SiteConfigDto } from './api'

export interface PrecoVitrine {
  /** Nº de parcelas anunciadas. < 2 = não anuncia parcelamento (item sem parcelamento ou preço baixo). */
  parcelas: number
  /** Valor de cada parcela, em reais. */
  valorParcela: number
  /** Desconto do Pix aplicado, em %. 0 = loja não anuncia Pix. */
  pixPercent: number
  /** Preço final no Pix, em reais. */
  precoPix: number
  /** Quanto o cliente economiza pagando no Pix, em reais. */
  economiaPix: number
}

/**
 * Percentual de desconto do Pix que vale pra um produto, na ordem em que o lojista espera:
 * o do próprio item → o da categoria dele → o da categoria pai (subcategoria herda de
 * "Card Games", por exemplo) → o padrão da loja.
 *
 * Item com 0 é decisão de verdade ("este aqui não tem desconto"), não "não preenchi" —
 * por isso a checagem é contra null, nunca contra falsy.
 * `categoryName` é o nome mesmo — em Product a categoria é string, não FK.
 */
export function resolvePixPercent(
  produto: Pick<Product, 'category' | 'pixDiscountPercent'> | null | undefined,
  categories: ProductCategory[],
  padraoLoja: number,
): number {
  if (produto?.pixDiscountPercent != null) return produto.pixDiscountPercent

  const categoryName = produto?.category
  const cat = categoryName
    ? categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
    : undefined
  if (!cat) return padraoLoja

  if (cat.pixDiscountPercent != null) return cat.pixDiscountPercent

  const pai = cat.parentCategoryId
    ? categories.find(c => c.id === cat.parentCategoryId)
    : undefined
  return pai?.pixDiscountPercent ?? padraoLoja
}

/**
 * Monta as duas linhas da vitrine a partir do preço já com promoção aplicada.
 *
 * `maxParcelas` vem do PRODUTO (decidido no cadastro): vazio/null = item não parcela e a
 * linha do cartão nem aparece, igual aos toggles de vitrine. Quando tem valor, o número
 * cai até a parcela alcançar o piso da loja — sem isso um item de R$ 20 marcado como 12x
 * apareceria como "12x de R$ 1,67".
 * Arredondamentos são sempre a favor da loja no cartão (parcela pra cima, pra soma
 * nunca ficar abaixo do preço) e a favor do cliente no Pix (centavo pra baixo).
 */
export function calcPrecoVitrine(
  precoReais: number,
  maxParcelas: number | null | undefined,
  cfg: Pick<SiteConfigDto, 'minInstallmentInCents'>,
  pixPercent: number,
): PrecoVitrine {
  const cents = Math.round(precoReais * 100)

  const teto = maxParcelas ?? 0
  const piso = Math.max(1, cfg.minInstallmentInCents ?? 1)
  const parcelas = teto < 2 ? 1 : Math.max(1, Math.min(teto, Math.floor(cents / piso)))
  const valorParcela = Math.ceil(cents / parcelas) / 100

  const pct = Math.min(100, Math.max(0, pixPercent ?? 0))
  const precoPix = Math.floor(cents * (1 - pct / 100)) / 100

  return {
    parcelas,
    valorParcela,
    pixPercent: pct,
    precoPix,
    economiaPix: precoReais - precoPix,
  }
}
