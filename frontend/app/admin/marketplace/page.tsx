'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { marketplaceApi, CardListingDto, MarketplaceInterestDto } from '@/lib/api'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Table } from '@/components/ui/Table'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Search, Package, Loader2, Trash2, Eye, ChevronLeft, ChevronRight,
  User as UserIcon, ShoppingBag, CheckCircle, XCircle, Clock,
  Plus, Pencil, X, ImagePlus, Phone, Heart,
} from 'lucide-react'

const STATUS_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'Available', label: 'Disponível' },
  { value: 'Reserved',  label: 'Reservado' },
  { value: 'Sold',      label: 'Vendido' },
]

const CONDITIONS = [
  { value: 'NM',  label: 'Near Mint' },
  { value: 'LP',  label: 'Light Played' },
  { value: 'MP',  label: 'Moderate Played' },
  { value: 'HP',  label: 'Heavy Played' },
  { value: 'DMG', label: 'Damaged' },
]
const GAMES = ['Magic', 'Pokémon', 'Yu-Gi-Oh!', 'One Piece', 'Dragon Ball', 'Digimon', 'Outro']

const statusCls: Record<string, string> = {
  Available: 'bg-green-500/15 text-green-400 border-green-500/30',
  Reserved:  'bg-amber-500/15 text-amber-400 border-amber-400/30',
  Sold:      'bg-red-500/15 text-red-400 border-red-500/30',
}
const statusLabel: Record<string, string> = {
  Available: 'Disponível',
  Reserved:  'Reservado',
  Sold:      'Vendido',
}

function fmtPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Modal criar / editar anúncio ───────────────────────────────────────────────
function ListingModal({ initial, onClose, onSave }: {
  initial?: CardListingDto
  onClose: () => void
  onSave: (l: CardListingDto) => void
}) {
  const [form, setForm] = useState({
    cardName:    initial?.cardName ?? '',
    cardGame:    initial?.cardGame ?? '',
    condition:   initial?.condition ?? 'NM',
    description: initial?.description ?? '',
    status:      initial?.status ?? 'Available',
  })
  const [priceStr,  setPriceStr]  = useState(initial?.priceInCents ? (initial.priceInCents / 100).toFixed(2).replace('.', ',') : '')
  const [imageUrl,  setImageUrl]  = useState<string | null>(initial?.cardImageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof typeof form, v: string | number) => setForm(p => ({ ...p, [k]: v }))
  const priceInCents = Math.round(parseFloat(priceStr.replace(',', '.') || '0') * 100)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await marketplaceApi.uploadImage(file)
      setImageUrl(url)
    } catch { toast.error('Erro ao enviar imagem') }
    finally { setUploading(false) }
  }

  async function submit() {
    if (!form.cardName.trim()) { toast.error('Informe o nome da carta'); return }
    if (priceInCents <= 0) { toast.error('Informe o preço'); return }
    setSaving(true)
    try {
      const req = {
        cardName:     form.cardName.trim(),
        cardGame:     form.cardGame || undefined,
        cardImageUrl: imageUrl || undefined,
        priceInCents,
        condition:    form.condition,
        description:  form.description || undefined,
        status:       form.status,
      }
      const { data } = initial
        ? await marketplaceApi.update(initial.id, req)
        : await marketplaceApi.create(req)
      onSave(data)
      toast.success(initial ? 'Anúncio atualizado!' : 'Carta anunciada na vitrine!')
    } catch (e: any) { toast.error(e?.response?.data?.message ?? 'Erro ao salvar') }
    finally  { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-auto">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-5 p-6 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{initial ? 'Editar anúncio' : 'Novo anúncio'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="label mb-1.5">Foto da carta</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={clsx(
              'w-full rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 overflow-hidden',
              imageUrl ? 'border-brand-500/40 p-1' : 'border-surface-500 hover:border-brand-500/60 p-6 text-gray-400',
            )}
          >
            {uploading ? (
              <div className="py-6 flex flex-col items-center gap-2 text-brand-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Enviando...</span>
              </div>
            ) : imageUrl ? (
              <div className="relative w-full">
                <img src={imageUrl} alt="preview" className="w-full max-h-48 object-contain rounded-lg" />
                <button type="button" onClick={e => { e.stopPropagation(); setImageUrl(null) }}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
                <p className="text-xs text-gray-400 text-center py-1">Clique para trocar</p>
              </div>
            ) : (
              <>
                <ImagePlus className="w-8 h-8" />
                <span className="text-sm font-medium">Clique para enviar foto</span>
                <span className="text-xs">JPG, PNG ou WebP • máx. 5 MB</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="label">Nome da carta *</label>
            <input className="input" value={form.cardName} onChange={e => set('cardName', e.target.value)} placeholder="Ex: Black Lotus" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jogo</label>
              <select className="input" value={form.cardGame} onChange={e => set('cardGame', e.target.value)}>
                <option value="">Selecionar...</option>
                {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Condição</label>
              <select className="input" value={form.condition} onChange={e => set('condition', e.target.value)}>
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Preço (R$) *</label>
            <input
              className="input" type="text" inputMode="decimal" placeholder="0,00"
              value={priceStr}
              onChange={e => {
                const v = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',')
                if (/^\d*(,\d{0,2})?$/.test(v)) setPriceStr(v)
              }}
            />
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <textarea className="input h-20 resize-none" value={form.description}
              onChange={e => set('description', e.target.value)} placeholder="Estado detalhado, idioma, edição, etc." />
          </div>
          {initial && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="Available">Disponível</option>
                <option value="Reserved">Reservado</option>
                <option value="Sold">Vendido</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={submit} disabled={saving || uploading} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Salvar' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de interessados ──────────────────────────────────────────────────────
function InterestsModal({ listing, onClose }: { listing: CardListingDto; onClose: () => void }) {
  const [interests, setInterests] = useState<MarketplaceInterestDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    marketplaceApi.interests(listing.id)
      .then(r => setInterests(r.data))
      .catch(() => toast.error('Erro ao carregar interessados'))
      .finally(() => setLoading(false))
  }, [listing.id])

  function whatsAppLink(phone: string) {
    return `https://wa.me/55${phone.replace(/\D/g, '')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-4 p-6 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white truncate flex items-center gap-2">
            <Heart className="w-4 h-4 text-brand-400" /> {listing.cardName}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg shrink-0 ml-2 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-500">Clique no WhatsApp pra combinar a venda direto.</p>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
        ) : interests.length === 0 ? (
          <p className="text-sm text-center py-6 text-gray-500">Ninguém demonstrou interesse ainda.</p>
        ) : (
          <div className="flex flex-col gap-2 overflow-auto">
            {interests.map(i => (
              <div key={i.userId} className="flex items-start gap-3 p-3 rounded-xl bg-surface-700">
                <Link href={`/perfil/${i.userId}`} className="shrink-0">
                  {i.userProfileImage ? (
                    <img src={i.userProfileImage} alt={i.userName ?? ''} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-surface-600 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/perfil/${i.userId}`} className="text-sm font-semibold text-white hover:text-brand-300 transition-colors">
                    {i.userName ?? 'Usuário'}
                  </Link>
                  {i.message && <p className="text-xs mt-0.5 italic text-gray-400">"{i.message}"</p>}
                  <p className="text-[10px] mt-1 text-gray-500">{new Date(i.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                {i.userWhatsApp ? (
                  <a href={whatsAppLink(i.userWhatsApp)} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
                    <Phone className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                ) : (
                  <span className="shrink-0 text-[10px] italic text-gray-500">sem contato</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminMarketplacePage() {
  const [items,       setItems]       = useState<CardListingDto[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [statusFilter,setStatusFilter]= useState('')
  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [totalCount,  setTotalCount]  = useState(0)
  const [showCreate,  setShowCreate]  = useState(false)
  const [editModal,   setEditModal]   = useState<CardListingDto | null>(null)
  const [interestsOf, setInterestsOf] = useState<CardListingDto | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await marketplaceApi.list({
        page, pageSize: 30,
        search: search || undefined,
        status: statusFilter || undefined,
      })
      setItems(data.items)
      setTotalPages(data.totalPages)
      setTotalCount(data.totalCount)
    } catch { toast.error('Erro ao carregar') }
    finally  { setLoading(false) }
  }, [page, search, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleDelete(l: CardListingDto) {
    if (!confirm(`Remover anúncio "${l.cardName}"?`)) return
    try {
      await marketplaceApi.remove(l.id)
      setItems(prev => prev.filter(i => i.id !== l.id))
      setTotalCount(c => c - 1)
      toast.success('Anúncio removido')
    } catch { toast.error('Erro ao remover') }
  }

  async function handleStatus(l: CardListingDto, status: string) {
    try {
      const { data } = await marketplaceApi.update(l.id, { status })
      setItems(prev => prev.map(i => i.id === l.id ? data : i))
      toast.success('Status atualizado')
    } catch { toast.error('Erro') }
  }

  function handleSaved(saved: CardListingDto) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === saved.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
      return [saved, ...prev]
    })
    setTotalCount(c => editModal ? c : c + 1)
    setShowCreate(false)
    setEditModal(null)
  }

  const counts = {
    available: items.filter(i => i.status === 'Available').length,
    reserved:  items.filter(i => i.status === 'Reserved').length,
    sold:      items.filter(i => i.status === 'Sold').length,
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Marketplace"
        subtitle={`${totalCount} anúncios · vitrine de cartas do Santuário Nerd`}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo anúncio
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-400">Disponíveis</span>
          </div>
          <p className="text-2xl font-black text-green-400">{counts.available}</p>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-400">Reservados</span>
          </div>
          <p className="text-2xl font-black text-amber-400">{counts.reserved}</p>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-gray-400">Vendidos</span>
          </div>
          <p className="text-2xl font-black text-red-400">{counts.sold}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Buscar carta..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex gap-2">
          {STATUS_OPTS.map(s => (
            <button
              key={s.value}
              onClick={() => { setStatusFilter(s.value); setPage(1) }}
              className={clsx(
                'px-3 py-2 rounded-xl text-xs font-semibold transition-colors',
                statusFilter === s.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-700 text-gray-400 hover:bg-surface-500',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="mb-4">Nenhum anúncio ainda</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Plus className="w-4 h-4" /> Anunciar a primeira carta
          </button>
        </div>
      ) : (
        <Table>
          <Table.Head>
                <tr>
                  <th className="text-left p-4 text-gray-400 font-semibold">Carta</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Preço</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Status</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Interesses</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Data</th>
                  <th className="text-right p-4 text-gray-400 font-semibold">Ações</th>
                </tr>
          </Table.Head>
          <Table.Body>
                {items.map(l => (
                  <tr key={l.id} className="hover:bg-surface-500/30 transition-colors">
                    {/* Carta */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {l.cardImageUrl ? (
                          <img src={l.cardImageUrl} alt={l.cardName} className="w-10 h-10 rounded-lg object-contain bg-surface-700" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate max-w-[220px]">{l.cardName}</p>
                          {l.cardGame && <p className="text-xs text-brand-400">{l.cardGame}</p>}
                          <p className="text-xs text-gray-500">{l.condition}</p>
                        </div>
                      </div>
                    </td>

                    {/* Preço */}
                    <td className="p-4 font-bold text-brand-300">{fmtPrice(l.priceInCents)}</td>

                    {/* Status */}
                    <td className="p-4">
                      <select
                        value={l.status}
                        onChange={e => handleStatus(l, e.target.value)}
                        className={clsx(
                          'text-xs font-semibold px-2 py-1 rounded-lg border bg-transparent cursor-pointer focus:outline-none',
                          statusCls[l.status] ?? 'border-surface-500 text-gray-400',
                        )}
                      >
                        <option value="Available">Disponível</option>
                        <option value="Reserved">Reservado</option>
                        <option value="Sold">Vendido</option>
                      </select>
                    </td>

                    {/* Interesses */}
                    <td className="p-4">
                      <button
                        onClick={() => setInterestsOf(l)}
                        disabled={l.interestCount === 0}
                        className={clsx(
                          'flex items-center gap-1.5 text-sm font-bold transition-colors',
                          l.interestCount > 0 ? 'text-brand-300 hover:text-brand-200' : 'text-gray-600 cursor-default',
                        )}>
                        <Heart className="w-3.5 h-3.5" /> {l.interestCount}
                      </button>
                    </td>

                    {/* Data */}
                    <td className="p-4 text-xs text-gray-400">
                      {new Date(l.createdAt).toLocaleDateString('pt-BR')}
                    </td>

                    {/* Ações */}
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditModal(l)}
                          className="p-1.5 rounded-lg bg-surface-700 hover:bg-brand-500/20 text-gray-400 hover:text-brand-400 transition-colors"
                          title="Editar anúncio"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/cliente/mercado`}
                          className="p-1.5 rounded-lg bg-surface-700 hover:bg-brand-500/20 text-gray-400 hover:text-brand-400 transition-colors"
                          title="Ver no mercado"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(l)}
                          className="p-1.5 rounded-lg bg-surface-700 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                          title="Remover anúncio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
          </Table.Body>
        </Table>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl bg-surface-800 disabled:opacity-40 hover:bg-surface-700 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl bg-surface-800 disabled:opacity-40 hover:bg-surface-700 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {showCreate && <ListingModal onClose={() => setShowCreate(false)} onSave={handleSaved} />}
      {editModal && <ListingModal initial={editModal} onClose={() => setEditModal(null)} onSave={handleSaved} />}
      {interestsOf && <InterestsModal listing={interestsOf} onClose={() => setInterestsOf(null)} />}
    </div>
  )
}
