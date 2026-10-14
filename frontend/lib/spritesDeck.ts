// spritesDeck — o deck que o jogador digitou ("Charizard ex", "Dragapult/Pidgeot", "Lost Box")
// vira o sprite em pixel do(s) Pokémon principal(is), como as ferramentas da comunidade TCG fazem.
//
//   spritesDoDeck('Charizard ex / Pidgeot ex')  → [url do charizard, url do pidgeot]
//   spritesDoDeck('Lost Box')                   → [url do comfey]   (arquétipo conhecido)
//   spritesDoDeck('Meu deck legal')             → [url de "meudecklegal"] — não existe e o
//                                                  <SpriteDeck> cai no ícone genérico (onError)
//
// Sprites do Pokémon Showdown, estilo 5ª geração (pixel, ~1 KB cada), buscados pelo nome.
// Uso combinado com o Taino em 14/10/2026: sprite só pra identificar o deck, não como enfeite.

const BASE = 'https://play.pokemonshowdown.com/sprites/gen5'

/** Arquétipos e apelidos que não são o nome do Pokémon. */
const APELIDOS: Record<string, string> = {
  lostbox: 'comfey', lostzone: 'comfey', lz: 'comfey',
  zard: 'charizard', gardy: 'gardevoir', pult: 'dragapult',
  lugiavstar: 'lugia', miraidonex: 'miraidon',
  palkia: 'palkia-origin', giratina: 'giratina-origin', dialga: 'dialga-origin',
  ogerpon: 'ogerpon', terapagos: 'terapagos', futurebox: 'ironhands', ancientbox: 'roaringmoon',
}

/** Sufixos de carta que não fazem parte do nome do Pokémon. */
const SUFIXOS = /\s+(ex|v|vstar|vmax|v-union|gx|break|lv\.?x|prime|star|δ)$/i

function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Nome de um Pokémon do jeito que o Showdown usa no arquivo: "Chien-Pao ex" → "chienpao". */
export function idDoPokemon(parte: string): string | null {
  let nome = semAcento(parte).trim().toLowerCase()
  if (!nome) return null
  for (let i = 0; i < 3 && SUFIXOS.test(nome); i++) nome = nome.replace(SUFIXOS, '').trim()
  // "Origin Forme Palkia" / "Palkia Origem" → palkia (o apelido devolve a forma)
  nome = nome.replace(/\b(origin|origem|forme|forma)\b/g, '').trim()
  const id = nome.replace(/[^a-z0-9]/g, '')
  if (!id) return null
  return APELIDOS[id] ?? id
}

/** Até 2 sprites por deck (o par principal, como "Charizard/Pidgeot"). */
export function spritesDoDeck(deck: string | null | undefined): string[] {
  if (!deck) return []
  const partes = deck.split(/\s*(?:\/|\+|&|,|\be\b|\bcom\b)\s*/i).filter(Boolean)
  const ids = [...new Set(partes.map(idDoPokemon).filter((id): id is string => !!id))]
  return ids.slice(0, 2).map(id => `${BASE}/${id}.png`)
}
