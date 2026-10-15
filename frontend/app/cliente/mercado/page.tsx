'use client'
// Mercado de Cartas (cartas avulsas da loja). v1.52.0: saiu do visual escuro do painel admin pro
// visual claro da loja, com o topo único da conta (CabecalhoCliente). O menu da página inicial
// também traz visitante sem login pra cá — aí o "voltar" leva pra página inicial.

import { useEffect, useState, useCallback } from 'react'
import { marketplaceApi, CardListingDto } from '@/lib/api'
import { getUserId, isLoggedIn } from '@/lib/auth'
import CabecalhoCliente from '@/components/cliente/CabecalhoCliente'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  Search, Heart, HeartOff, Package, Loader2,
  X, ChevronLeft, ChevronRight, User as UserIcon,
} from 'lucide-react'

/** Paleta clara da loja (cores no style: o tema claro do site remapeia classes text-white/surface). */
const L = {
  fundo: '#F5F8FA', card: '#FFFFFF', borda: 'rgba(12,61,90,0.10)', texto: '#0F1B33', suave: '#5B6B84',
  azul: '#1E4FD6', foto: '#F1F5FD',
}

const CONDITIONS: { value: string; label: string; color: string }[] = [
  { value: 'NM',  label: 'Near Mint',       color: '#15803D' },
  { value: 'LP',  label: 'Light Played',    color: '#A16207' },
  { value: 'MP',  label: 'Moderate Played', color: '#C2410C' },
  { value: 'HP',  label: 'Heavy Played',    color: '#DC2626' },
  { value: 'DMG', label: 'Damaged',         color: '#991B1B' },
]
const conditionLabel = Object.fromEntries(CONDITIONS.map(c => [c.value, c.label]))
const conditionColor = Object.fromEntries(CONDITIONS.map(c => [c.value, c.color]))

const GAMES = ['Magic', 'Pokémon', 'Yu-Gi-Oh!', 'One Piece', 'Dragon Ball', 'Digimon', 'Outro']

function fmtPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Card de listagem ──────────────────────────────────────────────────────────
function ListingCard({ listing, onInterest }: {
  listing: CardListingDto
  onInterest: (listing: CardListingDto) => void
}) {
  return (
    <div className={clsx(
      'rounded-2xl border p-3 flex flex-col gap-3 relative overflow-hidden',
      listing.status === 'Sold'     && 'opacity-60',
      listing.status === 'Reserved' && 'ring-1 ring-amber-500/40',
    )} style={{ backgroundColor: L.card, borderColor: L.borda }}>
      {/* status badge */}
      {listing.status !== 'Available' && (
        <div className="absolute top-2 right-2 z-10">
          <span className={clsx(
            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
            listing.status === 'Sold'     && 'bg-red-50 text-red-600 border border-red-200',
            listing.status === 'Reserved' && 'bg-amber-50 text-amber-700 border border-amber-200',
          )}>
            {listing.status === 'Sold' ? 'Vendido' : 'Reservado'}
          </span>
        </div>
      )}

      {/* imagem ou placeholder */}
      <div className="rounded-xl overflow-hidden h-36 flex items-center justify-center" style={{ backgroundColor: L.foto }}>
        {listing.cardImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.cardImageUrl} alt={listing.cardName} className="h-full w-full object-contain" />
        ) : (
          <Package className="w-10 h-10" style={{ color: L.suave, opacity: 0.4 }} />
        )}
      </div>

      {/* info */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <p className="font-black text-sm leading-tight truncate" style={{ color: L.texto }}>{listing.cardName}</p>
        {listing.cardGame && <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: L.azul }}>{listing.cardGame}</p>}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-semibold" style={{ color: conditionColor[listing.condition] ?? L.suave }}>
            {conditionLabel[listing.condition] ?? listing.condition}
          </span>
        </div>
        <p className="text-lg font-black mt-1" style={{ color: L.texto }}>{fmtPrice(listing.priceInCents)}</p>
        {listing.description && (
          <p className="text-xs line-clamp-2" style={{ color: L.suave }}>{listing.description}</p>
        )}
      </div>

      {/* vendedor */}
      <Link
        href={`/perfil/${listing.sellerId}`}
        className="flex items-center gap-2 mt-auto pt-2 border-t hover:opacity-80 transition-opacity"
        style={{ borderColor: L.borda }}
      >
        {listing.sellerImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.sellerImageUrl} alt={listing.sellerName} className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: L.foto }}>
            <UserIcon className="w-3 h-3" style={{ color: L.suave }} />
          </div>
        )}
        <span className="text-xs truncate" style={{ color: L.suave }}>{listing.sellerName}</span>
      </Link>

      {/* ação */}
      <button
        onClick={() => onInterest(listing)}
        disabled={listing.status === 'Sold'}
        className={clsx(
          'flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-colors border',
          listing.status === 'Sold' && 'opacity-40 cursor-not-allowed',
        )}
        style={listing.myInterest
          ? { backgroundColor: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' }
          : { backgroundColor: '#EAF0FD', color: L.azul, borderColor: '#D5E1FB' }}
      >
        {listing.myInterest ? <HeartOff className="w-3.5 h-3.5" /> : <Heart className="w-3.5 h-3.5" />}
        {listing.myInterest ? 'Remover interesse' : `Tenho interesse${listing.interestCount > 0 ? ` (${listing.interestCount})` : ''}`}
      </button>
    </div>
  )
}

// ── Modal de consentimento de interesse ──────────────────────────────────────
function InterestConsentModal({ listing, onClose, onConfirm }: {
  listing: CardListingDto
  onClose: () => void
  onConfirm: (opts: { message?: string; shareContact: boolean }) => Promise<void>
}) {
  const [message,      setMessage]      = useState('')
  const [shareContact, setShareContact] = useState(false)
  const [isAdult,      setIsAdult]      = useState(false)
  const [saving,       setSaving]       = useState(false)

  async function submit() {
    if (!isAdult) { toast.error('Confirme que você tem 18 anos ou mais'); return }
    setSaving(true)
    try { await onConfirm({ message: message || undefined, shareContact }) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-4 p-6"
        style={{ backgroundColor: '#FFFFFF' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: '#0C3D5A' }}>Marcar interesse</h2>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors" style={{ color: '#4D8FAC' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: '#F0F4F8' }}>
          {listing.cardImageUrl ? (
            <img src={listing.cardImageUrl} alt={listing.cardName} className="w-10 h-10 rounded-lg object-contain" style={{ backgroundColor: '#E8EFF5' }} />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E8EFF5' }}><Package className="w-5 h-5" style={{ color: '#4D8FAC' }} /></div>
          )}
          <div>
            <p className="font-semibold text-sm" style={{ color: '#0C3D5A' }}>{listing.cardName}</p>
            <p className="text-sm font-bold" style={{ color: L.azul }}>{fmtPrice(listing.priceInCents)}</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#4D8FAC' }}>Mensagem para o vendedor (opcional)</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2"
            style={{ borderColor: 'rgba(12,61,90,0.15)', color: '#0C3D5A', backgroundColor: '#F8FAFC', height: 64 }}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Ex: Tenho interesse, posso buscar na loja!"
            maxLength={300}
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={shareContact}
            onChange={e => setShareContact(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded shrink-0 accent-blue-500"
          />
          <span className="text-xs leading-relaxed" style={{ color: '#4D8FAC' }}>
            Autorizo que o vendedor veja meu número de WhatsApp para combinarmos a negociação.{' '}
            <span style={{ color: '#9CA3AF' }}>(Opcional)</span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isAdult}
            onChange={e => setIsAdult(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded shrink-0 accent-blue-500"
          />
          <span className="text-xs leading-relaxed" style={{ color: '#4D8FAC' }}>
            Declaro que tenho 18 anos ou mais, ou que possuo autorização dos meus pais/responsáveis para negociar. *
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border transition-colors"
            style={{ borderColor: 'rgba(12,61,90,0.2)', color: '#4D8FAC' }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving || !isAdult}
            className="px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 transition-all disabled:opacity-40"
            style={{ backgroundColor: L.azul, color: '#FFFFFF' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar interesse
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MercadoPage() {
  const myId = getUserId() || null

  const [items,          setItems]          = useState<CardListingDto[]>([])
  const [totalPages,     setTotalPages]     = useState(1)
  const [page,           setPage]           = useState(1)
  const [search,         setSearch]         = useState('')
  const [gameFilter,     setGameFilter]     = useState('')
  const [loading,        setLoading]        = useState(true)
  const [consentListing, setConsentListing] = useState<CardListingDto | null>(null)
  // Visitante (veio pelo menu da página inicial) volta pra página inicial; cliente volta pra área dele
  const [voltar, setVoltar] = useState('/')
  useEffect(() => { if (isLoggedIn()) setVoltar('/cliente') }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await marketplaceApi.list({ page, pageSize: 20, game: gameFilter || undefined, search: search || undefined })
      setItems(data.items); setTotalPages(data.totalPages)
    } catch { toast.error('Erro ao carregar') }
    finally  { setLoading(false) }
  }, [page, gameFilter, search])

  useEffect(() => { load() }, [load])

  function requestInterest(listing: CardListingDto) {
    if (!myId) { toast.error('Faça login para marcar interesse'); return }
    if (listing.myInterest) {
      // Desmarca sem consentimento — só remove
      doToggleInterest(listing.id, {})
      return
    }
    setConsentListing(listing)
  }

  async function doToggleInterest(id: string, opts: { message?: string; shareContact?: boolean }) {
    try {
      const { data } = await marketplaceApi.toggleInterest(id, opts)
      setItems(prev => prev.map(i => i.id === id
        ? { ...i, myInterest: data.interested, interestCount: data.interestCount }
        : i
      ))
      toast.success(data.interested ? 'Interesse marcado!' : 'Interesse removido')
    } catch { toast.error('Erro') }
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: L.fundo, colorScheme: 'light' }}>
      <Toaster position="top-right" />

      <CabecalhoCliente titulo="Mercado de Cartas" subtitulo="Cartas avulsas da loja" voltar={voltar} />

      <div className="max-w-5xl mx-auto px-4 pt-5">
      {/* Filtros */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: L.suave }} />
          <input
            className="w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: L.card, borderColor: L.borda, color: L.texto }}
            placeholder="Buscar carta..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="rounded-xl border px-3 py-2.5 text-sm max-w-[160px] outline-none"
          style={{ backgroundColor: L.card, borderColor: L.borda, color: L.texto }}
          value={gameFilter}
          onChange={e => { setGameFilter(e.target.value); setPage(1) }}
        >
          <option value="">Todos os jogos</option>
          {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: L.azul }} />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ backgroundColor: L.card, borderColor: L.borda }}>
          <Package className="w-12 h-12 mx-auto mb-3" style={{ color: L.suave, opacity: 0.4 }} />
          <p className="text-lg font-black" style={{ color: L.texto }}>Nenhuma carta encontrada</p>
          <p className="text-sm mt-1" style={{ color: L.suave }}>Tente outro nome ou jogo — a loja põe cartas novas toda semana.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map(l => (
            <ListingCard key={l.id} listing={l} onInterest={requestInterest} />
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"
            className="p-2 rounded-xl border disabled:opacity-40 transition-colors" style={{ backgroundColor: L.card, borderColor: L.borda, color: L.texto }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold" style={{ color: L.suave }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Próxima página"
            className="p-2 rounded-xl border disabled:opacity-40 transition-colors" style={{ backgroundColor: L.card, borderColor: L.borda, color: L.texto }}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
      </div>

      {consentListing && (
        <InterestConsentModal
          listing={consentListing}
          onClose={() => setConsentListing(null)}
          onConfirm={async opts => {
            await doToggleInterest(consentListing.id, opts)
            setConsentListing(null)
          }}
        />
      )}
    </div>
  )
}
