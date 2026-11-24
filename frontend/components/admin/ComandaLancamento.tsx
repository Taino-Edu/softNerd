'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { ArrowRight, Camera, ClipboardList, Loader2, Plus, ScanBarcode, Search, XCircle } from 'lucide-react'
import { categoryApi, comandaApi, productApi, type ComandaDto, type Product, type ProductCategory } from '@/lib/api'
import { brl as fmt } from '@/lib/format'
import CameraScanner from '@/components/CameraScanner'
import ComandaResumo from './ComandaResumo'
import { AbasPdv, CabecalhoPdv, CatalogoPdv, RODAPE_PDV, categoriasDoCatalogo, precoProdutoPdv } from './PdvProdutos'
import { useMarcarRodapeFixo } from '@/lib/rodapeFixo'

// ── Modal: adicionar item a uma comanda ───────────────────────────────────────

export default function ComandaLancamento({
  comanda, onClose, onAdded, onFechar,
}: {
  comanda: ComandaDto
  onFechar?: () => void
  onClose: () => void
  onAdded: (updated: ComandaDto) => void
}) {
  const [products, setProducts]         = useState<Product[]>([])
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [mode, setMode]                 = useState<'search' | 'barcode'>('search')
  const [cameraOpen, setCameraOpen]     = useState(false)
  const barcodeRef                      = useRef<HTMLInputElement>(null)
  const tituloRef                       = useRef<HTMLHeadingElement>(null)
  const adicionando                     = useRef(false)
  const [categoria, setCategoria]       = useState<string | null>(null)
  const [todasCategorias, setTodasCategorias] = useState<ProductCategory[]>([])
  const [aba, setAba]                   = useState<'catalogo' | 'lista'>('catalogo')
  const responsivo = Boolean(onFechar)
  useMarcarRodapeFixo(responsivo)

  useEffect(() => {
    if (responsivo) categoryApi.list().then(r => setTodasCategorias(r.data)).catch(() => {})
  }, [responsivo])

  useEffect(() => {
    productApi.listAdmin()
      .then(r => setProducts(r.data.filter(p => p.isActive && p.stockQuantity > 0)))
      .catch(() => toast.error('Erro ao carregar produtos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mode === 'barcode' && !responsivo) {
      const timer = setTimeout(() => barcodeRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [mode, responsivo])

  useEffect(() => {
    if (responsivo) tituloRef.current?.focus()
  }, [responsivo])

  async function handleAdd(product: Product) {
    if (adicionando.current) return
    adicionando.current = true
    setAdding(product.id)
    try {
      const { data } = await comandaApi.addItem(comanda.id, {
        productId:        product.id,
        itemName:         product.name,
        unitPriceInCents: precoProdutoPdv(product),
        quantity:         1,
      })
      onAdded(data)
      if (responsivo) {
        setProducts(atuais => atuais.map(p => p.id === product.id
          ? { ...p, stockQuantity: Math.max(0, p.stockQuantity - 1) }
          : p))
      }
      toast.success(`${product.name} adicionado!`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao adicionar item.')
    } finally {
      adicionando.current = false
      setAdding(null)
    }
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code) return
    setBarcodeLoading(true)
    try {
      const { data } = await productApi.getByBarcode(code)
      await handleAdd(data)
      setBarcodeInput('')
    } catch {
      toast.error('Produto não encontrado para este código de barras.')
    } finally {
      setBarcodeLoading(false)
      barcodeRef.current?.focus()
    }
  }

  async function handleCameraDetect(code: string) {
    setCameraOpen(false)
    setBarcodeLoading(true)
    try {
      const { data } = await productApi.getByBarcode(code)
      await handleAdd(data)
      setBarcodeInput('')
    } catch {
      toast.error('Produto não encontrado para este código de barras.')
    } finally {
      setBarcodeLoading(false)
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  const camera = cameraOpen && (
      <CameraScanner
        onDetected={handleCameraDetect}
        onClose={() => setCameraOpen(false)}
      />
  )

  if (onFechar) {
    // Mesma tela da Nova venda do PDV (PdvProdutos): cabeçalho com etapas, catálogo e rodapé preso no pé.
    const termo = search.trim().toLowerCase()
    const catalogo = products.filter(p => (!categoria || categoria === p.category) && (!termo ||
      p.name.toLowerCase().includes(termo) || p.category.toLowerCase().includes(termo) || p.barcode?.includes(search.trim())))
    const ocupado = adding !== null
    const quantidade = comanda.items.reduce((soma, item) => soma + item.quantity, 0)
    const total = Math.max(0, comanda.totalInReais - comanda.pointsApplied / 100)
    const lerCodigo = (codigo: string) => {
      const produto = products.find(p => p.barcode === codigo.trim())
      if (produto && produto.stockQuantity > 0) void handleAdd(produto)
      else toast.error(`Nenhum produto à venda com o código ${codigo}.`)
    }
    return (
      <section aria-label="Lançamento da comanda" className="min-w-0 rounded-xl border bg-[var(--bg-card)]">
        <CabecalhoPdv titulo="Adicionar itens" tituloRef={tituloRef} sair={onClose} rotuloSair="Voltar às comandas" desabilitado={ocupado}
          subtitulo={`${comanda.userName}${comanda.tableIdentifier ? ` · Mesa ${comanda.tableIdentifier}` : ''}`}
          icone={<ClipboardList aria-hidden="true" className="h-5 w-5 text-brand-400" />}
          etapas={['Itens', 'Fechamento']} etapa={1} />
        <div className="min-w-0 p-3 sm:p-5">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,1fr)_minmax(0,2fr)] lg:gap-4">
            <AbasPdv aba={aba} mudar={setAba} rotuloLista={`Comanda (${quantidade})`} />
            <div className={clsx('min-w-0 lg:col-start-1 lg:row-start-1 lg:block', aba === 'lista' ? 'block' : 'hidden')}>
              <ComandaResumo comanda={comanda} />
            </div>
            {loading ? <p role="status" className="py-4 text-sm text-[var(--text-muted)]">Carregando produtos…</p> : (
              <CatalogoPdv produtos={catalogo} categorias={categoriasDoCatalogo(products, todasCategorias)}
                categoria={categoria} selecionarCategoria={setCategoria} busca={search} buscar={setSearch}
                podeAdicionar={p => p.stockQuantity > 0} adicionar={p => void handleAdd(p)} lerCodigo={lerCodigo}
                adicionando={adding} ocupado={ocupado} escolheOpcao={false}
                className={clsx('lg:col-start-2 lg:row-start-1 lg:flex', aba === 'catalogo' ? 'flex' : 'hidden')} />
            )}
          </div>
        </div>
        <div className={RODAPE_PDV}>
          <p aria-live="polite" className="flex w-full items-baseline justify-between gap-2 text-sm font-bold lg:hidden">
            <span>Total da comanda</span><span className="text-lg tabular-nums">{fmt(total)}</span>
          </p>
          <div className="hidden lg:block lg:flex-1" />
          <button onClick={onFechar} disabled={ocupado} className="btn-primary min-h-11 flex-1 justify-center text-sm disabled:opacity-50">
            Ir para fechamento <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
    {camera}
    {/* FALLBACK da chave "comanda-telas" */}
    {/* Clique fora nao fecha: a busca e a quantidade digitadas iriam junto. */}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-md max-h-[75vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-surface-500">
          <h3 className="font-semibold text-white">Adicionar produto à comanda</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs busca / barcode */}
        <div className="flex border-b border-surface-500">
          <button
            onClick={() => setMode('search')}
            className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
              mode === 'search' ? 'text-brand-400 border-b-2 border-brand-400 -mb-px' : 'text-gray-500 hover:text-gray-300')}
          >
            <Search className="w-3.5 h-3.5" /> Buscar
          </button>
          <button
            onClick={() => setMode('barcode')}
            className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
              mode === 'barcode' ? 'text-brand-400 border-b-2 border-brand-400 -mb-px' : 'text-gray-500 hover:text-gray-300')}
          >
            <ScanBarcode className="w-3.5 h-3.5" /> Código de Barras
          </button>
        </div>

        {mode === 'barcode' ? (
          <form onSubmit={handleBarcodeSubmit} className="p-4 space-y-3">
            <p className="text-xs text-gray-500">Clique no campo e escaneie com o leitor USB ou use a câmera.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  ref={barcodeRef}
                  className="input pl-9 font-mono"
                  placeholder="Aguardando leitura..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="shrink-0 px-3 rounded-lg bg-surface-600 hover:bg-brand-600/20 border border-surface-500 hover:border-brand-500/40 text-gray-400 hover:text-brand-400 transition-colors"
                title="Usar câmera"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <button
              type="submit"
              disabled={!barcodeInput.trim() || barcodeLoading}
              className="btn-primary w-full justify-center"
            >
              {barcodeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {barcodeLoading ? 'Buscando...' : 'Adicionar'}
            </button>
          </form>
        ) : (
          <>
            <div className="p-3 border-b border-surface-500">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  autoFocus
                  className="input pl-9 text-sm"
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Nenhum produto encontrado</p>
              ) : (
                filtered.map(p => {
                  const onPromo = p.isOnPromo && p.discountPriceInReais != null
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleAdd(p)}
                      disabled={adding === p.id}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-500 transition-colors text-left disabled:opacity-50"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-white font-medium">{p.name}</p>
                          {onPromo && (
                            <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400">
                              Promoção
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{p.category} · {p.stockQuantity} un.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {onPromo ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-gray-500 line-through">{fmt(p.priceInReais)}</span>
                            <span className="text-red-400 text-sm font-bold">{fmt(p.discountPriceInReais!)}</span>
                          </div>
                        ) : (
                          <span className="text-accent-gold text-sm font-bold">{fmt(p.priceInReais)}</span>
                        )}
                        {adding === p.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                          : <Plus className="w-4 h-4 text-brand-400" />
                        }
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
