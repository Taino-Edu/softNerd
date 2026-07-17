'use client'
import { useEffect, useState } from 'react'
import { categoryApi, ProductCategory } from '@/lib/api'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Tag, X, Loader2, Check, GripVertical } from 'lucide-react'

const EMOJI_SUGESTOES = [
  // Jogos & TCG
  '🃏','🎴','🎲','🧩','🎮','🕹️','🏆','🎯','🪄','🔮','⚔️','🛡️','🐉','🧙','👾',
  // Colecionáveis & Acessórios
  '💎','🪙','🌟','🎁','📦','🧤','🗂️','🖊️','📐','🎨','🪆','🤖','🦄','🧸','🪀',
  // Alimentos & Bebidas
  '🥤','🧃','☕','🍫','🍿','🍕','🍭','🧇','🫗','🧋',
  // Campeonatos & Eventos
  '🏅','🥇','🎪','🎠','🌸','🎸','⭐','🔥','💫','🎉',
]

function CategoryModal({
  category, allCategories, onClose, onSave,
}: {
  category: Partial<ProductCategory> | null
  allCategories: ProductCategory[]
  onClose: () => void
  onSave:  (c: Partial<ProductCategory>) => Promise<void>
}) {
  const [form, setForm]     = useState<Partial<ProductCategory>>(
    category ?? { name: '', emoji: '', displayOrder: 0, isActive: true, parentCategoryId: null }
  )
  const [saving, setSaving] = useState(false)
  const set = (k: keyof ProductCategory, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  // Só pode virar categoria-pai quem hoje não é subcategoria de ninguém (só 1 nível de
  // aninhamento) e não é a própria categoria sendo editada.
  const opcoesPai = allCategories.filter(c => c.id !== form.id && !c.parentCategoryId)
  const temFilhas = !!form.id && allCategories.some(c => c.parentCategoryId === form.id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 p-4 overflow-y-auto flex items-start sm:items-center justify-center">
      <div className="card w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col my-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 shrink-0">
          <h2 className="text-lg font-bold text-white">
            {form.id ? 'Editar Categoria' : 'Nova Categoria'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
          <div>
            <label className="label">Nome *</label>
            <input
              className="input" required
              value={form.name ?? ''}
              onChange={e => set('name', e.target.value)}
              placeholder="Ex: Bebida"
            />
          </div>

          <div>
            <label className="label">Emoji</label>
            <input
              className="input w-20 text-center text-xl mb-2"
              value={form.emoji ?? ''}
              onChange={e => set('emoji', e.target.value)}
              placeholder="🎮"
              maxLength={4}
            />
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-36 overflow-y-auto rounded-lg border border-surface-500 p-1.5">
              {EMOJI_SUGESTOES.map(e => (
                <button
                  key={e} type="button"
                  onClick={() => set('emoji', e)}
                  className={`w-8 h-8 rounded-lg hover:bg-surface-500 transition-colors text-lg flex items-center justify-center ${
                    form.emoji === e ? 'bg-brand-600/30 ring-1 ring-brand-500' : ''
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Categoria pai</label>
            {temFilhas ? (
              <p className="text-xs text-gray-400 bg-surface-700 rounded-lg px-3 py-2">
                Esta categoria já tem subcategorias — não pode virar subcategoria de outra.
              </p>
            ) : (
              <>
                <select
                  className="input"
                  value={form.parentCategoryId ?? ''}
                  onChange={e => set('parentCategoryId', e.target.value || null)}
                >
                  <option value="">Nenhuma — categoria principal</option>
                  {opcoesPai.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Ex: "One Piece" com pai "Card Game" vira subcategoria.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="label">Ordem de exibição</label>
            <input
              className="input" type="number" min="0"
              value={form.displayOrder ?? 0}
              onChange={e => set('displayOrder', parseInt(e.target.value))}
            />
            <p className="text-xs text-gray-400 mt-1">Menor número aparece primeiro.</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox" id="isActive"
              checked={form.isActive ?? true}
              onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-brand-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-300">Categoria ativa</label>
          </div>
          </div>

          <div className="flex gap-3 pt-4 shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState<Partial<ProductCategory> | null | undefined>(undefined)

  const fetchCategories = async () => {
    setLoading(true)
    try { const { data } = await categoryApi.list(); setCategories(data) }
    catch { toast.error('Erro ao carregar categorias') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCategories() }, [])

  // Lista pais em ordem, cada um seguido imediatamente das próprias subcategorias (indentadas).
  const orderedCategories = (() => {
    const porOrdem = (a: ProductCategory, b: ProductCategory) =>
      a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
    const pais    = categories.filter(c => !c.parentCategoryId).sort(porOrdem)
    const filhas  = categories.filter(c => c.parentCategoryId).sort(porOrdem)
    const result: { category: ProductCategory; isChild: boolean }[] = []
    for (const pai of pais) {
      result.push({ category: pai, isChild: false })
      for (const filha of filhas.filter(f => f.parentCategoryId === pai.id))
        result.push({ category: filha, isChild: true })
    }
    // Subcategorias órfãs (pai deletado sem SetNull ter rodado ainda, ou edge case) — mostra no final.
    for (const filha of filhas.filter(f => !pais.some(p => p.id === f.parentCategoryId)))
      result.push({ category: filha, isChild: false })
    return result
  })()

  async function handleSave(form: Partial<ProductCategory>) {
    try {
      if (form.id) await categoryApi.update(form.id, form)
      else         await categoryApi.create(form)
      toast.success(form.id ? 'Categoria atualizada!' : 'Categoria criada!')
      setModal(undefined)
      fetchCategories()
    } catch { toast.error('Erro ao salvar. Verifique se o nome já existe.') }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover a categoria "${name}"? Produtos com essa categoria ficam sem categoria definida.`)) return
    try {
      await categoryApi.delete(id)
      toast.success('Categoria removida.')
      fetchCategories()
    } catch { toast.error('Erro ao remover categoria.') }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {modal !== undefined && (
        <CategoryModal
          category={modal}
          allCategories={categories}
          onClose={() => setModal(undefined)}
          onSave={handleSave}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Categorias</h1>
          <p className="text-gray-400 text-sm mt-0.5">{categories.length} categorias cadastradas</p>
        </div>
        <button onClick={() => setModal(null)} className="btn-primary">
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-surface-700 rounded-2xl flex items-center justify-center mb-4">
            <Tag className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-400 font-medium">Nenhuma categoria cadastrada</p>
          <p className="text-gray-400 text-sm mt-1">Crie categorias para organizar os produtos</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead className="bg-surface-800 border-b border-surface-500">
              <tr className="text-left">
                {['', 'Categoria', 'Emoji', 'Ordem', 'Status', 'Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-500">
              {orderedCategories.map(({ category: c, isChild }) => (
                <tr key={c.id} className="hover:bg-surface-500/30 transition-colors">
                  <td className="px-3 py-3 text-gray-500">
                    <GripVertical className="w-4 h-4" />
                  </td>
                  <td className="px-4 py-3">
                    <p className={`font-medium text-white ${isChild ? 'pl-5 flex items-center gap-1.5' : ''}`}>
                      {isChild && <span className="text-gray-500">↳</span>}
                      {c.name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-2xl">
                    {c.emoji ?? <span className="text-gray-400 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{c.displayOrder}</td>
                  <td className="px-4 py-3">
                    <span className={c.isActive
                      ? 'badge bg-accent-green/10 text-accent-green border-accent-green/30'
                      : 'badge bg-surface-600 text-gray-500 border-surface-500'}>
                      {c.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModal(c)}
                        className="p-1.5 rounded hover:bg-brand-600/20 text-gray-500 hover:text-brand-400 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="p-1.5 rounded hover:bg-red-600/20 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="card bg-surface-800/50 border-surface-600">
        <p className="text-xs text-gray-400 leading-relaxed">
          <strong className="text-gray-300">Dica:</strong> As categorias aparecem no cadastro de produtos e na tela dos clientes.
          O emoji é exibido na comanda do cliente. Ao remover uma categoria, os produtos vinculados a ela <strong className="text-gray-300">não são apagados</strong> — apenas ficam sem categoria definida.
        </p>
      </div>
    </div>
  )
}
