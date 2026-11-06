'use client'

// =============================================================================
// AvatarCliente — a bolinha da conta no topo (área do cliente e menu da loja).
// Ordem: foto da conta → Pokémon preferido (o parceiro escolhido no cadastro) →
// inicial do nome. Antes mostrava só a inicial ("C") mesmo com o Pikachu escolhido.
// =============================================================================

import { User as UserIcon } from 'lucide-react'
import { spriteParado } from '@/lib/pokemonPreferido'

interface Props {
  nome?: string | null
  fotoUrl?: string | null
  pokemon?: string | null
  shiny?: boolean
  /** Lado em px (o círculo é quadrado). */
  tamanho?: number
  corFundo: string
  corTexto: string
  className?: string
}

export default function AvatarCliente({ nome, fotoUrl, pokemon, shiny, tamanho = 40, corFundo, corTexto, className = '' }: Props) {
  const lado = { width: tamanho, height: tamanho }
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt={nome ?? 'Minha conta'} style={lado} className={`rounded-full object-cover ${className}`} />
  }
  if (pokemon) {
    return (
      <span style={{ ...lado, backgroundColor: corFundo }} className={`rounded-full flex items-center justify-center overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteParado(pokemon, shiny)} alt={nome ?? 'Minha conta'} className="w-[170%] h-[170%] max-w-none object-contain"
          style={{ imageRendering: 'pixelated' }} />
      </span>
    )
  }
  return (
    <span style={{ ...lado, backgroundColor: corFundo, color: corTexto, fontSize: Math.round(tamanho * 0.35) }}
      className={`rounded-full flex items-center justify-center font-black ${className}`}>
      {nome?.trim().charAt(0).toUpperCase() || <UserIcon className="w-1/2 h-1/2" />}
    </span>
  )
}
