'use client'
// O Pokémon preferido do cliente, animado (lib/pokemonPreferido.ts). Tenta o pixel animado,
// depois o 3D animado e por fim o sprite parado; se nenhum carregar, não mostra nada —
// nunca imagem quebrada. "pulando" dá uns pulinhos quando muda (escolheu agora).
import { useEffect, useState } from 'react'
import { spritesAnimados, spriteParado } from '@/lib/pokemonPreferido'

export default function PokemonParceiro({ id, shiny = false, tamanho = 64, animado = true, className = '', titulo }: {
  id: string
  shiny?: boolean
  /** Lado em px. */
  tamanho?: number
  /** false = sprite parado (listas, lugares pequenos). */
  animado?: boolean
  className?: string
  titulo?: string
}) {
  const candidatos = animado ? spritesAnimados(id, shiny) : [spriteParado(id, shiny)]
  const [tentativa, setTentativa] = useState(0)
  const [pulando, setPulando] = useState(false)

  // Trocou de Pokémon (ou de shiny): recomeça os candidatos e comemora
  useEffect(() => {
    setTentativa(0)
    setPulando(true)
    const t = setTimeout(() => setPulando(false), 900)
    return () => clearTimeout(t)
  }, [id, shiny])

  const url = candidatos[tentativa]
  if (!url) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={url} src={url} alt={titulo ?? ''} title={titulo} width={tamanho} height={tamanho} decoding="async"
      onError={() => setTentativa(t => t + 1)}
      className={`object-contain select-none pointer-events-none ${pulando ? 'pokemon-pula' : ''} ${className}`}
      style={{ width: tamanho, height: tamanho, imageRendering: url.includes('/ani') && !url.includes('gen5') ? 'auto' : 'pixelated' }} />
  )
}
