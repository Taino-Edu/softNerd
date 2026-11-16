'use client'
// Aviso que sobe depois do "+ Sacola" do cartão de produto (home e Produtos): nome do item e um
// atalho pra Sacola. Some sozinho (quem chama controla com usePorNaSacola).
import { useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import type { Product } from '@/lib/api'
import { useReservationCart } from '@/hooks/useReservationCart'

/** Põe 1 unidade do produto na Sacola (mesmo item que a página do produto põe) e guarda o nome pro aviso.
 *  Não precisa estar logado: a Sacola fica no navegador e pede o login só na hora de reservar. */
export function usePorNaSacola() {
  const { addItem } = useReservationCart()
  const [nome, setNome] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function porNaSacola(p: Product) {
    addItem({
      productId: p.id, quantity: 1, productName: p.name,
      productImageUrl: p.imageUrl ?? undefined,
      // Preço de promoção só quando o produto está em promoção
      priceInCents: p.isOnPromo && p.discountPriceInCents ? p.discountPriceInCents : p.priceInCents,
    })
    setNome(p.name)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setNome(null), 3500)
  }

  return { porNaSacola, nome }
}

export default function AvisoSacola({ nome }: { nome: string | null }) {
  if (!nome) return null
  return (
    <div role="status"
      className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{ backgroundColor: '#0F1B33', color: '#FFFFFF' }}>
      <CheckCircle className="w-5 h-5 shrink-0" style={{ color: '#2DD4BF' }} />
      <span className="flex-1 min-w-0 text-sm"><span className="block font-black truncate">{nome}</span>foi pra sacola</span>
      <Link href="/cliente/reserva/carrinho" className="shrink-0 text-sm font-black px-3 py-2 rounded-xl"
        style={{ backgroundColor: '#FFE45E', color: '#3D2E00' }}>
        Ver sacola
      </Link>
    </div>
  )
}
