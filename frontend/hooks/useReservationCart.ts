'use client'

import { useCallback, useEffect, useState } from 'react'

export interface ReservationCartItem {
  productId: string
  variantId?: string
  quantity: number
  productName: string
  productImageUrl?: string
  variantLabel?: string
  priceInCents: number
}

const STORAGE_KEY  = 'reservationCart'
const UPDATE_EVENT = 'reservation-cart-updated'

function readCart(): ReservationCartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeCart(items: ReservationCartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

const itemKey = (i: Pick<ReservationCartItem, 'productId' | 'variantId'>) => `${i.productId}:${i.variantId ?? ''}`

/** Carrinho de reserva persistido em localStorage — sobrevive navegação entre páginas de produto
 * até o cliente confirmar tudo de uma vez em /cliente/reserva/carrinho. */
export function useReservationCart() {
  const [items, setItems] = useState<ReservationCartItem[]>([])

  useEffect(() => {
    setItems(readCart())
    const onUpdate = () => setItems(readCart())
    window.addEventListener(UPDATE_EVENT, onUpdate)
    window.addEventListener('storage', onUpdate)
    return () => {
      window.removeEventListener(UPDATE_EVENT, onUpdate)
      window.removeEventListener('storage', onUpdate)
    }
  }, [])

  const addItem = useCallback((item: ReservationCartItem) => {
    const current  = readCart()
    const existing = current.find(i => itemKey(i) === itemKey(item))
    const next = existing
      ? current.map(i => itemKey(i) === itemKey(item) ? { ...i, quantity: i.quantity + item.quantity } : i)
      : [...current, item]
    writeCart(next)
  }, [])

  const removeItem = useCallback((productId: string, variantId?: string) => {
    writeCart(readCart().filter(i => itemKey(i) !== itemKey({ productId, variantId })))
  }, [])

  const updateQuantity = useCallback((productId: string, variantId: string | undefined, quantity: number) => {
    writeCart(readCart().map(i =>
      itemKey(i) === itemKey({ productId, variantId }) ? { ...i, quantity: Math.max(1, quantity) } : i
    ))
  }, [])

  const clear = useCallback(() => writeCart([]), [])

  const totalItems = items.reduce((s, i) => s + i.quantity, 0)
  const totalCents  = items.reduce((s, i) => s + i.priceInCents * i.quantity, 0)

  return { items, addItem, removeItem, updateQuantity, clear, totalItems, totalCents }
}
