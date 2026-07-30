'use client'
// =============================================================================
// TopClientes.tsx — filtro + ranking de clientes por gasto, compartilhado entre
// o painel do dashboard e a subpágina /admin/clientes/analises.
//
// Antes cada tela montava o próprio "Top Clientes" chamando analyticsApi.clientes()
// sem argumento nenhum: o endpoint devolvia todos os clientes, somando desde sempre,
// e o front cortava no .slice(0, 5). Aqui o recorte é do servidor (período, limite,
// forma de pagamento, PDV), então a lista para de crescer sem teto conforme a base
// de clientes cresce.
// =============================================================================
import { useCallback, useEffect, useState } from 'react'
import { analyticsApi, ClienteInsightDto, ClientesFiltro } from '@/lib/api'
import { Star, Medal, Trophy, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

/** Data → 'YYYY-MM-DD' no fuso local (o backend interpreta como data de Brasília). */
export function toDateInput(d: Date) {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export type PeriodoPreset = 'hoje' | '7d' | 'mes' | 'tudo' | 'custom'

/** 'tudo' devolve datas vazias de propósito: sem inicio/fim o backend não recorta
 *  período nenhum, que é o comportamento histórico do Top Clientes. */
export function getRangeClientes(preset: PeriodoPreset): { inicio: string; fim: string } {
  const now = new Date(), hoje = toDateInput(now)
  if (preset === 'tudo') return { inicio: '', fim: '' }
  if (preset === 'hoje') return { inicio: hoje, fim: hoje }
  if (preset === '7d') {
    const ini = new Date(now); ini.setDate(ini.getDate() - 6)
    return { inicio: toDateInput(ini), fim: hoje }
  }
  return { inicio: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), fim: hoje }
}

const FORMAS = ['', 'Pix', 'Dinheiro', 'CartaoCredito', 'CartaoDebito', 'Crediario'] as const
const FORMA_LABELS: Record<string, string> = {
  Pix: 'Pix', Dinheiro: 'Dinheiro', CartaoCredito: 'Crédito',
  CartaoDebito: 'Débito', Crediario: 'Crediário',
}

export interface TopClientesState {
  preset: PeriodoPreset
  inicio: string
  fim: string
  limite: number
  incluirPdv: boolean
  formaPagamento: string
}

export const DEFAULT_TOP_CLIENTES: TopClientesState = {
  preset: 'mes', ...getRangeClientes('mes'),
  limite: 10, incluirPdv: true, formaPagamento: '',
}

/**
 * Carrega o ranking já filtrado. `state` é controlado por quem usa o hook — assim
 * o dashboard pode fixar um limite pequeno e a subpágina expor tudo.
 */
export function useTopClientes(state: TopClientesState) {
  const [data, setData]       = useState<ClienteInsightDto[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState(false)

  const { inicio, fim, limite, incluirPdv, formaPagamento } = state

  const load = useCallback(async () => {
    setLoading(true)
    setErro(false)
    try {
      const filtro: ClientesFiltro = {
        inicio: inicio || undefined,
        fim: fim || undefined,
        limite,
        incluirPdv,
        filterPaymentMethod: formaPagamento || undefined,
      }
      const r = await analyticsApi.clientes(filtro)
      // Cliente sem gasto no período não é "top" de nada — só polui a lista.
      setData(r.data.filter(c => c.gastoTotal > 0))
    } catch {
      setErro(true)
    } finally {
      setLoading(false)
    }
  }, [inicio, fim, limite, incluirPdv, formaPagamento])

  useEffect(() => { load() }, [load])

  return { data, loading, erro, reload: load }
}

// ── Barra de filtros ──────────────────────────────────────────────────────────

export function TopClientesFilterBar({
  state, onChange, compact = false,
}: {
  state: TopClientesState
  onChange: (next: TopClientesState) => void
  /** No dashboard o espaço é curto: esconde o seletor de limite e os presets menos usados. */
  compact?: boolean
}) {
  function applyPreset(p: PeriodoPreset) {
    if (p === 'custom') { onChange({ ...state, preset: p }); return }
    onChange({ ...state, preset: p, ...getRangeClientes(p) })
  }

  const presets: PeriodoPreset[] = compact
    ? ['hoje', '7d', 'mes', 'tudo']
    : ['hoje', '7d', 'mes', 'tudo', 'custom']

  return (
    <div className="flex flex-col gap-2.5">
      {/* Período */}
      <div className="flex gap-1.5 flex-wrap">
        {presets.map(p => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
              state.preset === p
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                : 'bg-surface-700 text-gray-400 hover:text-white hover:bg-surface-500',
            )}
          >
            {{ hoje: 'Hoje', '7d': '7 dias', mes: 'Este mês', tudo: 'Tudo', custom: 'Personalizado' }[p]}
          </button>
        ))}
      </div>

      {/* Datas personalizadas */}
      {state.preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            className="input py-1 text-xs w-full sm:w-36"
            value={state.inicio}
            max={state.fim || toDateInput(new Date())}
            onChange={e => onChange({ ...state, inicio: e.target.value })}
          />
          <span className="text-gray-500 text-xs">até</span>
          <input
            type="date"
            className="input py-1 text-xs w-full sm:w-36"
            value={state.fim}
            min={state.inicio}
            max={toDateInput(new Date())}
            onChange={e => onChange({ ...state, fim: e.target.value })}
          />
        </div>
      )}

      {/* Forma de pagamento — quebra linha em vez de rolar na horizontal: com
          `overflow-x-auto scrollbar-none` as últimas formas ficavam cortadas no painel
          estreito do dashboard, sem nenhuma pista de que dava pra rolar. */}
      <div className="flex gap-1.5 flex-wrap">
        {FORMAS.map(pm => (
          <button
            key={pm || 'all'}
            onClick={() => onChange({ ...state, formaPagamento: pm })}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all whitespace-nowrap shrink-0',
              state.formaPagamento === pm
                ? 'bg-brand-600/30 border-brand-500 text-brand-200'
                : 'bg-surface-700 border-surface-500 text-gray-400 hover:text-gray-200',
            )}
          >
            {pm ? (FORMA_LABELS[pm] ?? pm) : 'Todas as formas'}
          </button>
        ))}
      </div>

      {/* PDV + limite */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.incluirPdv}
            onChange={e => onChange({ ...state, incluirPdv: e.target.checked })}
            className="accent-brand-500 w-3.5 h-3.5"
          />
          Incluir vendas do caixa (PDV)
        </label>
        {!compact && (
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            Mostrar
            <select
              className="input py-1 text-xs w-auto"
              value={state.limite}
              onChange={e => onChange({ ...state, limite: Number(e.target.value) })}
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>Top {n}</option>)}
              <option value={0}>Todos</option>
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

// ── Lista do ranking ──────────────────────────────────────────────────────────

export function TopClientesList({
  data, loading, erro, incluiPdv,
}: {
  data: ClienteInsightDto[]
  loading: boolean
  erro?: boolean
  /** Só pra ajustar o texto de "visitas" quando o PDV entra na conta. */
  incluiPdv?: boolean
}) {
  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
      </div>
    )
  }
  if (erro) {
    return <p className="text-xs text-red-400 py-4 text-center">Erro ao carregar o ranking</p>
  }
  if (data.length === 0) {
    return <p className="text-xs text-gray-500 py-4 text-center">Nenhuma compra no período selecionado</p>
  }

  const unidade = incluiPdv ? 'compra' : 'visita'

  return (
    <div className="space-y-2">
      {data.map((c, i) => {
        const medalColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-400'
        const MedalIcon  = i === 0 ? Star : i <= 2 ? Medal : Trophy
        const badgeInativo = c.inativo30
        const badgePontos  = c.pontosVencemEm !== null && c.pontos > 0 && c.pontosVencemEm <= 14

        // Empilhado em vez de nome/texto/valor competindo na mesma linha. No painel do
        // dashboard (~220px) a versão lado a lado espremia o nome até 0px de largura e
        // quebrava o texto no meio da palavra, com a linha indo a 143px de altura.
        return (
          <div key={c.userId} className="py-2 px-3 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors">
            {/* Nome + atalho de WhatsApp */}
            <div className="flex items-center gap-2">
              <MedalIcon className={clsx('w-4 h-4 shrink-0', medalColor)} />
              <p className="text-sm font-medium text-white truncate flex-1 min-w-0">{c.nome}</p>
              {c.whatsApp && (
                <a
                  href={`https://wa.me/${c.whatsApp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 transition-colors"
                  title={`WhatsApp: ${c.whatsApp}`}
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </a>
              )}
            </div>

            {/* Métrica à esquerda, valor à direita — `truncate` no texto pra ele nunca
                quebrar no meio da palavra quando o espaço aperta. */}
            <div className="flex items-center gap-2 mt-0.5 pl-6">
              <span className="text-xs text-gray-500 truncate flex-1 min-w-0">
                {c.numVisitas} {unidade}{c.numVisitas !== 1 ? 's' : ''} · {fmt(c.ticketMedio)}/{unidade}
              </span>
              <span className="text-sm font-bold text-accent-gold font-mono shrink-0">{fmt(c.gastoTotal)}</span>
            </div>

            {(badgeInativo || badgePontos) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-6">
                {badgeInativo && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">inativo</span>
                )}
                {badgePontos && (
                  <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                    c.pontosVencemEm! < 0 ? 'bg-red-500/15 text-red-400 border-red-500/20' : 'bg-orange-500/15 text-orange-400 border-orange-500/20',
                  )}>
                    {c.pontosVencemEm! < 0 ? `${c.pontos}pts vencidos` : `${c.pontos}pts vencem em ${c.pontosVencemEm}d`}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
