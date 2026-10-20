// spritesDeck — o deck que o jogador digitou ("Charizard ex", "Dragapult/Pidgeot", "Lost Box")
// vira o sprite em pixel do(s) Pokémon principal(is), como as ferramentas da comunidade TCG fazem.
//
//   spritesDoDeck('Charizard ex / Pidgeot ex')   → [[charizard], [pidgeot]]
//   spritesDoDeck('Lost Box')                    → [[comfey]]            (arquétipo conhecido)
//   spritesDoDeck('Mega Lucario ex')             → [[lucario-mega, …]]   (formato Mega Evolution)
//   spritesDoDeck('Mewtwo ex da Equipe Rocket')  → [[mewtwo]]            (tira dono/treinador)
//   spritesDoDeck('Arceus Giratina')             → [[arceusgiratina, arceus, giratina]]
//   spritesDoDeck('Meu deck legal')              → candidatos que não existem — o <SpriteDeck>
//                                                  tenta um a um e cai no ícone genérico (onError)
//
// Cada parte do deck vira uma LISTA de candidatos em ordem; o componente mostra o primeiro que
// carregar. Sprites do Pokémon Showdown, estilo 5ª geração (pixel, ~1 KB cada), buscados pelo nome.
// Uso combinado com o Taino em 14/10/2026: sprite só pra identificar o deck, não como enfeite.

const BASE = 'https://play.pokemonshowdown.com/sprites/gen5'

/** Arquétipos e apelidos que não são o nome do Pokémon. */
const APELIDOS: Record<string, string> = {
  lostbox: 'comfey', lostzone: 'comfey', lz: 'comfey',
  zard: 'charizard', gardy: 'gardevoir', pult: 'dragapult',
  lugiavstar: 'lugia', miraidonex: 'miraidon',
  palkia: 'palkia-origin', giratina: 'giratina-origin', dialga: 'dialga-origin',
  ogerpon: 'ogerpon', terapagos: 'terapagos', futurebox: 'ironhands', ancientbox: 'roaringmoon',
  terabox: 'terapagos',
}

/** Sufixos de carta que não fazem parte do nome do Pokémon. */
const SUFIXOS = /\s+(ex|v|vstar|vmax|v-union|gx|break|lv\.?x|prime|star|δ)$/i

/** Palavras de estratégia/lista que o jogador escreve junto ("Snorlax stall", "Turbo Dragapult"). */
const ESTRATEGIA = /\b(stall|control|controle|toolbox|turbo|deck|combo|lista|list|variante|variant|aggro|mill)\b/g

/** Dono/treinador da carta: "Team Rocket's Mewtwo", "Ethan's Ho-Oh", "Mewtwo da Equipe Rocket", "Ho-Oh de Ethan". */
const DONO_ANTES = /^(team rocket|equipe rocket|[a-z]+)'s\s+/
const DONO_DEPOIS = /\s+(da|de|do|dos|das)\s+.+$/

function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Nome do arquivo no Showdown: só letras e números ("Chien-Pao" → chienpao, "Ho-Oh" → hooh).
 *  Hífen só existe nas formas montadas aqui (lucario-mega) ou nos apelidos (palkia-origin). */
function limpaId(s: string) {
  return s.replace(/[^a-z0-9]/g, '')
}

/** Candidatos de arquivo (sem .png) pra uma parte do deck, do mais provável pro menos. */
export function candidatosDoPokemon(parte: string): string[] {
  let nome = semAcento(parte).trim().toLowerCase().replace(/[’`]/g, "'")
  if (!nome) return []
  for (let i = 0; i < 3 && SUFIXOS.test(nome); i++) nome = nome.replace(SUFIXOS, '').trim()
  nome = nome.replace(DONO_ANTES, '').replace(DONO_DEPOIS, '').trim()
  for (let i = 0; i < 3 && SUFIXOS.test(nome); i++) nome = nome.replace(SUFIXOS, '').trim()
  // "Origin Forme Palkia" / "Palkia Origem" → palkia (o apelido devolve a forma)
  nome = nome.replace(/\b(origin|origem|forme|forma)\b/g, '').replace(ESTRATEGIA, '').replace(/\s+/g, ' ').trim()
  if (!nome) return []

  // Ogerpon com máscara: "Cornerstone Ogerpon", "Ogerpon Wellspring" → ogerpon-cornerstone (cor da máscara)
  const mascara = /\b(cornerstone|wellspring|hearthflame)\b/.exec(nome)
  if (mascara && nome.includes('ogerpon')) return [`ogerpon-${mascara[1]}`, 'ogerpon']

  const juntos = limpaId(nome.replace(/\s+/g, ''))
  if (APELIDOS[juntos]) return [APELIDOS[juntos]]

  // Mega Evolution: "Mega Lucario" → lucario-mega; "Mega Charizard X" → charizard-megax
  const mega = /^mega\s+(.+?)(?:\s+([xy]))?$/.exec(nome)
  if (mega) {
    const base = limpaId(mega[1].replace(/\s+/g, ''))
    const alvo = APELIDOS[base]?.replace(/-.*$/, '') ?? base
    return [...new Set([mega[2] ? `${alvo}-mega${mega[2]}` : `${alvo}-mega`, `${alvo}-megax`, alvo])].filter(Boolean)
  }

  // Duas palavras sem separador ("Arceus Giratina"): tenta junto e depois cada uma
  const palavras = nome.split(' ').map(p => limpaId(p)).filter(p => p.length > 2)
  const lista = [juntos, ...palavras.map(p => APELIDOS[p] ?? p)]
  return [...new Set(lista.filter(Boolean))]
}

/** Compatibilidade: o primeiro candidato da parte (ou null). */
export function idDoPokemon(parte: string): string | null {
  return candidatosDoPokemon(parte)[0] ?? null
}

/** Até 2 Pokémon por deck (o par principal, como "Charizard/Pidgeot"); cada um com seus candidatos em URL. */
export function spritesDoDeck(deck: string | null | undefined): string[][] {
  if (!deck) return []
  const partes = deck.split(/\s*(?:\/|\+|&|,|\be\b|\bcom\b)\s*/i).filter(Boolean)
  const vistos = new Set<string>()
  const saida: string[][] = []
  for (const parte of partes) {
    const cands = candidatosDoPokemon(parte).filter(c => !vistos.has(c))
    if (!cands.length) continue
    vistos.add(cands[0])
    saida.push(cands.map(id => `${BASE}/${id}.png`))
    if (saida.length === 2) break
  }
  return saida
}
