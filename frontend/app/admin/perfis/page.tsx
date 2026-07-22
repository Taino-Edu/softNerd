'use client'
import { useState, useEffect, useCallback } from 'react'
import { perfisApi, PerfilDto } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { UserCog, Plus, Trash2, Edit2, Check, X, Loader2, Shield, Users } from 'lucide-react'
import toast from 'react-hot-toast'

const PERMISSOES_LABELS: Record<string, string> = {
  dashboard:   'Painel Geral',
  pdv:         'Frente de Caixa',
  comandas:    'Comandas',
  estoque:     'Estoque',
  categorias:  'Categorias',
  usuarios:    'Clientes & Usuários',
  crediario:   'Crediário',
  campeonatos: 'Campeonatos',
  financeiro:  'Relatório Financeiro',
  relatorios:  'Relatórios Gerais',
  anuncios:    'Anúncios',
  cartas:      'Cartas TCG',
  qrcodes:     'QR Codes',
  lgpd:        'LGPD & Auditoria',
}

const ALL_PERMS = Object.keys(PERMISSOES_LABELS)

// ── Formulário de perfil ──────────────────────────────────────────────────────

function PerfilForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: PerfilDto
  onSave: (nome: string, permissoes: string[]) => Promise<void>
  onCancel: () => void
}) {
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    new Set(initial?.permissoes ?? [])
  )
  const [saving, setSaving] = useState(false)

  function toggle(p: string) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  function selectAll() { setSelecionadas(new Set(ALL_PERMS)) }
  function clearAll()  { setSelecionadas(new Set()) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      await onSave(nome.trim(), [...selecionadas])
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Nome do Perfil</label>
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder='Ex: Caixa, Estoquista, Gerente...'
          className="input w-full"
          maxLength={100}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Permissões</span>
          <div className="flex gap-2">
            <button type="button" onClick={selectAll} className="text-xs text-brand-400 hover:underline">Todas</button>
            <span className="text-gray-600">·</span>
            <button type="button" onClick={clearAll}  className="text-xs text-gray-500 hover:underline">Nenhuma</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ALL_PERMS.map(p => (
            <label
              key={p}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm
                ${selecionadas.has(p)
                  ? 'border-brand-500/50 bg-brand-500/10 text-white'
                  : 'border-surface-500 bg-surface-700 text-gray-400 hover:border-surface-300'}`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={selecionadas.has(p)}
                onChange={() => toggle(p)}
              />
              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors
                ${selecionadas.has(p) ? 'bg-brand-500 border-brand-500' : 'border-gray-600'}`}>
                {selecionadas.has(p) && <Check className="w-2.5 h-2.5 text-black" />}
              </div>
              {PERMISSOES_LABELS[p]}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">{selecionadas.size} de {ALL_PERMS.length} permissões selecionadas</p>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {initial ? 'Salvar Alterações' : 'Criar Perfil'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary px-4">
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  )
}

// ── Card de perfil ────────────────────────────────────────────────────────────

function PerfilCard({
  perfil,
  onEdit,
  onDelete,
}: {
  perfil: PerfilDto
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-500/15 border border-brand-500/20 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{perfil.nome}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Users className="w-3 h-3" /> {perfil.totalUsuarios} operador{perfil.totalUsuarios !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-500 transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          {confirmDelete ? (
            <div className="flex gap-1">
              <button onClick={onDelete} className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setConfirmDelete(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={perfil.totalUsuarios > 0}
              title={perfil.totalUsuarios > 0 ? 'Reatribua os operadores antes de excluir' : 'Excluir perfil'}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {perfil.permissoes.length === 0
          ? <span className="text-xs text-gray-600 italic">Nenhuma permissão</span>
          : perfil.permissoes.map(p => (
            <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-600 text-gray-300 border border-surface-500">
              {PERMISSOES_LABELS[p] ?? p}
            </span>
          ))
        }
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PerfisPage() {
  const [perfis,    setPerfis]    = useState<PerfilDto[]>([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [editing,   setEditing]   = useState<PerfilDto | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await perfisApi.list()
      setPerfis(res.data)
    } catch {
      toast.error('Erro ao carregar perfis')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(nome: string, permissoes: string[]) {
    try {
      await perfisApi.create(nome, permissoes)
      toast.success(`Perfil "${nome}" criado!`)
      setCreating(false)
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao criar perfil')
    }
  }

  async function handleEdit(nome: string, permissoes: string[]) {
    if (!editing) return
    try {
      await perfisApi.update(editing.id, { nome, permissoes })
      toast.success('Perfil atualizado!')
      setEditing(null)
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao atualizar')
    }
  }

  async function handleDelete(id: string) {
    try {
      await perfisApi.delete(id)
      toast.success('Perfil excluído')
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao excluir')
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Perfis de Acesso"
        subtitle="Crie perfis com permissões customizadas para operadores"
        actions={!creating && !editing && (
          <button onClick={() => setCreating(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" /> Novo Perfil
          </button>
        )}
      />

      {/* Formulário de criação */}
      {creating && (
        <div className="card p-5 mb-6 border-brand-500/30">
          <h2 className="text-sm font-semibold text-white mb-4">Novo Perfil</h2>
          <PerfilForm onSave={handleCreate} onCancel={() => setCreating(false)} />
        </div>
      )}

      {/* Formulário de edição */}
      {editing && (
        <div className="card p-5 mb-6 border-brand-500/30">
          <h2 className="text-sm font-semibold text-white mb-4">Editar: {editing.nome}</h2>
          <PerfilForm initial={editing} onSave={handleEdit} onCancel={() => setEditing(null)} />
        </div>
      )}

      {/* Lista de perfis */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
        </div>
      ) : perfis.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <UserCog className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum perfil criado ainda.</p>
          <p className="text-xs text-gray-600 mt-1">Crie perfis para atribuir a operadores da loja.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {perfis.map(p => (
            <PerfilCard
              key={p.id}
              perfil={p}
              onEdit={() => { setCreating(false); setEditing(p) }}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}

      {/* Dica */}
      <div className="mt-8 p-4 rounded-xl bg-surface-700 border border-surface-500 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-400">Como funciona?</p>
        <p>1. Crie um perfil com um nome livre (ex: "Caixa") e marque as permissões desejadas.</p>
        <p>2. Em <strong className="text-gray-300">Clientes → aba Operadores</strong>, crie um usuário do tipo Operador e atribua o perfil.</p>
        <p>3. O operador verá apenas as seções permitidas ao fazer login.</p>
      </div>
    </div>
  )
}
