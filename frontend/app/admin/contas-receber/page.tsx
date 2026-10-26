'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge, BadgeTone } from '@/components/ui/Badge'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  Plus, RefreshCw, Loader2,
  ChevronLeft, ChevronRight, CheckCircle, Clock,
  AlertTriangle, TrendingDown, TrendingUp, DollarSign,
  X, Pencil, Trash2, FileText, QrCode,
} from 'lucide-react'
import { brl } from '@/lib/format'

type Transaction = {
  id: string
  source: string
  type: 'income' | 'expense'
  amount: number
  description: string
  dueDate?: string
  paidAt?: string
  status: string
  category?: string
  supplier?: string
  notes?: string
  createdAt: string
}

type Summary = {
  aPagar:      { total: number; atrasado: number; vence7d: number; qtd: number }
  aReceber:    { total: number; qtd: number }
  pagoMes:     number
  pixRecebido: { total: number; qtd: number }
}

const STATUS_OPTS = [
  { value: '',          label: 'Todas' },
  { value: 'pending',   label: 'Pendente' },
  { value: 'overdue',   label: 'Atrasada' },
  { value: 'paid',      label: 'Paga' },
  { value: 'cancelled', label: 'Cancelada' },
]

const TYPE_OPTS = [
  { value: '',        label: 'Entrada + Saída' },
  { value: 'expense', label: 'A Pagar' },
  { value: 'income',  label: 'A Receber' },
]

const CATEGORIES = ['Fornecedor', 'Aluguel', 'Salário', 'Imposto', 'Marketing', 'Serviço', 'Equipamento', 'Outro']

const statusTone: Record<string, BadgeTone> = {
  pending:   'info',
  overdue:   'danger',
  paid:      'success',
  cancelled: 'neutral',
}

const statusLabel: Record<string, string> = {
  pending: 'Pendente', overdue: 'Atrasada', paid: 'Paga', cancelled: 'Cancelada',
}

const sourceIcon: Record<string, string> = {
  manual: '✍️', inter: '🏦',
}

function fmtMoney(v: number) {
  return `${brl(Math.abs(v))}`
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Mesmo padrão visual dos cards de KPI de Financeiro (ícone em caixa colorida, valor grande) —
 * antes essa tela usava um layout mais simples/genérico, sem bater com o resto do admin. */
function StatCard({ label, value, sub, color = 'brand', icon: Icon }: {
  label: string; value: string; sub?: string
  color?: 'brand' | 'green' | 'red' | 'yellow'; icon: React.ElementType
}) {
  const colors: Record<string, string> = {
    brand: 'text-brand-400', green: 'text-emerald-400',
    red:   'text-red-400',   yellow: 'text-yellow-400',
  }
  const bgs: Record<string, string> = {
    brand: 'bg-brand-600/15', green: 'bg-emerald-500/15',
    red:   'bg-red-500/15',   yellow: 'bg-yellow-500/15',
  }
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bgs[color])}>
          <Icon className={clsx('w-4 h-4', colors[color])} />
        </div>
      </div>
      <p className={clsx('text-2xl font-bold font-mono', colors[color])}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

// Vencimento é uma data pura (sem hora significativa, sempre salva como meia-noite UTC) —
// nunca reinterpretar pelo fuso do navegador, senão qualquer fuso atrás de UTC (incluindo
// o Brasil) mostra um dia a menos do que o que está salvo.
function fmtDataPura(d?: string) {
  if (!d) return '—'
  const [ano, mes, dia] = d.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function isOverdue(t: Transaction) {
  if (t.status === 'overdue') return true
  if (t.status !== 'pending' || !t.dueDate) return false
  const hojeUtc = new Date().toISOString().slice(0, 10)
  return t.dueDate.slice(0, 10) < hojeUtc
}

// ── Modal de criação/edição ───────────────────────────────────────────────────
function TransactionModal({ initial, onClose, onSaved }: {
  initial?: Transaction | null
  onClose: () => void
  onSaved: (t: Transaction) => void
}) {
  const [type,        setType]        = useState(initial?.type        ?? 'expense')
  const [amount,      setAmount]      = useState(initial?.amount?.toString() ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dueDate,     setDueDate]     = useState(initial?.dueDate?.slice(0,10) ?? '')
  const [category,    setCategory]    = useState(initial?.category    ?? '')
  const [supplier,    setSupplier]    = useState(initial?.supplier    ?? '')
  const [notes,       setNotes]       = useState(initial?.notes       ?? '')
  const [saving,      setSaving]      = useState(false)

  async function submit() {
    if (!amount || !description) { toast.error('Preencha valor e descrição'); return }
    setSaving(true)
    try {
      const payload = {
        type, amount: parseFloat(amount.replace(',', '.')),
        description, category: category || undefined,
        supplier: supplier || undefined, notes: notes || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }
      const { data } = initial
        ? await api.put(`/api/contas-receber/${initial.id}`, payload)
        : await api.post('/api/contas-receber', payload)
      onSaved(data)
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">{initial ? 'Editar lançamento' : 'Novo lançamento'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Tipo */}
        <div className="flex gap-2">
          {(['expense', 'income'] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={clsx('flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                type === t
                  ? t === 'expense' ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                    : 'bg-green-500/20 text-green-300 border-green-500/40'
                  : 'bg-surface-700 text-gray-400 border-surface-500')}>
              {t === 'expense' ? '💸 A Pagar' : '💰 A Receber'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Descrição *</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Aluguel Agosto" className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Valor (R$) *</label>
            <input value={amount} onChange={e => setAmount(e.target.value)}
              type="number" min="0" step="0.01" placeholder="0,00" className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Vencimento</label>
            <input value={dueDate} onChange={e => setDueDate(e.target.value)}
              type="date" className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Fornecedor</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)}
              placeholder="Nome do fornecedor" className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Categoria</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="input w-full">
              <option value="">Sem categoria</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Opcional" className="input w-full resize-none" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
            Cancelar
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50
                       text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ContasReceberPage() {
  const [items,       setItems]       = useState<Transaction[]>([])
  const [summary,     setSummary]     = useState<Summary | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [typeFilter,  setTypeFilter]  = useState('')
  const [statusFilter,setStatusFilter]= useState('')
  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [totalCount,  setTotalCount]  = useState(0)

  const [createModal, setCreateModal] = useState(false)
  const [editModal,   setEditModal]   = useState<Transaction | null>(null)

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get('/api/contas-receber/summary')
      setSummary(data)
    } catch { /* silencioso */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/contas-receber', {
        params: { type: typeFilter || undefined, status: statusFilter || undefined, page, pageSize: 30 },
      })
      setItems(data.items)
      setTotalPages(data.totalPages)
      setTotalCount(data.total)
    } catch { toast.error('Erro ao carregar lançamentos') }
    finally  { setLoading(false) }
  }, [typeFilter, statusFilter, page])

  useEffect(() => { load(); loadSummary() }, [load, loadSummary])

  // O sync do Inter roda a cada 15 min no servidor: a lista se atualiza sozinha
  // pra pegar o que entrou no banco, sem precisar sair e voltar na tela.
  useEffect(() => {
    const id = window.setInterval(() => { load(); loadSummary() }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [load, loadSummary])

  async function handleMarkPaid(t: Transaction) {
    try {
      const { data } = await api.put(`/api/contas-receber/${t.id}`, { status: 'paid' })
      setItems(prev => prev.map(i => i.id === t.id ? data : i))
      loadSummary()
      toast.success('Marcado como pago')
    } catch { toast.error('Erro') }
  }

  async function handleDelete(t: Transaction) {
    if (!confirm(`Excluir "${t.description}"?`)) return
    try {
      await api.delete(`/api/contas-receber/${t.id}`)
      setItems(prev => prev.filter(i => i.id !== t.id))
      setTotalCount(c => c - 1)
      loadSummary()
      toast.success('Excluído')
    } catch { toast.error('Erro ao excluir') }
  }

  function handleSaved(t: Transaction) {
    if (editModal) {
      setItems(prev => prev.map(i => i.id === t.id ? t : i))
      setEditModal(null)
    } else {
      setItems(prev => [t, ...prev])
      setTotalCount(c => c + 1)
      setCreateModal(false)
    }
    loadSummary()
    toast.success('Salvo!')
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <Toaster />

      <PageHeader
        title="Contas a Receber / Pagar"
        subtitle={`${totalCount} lançamentos`}
        actions={(
          <>
            <button onClick={() => setCreateModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-400
                         text-white text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Novo lançamento
            </button>
          </>
        )}
      />

      {/* Cards resumo */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="A Pagar" icon={TrendingDown} color="red"
            value={fmtMoney(summary.aPagar.total)}
            sub={`${summary.aPagar.qtd} lançamentos`} />
          <StatCard label="Atrasado" icon={AlertTriangle} color="red"
            value={fmtMoney(summary.aPagar.atrasado)}
            sub={`Vence em 7d: ${fmtMoney(summary.aPagar.vence7d)}`} />
          <StatCard label="A Receber" icon={TrendingUp} color="green"
            value={fmtMoney(summary.aReceber.total)}
            sub={`${summary.aReceber.qtd} lançamentos`} />
          <StatCard label="Pago este mês" icon={DollarSign} color={summary.pagoMes >= 0 ? 'green' : 'red'}
            value={`${summary.pagoMes >= 0 ? '+' : ''}${fmtMoney(summary.pagoMes)}`}
            sub="saldo (recebido − pago)" />
          <StatCard label="Recebido via Pix" icon={QrCode} color="brand"
            value={fmtMoney(summary.pixRecebido.total)}
            sub={`${summary.pixRecebido.qtd} pagamento${summary.pixRecebido.qtd !== 1 ? 's' : ''} automático${summary.pixRecebido.qtd !== 1 ? 's' : ''}`} />
        </div>
      )}

      {/* Filtros */}
      {(
      <div className="flex gap-2 flex-wrap mb-4">
        {TYPE_OPTS.map(o => (
          <button key={o.value} onClick={() => { setTypeFilter(o.value); setPage(1) }}
            className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              typeFilter === o.value
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                : 'bg-surface-700 text-gray-400 border-surface-500')}>
            {o.label}
          </button>
        ))}
        <div className="w-px bg-surface-600 mx-1" />
        {STATUS_OPTS.map(o => (
          <button key={o.value} onClick={() => { setStatusFilter(o.value); setPage(1) }}
            className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              statusFilter === o.value
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                : 'bg-surface-700 text-gray-400 border-surface-500')}>
            {o.label}
          </button>
        ))}
        <button onClick={() => { load(); loadSummary() }} className="ml-auto p-1.5 rounded-lg bg-surface-700 text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      )}

      {/* Lista */}
      {(loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum lançamento encontrado</p>
          <p className="text-xs mt-1">Adicione manualmente — os do Inter entram sozinhos</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(t => {
            const overdue = isOverdue(t)
            return (
              <div key={t.id}
                className={clsx('card flex items-center gap-3 p-3',
                  overdue && 'border-red-500/30 bg-red-500/5')}>

                {/* Tipo icon */}
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                  t.type === 'expense' ? 'bg-red-500/10' : 'bg-green-500/10')}>
                  {t.type === 'expense'
                    ? <TrendingDown className="w-4 h-4 text-red-400" />
                    : <TrendingUp   className="w-4 h-4 text-green-400" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white text-sm truncate">{t.description}</p>
                    <span className="text-xs">{sourceIcon[t.source] ?? '📄'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {t.supplier && <span className="text-xs text-gray-400">{t.supplier}</span>}
                    {t.category && <span className="text-xs text-gray-500">· {t.category}</span>}
                    <span className="text-xs text-gray-500">
                      {t.dueDate ? `Vence ${fmtDataPura(t.dueDate)}` : `Criado ${fmtDate(t.createdAt)}`}
                    </span>
                  </div>
                </div>

                {/* Valor */}
                <div className="text-right flex-shrink-0">
                  <p className={clsx('font-black text-base',
                    t.type === 'expense' ? 'text-red-400' : 'text-green-400')}>
                    {t.type === 'expense' ? '−' : '+'}{fmtMoney(t.amount)}
                  </p>
                  <Badge tone={statusTone[overdue ? 'overdue' : t.status] ?? 'info'} className="text-[10px]">
                    {statusLabel[overdue ? 'overdue' : t.status] ?? t.status}
                  </Badge>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {t.status !== 'paid' && t.status !== 'cancelled' && (
                    <button onClick={() => handleMarkPaid(t)} title="Marcar como pago"
                      className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setEditModal(t)} title="Editar"
                    className="p-1.5 rounded-lg bg-surface-700 text-gray-400 hover:text-white transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(t)} title="Excluir"
                    className="p-1.5 rounded-lg bg-surface-700 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-lg bg-surface-700 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 rounded-lg bg-surface-700 disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modais */}
      {(createModal || editModal) && (
        <TransactionModal
          initial={editModal}
          onClose={() => { setCreateModal(false); setEditModal(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
