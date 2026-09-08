// =============================================================================
// deckRules.ts — Regras de deck usadas na conferência do juiz.
//
// Os limites já existiam dentro do editor de deck do cliente; ficaram aqui pra
// que a conferência do admin julgue pelas MESMAS regras que o cliente vê na hora
// de montar — dois lugares com números diferentes seria pior que não conferir.
// =============================================================================

import { DeckCard } from '@/lib/api'

/** Tamanho máximo do deck por jogo. Jogo desconhecido: 60, o mais comum. */
export const MAX_CARDS: Record<string, number> = {
  Pokemon: 60, MTG: 60, 'Yu-Gi-Oh!': 60, 'One Piece TCG': 50, 'LoL Riftbound': 50,
}

/** Máximo de cópias da mesma carta. */
export const MAX_COPIES: Record<string, number> = {
  Pokemon: 4, MTG: 4, 'Yu-Gi-Oh!': 3, 'One Piece TCG': 4, 'LoL Riftbound': 3,
}

/** Energia (Pokémon) não tem limite de cópias por regra oficial. */
export function copyLimit(card: { type?: string | null }, base: number) {
  return card.type === 'Energy' ? Infinity : base
}

export interface DeckAnalise {
  cartas: DeckCard[]
  /** Soma das quantidades — é isso que o juiz conta na mesa. */
  total: number
  maxCards: number
  maxCopies: number
  /** Menos cartas que o formato pede. */
  faltando: number
  /** Mais cartas que o formato permite. */
  excedendo: number
  /** Cartas repetidas acima do limite de cópias. */
  acimaDoLimite: { name: string; quantity: number; limite: number }[]
  /** Sem nenhum problema encontrado. */
  regular: boolean
  /** cardsJson veio quebrado — mostra na tela em vez de fingir deck vazio. */
  invalido: boolean
}

/** Lê o cardsJson do deck e confere tamanho e cópias contra as regras do jogo. */
export function analisarDeck(cardsJson: string | null | undefined, game: string): DeckAnalise {
  const maxCards  = MAX_CARDS[game]  ?? 60
  const maxCopies = MAX_COPIES[game] ?? 4

  let cartas: DeckCard[] = []
  let invalido = false
  try {
    const parsed = JSON.parse(cardsJson || '[]')
    if (Array.isArray(parsed)) cartas = parsed as DeckCard[]
    else invalido = true
  } catch {
    invalido = true
  }

  const total = cartas.reduce((soma, c) => soma + (c.quantity || 0), 0)
  const acimaDoLimite = cartas
    .filter(c => {
      const limite = copyLimit(c, maxCopies)
      return Number.isFinite(limite) && (c.quantity || 0) > limite
    })
    .map(c => ({ name: c.name, quantity: c.quantity, limite: maxCopies }))

  const faltando  = Math.max(0, maxCards - total)
  const excedendo = Math.max(0, total - maxCards)

  return {
    cartas, total, maxCards, maxCopies,
    faltando, excedendo, acimaDoLimite,
    regular: !invalido && faltando === 0 && excedendo === 0 && acimaDoLimite.length === 0,
    invalido,
  }
}

/** Resumo em uma linha, pro chip da lista de participantes. */
export function resumoDaAnalise(a: DeckAnalise): string {
  if (a.invalido) return 'Deck ilegível'
  if (a.excedendo > 0) return `${a.total} cartas — ${a.excedendo} a mais`
  if (a.faltando  > 0) return `${a.total} cartas — faltam ${a.faltando}`
  if (a.acimaDoLimite.length > 0) return `${a.total} cartas — cópias acima do limite`
  return `${a.total} cartas — regular`
}
