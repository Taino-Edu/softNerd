// lib/cartasAvulsas.ts — cartas avulsas como produto (v1.91.0, chave "cartas-como-produto").
// Listas do cadastro e do Mercado num lugar só, o resumo "Pokémon · NM · PT" e o atalho pra Liga.
import type { Product } from '@/lib/api'

/** Jogos do Mercado (os mesmos dos anúncios antigos). */
export const JOGOS_DE_CARTA = ['Pokémon', 'Magic', 'Yu-Gi-Oh!', 'One Piece', 'Dragon Ball', 'Digimon', 'Outro'] as const

/** Estados aceitos pela API (ProductService.CondicoesDeCarta). */
export const CONDICOES_DE_CARTA = [
  { valor: 'NM',  rotulo: 'Near Mint (NM)' },
  { valor: 'LP',  rotulo: 'Light Played (LP)' },
  { valor: 'MP',  rotulo: 'Moderate Played (MP)' },
  { valor: 'HP',  rotulo: 'Heavy Played (HP)' },
  { valor: 'DMG', rotulo: 'Damaged (DMG)' },
] as const

export const IDIOMAS_DE_CARTA = [
  { valor: 'PT', rotulo: 'Português' },
  { valor: 'EN', rotulo: 'Inglês' },
  { valor: 'JP', rotulo: 'Japonês' },
  { valor: 'ES', rotulo: 'Espanhol' },
] as const

/**
 * Raridades sugeridas no cadastro (texto livre — cada jogo tem as suas). A ordem é da mais comum pra mais rara:
 * o Mercado usa essa posição pra "Ordenar por raridade"; raridade fora da lista vai pro fim.
 */
export const RARIDADES_DE_CARTA: Record<string, readonly string[]> = {
  'Pokémon':     ['Comum', 'Incomum', 'Rara', 'Rara Holo', 'Rara Dupla', 'Ultra Rara', 'Rara Ilustração',
                  'Rara Ilustração Especial', 'Hiper Rara', 'Promo'],
  'Magic':       ['Comum', 'Incomum', 'Rara', 'Mítica', 'Especial'],
  'Yu-Gi-Oh!':   ['Comum', 'Rara', 'Super Rara', 'Ultra Rara', 'Secreta', 'Ultimate', 'Starlight'],
  'One Piece':   ['Comum', 'Incomum', 'Rara', 'Super Rara', 'Secreta', 'Líder', 'Promo'],
  'Dragon Ball': ['Comum', 'Incomum', 'Rara', 'Super Rara', 'Secreta', 'Líder', 'Promo'],
  'Digimon':     ['Comum', 'Incomum', 'Rara', 'Super Rara', 'Secreta', 'Promo'],
  'Outro':       ['Comum', 'Incomum', 'Rara', 'Épica', 'Lendária', 'Promo'],
}

/** Lista de raridades do jogo (jogo sem lista própria usa a de "Outro"). */
export function raridadesDoJogo(jogo: string | null | undefined): readonly string[] {
  return (jogo && RARIDADES_DE_CARTA[jogo]) || RARIDADES_DE_CARTA['Outro']
}

/** Posição da raridade na lista do jogo (pra ordenar); sem raridade = -1; fora da lista = depois de todas. */
export function pesoDaRaridade(jogo: string | null | undefined, raridade: string | null | undefined): number {
  if (!raridade) return -1
  const lista = raridadesDoJogo(jogo)
  const i = lista.findIndex(r => r.toLowerCase() === raridade.toLowerCase())
  return i >= 0 ? i : lista.length
}

/** Compara "015/128" com "199/165" pelo número de verdade; sem número vai pro fim. */
export function compararNumero(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0
  return a.localeCompare(b, 'pt-BR', { numeric: true })
}

/** Categoria gravada no produto da carta (o produto exige uma; não entra nos filtros de Produtos). */
export const CATEGORIA_CARTA_AVULSA = 'Cartas avulsas'

/** "Pokémon · NM · PT" — o que vai embaixo do nome no Mercado e no painel. */
export function resumoCarta(p: Pick<Product, 'cartaJogo' | 'cartaCondicao' | 'cartaIdioma'>): string {
  return [p.cartaJogo, p.cartaCondicao, p.cartaIdioma].filter(Boolean).join(' · ')
}

/** Site da Liga de cada jogo (busca pública de preço). Jogo sem Liga conhecida = sem botão. */
const SITE_DA_LIGA: Record<string, string> = {
  'Pokémon':     'https://www.ligapokemon.com.br',
  'Magic':       'https://www.ligamagic.com.br',
  'Yu-Gi-Oh!':   'https://www.ligayugioh.com.br',
  'One Piece':   'https://www.ligaonepiece.com.br',
  'Digimon':     'https://www.ligadigimon.com.br',
  'Dragon Ball': 'https://www.ligadragonball.com.br',
}

/**
 * Busca da carta na Liga, numa aba nova — o Maikon vê o menor preço sem digitar o nome de novo (áudio de 19/11).
 * É só um atalho: as Ligas não têm API pública e barram robô (Cloudflare), então o sistema não lê o preço sozinho.
 */
export function linkDaLiga(jogo: string | null | undefined, nome: string): string | null {
  const site = jogo ? SITE_DA_LIGA[jogo] : undefined
  const termo = nome.trim()
  if (!site || !termo) return null
  return `${site}/?view=cards/search&card=${encodeURIComponent(termo)}`
}
