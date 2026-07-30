'use client'
import { useEffect, useState, useCallback } from 'react'
import { userApi, crediarioApi, analyticsApi, perfisApi, CrediariosDto, UserSummary, PerfilDto, ClienteInsightDto, ClienteHistoricoDto, PAYMENT_METHODS } from '@/lib/api'
import toast from 'react-hot-toast'
import { Users, Search, Star, Plus, CreditCard, Clock, AlertCircle, Loader2, Wallet, Minus, UserPlus, KeyRound, X, UserX, History, ShoppingBag, ShoppingCart, Trophy, ChevronDown, ChevronUp, ChevronLeft, TrendingUp, UserCog, Shield, Pencil, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { Badge, BadgeTone } from '@/components/ui/Badge'

// ── Modal: Novo Cliente ───────────────────────────────────────────────────────
function NovoClienteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (u: UserSummary) => void }) {
  const [nome, setNome]       = useState('')
  const [cpf, setCpf]         = useState('')
  const [whats, setWhats]     = useState('')
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return }
    setLoading(true)
    try {
      const { data } = await userApi.adminCreate({
        name: nome.trim(),
        cpf: cpf.trim() || undefined,
        whatsApp: whats.trim() || undefined,
        email: email.trim() || undefined,
        password: senha || undefined,
      })
      toast.success(`Cliente ${data.name} criado com sucesso!`)
      onSuccess(data)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao criar cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" /> Novo Cliente
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="label">Nome completo *</label>
            <input className="input" placeholder="João da Silva" value={nome} onChange={e => setNome(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">CPF</label>
              <input className="input" placeholder="12345678901" value={cpf} onChange={e => setCpf(e.target.value)} maxLength={11} />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" placeholder="5517999999999" value={whats} onChange={e => setWhats(e.target.value)} maxLength={20} />
            </div>
          </div>
          <div>
            <label className="label">E-mail</label>
            <input type="email" className="input" placeholder="joao@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Senha inicial (opcional)</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres" value={senha} onChange={e => setSenha(e.target.value)} minLength={8} />
            <p className="text-xs text-gray-400 mt-1">Se não informada, o cliente precisará redefinir via e-mail.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : <><UserPlus className="w-4 h-4" /> Criar Cliente</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Novo Operador ──────────────────────────────────────────────────────
function NovoOperadorModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [nome, setNome]       = useState('')
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [perfilId, setPerfilId] = useState('')
  const [perfis, setPerfis]   = useState<PerfilDto[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    perfisApi.list().then(r => setPerfis(r.data)).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!email.trim()) { toast.error('E-mail é obrigatório para operadores'); return }
    if (senha.length < 8) { toast.error('Senha deve ter no mínimo 8 caracteres'); return }
    setLoading(true)
    try {
      await userApi.adminCreate({
        name: nome.trim(), email: email.trim(),
        password: senha, role: 'Operator',
        perfilId: perfilId || undefined,
      })
      toast.success(`Operador ${nome} criado!`)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao criar operador')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <UserCog className="w-5 h-5 text-brand-400" /> Novo Operador
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="label">Nome completo *</label>
            <input className="input" placeholder="Maria da Silva" value={nome} onChange={e => setNome(e.target.value)} required />
          </div>
          <div>
            <label className="label">E-mail *</label>
            <input type="email" className="input" placeholder="maria@loja.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha *</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres" value={senha} onChange={e => setSenha(e.target.value)} minLength={8} required />
          </div>
          <div>
            <label className="label">Perfil de acesso</label>
            <select className="input" value={perfilId} onChange={e => setPerfilId(e.target.value)}>
              <option value="">Sem perfil (sem acesso)</option>
              {perfis.map(p => (
                <option key={p.id} value={p.id}>{p.nome} ({p.permissoes.length} permissões)</option>
              ))}
            </select>
            {perfis.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">⚠ Nenhum perfil criado ainda. Crie perfis em <strong>Perfis de Acesso</strong> primeiro.</p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : <><UserCog className="w-4 h-4" /> Criar Operador</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Editar Operador (perfil + excluir) ─────────────────────────────────
function EditarOperadorModal({
  op,
  onClose,
  onSaved,
  onDeleted,
}: {
  op: UserSummary
  onClose: () => void
  onSaved: (updated: UserSummary) => void
  onDeleted: () => void
}) {
  const [perfis,      setPerfis]      = useState<PerfilDto[]>([])
  const [perfilId,    setPerfilId]    = useState<string>(op.perfilId ?? '')
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    perfisApi.list().then(r => setPerfis(r.data)).catch(() => {})
  }, [])

  async function handleSavePerfil() {
    setSaving(true)
    setError(null)
    try {
      const { data } = await userApi.adminUpdatePerfil(op.id, perfilId || null)
      toast.success('Perfil atualizado!')
      onSaved(data)
      onClose()
    } catch {
      setError('Erro ao atualizar perfil. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await userApi.adminDelete(op.id)
      toast.success(`Operador ${op.name} excluído.`)
      onDeleted()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao excluir operador.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <UserCog className="w-5 h-5 text-brand-400" /> Editar Operador
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-white font-semibold">{op.name}</p>
            <p className="text-xs text-gray-400">{op.email}</p>
          </div>

          {/* Perfil */}
          <div>
            <label className="label">Perfil de acesso</label>
            <select
              className="input"
              value={perfilId}
              onChange={e => setPerfilId(e.target.value)}
            >
              <option value="">Sem perfil (sem acesso)</option>
              {perfis.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.permissoes.length} permissões)
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button
              onClick={handleSavePerfil}
              disabled={saving}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar perfil'}
            </button>
          </div>

          {/* Zona de exclusão */}
          <div className="border-t border-surface-500 pt-4">
            {!confirmDel ? (
              <button
                onClick={() => setConfirmDel(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                <UserX className="w-4 h-4" /> Excluir operador
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-red-400 text-center">
                  Confirmar exclusão de <strong>{op.name}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDel(false)}
                    className="btn-secondary flex-1 justify-center text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                    {deleting ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Redefinir Senha ────────────────────────────────────────────────────
function RedefinirSenhaModal({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const [senha, setSenha]     = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 8) { toast.error('Mínimo 8 caracteres'); return }
    if (senha !== confirma) { toast.error('As senhas não coincidem'); return }
    setLoading(true)
    try {
      await userApi.adminResetPassword(user.id, senha)
      toast.success(`Senha de ${user.name} redefinida!`)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao redefinir senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-brand-400" /> Redefinir Senha
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-400">Definindo nova senha para <strong className="text-white">{user.name}</strong>.</p>
          <div>
            <label className="label">Nova senha</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres" value={senha} onChange={e => setSenha(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirmar senha</label>
            <input type="password" className="input" placeholder="Repita a senha" value={confirma} onChange={e => setConfirma(e.target.value)} required minLength={8} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><KeyRound className="w-4 h-4" /> Redefinir</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Editar Dados do Cliente ────────────────────────────────────────────
function EditarClienteModal({ user, onClose, onSaved }: {
  user: UserSummary
  onClose: () => void
  onSaved: (updated: UserSummary) => void
}) {
  const [nome, setNome]       = useState(user.name)
  const [email, setEmail]     = useState(user.email ?? '')
  const [cpf, setCpf]         = useState(user.cpf ?? '')
  const [whats, setWhats]     = useState(user.whatsApp ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return }
    setLoading(true)
    try {
      const { data } = await userApi.adminUpdate(user.id, {
        name: nome.trim(),
        email: email.trim(),
        cpf: cpf.trim(),
        whatsApp: whats.trim(),
      })
      toast.success(`Dados de ${data.name} atualizados!`)
      onSaved(data)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao salvar dados')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <UserCog className="w-5 h-5 text-brand-400" /> Editar Dados do Cliente
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="label">Nome completo *</label>
            <input className="input" value={nome} onChange={e => setNome(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">CPF</label>
              <input className="input" placeholder="12345678901" value={cpf} onChange={e => setCpf(e.target.value)} maxLength={11} />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" placeholder="5517999999999" value={whats} onChange={e => setWhats(e.target.value)} maxLength={20} />
            </div>
          </div>
          <div>
            <label className="label">E-mail</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Helper: label de forma de pagamento ───────────────────────────────────────
const pmLabel = (v: string | null) =>
  PAYMENT_METHODS.find(p => p.value === v)?.label ?? v ?? '—'

// ── Drawer: Histórico do cliente ───────────────────────────────────────────────
function HistoricoDrawer({ user, onClose, onAnonimized }: { user: UserSummary; onClose: () => void; onAnonimized: () => void }) {
  const [data, setData]         = useState<ClienteHistoricoDto | null>(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'comandas' | 'pdv' | 'crediarios' | 'campeonatos'>('comandas')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmAnon, setConfirmAnon] = useState(false)
  const [anonimizing, setAnonimizing] = useState(false)

  useEffect(() => {
    setLoading(true)
    userApi.historico(user.id)
      .then(r => setData(r.data))
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setLoading(false))
  }, [user.id])

  function toggle(id: string) {
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  async function handleAnonimize() {
    setAnonimizing(true)
    try {
      await userApi.adminDelete(user.id)
      toast.success('Dados do cliente anonimizados (LGPD)')
      onAnonimized()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao anonimizar')
      setConfirmAnon(false)
    } finally {
      setAnonimizing(false)
    }
  }

  const fmt  = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')
  const fmtDateTime = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  const statusTone: Record<string, BadgeTone> = {
    Aberta: 'warning', EmAndamento: 'info',
    Fechada: 'success', Cancelada: 'neutral',
    Aberto: 'warning', Pago: 'success',
    Planejado: 'neutral', Inscricoes: 'info',
    Finalizado: 'success', Cancelado: 'neutral',
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* overlay */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* drawer */}
      <div className="w-full max-w-2xl bg-surface-900 border-l border-surface-500 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-500 shrink-0">
          {user.profileImageUrl ? (
            <img src={user.profileImageUrl} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-surface-500 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand-600/25 flex items-center justify-center shrink-0 ring-2 ring-surface-500">
              <span className="text-sm font-black text-brand-300">{user.name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-base leading-tight truncate">{user.name}</p>
            <p className="text-xs text-gray-400">Histórico completo</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {confirmAnon ? (
              <>
                <span className="text-xs text-red-400 font-medium">Confirmar anonimização?</span>
                <button
                  onClick={handleAnonimize}
                  disabled={anonimizing}
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors disabled:opacity-60"
                >
                  {anonimizing ? 'Aguarde...' : 'Sim, apagar'}
                </button>
                <button
                  onClick={() => setConfirmAnon(false)}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmAnon(true)}
                title="Anonimizar dados (LGPD)"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 transition-colors"
              >
                <UserX className="w-3.5 h-3.5" /> LGPD
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p className="text-sm">Erro ao carregar histórico</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-surface-500 shrink-0">
              <div className="text-center">
                <p className="text-2xl font-black text-brand-400">{data.totalVisitas}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Visitas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-accent-gold">{fmt(data.totalGasto)}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Gasto</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">{data.primeiraVisita ? fmtDate(data.primeiraVisita) : '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">1ª Visita</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">{data.ultimaVisita ? fmtDate(data.ultimaVisita) : '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Última Visita</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 py-3 border-b border-surface-500 shrink-0 overflow-x-auto">
              {([
                { key: 'comandas',    label: 'Comandas',   icon: <ShoppingBag className="w-3.5 h-3.5" />, count: data.comandas.length },
                { key: 'pdv',         label: 'Caixa (PDV)', icon: <ShoppingCart className="w-3.5 h-3.5" />, count: data.vendasAvulsas.length },
                { key: 'crediarios',  label: 'Crediário',  icon: <CreditCard className="w-3.5 h-3.5" />, count: data.crediarios.length },
                { key: 'campeonatos', label: 'Campeonatos', icon: <Trophy className="w-3.5 h-3.5" />, count: data.campeonatos.length },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                    tab === t.key ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-700'
                  }`}
                >
                  {t.icon} {t.label}
                  {t.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === t.key ? 'bg-white/20' : 'bg-surface-600 text-gray-300'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

              {/* Comandas */}
              {tab === 'comandas' && (
                data.comandas.length === 0
                  ? <Empty text="Nenhuma comanda encontrada" />
                  : data.comandas.map(c => (
                    <div key={c.id} className="card text-sm">
                      <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => toggle(c.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone={statusTone[c.status] ?? 'neutral'}>{c.status}</Badge>
                            {c.tableIdentifier && <span className="text-xs text-gray-500">· {c.tableIdentifier}</span>}
                            {c.paymentMethod && <span className="text-xs text-gray-400">· {pmLabel(c.paymentMethod)}</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{fmtDateTime(c.openedAt)}{c.closedAt && ` → ${fmtDateTime(c.closedAt)}`}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-accent-gold">{fmt(c.totalInReais)}</span>
                          {expanded.has(c.id) ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </div>
                      </div>
                      {expanded.has(c.id) && c.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-surface-500 space-y-1.5">
                          {c.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-400">
                              <span>{item.quantity}× {item.itemName}</span>
                              <span className="text-gray-300">{fmt(item.subtotalInReais)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
              )}

              {/* PDV */}
              {tab === 'pdv' && (
                data.vendasAvulsas.length === 0
                  ? <Empty text="Nenhuma venda no caixa encontrada" sub="Vendas são rastreadas a partir da atualização v1.6" />
                  : data.vendasAvulsas.map(v => (
                    <div key={v.id} className="card text-sm">
                      <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => toggle(v.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{pmLabel(v.paymentMethod)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{fmtDateTime(v.soldAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-accent-gold">{fmt(v.totalInReais)}</span>
                          {expanded.has(v.id) ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </div>
                      </div>
                      {expanded.has(v.id) && v.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-surface-500 space-y-1.5">
                          {v.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-400">
                              <span>{item.quantity}× {item.productName}</span>
                              <span className="text-gray-300">{fmt(item.subtotalInReais)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
              )}

              {/* Crediários */}
              {tab === 'crediarios' && (
                data.crediarios.length === 0
                  ? <Empty text="Nenhum crediário encontrado" />
                  : data.crediarios.map(c => (
                    <div key={c.id} className={`card text-sm ${c.vencido ? 'border-red-500/20' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone={c.vencido ? 'danger' : statusTone[c.status] ?? 'neutral'}>
                              {c.vencido ? 'Vencido' : c.status}
                            </Badge>
                            <span className="text-xs text-gray-500">Abertura: {fmtDate(c.dataAbertura)}</span>
                          </div>
                          {c.observacao && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.observacao}</p>}
                          {c.dataPagamento && <p className="text-xs text-green-400 mt-0.5">Pago em {fmtDate(c.dataPagamento)}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-accent-gold">{fmt(c.valorEmReais)}</p>
                          {c.status === 'Aberto' && c.saldoRestante !== c.valorEmReais && (
                            <p className="text-xs text-orange-400">Restante: {fmt(c.saldoRestante)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}

              {/* Campeonatos */}
              {tab === 'campeonatos' && (
                data.campeonatos.length === 0
                  ? <Empty text="Não participou de campeonatos" />
                  : data.campeonatos.map(c => (
                    <div key={c.championshipId} className="card text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{c.championshipName}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-xs text-gray-500">{c.game}</span>
                            <span className="text-xs text-gray-500">· {fmtDate(c.startDate)}</span>
                            <Badge tone={statusTone[c.status] ?? 'neutral'} className="text-[10px]">{c.status}</Badge>
                          </div>
                          {c.deckName && <p className="text-xs text-gray-400 mt-0.5">Deck: {c.deckName}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Nº {c.playerNumber}</p>
                          {c.placement && (
                            <p className={`text-sm font-bold ${c.placement === 1 ? 'text-yellow-400' : c.placement === 2 ? 'text-gray-300' : c.placement === 3 ? 'text-orange-400' : 'text-gray-400'}`}>
                              {c.placement === 1 ? '🥇' : c.placement === 2 ? '🥈' : c.placement === 3 ? '🥉' : `${c.placement}º`}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}

            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-gray-500 gap-2">
      <p className="text-sm">{text}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  )
}

export default function UsuariosPage() {
  const [users, setUsers]           = useState<UserSummary[]>([])
  const [crediarios, setCrediarios] = useState<Record<string, CrediariosDto>>({})
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<UserSummary | null>(null)
  const [points, setPoints]         = useState('')
  const [reason, setReason]         = useState('')
  const [adding, setAdding]         = useState(false)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceReason, setBalanceReason] = useState('')
  const [adjustingBalance, setAdjustingBalance] = useState(false)
  const [showNovoCliente, setShowNovoCliente]   = useState(false)
  const [showNovoOperador, setShowNovoOperador] = useState(false)
  const [showRedefinirSenha, setShowRedefinirSenha] = useState(false)
  const [showEditarCliente, setShowEditarCliente] = useState(false)
  const [showHistorico, setShowHistorico]     = useState(false)
  const [editandoOperador, setEditandoOperador] = useState<UserSummary | null>(null)
  const [tabSection, setTabSection]           = useState<'clientes' | 'operadores'>('clientes')
  const [tabUsuarios, setTabUsuarios]         = useState<'todos' | 'inativos'>('todos')
  const [insights, setInsights]               = useState<ClienteInsightDto[]>([])
  const [operators, setOperators]             = useState<UserSummary[]>([])
  const [showMobileDetail, setShowMobileDetail] = useState(false)

  const fetchUsers = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const [usersRes, credRes] = await Promise.all([
        userApi.list(q),
        crediarioApi.list('Aberto'),
      ])
      setUsers(usersRes.data)
      // Mapeia userId → crediário aberto
      const map: Record<string, CrediariosDto> = {}
      for (const c of credRes.data) map[c.userId] = c
      setCrediarios(map)
    } catch {
      toast.error('Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOperators = useCallback(async () => {
    try {
      const res = await userApi.list(undefined, 'Operator')
      setOperators(res.data)
    } catch {}
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchOperators()
    analyticsApi.clientes().then(r => setInsights(r.data)).catch(() => {})
  }, [fetchUsers, fetchOperators])

  // Busca ao digitar (debounce simples)
  useEffect(() => {
    const t = setTimeout(() => fetchUsers(search || undefined), 400)
    return () => clearTimeout(t)
  }, [search, fetchUsers])

  async function handleAddPoints() {
    if (!selected || !points || Number(points) <= 0) return
    setAdding(true)
    try {
      const { data } = await userApi.addPoints(selected.id, Number(points), reason || undefined)
      toast.success(`${points} pontos Maikon adicionados para ${selected.name}!`)
      setUsers(prev => prev.map(u => u.id === data.id ? data : u))
      setSelected(data)
      setPoints('')
      setReason('')
    } catch {
      toast.error('Erro ao adicionar pontos')
    } finally {
      setAdding(false)
    }
  }

  async function handleAdjustBalance(isCredit: boolean) {
    if (!selected || !balanceAmount || Number(balanceAmount) <= 0) return
    setAdjustingBalance(true)
    try {
      const cents = Math.round(Number(balanceAmount) * 100) * (isCredit ? 1 : -1)
      const { data } = await userApi.adjustBalance(selected.id, cents, balanceReason || undefined)
      toast.success(isCredit
        ? `R$ ${Number(balanceAmount).toFixed(2)} creditado para ${selected.name}!`
        : `R$ ${Number(balanceAmount).toFixed(2)} debitado de ${selected.name}!`)
      setUsers(prev => prev.map(u => u.id === data.id ? data : u))
      setSelected(data)
      setBalanceAmount('')
      setBalanceReason('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao ajustar saldo')
    } finally {
      setAdjustingBalance(false)
    }
  }

  // ── Derivados para aba inativos ───────────────────────────────────────────────
  const inativoIds = new Set(insights.filter(i => i.inativo30).map(i => i.userId))
  const insightMap = new Map(insights.map(i => [i.userId, i]))
  const listaFiltrada = tabUsuarios === 'inativos'
    ? users.filter(u => inativoIds.has(u.id))
    : users

  return (
    <div className="p-4 sm:p-6 h-full">
      {/* Modals */}
      {showNovoCliente && (
        <NovoClienteModal
          onClose={() => setShowNovoCliente(false)}
          onSuccess={u => setUsers(prev => [u, ...prev])}
        />
      )}
      {showNovoOperador && (
        <NovoOperadorModal
          onClose={() => setShowNovoOperador(false)}
          onSuccess={fetchOperators}
        />
      )}
      {showRedefinirSenha && selected && (
        <RedefinirSenhaModal
          user={selected}
          onClose={() => setShowRedefinirSenha(false)}
        />
      )}
      {showEditarCliente && selected && (
        <EditarClienteModal
          user={selected}
          onClose={() => setShowEditarCliente(false)}
          onSaved={updated => {
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
            setSelected(updated)
          }}
        />
      )}
      {showHistorico && selected && (
        <HistoricoDrawer
          user={selected}
          onClose={() => setShowHistorico(false)}
          onAnonimized={() => { fetchUsers(); setSelected(null) }}
        />
      )}
      {editandoOperador && (
        <EditarOperadorModal
          op={editandoOperador}
          onClose={() => setEditandoOperador(null)}
          onSaved={updated => setOperators(prev => prev.map(o => o.id === updated.id ? updated : o))}
          onDeleted={() => setOperators(prev => prev.filter(o => o.id !== editandoOperador.id))}
        />
      )}

      {/* Header */}
      <div className="mb-4 sm:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-400" /> Clientes & Equipe
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">Gerencie clientes, pontos Maikon, cashback e operadores</p>
        </div>
        <div className="flex gap-2">
          {tabSection === 'clientes' && (
            <>
              <Link href="/admin/clientes/analises" className="btn-secondary whitespace-nowrap">
                <BarChart2 className="w-4 h-4" /> Análises
              </Link>
              <button onClick={() => setShowNovoCliente(true)} className="btn-primary whitespace-nowrap">
                <UserPlus className="w-4 h-4" /> Novo Cliente
              </button>
            </>
          )}
          {tabSection === 'operadores' && (
            <button onClick={() => setShowNovoOperador(true)} className="btn-primary whitespace-nowrap">
              <UserCog className="w-4 h-4" /> Novo Operador
            </button>
          )}
        </div>
      </div>

      {/* Tab principal: Clientes / Operadores */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl mb-4 w-fit">
        <button
          onClick={() => setTabSection('clientes')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tabSection === 'clientes' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          <Users className="w-4 h-4" /> Clientes
        </button>
        <button
          onClick={() => setTabSection('operadores')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tabSection === 'operadores' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          <UserCog className="w-4 h-4" /> Operadores
          {operators.length > 0 && <span className="text-xs bg-surface-600 text-gray-300 px-1.5 py-0.5 rounded-full">{operators.length}</span>}
        </button>
      </div>

      {/* ── Lista de Operadores ──────────────────────────────────────────────────── */}
      {tabSection === 'operadores' && (
        <div className="space-y-3">
          {operators.length === 0 ? (
            <div className="card py-16 flex flex-col items-center gap-3 text-gray-500">
              <UserCog className="w-10 h-10 opacity-30" />
              <p className="text-sm">Nenhum operador cadastrado.</p>
              <p className="text-xs text-gray-600">Crie operadores para dar acesso ao painel com permissões limitadas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {operators.map(op => (
                <div key={op.id} className="card p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-500/15 border border-brand-500/20 flex items-center justify-center shrink-0">
                      <UserCog className="w-5 h-5 text-brand-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{op.name}</p>
                      <p className="text-xs text-gray-500 truncate">{op.email}</p>
                    </div>
                  </div>
                  {op.perfilNome ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                      <Shield className="w-3 h-3" /> {op.perfilNome}
                    </span>
                  ) : (
                    <span className="text-xs text-red-400">⚠ Sem perfil atribuído</span>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditandoOperador(op)}
                      className="btn-secondary text-xs py-1 justify-center"
                    >
                      <UserCog className="w-3 h-3" /> Editar
                    </button>
                    <button
                      onClick={() => { setSelected(op); setShowRedefinirSenha(true) }}
                      className="btn-secondary text-xs py-1 justify-center"
                    >
                      <KeyRound className="w-3 h-3" /> Senha
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tabSection === 'clientes' && <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:h-[calc(100vh-280px)]">

        {/* ── Lista de clientes ──────────────────────────────────────────────── */}
        {/* No mobile a lista some pra dar lugar ao detalhe — mas só quando existe
            detalhe pra mostrar. Ancorar em `selected` (e não só em showMobileDetail)
            evita a tela branca quando a seleção é limpa de fora, ex.: anonimização LGPD. */}
        <div className={`flex-1 flex flex-col min-w-0 ${showMobileDetail && selected ? 'hidden md:flex' : ''}`}>

          {/* Tabs + Busca */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-1 bg-surface-800 p-1 rounded-lg shrink-0">
              <button
                onClick={() => setTabUsuarios('todos')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tabUsuarios === 'todos' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <Users className="w-3.5 h-3.5 inline mr-1" />Todos
              </button>
              <button
                onClick={() => setTabUsuarios('inativos')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${tabUsuarios === 'inativos' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <UserX className="w-3.5 h-3.5" />
                Inativos
                {insights.filter(i => i.inativo30).length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tabUsuarios === 'inativos' ? 'bg-white/20' : 'bg-amber-500/20 text-amber-400'}`}>
                    {insights.filter(i => i.inativo30).length}
                  </span>
                )}
              </button>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                className="input pl-9 w-full"
                placeholder="Buscar por nome, CPF ou WhatsApp..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
              {tabUsuarios === 'inativos'
                ? <><UserX className="w-10 h-10 text-amber-600/40" /><p className="text-sm">Nenhum cliente inativo 🎉</p></>
                : <><Users className="w-10 h-10 text-gray-400" /><p className="text-sm">Nenhum cliente encontrado</p></>
              }
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {listaFiltrada.map(u => {
                const insight = insightMap.get(u.id)
                return (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u); setShowMobileDetail(true) }}
                  className={`w-full card text-left hover:border-brand-500/40 transition-all duration-150 ${
                    selected?.id === u.id ? 'border-brand-500/60 bg-brand-600/5' : ''
                  } ${insight?.inativo30 ? 'border-amber-500/20' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {u.profileImageUrl ? (
                        <img src={u.profileImageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-surface-500" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-600/25 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-surface-500">
                          <span className="text-xs font-bold text-brand-300 leading-none">{u.name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white text-sm">{u.name}</p>
                        {insight?.inativo30 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">
                            inativo
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {u.cpf && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <CreditCard className="w-3 h-3" /> {u.cpf}
                          </span>
                        )}
                        {u.whatsApp && (
                          <a
                            href={`https://wa.me/${u.whatsApp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            {u.whatsApp}
                          </a>
                        )}
                        {insight && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {insight.numVisitas} visita{insight.numVisitas !== 1 ? 's' : ''}
                            {insight.ultimaVisita && ` · última: ${new Date(insight.ultimaVisita).toLocaleDateString('pt-BR')}`}
                          </span>
                        )}
                      </div>
                    </div>
                    </div>{/* flex items-start gap-2.5 */}
                    <div className="flex flex-col items-end gap-1">
                      <PointsBadge user={u} />
                      {u.balanceInCents > 0 && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0 font-bold">
                          <Wallet className="w-3 h-3" /> R$ {(u.balanceInCents / 100).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      {crediarios[u.id] && <CreditBadge crediario={crediarios[u.id]} />}
                    </div>
                  </div>
                </button>
              )
            })}
            </div>
          )}
        </div>

        {/* ── Painel de pontos ──────────────────────────────────────────────────
            Só é montado quando há cliente selecionado. Antes ele renderizava sempre,
            com um placeholder "Selecione um cliente" ocupando os 320px fixos — em
            tablet isso espremia a lista e as linhas saíam do padrão. Sem seleção,
            a lista agora usa a largura toda. */}
        {selected && (
        <div className={`${showMobileDetail ? '' : 'hidden md:block'} w-full md:w-80 md:shrink-0`}>
          <div className="md:hidden mb-3">
            <button
              onClick={() => { setSelected(null); setShowMobileDetail(false) }}
              className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar para lista
            </button>
          </div>
          <div className="card space-y-5">
              {/* Dados do cliente */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  {selected.profileImageUrl ? (
                    <img src={selected.profileImageUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-surface-500" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-brand-600/25 flex items-center justify-center shrink-0 ring-2 ring-surface-500">
                      <span className="text-xl font-black text-brand-300 leading-none">{selected.name[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-base leading-tight truncate">{selected.name}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">Cliente selecionado</p>
                  </div>
                </div>
                {selected.cpf && <p className="text-xs text-gray-500">CPF: {selected.cpf}</p>}
                {selected.whatsApp && (
                  <a
                    href={`https://wa.me/${selected.whatsApp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors mt-0.5"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    {selected.whatsApp}
                  </a>
                )}
                {selected.email && <p className="text-xs text-gray-500 mt-0.5">{selected.email}</p>}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => setShowHistorico(true)}
                    className="btn-secondary text-xs py-1.5 px-3 justify-center"
                  >
                    <History className="w-3.5 h-3.5" /> Ver Histórico
                  </button>
                  <button
                    onClick={() => setShowRedefinirSenha(true)}
                    className="btn-secondary text-xs py-1.5 px-3 justify-center"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Redefinir Senha
                  </button>
                  <button
                    onClick={() => setShowEditarCliente(true)}
                    className="btn-secondary text-xs py-1.5 px-3 justify-center col-span-2"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar Dados
                  </button>
                </div>
              </div>

              {/* Pontos */}
              <div className="bg-surface-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Pontos</p>
                <p className="text-4xl font-black text-accent-gold">{selected.pointsBalance}</p>
                <p className="text-xs text-gray-500 mt-0.5">pontos</p>

                {selected.pointsExpired && (
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-red-400">
                    <AlertCircle className="w-3 h-3" />
                    Pontos expirados
                  </div>
                )}
                {!selected.pointsExpired && selected.pointsExpiresAt && (
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    Expira {new Date(selected.pointsExpiresAt).toLocaleDateString('pt-BR')}
                  </div>
                )}
                {selected.pointsBalance === 0 && !selected.pointsExpiresAt && (
                  <p className="text-xs text-gray-400 mt-2">Sem pontos cadastrados</p>
                )}
              </div>

              {/* Adicionar Pontos */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Adicionar Pontos</p>
                <div>
                  <label className="label text-xs">Quantidade de pontos</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="Ex: 100"
                    min={1}
                    value={points}
                    onChange={e => setPoints(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">Motivo (opcional)</label>
                  <input
                    className="input"
                    placeholder="Ex: Campeonato de Pokémon"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <button
                  onClick={handleAddPoints}
                  disabled={!points || Number(points) <= 0 || adding}
                  className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Adicionando...</>
                    : <><Plus className="w-4 h-4" /> Adicionar Pontos</>
                  }
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Validade renovada para 30 dias após cada adição
                </p>
              </div>

              {/* Cashback */}
              <div className="space-y-3 border-t border-surface-500 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-400" /> Cashback
                  </p>
                  <span className="text-lg font-bold text-emerald-400">
                    R$ {((selected.balanceInCents ?? 0) / 100).toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div>
                  <label className="label text-xs">Valor (R$)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="Ex: 20,00"
                    min={0.01}
                    step={0.01}
                    value={balanceAmount}
                    onChange={e => setBalanceAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">Motivo (opcional)</label>
                  <input
                    className="input"
                    placeholder="Ex: Recarga de saldo"
                    value={balanceReason}
                    onChange={e => setBalanceReason(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAdjustBalance(true)}
                    disabled={!balanceAmount || Number(balanceAmount) <= 0 || adjustingBalance}
                    className="btn-primary justify-center text-sm py-2 disabled:opacity-50"
                  >
                    {adjustingBalance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Creditar
                  </button>
                  <button
                    onClick={() => handleAdjustBalance(false)}
                    disabled={!balanceAmount || Number(balanceAmount) <= 0 || adjustingBalance || (selected.balanceInCents ?? 0) <= 0}
                    className="btn-secondary justify-center text-sm py-2 disabled:opacity-50 hover:border-red-500/40 hover:text-red-400"
                  >
                    {adjustingBalance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Minus className="w-3.5 h-3.5" />}
                    Debitar
                  </button>
                </div>
              </div>
          </div>
        </div>
        )}
      </div>}
    </div>
  )
}

function PointsBadge({ user }: { user: UserSummary }) {
  if (user.pointsExpired)
    return (
      <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0">
        <AlertCircle className="w-3 h-3" /> Expirado
      </span>
    )
  if (user.pointsBalance > 0)
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0 font-bold">
        <Star className="w-3 h-3" /> {user.pointsBalance} pts Maikon
      </span>
    )
  return (
    <span className="text-xs text-gray-400">0 pts Maikon</span>
  )
}

function CreditBadge({ crediario }: { crediario: CrediariosDto }) {
  const label = crediario.vencido ? 'Crediário Vencido' : 'Crediário Aberto'
  const color = crediario.vencido
    ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : 'text-orange-400 bg-orange-500/10 border-orange-500/20'

  return (
    <Link href="/admin/crediario">
      <span className={`flex items-center gap-1 text-xs border px-2 py-0.5 rounded-full shrink-0 ${color}`}>
        <CreditCard className="w-3 h-3" /> {label}
      </span>
    </Link>
  )
}
