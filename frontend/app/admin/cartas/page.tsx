'use client'
import { useState, useEffect, useCallback } from 'react'
import { tcgApi, productApi, CardCache, TcgSet, TcgSearchParams } from '@/lib/api'
import toast from 'react-hot-toast'
import { Search, Loader2, Zap, Star, DollarSign, Database, PackagePlus, X, Check, PlusCircle, SlidersHorizontal, RefreshCw, TrendingUp } from 'lucide-react'
import Image from 'next/image'
import clsx from 'clsx'

// ── Modal: adicionar carta PRÓPRIA ao estoque (sem busca na API TCG) ──────────

function AddOwnCardModal({ onClose }: { onClose: () => void }) {
  const [name, setName]       = useState('')
  const [game, setGame]       = useState('Pokemon')
  const [set, setSet]         = useState('')
  const [price, setPrice]     = useState('')
  const [qty, setQty]         = useState(1)
  const [minStock, setMin]    = useState(1)
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('Informe o nome da carta'); return }
    const priceVal = parseFloat(price.replace(',', '.'))
    if (!price || isNaN(priceVal) || priceVal <= 0) { toast.error('Informe um preço válido'); return }
    setSaving(true)
    try {
      await productApi.create({
        name:          name.trim(),
        category:      'Carta Avulsa',
        description:   `${game}${set ? ` — ${set}` : ''}`,
        priceInCents:  Math.round(priceVal * 100),
        stockQuantity: qty,
        minimumStock:  minStock,
        isActive:      true,
        isFeatured:    false,
        imageUrl:      null,
      })
      toast.success(`"${name.trim()}" adicionada ao estoque!`)
      onClose()
    } catch {
      toast.error('Erro ao adicionar ao estoque.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md animate-bounce-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-brand-400" />
            Adicionar Carta Própria
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Nome da carta *</label>
            <input className="input" placeholder="Ex: Pikachu VMAX" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jogo</label>
              <select className="input" value={game} onChange={e => setGame(e.target.value)}>
                {[...GAMES, 'Outro'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Coleção / Set</label>
              <input className="input" placeholder="Ex: Obsidian Flames" value={set} onChange={e => setSet(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Preço de venda (R$) *</label>
            <input className="input" type="number" min="0.01" step="0.01" placeholder="Ex: 35,00" value={price} onChange={e => setPrice(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantidade *</label>
              <input className="input" type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div>
              <label className="label">Estoque mínimo</label>
              <input className="input" type="number" min="0" value={minStock} onChange={e => setMin(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Check className="w-4 h-4" /> Adicionar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

const GAMES = ['Pokemon', 'MTG', 'Yu-Gi-Oh!', 'One Piece TCG', 'LoL Riftbound']

const GAME_FILTERS: Record<string, { rarityLabel: string; rarities: string[]; typeLabel?: string; types?: string[] }> = {
  Pokemon: {
    rarityLabel: 'Raridade',
    rarities: ['Common','Uncommon','Rare','Rare Holo','Double Rare','Illustration Rare','Special Illustration Rare','Hyper Rare','ACE SPEC Rare','Rare Ultra','Rare Secret','Promo'],
    typeLabel: 'Supertipo',
    types: ['Pokémon','Trainer','Energy'],
  },
  MTG: {
    rarityLabel: 'Raridade',
    rarities: ['Common','Uncommon','Rare','Mythic Rare'],
    typeLabel: 'Tipo',
    types: ['Creature','Instant','Sorcery','Enchantment','Artifact','Land','Planeswalker','Battle'],
  },
  'Yu-Gi-Oh!': {
    rarityLabel: 'Tipo de carta',
    rarities: ['Effect Monster','Normal Monster','Ritual Monster','Fusion Monster','Synchro Monster','Xyz Monster','Link Monster','Pendulum Effect Monster','Spell Card','Trap Card'],
    typeLabel: 'Atributo',
    types: ['DARK','LIGHT','FIRE','WATER','EARTH','WIND','DIVINE'],
  },
  'One Piece TCG': {
    rarityLabel: 'Raridade',
    rarities: ['Common','Uncommon','Rare','Super Rare','Secret Rare','Leader','Promotional'],
    typeLabel: 'Tipo',
    types: ['Character','Event','Stage','Leader','DON!!'],
  },
  'LoL Riftbound': {
    rarityLabel: 'Raridade',
    rarities: ['Common','Rare','Epic','Legendary'],
  },
}

const POKEMON_SUBTYPES = ['Basic','Stage 1','Stage 2','EX','GX','V','VMAX','VSTAR','ex','Radiant','Tera','Supporter','Item','Tool','Stadium','Special Energy','Basic Energy']
const POKEMON_ENERGY_TYPES = ['Fire','Water','Grass','Lightning','Psychic','Fighting','Darkness','Metal','Dragon','Colorless']
const POKEMON_REGULATION_MARKS = ['A','B','C','D','E','F','G','H']
const POKEMON_SERIES = ['Scarlet & Violet','Sword & Shield','Sun & Moon','XY','Black & White','HeartGold SoulSilver','Platinum','Diamond & Pearl','EX','Gym','Neo','Base']

// ── Modal: adicionar carta ao estoque ─────────────────────────────────────────

function AddToStockModal({ card, onClose }: { card: CardCache; onClose: () => void }) {
  const usdPrice = card.marketPrices?.market ?? card.marketPrices?.mid
  // Sugere preço em reais: se tiver preço USD, multiplica por 6 (taxa aproximada)
  const [priceReais, setPriceReais] = useState(usdPrice ? (usdPrice * 6).toFixed(2) : '')
  const [qty, setQty]               = useState(1)
  const [minStock, setMinStock]     = useState(1)
  const [saving, setSaving]         = useState(false)

  async function handleSave() {
    const priceVal = parseFloat(priceReais.replace(',', '.'))
    if (!priceReais || isNaN(priceVal) || priceVal <= 0) {
      toast.error('Informe um preço válido')
      return
    }
    setSaving(true)
    try {
      await productApi.create({
        name:          card.name,
        category:      'Carta Avulsa',
        description:   card.setName ? `${card.game} — ${card.setName}${card.number ? ` #${card.number}` : ''}` : card.game,
        priceInCents:  Math.round(priceVal * 100),
        stockQuantity: qty,
        minimumStock:  minStock,
        isActive:      true,
        isFeatured:    false,
        imageUrl:      card.imageUrlSmall ?? null,
      })
      toast.success(`"${card.name}" adicionada ao estoque!`)
      onClose()
    } catch {
      toast.error('Erro ao adicionar ao estoque.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md animate-bounce-in">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-brand-400" />
            Adicionar ao Estoque
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview da carta */}
        <div className="flex items-center gap-3 bg-surface-800 rounded-xl p-3 mb-5">
          {card.imageUrlSmall && (
            <div className="relative w-12 h-16 shrink-0 rounded overflow-hidden">
              <Image src={card.imageUrlSmall} alt={card.name} fill className="object-contain" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{card.name}</p>
            <p className="text-xs text-gray-400">{card.game}{card.setName && ` · ${card.setName}`}</p>
            {card.rarity && <span className="text-[10px] text-amber-400">{card.rarity}</span>}
            {usdPrice && (
              <p className="text-xs text-gray-500 mt-0.5">Ref. mercado: ${usdPrice.toFixed(2)} USD</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Preço de venda (R$) *</label>
            <input
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Ex: 29,90"
              value={priceReais}
              onChange={e => setPriceReais(e.target.value)}
            />
            {usdPrice && (
              <p className="text-[11px] text-gray-500 mt-1">
                Sugestão baseada no preço de mercado USD × 6
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantidade em estoque *</label>
              <input
                className="input"
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div>
              <label className="label">Estoque mínimo</label>
              <input
                className="input"
                type="number"
                min="0"
                value={minStock}
                onChange={e => setMinStock(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              : <><Check className="w-4 h-4" /> Adicionar</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de detalhes da carta ────────────────────────────────────────────────

function CardDetailModal({ card, brlRate, onClose, onAddStock }: {
  card: CardCache; brlRate: number | null; onClose: () => void; onAddStock: () => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [current, setCurrent] = useState(card)

  async function refreshPrice() {
    setRefreshing(true)
    try {
      const r = await tcgApi.getCard(current.tcgCardId)
      setCurrent(r.data)
      toast.success('Preços atualizados!')
    } catch { toast.error('Erro ao atualizar preços.') }
    finally { setRefreshing(false) }
  }

  const usd = current.marketPrices?.market ?? current.marketPrices?.mid ?? current.marketPrices?.low
  const brl = usd && brlRate ? usd * brlRate : null

  const priceVariants = current.allPrices ? [
    { label: 'Normal',          p: current.allPrices.normal },
    { label: 'Holofoil',        p: current.allPrices.holofoil },
    { label: 'Reverse Holo',    p: current.allPrices.reverseHolofoil },
    { label: '1ª Ed. Normal',   p: current.allPrices.firstEditionNormal },
    { label: '1ª Ed. Holo',     p: current.allPrices.firstEditionHolofoil },
    { label: 'Unlimited Normal', p: current.allPrices.unlimitedNormal },
    { label: 'Unlimited Holo',  p: current.allPrices.unlimitedHolofoil },
  ].filter(v => v.p?.market || v.p?.mid) : []

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <div>
            <h2 className="text-lg font-bold text-white">{current.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{current.game}{current.setName && ` · ${current.setName}`}{current.number && ` #${current.number}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshPrice} disabled={refreshing} title="Atualizar preços da API"
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Atualizando...' : 'Refresh preço'}
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row gap-6">
          {/* Imagem */}
          <div className="shrink-0 mx-auto sm:mx-0">
            {current.imageUrlLarge || current.imageUrlSmall ? (
              <div className="relative w-44 aspect-[2.5/3.5] rounded-xl overflow-hidden">
                <Image src={current.imageUrlLarge ?? current.imageUrlSmall!} alt={current.name} fill className="object-contain" />
              </div>
            ) : (
              <div className="w-44 aspect-[2.5/3.5] rounded-xl bg-surface-800 flex items-center justify-center">
                <span className="text-5xl">🃏</span>
              </div>
            )}
          </div>

          {/* Detalhes */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {current.rarity && <span className="badge bg-amber-500/15 text-amber-400 border-amber-500/30">{current.rarity}</span>}
              {current.type && <span className="badge bg-blue-500/15 text-blue-400 border-blue-500/30">{current.type}</span>}
              {current.hp && <span className="badge bg-red-500/15 text-red-400 border-red-500/30">{current.hp}</span>}
              {current.types?.map(t => <span key={t} className="badge bg-purple-500/15 text-purple-400 border-purple-500/30">{t}</span>)}
              {current.subtypes?.slice(0,3).map(s => <span key={s} className="badge bg-green-500/15 text-green-400 border-green-500/30">{s}</span>)}
            </div>

            {/* Preço principal */}
            <div className="bg-surface-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" /> Preço de mercado
              </div>
              {usd ? (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-2xl font-black text-accent-gold">${usd.toFixed(2)} <span className="text-sm font-normal text-gray-500">USD</span></span>
                  {brl && <span className="text-lg font-bold text-green-400">R$ {brl.toFixed(2)}</span>}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Preço não disponível</p>
              )}
              {brlRate && <p className="text-[10px] text-gray-600">Taxa: 1 USD = R$ {brlRate.toFixed(2)}</p>}
            </div>

            {/* Variantes de preço (Pokemon) */}
            {priceVariants.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Variantes</p>
                <div className="grid grid-cols-2 gap-2">
                  {priceVariants.map(v => (
                    <div key={v.label} className="bg-surface-800 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-500 mb-1">{v.label}</p>
                      <p className="text-sm font-bold text-accent-gold">${(v.p!.market ?? v.p!.mid)!.toFixed(2)}</p>
                      {brlRate && <p className="text-xs text-green-400">R$ {((v.p!.market ?? v.p!.mid)! * brlRate).toFixed(2)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ataques (Pokemon) */}
            {current.attacks && current.attacks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ataques</p>
                {current.attacks.map((atk, i) => (
                  <div key={i} className="bg-surface-800 rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{atk.name}</span>
                      {atk.damage && <span className="text-sm font-black text-red-400">{atk.damage}</span>}
                    </div>
                    {atk.cost?.length > 0 && <p className="text-[10px] text-gray-500">Custo: {atk.cost.join(' ')}</p>}
                    {atk.text && <p className="text-xs text-gray-400 leading-relaxed">{atk.text}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Oracle text (MTG) / Efeito (YGO) */}
            {current.flavorText && (
              <div className="space-y-1">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                  {current.game === 'MTG' ? 'Texto de regras' : current.game === 'Yu-Gi-Oh!' ? 'Efeito' : 'Texto'}
                </p>
                <p className="text-xs text-gray-300 leading-relaxed bg-surface-800 rounded-lg p-3 whitespace-pre-wrap">{current.flavorText}</p>
              </div>
            )}

            {/* CardMarket (EUR) */}
            {current.cardMarket && (current.cardMarket.trendPrice || current.cardMarket.averageSellPrice) && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">CardMarket (EUR)</p>
                <div className="bg-surface-800 rounded-xl p-3 grid grid-cols-2 gap-2">
                  {[
                    { l: 'Média venda',    v: current.cardMarket.averageSellPrice },
                    { l: 'Tendência',      v: current.cardMarket.trendPrice },
                    { l: 'Mais baixo',     v: current.cardMarket.lowPrice },
                    { l: 'Ex+',            v: current.cardMarket.lowPriceExPlus },
                    { l: 'Reverse trend',  v: current.cardMarket.reverseHoloTrend },
                    { l: 'Média 30d',      v: current.cardMarket.avg30 },
                  ].filter(r => r.v && r.v > 0).map(r => (
                    <div key={r.l}>
                      <p className="text-[9px] text-gray-500">{r.l}</p>
                      <p className="text-xs font-bold text-blue-300">€{r.v!.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                {current.cardMarket.updatedAt && (
                  <p className="text-[9px] text-gray-600">Atualizado: {current.cardMarket.updatedAt}</p>
                )}
              </div>
            )}

            {/* Fraquezas / Resistências (Pokemon) */}
            {(current.weaknesses?.length > 0 || current.resistances?.length > 0) && (
              <div className="flex gap-4 text-xs">
                {current.weaknesses?.length > 0 && (
                  <div>
                    <p className="text-gray-500 mb-1">Fraqueza</p>
                    {current.weaknesses.map(w => <span key={w.type} className="text-red-400 font-bold">{w.type} {w.value}</span>)}
                  </div>
                )}
                {current.resistances?.length > 0 && (
                  <div>
                    <p className="text-gray-500 mb-1">Resistência</p>
                    {current.resistances.map(r => <span key={r.type} className="text-blue-400 font-bold">{r.type} {r.value}</span>)}
                  </div>
                )}
                {current.retreatCost?.length > 0 && (
                  <div>
                    <p className="text-gray-500 mb-1">Recuo</p>
                    <span className="text-gray-300">{current.retreatCost.length}✦</span>
                  </div>
                )}
              </div>
            )}

            <button onClick={onAddStock} className="btn-primary w-full justify-center">
              <PackagePlus className="w-4 h-4" /> Adicionar ao Estoque
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card item — click abre modal de detalhes ──────────────────────────────────

function CardItem({ card, brlRate, onDetail }: { card: CardCache; brlRate: number | null; onDetail: (c: CardCache) => void }) {
  const price = card.marketPrices?.market ?? card.marketPrices?.mid
  const brl   = price && brlRate ? price * brlRate : null
  const isFromCache = new Date(card.cachedAt).getTime() < Date.now() - 60000

  return (
    <div className="card relative group cursor-pointer hover:border-brand-500/50 transition-colors"
      onClick={() => onDetail(card)}>

      {/* Badge cache */}
      {isFromCache && (
        <div className="absolute top-2 right-2 z-10 bg-black/60 rounded-full p-1" title="Cache MongoDB">
          <Database className="w-3 h-3 text-brand-400" />
        </div>
      )}

      {/* Imagem */}
      <div className="relative w-full aspect-[2.5/3.5] rounded-lg overflow-hidden bg-surface-800 mb-3">
        {card.imageUrlSmall ? (
          <Image src={card.imageUrlSmall} alt={card.name} fill className="object-contain group-hover:scale-105 transition-transform duration-200" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl">🃏</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1.5">
        <p className="font-semibold text-white text-sm leading-tight line-clamp-2">{card.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {card.rarity && <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5" />{card.rarity}</span>}
          {card.type && <span className="badge bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]"><Zap className="w-2.5 h-2.5 mr-0.5" />{card.type.split('—')[0].trim()}</span>}
        </div>
        {card.setName && <p className="text-[10px] text-gray-500 truncate">{card.setName}{card.number && ` #${card.number}`}</p>}
        {price ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-accent-gold">
              <DollarSign className="w-3 h-3" /><span className="font-bold text-sm">${price.toFixed(2)}</span>
              <span className="text-[10px] text-gray-500">USD</span>
            </div>
            {brl && <p className="text-xs text-green-400 font-semibold">R$ {brl.toFixed(2)}</p>}
          </div>
        ) : (
          <p className="text-[10px] text-gray-600">Sem preço</p>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CartasPage() {
  const [query,      setQuery]      = useState('')
  const [game,       setGame]       = useState('Pokemon')
  const [selSet,     setSelSet]     = useState('')
  const [selRarity,  setSelRarity]  = useState('')
  const [selType,    setSelType]    = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [sets,       setSets]       = useState<TcgSet[]>([])
  const [cards,      setCards]      = useState<CardCache[]>([])
  const [loading,    setLoading]    = useState(false)
  const [searched,   setSearched]   = useState(false)
  const [totalPages, setTotalPages] = useState(0)
  const [page,       setPage]       = useState(1)
  const [ownModal,   setOwnModal]   = useState(false)
  const [detailCard, setDetailCard] = useState<CardCache | null>(null)
  const [addStockCard, setAddStockCard] = useState<CardCache | null>(null)
  const [brlRate,    setBrlRate]    = useState<number | null>(null)
  const [brlUpdated, setBrlUpdated] = useState<Date | null>(null)
  const [refreshingBrl, setRefreshingBrl] = useState(false)
  const [noApi,      setNoApi]      = useState(false)
  // Filtros Pokémon avançados
  const [pkArtist,     setPkArtist]     = useState('')
  const [pkSubtype,    setPkSubtype]    = useState('')
  const [pkEnergy,     setPkEnergy]     = useState('')
  const [pkRegMark,    setPkRegMark]    = useState('')
  const [pkLegality,   setPkLegality]   = useState('')
  const [pkEvolvesFrom, setPkEvolvesFrom] = useState('')
  const [pkSeries,     setPkSeries]     = useState('')
  const [pkPtcgo,      setPkPtcgo]      = useState('')
  const [pkDateFrom,   setPkDateFrom]   = useState('')
  const [pkDateTo,     setPkDateTo]     = useState('')
  const [pkPokedex,    setPkPokedex]    = useState('')
  const [pkHpMin,      setPkHpMin]      = useState('')
  const [pkHpMax,      setPkHpMax]      = useState('')

  const gameFilters = GAME_FILTERS[game] ?? GAME_FILTERS['Pokemon']
  const isPokemon   = game === 'Pokemon'

  const fetchBrl = useCallback(async () => {
    setRefreshingBrl(true)
    try {
      const r = await tcgApi.brlRate()
      setBrlRate((r.data as any).usdToBrl)
      setBrlUpdated(new Date())
    } catch {} finally { setRefreshingBrl(false) }
  }, [])

  useEffect(() => { fetchBrl() }, [fetchBrl])

  // Carrega sets quando muda o jogo e limpa filtros específicos de jogo
  useEffect(() => {
    setSelSet(''); setSelRarity(''); setSelType(''); setNoApi(false)
    setPkArtist(''); setPkSubtype(''); setPkEnergy(''); setPkRegMark('')
    setPkLegality(''); setPkEvolvesFrom(''); setPkSeries(''); setPkPtcgo('')
    setPkDateFrom(''); setPkDateTo(''); setPkPokedex(''); setPkHpMin(''); setPkHpMax('')
    if (game) tcgApi.sets(game).then((r: any) => setSets(r.data ?? [])).catch(() => setSets([]))
  }, [game])

  // Detecta busca por código (set + número) — suporta todos os TCGs
  // Pokémon: PAL 058 / SV8PT5 001
  // MTG:     MH3 232 / MH3 232a
  // LoL:     OGN-296 / OGN 296
  // YGO:     DUNE-EN001 → vai como nome (fname); passcode 89631139 → backend usa ?id=
  function detectCodeSearch(q: string): { set: string; num: string } | null {
    const t = q.trim()
    const space  = t.match(/^([A-Za-z][A-Za-z0-9]{1,8})\s+(\d{1,4}[a-z]?)$/)
    if (space)  return { set: space[1],  num: space[2] }
    const hyphen = t.match(/^([A-Za-z][A-Za-z0-9]{1,8})-(\d{1,4}[a-z]?)$/)
    if (hyphen) return { set: hyphen[1], num: hyphen[2] }
    return null
  }

  function codePlaceholder() {
    switch (game) {
      case 'Pokemon':        return 'Nome em PT ou EN (Pikachu, Transmissor da Equipe Rocket) ou código (PAL 058)...'
      case 'MTG':            return 'Nome (Lightning Bolt) ou código (MH3 232, THB 001a)...'
      case 'Yu-Gi-Oh!':     return 'Nome, código (DUNE-EN001) ou passcode (89631139)...'
      case 'One Piece TCG':  return 'Nome (Monkey D. Luffy) ou código (OP01-060)...'
      case 'LoL Riftbound':  return 'Nome (Jinx) ou código (OGN-296, OGN 296)...'
      default:               return 'Nome ou código da carta...'
    }
  }

  async function handleSearch(p = 1) {
    const hasQuery = query.trim().length > 0
    const hasPkFilter = isPokemon && (pkArtist || pkSubtype || pkEnergy || pkRegMark || pkLegality ||
      pkEvolvesFrom || pkSeries || pkPtcgo || pkDateFrom || pkDateTo || pkPokedex || pkHpMin || pkHpMax)
    const hasBasicFilter = selSet || selRarity || selType

    if (!hasQuery && !hasPkFilter && !hasBasicFilter) {
      toast.error('Digite o nome ou utilize ao menos um filtro para buscar')
      return
    }

    setLoading(true); setNoApi(false)
    try {
      const codeMatch = hasQuery ? detectCodeSearch(query) : null
      let items: CardCache[] = [], totalPgs = 0
      let errorMsg: string | undefined

      if (codeMatch) {
        const r = await tcgApi.searchByCode(codeMatch.set, codeMatch.num, game || 'Pokemon')
        items = r.data.items ?? []; totalPgs = 1
        errorMsg = (r.data as any).errorMessage
      } else {
        const params: TcgSearchParams = {
          name:     query || undefined,
          game:     game  || undefined,
          page:     p,
          pageSize: 30,
          setId:    selSet    || undefined,
          rarity:   selRarity || undefined,
          cardType: selType   || undefined,
          ...(isPokemon ? {
            artist:          pkArtist      || undefined,
            subtype:         pkSubtype     || undefined,
            energyType:      pkEnergy      || undefined,
            regulationMark:  pkRegMark     || undefined,
            legality:        pkLegality    || undefined,
            evolvesFrom:     pkEvolvesFrom || undefined,
            setSeries:       pkSeries      || undefined,
            ptcgoCode:       pkPtcgo       || undefined,
            releaseDateFrom: pkDateFrom    || undefined,
            releaseDateTo:   pkDateTo      || undefined,
            pokedexNumber:   pkPokedex ? parseInt(pkPokedex) : undefined,
            hpMin:           pkHpMin   ? parseInt(pkHpMin)   : undefined,
            hpMax:           pkHpMax   ? parseInt(pkHpMax)   : undefined,
          } : {}),
        }
        const r = await tcgApi.searchAdvanced(params)
        items = r.data.items ?? []; totalPgs = r.data.totalPages ?? 0
        errorMsg = (r.data as any).errorMessage
      }

      if (errorMsg === 'no_api') { setNoApi(true); setCards([]); setSearched(true); return }

      setCards(items)
      setTotalPages(totalPgs)
      setPage(p)
      setSearched(true)
      if (!items.length) toast(
        isPokemon
          ? 'Nenhuma carta encontrada. Tente o nome em PT ou EN, ou o código (ex: PAL 058).'
          : game === 'MTG'
            ? 'Nenhuma carta encontrada. Tente o nome em inglês ou o código (ex: MH3 232).'
            : game === 'Yu-Gi-Oh!'
              ? 'Nenhuma carta encontrada. Tente o nome em inglês ou o código (ex: DUNE-EN001).'
              : 'Nenhuma carta encontrada. Verifique o nome ou o código.',
        { icon: '🔍' }
      )
    } catch { toast.error('Erro ao buscar cartas.') }
    finally { setLoading(false) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {ownModal && <AddOwnCardModal onClose={() => setOwnModal(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Busca de Cartas TCG</h1>
          <p className="text-gray-400 text-sm mt-0.5">Clique na carta para ver detalhes e preços · Hover no card para ver ações</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* BRL Rate */}
          <div className="flex items-center gap-2 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-sm">
            <span className="text-gray-400">USD/BRL</span>
            {brlRate ? (
              <span className="font-bold text-green-400">R$ {brlRate.toFixed(2)}</span>
            ) : (
              <span className="text-gray-600">–</span>
            )}
            <button onClick={fetchBrl} disabled={refreshingBrl} title="Atualizar cotação"
              className="text-gray-500 hover:text-white transition-colors ml-1">
              <RefreshCw className={clsx('w-3.5 h-3.5', refreshingBrl && 'animate-spin')} />
            </button>
            {brlUpdated && (
              <span className="text-[10px] text-gray-600">
                {Math.round((Date.now() - brlUpdated.getTime()) / 60000)}min
              </span>
            )}
          </div>
          <button onClick={() => setOwnModal(true)} className="btn-primary text-sm shrink-0">
            <PlusCircle className="w-4 h-4" /> Adicionar Carta Própria
          </button>
        </div>
      </div>

      {/* Busca */}
      <div className="card flex flex-col gap-3">
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          {isPokemon ? (
            <>🔍 Busca em <strong>português ou inglês</strong> — ex: <em>Pikachu</em>, <em>Transmissor da Equipe Rocket</em>. Código: <code className="bg-surface-700 px-1 rounded">PAL 058</code> ou <code className="bg-surface-700 px-1 rounded">ex6 12</code></>
          ) : game === 'MTG' ? (
            <>⚠️ Busca em <strong>inglês</strong> — ex: <em>Lightning Bolt</em>. Código de set: <code className="bg-surface-700 px-1 rounded">MH3 232</code> ou <code className="bg-surface-700 px-1 rounded">THB 001a</code></>
          ) : game === 'Yu-Gi-Oh!' ? (
            <>⚠️ Busca em <strong>inglês</strong> — ex: <em>Dark Magician</em>. Código: <code className="bg-surface-700 px-1 rounded">DUNE-EN001</code> ou passcode: <code className="bg-surface-700 px-1 rounded">89631139</code></>
          ) : game === 'One Piece TCG' ? (
            <>⚠️ API One Piece ainda não integrada — adicione cartas manualmente pelo painel abaixo.</>
          ) : (
            <>⚠️ Busca em <strong>inglês</strong> — ex: <em>Jinx</em>. Código: <code className="bg-surface-700 px-1 rounded">OGN-296</code></>
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <select className="input sm:w-44" value={game} onChange={e => setGame(e.target.value)}>
            {GAMES.map(g => <option key={g}>{g}</option>)}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              className="input pl-9"
              placeholder={codePlaceholder()}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            onClick={() => setShowFilter(v => !v)}
            className={clsx('btn-secondary px-3', showFilter && 'ring-1 ring-brand-500')}
            title="Filtros avançados"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button onClick={() => handleSearch()} disabled={loading} className="btn-primary px-6">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        {/* Filtros avançados */}
        {showFilter && (
          <div className="flex flex-col gap-3 pt-2 border-t border-surface-700">
            {/* Linha 1 — Set + Raridade + Supertipo */}
            <div className="flex flex-col sm:flex-row gap-2">
              {sets.length > 0 && (
                <select className="input flex-1" value={selSet} onChange={e => setSelSet(e.target.value)}>
                  <option value="">Todos os sets</option>
                  {sets.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              )}
              {gameFilters.rarities.length > 0 && (
                <select className="input flex-1" value={selRarity} onChange={e => setSelRarity(e.target.value)}>
                  <option value="">{game === 'Yu-Gi-Oh!' ? 'Todos os tipos de carta' : `Toda ${gameFilters.rarityLabel.toLowerCase()}`}</option>
                  {gameFilters.rarities.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              {gameFilters.types && gameFilters.types.length > 0 && (
                <select className="input flex-1" value={selType} onChange={e => setSelType(e.target.value)}>
                  <option value="">{game === 'Yu-Gi-Oh!' ? 'Todos atributos' : `Todo ${gameFilters.typeLabel?.toLowerCase() ?? 'tipo'}`}</option>
                  {gameFilters.types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>

            {/* Filtros exclusivos Pokémon */}
            {isPokemon && (
              <div className="border border-surface-500 rounded-xl p-3 space-y-2 bg-surface-800/40">
                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Filtros Pokémon</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {/* Subtipo */}
                  <select className="input text-xs" value={pkSubtype} onChange={e => setPkSubtype(e.target.value)}>
                    <option value="">Subtipo</option>
                    {POKEMON_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {/* Tipo de energia */}
                  <select className="input text-xs" value={pkEnergy} onChange={e => setPkEnergy(e.target.value)}>
                    <option value="">Tipo de energia</option>
                    {POKEMON_ENERGY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {/* Regulation Mark */}
                  <select className="input text-xs" value={pkRegMark} onChange={e => setPkRegMark(e.target.value)}>
                    <option value="">Regulation Mark</option>
                    {POKEMON_REGULATION_MARKS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {/* Legalidade */}
                  <select className="input text-xs" value={pkLegality} onChange={e => setPkLegality(e.target.value)}>
                    <option value="">Legalidade</option>
                    <option value="standard">Standard</option>
                    <option value="expanded">Expanded</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                  {/* Série */}
                  <select className="input text-xs" value={pkSeries} onChange={e => setPkSeries(e.target.value)}>
                    <option value="">Série</option>
                    {POKEMON_SERIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {/* PTCGO Code */}
                  <input className="input text-xs" placeholder="Código PTCGO (PAL)" value={pkPtcgo} onChange={e => setPkPtcgo(e.target.value)} />
                  {/* Artista */}
                  <input className="input text-xs" placeholder="Artista" value={pkArtist} onChange={e => setPkArtist(e.target.value)} />
                  {/* Evolui de */}
                  <input className="input text-xs" placeholder="Evolui de" value={pkEvolvesFrom} onChange={e => setPkEvolvesFrom(e.target.value)} />
                  {/* Pokédex # */}
                  <input className="input text-xs" placeholder="Nº Pokédex (ex: 25)" type="number" min="1" max="1025" value={pkPokedex} onChange={e => setPkPokedex(e.target.value)} />
                  {/* HP */}
                  <div className="flex gap-1 col-span-1">
                    <input className="input text-xs w-full" placeholder="HP mín" type="number" min="10" value={pkHpMin} onChange={e => setPkHpMin(e.target.value)} />
                    <input className="input text-xs w-full" placeholder="HP máx" type="number" min="10" value={pkHpMax} onChange={e => setPkHpMax(e.target.value)} />
                  </div>
                  {/* Data de lançamento */}
                  <div className="flex gap-1 col-span-1 sm:col-span-2">
                    <input className="input text-xs w-full" placeholder="Data de (YYYY/MM/DD)" value={pkDateFrom} onChange={e => setPkDateFrom(e.target.value)} />
                    <input className="input text-xs w-full" placeholder="Data até" value={pkDateTo} onChange={e => setPkDateTo(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Limpar tudo */}
            {(selSet || selRarity || selType || pkArtist || pkSubtype || pkEnergy || pkRegMark || pkLegality || pkEvolvesFrom || pkSeries || pkPtcgo || pkDateFrom || pkDateTo || pkPokedex || pkHpMin || pkHpMax) && (
              <button onClick={() => {
                setSelSet(''); setSelRarity(''); setSelType('')
                setPkArtist(''); setPkSubtype(''); setPkEnergy(''); setPkRegMark('')
                setPkLegality(''); setPkEvolvesFrom(''); setPkSeries(''); setPkPtcgo('')
                setPkDateFrom(''); setPkDateTo(''); setPkPokedex(''); setPkHpMin(''); setPkHpMax('')
              }} className="text-xs text-gray-400 hover:text-white px-2 text-left">
                Limpar todos os filtros ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modais */}
      {detailCard && (
        <CardDetailModal
          card={detailCard}
          brlRate={brlRate}
          onClose={() => setDetailCard(null)}
          onAddStock={() => { setAddStockCard(detailCard); setDetailCard(null) }}
        />
      )}
      {addStockCard && <AddToStockModal card={addStockCard} onClose={() => setAddStockCard(null)} />}

      {/* Grid de resultados */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Buscando na API TCG...</p>
          </div>
        </div>
      ) : noApi ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-4xl">🎮</p>
          <p className="text-white font-bold">API do {game} não disponível publicamente</p>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {game === 'One Piece TCG'
              ? 'Não há API pública integrada para o One Piece TCG.'
              : 'A Riot Games ainda não disponibilizou uma API pública para o LoL: Riftbound.'}
            {' '}Use <strong className="text-white">"Adicionar Carta Própria"</strong> para cadastrar cartas manualmente.
          </p>
          <button onClick={() => setOwnModal(true)} className="btn-primary mt-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Carta Própria
          </button>
        </div>
      ) : searched && cards.length > 0 ? (
        <>
          <p className="text-gray-400 text-sm">{cards.length} carta{cards.length !== 1 ? 's' : ''} encontrada{cards.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {cards.map(c => <CardItem key={c.tcgCardId} card={c} brlRate={brlRate} onDetail={setDetailCard} />)}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => handleSearch(page - 1)} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-sm">← Anterior</button>
              <span className="text-gray-400 text-sm">Página {page} de {totalPages}</span>
              <button onClick={() => handleSearch(page + 1)} disabled={page === totalPages} className="btn-secondary px-3 py-1.5 text-sm">Próxima →</button>
            </div>
          )}
        </>
      ) : !searched ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">🃏</div>
          <p className="text-gray-400 font-medium">Busque cartas de qualquer TCG</p>
          <p className="text-gray-400 text-sm mt-1">Pokémon, Magic, Yu-Gi-Oh, One Piece e mais</p>
          <p className="text-gray-400 text-sm mt-0.5">Passe o mouse sobre a carta para adicionar ao estoque</p>
        </div>
      ) : null}
    </div>
  )
}
