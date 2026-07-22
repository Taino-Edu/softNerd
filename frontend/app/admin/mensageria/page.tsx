'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { mensageriaApi, MensageriaClient, MensageriaSegment } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Send, Users, User, Mail, Bell, BellRing,
  Search, X, CheckCircle, ChevronDown, ChevronUp, ListFilter,
  Image as ImageIcon, Link2, Smartphone, Wallet, Star, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'

type Channel    = 'inapp' | 'email' | 'both'
type TargetMode = 'segment' | 'specific'

const SEGMENT_META: Record<string, { icon: React.ReactNode; desc: string }> = {
  all:         { icon: <Users className="w-4 h-4" />,      desc: 'Todo mundo com cadastro ativo' },
  with_email:  { icon: <Mail className="w-4 h-4" />,        desc: 'Só quem tem e-mail cadastrado' },
  crediario:   { icon: <Wallet className="w-4 h-4" />,      desc: 'Quem está devendo no crediário' },
  waitlist:    { icon: <ListFilter className="w-4 h-4" />,  desc: 'Quem está em alguma lista de espera' },
  top_points:  { icon: <Star className="w-4 h-4" />,        desc: 'Os 20 clientes com mais pontos' },
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-[11px] font-black
                      flex items-center justify-center shrink-0">
      {n}
    </span>
  )
}

export default function MensageriaPage() {
  return (
    <Suspense fallback={null}>
      <MensageriaForm />
    </Suspense>
  )
}

function MensageriaForm() {
  const params = useSearchParams()
  const [title,      setTitle]      = useState('')
  const [body,       setBody]       = useState('')
  const [link,       setLink]       = useState('')
  const [imageUrl,   setImageUrl]   = useState('')
  const [channel,    setChannel]    = useState<Channel>('inapp')
  const [targetMode, setTargetMode] = useState<TargetMode>('segment')
  const [segment,    setSegment]    = useState('all')
  const [segments,   setSegments]   = useState<MensageriaSegment[]>([])
  const [clients,    setClients]    = useState<MensageriaClient[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<{ inApp: number; emails: number; total: number } | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [fromWaitlistProduct, setFromWaitlistProduct] = useState<string | null>(null)

  useEffect(() => {
    mensageriaApi.segments().then(r => setSegments(r.data)).catch(() => {})
    mensageriaApi.clients().then(r => setClients(r.data)).catch(() => {})
  }, [])

  // Chegando do botão "Avisar fila" (Admin > Pré-vendas > Lista de Espera):
  // pré-seleciona os clientes daquela fila e sugere título/imagem/link do produto.
  useEffect(() => {
    const uids        = params.get('uids')
    const productName = params.get('productName')
    const productId    = params.get('productId')
    const imgParam     = params.get('imageUrl')
    if (!uids) return

    setTargetMode('specific')
    setSelected(new Set(uids.split(',').filter(Boolean)))
    setShowPicker(true)
    if (productName) { setTitle(`Chegou: ${productName}`); setFromWaitlistProduct(productName) }
    if (productId)    setLink(`/produtos/${productId}`)
    if (imgParam)      setImageUrl(imgParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.whatsApp?.includes(search)
  )

  function toggleClient(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const isReady = title.trim().length > 0 && body.trim().length > 0 &&
    (targetMode === 'segment' || selected.size > 0)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { toast.error('Preencha título e mensagem.'); return }
    if (targetMode === 'specific' && selected.size === 0) { toast.error('Selecione ao menos um cliente.'); return }
    setLoading(true); setResult(null)
    try {
      const r = await mensageriaApi.send({
        title, body, link: link || undefined, imageUrl: imageUrl || undefined, channel,
        segment: targetMode === 'segment' ? segment : undefined,
        userIds: targetMode === 'specific' ? [...selected] : undefined,
      })
      setResult(r.data)
      setTitle(''); setBody(''); setLink(''); setImageUrl(''); setSelected(new Set())
      toast.success('Mensagem enviada!')
    } catch { toast.error('Erro ao enviar mensagem.') }
    finally  { setLoading(false) }
  }

  const channelOpts: { value: Channel; label: string; hint: string; icon: React.ReactNode }[] = [
    { value: 'inapp', label: 'Só no site',     hint: 'Sino + push',   icon: <Bell     className="w-4 h-4" /> },
    { value: 'email', label: 'Só e-mail',      hint: 'Caixa de entrada', icon: <Mail     className="w-4 h-4" /> },
    { value: 'both',  label: 'Site + e-mail',  hint: 'Alcance máximo', icon: <BellRing className="w-4 h-4" /> },
  ]

  const targetSummary = targetMode === 'segment'
    ? segments.find(s => s.id === segment)?.label ?? '—'
    : `${selected.size} cliente${selected.size !== 1 ? 's' : ''} selecionado${selected.size !== 1 ? 's' : ''}`

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Mensageria" subtitle="Fale com seus clientes por notificação e e-mail." />

      {fromWaitlistProduct && (
        <div className="card flex items-center gap-3 border-brand-500/30 bg-brand-500/10 animate-fade-in">
          <ListFilter className="w-5 h-5 text-brand-400 flex-shrink-0" />
          <p className="text-sm text-gray-300">
            Destinatários pré-selecionados da <strong className="text-brand-300">fila de espera de {fromWaitlistProduct}</strong>.
            Revise a mensagem e envie quando quiser.
          </p>
        </div>
      )}

      {result && (
        <div className="card flex items-center gap-3 border-accent-green/30 bg-accent-green/10 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-accent-green flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-accent-green">Enviado!</p>
            <p className="text-gray-400">
              {result.total} cliente{result.total !== 1 ? 's' : ''}
              {result.inApp  > 0 && ` — ${result.inApp} notificações in-app`}
              {result.emails > 0 && ` — ${result.emails} e-mails`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <form onSubmit={handleSend} className="space-y-4 min-w-0">

          {/* 1. Conteúdo */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
              <StepBadge n={1} /> Mensagem
            </h2>

            <div>
              <label className="label">Título</label>
              <input className="input" placeholder="Ex: Promoção de fim de semana"
                value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required />
            </div>

            <div>
              <label className="label">Texto <span className="text-gray-500 font-normal">({body.length}/500)</span></label>
              <textarea className="input min-h-[80px] resize-y" placeholder="Texto que o cliente vai ler…"
                value={body} onChange={e => setBody(e.target.value)} maxLength={500} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Link (opcional)</label>
                <input className="input" placeholder="/produtos ou https://..."
                  value={link} onChange={e => setLink(e.target.value)} />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Imagem (opcional)</label>
                <input className="input" placeholder="https://... ou /uploads/banner.png"
                  value={imageUrl} onChange={e => setImageUrl(e.target.value)} maxLength={500} />
              </div>
            </div>
          </div>

          {/* 2. Canal */}
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
              <StepBadge n={2} /> Canal de envio
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {channelOpts.map(opt => (
                <button key={opt.value} type="button" onClick={() => setChannel(opt.value)}
                  className={clsx(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all',
                    channel === opt.value
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-surface-500 text-gray-400 hover:border-brand-500/50 hover:text-gray-300'
                  )}>
                  {opt.icon}
                  <span>{opt.label}</span>
                  <span className={clsx('text-[10px]', channel === opt.value ? 'text-brand-400/70' : 'text-gray-600')}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Destinatários */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
              <StepBadge n={3} /> Destinatários
            </h2>

            <div className="flex gap-2">
              {(['segment', 'specific'] as TargetMode[]).map(m => (
                <button key={m} type="button" onClick={() => setTargetMode(m)}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-all',
                    targetMode === m
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-surface-500 text-gray-400 hover:border-brand-500/50'
                  )}>
                  {m === 'segment' ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {m === 'segment' ? 'Por segmento' : 'Selecionar clientes'}
                </button>
              ))}
            </div>

            {targetMode === 'segment' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {segments.map(s => {
                  const meta = SEGMENT_META[s.id]
                  const active = segment === s.id
                  return (
                    <label key={s.id}
                      className={clsx(
                        'flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                        active ? 'border-brand-500 bg-brand-500/10' : 'border-surface-500 hover:border-surface-400'
                      )}>
                      <input type="radio" name="segment" value={s.id} checked={active}
                        onChange={() => setSegment(s.id)} className="accent-brand-500 mt-0.5" />
                      <div className="min-w-0">
                        <span className={clsx('flex items-center gap-1.5 text-sm font-medium',
                          active ? 'text-brand-400' : 'text-gray-300')}>
                          {meta?.icon}{s.label}
                        </span>
                        {meta && <p className="text-[11px] text-gray-500 mt-0.5">{meta.desc}</p>}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {targetMode === 'specific' && (
              <div className="space-y-2">
                <button type="button" onClick={() => setShowPicker(p => !p)}
                  className="flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors">
                  {showPicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {selected.size > 0
                    ? `${selected.size} cliente${selected.size !== 1 ? 's' : ''} selecionado${selected.size !== 1 ? 's' : ''}`
                    : 'Selecionar clientes'}
                </button>

                {showPicker && (
                  <div className="border border-surface-500 rounded-xl overflow-hidden">
                    <div className="p-2 border-b border-surface-500 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input className="input pl-8 py-1.5 text-sm"
                        placeholder="Buscar por nome, e-mail ou WhatsApp…"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-surface-500">
                      {filtered.length === 0
                        ? <p className="text-center text-sm text-gray-500 py-6">Nenhum cliente encontrado.</p>
                        : filtered.map(c => (
                            <label key={c.id}
                              className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-700 transition-colors">
                              <input type="checkbox" checked={selected.has(c.id)}
                                onChange={() => toggleClient(c.id)} className="accent-brand-500" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{c.name}</p>
                                <p className="text-xs text-gray-500 truncate">{c.email ?? c.whatsApp ?? '—'}</p>
                              </div>
                              <span className="text-xs text-brand-400 flex-shrink-0">{c.pointsBalance} pts</span>
                            </label>
                          ))
                      }
                    </div>
                    {selected.size > 0 && (
                      <div className="p-2 border-t border-surface-500 flex items-center justify-between">
                        <span className="text-xs text-gray-500">{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</span>
                        <button type="button" onClick={() => setSelected(new Set())}
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                          <X className="w-3 h-3" /> Limpar seleção
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando…</>
              : <><Send className="w-4 h-4" /> Enviar mensagem</>
            }
          </button>
        </form>

        {/* ── Preview ao vivo ─────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" /> Como o cliente vai ver
            </p>
            <div className="rounded-2xl bg-surface-900 border border-surface-500 p-4">
              <div className="rounded-xl bg-surface-800 border border-surface-500 overflow-hidden shadow-lg">
                {imageUrl.trim() && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="w-full h-32 object-cover"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                    onLoad={e => { e.currentTarget.style.display = '' }} />
                )}
                <div className="p-3 flex gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-gray-300">Santuário Nerd</span>
                      <span className="text-[10px] text-gray-600">agora</span>
                    </div>
                    <p className="text-sm font-bold text-white mt-0.5 truncate">
                      {title.trim() || 'Título da mensagem'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-3">
                      {body.trim() || 'O texto que o cliente vai ler aparece aqui conforme você digita…'}
                    </p>
                    {link.trim() && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-400 mt-1.5">
                        Ver <ChevronDown className="w-3 h-3 -rotate-90" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumo do envio</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-1.5">
                {channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : channel === 'both' ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                Canal
              </span>
              <span className="text-white font-medium">{channelOpts.find(o => o.value === channel)?.label}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-1.5">
                {targetMode === 'segment' ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                Destinatários
              </span>
              <span className="text-white font-medium truncate max-w-[180px]">{targetSummary}</span>
            </div>
            <div className={clsx('flex items-center gap-2 text-xs font-semibold pt-2 mt-1 border-t border-surface-500',
              isReady ? 'text-accent-green' : 'text-amber-400')}>
              {isReady ? <CheckCircle className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              {isReady ? 'Pronto para enviar' : 'Preencha título, texto e destinatário'}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
