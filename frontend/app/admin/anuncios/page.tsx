'use client'
import { useEffect, useState } from 'react'
import { announcementApi, AnnouncementDto } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import toast from 'react-hot-toast'
import { Plus, Trash2, Eye, EyeOff, Megaphone, Edit2, Loader2, ImageIcon, Images } from 'lucide-react'
import clsx from 'clsx'
import ImageUpload from '@/components/admin/ImageUpload'

const TYPE_LABELS: Record<string, string> = {
  Aviso:    '📢 Aviso',
  Destaque: '⭐ Destaque',
  Banner:   '🖼️ Banner',
}

const TYPE_COLORS: Record<string, string> = {
  Aviso:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Destaque: 'bg-brand-500/20 text-brand-300 border-brand-500/30',
  Banner:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
}

/* ── Formulário de anúncio (Aviso / Destaque) ────────────────────────────── */
function AnnouncementForm({
  initial, onSave, onCancel,
}: {
  initial?: Partial<AnnouncementDto>
  onSave:   (data: Omit<AnnouncementDto, 'id' | 'createdAt'>) => Promise<void>
  onCancel: () => void
}) {
  const [title,     setTitle]     = useState(initial?.title     ?? '')
  const [body,      setBody]      = useState(initial?.body      ?? '')
  const [imageUrl,  setImageUrl]  = useState(initial?.imageUrl  ?? '')
  const [linkUrl,   setLinkUrl]   = useState(initial?.linkUrl   ?? '')
  const [type,      setType]      = useState(initial?.type && initial.type !== 'Banner' ? initial.type : 'Aviso')
  const [expiresAt, setExpiresAt] = useState(
    initial?.expiresAt ? new Date(initial.expiresAt).toISOString().slice(0, 16) : ''
  )
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Título obrigatório.'); return }
    setSaving(true)
    try {
      await onSave({
        title:    title.trim(),
        body:     body.trim() || null,
        imageUrl: imageUrl.trim() || null,
        linkUrl:  linkUrl.trim() || null,
        type,
        isActive:  true,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      } as Omit<AnnouncementDto, 'id' | 'createdAt'>)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="font-semibold text-white">{initial ? 'Editar anúncio' : 'Novo anúncio'}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="Aviso">📢 Aviso</option>
            <option value="Destaque">⭐ Destaque</option>
          </select>
        </div>
        <div>
          <label className="label">Expira em (opcional)</label>
          <input type="datetime-local" className="input" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Título *</label>
        <input className="input" placeholder="Ex: Torneio Pokémon sábado!" value={title} onChange={e => setTitle(e.target.value)} required />
      </div>

      <div>
        <label className="label">Texto / Descrição</label>
        <textarea className="input min-h-[80px] resize-y" placeholder="Detalhes do anúncio..." value={body} onChange={e => setBody(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <ImageUpload
            label="Imagem do anúncio (opcional)"
            hint="600×300px"
            currentUrl={imageUrl || null}
            onUpload={url => setImageUrl(url)}
          />
        </div>
        <div>
          <label className="label">Link de destino (opcional)</label>
          <input className="input" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

/* ── Página principal ────────────────────────────────────────────────────── */
export default function AnunciosPage() {
  const [items,   setItems]   = useState<AnnouncementDto[]>([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState<'new' | string | null>(null)
  const [addingBanner, setAddingBanner] = useState(false)

  async function load() {
    try {
      const { data } = await announcementApi.all()
      setItems(data)
    } catch {
      toast.error('Erro ao carregar anúncios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const banners       = items.filter(a => a.type === 'Banner')
  const announcements = items.filter(a => a.type !== 'Banner')

  /* ── Banner actions ── */
  async function handleAddBanner(url: string) {
    setAddingBanner(true)
    try {
      await announcementApi.create({
        title: 'Banner', body: null, imageUrl: url, linkUrl: null,
        type: 'Banner', isActive: true, expiresAt: null,
      } as Parameters<typeof announcementApi.create>[0])
      toast.success('Banner adicionado ao carrossel!')
      load()
    } catch {
      toast.error('Erro ao adicionar banner.')
    } finally {
      setAddingBanner(false)
    }
  }

  async function handleBannerDelete(id: string) {
    if (!confirm('Remover este banner do carrossel?')) return
    await announcementApi.delete(id)
    toast.success('Banner removido.')
    setItems(prev => prev.filter(a => a.id !== id))
  }

  async function handleBannerToggle(b: AnnouncementDto) {
    await announcementApi.update(b.id, { isActive: !b.isActive, expiresAt: b.expiresAt })
    toast.success(b.isActive ? 'Banner desativado.' : 'Banner ativado.')
    load()
  }

  /* ── Announcement actions ── */
  async function handleCreate(data: Omit<AnnouncementDto, 'id' | 'createdAt'>) {
    await announcementApi.create(data as Parameters<typeof announcementApi.create>[0])
    toast.success('Anúncio criado!')
    setForm(null)
    load()
  }

  async function handleUpdate(id: string, data: Omit<AnnouncementDto, 'id' | 'createdAt'>) {
    await announcementApi.update(id, data as Parameters<typeof announcementApi.update>[1])
    toast.success('Anúncio atualizado!')
    setForm(null)
    load()
  }

  async function handleToggle(item: AnnouncementDto) {
    await announcementApi.update(item.id, { isActive: !item.isActive, expiresAt: item.expiresAt })
    setItems(prev => prev.map(a => a.id === item.id ? { ...a, isActive: !a.isActive } : a))
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este anúncio permanentemente?')) return
    await announcementApi.delete(id)
    toast.success('Removido.')
    setItems(prev => prev.filter(a => a.id !== id))
  }

  const editing = typeof form === 'string' ? items.find(a => a.id === form) : undefined

  return (
    <div className="p-4 sm:p-6 space-y-6">

      <PageHeader title="Anúncios" subtitle="Carrossel de banners e avisos exibidos na landing page" />

      {/* ── Carrossel de Banners ── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-white flex items-center gap-2">
              <Images className="w-5 h-5 text-blue-400" /> Carrossel de Banners
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Imagens exibidas em rotação logo abaixo do hero. Recomendado: 1920×600px.
            </p>
          </div>
          <div className="shrink-0">
            <ImageUpload
              label={addingBanner ? 'Enviando…' : 'Adicionar banner'}
              hint="1920×600px"
              currentUrl={null}
              onUpload={handleAddBanner}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : banners.length === 0 ? (
          <div className="border-2 border-dashed border-surface-500 rounded-xl p-8 text-center">
            <ImageIcon className="w-10 h-10 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Nenhum banner. O hero exibe o gradiente padrão.</p>
            <p className="text-gray-600 text-xs mt-1">Clique em &quot;Adicionar banner&quot; para enviar a primeira imagem.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {banners.map(b => (
              <div key={b.id} className={clsx('flex items-center gap-3 rounded-xl border p-3', !b.isActive && 'opacity-50', 'border-surface-500 bg-surface-700/30')}>
                {b.imageUrl && (
                  <img src={b.imageUrl} alt="Banner" className="w-32 h-16 object-cover rounded-lg shrink-0 bg-surface-600" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="badge border text-xs bg-blue-500/20 text-blue-300 border-blue-500/30">
                    🖼️ Banner
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {b.isActive ? '✅ Ativo no carrossel' : '❌ Desativado (não aparece)'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleBannerToggle(b)} className="btn-secondary p-2" title={b.isActive ? 'Desativar' : 'Ativar'}>
                    {b.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleBannerDelete(b.id)} className="btn-danger p-2" title="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Avisos e Destaques ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-brand-400" /> Avisos &amp; Destaques
          </h2>
          {!form && (
            <button onClick={() => setForm('new')} className="btn-primary">
              <Plus className="w-4 h-4" /> Novo anúncio
            </button>
          )}
        </div>

        {form === 'new' && (
          <AnnouncementForm onSave={handleCreate} onCancel={() => setForm(null)} />
        )}

        {!loading && announcements.length === 0 && !form && (
          <div className="card text-center py-10">
            <Megaphone className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">Nenhum aviso ou destaque criado ainda.</p>
          </div>
        )}

        <div className="space-y-3">
          {announcements.map(item => (
            form === item.id ? (
              <AnnouncementForm
                key={item.id}
                initial={item}
                onSave={data => handleUpdate(item.id, data)}
                onCancel={() => setForm(null)}
              />
            ) : (
              <div key={item.id} className={clsx('card flex items-start gap-4', !item.isActive && 'opacity-50')}>
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="" className="w-20 h-14 object-cover rounded-lg shrink-0 bg-surface-600" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('badge border text-xs', TYPE_COLORS[item.type] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30')}>
                      {TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    {item.expiresAt && (
                      <span className={clsx('text-xs', new Date(item.expiresAt) < new Date() ? 'text-red-400' : 'text-gray-500')}>
                        {new Date(item.expiresAt) < new Date() ? '⏰ Expirou: ' : 'Expira: '}
                        {new Date(item.expiresAt).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-white truncate">{item.title}</p>
                  {item.body && <p className="text-sm text-gray-400 line-clamp-1 mt-0.5">{item.body}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggle(item)} className="btn-secondary p-2" title={item.isActive ? 'Desativar' : 'Ativar'}>
                    {item.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setForm(item.id)} className="btn-secondary p-2" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="btn-danger p-2" title="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}
