'use client'
// O Pokémon preferido sentado ao lado da foto na Minha Conta. Tocar nele faz carinho:
// ele pula e sobe um coração (globals.css → .pokemon-pula / .pokemon-coracao).
import { useState } from 'react'
import { Heart } from 'lucide-react'
import PokemonParceiro from './PokemonParceiro'

export default function ParceiroDaConta({ id, shiny, nome }: { id: string; shiny: boolean; nome?: string }) {
  const [carinhos, setCarinhos] = useState(0)

  return (
    <button type="button" onClick={() => setCarinhos(c => c + 1)}
      className="relative w-16 h-16 flex items-end justify-center active:scale-95 transition-transform"
      aria-label={`Fazer carinho${nome ? ` no ${nome}` : ''}`} title={nome}>
      {/* A key reinicia o pulo a cada toque */}
      <span key={carinhos} className={carinhos > 0 ? 'pokemon-pula block' : 'block'}>
        <PokemonParceiro id={id} shiny={shiny} tamanho={64} titulo={nome} />
      </span>
      {carinhos > 0 && (
        <Heart key={`c${carinhos}`} aria-hidden
          className="pokemon-coracao absolute left-1/2 top-0 w-5 h-5"
          style={{ color: '#FF5C8A', fill: '#FF5C8A' }} />
      )}
    </button>
  )
}
