'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { championshipApi, userApi, deckApi, Championship, ChampionshipParticipant, ChampionshipPreInscricao, DeckListDto, uploadApi, PodioItem } from '@/lib/api'
import toast from 'react-hot-toast'
import { Badge, BadgeTone } from '@/components/ui/Badge'
import {
  Trophy, Plus, Users, Swords, X, Check, Loader2,
  ChevronDown, ChevronUp, UserPlus, Trash2, Medal, Search, ImagePlus, Edit2, MessageCircle, Award, Link2, Eye,
} from 'lucide-react'
import clsx from 'clsx'

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  Planejado: '📋 Planejado', Inscricoes: '📝 Inscrições',
  EmAndamento: '⚔️ Em Andamento', Finalizado: '🏆 Finalizado', Cancelado: '❌ Cancelado',
}
const STATUS_TONES: Record<string, BadgeTone> = {
  Planejado:   'info',
  Inscricoes:  'info',
  EmAndamento: 'warning',
  Finalizado:  'success',
  Cancelado:   'danger',
}
const GAMES = ['Pokemon', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'One Piece TCG', 'Dragon Ball Super']
const NEXT_STATUS: Record<string, string[]> = {
  Planejado: ['Inscricoes', 'Cancelado'],
  Inscricoes: ['EmAndamento', 'Cancelado'],
  EmAndamento: ['Finalizado', 'Cancelado'],
  Finalizado: ['Planejado'], Cancelado: ['Planejado'],
}

// ── Modal: Novo Campeonato ────────────────────────────────────────────────────
function NewChampionshipModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (c: Partial<Championship>) => Promise<void>
}) {
  const [form, setForm]       = useState<Partial<Championship>>({ game: 'Pokemon', entryFeeInCents: 0 })
  const [saving, setSaving]   = useState(false)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [uploading, setUploading]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof Championship, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { data } = await uploadApi.image(file)
      set('imageUrl', data.url)
      setImgPreview(data.url)
      toast.success('Imagem carregada!')
    } catch {
      toast.error('Erro ao fazer upload da imagem')
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim())  { toast.error('Preencha o nome do campeonato'); return }
    if (!form.game?.trim())  { toast.error('Preencha o jogo do campeonato'); return }
    if (!form.startDate)     { toast.error('Preencha a data/hora do campeonato'); return }
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg animate-bounce-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent-gold" /> Novo Campeonato
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-300" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">

          {/* Imagem de capa */}
          <div>
            <div className="flex items-baseline gap-2">
              <label className="label">Imagem de capa</label>
              <span className="text-[10px] text-gray-500">800×450px recomendado</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            {imgPreview ? (
              <div className="relative w-full h-36 rounded-xl overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgPreview} alt="Capa" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setImgPreview(null); set('imageUrl', null); if (fileRef.current) fileRef.current.value = '' }}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full h-36 rounded-xl border-2 border-dashed border-surface-500 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-brand-500 hover:text-brand-400 transition-colors"
              >
                {uploading
                  ? <Loader2 className="w-6 h-6 animate-spin" />
                  : <><ImagePlus className="w-6 h-6" /><span className="text-sm">Clique para adicionar imagem</span></>
                }
              </button>
            )}
          </div>

          <div>
            <label className="label">Nome do Campeonato *</label>
            <input className="input" value={form.name ?? ''}
              onChange={e => set('name', e.target.value)}
              placeholder="Ex: Torneio Pokémon — Junho 2025" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jogo *</label>
              <input className="input" list="games-list"
                placeholder="Ex: Pokemon, Magic, Yu-Gi-Oh!..."
                value={form.game ?? ''}
                onChange={e => set('game', e.target.value)} />
              <datalist id="games-list">
                {GAMES.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Taxa de inscrição (R$)</label>
              <input className="input" type="number" min="0" step="0.01"
                value={(form.entryFeeInCents ?? 0) / 100}
                onChange={e => set('entryFeeInCents', Math.round(parseFloat(e.target.value) * 100))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data / Hora *</label>
              <input className="input" type="datetime-local"
                onChange={e => set('startDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
            </div>
            <div>
              <label className="label">Máx. participantes</label>
              <input className="input" type="number" min="2" placeholder="Sem limite"
                onChange={e => set('maxParticipants', e.target.value ? parseInt(e.target.value) : null)} />
            </div>
          </div>
          <div>
            <label className="label">Descrição / Regras</label>
            <textarea className="input resize-none h-20"
              placeholder="Formato, premiação, regras especiais..."
              value={form.description ?? ''} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={saving || uploading} className="btn-primary flex-1 justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Criar Campeonato
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Editar Campeonato ──────────────────────────────────────────────────
function EditChampionshipModal({ championship, onClose, onSave }: {
  championship: Championship
  onClose: () => void
  onSave: (id: string, c: Partial<Championship>) => Promise<void>
}) {
  const [form, setForm]       = useState<Partial<Championship>>({ ...championship })
  const [saving, setSaving]   = useState(false)
  const [imgPreview, setImgPreview] = useState<string | null>(championship.imageUrl ?? null)
  const [uploading, setUploading]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof Championship, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { data } = await uploadApi.image(file)
      set('imageUrl', data.url)
      setImgPreview(data.url)
      toast.success('Imagem atualizada!')
    } catch {
      toast.error('Erro ao fazer upload da imagem')
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try { await onSave(championship.id, form) } finally { setSaving(false) }
  }

  const startLocal = form.startDate
    ? new Date(new Date(form.startDate).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16)
    : ''

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg animate-bounce-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-brand-400" /> Editar Campeonato
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-300" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">

          {/* Imagem de capa */}
          <div>
            <div className="flex items-baseline gap-2">
              <label className="label">Imagem de capa</label>
              <span className="text-[10px] text-gray-500">800×450px recomendado</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            {imgPreview ? (
              <div className="relative w-full h-36 rounded-xl overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgPreview} alt="Capa" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setImgPreview(null); set('imageUrl', null); if (fileRef.current) fileRef.current.value = '' }}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full h-36 rounded-xl border-2 border-dashed border-surface-500 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-brand-500 hover:text-brand-400 transition-colors"
              >
                {uploading
                  ? <Loader2 className="w-6 h-6 animate-spin" />
                  : <><ImagePlus className="w-6 h-6" /><span className="text-sm">Clique para adicionar imagem</span></>
                }
              </button>
            )}
          </div>

          <div>
            <label className="label">Nome do Campeonato *</label>
            <input className="input" required value={form.name ?? ''}
              onChange={e => set('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jogo *</label>
              <input className="input" required list="games-list-edit"
                value={form.game ?? ''}
                onChange={e => set('game', e.target.value)} />
              <datalist id="games-list-edit">
                {['Pokemon', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'One Piece TCG', 'Dragon Ball Super'].map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Taxa de inscrição (R$)</label>
              <input className="input" type="number" min="0" step="0.01"
                value={(form.entryFeeInCents ?? 0) / 100}
                onChange={e => set('entryFeeInCents', Math.round(parseFloat(e.target.value) * 100))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data / Hora *</label>
              <input className="input" type="datetime-local" required
                value={startLocal}
                onChange={e => set('startDate', new Date(e.target.value).toISOString())} />
            </div>
            <div>
              <label className="label">Máx. participantes</label>
              <input className="input" type="number" min="2" placeholder="Sem limite"
                value={form.maxParticipants ?? ''}
                onChange={e => set('maxParticipants', e.target.value ? parseInt(e.target.value) : null)} />
            </div>
          </div>
          <div>
            <label className="label">Descrição / Regras</label>
            <textarea className="input resize-none h-20"
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={saving || uploading} className="btn-primary flex-1 justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Adicionar Participante ─────────────────────────────────────────────
function AddParticipantModal({ championshipId, game, onClose, onAdded, initialName, initialDeckName, onConfirmedPreInscricao }: {
  championshipId: string
  game: string
  onClose: () => void
  onAdded: () => void
  initialName?: string
  initialDeckName?: string | null
  onConfirmedPreInscricao?: () => Promise<void>
}) {
  const [search, setSearch]     = useState(initialName ?? '')
  const [results, setResults]   = useState<{ id: string; name: string; cpf?: string }[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [decks, setDecks]       = useState<DeckListDto[]>([])
  const [loadingDecks, setLoadingDecks] = useState(false)
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [deckName, setDeckName] = useState(initialDeckName ?? '')
  const [saving, setSaving]     = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (initialName && initialName.length >= 2) handleSearch(initialName)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ao selecionar o cliente, busca os decks reais dele (do jogo do campeonato) pra
  // vincular o deck de verdade em vez de só o nome digitado.
  useEffect(() => {
    setSelectedDeckId('')
    if (!selected) { setDecks([]); return }
    setLoadingDecks(true)
    deckApi.getByUser(selected.id)
      .then(({ data }) => setDecks(data.filter(d => d.game.toLowerCase() === game.toLowerCase())))
      .catch(() => setDecks([]))
      .finally(() => setLoadingDecks(false))
  }, [selected, game])

  async function handleSearch(q: string) {
    setSearch(q)
    setSelected(null)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const { data } = await userApi.list()
      const filtered = data
        .filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.cpf?.includes(q))
        .slice(0, 8)
        .map(u => ({ id: u.id, name: u.name, cpf: u.cpf ?? undefined }))
      setResults(filtered)
    } catch {
      toast.error('Erro ao buscar clientes')
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    try {
      await championshipApi.adminRegister(championshipId, selected.id, deckName || undefined, selectedDeckId || undefined)
      if (onConfirmedPreInscricao) await onConfirmedPreInscricao()
      toast.success(`${selected.name} inscrito com sucesso!`)
      onAdded()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao inscrever participante')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md animate-bounce-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" /> Adicionar Participante
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-300" /></button>
        </div>

        <div className="space-y-4">
          {/* Busca de cliente */}
          <div>
            <label className="label">Buscar cliente</label>
            <input
              className="input"
              placeholder="Nome ou CPF..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Resultados */}
          {searching && (
            <div className="flex justify-center py-2">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
            </div>
          )}
          {results.length > 0 && !selected && (
            <div className="border border-surface-500 rounded-xl overflow-hidden divide-y divide-surface-500">
              {results.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u); setSearch(u.name); setResults([]) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-700 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                    <span className="text-brand-400 text-xs font-bold">{u.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{u.name}</p>
                    {u.cpf && <p className="text-gray-500 text-xs">{u.cpf}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Cliente selecionado */}
          {selected && (
            <div className="flex items-center gap-3 bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-brand-500/30 flex items-center justify-center shrink-0">
                <span className="text-brand-300 text-sm font-bold">{selected.name[0]}</span>
              </div>
              <p className="text-white font-medium flex-1">{selected.name}</p>
              <button onClick={() => { setSelected(null); setSearch('') }} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Deck do cliente: escolhe entre os decks salvos dele, ou digita o nome na mão */}
          {selected && (
            <div>
              <label className="label">Deck</label>
              {loadingDecks ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando decks do cliente...
                </div>
              ) : decks.length > 0 ? (
                <select className="input" value={selectedDeckId} onChange={e => setSelectedDeckId(e.target.value)}>
                  <option value="">Digitar nome manualmente</option>
                  {decks.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.cardCount} cartas)</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-500 mb-2">
                  Nenhum deck salvo pra {game}. Pode digitar o nome manualmente ou o cliente cadastra depois em Meus Decks.
                </p>
              )}
              {!selectedDeckId && (
                <input className="input mt-2" placeholder="Ex: Charizard ex, Mewtwo..."
                  value={deckName} onChange={e => setDeckName(e.target.value)} />
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button
              onClick={handleAdd}
              disabled={!selected || saving}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Inscrever
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card do Campeonato ────────────────────────────────────────────────────────
function ChampionshipCard({
  c, onStatusChange, onParticipantChange, onDelete, onEdit,
}: {
  c: Championship
  onStatusChange: (id: string, status: string) => void
  onParticipantChange: () => void
  onDelete?: (id: string) => void
  onEdit?:   (c: Championship) => void
}) {
  const [expanded, setExpanded]           = useState(false)
  const [activeTab, setActiveTab]         = useState<'participantes' | 'preinscricoes' | 'podio'>('participantes')
  const [participants, setParticipants]   = useState<ChampionshipParticipant[]>([])
  const [preInscricoes, setPreInscricoes] = useState<ChampionshipPreInscricao[]>([])
  const [loadingP, setLoadingP]           = useState(false)
  const [showAdd, setShowAdd]             = useState(false)
  const [confirmingPI, setConfirmingPI]   = useState<ChampionshipPreInscricao | null>(null)

  // Pódio
  const parsedPodio = (): [string, string, string] => {
    try {
      const arr: PodioItem[] = c.podioJson ? JSON.parse(c.podioJson) : []
      return [arr[0]?.nome ?? '', arr[1]?.nome ?? '', arr[2]?.nome ?? '']
    } catch { return ['', '', ''] }
  }
  const [podioNames, setPodioNames]   = useState<[string, string, string]>(parsedPodio)
  const [savingPodio, setSavingPodio] = useState(false)

  const loadAll = useCallback(async () => {
    setLoadingP(true)
    try {
      const [pRes, piRes] = await Promise.all([
        championshipApi.participants(c.id),
        championshipApi.getPreInscricoes(c.id),
      ])
      setParticipants(pRes.data)
      setPreInscricoes(piRes.data)
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoadingP(false)
    }
  }, [c.id])

  async function toggleExpand() {
    if (!expanded) await loadAll()
    setExpanded(v => !v)
  }

  async function handleDeletePreInscricao(pi: ChampionshipPreInscricao) {
    try {
      await championshipApi.deletePreInscricao(c.id, pi.id)
      setPreInscricoes(prev => prev.filter(x => x.id !== pi.id))
    } catch {
      toast.error('Erro ao remover pré-inscrição')
    }
  }

  async function handleRemove(p: ChampionshipParticipant) {
    if (!confirm(`Remover ${p.userName} do campeonato?`)) return
    try {
      await championshipApi.removeParticipant(c.id, p.id)
      toast.success(`${p.userName} removido`)
      loadAll()
      onParticipantChange()
    } catch {
      toast.error('Erro ao remover participante')
    }
  }

  async function handleTogglePagamento(p: ChampionshipParticipant, pago: boolean) {
    try {
      await championshipApi.marcarPagamento(p.id, pago)
      setParticipants(prev => prev.map(x => x.id === p.id
        ? { ...x, entryFeePaidAt: pago ? new Date().toISOString() : null, entryFeePaymentMethod: pago ? 'Balcao' : null }
        : x))
      toast.success(pago ? `Inscrição de ${p.userName} marcada como paga (balcão).` : 'Pagamento desmarcado.')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao atualizar pagamento')
    }
  }

  async function handleSavePodio() {
    setSavingPodio(true)
    try {
      const podio: PodioItem[] = podioNames
        .map((nome, i) => ({ lugar: i + 1, nome: nome.trim() }))
        .filter(p => p.nome)
      await championshipApi.setPodio(c.id, JSON.stringify(podio))
      toast.success('Pódio salvo!')
    } catch {
      toast.error('Erro ao salvar pódio')
    } finally {
      setSavingPodio(false)
    }
  }

  const canAddParticipants  = c.status === 'Inscricoes' || c.status === 'EmAndamento'
  const canDelete           = c.status === 'Finalizado' || c.status === 'Cancelado'
  const canPodio            = c.status === 'EmAndamento' || c.status === 'Finalizado'

  const MEDAL_COLORS = ['text-accent-gold', 'text-gray-300', 'text-amber-700']
  const LUGAR_LABELS = ['1º lugar', '2º lugar', '3º lugar']

  return (
    <>
      {showAdd && (
        <AddParticipantModal
          championshipId={c.id}
          game={c.game}
          onClose={() => setShowAdd(false)}
          onAdded={() => { loadAll(); onParticipantChange() }}
        />
      )}
      {confirmingPI && (
        <AddParticipantModal
          championshipId={c.id}
          game={c.game}
          initialName={confirmingPI.nome}
          initialDeckName={confirmingPI.deckName}
          onClose={() => setConfirmingPI(null)}
          onAdded={() => { loadAll(); onParticipantChange() }}
          onConfirmedPreInscricao={() => handleDeletePreInscricao(confirmingPI)}
        />
      )}

      <div className="card space-y-4 overflow-hidden !p-0">
        {/* Banner de imagem */}
        {c.imageUrl && (
          <div className="relative w-full h-32 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-900/80 to-transparent" />
            <Badge tone={STATUS_TONES[c.status] ?? 'neutral'} className="absolute bottom-2 left-3">
              {STATUS_LABELS[c.status]}
            </Badge>
          </div>
        )}

        <div className="px-4 pb-4 pt-2 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {!c.imageUrl && (
              <div className="flex items-center gap-2 mb-2">
                <Badge tone={STATUS_TONES[c.status] ?? 'neutral'}>{STATUS_LABELS[c.status]}</Badge>
              </div>
            )}
            <h3 className="font-bold text-white">{c.name}</h3>
            <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
              <Swords className="w-3.5 h-3.5" />{c.game}
            </p>
          </div>
        </div>

        {/* Infos */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-surface-800 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Data</p>
            <p className="text-white font-medium">
              {new Date(c.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="bg-surface-800 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Inscrição</p>
            <p className={clsx('font-medium', c.entryFeeInCents === 0 ? 'text-accent-green' : 'text-accent-gold')}>
              {c.entryFeeInCents === 0 ? 'Grátis' : `R$ ${(c.entryFeeInCents / 100).toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="flex items-center justify-between pt-1 border-t border-surface-500">
          <button
            onClick={toggleExpand}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <Users className="w-4 h-4" />
            <span className="font-medium">
              {c.participantCount} participante{c.participantCount !== 1 ? 's' : ''}
              {c.maxParticipants ? ` / ${c.maxParticipants}` : ''}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {canAddParticipants && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" /> Adicionar
            </button>
          )}
        </div>

        {/* Painel expandido */}
        {expanded && (
          <div className="space-y-3">
            {/* Abas */}
            <div className="flex gap-1 bg-surface-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('participantes')}
                className={clsx('flex-1 text-xs py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5',
                  activeTab === 'participantes' ? 'bg-surface-600 text-white' : 'text-gray-400 hover:text-gray-200')}
              >
                <Users className="w-3.5 h-3.5" /> Participantes
                {participants.length > 0 && <span className="bg-brand-500/30 text-brand-300 text-[10px] px-1.5 rounded-full">{participants.length}</span>}
              </button>
              <button
                onClick={() => setActiveTab('preinscricoes')}
                className={clsx('flex-1 text-xs py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5',
                  activeTab === 'preinscricoes' ? 'bg-surface-600 text-white' : 'text-gray-400 hover:text-gray-200')}
              >
                <MessageCircle className="w-3.5 h-3.5" /> Pré-inscrições
                {preInscricoes.length > 0 && <span className="bg-amber-500/30 text-amber-300 text-[10px] px-1.5 rounded-full">{preInscricoes.length}</span>}
              </button>
              {canPodio && (
                <button
                  onClick={() => setActiveTab('podio')}
                  className={clsx('flex-1 text-xs py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5',
                    activeTab === 'podio' ? 'bg-surface-600 text-white' : 'text-gray-400 hover:text-gray-200')}
                >
                  <Award className="w-3.5 h-3.5" /> Pódio
                </button>
              )}
            </div>

            {loadingP ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              </div>
            ) : (
              <>
                {/* Aba: Participantes */}
                {activeTab === 'participantes' && (
                  <div className="space-y-1.5">
                    {participants.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-4">Nenhum participante ainda</p>
                    ) : (
                      participants.map(p => (
                        <div key={p.id} className="flex items-center gap-3 bg-surface-800 rounded-lg px-3 py-2">
                          <span className="text-xs font-mono text-gray-500 w-5 text-right shrink-0">#{p.playerNumber}</span>
                          <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                            <span className="text-brand-400 text-xs font-bold">{p.userName?.[0] ?? '?'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{p.userName}</p>
                            {p.deckName && <p className="text-xs text-gray-500 truncate">{p.deckName}</p>}
                          </div>
                          {p.deckId && (
                            <a
                              href={`/cliente/decks/${p.deckId}`}
                              target="_blank" rel="noreferrer"
                              className="text-gray-400 hover:text-brand-400 transition-colors shrink-0"
                              title="Ver deck completo"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {/* Pagamento da inscrição (só quando o campeonato tem taxa) */}
                          {(c.entryFeeInCents ?? 0) > 0 && (
                            p.entryFeePaidAt ? (
                              <button
                                onClick={() => p.entryFeePaymentMethod !== 'Pix' && handleTogglePagamento(p, false)}
                                className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0',
                                  'bg-green-500/15 text-green-400 border-green-500/30',
                                  p.entryFeePaymentMethod !== 'Pix' && 'hover:bg-green-500/25')}
                                title={p.entryFeePaymentMethod === 'Pix'
                                  ? 'Pago via Pix (confirmado pelo banco)'
                                  : 'Pago no balcão — clique para desmarcar'}>
                                ✓ {p.entryFeePaymentMethod === 'Pix' ? 'Pix' : 'Balcão'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleTogglePagamento(p, true)}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0
                                           bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                                title="Inscrição não paga — clique para marcar como paga no balcão">
                                Pendente
                              </button>
                            )
                          )}
                          {p.placement && (
                            <span className="text-xs font-bold text-accent-gold flex items-center gap-1">
                              <Medal className="w-3.5 h-3.5" />{p.placement}º
                            </span>
                          )}
                          {c.status !== 'Finalizado' && c.status !== 'Cancelado' && (
                            <button
                              onClick={() => handleRemove(p)}
                              className="text-gray-400 hover:text-red-400 transition-colors ml-1 shrink-0"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Aba: Pré-inscrições */}
                {activeTab === 'preinscricoes' && (
                  <div className="space-y-1.5">
                    {preInscricoes.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-4">Nenhuma pré-inscrição recebida</p>
                    ) : (
                      preInscricoes.map(pi => (
                        <div key={pi.id} className="flex items-center gap-2 bg-surface-800 rounded-lg px-3 py-2">
                          <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                            <span className="text-amber-400 text-xs font-bold">{pi.nome[0]}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{pi.nome}</p>
                            <p className="text-xs text-gray-500">{pi.whatsApp}</p>
                            {pi.deckName && (
                              <p className="text-xs text-brand-400 truncate" title={`Deck: ${pi.deckName}`}>🃏 {pi.deckName}</p>
                            )}
                          </div>
                          {pi.deckId && (
                            <a
                              href={`/cliente/decks/${pi.deckId}`}
                              target="_blank" rel="noreferrer"
                              className="text-gray-400 hover:text-brand-400 transition-colors shrink-0"
                              title="Ver deck completo"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {pi.isListaEspera && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">Espera</span>
                          )}
                          <a
                            href={`https://wa.me/${pi.whatsApp.replace(/\D/g, '')}`}
                            target="_blank" rel="noreferrer"
                            className="text-accent-green hover:text-green-300 shrink-0"
                            title="Contatar no WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => setConfirmingPI(pi)}
                            className="w-6 h-6 rounded-md bg-emerald-500/20 hover:bg-emerald-500/40 flex items-center justify-center text-emerald-400 transition-colors shrink-0"
                            title="Confirmar inscrição"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePreInscricao(pi)}
                            className="w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 transition-colors shrink-0"
                            title="Recusar / remover"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Aba: Pódio */}
                {activeTab === 'podio' && canPodio && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400">Registre os vencedores do torneio:</p>
                    {LUGAR_LABELS.map((label, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Medal className={clsx('w-4 h-4 shrink-0', MEDAL_COLORS[i])} />
                        <input
                          className="input flex-1 text-sm"
                          placeholder={label}
                          value={podioNames[i]}
                          onChange={e => {
                            const updated: [string, string, string] = [...podioNames] as [string, string, string]
                            updated[i] = e.target.value
                            setPodioNames(updated)
                          }}
                        />
                      </div>
                    ))}
                    {/* Lista rápida de participantes para clicar e preencher */}
                    {participants.length > 0 && (
                      <div className="bg-surface-800 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Participantes — clique para colocar no pódio</p>
                        <div className="flex flex-wrap gap-1.5">
                          {participants.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                const emptyIdx = podioNames.findIndex(n => !n.trim())
                                if (emptyIdx !== -1) {
                                  const updated: [string, string, string] = [...podioNames] as [string, string, string]
                                  updated[emptyIdx] = p.userName
                                  setPodioNames(updated)
                                }
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-surface-600 hover:bg-brand-500/30 text-gray-300 hover:text-white border border-surface-500 hover:border-brand-500/50 transition-colors"
                            >
                              #{p.playerNumber} {p.userName}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleSavePodio}
                      disabled={savingPodio}
                      className="btn-primary w-full justify-center text-sm"
                    >
                      {savingPodio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Salvar Pódio
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Botões de status + delete */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {NEXT_STATUS[c.status]?.map(next => (
            <button
              key={next}
              onClick={() => onStatusChange(c.id, next)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
                next === 'Cancelado'
                  ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20'
                  : 'bg-brand-600/20 text-brand-300 hover:bg-brand-600/30 border border-brand-500/20'
              )}
            >
              → {STATUS_LABELS[next]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                const url = `${window.location.origin}/campeonato/${c.id}`
                navigator.clipboard.writeText(url).then(() => toast.success('Link copiado!'))
              }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 border border-brand-500/25 transition-colors flex items-center gap-1.5"
              title="Copiar link público de inscrição"
            >
              <Link2 className="w-3.5 h-3.5" /> Link
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(c)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 border border-brand-500/25 transition-colors flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {canDelete && onDelete && (
              <button
                onClick={() => onDelete(c.id)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/20 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Apagar
              </button>
            )}
          </div>
        </div>
        </div>{/* fim padding */}
      </div>
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CampeonatosPage() {
  const [championships, setChampionships] = useState<Championship[]>([])
  const [loading, setLoading]             = useState(true)
  const [showModal, setShowModal]         = useState(false)
  const [editTarget, setEditTarget]       = useState<Championship | null>(null)
  const [search, setSearch]               = useState('')

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    try { const { data } = await championshipApi.listAll(q); setChampionships(data) }
    catch { toast.error('Erro ao carregar campeonatos') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Debounce na busca
  useEffect(() => {
    const t = setTimeout(() => load(search || undefined), 350)
    return () => clearTimeout(t)
  }, [search, load])

  async function handleSave(form: Partial<Championship>) {
    try {
      await championshipApi.create(form)
      toast.success('Campeonato criado!')
      setShowModal(false)
      load(search || undefined)
    } catch (err: any) {
      const data = err?.response?.data
      const msg  = data?.message
        ?? (data?.errors ? Object.values(data.errors).flat().join(' ') : null)
      toast.error(msg || 'Erro ao criar campeonato')
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try { await championshipApi.setStatus(id, status); load(search || undefined) }
    catch { toast.error('Erro ao atualizar status') }
  }

  async function handleEdit(id: string, form: Partial<Championship>) {
    try {
      await championshipApi.update(id, form)
      toast.success('Campeonato atualizado!')
      setEditTarget(null)
      load(search || undefined)
    } catch {
      toast.error('Erro ao atualizar campeonato')
    }
  }

  async function handleDelete(id: string) {
    const c = championships.find(x => x.id === id)
    if (!confirm(`Apagar "${c?.name}" permanentemente? Esta ação não pode ser desfeita.`)) return
    try {
      await championshipApi.delete(id)
      toast.success('Campeonato apagado')
      load(search || undefined)
    } catch {
      toast.error('Erro ao apagar campeonato')
    }
  }

  // Agrupa por status
  const ativos     = championships.filter(c => ['Inscricoes', 'EmAndamento'].includes(c.status))
  const planejados = championships.filter(c => c.status === 'Planejado')
  const historico  = championships.filter(c => ['Finalizado', 'Cancelado'].includes(c.status))

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {showModal && <NewChampionshipModal onClose={() => setShowModal(false)} onSave={handleSave} />}
      {editTarget && (
        <EditChampionshipModal
          championship={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Campeonatos</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {championships.length} torneio{championships.length !== 1 ? 's' : ''} encontrado{championships.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Novo Campeonato
        </button>
      </div>

      {/* Barra de busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="input pl-9 w-full max-w-sm"
          placeholder="Buscar por nome ou jogo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : championships.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Trophy className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-gray-400 font-medium">
            {search ? 'Nenhum campeonato encontrado para essa busca' : 'Nenhum campeonato ainda'}
          </p>
          {!search && (
            <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
              <Plus className="w-4 h-4" /> Criar primeiro campeonato
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {ativos.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">⚔️ Ativos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ativos.map(c => (
                  <ChampionshipCard key={c.id} c={c}
                    onStatusChange={handleStatusChange}
                    onParticipantChange={() => load(search || undefined)}
                    onEdit={setEditTarget}
                  />
                ))}
              </div>
            </section>
          )}

          {planejados.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📋 Planejados</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {planejados.map(c => (
                  <ChampionshipCard key={c.id} c={c}
                    onStatusChange={handleStatusChange}
                    onParticipantChange={() => load(search || undefined)}
                    onEdit={setEditTarget}
                  />
                ))}
              </div>
            </section>
          )}

          {historico.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">🏆 Histórico</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {historico.map(c => (
                  <ChampionshipCard key={c.id} c={c}
                    onStatusChange={handleStatusChange}
                    onParticipantChange={() => load(search || undefined)}
                    onEdit={setEditTarget}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
