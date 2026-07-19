'use client'
import { useEffect, useRef, useState } from 'react'
import { productApi, variantApi, categoryApi, reservationApi, fiscalApi, Product, ProductCategory, ProductVariant, AdminReservation, NaturezaOperacaoDto } from '@/lib/api'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, AlertTriangle, Package, Search, X, Loader2, Check, ScanBarcode, Camera, Download, FileText, BarChart2, Layers, DollarSign, TrendingDown, CircleOff, Grid3X3, ChevronDown, ChevronUp, Users, Bell } from 'lucide-react'
import ImageUpload from '@/components/admin/ImageUpload'
import { gerarRelatorioOperacional, gerarRelatorioGerencial } from '@/lib/relatorio-estoque'
import CameraScanner from '@/components/CameraScanner'
import { startHub, stopHub } from '@/lib/signalr'

// ── Drawer de detalhe do produto ─────────────────────────────────────────────
function ProductDrawer({ product, onClose, onEdit, onStock }: {
  product: Product
  onClose: () => void
  onEdit:  () => void
  onStock: (id: string, delta: number) => void
}) {
  const [imgIdx, setImgIdx] = useState(0)
  const [wlEntries, setWlEntries] = useState<AdminReservation[]>([])
  const [wlLoading, setWlLoading] = useState(false)
  const [wlTotal,   setWlTotal]   = useState(0)

  const images   = product.imageUrls?.length > 0 ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []
  const minStock = product.minimumStock ?? 5
  const stockPct = minStock > 0 ? Math.min(100, (product.stockQuantity / minStock) * 100) : 100
  const valorImob = product.stockQuantity * (product.costPriceInCents / 100)

  useEffect(() => {
    if (!product.isPreVenda) return
    setWlLoading(true)
    reservationApi.list({ productId: product.id, kind: 'fila', status: 'waiting' })
      .then(r => {
        setWlEntries([...r.data.items].sort((a, b) => (a.posicaoFila ?? 999) - (b.posicaoFila ?? 999)))
        setWlTotal(r.data.total)
      })
      .catch(() => {})
      .finally(() => setWlLoading(false))
  }, [product.id, product.isPreVenda])

  async function removeFromQueue(entryId: string) {
    try {
      await reservationApi.updateStatus(entryId, 'cancelled')
      setWlEntries(prev => {
        const updated = prev.filter(e => e.id !== entryId)
        setWlTotal(updated.length)
        return updated
      })
      toast.success('Removido da fila')
    } catch { toast.error('Erro ao remover') }
  }

  const status =
    product.stockQuantity === 0 ? { label: 'Zerado',        cls: 'text-red-400 bg-red-500/15 border-red-500/30'     } :
    product.isLowStock          ? { label: 'Estoque Baixo', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' } :
                                  { label: 'Normal',        cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-surface-800 border-l border-surface-500 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600 shrink-0">
          <span className="text-sm font-semibold text-gray-300">Detalhes do Produto</span>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5">
              <Edit2 className="w-3.5 h-3.5" /> Editar
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-500 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Imagem */}
          {images.length > 0 ? (
            <div className="space-y-2">
              <div className="aspect-square rounded-xl overflow-hidden bg-surface-700 border border-surface-600">
                <img src={images[imgIdx]} alt={product.name} className="w-full h-full object-contain" />
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 justify-center flex-wrap">
                  {images.map((url, i) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === imgIdx ? 'border-brand-400' : 'border-surface-600 opacity-40 hover:opacity-70'}`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-square rounded-xl bg-surface-700 border border-surface-600 flex items-center justify-center">
              <Package className="w-16 h-16 text-gray-600" />
            </div>
          )}

          {/* Nome + status + categoria */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
              {product.isPreVenda && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Aceita fila</span>
              )}
              {product.preVendaReleaseDate && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: '#B45309', color: '#fff' }}>
                  Lançamento {new Date(product.preVendaReleaseDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-white leading-snug">{product.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge bg-surface-600 text-gray-300 border-surface-500">{product.category}</span>
              {product.barcode && (
                <span className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                  <ScanBarcode className="w-3 h-3" />{product.barcode}
                </span>
              )}
            </div>
          </div>

          {/* Preços */}
          <div className="bg-surface-700 rounded-xl p-4 space-y-3 border border-surface-600">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Preço de Venda</span>
              <span className="text-lg font-black font-mono text-accent-gold">
                R$ {product.priceInReais.toFixed(2).replace('.', ',')}
              </span>
            </div>
            {product.costPriceInCents > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Custo</span>
                  <span className="text-sm font-mono text-red-400">R$ {product.costPriceInReais.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Margem</span>
                  <span className={`text-sm font-bold font-mono ${product.marginInReais >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {product.marginPercent.toFixed(1)}% · R$ {product.marginInReais.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-600 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${product.marginInReais >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, product.marginPercent))}%` }} />
                </div>
              </>
            )}
          </div>

          {/* Estoque */}
          <div className="bg-surface-700 rounded-xl p-4 space-y-3 border border-surface-600">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Estoque Atual</span>
              <div className="flex items-center gap-2">
                <button onClick={() => onStock(product.id, -1)}
                  className="w-7 h-7 rounded bg-surface-600 hover:bg-red-600/30 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center text-base">−</button>
                <span className={`text-2xl font-black font-mono w-10 text-center ${
                  product.stockQuantity === 0 ? 'text-red-400' : product.isLowStock ? 'text-amber-400' : 'text-white'
                }`}>{product.stockQuantity}</span>
                <button onClick={() => onStock(product.id, +1)}
                  className="w-7 h-7 rounded bg-surface-600 hover:bg-emerald-600/30 text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center text-base">+</button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Mínimo: {minStock} un.</span>
              <span>{product.stockQuantity > 0 ? `${stockPct.toFixed(0)}% do mínimo` : 'Sem estoque'}</span>
            </div>
            <div className="h-2 bg-surface-600 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                product.stockQuantity === 0 ? 'bg-red-500' : product.isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
              }`} style={{ width: `${Math.min(100, stockPct)}%` }} />
            </div>
            {product.costPriceInCents > 0 && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-600">
                <span className="text-gray-500">Valor imobilizado</span>
                <span className="font-mono font-semibold text-brand-400">
                  R$ {valorImob.toFixed(2).replace('.', ',')}
                </span>
              </div>
            )}
          </div>

          {/* ── Fila (produto que ainda não chegou) ── */}
          {product.isPreVenda && (
            <div className="bg-surface-700 rounded-xl border border-purple-500/30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-purple-300">Fila de Espera</span>
                </div>
                <span className="text-xs font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                  {wlTotal} {wlTotal === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </div>

              {wlLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                </div>
              ) : wlEntries.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-5">Ninguém na fila ainda</p>
              ) : (
                <div className="divide-y divide-surface-600 max-h-52 overflow-y-auto">
                  {wlEntries.map(e => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-black text-purple-300 shrink-0">
                        {e.posicaoFila ?? '·'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{e.userName || e.userId}</p>
                        <p className="text-[10px] text-gray-500">{new Date(e.reservedAt).toLocaleDateString('pt-BR')}{e.userWhatsApp ? ` · ${e.userWhatsApp}` : ''}</p>
                      </div>
                      <button
                        onClick={() => removeFromQueue(e.id)}
                        title="Remover da fila"
                        className="p-1 rounded hover:bg-red-600/20 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Painel de grade de variantes ──────────────────────────────────────────────
const SIZES  = ['PP', 'P', 'M', 'G', 'GG', 'XGG']
const COLORS_PRESET = ['Preto', 'Branco', 'Cinza', 'Azul', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Roxo', 'Laranja']

function VariantsPanel({ productId }: { productId: string }) {
  const [variants, setVariants]       = useState<ProductVariant[]>([])
  const [loading, setLoading]         = useState(true)
  const [showBulk, setShowBulk]       = useState(false)
  const [selSizes, setSelSizes]       = useState<string[]>([])
  const [selColors, setSelColors]     = useState<string[]>([])
  const [customColor, setCustomColor] = useState('')
  const [bulkQty, setBulkQty]         = useState(0)
  const [creating, setCreating]       = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [editQty, setEditQty]         = useState(0)

  const load = async () => {
    try { const { data } = await variantApi.list(productId); setVariants(data) }
    catch { toast.error('Erro ao carregar variantes') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [productId])

  const toggleSize  = (s: string) => setSelSizes(p  => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  const toggleColor = (c: string) => setSelColors(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])

  async function addCustomColor() {
    const c = customColor.trim()
    if (!c) return
    if (!selColors.includes(c)) setSelColors(p => [...p, c])
    setCustomColor('')
  }

  async function handleBulk() {
    if (!selSizes.length || !selColors.length) { toast.error('Selecione tamanhos e cores'); return }
    setCreating(true)
    try {
      await variantApi.bulk(productId, selSizes, selColors, bulkQty)
      toast.success('Grade criada!')
      setSelSizes([]); setSelColors([]); setShowBulk(false)
      load()
    } catch { toast.error('Erro ao criar grade') }
    finally { setCreating(false) }
  }

  async function saveEdit(variantId: string) {
    try {
      await variantApi.update(productId, variantId, { stockQuantity: editQty })
      toast.success('Estoque atualizado')
      setEditId(null)
      load()
    } catch { toast.error('Erro ao salvar') }
  }

  async function removeVariant(variantId: string) {
    if (!confirm('Remover variante?')) return
    try { await variantApi.remove(productId, variantId); toast.success('Removida'); load() }
    catch { toast.error('Erro ao remover') }
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>

  const grouped = variants.reduce<Record<string, ProductVariant[]>>((acc, v) => {
    const key = v.size ?? '—'
    if (!acc[key]) acc[key] = []
    acc[key].push(v)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {/* Botão criar grade */}
      <button
        type="button"
        onClick={() => setShowBulk(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 text-sm font-medium transition-colors"
      >
        <span className="flex items-center gap-2"><Grid3X3 className="w-4 h-4" /> Criar grade de tamanhos × cores</span>
        {showBulk ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showBulk && (
        <div className="rounded-xl border border-surface-500 bg-surface-700/50 p-4 space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Tamanhos</p>
            <div className="flex flex-wrap gap-2">
              {SIZES.map(s => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    selSizes.includes(s) ? 'bg-brand-500 border-brand-500 text-white' : 'bg-surface-800 border-surface-500 text-gray-400 hover:border-brand-500/40'
                  }`}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Cores</p>
            <div className="flex flex-wrap gap-2">
              {COLORS_PRESET.map(c => (
                <button key={c} type="button" onClick={() => toggleColor(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    selColors.includes(c) ? 'bg-purple-500 border-purple-500 text-white' : 'bg-surface-800 border-surface-500 text-gray-400 hover:border-purple-500/40'
                  }`}>{c}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                className="input flex-1 text-sm py-1.5"
                placeholder="Cor personalizada..."
                value={customColor}
                onChange={e => setCustomColor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomColor())}
              />
              <button type="button" onClick={addCustomColor} className="btn-secondary px-3 text-xs">Adicionar</button>
            </div>
            {selColors.length > 0 && (
              <p className="text-xs text-purple-400 mt-1">Selecionadas: {selColors.join(', ')}</p>
            )}
          </div>
          <div>
            <label className="label text-xs">Estoque inicial por variante</label>
            <input className="input" type="number" min="0" value={bulkQty} onChange={e => setBulkQty(parseInt(e.target.value) || 0)} />
          </div>
          {selSizes.length > 0 && selColors.length > 0 && (
            <p className="text-xs text-gray-400">
              Serão criadas <span className="text-white font-semibold">{selSizes.length * selColors.length}</span> variantes ({selSizes.join(', ')} × {selColors.join(', ')})
            </p>
          )}
          <button type="button" onClick={handleBulk} disabled={creating} className="btn-primary w-full justify-center text-sm">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Criando...' : 'Criar grade'}
          </button>
        </div>
      )}

      {/* Tabela de variantes */}
      {variants.length > 0 ? (
        <div className="rounded-xl border border-surface-500 overflow-hidden">
          {Object.entries(grouped).map(([size, vars]) => (
            <div key={size}>
              <div className="px-3 py-1.5 bg-surface-700/80 text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-surface-600">
                Tamanho {size}
              </div>
              {vars.map(v => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2 border-b border-surface-700 last:border-0 hover:bg-surface-700/40 group">
                  <span className="text-sm text-gray-300 flex-1">{v.color ?? '—'}</span>
                  {editId === v.id ? (
                    <>
                      <input
                        className="input w-20 text-sm py-1 text-center"
                        type="number" min="0"
                        value={editQty}
                        onChange={e => setEditQty(parseInt(e.target.value) || 0)}
                        autoFocus
                      />
                      <button type="button" onClick={() => saveEdit(v.id)} className="p-1 text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setEditId(null)} className="p-1 text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm font-semibold tabular-nums ${v.stockQuantity === 0 ? 'text-red-400' : v.stockQuantity < 3 ? 'text-amber-400' : 'text-white'}`}>
                        {v.stockQuantity} un
                      </span>
                      <button type="button" onClick={() => { setEditId(v.id); setEditQty(v.stockQuantity) }}
                        className="p-1 text-gray-500 hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => removeVariant(v.id)}
                        className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-2">Nenhuma variante criada ainda.</p>
      )}
    </div>
  )
}

function ProductModal({
  product, categories, naturezas, onClose, onSave,
}: {
  product:    Partial<Product> | null
  categories: ProductCategory[]
  naturezas:  NaturezaOperacaoDto[]
  onClose:    () => void
  onSave:     (p: Partial<Product>) => Promise<void>
}) {
  const [form, setForm]         = useState<Partial<Product>>(product ?? { stockQuantity: 0, minimumStock: 5, priceInCents: 0, costPriceInCents: 0 })
  const [saving, setSaving]     = useState(false)
  const [barcodeScanning, setBarcodeScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const set = (k: keyof Product, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  // Categoria + Subcategoria como dois campos dependentes (Estado → Cidade). O valor salvo em
  // form.category continua sendo só uma string (nome da folha escolhida — subcategoria se houver,
  // senão a categoria principal), sem migração de schema — mesma estratégia documentada no
  // planejamento. selectedTopId é só estado de navegação do formulário, nunca é salvo.
  const activeCategories = categories.filter(c => c.isActive)
  const topCategories     = activeCategories.filter(c => !c.parentCategoryId)
  const [selectedTopId, setSelectedTopId] = useState(() => {
    const current = activeCategories.find(c => c.name === product?.category)
    return current ? (current.parentCategoryId ?? current.id) : ''
  })
  const childCategories = activeCategories.filter(c => c.parentCategoryId === selectedTopId)
  const selectedChildName = childCategories.some(c => c.name === form.category) ? form.category : ''

  function handleTopChange(topId: string) {
    setSelectedTopId(topId)
    const top = topCategories.find(c => c.id === topId)
    set('category', top?.name ?? '')
  }
  function handleChildChange(childName: string) {
    const top = topCategories.find(c => c.id === selectedTopId)
    set('category', childName || top?.name || '')
  }

  async function handleCameraDetected(code: string) {
    setCameraOpen(false)
    set('barcode', code)
    // Tenta buscar produto existente com esse código
    try {
      const { data } = await productApi.getByBarcode(code)
      setForm(data)
      toast.success('Produto encontrado! Editando...')
    } catch {
      toast.success('Código registrado: ' + code)
    }
  }

  async function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Leitores USB enviam Enter após o código — tenta buscar produto existente
    if (e.key === 'Enter' && form.barcode) {
      e.preventDefault()
      setBarcodeScanning(true)
      try {
        const { data } = await productApi.getByBarcode(form.barcode)
        setForm(data) // preenche o form com o produto encontrado (edição rápida)
        toast.success('Produto encontrado! Editando...')
      } catch {
        // Produto não existe — é um produto novo, apenas mantém o código
        toast.success('Código registrado. Preencha os dados do produto.')
      } finally {
        setBarcodeScanning(false)
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <>
    {cameraOpen && (
      <CameraScanner onDetected={handleCameraDetected} onClose={() => setCameraOpen(false)} />
    )}
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 p-4 overflow-y-auto flex items-start sm:items-center justify-center">
      <div className="w-full max-w-md bg-surface-800 border border-surface-600 rounded-2xl shadow-xl max-h-[calc(100dvh-2rem)] flex flex-col my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-600 shrink-0">
          <h2 className="text-lg font-bold text-white">{form.id ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-500 text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 px-6 py-4">
          <div>
            <label className="label">Código de barras</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                className="input pl-9 pr-9"
                value={form.barcode ?? ''}
                onChange={e => set('barcode', e.target.value || null)}
                onKeyDown={handleBarcodeKeyDown}
                placeholder="Escaneie ou digite — Enter para buscar"
              />
              {barcodeScanning && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400 animate-spin" />}
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="shrink-0 px-3 rounded-lg bg-surface-700 hover:bg-brand-600/20 border border-surface-600 hover:border-brand-500/40 text-gray-400 hover:text-brand-400 transition-colors"
                title="Usar câmera"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">USB: escaneie + Enter • Celular: botão de câmera</p>
          </div>
          <div>
            <label className="label">Nome *</label>
            <input className="input" required value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Ex: Coca-Cola Lata 350ml" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria *</label>
              <select className="input" required value={selectedTopId} onChange={e => handleTopChange(e.target.value)}>
                <option value="">Selecione...</option>
                {topCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Subcategoria</label>
              <select
                className="input"
                value={selectedChildName ?? ''}
                onChange={e => handleChildChange(e.target.value)}
                disabled={childCategories.length === 0}
              >
                <option value="">{childCategories.length === 0 ? '— Sem subcategorias —' : 'Nenhuma (categoria geral)'}</option>
                {childCategories.map(c => (
                  <option key={c.id} value={c.name}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">NCM</label>
              <input className="input" value={form.ncm ?? ''} onChange={e => set('ncm', e.target.value || null)}
                     placeholder="0000.00.00" maxLength={8} />
              <p className="text-xs text-gray-400 mt-1">Obrigatório pra emitir NFC-e deste produto.</p>
            </div>
            <div>
              <label className="label">Natureza de Operação</label>
              <select className="input" value={form.naturezaOperacaoId ?? ''}
                      onChange={e => set('naturezaOperacaoId', e.target.value || null)}>
                <option value="">Usar a padrão</option>
                {naturezas.map(n => (
                  <option key={n.id} value={n.id}>{n.descricao} (CFOP {n.cfop})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Preço de custo (R$)</label>
              <input className="input" type="number" min="0" step="0.01"
                value={(form.costPriceInCents ?? 0) / 100}
                onChange={e => set('costPriceInCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="label">Preço de venda (R$) *</label>
              <input className="input" type="number" min="0" step="0.01" required
                value={(form.priceInCents ?? 0) / 100}
                onChange={e => set('priceInCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder="0,00"
              />
            </div>
          </div>
          {(form.costPriceInCents ?? 0) > 0 && (form.priceInCents ?? 0) > 0 && (() => {
            const cost  = (form.costPriceInCents ?? 0) / 100
            const price = (form.priceInCents ?? 0) / 100
            const margin = price - cost
            const pct    = ((margin / cost) * 100).toFixed(1)
            return (
              <div className="rounded-lg bg-surface-700/60 px-4 py-2 text-sm flex gap-4 flex-wrap">
                <span className="text-gray-400">Margem: <span className={margin >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>R$ {margin.toFixed(2).replace('.', ',')} ({pct}%)</span></span>
              </div>
            )
          })()}
          <div>
            <label className="label">Preço promocional (R$)</label>
            <input className="input" type="number" min="0" step="0.01"
              value={form.discountPriceInCents != null ? form.discountPriceInCents / 100 : ''}
              onChange={e => set('discountPriceInCents', e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="Deixe em branco para sem promoção"
            />
            {(form.discountPriceInCents ?? 0) > 0 && (form.priceInCents ?? 0) > 0 && (form.discountPriceInCents ?? 0) < (form.priceInCents ?? 0) && (
              <p className="text-xs text-emerald-400 mt-1">
                Desconto de R$ {(((form.priceInCents ?? 0) - (form.discountPriceInCents ?? 0)) / 100).toFixed(2).replace('.', ',')} · badge &quot;Promoção&quot; ativado
              </p>
            )}
            {(form.discountPriceInCents ?? 0) > 0 && (form.discountPriceInCents ?? 0) >= (form.priceInCents ?? 0) && (
              <p className="text-xs text-amber-400 mt-1">Preço promocional deve ser menor que o preço de venda</p>
            )}
          </div>
          {/* Grade de tamanhos/cores toggle */}
          <div className="rounded-lg bg-surface-700/60 border border-surface-600 px-4 py-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">👕 Grade de tamanhos/cores</p>
                <p className="text-xs text-[var(--text-muted)]">Ative para produtos com variantes (camisas, bonés, etc.). O estoque passa a ser gerenciado por variante.</p>
              </div>
              <div
                onClick={() => set('hasVariants', !(form.hasVariants ?? false))}
                className={[
                  'relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  form.hasVariants ? 'bg-emerald-500' : 'bg-surface-600',
                ].join(' ')}
              >
                <span className={[
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  form.hasVariants ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </div>
            </label>
            {form.hasVariants && form.id && (
              <div className="mt-3 pt-3 border-t border-surface-600">
                <VariantsPanel productId={form.id} />
              </div>
            )}
            {form.hasVariants && !form.id && (
              <p className="text-xs text-amber-400 mt-2">Salve o produto primeiro para gerenciar a grade de variantes.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estoque total {form.hasVariants && <span className="text-gray-500 font-normal">(soma das variantes)</span>}</label>
              <input className="input" type="number" min="0"
                value={form.stockQuantity ?? 0}
                onChange={e => set('stockQuantity', parseInt(e.target.value))}
                disabled={!!form.hasVariants}
                title={form.hasVariants ? 'Gerenciado pelas variantes' : undefined}
              />
            </div>
            <div>
              <label className="label">Estoque mínimo</label>
              <input className="input" type="number" min="0"
                value={form.minimumStock ?? 5}
                onChange={e => set('minimumStock', parseInt(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label className="label">Descrição curta</label>
            <textarea className="input min-h-[72px] resize-y" value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Resumo exibido no card (ex: Booster box Scarlet & Violet)" />
          </div>
          <div>
            <label className="label">Descrição completa <span className="text-gray-500 font-normal">(página do produto)</span></label>
            <textarea className="input min-h-[120px] resize-y" value={form.fullDescription ?? ''} onChange={e => set('fullDescription', e.target.value || null)} placeholder="Detalhes, conteúdo da caixa, edição, idioma..." />
          </div>
          <div>
            <ImageUpload
              label="Foto principal"
              hint="600×600px recomendado · fundo transparente (PNG)"
              currentUrl={form.imageUrl ?? null}
              onUpload={url => set('imageUrl', url || null)}
            />
          </div>
          {/* Galeria extra */}
          <div className="space-y-2">
            <label className="label">Fotos adicionais <span className="text-gray-500 font-normal">(galeria na página do produto)</span></label>
            <div className="grid grid-cols-2 gap-3">
              {(form.imageUrls ?? []).map((url, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border border-surface-600 bg-surface-700 group" style={{ aspectRatio: '1' }}>
                  <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-contain p-2" />
                  <button
                    type="button"
                    onClick={() => set('imageUrls', (form.imageUrls ?? []).filter((_, j) => j !== i))}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600/80 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {(form.imageUrls ?? []).length < 6 && (
                <div className="border-2 border-dashed border-surface-500 rounded-xl" style={{ aspectRatio: '1' }}>
                  <ImageUpload
                    label=""
                    hint=""
                    currentUrl={null}
                    onUpload={url => { if (url) set('imageUrls', [...(form.imageUrls ?? []), url]) }}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">Máximo 6 fotos adicionais</p>
          </div>
          <div className="rounded-lg bg-surface-700/60 border border-surface-600 px-4 py-3 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">🛍️ Marketplace</p>
                <p className="text-xs text-[var(--text-muted)]">Aparece na loja digital — desmarcado: some do marketplace, continua nas comandas</p>
              </div>
              <div
                onClick={() => {
                  const next = !(form.showOnMarketplace ?? true)
                  setForm(f => ({ ...f, showOnMarketplace: next, ...(!next ? { isFeatured: false } : {}) }))
                }}
                className={[
                  'relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  (form.showOnMarketplace ?? true) ? 'bg-brand-500' : 'bg-surface-600',
                ].join(' ')}
              >
                <span className={[
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  (form.showOnMarketplace ?? true) ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </div>
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">⭐ Destaque na landing</p>
                <p className="text-xs text-[var(--text-muted)]">Aparece na seção de produtos da home</p>
              </div>
              <div
                onClick={() => set('isFeatured', !form.isFeatured)}
                className={[
                  'relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  form.isFeatured ? 'bg-yellow-500' : 'bg-surface-600',
                ].join(' ')}
              >
                <span className={[
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  form.isFeatured ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </div>
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">📋 Fila de espera</p>
                <p className="text-xs text-[var(--text-muted)]">Se o estoque zerar, o cliente entra numa fila — ao chegar estoque, vira pré-venda automaticamente</p>
              </div>
              <div
                onClick={() => set('isPreVenda', !form.isPreVenda)}
                className={[
                  'relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  form.isPreVenda ? 'bg-purple-500' : 'bg-surface-600',
                ].join(' ')}
              >
                <span className={[
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  form.isPreVenda ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </div>
            </label>
            <div>
              <label className="label">📅 Data de lançamento (data de rua) — opcional</label>
              <input className="input" type="date"
                value={form.preVendaReleaseDate ? form.preVendaReleaseDate.slice(0, 10) : ''}
                onChange={e => set('preVendaReleaseDate', e.target.value || null)}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Pré-venda com data de rua: o cliente garante agora (estoque baixa na hora) e retira a partir dessa data. Sem pagamento em até 48h após a data, a pré-venda expira e o estoque volta.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-surface-600 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        </form>
      </div>
    </div>
    </>
  )
}

export default function EstoquePage() {
  const [products, setProducts]       = useState<Product[]>([])
  const [categories, setCategories]   = useState<ProductCategory[]>([])
  const [naturezas, setNaturezas]     = useState<NaturezaOperacaoDto[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [modal, setModal]             = useState<Partial<Product> | null | undefined>(undefined)
  const [catFilter, setCatFilter]     = useState('')
  const [stockFilter, setStockFilter] = useState<'todos' | 'normal' | 'baixo' | 'zerado'>('todos')
  const [drawer, setDrawer]           = useState<Product | null>(null)

  const fetch = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [prodRes, catRes, natRes] = await Promise.all([productApi.listAdmin(), categoryApi.list(), fiscalApi.listNaturezas()])
      setProducts(prodRes.data)
      setCategories(catRes.data)
      setNaturezas(natRes.data)
    } catch { if (!quiet) toast.error('Erro ao carregar produtos') }
    finally { if (!quiet) setLoading(false) }
  }
  useEffect(() => { fetch() }, [])

  // Estoque se atualiza sozinho (sem F5): o backend emite StockChanged quando
  // cliente reserva/cancela no site, pré-venda expira ou sai venda avulsa;
  // Comanda* cobre as vendas da comanda. Refetch silencioso, sem piscar a tela.
  useEffect(() => {
    let hub: Awaited<ReturnType<typeof startHub>> | undefined
    const atualiza = () => fetch(true)
    startHub().then(h => {
      hub = h
      hub.on('StockChanged', atualiza)
      hub.on('ComandaUpdated', atualiza)
      hub.on('ComandaClosed', atualiza)
      hub.on('ComandaCancelled', atualiza)
    }).catch(() => {})
    return () => {
      hub?.off('StockChanged', atualiza)
      hub?.off('ComandaUpdated', atualiza)
      hub?.off('ComandaClosed', atualiza)
      hub?.off('ComandaCancelled', atualiza)
      stopHub()
    }
  }, [])

  const filtered = products
    .filter(p => {
      if (!p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (catFilter && p.category !== catFilter) return false
      if (stockFilter === 'baixo')   return p.isLowStock && p.stockQuantity > 0
      if (stockFilter === 'zerado')  return p.stockQuantity === 0
      if (stockFilter === 'normal')  return !p.isLowStock && p.stockQuantity > 0
      return true
    })
    .sort((a, b) => {
      if (stockFilter === 'baixo' || stockFilter === 'zerado') return a.stockQuantity - b.stockQuantity
      return 0
    })

  // Resumo
  const totalPecas    = products.reduce((s, p) => s + p.stockQuantity, 0)
  const valorImob     = products.reduce((s, p) => s + p.stockQuantity * (p.costPriceInCents / 100), 0)
  const qtdBaixo      = products.filter(p => p.isLowStock && p.stockQuantity > 0).length
  const qtdZerado     = products.filter(p => p.stockQuantity === 0).length
  const qtdNormal     = products.filter(p => !p.isLowStock && p.stockQuantity > 0).length

  async function handleSave(form: Partial<Product>) {
    try {
      if (form.id) await productApi.update(form.id, form)
      else         await productApi.create(form)
      toast.success(form.id ? 'Produto atualizado!' : 'Produto criado!')
      setModal(undefined); fetch()
    } catch { toast.error('Erro ao salvar produto') }
  }

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Desativar "${name}"?`)) return
    try { await productApi.deactivate(id); toast.success('Produto desativado'); fetch() }
    catch { toast.error('Erro ao desativar') }
  }

  function exportCsv() {
    const rows = [
      ['Nome', 'Categoria', 'Código de Barras', 'Preço Custo (R$)', 'Preço Venda (R$)', 'Margem (%)', 'Estoque', 'Estoque Mínimo'],
      ...products.map(p => [
        p.name,
        p.category,
        p.barcode ?? '',
        (p.costPriceInCents / 100).toFixed(2),
        (p.priceInCents / 100).toFixed(2),
        p.costPriceInCents > 0 ? p.marginPercent.toFixed(1) : '',
        p.stockQuantity,
        p.minimumStock ?? 5,
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `estoque_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  async function handleStock(id: string, delta: number) {
    try { await productApi.adjustStock(id, delta); fetch() }
    catch { toast.error('Estoque insuficiente') }
  }


  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {modal !== undefined && (
        <ProductModal product={modal} categories={categories} naturezas={naturezas} onClose={() => setModal(undefined)} onSave={handleSave} />
      )}
      {drawer && (
        <ProductDrawer
          product={drawer}
          onClose={() => setDrawer(null)}
          onEdit={() => { setModal(drawer); setDrawer(null) }}
          onStock={async (id, delta) => { await handleStock(id, delta); setDrawer(prev => prev ? { ...prev, stockQuantity: prev.stockQuantity + delta } : null) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Estoque</h1>
          <p className="text-gray-400 text-sm mt-0.5">{products.length} produtos cadastrados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCsv} className="btn-secondary" title="Exportar CSV">
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={() => gerarRelatorioOperacional(products, categories).catch(() => toast.error('Erro ao gerar PDF'))}
            className="btn-secondary"
            title="Relatório Operacional PDF"
          >
            <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Operacional</span>
          </button>
          <button
            onClick={() => gerarRelatorioGerencial(products, categories).catch(() => toast.error('Erro ao gerar PDF'))}
            className="btn-secondary"
            title="Relatório Gerencial PDF"
          >
            <BarChart2 className="w-4 h-4" /> <span className="hidden sm:inline">Gerencial</span>
          </button>
          <button onClick={() => setModal(null)} className="btn-primary">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo Produto</span><span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button onClick={() => setStockFilter('todos')}
            className={`card flex items-center gap-3 text-left transition-all hover:border-surface-400 ${stockFilter === 'todos' ? 'border-brand-500/50 bg-brand-600/5' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-brand-600/15 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total de peças</p>
              <p className="text-xl font-black font-mono text-brand-400">{totalPecas.toLocaleString('pt-BR')}</p>
            </div>
          </button>

          <button onClick={() => setStockFilter('todos')}
            className="card flex items-center gap-3 text-left transition-all hover:border-surface-400">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Valor imobilizado</p>
              <p className="text-sm font-black font-mono text-emerald-400">
                {valorImob >= 1000
                  ? `R$ ${(valorImob / 1000).toFixed(1).replace('.', ',')}k`
                  : `R$ ${valorImob.toFixed(0)}`}
              </p>
            </div>
          </button>

          <button onClick={() => setStockFilter(stockFilter === 'baixo' ? 'todos' : 'baixo')}
            className={`card flex items-center gap-3 text-left transition-all hover:border-amber-500/40 ${stockFilter === 'baixo' ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Estoque baixo</p>
              <p className="text-xl font-black font-mono text-amber-400">{qtdBaixo}</p>
            </div>
          </button>

          <button onClick={() => setStockFilter(stockFilter === 'zerado' ? 'todos' : 'zerado')}
            className={`card flex items-center gap-3 text-left transition-all hover:border-red-500/40 ${stockFilter === 'zerado' ? 'border-red-500/50 bg-red-500/5' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <CircleOff className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Sem estoque</p>
              <p className="text-xl font-black font-mono text-red-400">{qtdZerado}</p>
            </div>
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input className="input pl-9" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-48" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      {/* Chips de situação */}
      {!loading && (
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'todos',  label: 'Todos',          count: products.length, cls: 'border-surface-500 text-gray-300' },
            { key: 'normal', label: 'Normal',          count: qtdNormal,       cls: 'border-emerald-500/40 text-emerald-300' },
            { key: 'baixo',  label: 'Estoque baixo',  count: qtdBaixo,        cls: 'border-amber-500/40 text-amber-300' },
            { key: 'zerado', label: 'Zerado',          count: qtdZerado,       cls: 'border-red-500/40 text-red-300' },
          ] as const).map(({ key, label, count, cls }) => (
            <button key={key} onClick={() => setStockFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                stockFilter === key ? `${cls} bg-surface-700` : 'border-surface-600 text-gray-500 hover:border-surface-500 hover:text-gray-300'
              }`}>
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                stockFilter === key ? 'bg-surface-600' : 'bg-surface-700'
              }`}>{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
        {/* ── Desktop: tabela ── */}
        <div className="hidden sm:block card p-0 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-surface-800 border-b border-surface-500">
              <tr className="text-left">
                {['Produto', 'Categoria', 'Cód. Barras', 'Custo', 'Venda', 'Margem', 'Estoque', 'Mkt', 'Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-500">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-surface-500/30 transition-colors cursor-pointer" onClick={() => setDrawer(p)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{p.name}</p>
                      {p.isPreVenda && (
                        <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
                          Aceita fila
                        </span>
                      )}
                    </div>
                    {p.description && <p className="text-xs text-gray-500 truncate max-w-[200px]">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-surface-600 text-gray-300 border-surface-500">{p.category}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {p.barcode ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                    {p.costPriceInCents > 0 ? `R$ ${p.costPriceInReais.toFixed(2).replace('.', ',')}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-accent-gold font-semibold">
                    R$ {p.priceInReais.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.costPriceInCents > 0
                      ? <span className={p.marginInReais >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {p.marginPercent.toFixed(1)}%
                        </span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => handleStock(p.id, -1)} className="w-6 h-6 rounded bg-surface-600 hover:bg-red-600/30 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center text-lg leading-none">−</button>
                      <span className={`font-bold ${p.stockQuantity === 0 ? 'text-red-400' : p.isLowStock ? 'text-amber-400' : 'text-white'}`}>{p.stockQuantity}</span>
                      <button onClick={() => handleStock(p.id, +1)} className="w-6 h-6 rounded bg-surface-600 hover:bg-emerald-600/30 text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center text-lg leading-none">+</button>
                      {p.stockQuantity === 0
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25">Zerado</span>
                        : p.isLowStock
                          ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Baixo</span>
                          : null}
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={async () => {
                        try {
                          const next = !p.showOnMarketplace
                          await productApi.update(p.id, { ...p, showOnMarketplace: next, isFeatured: next ? p.isFeatured : false })
                          fetch()
                        } catch { toast.error('Erro ao atualizar') }
                      }}
                      title={p.showOnMarketplace ? 'No marketplace — clique para remover' : 'Fora do marketplace — clique para adicionar'}
                      className={`text-base transition-opacity ${p.showOnMarketplace ? 'opacity-100' : 'opacity-25'}`}
                    >🛍️</button>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModal(p)} className="p-1.5 rounded hover:bg-brand-600/20 text-gray-500 hover:text-brand-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeactivate(p.id, p.name)} className="p-1.5 rounded hover:bg-red-600/20 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              Nenhum produto encontrado
            </div>
          )}
          </div>
        </div>

        {/* ── Mobile: cards ── */}
        <div className="sm:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              Nenhum produto encontrado
            </div>
          ) : filtered.map(p => (
            <div key={p.id} className="card p-3 space-y-2.5">
              {/* Linha 1: nome + ações */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium text-white text-sm leading-tight">{p.name}</p>
                    {p.isPreVenda && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: '#7C3AED', color: '#fff' }}>Aceita fila</span>
                    )}
                    {p.isLowStock && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 flex items-center gap-0.5 shrink-0">
                        <AlertTriangle className="w-2.5 h-2.5" /> Baixo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="badge bg-surface-600 text-gray-300 border-surface-500 text-[10px]">{p.category}</span>
                    {p.barcode && <span className="text-[10px] font-mono text-gray-500">{p.barcode}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        const next = !p.showOnMarketplace
                        await productApi.update(p.id, { ...p, showOnMarketplace: next, isFeatured: next ? p.isFeatured : false })
                        fetch()
                      } catch { toast.error('Erro ao atualizar') }
                    }}
                    title={p.showOnMarketplace ? 'No marketplace' : 'Fora do marketplace'}
                    className={`text-base px-1 transition-opacity ${p.showOnMarketplace ? 'opacity-100' : 'opacity-25'}`}
                  >🛍️</button>
                  <button onClick={() => setModal(p)} className="p-1.5 rounded hover:bg-brand-600/20 text-gray-500 hover:text-brand-400 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeactivate(p.id, p.name)} className="p-1.5 rounded hover:bg-red-600/20 text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Linha 2: preço + custo + margem */}
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="text-accent-gold font-bold">R$ {p.priceInReais.toFixed(2).replace('.', ',')}</span>
                {p.costPriceInCents > 0 && (
                  <>
                    <span className="text-gray-500">Custo: R$ {p.costPriceInReais.toFixed(2).replace('.', ',')}</span>
                    <span className={p.marginInReais >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                      {p.marginPercent.toFixed(1)}%
                    </span>
                  </>
                )}
              </div>

              {/* Linha 3: estoque */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Estoque:</span>
                <button onClick={() => handleStock(p.id, -1)} className="w-7 h-7 rounded bg-surface-600 hover:bg-red-600/30 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center text-base leading-none">−</button>
                <span className={`text-sm font-bold min-w-[1.5rem] text-center ${p.isLowStock ? 'text-red-400' : 'text-white'}`}>{p.stockQuantity}</span>
                <button onClick={() => handleStock(p.id, +1)} className="w-7 h-7 rounded bg-surface-600 hover:bg-emerald-600/30 text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center text-base leading-none">+</button>
                {p.description && <p className="text-[10px] text-gray-500 truncate ml-2 flex-1 min-w-0">{p.description}</p>}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
