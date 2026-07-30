'use client'
// =============================================================================
// /admin/clientes/analises — subpágina de análises da área de clientes.
// O ranking e os filtros vêm de components/admin/TopClientes (os mesmos que o
// painel do dashboard usa), então as duas telas nunca divergem no critério.
// =============================================================================
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart2, ChevronLeft, RefreshCw, Users, UserX, TrendingUp, Wallet } from 'lucide-react'
import {
  useTopClientes, TopClientesFilterBar, TopClientesList,
  DEFAULT_TOP_CLIENTES, TopClientesState,
} from '@/components/admin/TopClientes'

const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

export default function ClientesAnalisesPage() {
  // Aqui o padrão é 'Top 20' — a tela é dedicada, cabe mais que no card do dashboard.
  const [filtro, setFiltro] = useState<TopClientesState>({ ...DEFAULT_TOP_CLIENTES, limite: 20 })
  const { data, loading, erro, reload } = useTopClientes(filtro)

  // Resumo do que está na tela — sempre coerente com o filtro aplicado, porque é
  // derivado da mesma lista que o ranking renderiza, não de outra chamada.
  const resumo = useMemo(() => {
    const receita = data.reduce((s, c) => s + c.gastoTotal, 0)
    const compras = data.reduce((s, c) => s + c.numVisitas, 0)
    return {
      clientes: data.length,
      receita,
      ticket: compras > 0 ? receita / compras : 0,
      inativos: data.filter(c => c.inativo30).length,
    }
  }, [data])

  const periodoLabel = filtro.preset === 'tudo'
    ? 'Desde o início'
    : filtro.inicio === filtro.fim ? filtro.inicio : `${filtro.inicio} → ${filtro.fim}`

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link
            href="/admin/usuarios"
            className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors mb-1"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar para clientes
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-brand-400" /> Análises de Clientes
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Ranking por gasto no período — comandas fechadas
            {filtro.incluirPdv ? ' e vendas do caixa' : ''}
          </p>
        </div>
        <button onClick={reload} disabled={loading} className="btn-secondary text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="card border-surface-500">
        <TopClientesFilterBar state={filtro} onChange={setFiltro} />
      </div>

      {/* Resumo do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Clientes com compra', value: String(resumo.clientes), icon: Users,      color: 'text-brand-400' },
          { label: 'Receita no ranking',  value: fmt(resumo.receita),     icon: Wallet,     color: 'text-accent-gold' },
          { label: 'Ticket médio',        value: fmt(resumo.ticket),      icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Inativos há 30d',     value: String(resumo.inativos), icon: UserX,      color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
            </div>
            <p className={`text-xl font-black font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Ranking */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-300">
            Top clientes {filtro.limite > 0 ? `(até ${filtro.limite})` : '(todos)'}
          </h2>
          <span className="text-xs text-gray-500">{periodoLabel}</span>
        </div>
        <TopClientesList data={data} loading={loading} erro={erro} incluiPdv={filtro.incluirPdv} />
      </div>

      <p className="text-xs text-gray-600">
        &quot;Inativo&quot; é sempre relativo a hoje (sem compra nos últimos 30 dias), não ao período
        filtrado. Vendas de balcão sem cliente identificado não entram no ranking de ninguém.
      </p>
    </div>
  )
}
