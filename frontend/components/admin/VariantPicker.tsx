'use client'
import { useEffect, useState } from 'react'
import { variantApi, ProductVariant } from '@/lib/api'
import { X, Package } from 'lucide-react'
import clsx from 'clsx'
import { useDispensarModal } from '@/lib/useDispensarModal'

interface Props {
  productId: string
  productName: string
  onConfirm: (variant: ProductVariant) => void
  onClose: () => void
}

const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'EG', 'EGG', 'U', 'Único']

export default function VariantPicker({ productId, productName, onConfirm, onClose }: Props) {
  const [variants, setVariants]     = useState<ProductVariant[]>([])
  const [loading, setLoading]       = useState(true)
  const [selColor, setSelColor]     = useState<string | null>(null)
  const [selVariant, setSelVariant] = useState<ProductVariant | null>(null)
  // Esc e clique fora fecham só esta janela (ela abre por cima da Nova Venda)
  const fundo = useDispensarModal(onClose)

  useEffect(() => {
    variantApi.list(productId)
      .then(r => {
        setVariants(r.data)
        // Pré-seleciona a primeira cor disponível
        const firstColor = [...new Set(r.data.map(v => v.color).filter(Boolean))][0] ?? null
        setSelColor(firstColor)
      })
      .finally(() => setLoading(false))
  }, [productId])

  // Cores únicas com estoque > 0 (pelo menos 1 tamanho disponível)
  const colors = [...new Set(variants.map(v => v.color).filter(Boolean))] as string[]
  const colorsWithStock = colors.filter(c =>
    variants.filter(v => v.color === c).some(v => v.stockQuantity > 0)
  )

  // Tamanhos da cor selecionada, ordenados
  const sizesForColor = variants
    .filter(v => v.color === selColor || (!v.color && !selColor))
    .sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a.size ?? '')
      const bi = SIZE_ORDER.indexOf(b.size ?? '')
      if (ai === -1 && bi === -1) return (a.size ?? '').localeCompare(b.size ?? '')
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })

  // Se produto só tem tamanhos (sem cores) ou só cores (sem tamanhos)
  const hasSizes  = variants.some(v => v.size)
  const hasColors = variants.some(v => v.color)

  // Sem grade de cores — mostra diretamente os tamanhos/variantes
  const flatList = !hasColors

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" {...fundo}>
      <div className="bg-surface-800 rounded-2xl w-full max-w-sm shadow-2xl border border-surface-500">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-500">
          <div>
            <p className="text-xs text-gray-400">Selecionar variante</p>
            <h3 className="font-semibold text-white truncate max-w-[240px]">{productName}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Package className="w-5 h-5 animate-pulse mr-2" /> Carregando grade...
            </div>
          ) : variants.length === 0 ? (
            <p className="text-center text-gray-400 py-6">Nenhuma variante cadastrada.</p>
          ) : (
            <>
              {/* Seletor de cor */}
              {hasColors && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">Cor</p>
                  <div className="flex flex-wrap gap-2">
                    {colors.map(color => {
                      const hasStk = colorsWithStock.includes(color)
                      return (
                        <button
                          key={color}
                          onClick={() => { setSelColor(color); setSelVariant(null) }}
                          disabled={!hasStk}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                            selColor === color
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : hasStk
                              ? 'border-surface-500 text-white hover:border-violet-500'
                              : 'border-surface-500 text-gray-400 opacity-40 cursor-not-allowed line-through'
                          )}
                        >
                          {color}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Seletor de tamanho */}
              {hasSizes && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    {hasColors ? 'Tamanho' : 'Variante'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(flatList ? variants : sizesForColor).map(v => {
                      const inStock = v.stockQuantity > 0
                      const label   = flatList ? v.label || v.size || v.color || '-' : (v.size || v.label || '-')
                      return (
                        <button
                          key={v.id}
                          onClick={() => inStock && setSelVariant(v)}
                          disabled={!inStock}
                          className={clsx(
                            'relative px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                            selVariant?.id === v.id
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : inStock
                              ? 'border-surface-500 text-white hover:border-violet-500'
                              : 'border-surface-500 text-gray-400 opacity-40 cursor-not-allowed'
                          )}
                          title={inStock ? `${v.stockQuantity} em estoque` : 'Sem estoque'}
                        >
                          {label}
                          {!inStock && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="w-full h-px bg-gray-400 rotate-45 opacity-60" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Sem tamanhos — produto só tem cores */}
              {!hasSizes && hasColors && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">Cor</p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map(v => {
                      const inStock = v.stockQuantity > 0
                      return (
                        <button
                          key={v.id}
                          onClick={() => inStock && setSelVariant(v)}
                          disabled={!inStock}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                            selVariant?.id === v.id
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : inStock
                              ? 'border-surface-500 text-white hover:border-violet-500'
                              : 'border-surface-500 text-gray-400 opacity-40 cursor-not-allowed line-through'
                          )}
                        >
                          {v.color}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Estoque da variante selecionada */}
              {selVariant && (
                <p className="text-xs text-emerald-400 text-center">
                  {selVariant.stockQuantity} unidade{selVariant.stockQuantity !== 1 ? 's' : ''} em estoque
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-surface-500">
          <button onClick={onClose} className="flex-1 btn-secondary py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => selVariant && onConfirm(selVariant)}
            disabled={!selVariant}
            className="flex-1 btn-primary py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
