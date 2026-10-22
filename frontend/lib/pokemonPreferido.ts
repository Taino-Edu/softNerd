// pokemonPreferido — "Qual o seu Pokémon preferido?" (v1.65.0, chave pokemon-preferido)
//
// O Pokémon de estimação do perfil (não é o deck do torneio — esse é lib/spritesDeck.ts).
// A lista vem de public/pokedex.json ([[id, nome, número], ...], gerada por scripts/gerar-pokedex.py)
// e só é baixada quando o seletor abre. Sprites do Pokémon Showdown, pelo id:
//   parado   → gen5/{id}.png       (pixel, ~1 KB, igual ao deck)
//   animado  → gen5ani/{id}.gif    (pixel animado, gerações 1–5)
//              ani/{id}.gif        (3D animado, todas as gerações)
// Pastas *-shiny pra versão brilhante. O componente tenta na ordem e cai no parado.

const BASE = 'https://play.pokemonshowdown.com/sprites'

export type PokemonDex = { id: string; nome: string; numero: number }

export function spriteParado(id: string, shiny = false) {
  return `${BASE}/gen5${shiny ? '-shiny' : ''}/${id}.png`
}

/** Candidatos do sprite animado, do mais bonito pro garantido. */
export function spritesAnimados(id: string, shiny = false) {
  const s = shiny ? '-shiny' : ''
  return [`${BASE}/gen5ani${s}/${id}.gif`, `${BASE}/ani${s}/${id}.gif`, spriteParado(id, shiny)]
}

let cache: Promise<PokemonDex[]> | null = null

/** Lista completa (1140 Pokémon), baixada uma vez por visita. */
export function carregarPokedex(): Promise<PokemonDex[]> {
  cache ??= fetch('/pokedex.json')
    .then(r => { if (!r.ok) throw new Error('pokedex'); return r.json() as Promise<[string, string, number][]> })
    .then(l => l.map(([id, nome, numero]) => ({ id, nome, numero })))
    .catch(e => { cache = null; throw e })
  return cache
}

function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Busca por nome ("pika", "raichu alola") ou número ("25", "#025"). Começo do nome vem primeiro. */
export function buscarPokemon(lista: PokemonDex[], termo: string, limite = 60): PokemonDex[] {
  const t = semAcento(termo).replace(/^#/, '')
  if (!t) return []
  if (/^\d+$/.test(t)) return lista.filter(p => p.numero === Number(t)).slice(0, limite)
  const palavras = t.split(/\s+/)
  const achados = lista.filter(p => { const n = semAcento(p.nome); return palavras.every(w => n.includes(w)) })
  return achados
    // Quem começa com o termo vem antes (0 < 1); sem isso "m" escondia o Mew depois do corte de 60
    .sort((a, b) => Number(!semAcento(a.nome).startsWith(palavras[0])) - Number(!semAcento(b.nome).startsWith(palavras[0])) || a.numero - b.numero)
    .slice(0, limite)
}

/** Os que mais aparecem quando se pergunta "qual o seu preferido" — a grade antes de digitar. */
export const QUERIDINHOS = [
  'pikachu', 'eevee', 'charizard', 'gengar', 'lucario', 'mewtwo', 'greninja', 'umbreon',
  'sylveon', 'gardevoir', 'snorlax', 'mimikyu', 'bulbasaur', 'squirtle', 'charmander', 'dragonite',
  'rayquaza', 'arcanine', 'lapras', 'mew', 'espeon', 'blaziken', 'ogerpon', 'sprigatito',
]

export function sortear(lista: PokemonDex[]): PokemonDex {
  return lista[Math.floor(Math.random() * lista.length)]
}

/** Nome pra legenda sem baixar a lista: "raichu-alola" → "Raichu Alola". */
export function nomeDoId(id: string) {
  return id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

/** Número no jeito da Pokédex: #025. */
export function numeroDex(n: number) {
  return `#${String(n).padStart(3, '0')}`
}
