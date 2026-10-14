'use client'
// Sprite(s) em pixel do deck (lib/spritesDeck.ts). Deck que não vira Pokémon conhecido
// (nome livre, sprite fora do ar) cai no ícone de cartas — nunca imagem quebrada.
import { useState } from 'react'
import { Layers } from 'lucide-react'
import { spritesDoDeck } from '@/lib/spritesDeck'

export default function SpriteDeck({ deck, tamanho = 40, className = '' }: {
  deck: string | null | undefined
  /** Lado em px de cada sprite (os do Showdown são 96×96: múltiplos de 48 ficam mais nítidos). */
  tamanho?: number
  className?: string
}) {
  const urls = spritesDoDeck(deck)
  const [falhou, setFalhou] = useState<Record<string, boolean>>({})
  const visiveis = urls.filter(u => !falhou[u])

  if (visiveis.length === 0) {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 opacity-60 ${className}`}
        style={{ width: tamanho, height: tamanho }} title={deck ?? undefined}>
        <Layers style={{ width: tamanho * 0.45, height: tamanho * 0.45 }} />
      </span>
    )
  }

  return (
    <span className={`inline-flex items-end shrink-0 ${className}`} title={deck ?? undefined}>
      {visiveis.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async"
          onError={() => setFalhou(f => ({ ...f, [u]: true }))}
          className="object-contain"
          style={{ width: tamanho, height: tamanho, imageRendering: 'pixelated', marginLeft: i > 0 ? -tamanho * 0.3 : 0 }} />
      ))}
    </span>
  )
}
