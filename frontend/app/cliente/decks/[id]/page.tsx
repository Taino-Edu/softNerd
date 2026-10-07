'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { deckApi, tcgApi, userApi, CardCache, DeckCard, TcgSet, TcgSearchParams } from '@/lib/api'
import {
  Search, Plus, Minus, Trash2, Save, Loader2,
  ArrowLeft, Globe, Lock, Zap, Upload, X, Camera,
  ChevronDown, SlidersHorizontal, RefreshCw, Eye,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { brl } from '@/lib/format'

const C = { navy: '#0C3D5A', blue: '#3EC2F2', blue2: '#1A9DD4', yellow: '#FFE45E', bg: '#EBF7FD', white: '#FFFFFF', muted: '#4D8FAC', border: 'rgba(62,194,242,0.18)' }

const GAMES   = ['Pokemon', 'MTG', 'Yu-Gi-Oh!', 'One Piece TCG', 'LoL Riftbound']
const FORMATS: Record<string, string[]> = {
  Pokemon:          ['Standard', 'Expanded', 'Unlimited', 'Pocket'],
  MTG:              ['Standard', 'Modern', 'Legacy', 'Commander', 'Draft'],
  'Yu-Gi-Oh!':     ['Advanced', 'Traditional'],
  'One Piece TCG':  ['Standard', 'Draft'],
  'LoL Riftbound':  ['Standard'],
}
const MAX_CARDS:  Record<string, number> = { Pokemon: 60, MTG: 60, 'Yu-Gi-Oh!': 60, 'One Piece TCG': 50, 'LoL Riftbound': 50 }
const MAX_COPIES: Record<string, number> = { Pokemon: 4,  MTG: 4,  'Yu-Gi-Oh!': 3,  'One Piece TCG': 4,  'LoL Riftbound': 3 }

// Opções de filtro por jogo — seguindo padrão dos sites oficiais
const POKEMON_SUBTYPES      = ['Basic','Stage 1','Stage 2','EX','GX','V','VMAX','VSTAR','ex','Radiant','Tera','Supporter','Item','Tool','Stadium','Special Energy','Basic Energy']
const POKEMON_ENERGY_TYPES  = ['Fire','Water','Grass','Lightning','Psychic','Fighting','Darkness','Metal','Dragon','Colorless']
const POKEMON_REGULATION_MARKS = ['A','B','C','D','E','F','G','H']
const POKEMON_SERIES        = ['Scarlet & Violet','Sword & Shield','Sun & Moon','XY','Black & White','HeartGold SoulSilver','Platinum','Diamond & Pearl','EX','Gym','Neo','Base']

const GAME_FILTERS: Record<string, {
  rarityLabel: string
  rarities: string[]
  typeLabel?: string
  types?: string[]
}> = {
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
    typeLabel: 'Tipo',
    types: [],
  },
}

function cardKey(c: CardCache) { return c.tcgCardId }
// Energia (Pokémon) não tem limite de cópias por regra oficial — o resto do jogo segue MAX_COPIES normal.
function copyLimit(card: { type?: string | null }, base: number) { return card.type === 'Energy' ? Infinity : base }
function mainPrice(c: CardCache) {
  const p = c.allPrices?.holofoil ?? c.allPrices?.normal ?? c.allPrices?.reverseHolofoil ?? c.marketPrices
  return p?.market ?? p?.mid ?? null
}

// ── Card no grid de busca ─────────────────────────────────────────────────────
function CardGridItem({ card, qty, maxCopies, onAdd, onPreview }: {
  card: CardCache; qty: number; maxCopies: number
  onAdd: (c: CardCache) => void; onPreview: (c: CardCache) => void
}) {
  const price = mainPrice(card)
  const limit = copyLimit(card, maxCopies)
  const full  = qty >= limit
  return (
    <div className="relative rounded-xl overflow-hidden flex flex-col"
      style={{ backgroundColor: C.white, border: `1px solid ${full ? C.blue2 : C.border}` }}>
      {/* imagem */}
      <button onClick={() => onPreview(card)} className="w-full aspect-[2.5/3.5] bg-gray-100 overflow-hidden">
        {card.imageUrlSmall
          ? <img src={card.imageUrlSmall} alt={card.name} className="w-full h-full object-cover" loading="lazy"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden') }}
            />
          : null}
        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 px-1 text-center"
          hidden={!!card.imageUrlSmall}>{card.name}</div>
      </button>
      {/* info */}
      <div className="px-1.5 py-1 flex-1 flex flex-col gap-0.5">
        <p className="text-[10px] font-black leading-tight line-clamp-2" style={{ color: C.navy }}>{card.name}</p>
        <p className="text-[9px]" style={{ color: C.muted }}>{card.setCode} #{card.number}</p>
        {price && <p className="text-[9px] font-bold" style={{ color: C.blue2 }}>${price.toFixed(2)}</p>}
      </div>
      {/* botão add */}
      <button
        onClick={() => onAdd(card)}
        disabled={full}
        className="w-full py-1.5 text-[10px] font-black transition-colors"
        style={{ backgroundColor: full ? '#e5e7eb' : C.blue, color: full ? C.muted : '#fff' }}
      >
        {full ? `${qty}/${maxCopies}` : qty > 0 ? `+1 (${qty})` : '+ Adicionar'}
      </button>
    </div>
  )
}

// ── Modal de preview de carta ─────────────────────────────────────────────────
function CardPreviewModal({ card, onClose, onAdd, qty, maxCopies, brlRate }: {
  card: CardCache; onClose: () => void; onAdd: (c: CardCache) => void; qty: number; maxCopies: number; brlRate: number | null
}) {
  const price  = mainPrice(card)
  const limit  = copyLimit(card, maxCopies)
  const full   = qty >= limit
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{ backgroundColor: C.white }}
        onClick={e => e.stopPropagation()}>
        <div className="flex gap-4 p-4">
          {/* imagem grande */}
          <div className="w-36 shrink-0">
            {card.imageUrlLarge
              ? <img src={card.imageUrlLarge} alt={card.name} className="w-full rounded-xl shadow-lg" />
              : card.imageUrlSmall
              ? <img src={card.imageUrlSmall} alt={card.name} className="w-full rounded-xl shadow-lg" />
              : <div className="w-full aspect-[2.5/3.5] rounded-xl bg-gray-100" />}
          </div>
          {/* dados */}
          <div className="flex-1 min-w-0 space-y-2 overflow-y-auto max-h-[60vh] pr-1">
            <div>
              <p className="font-black text-base leading-tight" style={{ color: C.navy }}>{card.name}</p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>{card.setName}{card.setCode && ` · ${card.setCode}`}{card.number && ` #${card.number}`}</p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {card.hp && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>{card.game === 'Pokemon' ? `HP ${card.hp}` : card.hp}</span>}
              {card.rarity && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: C.bg, color: C.muted }}>{card.rarity}</span>}
              {card.types?.map(t => <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: C.bg, color: C.blue2 }}>{t}</span>)}
              {card.subtypes?.slice(0,2).map(s => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: C.bg, color: C.muted }}>{s}</span>)}
            </div>

            {/* Ataques (Pokemon) */}
            {card.attacks?.length > 0 && (
              <div className="space-y-1">
                {card.attacks.map((a, i) => (
                  <div key={i} className="rounded-lg p-1.5 text-[10px]" style={{ backgroundColor: C.bg }}>
                    <div className="flex items-center justify-between">
                      <span className="font-black" style={{ color: C.navy }}>{a.name}</span>
                      {a.damage && <span className="font-black" style={{ color: C.blue2 }}>{a.damage}</span>}
                    </div>
                    {a.cost?.length > 0 && <p style={{ color: C.muted }}>Custo: {a.cost.join(' ')}</p>}
                    {a.text && <p className="mt-0.5 leading-snug" style={{ color: C.muted }}>{a.text}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Oracle text / Efeito (MTG / YGO) */}
            {card.flavorText && (
              <div className="rounded-lg p-2 text-[10px] leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: C.bg, color: C.muted }}>
                <p className="font-black mb-0.5" style={{ color: C.navy }}>
                  {card.game === 'MTG' ? 'Texto de regras' : card.game === 'Yu-Gi-Oh!' ? 'Efeito' : 'Texto'}
                </p>
                {card.flavorText}
              </div>
            )}

            {/* Fraquezas / Resistências (Pokemon) */}
            {(card.weaknesses?.length > 0 || card.resistances?.length > 0) && (
              <div className="flex gap-4 text-[10px]" style={{ color: C.muted }}>
                {card.weaknesses?.length > 0 && (
                  <div>
                    <p className="font-black mb-0.5">Fraqueza</p>
                    {card.weaknesses.map(w => <span key={w.type} className="font-bold" style={{ color: '#ef4444' }}>{w.type} {w.value}</span>)}
                  </div>
                )}
                {card.resistances?.length > 0 && (
                  <div>
                    <p className="font-black mb-0.5">Resistência</p>
                    {card.resistances.map(r => <span key={r.type} className="font-bold" style={{ color: C.blue2 }}>{r.type} {r.value}</span>)}
                  </div>
                )}
                {card.retreatCost?.length > 0 && (
                  <div>
                    <p className="font-black mb-0.5">Recuo</p>
                    <span>{card.retreatCost.length}✦</span>
                  </div>
                )}
              </div>
            )}

            {/* Preços */}
            {price && (
              <div className="rounded-lg p-2" style={{ backgroundColor: C.bg }}>
                <p className="text-[10px] font-black mb-1" style={{ color: C.navy }}>Preço de mercado</p>
                <p className="font-black text-sm" style={{ color: C.blue2 }}>${price.toFixed(2)} <span className="text-[10px] font-normal" style={{ color: C.muted }}>USD</span></p>
                {brlRate && <p className="text-xs font-bold" style={{ color: '#16a34a' }}>{brl(price * brlRate)}</p>}

                {/* Variantes */}
                {card.allPrices && (
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {[
                      { l: 'Normal',          p: card.allPrices.normal },
                      { l: 'Holofoil',        p: card.allPrices.holofoil },
                      { l: 'Reverse Holo',    p: card.allPrices.reverseHolofoil },
                      { l: '1ª Ed. Holo',     p: card.allPrices.firstEditionHolofoil },
                      { l: '1ª Ed. Normal',   p: card.allPrices.firstEditionNormal },
                      { l: 'Unltd. Holo',     p: card.allPrices.unlimitedHolofoil },
                    ].filter(v => v.p?.market || v.p?.mid).map(v => (
                      <div key={v.l} className="rounded p-1" style={{ backgroundColor: C.white }}>
                        <p className="text-[9px]" style={{ color: C.muted }}>{v.l}</p>
                        <p className="text-[10px] font-bold" style={{ color: C.blue2 }}>${(v.p!.market ?? v.p!.mid)!.toFixed(2)}</p>
                        {brlRate && <p className="text-[9px]" style={{ color: '#16a34a' }}>{brl((v.p!.market ?? v.p!.mid)! * brlRate)}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {/* CardMarket */}
                {card.cardMarket && (card.cardMarket.trendPrice || card.cardMarket.averageSellPrice) && (
                  <div className="mt-2">
                    <p className="text-[9px] font-bold mb-1" style={{ color: C.muted }}>CardMarket (EUR)</p>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { l: 'Tendência', v: card.cardMarket.trendPrice },
                        { l: 'Média',     v: card.cardMarket.averageSellPrice },
                        { l: 'Mais baixo',v: card.cardMarket.lowPrice },
                        { l: 'Média 30d', v: card.cardMarket.avg30 },
                      ].filter(r => r.v && r.v > 0).map(r => (
                        <div key={r.l} className="rounded p-1" style={{ backgroundColor: C.white }}>
                          <p className="text-[9px]" style={{ color: C.muted }}>{r.l}</p>
                          <p className="text-[10px] font-bold" style={{ color: '#1d4ed8' }}>€{r.v!.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {card.artist && <p className="text-[10px]" style={{ color: C.muted }}>Ilustração: {card.artist}</p>}
          </div>
        </div>
        <div className="px-4 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold text-sm"
            style={{ backgroundColor: C.bg, color: C.muted }}>
            Fechar
          </button>
          <button onClick={() => { onAdd(card); onClose() }} disabled={full}
            className="flex-1 py-3 rounded-xl font-black text-sm disabled:opacity-40"
            style={{ backgroundColor: full ? '#e5e7eb' : C.blue, color: full ? C.muted : '#fff' }}>
            {full ? `Máximo (${qty}/${maxCopies})` : `+ Adicionar ao deck`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de busca profissional ───────────────────────────────────────────────
function CardSearchModal({ game, onAdd, onImport, deckCards, onClose, maxCopies, brlRate }: {
  game: string; onAdd: (c: CardCache) => void; onImport: (cards: DeckCard[]) => void
  deckCards: DeckCard[]; onClose: () => void; maxCopies: number; brlRate: number | null
}) {
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<CardCache[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [loadMore,   setLoadMore]   = useState(false)
  const [noApi,      setNoApi]      = useState(false)
  const [sets,       setSets]       = useState<TcgSet[]>([])
  const [selSet,      setSelSet]      = useState('')
  const [selRarity,   setSelRarity]   = useState('')
  const [selCardType, setSelCardType] = useState('')
  const [showFilter,  setShowFilter]  = useState(false)
  const gameFilters  = GAME_FILTERS[game] ?? GAME_FILTERS['Pokemon']
  const isPokemon    = game === 'Pokemon'
  const [preview,    setPreview]    = useState<CardCache | null>(null)
  // Pokémon advanced filters
  const [pkArtist,      setPkArtist]      = useState('')
  const [pkSubtype,     setPkSubtype]     = useState('')
  const [pkEnergy,      setPkEnergy]      = useState('')
  const [pkRegMark,     setPkRegMark]     = useState('')
  const [pkLegality,    setPkLegality]    = useState('')
  const [pkEvolvesFrom, setPkEvolvesFrom] = useState('')
  const [pkSeries,      setPkSeries]      = useState('')
  const [pkPtcgo,       setPkPtcgo]       = useState('')

  // Camera — usa <input capture> em vez de getUserMedia (funciona em todos os celulares)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [camCrop,    setCamCrop]    = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [detecting,  setDetecting]  = useState(false)

  const PAGE_SIZE = 30
  const timeout   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    tcgApi.sets(game).then(r => setSets(r.data ?? [])).catch(() => {})
  }, [game])

  // Detecta busca por código (set + número) — cobre todos os TCGs
  function detectCode(q: string): { set: string; num: string } | null {
    const t = q.trim()
    const space  = t.match(/^([A-Za-z][A-Za-z0-9]{1,8})\s+(\d{1,4}[a-z]?)$/)
    if (space)  return { set: space[1],  num: space[2] }
    const hyphen = t.match(/^([A-Za-z][A-Za-z0-9]{1,8})-(\d{1,4}[a-z]?)$/)
    if (hyphen) return { set: hyphen[1], num: hyphen[2] }
    return null
  }

  const searchPlaceholder = useMemo(() => {
    switch (game) {
      case 'Pokemon':        return 'Nome em PT ou EN (Pikachu, Transmissor da Equipe Rocket) ou código (PAL 058)'
      case 'MTG':            return 'Nome (Lightning Bolt) ou código (MH3 232, THB 001a)'
      case 'Yu-Gi-Oh!':     return 'Nome, código (DUNE-EN001) ou passcode (89631139)'
      case 'One Piece TCG':  return 'Nome (Monkey D. Luffy) ou código (OP01-060)'
      case 'LoL Riftbound':  return 'Nome (Jinx) ou código (OGN-296)'
      default:               return 'Nome ou código da carta...'
    }
  }, [game])

  const doSearch = useCallback(async (q: string, pg: number, append = false) => {
    const hasQuery = q.trim().length >= 2
    const hasPkFilter = isPokemon && (pkArtist || pkSubtype || pkEnergy || pkRegMark || pkLegality || pkEvolvesFrom || pkSeries || pkPtcgo)
    if (!hasQuery && !hasPkFilter && !selSet && !selRarity && !selCardType) {
      if (!append) { setResults([]); setTotal(0); setNoApi(false) }
      return
    }
    append ? setLoadMore(true) : setLoading(true)
    if (!append) setNoApi(false)
    try {
      const codeMatch = hasQuery ? detectCode(q) : null
      let items: CardCache[] = [], tot = 0
      let errMsg: string | undefined

      if (codeMatch) {
        const r = await tcgApi.searchByCode(codeMatch.set, codeMatch.num, game)
        items = r.data.items ?? []; tot = r.data.totalCount ?? items.length
        errMsg = (r.data as any).errorMessage
      } else {
        const params: TcgSearchParams = {
          name:     q.trim() || undefined,
          game,
          page:     pg,
          pageSize: PAGE_SIZE,
          setId:    selSet      || undefined,
          rarity:   selRarity   || undefined,
          cardType: selCardType  || undefined,
          ...(isPokemon ? {
            artist:         pkArtist      || undefined,
            subtype:        pkSubtype     || undefined,
            energyType:     pkEnergy      || undefined,
            regulationMark: pkRegMark     || undefined,
            legality:       pkLegality    || undefined,
            evolvesFrom:    pkEvolvesFrom || undefined,
            setSeries:      pkSeries      || undefined,
            ptcgoCode:      pkPtcgo       || undefined,
          } : {}),
        }
        const r = await tcgApi.searchAdvanced(params)
        items = r.data.items ?? []; tot = r.data.totalCount ?? items.length
        errMsg = (r.data as any).errorMessage
      }

      if (errMsg === 'no_api') { setNoApi(true); setResults([]); setTotal(0); return }
      setResults(prev => append ? [...prev, ...items] : items)
      setTotal(tot)
      setPage(pg)
    } catch { toast.error('Erro na busca.') }
    finally { append ? setLoadMore(false) : setLoading(false) }
  }, [game, isPokemon, selSet, selRarity, selCardType, pkArtist, pkSubtype, pkEnergy, pkRegMark, pkLegality, pkEvolvesFrom, pkSeries, pkPtcgo])

  useEffect(() => {
    clearTimeout(timeout.current)
    timeout.current = setTimeout(() => doSearch(query, 1), 400)
    return () => clearTimeout(timeout.current)
  }, [query, doSearch])

  // ── Câmera — <input capture="environment"> funciona em 100% dos celulares ───

  function openCamera() { cameraInputRef.current?.click() }

  async function handleCameraFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // reset para permitir re-selecionar a mesma foto

    setDetecting(true)
    try {
      // Carrega imagem e recorta a faixa inferior (onde fica o código da carta)
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result as string)
        fr.onerror = rej
        fr.readAsDataURL(file)
      })
      const img = new Image()
      img.src = dataUrl
      await new Promise(r => { img.onload = r })

      const cropH = Math.round(img.height * 0.22)
      const c = document.createElement('canvas')
      c.width = img.width; c.height = cropH
      c.getContext('2d')!.drawImage(img, 0, img.height - cropH, img.width, cropH, 0, 0, img.width, cropH)
      setCamCrop(c.toDataURL('image/jpeg', 0.92))

      // Tenta TextDetector (Chrome Android — quando disponível)
      let detected = ''
      if ('TextDetector' in window) {
        try {
          // @ts-ignore
          const det = new window.TextDetector()
          const bmp = await createImageBitmap(c)
          const texts: { rawValue: string }[] = await det.detect(bmp)
          const raw = texts.map(t => t.rawValue).join(' ')
          const m = raw.match(/([A-Z][A-Z0-9]{1,7})\s{0,3}(\d{1,3})/i)
          if (m) detected = `${m[1].toUpperCase()} ${m[2]}`
        } catch {}
      }
      setManualCode(detected)
    } catch { toast.error('Erro ao processar imagem.') }
    finally { setDetecting(false) }
  }

  function confirmCameraCode() {
    if (manualCode.trim()) { setQuery(manualCode.trim()); setCamCrop(null); setManualCode('') }
  }

  // ── Import de lista ─────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing,  setImporting]  = useState(false)

  async function importDeckList() {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean)
    const cardLines = lines.filter(l => /^\d+\s+/.test(l))
    if (!cardLines.length) { toast.error('Nenhuma carta encontrada.'); return }
    setImporting(true)
    let added = 0; const failed: string[] = []
    const newCards: DeckCard[] = []

    for (const line of cardLines) {
      const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z0-9]{2,8})\s+(\d+)\s*$/)
      if (!match) { failed.push(line); continue }
      const [, qtyStr, name, setCode, number] = match
      const qtyRequested = parseInt(qtyStr)
      try {
        const r = await tcgApi.searchByCode(setCode, number, game)
        const card = r.data.items?.[0]
        if (card) {
          const limit = copyLimit(card, maxCopies)
          const qty   = Math.min(qtyRequested, limit)
          const ex = newCards.find(c => c.id === cardKey(card))
          if (ex) ex.quantity = Math.min(ex.quantity + qty, limit)
          else newCards.push({ id: cardKey(card), name: card.name, quantity: qty, setCode: card.setCode ?? undefined, setName: card.setName ?? undefined, number: card.number ?? undefined, imageSmall: card.imageUrlSmall ?? undefined, type: card.type ?? undefined, hp: card.hp ?? undefined })
          added++
        } else {
          newCards.push({ id: `manual:${setCode}-${number}`, name, quantity: Math.min(qtyRequested, maxCopies), setCode, number })
          added++
        }
      } catch { failed.push(line) }
    }
    onImport(newCards)
    onClose()
    toast(failed.length ? `${added} importadas. ${failed.length} não encontradas.` : `${added} cartas importadas!`,
      { icon: failed.length ? '⚠️' : '✅', duration: 4000 })
    setImporting(false)
    setShowImport(false)
    setImportText('')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: C.bg }}>
        {/* Header */}
        <div style={{ backgroundColor: C.navy }}>
          <div className="max-w-lg mx-auto px-4 pt-10 pb-4 space-y-3">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
              <p className="font-black text-white flex-1">Buscar cartas</p>
              <button
                onClick={() => setShowImport(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <Upload className="w-3.5 h-3.5" /> Importar
              </button>
            </div>

            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none bg-white/10 text-white placeholder-white/40"
                />
                {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <button onClick={openCamera}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                title="Escanear carta com câmera">
                <Camera className="w-4.5 h-4.5 text-white" />
              </button>
              <button onClick={() => setShowFilter(v => !v)}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: showFilter ? C.yellow : 'rgba(255,255,255,0.15)' }}>
                <SlidersHorizontal className={`w-4 h-4 ${showFilter ? '' : 'text-white'}`} style={showFilter ? { color: C.navy } : {}} />
              </button>
            </div>

            {/* Aviso de idioma */}
            {isPokemon && (
              <p className="text-[10px] text-white/40 -mt-1 px-1">
                Busca em português ou inglês: <em>Transmissor da Equipe Rocket</em> ou <em>Rocket&apos;s Transmission</em>
              </p>
            )}

            {/* Filtros — dinâmicos por jogo */}
            {showFilter && (
              <div className="flex flex-col gap-2 pb-1">
                {/* Set */}
                {sets.length > 0 && (
                  <select value={selSet} onChange={e => { setSelSet(e.target.value); setPage(1) }}
                    className="w-full rounded-xl px-3 py-2 text-xs font-bold border-0 outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                    <option value="" style={{ color: C.navy }}>Todos os sets</option>
                    {sets.map(s => <option key={s.code} value={s.code} style={{ color: C.navy }}>{s.name}</option>)}
                  </select>
                )}
                <div className="flex gap-2">
                  {gameFilters.rarities.length > 0 && (
                    <select value={selRarity} onChange={e => { setSelRarity(e.target.value); setPage(1) }}
                      className="flex-1 rounded-xl px-3 py-2 text-xs font-bold border-0 outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                      <option value="" style={{ color: C.navy }}>{game === 'Yu-Gi-Oh!' ? 'Todos os tipos' : `Toda ${gameFilters.rarityLabel.toLowerCase()}`}</option>
                      {gameFilters.rarities.map(r => <option key={r} value={r} style={{ color: C.navy }}>{r}</option>)}
                    </select>
                  )}
                  {gameFilters.types && gameFilters.types.length > 0 && (
                    <select value={selCardType} onChange={e => { setSelCardType(e.target.value); setPage(1) }}
                      className="flex-1 rounded-xl px-3 py-2 text-xs font-bold border-0 outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                      <option value="" style={{ color: C.navy }}>{game === 'Yu-Gi-Oh!' ? 'Todos atributos' : 'Todo tipo'}</option>
                      {gameFilters.types.map(t => <option key={t} value={t} style={{ color: C.navy }}>{t}</option>)}
                    </select>
                  )}
                </div>

                {/* Filtros exclusivos Pokémon */}
                {isPokemon && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                    {[
                      { label: 'Subtipo',     val: pkSubtype,     set: setPkSubtype,     opts: POKEMON_SUBTYPES },
                      { label: 'Energia',     val: pkEnergy,      set: setPkEnergy,      opts: POKEMON_ENERGY_TYPES },
                      { label: 'Reg. Mark',   val: pkRegMark,     set: setPkRegMark,     opts: POKEMON_REGULATION_MARKS },
                      { label: 'Legalidade',  val: pkLegality,    set: setPkLegality,    opts: ['standard','expanded','unlimited'] },
                      { label: 'Série',       val: pkSeries,      set: setPkSeries,      opts: POKEMON_SERIES },
                    ].map(f => (
                      <select key={f.label} value={f.val} onChange={e => { f.set(e.target.value); setPage(1) }}
                        className="rounded-xl px-2 py-1.5 text-[11px] font-bold border-0 outline-none"
                        style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                        <option value="" style={{ color: C.navy }}>{f.label}</option>
                        {f.opts.map(o => <option key={o} value={o} style={{ color: C.navy }}>{o}</option>)}
                      </select>
                    ))}
                    <input
                      value={pkArtist} onChange={e => { setPkArtist(e.target.value); setPage(1) }}
                      placeholder="Artista"
                      className="rounded-xl px-2 py-1.5 text-[11px] border-0 outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    />
                    <input
                      value={pkEvolvesFrom} onChange={e => { setPkEvolvesFrom(e.target.value); setPage(1) }}
                      placeholder="Evolui de"
                      className="rounded-xl px-2 py-1.5 text-[11px] border-0 outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    />
                    <input
                      value={pkPtcgo} onChange={e => { setPkPtcgo(e.target.value); setPage(1) }}
                      placeholder="Código PTCGO (PAL)"
                      className="col-span-2 rounded-xl px-2 py-1.5 text-[11px] border-0 outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    />
                  </div>
                )}

                {(selSet || selRarity || selCardType || pkArtist || pkSubtype || pkEnergy || pkRegMark || pkLegality || pkEvolvesFrom || pkSeries || pkPtcgo) && (
                  <button onClick={() => {
                    setSelSet(''); setSelRarity(''); setSelCardType('')
                    setPkArtist(''); setPkSubtype(''); setPkEnergy(''); setPkRegMark('')
                    setPkLegality(''); setPkEvolvesFrom(''); setPkSeries(''); setPkPtcgo('')
                  }} className="text-xs text-white/50 hover:text-white/80 text-left px-1">
                    Limpar filtros ×
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Import panel */}
        {showImport && (
          <div className="max-w-lg mx-auto w-full px-4 py-4 space-y-3"
            style={{ backgroundColor: C.white, borderBottom: `1px solid ${C.border}` }}>
            <p className="text-xs font-bold" style={{ color: C.muted }}>Cole a lista (formato limitlesstcg / PTCG Live):</p>
            <p className="text-[10px] font-mono rounded-lg px-3 py-1.5" style={{ backgroundColor: C.bg, color: C.muted }}>
              4 Pikachu PAL 058{'\n'}2 Raichu PAR 021
            </p>
            <textarea value={importText} onChange={e => setImportText(e.target.value)}
              placeholder="Cole o deck list aqui..." rows={6}
              className="w-full rounded-xl p-3 text-xs font-mono outline-none resize-none"
              style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.navy }} />
            <div className="flex gap-2">
              <button onClick={() => { setShowImport(false); setImportText('') }}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ backgroundColor: C.bg, color: C.muted }}>Cancelar</button>
              <button onClick={importDeckList} disabled={importing || !importText.trim()}
                className="flex-1 py-2 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: C.blue, color: '#fff' }}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importando...' : 'Importar deck'}
              </button>
            </div>
          </div>
        )}

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-3 py-4">
            {total > 0 && (
              <p className="text-xs mb-3 px-1" style={{ color: C.muted }}>
                {total} versão{total !== 1 ? 'ões' : ''} encontrada{total !== 1 ? 's' : ''} · mostrando {results.length}
              </p>
            )}
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.blue }} />
              </div>
            ) : noApi ? (
              <div className="text-center py-16 space-y-2 px-4">
                <p className="text-3xl">🎮</p>
                <p className="font-bold text-sm" style={{ color: C.navy }}>API não disponível para {game}</p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                  {game === 'One Piece TCG'
                    ? 'A API One Piece ainda não está integrada. Peça ao admin para adicionar as cartas manualmente.'
                    : 'A Riot Games ainda não disponibilizou uma API pública para o LoL: Riftbound. Você pode adicionar cartas manualmente pelo painel admin.'}
                </p>
              </div>
            ) : results.length === 0 && query.trim().length >= 2 ? (
              <div className="text-center py-16">
                <p className="font-bold text-sm" style={{ color: C.muted }}>Nenhuma carta encontrada.</p>
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  {game === 'Pokemon'     ? 'Tente o nome em PT ou EN, ou o código (ex: PAL 058).'
                  : game === 'MTG'        ? 'Tente o nome em inglês ou o código (ex: MH3 232).'
                  : game === 'Yu-Gi-Oh!' ? 'Tente o nome em inglês ou o código (ex: DUNE-EN001).'
                  :                        'Tente um nome diferente ou o código da carta.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {results.map(c => (
                    <CardGridItem
                      key={cardKey(c)} card={c}
                      qty={deckCards.find(d => d.id === cardKey(c))?.quantity ?? 0}
                      maxCopies={maxCopies}
                      onAdd={card => onAdd(card)}
                      onPreview={setPreview}
                    />
                  ))}
                </div>
                {results.length < total && (
                  <button
                    onClick={() => doSearch(query, page + 1, true)}
                    disabled={loadMore}
                    className="w-full mt-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                    style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, color: C.navy }}>
                    {loadMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Ver mais ({total - results.length} restantes)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Input de câmera oculto */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraFile}
      />

      {/* Modal de confirmação do código detectado */}
      {(camCrop || detecting) && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex flex-col items-center justify-center p-4 gap-4">
          {detecting ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <p className="text-white/70 text-sm">Analisando imagem...</p>
            </div>
          ) : (
            <>
              <p className="text-white font-bold text-sm">Faixa inferior da carta detectada:</p>
              {camCrop && (
                <img src={camCrop} alt="Faixa inferior" className="w-full max-w-xs rounded-xl border border-white/20" />
              )}
              <p className="text-white/60 text-xs text-center">
                {manualCode ? `Código detectado: ${manualCode}` : 'Código não detectado automaticamente — digite abaixo'}
              </p>
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmCameraCode()}
                placeholder={searchPlaceholder}
                className="w-full max-w-xs text-center bg-white/10 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/40 text-sm font-mono outline-none focus:border-white/60"
              />
              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={() => { setCamCrop(null); setManualCode('') }}
                  className="flex-1 py-3 rounded-xl border border-white/30 text-white/70 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCameraCode}
                  disabled={!manualCode.trim()}
                  className="flex-1 py-3 rounded-xl bg-brand-500 text-white font-bold text-sm disabled:opacity-40"
                >
                  Buscar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Preview de carta */}
      {preview && (
        <CardPreviewModal
          card={preview} onClose={() => setPreview(null)}
          onAdd={card => { onAdd(card); setPreview(null) }}
          qty={deckCards.find(d => d.id === cardKey(preview))?.quantity ?? 0}
          maxCopies={maxCopies} brlRate={brlRate}
        />
      )}
    </>
  )
}

// ── Linha de carta no deck ────────────────────────────────────────────────────
function DeckCardRow({ card, qty, onInc, onDec, onRemove, maxCopies, readOnly }: {
  card: DeckCard; qty: number; onInc: () => void; onDec: () => void; onRemove: () => void; maxCopies: number
  readOnly?: boolean
}) {
  const limit = copyLimit(card, maxCopies)
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {card.imageSmall
        ? <img src={card.imageSmall} alt={card.name} className="w-6 h-8 object-contain rounded shrink-0" />
        : <div className="w-6 h-8 rounded bg-gray-100 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate" style={{ color: C.navy }}>{card.name}</p>
        <p className="text-[10px]" style={{ color: C.muted }}>{card.setCode} {card.number}</p>
      </div>
      {readOnly ? (
        <span className="w-6 text-center font-black text-sm shrink-0" style={{ color: C.navy }}>{qty}</span>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onDec} className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center font-black text-sm" style={{ color: C.navy }}>{qty}</span>
          <button onClick={onInc} disabled={qty >= limit}
            className="w-6 h-6 rounded-lg flex items-center justify-center disabled:opacity-40"
            style={{ backgroundColor: qty >= limit ? '#e5e7eb' : `${C.blue}20`, color: C.blue2 }}>
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={onRemove} className="w-6 h-6 rounded-lg flex items-center justify-center ml-1" style={{ color: '#9CA3AF' }}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DeckBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const isNew  = id === 'novo'
  const router = useRouter()

  const [deckName, setDeckName] = useState('')
  const [game,     setGame]     = useState('Pokemon')
  const [format,   setFormat]   = useState('Standard')
  const [isPublic, setIsPublic] = useState(false)
  const [cards,    setCards]    = useState<DeckCard[]>([])
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(!isNew)
  const [brlRate,  setBrlRate]  = useState<number | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [ownerId,     setOwnerId]     = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Somente leitura quando quem está vendo não é o dono do deck (ex: admin conferindo
  // o deck de um participante de campeonato) — o backend já bloqueia salvar nesse caso,
  // isso só evita mostrar controles de edição que nunca vão funcionar.
  const readOnly = !isNew && !!ownerId && !!currentUserId && ownerId !== currentUserId

  useEffect(() => {
    if (isNew) return
    deckApi.get(id).then(r => {
      setDeckName(r.data.name); setGame(r.data.game); setFormat(r.data.format)
      setIsPublic(r.data.isPublic); setOwnerId(r.data.userId)
      try { setCards(JSON.parse(r.data.cardsJson)) } catch { setCards([]) }
    }).catch(() => toast.error('Deck não encontrado.')).finally(() => setLoading(false))
    userApi.me().then(r => setCurrentUserId(r.data.id)).catch(() => {})
  }, [id, isNew])

  useEffect(() => {
    tcgApi.brlRate().then(r => setBrlRate(r.data.usdToBrl)).catch(() => {})
  }, [])

  const maxCopies  = MAX_COPIES[game] ?? 4
  const maxCards   = MAX_CARDS[game] ?? 60
  const totalCards = cards.reduce((s, c) => s + c.quantity, 0)

  function addCard(cache: CardCache) {
    const existing = cards.find(c => c.id === cardKey(cache))
    if (existing) {
      const limit = copyLimit(cache, maxCopies)
      if (existing.quantity >= limit) { toast(`Máximo de ${limit} cópias!`, { icon: '⚠️' }); return }
      setCards(prev => prev.map(c => c.id === cardKey(cache) ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      if (totalCards >= maxCards) { toast(`Deck cheio! (${maxCards} cartas)`, { icon: '⚠️' }); return }
      setCards(prev => [...prev, {
        id: cardKey(cache), name: cache.name, quantity: 1,
        setCode: cache.setCode ?? undefined, setName: cache.setName ?? undefined,
        number: cache.number ?? undefined, imageSmall: cache.imageUrlSmall ?? undefined,
        type: cache.type ?? undefined, hp: cache.hp ?? undefined,
      }])
    }
    toast.success(`${cache.name} adicionado!`, { duration: 1200 })
  }

  function importCards(imported: DeckCard[]) {
    setCards(prev => {
      const merged = [...prev]
      for (const imp of imported) {
        const ex = merged.find(c => c.id === imp.id)
        const limit = copyLimit(imp, maxCopies)
        if (ex) ex.quantity = Math.min(ex.quantity + imp.quantity, limit)
        else merged.push({ ...imp, quantity: Math.min(imp.quantity, limit) })
      }
      return merged
    })
  }

  function incCard(id: string)    { setCards(prev => prev.map(c => c.id === id && c.quantity < copyLimit(c, maxCopies) ? { ...c, quantity: c.quantity + 1 } : c)) }
  function decCard(id: string)    { setCards(prev => prev.map(c => c.id === id ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c)) }
  function removeCard(id: string) { setCards(prev => prev.filter(c => c.id !== id)) }

  async function save() {
    if (!deckName.trim()) { toast.error('Dê um nome ao deck!'); return }
    setSaving(true)
    try {
      const payload = { name: deckName.trim(), game, format, cardsJson: JSON.stringify(cards), isPublic }
      if (isNew) {
        const r = await deckApi.create(payload)
        toast.success('Deck criado!'); router.replace(`/cliente/decks/${r.data.id}`)
      } else {
        await deckApi.update(id, payload); toast.success('Deck salvo!')
      }
    } catch { toast.error('Erro ao salvar.') }
    finally { setSaving(false) }
  }

  function exportText() {
    const pokemon  = cards.filter(c => c.type === 'Pokémon' || c.type === 'Pokemon')
    const trainers = cards.filter(c => c.type === 'Trainer')
    const energy   = cards.filter(c => c.type === 'Energy')
    const other    = cards.filter(c => !['Pokémon', 'Pokemon', 'Trainer', 'Energy'].includes(c.type ?? ''))
    const fmt = (g: DeckCard[], label: string) =>
      g.length ? `${label}: ${g.reduce((s, c) => s + c.quantity, 0)}\n` +
        g.map(c => `${c.quantity} ${c.name}${c.setCode ? ` ${c.setCode.toUpperCase()}` : ''}${c.number ? ` ${c.number}` : ''}`).join('\n') : ''
    const text = [fmt(pokemon, 'Pokémon'), fmt(trainers, 'Trainer'), fmt(energy, 'Energy'), fmt(other, 'Other'), `\nTotal Cards: ${totalCards}`].filter(Boolean).join('\n\n')
    navigator.clipboard.writeText(text).then(() => toast.success('Lista copiada!'))
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.blue }} />
    </div>
  )

  const grouped = [
    { label: 'Pokémon', items: cards.filter(c => c.type === 'Pokémon' || c.type === 'Pokemon') },
    { label: 'Trainer', items: cards.filter(c => c.type === 'Trainer') },
    { label: 'Energy',  items: cards.filter(c => c.type === 'Energy') },
    { label: 'Outros',  items: cards.filter(c => !['Pokémon', 'Pokemon', 'Trainer', 'Energy'].includes(c.type ?? '')) },
  ].filter(g => g.items.length > 0)

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <Toaster position="top-center" />

      {/* Header */}
      <header style={{ backgroundColor: C.navy }}>
        <div className="max-w-lg mx-auto px-5 pt-10 pb-5 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/cliente/decks')} className="text-white/60 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <input value={deckName} onChange={e => setDeckName(e.target.value)} disabled={readOnly}
              placeholder="Nome do deck..." maxLength={100}
              className="flex-1 bg-transparent text-white font-black text-lg placeholder-white/40 outline-none disabled:opacity-80" />
            {!readOnly && (
              <button onClick={() => setIsPublic(v => !v)}
                className="p-2 rounded-lg" title={isPublic ? 'Público' : 'Privado'}
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: isPublic ? C.yellow : 'rgba(255,255,255,0.5)' }}>
                {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </button>
            )}
          </div>
          {readOnly && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <Eye className="w-3.5 h-3.5 text-white/70 shrink-0" />
              <span className="text-xs text-white/70 font-semibold">Somente leitura — você não é o dono deste deck.</span>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <select value={game} disabled={readOnly}
              onChange={e => { setGame(e.target.value); setFormat(FORMATS[e.target.value]?.[0] ?? 'Standard') }}
              className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold border-0 outline-none disabled:opacity-70"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {GAMES.map(g => <option key={g} value={g} style={{ color: C.navy }}>{g}</option>)}
            </select>
            <select value={format} disabled={readOnly} onChange={e => setFormat(e.target.value)}
              className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold border-0 outline-none disabled:opacity-70"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {(FORMATS[game] ?? ['Standard']).map(f => <option key={f} value={f} style={{ color: C.navy }}>{f}</option>)}
            </select>
            <div className="ml-auto shrink-0 flex items-center px-3 py-1.5 rounded-xl"
              style={{ backgroundColor: totalCards === maxCards ? '#22c55e20' : 'rgba(255,255,255,0.1)' }}>
              <span className={`text-xs font-black ${totalCards === maxCards ? 'text-green-400' : 'text-white/80'}`}>
                {totalCards}/{maxCards}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-32">
        {/* Botão abre picker */}
        {!readOnly && (
          <button onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(12,61,90,0.06)' }}>
            <Search className="w-5 h-5 shrink-0" style={{ color: C.blue }} />
            <span className="flex-1 text-left text-sm" style={{ color: C.muted }}>Buscar cartas para adicionar...</span>
            <Plus className="w-5 h-5 shrink-0" style={{ color: C.blue }} />
          </button>
        )}

        {/* Lista do deck */}
        {cards.length === 0 ? (
          <div className="text-center py-12" style={{ color: C.muted }}>
            <p className="text-sm">Clique acima para buscar e adicionar cartas ao deck.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(12,61,90,0.06)' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
              <span className="font-bold text-sm" style={{ color: C.navy }}>Lista do deck</span>
              <button onClick={exportText} className="text-xs font-bold flex items-center gap-1" style={{ color: C.blue2 }}>
                <Zap className="w-3 h-3" /> Copiar lista
              </button>
            </div>
            {grouped.map(group => (
              <div key={group.label}>
                <div className="px-4 py-1.5 flex items-center justify-between"
                  style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>{group.label}</span>
                  <span className="text-[10px] font-black" style={{ color: C.muted }}>{group.items.reduce((s, c) => s + c.quantity, 0)}</span>
                </div>
                <div className="divide-y" style={{ borderColor: C.border }}>
                  {group.items.map(c => (
                    <DeckCardRow key={c.id} card={c} qty={c.quantity}
                      onInc={() => incCard(c.id)} onDec={() => decCard(c.id)}
                      onRemove={() => removeCard(c.id)} maxCopies={maxCopies} readOnly={readOnly} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-50">
        <div className="max-w-lg mx-auto px-4 pb-6 pt-2">
          <div className="rounded-2xl shadow-xl" style={{ backgroundColor: C.navy }}>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1">
                <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Deck</p>
                <p className="font-black text-white">{totalCards}/{maxCards} cartas</p>
                {brlRate && (
                  <p className="text-[10px] mt-0.5" style={{ color: C.yellow }}>
                    Valor estimado disponível após busca
                  </p>
                )}
              </div>
              {readOnly ? (
                <span className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  <Eye className="w-4 h-4" /> Somente leitura
                </span>
              ) : (
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm active:scale-95 disabled:opacity-60"
                  style={{ backgroundColor: C.yellow, color: C.navy }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isNew ? 'Criar deck' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de busca */}
      {showPicker && (
        <CardSearchModal
          game={game} onAdd={addCard} onImport={importCards} deckCards={cards}
          onClose={() => setShowPicker(false)}
          maxCopies={maxCopies} brlRate={brlRate}
        />
      )}
    </div>
  )
}
