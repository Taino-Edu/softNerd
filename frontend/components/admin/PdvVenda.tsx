'use client'

import { useEffect, useState, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { productApi, categoryApi, vendaAvulsaApi, userApi, crediarioApi, PAYMENT_METHODS, PAYMENT_NEEDS_USER } from '@/lib/api'
import type { CrediariosDto, Product, ProductCategory, ProductVariant, VendaAvulsaDto, UserSummary } from '@/lib/api'
import { useThrottle } from '@/lib/hooks'
import toast from 'react-hot-toast'
import { ShoppingBag, Plus, Minus, User, CheckCircle, Loader2, PackageOpen, Banknote, CreditCard, Tag, AlertCircle, X, ArrowRight, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'
import VariantPicker from '@/components/admin/VariantPicker'
import ConferenciaButton from '@/components/admin/ConferenciaButton'
import EscolherContaCrediarioModal from '@/components/admin/EscolherContaCrediarioModal'
import PercentPicker from '@/components/admin/PercentPicker'
import { brl } from '@/lib/format'
import { useRascunho, useGravarRascunho, lerRascunho, limparRascunhos } from '@/lib/useRascunho'
import { useDispensarModal } from '@/lib/useDispensarModal'
import { PagamentoIcone } from '@/components/PagamentoIcone'
import { rotuloCurtoPagamento } from '@/lib/pagamentos'
import PdvProdutos, { CabecalhoPdv, RODAPE_PDV, categoriasDoCatalogo, precoProdutoPdv, type ItemCarrinhoPdv as CartItem } from './PdvProdutos'
import { Switch } from '@/components/ui/Switch'
import { useMarcarRodapeFixo } from '@/lib/rodapeFixo'

// Rascunho da venda em andamento: o carrinho guarda só ids e quantidades (o preço e o
// estoque vêm sempre da lista de produtos de agora, nunca de um valor velho guardado).
interface CartRascunho { productId: string; variantId?: string; variantLabel?: string; quantity: number; cartKey: string }

function carrinhoDoRascunho(products: Product[]): CartItem[] {
  const salvo = lerRascunho<CartRascunho[]>('pdv:cart') ?? []
  return salvo.flatMap(r => {
    const product = products.find(p => p.id === r.productId)
    if (!product || product.stockQuantity <= 0) return []
    return [{ product, quantity: Math.min(r.quantity, product.stockQuantity), variantId: r.variantId, variantLabel: r.variantLabel, cartKey: r.cartKey }]
  })
}


// ── Wizard de nova venda (3 etapas) ──────────────────────────────────────────

// FALLBACK da chave "pdv-responsivo" - apagar junto com a chave.
function MolduraModalPdv({ onClose, produtos, children }: { onClose: () => void; produtos: boolean; children: ReactNode }) {
  const fundo = useDispensarModal(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" {...fundo}>
      <div className={clsx(
        'bg-surface-800 border border-surface-500 rounded-2xl w-full flex flex-col shadow-2xl animate-fade-in',
        produtos ? 'max-w-3xl max-h-[92vh]' : 'max-w-md max-h-[92vh]'
      )}>{children}</div>
    </div>
  )
}

export default function PdvVenda({
  products,
  defaultDiscount,
  responsivo,
  onComplete,
  onClose,
}: {
  products: Product[]
  defaultDiscount: number
  responsivo: boolean
  onComplete: (receipt: VendaAvulsaDto) => void
  onClose: () => void
}) {
  // Só volta pra etapa onde parou se tem venda recuperada (carrinho); senão começa pelo cliente.
  const etapaInicial = responsivo ? 2 : 1
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (!lerRascunho<CartRascunho[]>('pdv:cart')?.length) return etapaInicial
    return lerRascunho<1 | 2 | 3>('pdv:step') ?? etapaInicial
  })
  useGravarRascunho<1 | 2 | 3>('pdv:step', step, 1)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  useMarcarRodapeFixo(responsivo)
  const [destinoDoCliente, setDestinoDoCliente] = useState<2 | 3>(2)

  // Etapa 1 — cliente
  const [clientSearch, setClientSearch] = useRascunho('pdv:clienteBusca', '')
  const [clientResults, setClientResults] = useState<UserSummary[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useRascunho<UserSummary | null>('pdv:cliente', null)
  const [selectedUserId, setSelectedUserId] = useRascunho<string | null>('pdv:clienteId', null)
  const [clientName, setClientName] = useRascunho('pdv:clienteNome', '')

  // Etapa 2 — produtos
  const [cart, setCart] = useState<CartItem[]>(() => carrinhoDoRascunho(products))
  const cartRascunho = useMemo<CartRascunho[]>(() => cart.map(i => ({
    productId: i.product.id, variantId: i.variantId, variantLabel: i.variantLabel, quantity: i.quantity, cartKey: i.cartKey,
  })), [cart])
  useGravarRascunho<CartRascunho[]>('pdv:cart', cartRascunho, [])
  const [search, setSearch] = useState('')
  const [catFilter, setCat] = useState<string | null>(null)
  const [allCategories, setAllCategories] = useState<ProductCategory[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)

  // Etapa 3 — pagamento
  const [payment, setPayment] = useRascunho<string>('pdv:pagamento', PAYMENT_METHODS[0].value)
  const [discountMode, setDiscountMode] = useRascunho<'percent' | 'cents'>('pdv:descModo', 'percent')
  const [discountPct, setDiscountPct] = useRascunho('pdv:descPct', defaultDiscount)
  const [discountValueStr, setDiscountValueStr] = useRascunho('pdv:descValor', '')
  const [received, setReceived] = useRascunho('pdv:recebido', '')
  const [submitting, setSubmitting] = useState(false)
  // Contas de crediário abertas do cliente — quando tem alguma, o caixa escolhe onde lançar.
  const [contasCrediario, setContasCrediario] = useState<CrediariosDto[] | null>(null)

  // Pagamento dividido (segundo método)
  const [splitEnabled, setSplit] = useRascunho('pdv:divide', false)
  const [secondPayment, setSecondPayment] = useRascunho<string>('pdv:pagamento2', PAYMENT_METHODS[1].value)
  const [secondAmountStr, setSecondAmountStr] = useRascunho('pdv:valor2', '')

  // Fechar o assistente (X, Esc, clique fora) guarda a venda; ao abrir de novo ela volta.
  const [recuperado, setRecuperado] = useState(() => cart.length > 0 || selectedUserId != null)

  useEffect(() => {
    categoryApi.list().then(r => setAllCategories(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (responsivo) {
      if (step === 2 && window.matchMedia('(min-width: 1024px)').matches) {
        searchRef.current?.focus()
      } else {
        tituloRef.current?.focus()
      }
      return
    }
    if (step === 2) {
      const timer = setTimeout(() => searchRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    }
  }, [step, responsivo])

  // Pre-load de item + cliente vindo da Lista de Espera
  useEffect(() => {
    const raw = sessionStorage.getItem('wl_pdv_preload')
    if (!raw) return
    sessionStorage.removeItem('wl_pdv_preload')
    try {
      const { productId, userId, userName } = JSON.parse(raw)
      // carrega produto
      productApi.get(productId).then(r => {
        const p = r.data
        const cartKey = p.id
        setCart([{ product: p, quantity: 1, cartKey }])
      }).catch(() => {})
      // carrega cliente se tiver userId
      if (userId) {
        userApi.getById(userId).then(r => {
          const u = r.data
          setSelectedUser(u)
          setSelectedUserId(u.id)
          setClientName(u.name)
          setClientSearch(u.name)
        }).catch(() => {
          // fallback: só preenche nome
          setClientName(userName ?? '')
          setClientSearch(userName ?? '')
        })
      } else if (userName) {
        setClientName(userName)
        setClientSearch(userName)
      }
    } catch {}
  }, [])

  // Debounce busca de clientes
  useEffect(() => {
    if (clientSearch.trim().length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      setClientLoading(true)
      try {
        const { data } = await userApi.list(clientSearch)
        setClientResults(data.filter(u => u.role === 'Customer' && u.isActive).slice(0, 6))
      } catch { /* silencioso */ }
      finally { setClientLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  function selectClient(u: UserSummary) {
    setSelectedUser(u); setSelectedUserId(u.id)
    setClientName(u.name); setClientSearch(u.name); setClientResults([])
  }
  function clearClient() {
    setSelectedUser(null); setSelectedUserId(null)
    setClientName(''); setClientSearch(''); setClientResults([])
  }

  function editarCliente(destino: 2 | 3) {
    setDestinoDoCliente(destino)
    setStep(1)
  }

  function descartarRascunho() {
    limparRascunhos('pdv:')
    clearClient(); setCart([]); setStep(etapaInicial)
    setPayment(PAYMENT_METHODS[0].value); setReceived('')
    setDiscountMode('percent'); setDiscountPct(defaultDiscount); setDiscountValueStr('')
    setSplit(false); setSecondPayment(PAYMENT_METHODS[1].value); setSecondAmountStr('')
    setRecuperado(false)
  }

  // Câmera: procura o código entre os produtos à venda (ativos e com estoque), igual à comanda.
  function lerCodigo(codigo: string) {
    const produto = products.find(p => p.barcode === codigo.trim())
    if (produto) addToCart(produto)
    else toast.error(`Nenhum produto à venda com o código ${codigo}.`)
  }

  function addToCart(product: Product, variant?: ProductVariant) {
    if (product.hasVariants && !variant) {
      setVariantPickerProduct(product)
      return
    }
    const cartKey = product.id + (variant?.id ?? '')
    const maxStock = variant ? variant.stockQuantity : product.stockQuantity
    setCart(prev => {
      const ex = prev.find(i => i.cartKey === cartKey)
      if (ex) {
        if (ex.quantity >= maxStock) {
          toast.error(`Estoque máximo: ${maxStock} un.`, { id: cartKey })
          return prev
        }
        return prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { product, quantity: 1, variantId: variant?.id, variantLabel: variant?.label, cartKey }]
    })
  }
  function changeQty(cartKey: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.cartKey !== cartKey) return i
      const maxStock = i.variantId
        ? (i.product.stockQuantity) // aproximação — backend valida
        : i.product.stockQuantity
      return { ...i, quantity: Math.max(1, Math.min(i.quantity + delta, maxStock)) }
    }))
  }
  function removeFromCart(cartKey: string) {
    setCart(prev => prev.filter(i => i.cartKey !== cartKey))
  }

  const subtotal = cart.reduce((s, i) => s + precoProdutoPdv(i.product) * i.quantity, 0)

  // Carrinho no formato da lista de conferência (mesmo papel usado na comanda).
  const conferenciaItems = cart.map(({ product, quantity, variantLabel }) => ({
    name: product.name,
    variantLabel,
    quantity,
    unitPriceInCents: precoProdutoPdv(product),
  }))
  const discountCents     = discountMode === 'cents'
    ? Math.min(Math.round(parseFloat(discountValueStr.replace(',', '.') || '0') * 100), subtotal)
    : Math.round(subtotal * discountPct / 100)
  const total             = subtotal - discountCents
  const receivedCents     = Math.round(parseFloat(received.replace(',', '.') || '0') * 100)
  const troco             = receivedCents - total
  const secondAmountCents = splitEnabled ? Math.round(parseFloat(secondAmountStr.replace(',', '.') || '0') * 100) : 0
  const primaryAmountCents = total - secondAmountCents
  const splitValid        = !splitEnabled || (secondAmountCents > 0 && secondAmountCents < total)
  const secondNeedsUser   = splitEnabled && (PAYMENT_NEEDS_USER as readonly string[]).includes(secondPayment)
  const needsUser         = (PAYMENT_NEEDS_USER as readonly string[]).includes(payment) || secondNeedsUser

  // Cada subcategoria logo abaixo da categoria-pai (PdvProdutos, igual na comanda).
  const categories = useMemo(() => categoriasDoCatalogo(products, allCategories), [products, allCategories])
  const filtered = products.filter(p => {
    const matchCat    = !catFilter || p.category === catFilter
    const q           = search.toLowerCase()
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.barcode != null && p.barcode.includes(search))
    return matchCat && matchSearch
  })

  /** Registra a venda. crediario: conta escolhida quando o cliente já tem uma aberta. */
  const registrarVenda = useCallback(async (crediario?: { existenteId?: string; novaConta?: boolean; vencimento?: string }) => {
    setSubmitting(true)
    try {
      const { data } = await vendaAvulsaApi.register(
        clientName.trim() || null,
        payment,
        cart.map(i => ({ productId: i.product.id, quantity: i.quantity, variantId: i.variantId })),
        discountMode === 'percent' ? discountPct : 0,
        selectedUserId ?? undefined,
        splitEnabled ? secondPayment : null,
        splitEnabled ? secondAmountCents : 0,
        discountMode === 'cents' ? discountCents : undefined,
        crediario?.existenteId,
        crediario?.novaConta,
        crediario?.vencimento,
      )
      limparRascunhos('pdv:')
      onComplete(data)
      toast.success('Venda registrada!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao registrar venda.')
    } finally { setSubmitting(false) }
  }, [cart, clientName, payment, discountMode, discountPct, discountCents, selectedUserId, onComplete, splitEnabled, secondPayment, secondAmountCents])

  const submitRaw = useCallback(async () => {
    if (cart.length === 0) { toast.error('Adicione pelo menos um produto.'); return }
    if (!splitValid) { toast.error('Valor do segundo pagamento inválido.'); return }

    // Venda no crediário com o cliente já devendo: pergunta em qual conta lançar em vez
    // de grudar na primeira aberta (o cliente pode ter dívidas com prazos diferentes).
    if (payment === 'Crediario' && selectedUserId) {
      try {
        const { data } = await crediarioApi.byUser(selectedUserId)
        const abertas = data.filter(c => c.status === 'Aberto')
        if (abertas.length > 0) { setContasCrediario(abertas); return }
      } catch { /* não conseguiu listar: segue no caminho antigo */ }
    }

    await registrarVenda()
  }, [cart, payment, selectedUserId, splitValid, registrarVenda])

  const handleSubmit = useThrottle(submitRaw, 2000)

  const STEPS = [
    { n: 1 as const, label: 'Cliente' },
    { n: 2 as const, label: 'Produtos' },
    { n: 3 as const, label: 'Pagamento' },
  ]

  const conteudo = (
    <>
        {/* Header + step indicator */}
        {responsivo ? (
          <CabecalhoPdv titulo="Nova venda" tituloRef={tituloRef} sair={onClose} rotuloSair="Voltar ao PDV" desabilitado={submitting}
            icone={<ShoppingBag aria-hidden="true" className="h-5 w-5 text-brand-400" />}
            etapas={STEPS.map(e => e.label)} etapa={step} />
        ) : (
        <div className="px-5 pt-4 pb-3 border-b border-surface-500 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2 text-base">
              <ShoppingBag className="w-4 h-4 text-brand-400" /> Nova Venda
            </h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center">
            {STEPS.map(({ n, label }, idx) => (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                    n < step  ? 'bg-accent-green text-black' :
                    n === step ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' :
                    'bg-surface-600 border border-surface-500 text-gray-500'
                  )}>
                    {n < step ? <CheckCircle className="w-3.5 h-3.5" /> : n}
                  </div>
                  <span className={clsx('text-[9px] mt-1 font-medium',
                    n < step   ? 'text-accent-green' :
                    n === step ? 'text-brand-400' : 'text-gray-600'
                  )}>{label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={clsx('flex-1 h-px mx-2 mb-3 transition-colors',
                    n < step ? 'bg-accent-green' : 'bg-surface-600'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {recuperado && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3 text-xs txt-alerta shrink-0">
            <span>
              Venda em andamento recuperada ({cart.length} {cart.length === 1 ? 'item' : 'itens'}{clientName ? ` · ${clientName}` : ''}).
            </span>
            {(!responsivo || step !== 2) && (
              <button onClick={descartarRascunho} className="font-bold underline hover:opacity-80 shrink-0">Começar do zero</button>
            )}
          </div>
        )}

        {/* Conteúdo */}
        <div className={clsx(responsivo ? 'min-w-0 p-3 sm:p-5' : 'flex-1 p-5 min-h-0',
          !responsivo && (step === 2 ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'))}>

          {/* ── Etapa 1: Cliente ──────────────────────────────── */}
          {step === 1 && (
            <div className={clsx('space-y-4', responsivo && 'mx-auto max-w-xl')}>
              <p className="text-xs text-gray-500">Busque um cliente cadastrado ou pule para venda balcão.</p>

              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 z-10" />
                <input
                  autoFocus={!responsivo}
                  aria-label="Buscar cliente por nome, CPF ou e-mail"
                  className="input pl-9 text-sm"
                  placeholder="Nome, CPF ou e-mail…"
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setClientName(e.target.value)
                    if (selectedUser) { setSelectedUser(null); setSelectedUserId(null) }
                  }}
                  maxLength={100}
                />
                {clientLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 animate-spin" />
                )}
              </div>

              {selectedUser ? (
                <div className="flex items-center gap-3 bg-brand-600/10 border border-brand-500/30 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 font-bold shrink-0 text-sm">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{selectedUser.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {selectedUser.pointsBalance > 0 && (
                        <span className="text-[10px] text-amber-400">{selectedUser.pointsBalance} pts</span>
                      )}
                      {selectedUser.balanceInCents > 0 && (
                        <span className="text-[10px] text-accent-green">
                          {brl((selectedUser.balanceInCents / 100))} cashback
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={clearClient} aria-label="Remover cliente da venda" className="text-gray-500 hover:text-red-400 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : clientResults.length > 0 ? (
                <div className="bg-surface-700 border border-surface-500 rounded-xl overflow-hidden">
                  {clientResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => selectClient(u)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-700 transition-colors text-left border-b border-surface-500 last:border-0 text-white"
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-600/20 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-brand-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u.name}</p>
                        {u.cpf && <p className="text-[10px] text-gray-400">{u.cpf}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* ── Etapa 2: Produtos ──────────────────────────────── */}
          {step === 2 && responsivo && (
            <PdvProdutos produtos={filtered} categorias={categories} categoria={catFilter} selecionarCategoria={setCat}
              busca={search} buscar={setSearch} buscaRef={searchRef} carrinho={cart} adicionar={addToCart} lerCodigo={lerCodigo}
              alterarQuantidade={changeQty} remover={removeFromCart} cliente={clientName.trim()} editarCliente={() => editarCliente(2)}
              subtotal={subtotal} desconto={discountCents} total={total} />
          )}

          {/* FALLBACK da chave "pdv-responsivo" */}
          {step === 2 && !responsivo && (
            <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">

              {/* Coluna esquerda — catálogo */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
                <input
                  ref={searchRef}
                  className="input text-sm shrink-0"
                  placeholder="Buscar produto, categoria ou código de barras…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filtered.length === 1) {
                      addToCart(filtered[0]); setSearch('')
                    }
                  }}
                />

                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <button
                      onClick={() => setCat(null)}
                      className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        !catFilter
                          ? 'bg-brand-600/20 border-brand-500/60 text-brand-300'
                          : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-400'
                      )}
                    >Todos</button>
                    {categories.map(({ name, isChild }) => (
                      <button
                        key={name}
                        onClick={() => setCat(name === catFilter ? null : name)}
                        className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                          isChild && 'ml-2',
                          catFilter === name
                            ? 'bg-brand-600/20 border-brand-500/60 text-brand-300'
                            : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-400'
                        )}
                      >{isChild && '↳ '}{name}</button>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-500">
                      <PackageOpen className="w-8 h-8" />
                      <p className="text-xs">Nenhum produto encontrado</p>
                    </div>
                  ) : filtered.map(p => {
                    const inCart = cart.find(i => i.product.id === p.id)
                    const price  = p.isOnPromo && p.discountPriceInCents != null ? p.discountPriceInCents : p.priceInCents
                    return (
                      <div
                        key={p.id}
                        className={clsx(
                          'flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all',
                          inCart ? 'border-brand-500/40 bg-brand-600/5' : 'bg-surface-700 border-surface-500 hover:border-surface-500'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          {p.isPreVenda && (
                            <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded mr-1 bg-purple-600 text-white">Pré</span>
                          )}
                          {!p.isPreVenda && p.isOnPromo && (
                            <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded mr-1 bg-red-500 text-white">Promo</span>
                          )}
                          <span className="text-sm text-white font-medium">{p.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-accent-gold text-xs font-bold">{brl(price / 100)}</span>
                            <span className="text-gray-600 text-[10px]">{p.stockQuantity} un.</span>
                          </div>
                        </div>
                        <button
                          onClick={() => addToCart(p)}
                          disabled={!p.hasVariants && (inCart ? inCart.quantity >= p.stockQuantity : p.stockQuantity === 0)}
                          className={clsx(
                            'shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all',
                            p.hasVariants
                              ? 'bg-violet-600/20 border-violet-500/40 text-violet-300 hover:bg-violet-600/35'
                              : inCart
                              ? 'bg-brand-600/25 border-brand-500/50 text-brand-300 hover:bg-brand-600/40'
                              : 'bg-brand-600/15 border-brand-500/30 text-brand-400 hover:bg-brand-600/25',
                            !p.hasVariants && inCart && inCart.quantity >= p.stockQuantity ? 'opacity-40 cursor-not-allowed' : ''
                          )}
                          title={p.hasVariants ? 'Escolher tamanho/cor' : 'Adicionar'}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Divisor */}
              <div className="hidden sm:block w-px bg-surface-600 shrink-0" />

              {/* Coluna direita — carrinho (w-72: com w-52 o nome do produto ficava cortado
                  no meio e pedido grande não dava pra conferir) */}
              <div className="w-full sm:w-72 shrink-0 flex flex-col gap-2 min-h-0 max-h-[38%] sm:max-h-none border-t border-surface-600 pt-3 sm:border-0 sm:pt-0">
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    Carrinho {cart.length > 0 && <span className="text-brand-400">({cart.reduce((s, i) => s + i.quantity, 0)})</span>}
                  </p>
                  <ConferenciaButton compact items={conferenciaItems} totalInCents={subtotal}
                    clienteNome={clientName.trim() || null} origem="Venda balcão (PDV)" />
                </div>

                {cart.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-600">
                    <ShoppingBag className="w-8 h-8 opacity-30" />
                    <p className="text-[11px] text-center">Nenhum item<br/>adicionado</p>
                  </div>
                ) : (
                  // Barra de rolagem destacada: a global tem 6px quase invisível no escuro
                  // e o pessoal do balcão não percebia que a lista continuava pra baixo.
                  <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-surface-400 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {cart.map(({ product, quantity, variantLabel, cartKey }) => {
                      const price = product.isOnPromo && product.discountPriceInCents != null
                        ? product.discountPriceInCents : product.priceInCents
                      return (
                        <div key={cartKey} className="bg-surface-700 border border-surface-500 rounded-xl px-2.5 py-2 space-y-1.5">
                          <p className="text-xs text-white font-medium leading-tight break-words">{product.name}</p>
                          {variantLabel && (
                            <p className="text-[10px] text-violet-400 font-medium">{variantLabel}</p>
                          )}
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-accent-gold font-bold font-mono">
                              {brl(price * quantity / 100)}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => quantity === 1 ? removeFromCart(cartKey) : changeQty(cartKey, -1)}
                                className="w-5 h-5 rounded bg-surface-600 hover:bg-red-600/30 flex items-center justify-center transition-colors"
                              >
                                <Minus className="w-2.5 h-2.5 text-gray-300" />
                              </button>
                              <span className="text-xs font-bold text-white w-4 text-center">{quantity}</span>
                              <button
                                onClick={() => changeQty(cartKey, 1)}
                                className="w-5 h-5 rounded bg-surface-600 hover:bg-brand-600/30 flex items-center justify-center transition-colors disabled:opacity-40"
                              >
                                <Plus className="w-2.5 h-2.5 text-gray-300" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {cart.length > 0 && (
                  <div className="bg-surface-900 rounded-xl px-3 py-2.5 border border-surface-500 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Total</span>
                      <span className="text-accent-gold font-black text-base">{brl(subtotal / 100)}</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── Etapa 3: Desconto + Pagamento ──────────────────── */}
          {step === 3 && (
            <div className={responsivo ? 'grid items-start gap-4 xl:grid-cols-2' : 'space-y-4'}>
              <div className="min-w-0 space-y-4">
              {/* Resumo do carrinho — nome inteiro (sem cortar) e altura maior: em pedido
                  grande o balconista precisa conferir item a item antes de fechar. */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-gray-500">
                    Itens do pedido <span className="text-gray-400 font-semibold">
                      ({cart.length} produto{cart.length !== 1 ? 's' : ''} / {cart.reduce((s, i) => s + i.quantity, 0)} un.)
                    </span>
                  </p>
                  <ConferenciaButton items={conferenciaItems} totalInCents={subtotal}
                    clienteNome={clientName.trim() || null} origem="Venda balcão (PDV)" />
                </div>
                <div className="bg-surface-700 rounded-xl p-3 space-y-1.5 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-surface-400 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {cart.map(({ product, quantity, variantLabel, cartKey }) => {
                    const price = product.isOnPromo && product.discountPriceInCents != null
                      ? product.discountPriceInCents : product.priceInCents
                    return (
                      <div key={cartKey} className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-300 flex-1 leading-snug">
                          <span className="text-white font-semibold">{quantity}×</span> {product.name}
                          {variantLabel && <span className="text-violet-400 text-xs"> · {variantLabel}</span>}
                        </span>
                        <span className="text-gray-400 font-mono shrink-0">{brl(price * quantity / 100)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Desconto */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Desconto
                  </p>
                  <div className="flex gap-1 bg-surface-900 rounded-lg p-0.5">
                    {(['percent', 'cents'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setDiscountMode(mode)}
                        className={clsx(
                          'px-2.5 py-1 rounded-md text-[11px] font-bold transition-all',
                          discountMode === mode
                            ? 'bg-accent-green/20 text-accent-green'
                            : 'text-gray-500 hover:text-gray-300'
                        )}
                      >{mode === 'percent' ? '%' : 'R$'}</button>
                    ))}
                  </div>
                </div>

                {discountMode === 'percent' ? (
                  <PercentPicker value={discountPct} onChange={setDiscountPct} />
                ) : (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={discountValueStr}
                    onChange={e => setDiscountValueStr(e.target.value)}
                    className="input text-sm w-full font-mono"
                  />
                )}
              </div>

              {/* Total */}
              <div className="bg-surface-900 rounded-xl px-4 py-3 space-y-1.5">
                {discountCents > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Subtotal</span>
                      <span className="text-gray-400 font-mono">{brl(subtotal / 100)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-accent-green">
                        Desconto{discountMode === 'percent' ? ` ${discountPct}%` : ''}
                      </span>
                      <span className="text-accent-green font-mono">−{brl(discountCents / 100)}</span>
                    </div>
                    <div className="h-px bg-surface-600" />
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-white font-semibold">Total</span>
                  <span className="text-2xl font-black text-accent-gold">{brl(total / 100)}</span>
                </div>
              </div>

              </div>
              <div className="min-w-0 space-y-4">
              {/* Formas de pagamento */}
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                  {splitEnabled ? 'Pagamento principal (restante)' : 'Forma de pagamento'}
                </p>
                <div className={clsx('grid grid-cols-1 gap-2', responsivo && 'sm:grid-cols-2')}>
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m.value}
                      aria-pressed={payment === m.value}
                      onClick={() => {
                        setPayment(m.value)
                        setReceived('')
                        if (splitEnabled && m.value === secondPayment)
                          setSecondPayment(PAYMENT_METHODS.find(p => p.value !== m.value)?.value ?? 'Dinheiro')
                      }}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                        payment === m.value
                          ? m.value === 'Crediario'
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                            : 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                          : 'border-surface-500 text-gray-400 hover:border-surface-400 hover:text-gray-200'
                      )}
                    >
                      <PagamentoIcone forma={m.value} />
                      <span className="flex-1">{m.label}</span>
                      {splitEnabled && payment === m.value && primaryAmountCents > 0 && (
                        <span className="text-xs font-mono text-white">
                          {brl(primaryAmountCents / 100)}
                        </span>
                      )}
                      {!splitEnabled && m.value === 'Crediario' && (
                        <span className="text-xs text-amber-400/70 font-normal">acumula no saldo</span>
                      )}
                      {!splitEnabled && m.value === 'Cashback' && selectedUser && selectedUser.balanceInCents > 0 && (
                        <span className="text-xs text-emerald-400/70 font-normal">
                          {brl((selectedUser.balanceInCents / 100))} disp.
                        </span>
                      )}
                      {!splitEnabled && m.value === 'Pontos' && selectedUser && selectedUser.pointsBalance > 0 && (
                        <span className="text-xs text-amber-400/70 font-normal">
                          {selectedUser.pointsBalance} pts disp.
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Segundo método de pagamento */}
              <div>
                {responsivo ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm font-semibold">
                    <span>Dividir pagamento</span>
                    <Switch ligado={splitEnabled} onChange={valor => { setSplit(valor); setSecondAmountStr('') }} label="Dividir pagamento" />
                  </div>
                ) : (
                <button
                  type="button"
                  onClick={() => { setSplit(v => !v); setSecondAmountStr('') }}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all',
                    splitEnabled
                      ? 'bg-brand-600/10 border-brand-500/40 text-brand-300'
                      : 'border-surface-500 text-gray-500 hover:border-surface-400 hover:text-gray-300'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    Dividir em dois métodos de pagamento
                  </span>
                  <span className={clsx('w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0',
                    splitEnabled ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-400'
                  )}>
                    {splitEnabled && '✓'}
                  </span>
                </button>
                )}

                {splitEnabled && (
                  <div className="mt-2 bg-surface-800 rounded-xl p-3 space-y-3">
                    <p className="text-xs text-gray-400 font-medium">Segundo pagamento</p>
                    <select
                      value={secondPayment}
                      onChange={e => setSecondPayment(e.target.value)}
                      className="input text-sm w-full"
                    >
                      {PAYMENT_METHODS
                        .filter(m => m.value !== payment)
                        .map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))
                      }
                    </select>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Valor (R$)</label>
                      <div className="flex items-center gap-2">
                      <input
                        type="number" min="0.01" step="0.01"
                        className="input text-sm flex-1"
                        placeholder="0,00"
                        value={secondAmountStr}
                        onChange={e => setSecondAmountStr(e.target.value)}
                        autoFocus={!responsivo}
                      />
                      {secondAmountCents > 0 && secondAmountCents < total && (
                        <span className="text-xs text-gray-400 shrink-0">
                          resto: <span className="text-white font-mono">{brl(primaryAmountCents / 100)}</span>
                        </span>
                      )}
                      </div>
                    </div>
                    {secondAmountCents >= total && secondAmountStr !== '' && (
                      <p className="text-xs text-red-400">Valor do segundo pagamento deve ser menor que o total.</p>
                    )}
                    {selectedUser && secondPayment === 'Cashback' && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>Saldo disponível:</span>
                        <span className={clsx('font-bold', selectedUser.balanceInCents > 0 ? 'text-accent-green' : 'text-red-400')}>
                          {brl((selectedUser.balanceInCents / 100))}
                        </span>
                      </div>
                    )}
                    {selectedUser && secondPayment === 'Pontos' && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>Pontos disponíveis:</span>
                        <span className={clsx('font-bold', selectedUser.pointsBalance > 0 ? 'text-amber-400' : 'text-red-400')}>
                          {selectedUser.pointsBalance} pts
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {needsUser && !selectedUserId && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-xs txt-alerta">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>
                      {payment === 'Crediario' ? 'Crediário' :
                       (PAYMENT_NEEDS_USER as readonly string[]).includes(payment) ? payment :
                       secondPayment === 'Cashback' ? 'Cashback' : 'Pontos'}
                    </strong> exige cliente cadastrado.
                    {responsivo ? (
                      <button type="button" className="ml-1 min-h-8 font-bold underline" onClick={() => editarCliente(3)}>
                        Selecionar cliente
                      </button>
                    ) : ' Volte e selecione um cliente.'}
                  </span>
                </div>
              )}

              {selectedUser && (payment === 'Pontos' || payment === 'Cashback') && (
                <div className="bg-surface-700 border border-surface-500 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                  <span className="text-gray-400">Saldo de {selectedUser.name.split(' ')[0]}:</span>
                  {payment === 'Pontos' && (
                    <span className={clsx('font-bold', selectedUser.pointsBalance > 0 ? 'text-amber-400' : 'text-red-400')}>
                      {selectedUser.pointsBalance} pontos
                    </span>
                  )}
                  {payment === 'Cashback' && (
                    <span className={clsx('font-bold', selectedUser.balanceInCents > 0 ? 'text-accent-green' : 'text-red-400')}>
                      {brl((selectedUser.balanceInCents / 100))}
                    </span>
                  )}
                </div>
              )}

              {payment === 'Dinheiro' && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5" /> Valor recebido (R$)
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    className="input text-sm"
                    placeholder="0,00"
                    value={received}
                    onChange={e => setReceived(e.target.value)}
                    autoFocus={!responsivo}
                  />
                  {received && receivedCents >= 0 && (
                    <div className={clsx(
                      'flex justify-between text-sm font-semibold rounded-xl px-3 py-2',
                      troco >= 0 ? 'bg-accent-green/10 text-accent-green' : 'bg-red-500/10 text-red-400'
                    )}>
                      <span>{troco >= 0 ? 'Troco' : 'Falta'}</span>
                      <span className="font-mono">{brl(Math.abs(troco) / 100)}</span>
                    </div>
                  )}
                </div>
              )}

              </div>
            </div>
          )}
        </div>

        {/* Rodapé de navegação: no celular fica preso no pé da tela (RODAPE_PDV, igual nas telas da comanda). */}
        <div className={responsivo ? RODAPE_PDV : 'flex gap-2 border-t border-surface-500 shrink-0 px-5 py-4'}>
          {step === 1 ? (
            <>
              <button onClick={responsivo ? () => setStep(destinoDoCliente) : onClose} className="btn-secondary flex-1 justify-center text-sm py-2">
                {responsivo ? (destinoDoCliente === 3 ? 'Voltar ao pagamento' : 'Voltar aos produtos') : 'Cancelar'}
              </button>
              <button onClick={() => setStep(responsivo ? destinoDoCliente : 2)} className="btn-primary flex-1 justify-center text-sm">
                {responsivo ? (clientName.trim() ? 'Usar cliente' : 'Consumidor final') : (selectedUser || clientName.trim() ? 'Próximo' : 'Pular')} <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : step === 2 ? (
            <>
              {responsivo && (
                <p aria-live="polite" className="flex w-full items-baseline justify-between gap-2 text-sm font-bold lg:hidden">
                  <span>Total da venda</span><span className="text-lg tabular-nums">{brl(total / 100)}</span>
                </p>
              )}
              {responsivo ? (
                <div className="lg:flex-1">
                  <button type="button" onClick={descartarRascunho} disabled={cart.length === 0 && !clientName.trim()}
                    className="btn-secondary min-h-11 px-2.5 text-sm disabled:opacity-50">Limpar venda</button>
                </div>
              ) : (
              <button onClick={() => setStep(1)} aria-label="Voltar ao cliente" className="btn-secondary py-2 px-3">
                <ChevronLeft className="w-4 h-4" />
              </button>
              )}
              <button
                onClick={() => setStep(3)}
                disabled={cart.length === 0}
                className="btn-primary min-h-11 flex-1 justify-center text-sm disabled:opacity-50"
              >
                {responsivo ? 'Ir para pagamento' : 'Próximo'} <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(2)} aria-label="Voltar aos produtos" disabled={responsivo && submitting} className="btn-secondary py-2 px-3 disabled:opacity-50">
                <ChevronLeft aria-hidden="true" className="w-4 h-4" /> {responsivo && 'Produtos'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (responsivo && cart.length === 0) || (needsUser && !selectedUserId) || !splitValid}
                className="btn-success flex-1 justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                  : <><CheckCircle className="w-4 h-4" /> Confirmar venda · {rotuloCurtoPagamento(payment)}</>
                }
              </button>
            </>
          )}
        </div>
    </>
  )

  return (
    <>
    {responsivo ? (
      <section aria-label="Nova venda" className="min-w-0 rounded-xl border bg-[var(--bg-card)]">{conteudo}</section>
    ) : (
      <MolduraModalPdv onClose={onClose} produtos={step === 2}>{conteudo}</MolduraModalPdv>
    )}

    {/* Conta de crediário: cliente já devendo escolhe entre acumular ou abrir conta nova */}
    {contasCrediario && (
      <EscolherContaCrediarioModal
        userName={clientName.trim() || 'Cliente'}
        contasAbertas={contasCrediario}
        valorNovo={total}
        onEscolher={async id => { setContasCrediario(null); await registrarVenda({ existenteId: id }) }}
        onNova={async venc => { setContasCrediario(null); await registrarVenda({ novaConta: true, vencimento: venc }) }}
        onCancel={()       => setContasCrediario(null)}
      />
    )}

    {/* Seletor de variante (tamanho/cor) */}
    {variantPickerProduct && (
      <VariantPicker
        productId={variantPickerProduct.id}
        productName={variantPickerProduct.name}
        onConfirm={variant => {
          addToCart(variantPickerProduct, variant)
          setVariantPickerProduct(null)
        }}
        onClose={() => setVariantPickerProduct(null)}
      />
    )}
    </>
  )
}
