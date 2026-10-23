'use client'
// A "fotinha" do jogador na liguinha (pedido do Maikon, v1.67.0): o Pokémon preferido que ele
// escolheu na conta (chave pokemon-preferido). Sem Pokémon escolhido — ou com a chave desligada —
// a foto continua saindo do deck, como antes (SpriteDeck). O nome do deck segue em texto, embaixo
// do nome, em cada tela que já mostrava: deck com nome livre não vira figura, o Pokémon sempre vira.
import SpriteDeck from '@/components/liga/SpriteDeck'
import PokemonParceiro from '@/components/pokemon/PokemonParceiro'
import { useFuncionalidade } from '@/lib/useFuncionalidade'

export default function AvatarJogador({ pokemon, shiny = false, deck, tamanho = 40, animado = false, className = '' }: {
  pokemon?: string | null
  shiny?: boolean
  deck?: string | null
  /** Lado em px. */
  tamanho?: number
  /** Animado nos lugares grandes (pódio, comemoração); parado nas listas. */
  animado?: boolean
  className?: string
}) {
  const ligado = useFuncionalidade('pokemon-preferido') === true
  if (ligado && pokemon)
    return <PokemonParceiro id={pokemon} shiny={shiny} tamanho={tamanho} animado={animado} className={className} />
  return <SpriteDeck deck={deck} tamanho={tamanho} className={className} />
}
