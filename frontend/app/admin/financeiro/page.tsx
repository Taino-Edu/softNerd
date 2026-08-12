'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { analyticsApi, vendaAvulsaApi, FinanceiroDto, FormaPagamentoTotalDto, PagamentoCrediarioPeriodoDto, AberturaCrediarioPeriodoDto, ExtratoDto, ExtratoLinhaDto } from '@/lib/api'
import { gerarRelatorioPDF } from '@/lib/relatorio'
import toast from 'react-hot-toast'
import {
  TrendingUp, TrendingDown, DollarSign, AlertCircle,
  RefreshCw, Printer, Package, ShoppingBag, BarChart2,
  Banknote, CreditCard, QrCode, Receipt, ChevronDown, ChevronUp,
  Store, ShoppingCart, X, Search, Star, Wallet, Filter, Trophy, Globe,
  FileText, Lightbulb, ArrowUp, ArrowDown, Minus, Loader2,
} from 'lucide-react'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
function fmtShort(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`
  return `R$${v.toFixed(0)}`
}

// ── Formas de pagamento ───────────────────────────────────────────────────────
const FORMA_LABELS: Record<string, string> = {
  Dinheiro:      'Dinheiro',
  Pix:           'Pix',
  CartaoCredito: 'Cartão de Crédito',
  CartaoDebito:  'Cartão de Débito',
  Crediario:     'Crediário',
  Pontos:        'Pontos de Fidelidade',
  Cashback:      'Cashback (Saldo)',
}

const FORMA_ICONS: Record<string, React.ReactNode> = {
  Dinheiro:      <Banknote   className="w-4 h-4 text-emerald-400" />,
  Pix:           <QrCode     className="w-4 h-4 text-brand-400"   />,
  CartaoCredito: <CreditCard className="w-4 h-4 text-purple-400"  />,
  CartaoDebito:  <CreditCard className="w-4 h-4 text-blue-400"    />,
  Crediario:     <DollarSign className="w-4 h-4 text-amber-400"   />,
  Pontos:        <Star       className="w-4 h-4 text-yellow-400"  />,
  Cashback:      <Wallet     className="w-4 h-4 text-pink-400"    />,
}

// ── Curva ABC ─────────────────────────────────────────────────────────────────
type AbcClass = 'A' | 'B' | 'C'

interface AbcProduto {
  nome: string; receita: number; qtd: number; custo: number
  categoria?: string; abcClass: AbcClass; cumPct: number; pct: number
}

const ABC_COLORS: Record<AbcClass, { bar: string; text: string; bg: string; border: string }> = {
  A: { bar: '#10b981', text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  B: { bar: '#f59e0b', text: 'text-yellow-400',  bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40'  },
  C: { bar: '#ef4444', text: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/40'     },
}

function classifyABC(produtos: { nome: string; receita: number; qtd: number; custo: number; categoria?: string }[]): AbcProduto[] {
  const sorted = [...produtos].sort((a, b) => b.receita - a.receita)
  const total  = sorted.reduce((s, p) => s + p.receita, 0)
  let cum = 0
  return sorted.map(p => {
    cum += p.receita
    const cumPct = total > 0 ? (cum / total) * 100 : 0
    const pct    = total > 0 ? (p.receita / total) * 100 : 0
    const abcClass: AbcClass = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C'
    return { nome: p.nome, receita: p.receita, qtd: p.qtd, custo: p.custo, categoria: p.categoria, abcClass, cumPct, pct }
  })
}

type AbcSortCol = 'receita' | 'qtd' | 'margemPct' | 'precoMedio'

function AbcExplainer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-surface-500 bg-surface-800 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-300">O que é a Curva ABC?</span>
          <span className="text-[10px] bg-surface-600 text-gray-400 px-2 py-0.5 rounded-full">conceito</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-700">
          <p className="text-xs text-gray-400 leading-relaxed pt-3">
            A <strong className="text-white">Curva ABC</strong> (ou <strong className="text-white">Princípio de Pareto</strong>) é uma técnica
            que classifica seus produtos pelo impacto na receita. A ideia central é: <em className="text-brand-300">poucos produtos geram a maior parte do faturamento</em>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-emerald-400">A</span>
                <span className="text-xs font-semibold text-emerald-300">Produtos Vitais</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Respondem por <strong className="text-emerald-300">~80% da receita</strong> com poucos itens.
                São os mais importantes — nunca podem faltar no estoque e merecem atenção especial no preço e na margem.
              </p>
              <p className="text-[10px] text-emerald-500 mt-1">→ Monitore de perto, negocie melhor com fornecedor</p>
            </div>

            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/25 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-yellow-400">B</span>
                <span className="text-xs font-semibold text-yellow-300">Produtos Importantes</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Representam <strong className="text-yellow-300">~15% da receita</strong> (acumulado 80–95%).
                Têm bom potencial — podem virar classe A com ações de marketing ou ajuste de preço.
              </p>
              <p className="text-[10px] text-yellow-500 mt-1">→ Avalie promoções ou combos para alavancar</p>
            </div>

            <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-red-400">C</span>
                <span className="text-xs font-semibold text-red-300">Produtos Periféricos</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Os últimos <strong className="text-red-300">~5% da receita</strong> com muitos itens.
                Vale questionar: custam estoque? Têm giro? Talvez seja hora de descontinuar alguns.
              </p>
              <p className="text-[10px] text-red-400 mt-1">→ Revise mix, considere descontinuar ou promover</p>
            </div>
          </div>

          <div className="rounded-xl bg-brand-500/8 border border-brand-500/20 p-3">
            <p className="text-xs text-gray-400 leading-relaxed">
              <strong className="text-brand-300">Como ler o gráfico Pareto:</strong> As barras mostram a receita de cada produto (da maior para a menor).
              A <span className="text-brand-300 font-semibold">linha azul</span> mostra o percentual <em>acumulado</em> — onde ela cruza
              a linha <span className="text-emerald-400 font-semibold">verde (80%)</span> termina a classe A,
              e onde cruza a <span className="text-yellow-400 font-semibold">amarela (95%)</span> termina a classe B.
              O restante é C.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function CurvaABCSection({ produtos, targetPct }: {
  produtos: { nome: string; receita: number; qtd: number; custo: number; categoria?: string }[]
  targetPct: number
}) {
  const [hoveredIdx,  setHoveredIdx]  = useState<number | null>(null)
  const [sortCol,     setSortCol]     = useState<AbcSortCol>('receita')
  const [sortDir,     setSortDir]     = useState<'desc' | 'asc'>('desc')
  const [filterClass, setFilterClass] = useState<AbcClass | null>(null)
  const [filterCat,   setFilterCat]   = useState<string | null>(null)

  const abcData  = useMemo(() => classifyABC(produtos), [produtos])
  const grandTotal = useMemo(() => produtos.reduce((s, p) => s + p.receita, 0), [produtos])

  const catWeights = useMemo(() => {
    const map: Record<string, { receita: number; qtd: number; count: number }> = {}
    abcData.forEach(p => {
      const cat = p.categoria || 'Sem categoria'
      if (!map[cat]) map[cat] = { receita: 0, qtd: 0, count: 0 }
      map[cat].receita += p.receita
      map[cat].qtd     += p.qtd
      map[cat].count   += 1
    })
    const cats = Object.entries(map).sort((a, b) => b[1].receita - a[1].receita)
    let cumCat = 0
    return cats.map(([cat, v]) => {
      cumCat += v.receita
      const cumPct = grandTotal > 0 ? (cumCat / grandTotal) * 100 : 0
      const pct    = grandTotal > 0 ? (v.receita  / grandTotal) * 100 : 0
      const cls: AbcClass = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C'
      return { cat, ...v, pct, cumPct, cls }
    })
  }, [abcData, grandTotal])

  const tableData = useMemo(() => {
    let rows = [...abcData]
    if (filterClass) rows = rows.filter(p => p.abcClass === filterClass)
    if (filterCat)   rows = rows.filter(p => (p.categoria || 'Sem categoria') === filterCat)
    rows.sort((a, b) => {
      let va: number, vb: number
      if (sortCol === 'qtd') { va = a.qtd; vb = b.qtd }
      else if (sortCol === 'precoMedio') {
        va = a.qtd > 0 ? a.receita / a.qtd : 0
        vb = b.qtd > 0 ? b.receita / b.qtd : 0
      } else if (sortCol === 'margemPct') {
        const pm = (x: AbcProduto) => x.qtd > 0 ? x.receita / x.qtd : 0
        const cm = (x: AbcProduto) => x.qtd > 0 ? x.custo  / x.qtd : 0
        va = pm(a) > 0 && cm(a) > 0 ? ((pm(a) - cm(a)) / pm(a)) * 100 : -999
        vb = pm(b) > 0 && cm(b) > 0 ? ((pm(b) - cm(b)) / pm(b)) * 100 : -999
      } else { va = a.receita; vb = b.receita }
      return sortDir === 'desc' ? vb - va : va - vb
    })
    return rows
  }, [abcData, filterClass, filterCat, sortCol, sortDir])

  function toggleSort(col: AbcSortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const chartData  = abcData.slice(0, 30)
  const maxReceita = chartData[0]?.receita ?? 1
  const W = 700, H = 200, PAD = { top: 14, right: 46, bottom: 36, left: 54 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom
  const barW   = Math.max(5, chartW / (chartData.length || 1) - 2)

  const linePoints = chartData.map((p, i) => {
    const slotW = chartW / chartData.length
    const x = PAD.left + slotW * i + slotW / 2
    const y = PAD.top  + chartH * (1 - p.cumPct / 100)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const hasFilters = filterClass !== null || filterCat !== null

  return (
    <div className="space-y-4">
      {/* Painel explicativo — o que é Curva ABC */}
      <AbcExplainer />

      {/* Resumo A/B/C */}
      <div className="grid grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as AbcClass[]).map(cls => {
          const items = abcData.filter(p => p.abcClass === cls)
          const clsRec = items.reduce((s, p) => s + p.receita, 0)
          const c = ABC_COLORS[cls]
          const isActive = filterClass === cls
          return (
            <button key={cls} onClick={() => setFilterClass(isActive ? null : cls)}
              className={`rounded-xl p-4 border text-left transition-all ${isActive ? `${c.bg} ${c.border} border-2` : 'bg-surface-800 border-surface-500 hover:border-surface-400'}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-2xl font-black ${c.text}`}>{cls}</span>
                <span className="text-[10px] text-gray-500">{items.length} produto{items.length !== 1 ? 's' : ''}</span>
              </div>
              <p className={`text-sm font-bold font-mono ${c.text}`}>{fmt(clsRec)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {cls === 'A' ? 'Vitais · 80% receita' : cls === 'B' ? 'Importantes · 15%' : 'Periféricos · 5%'}
              </p>
            </button>
          )
        })}
      </div>

      {/* Pareto Chart */}
      <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-brand-400" /> Curva ABC — Pareto
            {chartData.length < abcData.length && <span className="text-gray-600 font-normal">(top {chartData.length})</span>}
          </h4>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            {(['A','B','C'] as AbcClass[]).map(cls => (
              <span key={cls} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: ABC_COLORS[cls].bar }} />
                {cls}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 h-0.5 bg-brand-400" />% Acum.
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: Math.max(300, chartData.length * 20) }}>
            {[0.25, 0.5, 0.75, 1].map(f => (
              <g key={f}>
                <line x1={PAD.left} y1={PAD.top + chartH * (1 - f)} x2={W - PAD.right} y2={PAD.top + chartH * (1 - f)} stroke="#32323f" strokeWidth="1" />
                <text x={PAD.left - 4} y={PAD.top + chartH * (1 - f) + 4} textAnchor="end" fontSize="8" fill="#6b7280">
                  {fmtShort(maxReceita * f)}
                </text>
              </g>
            ))}
            {([80, 95] as const).map(pct => {
              const y = PAD.top + chartH * (1 - pct / 100)
              const col = pct === 80 ? '#10b981' : '#f59e0b'
              return (
                <g key={pct}>
                  <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={col} strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
                  <text x={W - PAD.right + 3} y={y + 3} fontSize="7" fill={col}>{pct}%</text>
                </g>
              )
            })}
            {[25, 50, 75, 100].map(pct => (
              <text key={pct} x={W - PAD.right + 3} y={PAD.top + chartH * (1 - pct / 100) + 3} fontSize="7" fill="#4b5563">{pct}%</text>
            ))}
            {chartData.map((p, i) => {
              const slotW = chartW / chartData.length
              const x = PAD.left + slotW * i + (slotW - barW) / 2
              const bH = Math.max(2, (p.receita / maxReceita) * chartH)
              const color = ABC_COLORS[p.abcClass].bar
              const isHov = hoveredIdx === i
              return (
                <g key={p.nome} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} className="cursor-pointer">
                  <rect x={x} y={PAD.top + chartH - bH} width={barW} height={bH}
                    fill={color} opacity={hoveredIdx === null || isHov ? 1 : 0.35} rx="2"
                    style={{ filter: isHov ? 'brightness(1.2)' : undefined }} />
                  {chartData.length <= 20 && (
                    <text x={x + barW / 2} y={H - 2} textAnchor="middle" fontSize="5.5" fill={isHov ? '#d1d5db' : '#6b7280'}>
                      {p.nome.slice(0, 6)}
                    </text>
                  )}
                </g>
              )
            })}
            {chartData.length > 1 && (
              <polyline points={linePoints} fill="none" stroke="#42B6EE" strokeWidth="1.5" strokeLinejoin="round" />
            )}
            {hoveredIdx !== null && chartData[hoveredIdx] && (() => {
              const p     = chartData[hoveredIdx]
              const slotW = chartW / chartData.length
              const cx2   = PAD.left + slotW * hoveredIdx + slotW / 2
              const cy2   = PAD.top + chartH * (1 - p.cumPct / 100)
              const boxW  = 144, boxH = 40
              // Horizontal: cabe à direita? senão à esquerda
              const bxRaw = cx2 - boxW / 2
              const bx    = Math.max(PAD.left, Math.min(bxRaw, W - PAD.right - boxW))
              // Vertical: acima da linha cumulativa, mas nunca sair pelo topo
              const byRaw = cy2 - boxH - 8
              const by    = Math.max(PAD.top + 2, byRaw)
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={cx2} cy={cy2} r="3.5" fill="#42B6EE" stroke="#1e1e2e" strokeWidth="1" />
                  <rect x={bx} y={by} width={boxW} height={boxH} rx="5" fill="#1e1e2e" stroke="#32323f" strokeWidth="1" opacity="0.97" />
                  <text x={bx + boxW / 2} y={by + 13} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">
                    {p.nome.length > 22 ? p.nome.slice(0, 22) + '…' : p.nome}
                  </text>
                  <text x={bx + boxW / 2} y={by + 25} textAnchor="middle" fontSize="7.5" fill={ABC_COLORS[p.abcClass].bar}>
                    {fmt(p.receita)} · {p.pct.toFixed(1)}% · Acum: {p.cumPct.toFixed(1)}%
                  </text>
                  <text x={bx + boxW / 2} y={by + 36} textAnchor="middle" fontSize="7" fill="#9ca3af">
                    Classe {p.abcClass}
                  </text>
                </g>
              )
            })()}
          </svg>
        </div>
      </div>

      {/* Peso por categoria */}
      <div className="bg-surface-800 rounded-xl border border-surface-500 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-500">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Peso por Categoria</h4>
        </div>
        <div className="divide-y divide-surface-500">
          {catWeights.map(cw => {
            const clr = ABC_COLORS[cw.cls]
            const isFiltered = filterCat === cw.cat
            return (
              <button key={cw.cat} onClick={() => setFilterCat(isFiltered ? null : cw.cat)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-700 ${isFiltered ? 'bg-surface-700' : ''}`}
              >
                <span className={`text-xs font-black w-4 ${clr.text}`}>{cw.cls}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-200 truncate">{cw.cat}</span>
                    <span className={`text-xs font-mono font-bold ml-3 shrink-0 ${clr.text}`}>{cw.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${cw.pct}%`, background: clr.bar }} />
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-xs font-mono text-gray-200">{fmt(cw.receita)}</p>
                  <p className="text-[10px] text-gray-500">{cw.count} prod.</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabela com headers clicáveis */}
      <div className="card p-0 overflow-hidden">
        {hasFilters && (
          <div className="px-4 py-2 bg-surface-800 border-b border-surface-500 flex items-center gap-2 text-xs text-gray-400">
            Filtrando:
            {filterClass && <span className={`font-bold ${ABC_COLORS[filterClass].text}`}>Classe {filterClass}</span>}
            {filterCat   && <span className="text-brand-300">{filterCat}</span>}
            <button onClick={() => { setFilterClass(null); setFilterCat(null) }}
              className="ml-auto flex items-center gap-1 hover:text-gray-200 transition-colors">
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-800">
            <tr className="text-left">
              <th className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">#</th>
              <th className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold">Produto</th>
              <th className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold text-center">ABC</th>
              {([
                ['qtd',       'Qtd'],
                ['precoMedio','Preço Médio'],
                ['margemPct', 'Margem'],
                ['receita',   'Receita'],
              ] as [AbcSortCol, string][]).map(([col, label]) => (
                <th key={col}
                  className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap cursor-pointer hover:text-gray-300 select-none transition-colors"
                  onClick={() => toggleSort(col)}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    {sortCol === col
                      ? sortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-brand-400" /> : <ChevronUp className="w-3 h-3 text-brand-400" />
                      : <ChevronDown className="w-3 h-3 opacity-20" />}
                  </span>
                </th>
              ))}
              <th className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap">% Acum.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-500">
            {tableData.map((p, i) => {
              const precoMedio = p.qtd > 0 ? p.receita / p.qtd : 0
              const custoMedio = p.qtd > 0 ? p.custo  / p.qtd : 0
              const margemPct  = precoMedio > 0 && custoMedio > 0 ? ((precoMedio - custoMedio) / precoMedio) * 100 : null
              const precoSug   = custoMedio > 0 ? custoMedio / (1 - targetPct / 100) : null
              const clr = ABC_COLORS[p.abcClass]
              return (
                <tr key={p.nome} className="hover:bg-surface-700 transition-colors">
                  <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-white max-w-[180px]">
                    <p className="truncate">{p.nome}</p>
                    {p.categoria && <span className="text-[10px] bg-surface-600 text-gray-400 px-1.5 rounded">{p.categoria}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-sm font-black ${clr.text}`}>{p.abcClass}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-300 text-xs font-mono font-semibold">{p.qtd}x</td>
                  <td className="px-4 py-2.5 font-mono text-gray-200 text-xs">
                    {precoMedio > 0 ? (
                      <span>
                        {fmt(precoMedio)}
                        {precoSug !== null && Math.abs(precoSug - precoMedio) >= 0.50 && (
                          <span className={`ml-1 text-[10px] ${precoSug > precoMedio ? 'text-red-400' : 'text-emerald-400'}`}>
                            ({precoSug > precoMedio ? '↑' : '↓'}{fmt(precoSug)})
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {margemPct !== null ? (
                      <span className={`text-xs font-mono font-bold ${margemPct >= targetPct ? 'text-emerald-400' : margemPct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {margemPct.toFixed(0)}%
                      </span>
                    ) : <span className="text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono font-bold text-xs ${clr.text}`}>{fmt(p.receita)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${p.cumPct}%`, background: clr.bar }} />
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">{p.cumPct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="px-4 py-2.5 border-t border-surface-500 flex flex-wrap gap-4 text-[10px] text-gray-500">
          <span><span className="text-emerald-400 font-bold">A</span> = produtos vitais que formam 80% da receita</span>
          <span><span className="text-yellow-400 font-bold">B</span> = importantes · 80–95%</span>
          <span><span className="text-red-400 font-bold">C</span> = periféricos · acima de 95%</span>
          <span className="ml-auto">Clique no cabeçalho para ordenar · clique nas classes/categorias para filtrar</span>
        </div>
      </div>
    </div>
  )
}

// ── Modal com gráfico de evolução ─────────────────────────────────────────────
interface ChartPoint { label: string; value: number }

function KpiChartModal({
  title, points, color, totalLabel, onClose,
  extra,
}: {
  title: string
  points: ChartPoint[]
  color: string
  totalLabel: string
  onClose: () => void
  extra?: React.ReactNode
}) {
  const maxVal = Math.max(...points.map(p => p.value), 1)
  const hasData = points.some(p => p.value > 0)

  const colorMap: Record<string, { bar: string; text: string }> = {
    green:  { bar: '#10b981', text: 'text-emerald-400' },
    red:    { bar: 'rgba(239,68,68,0.7)', text: 'text-red-400' },
    brand:  { bar: '#42B6EE', text: 'text-brand-400' },
    yellow: { bar: '#f59e0b', text: 'text-yellow-400' },
  }
  const { bar: barColor, text: textClass } = colorMap[color] ?? colorMap.brand

  const W = 480, H = 160, PAD = { top: 12, right: 8, bottom: 28, left: 48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const barW   = Math.max(6, chartW / (points.length || 1) - 3)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Total destaque */}
          <p className={`text-3xl font-bold font-mono ${textClass}`}>{totalLabel}</p>

          {/* Gráfico */}
          {hasData ? (
            <div className="bg-surface-900 rounded-xl p-3 overflow-x-auto">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: Math.max(200, points.length * 18) }}>
                {/* Grid lines */}
                {[0.25, 0.5, 0.75, 1].map(f => (
                  <g key={f}>
                    <line
                      x1={PAD.left} y1={PAD.top + chartH * (1 - f)}
                      x2={W - PAD.right} y2={PAD.top + chartH * (1 - f)}
                      stroke="#32323f" strokeWidth="1"
                    />
                    <text x={PAD.left - 4} y={PAD.top + chartH * (1 - f) + 4}
                      textAnchor="end" fontSize="8" fill="#6b7280">
                      {fmtShort(maxVal * f)}
                    </text>
                  </g>
                ))}

                {/* Barras */}
                {points.map((p, i) => {
                  const slotW = chartW / points.length
                  const x     = PAD.left + slotW * i + (slotW - barW) / 2
                  const bH    = p.value > 0 ? Math.max(2, (p.value / maxVal) * chartH) : 0
                  const showLabel = points.length <= 31 || i % Math.ceil(points.length / 12) === 0
                  return (
                    <g key={p.label}>
                      {bH > 0 && (
                        <rect
                          x={x} y={PAD.top + chartH - bH}
                          width={barW} height={bH}
                          fill={barColor} rx="2"
                        />
                      )}
                      {!bH && (
                        <rect x={x + barW * 0.2} y={PAD.top + chartH - 1} width={barW * 0.6} height={1} fill="#32323f" />
                      )}
                      {showLabel && (
                        <text x={x + barW / 2} y={H - 4}
                          textAnchor="middle" fontSize="7" fill={bH > 0 ? '#9ca3af' : '#4b5563'}>
                          {p.label.slice(5)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          ) : (
            <div className="bg-surface-900 rounded-xl p-6 text-center text-gray-500 text-sm">
              Sem dados para o período selecionado
            </div>
          )}

          {/* Extra (breakdown) */}
          {extra}
        </div>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'brand', icon: Icon, onClick, change }: {
  label: string; value: string; sub?: string
  color?: string; icon: React.ElementType
  onClick?: () => void
  change?: number | null
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
    <button
      onClick={onClick}
      className={`card flex flex-col gap-3 text-left w-full transition-all ${
        onClick ? 'hover:border-surface-400 hover:bg-surface-700/50 cursor-pointer active:scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bgs[color]}`}>
          <Icon className={`w-4 h-4 ${colors[color]}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold font-mono ${colors[color] ?? colors.brand}`}>{value}</p>
      {change != null && (
        <div className={`flex items-center gap-1 text-xs font-semibold ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {change >= 0
            ? <TrendingUp  className="w-3 h-3 shrink-0" />
            : <TrendingDown className="w-3 h-3 shrink-0" />}
          <span>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>
          <span className="text-gray-500 font-normal">vs mês ant.</span>
        </div>
      )}
      {sub && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          {sub}
          {onClick && <span className="ml-auto text-[10px] text-gray-400">clique para detalhar</span>}
        </p>
      )}
    </button>
  )
}

// ── Formas de pagamento com filtros ───────────────────────────────────────────
function FormasPagamentoSection({ formas }: { formas: FormaPagamentoTotalDto[] }) {
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [filterForma, setFilterForma] = useState<string>('Todas')
  const [filterMin,   setFilterMin]   = useState('')
  const [filterMax,   setFilterMax]   = useState('')
  const [searchCliente, setSearch]    = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const minVal = parseFloat(filterMin.replace(',', '.')) || 0
  const maxVal = parseFloat(filterMax.replace(',', '.')) || Infinity

  // Filtra formas de pagamento
  const formasFiltradas = formas.filter(f => {
    if (filterForma !== 'Todas' && f.forma !== filterForma) return false
    if (f.total < minVal) return false
    if (f.total > maxVal) return false
    return true
  })

  // Dentro de cada forma, filtra transações
  function filtrarTransacoes(transacoes: FormaPagamentoTotalDto['transacoes']) {
    return transacoes.filter(t => {
      const cliente = (t.cliente ?? '').toLowerCase()
      if (searchCliente && !cliente.includes(searchCliente.toLowerCase())) return false
      if (t.valor < minVal) return false
      if (t.valor > maxVal) return false
      return true
    })
  }

  const hasFilters = filterForma !== 'Todas' || filterMin || filterMax || searchCliente

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header + toggle filtros */}
      <div className="px-5 py-4 border-b border-surface-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-300">Recebimentos por Forma de Pagamento</h3>
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              showFilters || hasFilters
                ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                : 'bg-surface-700 border-surface-500 text-gray-400 hover:text-gray-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtrar
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
          </button>
        </div>

        {/* Painel de filtros — aparece abaixo do header */}
        {showFilters && (
          <div className="mt-4 space-y-3">
            {/* Chips de método */}
            <div className="flex flex-wrap gap-1.5">
              {['Todas', ...formas.map(f => f.forma)].map(forma => (
                <button
                  key={forma}
                  onClick={() => setFilterForma(forma)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    filterForma === forma
                      ? 'bg-brand-600/30 border-brand-500 text-brand-200'
                      : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-500'
                  }`}
                >
                  {forma === 'Todas' ? 'Todas' : (FORMA_LABELS[forma] ?? forma)}
                </button>
              ))}
            </div>

            {/* Faixa de valor + busca */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  className="input pl-8 py-1.5 text-xs w-full sm:w-40"
                  placeholder="Buscar cliente..."
                  value={searchCliente}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <input
                className="input py-1.5 text-xs w-28"
                placeholder="Valor mín. R$"
                value={filterMin}
                onChange={e => setFilterMin(e.target.value)}
                type="number" min="0" step="0.01"
              />
              <span className="text-gray-500 text-xs">até</span>
              <input
                className="input py-1.5 text-xs w-28"
                placeholder="Valor máx. R$"
                value={filterMax}
                onChange={e => setFilterMax(e.target.value)}
                type="number" min="0" step="0.01"
              />
              {hasFilters && (
                <button
                  onClick={() => { setFilterForma('Todas'); setFilterMin(''); setFilterMax(''); setSearch('') }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="divide-y divide-surface-500">
        {formasFiltradas.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">Nenhuma forma de pagamento no filtro.</p>
        ) : (
          formasFiltradas.map(f => {
            const isCard = f.forma === 'CartaoCredito' || f.forma === 'CartaoDebito'
            const isOpen = expanded === f.forma
            const txsFiltradas = filtrarTransacoes(f.transacoes)

            return (
              <div key={f.forma}>
                <button
                  onClick={() => setExpanded(isOpen ? null : f.forma)}
                  className={`w-full flex items-center justify-between px-5 py-3 hover:bg-surface-700 transition-colors text-left ${isCard ? 'bg-purple-500/5' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {FORMA_ICONS[f.forma] ?? <Receipt className="w-4 h-4 text-gray-500" />}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {FORMA_LABELS[f.forma] ?? f.forma}
                        {isCard && <span className="ml-2 text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-semibold">NF</span>}
                      </p>
                      <p className="text-xs text-gray-500">{f.quantidade} transação{f.quantidade !== 1 ? 'ões' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`text-base font-bold font-mono ${isCard ? 'text-purple-300' : 'text-white'}`}>
                      {fmt(f.total)}
                    </p>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="bg-surface-800 border-t border-surface-500 divide-y divide-surface-500">
                    {txsFiltradas.length === 0 ? (
                      <p className="text-center text-gray-500 text-xs py-4">Nenhuma transação no filtro.</p>
                    ) : (
                      txsFiltradas.map((t, i) => {
                        const origemIcon = t.origem === 'Comanda' ? <ShoppingCart className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                          : t.origem === 'Site'      ? <Globe  className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          : t.origem === 'Pré-venda' ? <Trophy className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          : <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        const origemLabel = t.origem === 'Comanda' ? 'Mesa' : t.origem === 'Site' ? 'Site' : t.origem === 'Pré-venda' ? 'Pré-venda' : 'Balcão'
                        return (
                        <div key={i} className="flex items-center justify-between px-6 py-2.5">
                          <div className="flex items-center gap-2">
                            {origemIcon}
                            <div>
                              <p className="text-xs text-white font-medium">
                                {t.cliente ?? origemLabel}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {origemLabel} ·{' '}
                                {new Date(t.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                {t.nota && <span className="ml-1 text-amber-500">{t.nota}</span>}
                              </p>
                            </div>
                          </div>
                          <p className={`text-sm font-bold font-mono ${t.valor < minVal || t.valor > maxVal ? 'text-gray-400' : 'text-white'}`}>
                            {fmt(t.valor)}
                          </p>
                        </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Gráfico SVG de barras (principal) ─────────────────────────────────────────
// ── Modal de detalhe do dia ───────────────────────────────────────────────────
function DayDetailModal({ day, onClose }: {
  day: FinanceiroDto['diaDia'][0]
  onClose: () => void
}) {
  const margem    = day.receita - day.custo
  const margemPct = day.receita > 0 && day.custo > 0 ? (margem / day.receita) * 100 : 0
  const custoPct  = day.receita > 0 && day.custo > 0 ? (day.custo / day.receita) * 100 : 0
  const r = 38, circ = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, custoPct)) / 100) * circ

  const [animated, setAnimated] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setAnimated(true)); return () => cancelAnimationFrame(id) }, [])

  const dayLabel = (() => {
    try {
      return new Date(day.dia + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long',
      })
    } catch { return day.dia }
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-500 bg-gradient-to-r from-brand-600/10 to-transparent flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Resumo do dia</p>
            <h3 className="font-semibold text-white capitalize mt-0.5">{dayLabel}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Donut + valores */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg width="96" height="96" viewBox="0 0 96 96">
                {/* Track */}
                <circle cx="48" cy="48" r={r} fill="none" stroke="#42B6EE"
                  strokeWidth="11" opacity="0.9" />
                {/* Custo overlay */}
                {day.custo > 0 && (
                  <circle cx="48" cy="48" r={r} fill="none"
                    stroke="rgba(239,68,68,0.6)" strokeWidth="11"
                    strokeDasharray={`${animated ? dash : 0} ${circ}`}
                    strokeDashoffset={circ / 4} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                )}
                <text x="48" y="44" textAnchor="middle" fontSize="15" fontWeight="bold" fill="white">
                  {day.custo > 0 ? `${margemPct.toFixed(0)}%` : '—'}
                </text>
                <text x="48" y="58" textAnchor="middle" fontSize="8" fill="#9ca3af">
                  {day.custo > 0 ? 'margem' : 'sem custo'}
                </text>
              </svg>
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Receita</p>
                <p className="text-2xl font-black font-mono text-emerald-400 leading-tight">{fmt(day.receita)}</p>
              </div>
              {day.custo > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Custo</p>
                    <p className="text-sm font-bold font-mono text-red-400">{fmt(day.custo)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Margem</p>
                    <p className={`text-sm font-bold font-mono ${margem >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                      {fmt(margem)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Barra custo vs margem */}
          {day.custo > 0 && (
            <div className="space-y-1.5">
              <div className="h-2.5 bg-surface-700 rounded-full overflow-hidden flex gap-px">
                <div
                  className="h-full bg-brand-500 rounded-l-full"
                  style={{
                    width: animated ? `${margemPct}%` : '0%',
                    transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1) 0.1s',
                  }}
                />
                <div
                  className="h-full bg-red-500/60 rounded-r-full"
                  style={{
                    width: animated ? `${custoPct}%` : '0%',
                    transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1) 0.15s',
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-brand-400 font-semibold">Margem {margemPct.toFixed(1)}%</span>
                <span className="text-red-400 font-semibold">Custo {custoPct.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Mini filtro de período (próximo ao gráfico) ────────────────────────────────
function DateQuickFilter({ preset, onPreset, inicio, fim }: {
  preset: Preset
  onPreset: (p: Preset) => void
  inicio: string
  fim: string
}) {
  const LABELS: Record<Preset, string> = { hoje: 'Hoje', '7d': '7 dias', mes: 'Este mês', custom: 'Personalizado' }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold shrink-0">Período:</span>
      {(['hoje', '7d', 'mes'] as Preset[]).map(p => (
        <button
          key={p}
          onClick={() => onPreset(p)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
            preset === p
              ? 'bg-brand-600/25 border-brand-500/60 text-brand-200'
              : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-500 hover:text-gray-200'
          }`}
        >
          {LABELS[p]}
        </button>
      ))}
      {preset === 'custom' && (
        <span className="text-xs text-gray-500 font-mono bg-surface-700 border border-surface-500 px-2 py-1 rounded-lg">
          {inicio.slice(5).replace('-', '/')} → {fim.slice(5).replace('-', '/')}
        </span>
      )}
      <span className="text-[10px] text-gray-600 ml-auto hidden sm:inline">
        ↑ filtro completo no topo
      </span>
    </div>
  )
}

// ── Gráfico SVG de barras animado ─────────────────────────────────────────────
function BarChart({ dias, onDayClick }: {
  dias: FinanceiroDto['diaDia']
  onDayClick: (d: FinanceiroDto['diaDia'][0]) => void
}) {
  const [hovered, setHovered]   = useState<number | null>(null)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [dias])

  if (dias.length === 0) return null

  const W = 700, H = 180, PAD = { top: 16, right: 8, bottom: 32, left: 56 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom
  const maxVal = Math.max(...dias.map(d => d.receita), 1)
  const barW   = Math.max(8, (chartW / dias.length) - 4)
  const slotPx = chartW / dias.length
  const labelStep = slotPx < 28 ? Math.ceil(28 / slotPx) : 1

  return (
    <div className="card relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-400" /> Receita por dia
        </h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span><span className="inline-block w-3 h-2 rounded-sm bg-brand-500 mr-1.5 align-middle" />Margem</span>
          <span><span className="inline-block w-3 h-2 rounded-sm bg-red-500/50 mr-1.5 align-middle" />Custo</span>
          <span className="text-[10px] text-gray-600 hidden sm:inline">clique para detalhar</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: Math.max(400, dias.length * 28) }}>
          {/* Grid */}
          {[0.25, 0.5, 0.75, 1].map(f => {
            const gy = PAD.top + chartH * (1 - f)
            return (
              <g key={f}>
                <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="#32323f" strokeWidth="1" />
                <text x={PAD.left - 6} y={gy + 4} textAnchor="end" fontSize="9" fill="#6b7280">
                  {fmtShort(maxVal * f)}
                </text>
              </g>
            )
          })}

          {/* Barras */}
          {dias.map((d, i) => {
            const slotW   = chartW / dias.length
            const x       = PAD.left + slotW * i + (slotW - barW) / 2
            const recH    = Math.max(2, (d.receita / maxVal) * chartH)
            const custoH  = d.custo > 0 ? Math.min((d.custo / maxVal) * chartH, recH - 1) : 0
            const margemH = recH - custoH
            const hasData = d.receita > 0
            const isHov   = hovered === i
            const showLabel = i === 0 || i === dias.length - 1 || i % labelStep === 0
            const delay   = `${i * 0.018}s`

            return (
              <g
                key={d.dia}
                onClick={hasData ? () => onDayClick(d) : undefined}
                onMouseEnter={hasData ? () => setHovered(i) : undefined}
                onMouseLeave={hasData ? () => setHovered(null) : undefined}
                className={hasData ? 'cursor-pointer' : ''}
              >
                {/* Hover highlight */}
                {isHov && (
                  <rect
                    x={x - 4} y={PAD.top} width={barW + 8} height={chartH}
                    fill="white" opacity="0.04" rx="4"
                  />
                )}

                {!hasData && (
                  <rect x={x + barW * 0.25} y={PAD.top + chartH - 1} width={barW * 0.5} height={1} fill="#32323f" />
                )}

                {/* Custo (vermelho) */}
                {hasData && custoH > 0 && (
                  <rect
                    x={x} y={PAD.top + chartH - recH}
                    width={barW} height={custoH}
                    fill={isHov ? 'rgba(239,68,68,0.75)' : 'rgba(239,68,68,0.5)'}
                    rx="2"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'bottom',
                      transform: mounted ? 'scaleY(1)' : 'scaleY(0)',
                      transition: `transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay}`,
                    }}
                  />
                )}

                {/* Margem (brand azul) */}
                {hasData && (
                  <rect
                    x={x} y={PAD.top + chartH - recH + custoH}
                    width={barW} height={margemH}
                    fill={isHov ? '#64c8f5' : '#42B6EE'}
                    rx="2"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'bottom',
                      transform: mounted ? 'scaleY(1)' : 'scaleY(0)',
                      transition: `transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay}`,
                      filter: isHov ? 'drop-shadow(0 0 4px rgba(66,182,238,0.5))' : undefined,
                    }}
                  />
                )}

                {/* Label de data */}
                {showLabel && (
                  <text
                    x={x + barW / 2} y={H - 4}
                    textAnchor="middle" fontSize="8"
                    fill={isHov ? '#d1d5db' : hasData ? '#9ca3af' : '#4b5563'}
                  >
                    {d.dia.slice(5)}
                  </text>
                )}

                {/* Tooltip inline ao hover */}
                {isHov && hasData && (() => {
                  const boxH = d.custo > 0 ? 30 : 20
                  const rawTy = PAD.top + chartH - recH - 8
                  const ty    = Math.max(PAD.top + boxH + 2, rawTy)
                  const tx    = Math.min(Math.max(x + barW / 2, PAD.left + 54), W - PAD.right - 54)
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={tx - 54} y={ty - boxH} width="108" height={boxH} rx="5"
                        fill="#1e1e2e" stroke="#3f3f52" strokeWidth="1" opacity="0.97" />
                      <text x={tx} y={ty - boxH + 12} textAnchor="middle" fontSize="8.5" fill="#10b981" fontWeight="bold">
                        {fmt(d.receita)}
                      </text>
                      {d.custo > 0 && (
                        <text x={tx} y={ty - boxH + 24} textAnchor="middle" fontSize="7.5" fill="#9ca3af">
                          custo {fmt(d.custo)} · {((d.receita - d.custo) / d.receita * 100).toFixed(0)}% margem
                        </text>
                      )}
                    </g>
                  )
                })()}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Gráfico de pizza para análise de 1 dia ────────────────────────────────────
const FORMA_CORES: Record<string, string> = {
  Dinheiro:      '#10b981',
  Pix:           '#42B6EE',
  CartaoCredito: '#a855f7',
  CartaoDebito:  '#3b82f6',
  Crediario:     '#f59e0b',
  Pontos:        '#eab308',
  Cashback:      '#ec4899',
}

function DayPieChart({ formas, receita, custo, date }: {
  formas: FormaPagamentoTotalDto[]
  receita: number
  custo: number
  date: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = formas.reduce((s, f) => s + f.total, 0)
  if (total === 0) return null

  const cx = 100, cy = 100, r = 78, innerR = 42

  function polarXY(angleDeg: number, radius: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  function arcPath(sa: number, ea: number, outerR: number) {
    const p1 = polarXY(sa, outerR), p2 = polarXY(ea, outerR)
    const p3 = polarXY(ea, innerR), p4 = polarXY(sa, innerR)
    const large = ea - sa > 180 ? 1 : 0
    return `M ${p1.x} ${p1.y} A ${outerR} ${outerR} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${innerR} ${innerR} 0 ${large} 0 ${p4.x} ${p4.y} Z`
  }

  let angle = 0
  const slices = formas.filter(f => f.total > 0).map(f => {
    const pct = f.total / total
    const sa  = angle, ea = angle + pct * 360
    angle = ea
    return { ...f, pct, sa, ea }
  })

  const hoveredForma = slices.find(s => s.forma === hovered)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-400" /> Receita do dia · {date.slice(5).replace('-', '/')}
        </h3>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="shrink-0">
          <svg width="200" height="200" viewBox="0 0 200 200">
            {slices.map(s => {
              const isHov  = hovered === s.forma
              const outerR = isHov ? r + 7 : r
              const color  = FORMA_CORES[s.forma] ?? '#6b7280'
              // Quando o slice é 100% o arco SVG degenera (ponto inicial = final).
              // Nesse caso renderiza dois semicírculos para formar o anel completo.
              const isFull = s.ea - s.sa >= 359.99
              return isFull ? (
                <g key={s.forma}
                  onMouseEnter={() => setHovered(s.forma)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                >
                  <path d={arcPath(s.sa, s.sa + 179.99, outerR)} fill={color}
                    opacity={hovered && !isHov ? 0.4 : 1}
                    style={{ filter: isHov ? 'brightness(1.15)' : undefined }} />
                  <path d={arcPath(s.sa + 180, s.sa + 359.99, outerR)} fill={color}
                    opacity={hovered && !isHov ? 0.4 : 1}
                    style={{ filter: isHov ? 'brightness(1.15)' : undefined }} />
                </g>
              ) : (
                <path
                  key={s.forma}
                  d={arcPath(s.sa, s.ea, outerR)}
                  fill={color}
                  opacity={hovered && !isHov ? 0.4 : 1}
                  onMouseEnter={() => setHovered(s.forma)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer transition-all duration-150"
                  style={{ filter: isHov ? 'brightness(1.15)' : undefined }}
                />
              )
            })}
            <text x={cx} y={cy - 10} textAnchor="middle" fontSize="9" fill="#9ca3af">
              {hoveredForma ? (FORMA_LABELS[hoveredForma.forma] ?? hoveredForma.forma) : 'Total'}
            </text>
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">
              {hoveredForma ? fmt(hoveredForma.total) : fmt(receita)}
            </text>
            {hoveredForma && (
              <text x={cx} y={cy + 20} textAnchor="middle" fontSize="9" fill="#9ca3af">
                {(hoveredForma.pct * 100).toFixed(1)}%
              </text>
            )}
          </svg>
        </div>
        <div className="flex-1 space-y-1 min-w-0 w-full">
          {slices.map(s => {
            const color = FORMA_CORES[s.forma] ?? '#6b7280'
            return (
              <div
                key={s.forma}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors cursor-default ${hovered === s.forma ? 'bg-surface-700' : 'hover:bg-surface-700/50'}`}
                onMouseEnter={() => setHovered(s.forma)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-gray-300 truncate">{FORMA_LABELS[s.forma] ?? s.forma}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500">{s.quantidade}×</span>
                  <span className="text-xs font-mono font-bold text-white">{fmt(s.total)}</span>
                  <span className="text-xs text-gray-500 w-10 text-right">{(s.pct * 100).toFixed(1)}%</span>
                </div>
              </div>
            )
          })}
          {custo > 0 && (
            <div className="mt-2 pt-2 border-t border-surface-500 flex items-center justify-between px-3">
              <span className="text-xs text-gray-500">Margem estimada</span>
              <span className={`text-xs font-mono font-bold ${receita > custo ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(receita - custo)} · {receita > 0 ? (((receita - custo) / receita) * 100).toFixed(1) : 0}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Donut custo vs receita ─────────────────────────────────────────────────────
function MargemDonut({ receita, custo }: { receita: number; custo: number }) {
  if (receita <= 0) return null
  const pct  = Math.min(100, custo > 0 ? (custo / receita) * 100 : 0)
  const r    = 42, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="card flex flex-col items-center justify-center gap-3 py-6">
      <h3 className="text-sm font-semibold text-gray-300 self-start">Custo vs Receita</h3>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#42B6EE" strokeWidth="14" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="14"
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
        <text x="60" y="56" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">{(100 - pct).toFixed(0)}%</text>
        <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#9ca3af">margem</text>
      </svg>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-brand-400"><span className="w-2.5 h-2.5 rounded-full bg-brand-500" />Margem {(100 - pct).toFixed(1)}%</span>
        <span className="flex items-center gap-1.5 text-red-400"><span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />Custo {pct.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// ── Preset de período ──────────────────────────────────────────────────────────
type Preset = 'hoje' | '7d' | 'mes' | 'custom'

function getRange(preset: Preset) {
  const now = new Date(), hoje = toDateInput(now)
  if (preset === 'hoje') return { inicio: hoje, fim: hoje }
  if (preset === '7d') {
    const ini = new Date(now); ini.setDate(ini.getDate() - 6)
    return { inicio: toDateInput(ini), fim: hoje }
  }
  const ini = new Date(now.getFullYear(), now.getMonth(), 1)
  return { inicio: toDateInput(ini), fim: hoje }
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const [preset,    setPreset]    = useState<Preset>('mes')
  const [inicio,    setInicio]    = useState(getRange('mes').inicio)
  const [fim,       setFim]       = useState(getRange('mes').fim)
  const [data,      setData]      = useState<FinanceiroDto | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [exporting,   setExporting]   = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [kpiModal,   setKpiModal]   = useState<string | null>(null)
  const [targetPct,  setTargetPct]  = useState(40)
  const [tableView,  setTableView]  = useState<'simples' | 'analise' | 'abc'>('analise')
  const [prevData,   setPrevData]   = useState<FinanceiroDto | null>(null)
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('')
  const [topOrigemFilter, setTopOrigemFilter] = useState<'Todos' | 'Comanda' | 'PDV' | 'Site' | 'PréVenda'>('Todos')
  const [topCatFilter, setTopCatFilter] = useState<string | null>(null)
  const [metaManualInput, setMetaManualInput] = useState('')
  const [dayModal,  setDayModal]  = useState<FinanceiroDto['diaDia'][0] | null>(null)
  // Extrato: de onde veio cada real do período (e o que foi estornado). Carrega só
  // quando o painel é aberto — é a consulta mais pesada da tela.
  const [extrato,        setExtrato]        = useState<ExtratoDto | null>(null)
  const [extratoOpen,    setExtratoOpen]    = useState(false)
  const [extratoLoading, setExtratoLoading] = useState(false)
  const [extratoTipo,    setExtratoTipo]    = useState<'todos' | ExtratoLinhaDto['tipo']>('todos')
  const iniRef    = useRef(inicio)
  const fimRef    = useRef(fim)
  const loadIdRef = useRef(0)

  const loadPrevMonth = useCallback(async (currentIni: string) => {
    const iniDate     = new Date(currentIni + 'T12:00:00')
    const prevFimDate = new Date(iniDate.getFullYear(), iniDate.getMonth(), 0)
    const prevIniDate = new Date(prevFimDate.getFullYear(), prevFimDate.getMonth(), 1)
    try {
      const res = await analyticsApi.financeiro(toDateInput(prevIniDate), toDateInput(prevFimDate))
      setPrevData(res.data)
    } catch { setPrevData(null) }
  }, [])

  const load = useCallback(async (ini: string, f: string, pmFilter?: string) => {
    const id = ++loadIdRef.current
    setLoading(true)
    try {
      const res = await analyticsApi.financeiro(ini, f, pmFilter || undefined)
      if (id === loadIdRef.current) setData(res.data)
    } catch {
      if (id === loadIdRef.current) toast.error('Erro ao carregar dados financeiros')
    } finally {
      if (id === loadIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load(inicio, fim); loadPrevMonth(inicio) }, []) // eslint-disable-line

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      const { inicio: ini, fim: f } = getRange(p)
      setInicio(ini); setFim(f)
      iniRef.current = ini; fimRef.current = f
      load(ini, f, filterPaymentMethod)
      if (p === 'mes') loadPrevMonth(ini)
      else setPrevData(null)
    }
  }

  function applyCustom() {
    setPreset('custom')
    load(inicio, fim, filterPaymentMethod)
  }

  const d = data

  // ── Projeção do mês ───────────────────────────────────────────────────────
  const hoje = new Date()
  const diasNoMes      = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const diaAtual       = hoje.getDate()
  const diasRestantes  = diasNoMes - diaAtual
  const mediaDiaria    = d && d.diaDia.length > 0 ? d.receita / d.diaDia.length : 0
  const projecaoMes    = d ? d.receita + mediaDiaria * diasRestantes : 0

  // ── Dados dos modais de KPI ────────────────────────────────────────────────
  const totalTx = d ? d.pagamentosPorForma.reduce((s, f) => s + f.quantidade, 0) : 0
  const ticketMedio = totalTx > 0 && d ? d.receita / totalTx : 0

  // ── Meta de faturamento ───────────────────────────────────────────────────
  const metaAuto    = d && d.custo > 0 ? Math.round(d.custo / (1 - targetPct / 100) * 100) / 100 : 0
  const metaFinal   = metaManualInput ? (parseFloat(metaManualInput.replace(',', '.')) || 0) : metaAuto
  const metaPct     = metaFinal > 0 && d ? Math.min(100, (d.receita / metaFinal) * 100) : 0

  // ── Top Produtos filtrados ────────────────────────────────────────────────
  const topCats = useMemo(() => {
    if (!d) return [] as string[]
    return [...new Set(d.topProdutos.map(p => p.categoria).filter(Boolean))] as string[]
  }, [d])

  const topFiltered = useMemo((): typeof d extends null ? [] : NonNullable<typeof d>['topProdutos'] => {
    if (!d) return []
    return d.topProdutos.filter(p => {
      if (topOrigemFilter === 'Comanda'  && p.receitaComandas === 0 && p.qtdComandas === 0) return false
      if (topOrigemFilter === 'PDV'      && p.receitaAvulsa   === 0 && p.qtdAvulsa   === 0) return false
      if (topOrigemFilter === 'Site'     && p.receitaSite     === 0 && p.qtdSite     === 0) return false
      if (topOrigemFilter === 'PréVenda' && p.receitaPreVenda === 0 && p.qtdPreVenda === 0) return false
      if (topCatFilter && p.categoria !== topCatFilter) return false
      return true
    })
  }, [d, topOrigemFilter, topCatFilter])

  // Recebimentos de crediário agrupados por dia, alinhados com os mesmos dias do
  // `diaDia` pra o eixo X bater com os outros gráficos (dia sem pagamento entra zerado).
  // O gráfico do modal de crediário recebia `points: []` fixo desde que foi escrito —
  // por isso mostrava "Sem dados" mesmo com dezenas de pagamentos listados logo abaixo.
  const crediarioPorDia = useMemo<ChartPoint[]>(() => {
    if (!d) return []
    const porDia = new Map<string, number>()
    for (const p of d.pagamentosCrediarioPeriodo) {
      const k = toDateInput(new Date(p.createdAt))
      porDia.set(k, (porDia.get(k) ?? 0) + p.valorEmReais)
    }
    return d.diaDia.map(x => ({ label: x.dia, value: porDia.get(x.dia) ?? 0 }))
  }, [d])

  const kpiModais: Record<string, {
    title: string; color: string; totalLabel: string
    points: ChartPoint[]; extra?: React.ReactNode
  }> = d ? {
    receita: {
      title: 'Receita Total — Evolução Diária',
      color: 'green',
      totalLabel: fmt(d.receita),
      points: d.diaDia.map(x => ({ label: x.dia, value: x.receita })),
    },
    custo: {
      title: 'Custo Estimado — Evolução Diária',
      color: 'red',
      totalLabel: fmt(d.custo),
      points: d.diaDia.map(x => ({ label: x.dia, value: x.custo })),
      extra: d.topProdutos.filter(p => p.custo > 0).length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Top custos por produto</p>
          {d.topProdutos.filter(p => p.custo > 0).slice(0, 6).map(p => (
            <div key={p.nome} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{p.nome}</p>
                <div className="h-1 bg-surface-600 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-red-500/60 rounded-full"
                    style={{ width: `${Math.min(100, (p.custo / (d.topProdutos[0]?.custo || 1)) * 100)}%` }} />
                </div>
              </div>
              <span className="text-xs font-mono text-red-400 shrink-0">{fmt(p.custo)}</span>
            </div>
          ))}
        </div>
      ) : undefined,
    },
    margem: {
      title: 'Margem Bruta — Evolução Diária',
      color: d.margem >= 0 ? 'brand' : 'red',
      totalLabel: `${fmt(d.margem)} (${d.margemPercent.toFixed(1)}%)`,
      points: d.diaDia.map(x => ({ label: x.dia, value: Math.max(0, x.receita - x.custo) })),
    },
    ticket: {
      title: 'Ticket Médio — Distribuição por Pagamento',
      color: 'brand',
      totalLabel: fmt(ticketMedio),
      points: d.diaDia.map(x => ({ label: x.dia, value: x.receita })),
      extra: (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{totalTx} transações no período</p>
          {d.pagamentosPorForma.slice(0, 5).map(f => (
            <div key={f.forma} className="flex items-center justify-between text-xs">
              <span className="text-gray-300">{FORMA_LABELS[f.forma] ?? f.forma}</span>
              <span className="font-mono text-white">{f.quantidade}× · {fmt(f.total)}</span>
            </div>
          ))}
        </div>
      ),
    },
    crediarios: {
      title: 'Crediário — Recebimentos no Período',
      color: 'yellow',
      totalLabel: d.recebidoCrediario > 0 ? fmt(d.recebidoCrediario) : 'R$ 0,00',
      points: crediarioPorDia,
      extra: (
        <div className="space-y-3">
          {/* Concedido × recebido no período — os dois lados da conta. O saldo em aberto
              é acumulado (ignora o filtro de período), por isso fica separado. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-900 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Concedido no período</p>
              <p className="text-sm font-bold font-mono text-red-400">{fmt(d.abertoCrediario)}</p>
              <p className="text-[10px] text-gray-600">
                {d.aberturasCrediarioPeriodo.length} abertura{d.aberturasCrediarioPeriodo.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-surface-900 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Recebido no período</p>
              <p className="text-sm font-bold font-mono text-emerald-400">{fmt(d.recebidoCrediario)}</p>
              <p className="text-[10px] text-gray-600">
                {d.pagamentosCrediarioPeriodo.length} pagamento{d.pagamentosCrediarioPeriodo.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Saldo em aberto */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs text-amber-300">Saldo total em aberto <span className="text-amber-500/70">(acumulado)</span></span>
            <span className="text-sm font-bold font-mono text-amber-400">{fmt(d.crediarios)}</span>
          </div>

          {/* Aberturas no período */}
          {d.aberturasCrediarioPeriodo.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                Crediários abertos no período
              </p>
              {d.aberturasCrediarioPeriodo.map((a: AberturaCrediarioPeriodoDto, i: number) => (
                <div key={i} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{a.clienteNome}</p>
                    <p className="text-gray-500">
                      {new Date(a.dataAbertura).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {a.vencido
                        ? <span className="ml-1 text-red-400">vencido</span>
                        : a.status === 'Pago' && <span className="ml-1 text-emerald-500">pago</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-bold font-mono text-red-400">{fmt(a.valorEmReais)}</p>
                    {a.saldoRestante > 0 && a.saldoRestante !== a.valorEmReais && (
                      <p className="text-[10px] text-amber-400">resta {fmt(a.saldoRestante)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Lista de pagamentos no período */}
          {d.pagamentosCrediarioPeriodo.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">Nenhum pagamento de crediário neste período.</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                {d.pagamentosCrediarioPeriodo.length} pagamento{d.pagamentosCrediarioPeriodo.length !== 1 ? 's' : ''} recebido{d.pagamentosCrediarioPeriodo.length !== 1 ? 's' : ''}
              </p>
              {d.pagamentosCrediarioPeriodo.map((p: PagamentoCrediarioPeriodoDto, i: number) => (
                <div key={i} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{p.clienteNome}</p>
                    <p className="text-gray-500">
                      {p.formaPagamento} · {new Date(p.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {p.observacao && <span className="ml-1 text-amber-500">{p.observacao}</span>}
                    </p>
                  </div>
                  <span className="font-bold font-mono text-emerald-400 shrink-0 ml-3">{fmt(p.valorEmReais)}</span>
                </div>
              ))}
            </div>
          )}
          <a href="/admin/crediario" className="block text-center text-xs text-brand-400 hover:text-brand-300 transition-colors">
            Gerenciar crediários →
          </a>
        </div>
      ),
    },
  } : {}

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 print:p-0">

      {/* Modal KPI */}
      {kpiModal && kpiModais[kpiModal] && (
        <KpiChartModal {...kpiModais[kpiModal]} onClose={() => setKpiModal(null)} />
      )}

      {/* Modal de detalhe do dia */}
      {dayModal && <DayDetailModal day={dayModal} onClose={() => setDayModal(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white">Controle Financeiro</h1>
          <p className="text-gray-400 text-sm mt-0.5">Receita, custo e margem do período</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!d) return
              setExporting(true)
              try { await gerarRelatorioPDF(d, { inicio, fim }) }
              catch { toast.error('Erro ao gerar PDF') }
              finally { setExporting(false) }
            }}
            disabled={!d || exporting}
            className="btn-secondary text-sm print:hidden"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? 'Gerando...' : 'Exportar PDF'}</span>
          </button>
          <button
            onClick={async () => {
              if (backfilling) return
              setBackfilling(true)
              try {
                const r = await vendaAvulsaApi.backfillCosts()
                toast.success(r.data.mensagem)
                load(inicio, fim)
              } catch {
                toast.error('Erro ao corrigir custos históricos')
              } finally {
                setBackfilling(false)
              }
            }}
            disabled={backfilling}
            title="Preenche custo zero em vendas avulsas antigas usando o custo atual dos produtos"
            className="btn-secondary text-sm print:hidden"
          >
            <RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{backfilling ? 'Corrigindo...' : 'Corrigir custos'}</span>
          </button>
          <button onClick={() => load(inicio, fim, filterPaymentMethod)} disabled={loading} className="btn-secondary text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Filtros ── sticky no topo */}
      <div className="sticky top-0 z-10 print:hidden">
        <div className="card flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center border-surface-500 shadow-xl overflow-hidden">
          {/* Presets */}
          <div className="flex gap-1.5 flex-wrap">
            {(['hoje', '7d', 'mes', 'custom'] as Preset[]).map(p => (
              <button key={p} onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  preset === p ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'bg-surface-700 text-gray-400 hover:text-white hover:bg-surface-500'
                }`}
              >
                {{ hoje: 'Hoje', '7d': '7 dias', mes: 'Este mês', custom: 'Personalizado' }[p]}
              </button>
            ))}
          </div>

          {/* Filtro de forma de pagamento */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {['', 'Pix', 'Dinheiro', 'CartaoCredito', 'CartaoDebito', 'Crediario'].map(pm => (
              <button
                key={pm || 'all'}
                onClick={() => {
                  setFilterPaymentMethod(pm)
                  load(inicio, fim, pm)
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  filterPaymentMethod === pm
                    ? 'bg-brand-600/30 border-brand-500 text-brand-200'
                    : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-500 hover:text-gray-200'
                }`}
              >
                {pm ? FORMA_ICONS[pm] : null}
                {pm ? (FORMA_LABELS[pm] ?? pm) : 'Todos'}
              </button>
            ))}
          </div>

          {/* Período atual */}
          {preset !== 'custom' && (
            <span className="text-xs text-gray-500 ml-1">
              {inicio === fim ? inicio : `${inicio} → ${fim}`}
            </span>
          )}

          {/* Custom inline — sem scroll */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" className="input py-1.5 text-sm w-full sm:w-36"
                value={inicio} max={fim}
                onChange={e => setInicio(e.target.value)} />
              <span className="text-gray-500 text-sm">até</span>
              <input type="date" className="input py-1.5 text-sm w-full sm:w-36"
                value={fim} min={inicio} max={toDateInput(new Date())}
                onChange={e => setFim(e.target.value)} />
              <button
                onClick={applyCustom}
                disabled={loading}
                className="btn-primary text-sm py-1.5 min-w-[90px]"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Carregando…' : 'Aplicar'}
              </button>
            </div>
          )}

          {/* Loading indicator inline */}
          {loading && preset !== 'custom' && (
            <RefreshCw className="w-4 h-4 animate-spin text-brand-400 ml-auto" />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : d ? (
        <>
          {/* KPIs — clicáveis */}
          {(() => {
            function pctChange(cur: number, prev: number): number | null {
              if (!prevData || prev === 0) return null
              return ((cur - prev) / prev) * 100
            }
            const prevTx = prevData ? prevData.pagamentosPorForma.reduce((s, f) => s + f.quantidade, 0) : 0
            const prevTicket = prevTx > 0 && prevData ? prevData.receita / prevTx : 0
            return (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard label="Receita total"      value={fmt(d.receita)}     sub={`${d.diaDia.length} dias`}                      color="green"  icon={TrendingUp}   onClick={() => setKpiModal('receita')}    change={pctChange(d.receita,    prevData?.receita    ?? 0)} />
                <KpiCard label="Custo estimado"     value={fmt(d.custo)}       sub="Clique para detalhar por produto"               color="red"    icon={ShoppingBag}  onClick={() => setKpiModal('custo')}      change={pctChange(d.custo,      prevData?.custo      ?? 0)} />
                <KpiCard label="Margem média"        value={`${d.margemPercent.toFixed(1)}%`} sub={`${fmt(d.margem)} sobre custo`} color={d.margem >= 0 ? 'brand' : 'red'} icon={d.margem >= 0 ? TrendingUp : TrendingDown} onClick={() => setKpiModal('margem')} change={pctChange(d.margemPercent, prevData?.margemPercent ?? 0)} />
                <KpiCard label="Ticket médio"       value={fmt(ticketMedio)}   sub={`${totalTx} transação${totalTx !== 1 ? 'ões' : ''}`}  color="brand"  icon={CreditCard}   onClick={() => setKpiModal('ticket')}     change={pctChange(ticketMedio,  prevTicket)} />
                <KpiCard label="Crediários abertos" value={fmt(d.crediarios)}  sub={d.recebidoCrediario > 0 ? `Recebido no período: ${fmt(d.recebidoCrediario)}` : 'A receber · clique para detalhar'} color="yellow" icon={AlertCircle}  onClick={() => setKpiModal('crediarios')} change={pctChange(d.crediarios, prevData?.crediarios ?? 0)} />
              </div>
            )
          })()}

          {/* Breakdown Comandas vs PDV vs Site vs Pré-venda */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-600/15 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5 text-brand-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Comandas (mesas)</p>
                <p className="text-xl font-bold font-mono text-brand-400">{fmt(d.receitaComandas)}</p>
                {d.receita > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{((d.receitaComandas / d.receita) * 100).toFixed(1)}% do total</p>
                )}
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Venda Avulsa (balcão)</p>
                <p className="text-xl font-bold font-mono text-emerald-400">{fmt(d.receitaAvulsa)}</p>
                {d.receita > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{((d.receitaAvulsa / d.receita) * 100).toFixed(1)}% do total</p>
                )}
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Venda pelo site</p>
                <p className="text-xl font-bold font-mono text-blue-400">{fmt(d.receitaSite)}</p>
                {d.receita > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{((d.receitaSite / d.receita) * 100).toFixed(1)}% do total</p>
                )}
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Pré-venda (site)</p>
                <p className="text-xl font-bold font-mono text-amber-400">{fmt(d.receitaPreVenda)}</p>
                {d.receita > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{((d.receitaPreVenda / d.receita) * 100).toFixed(1)}% do total</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Extrato: de onde veio cada real ──────────────────────────── */}
          <div className="card p-0 overflow-hidden">
            <button
              onClick={async () => {
                const abrindo = !extratoOpen
                setExtratoOpen(abrindo)
                if (abrindo && !extratoLoading) {
                  setExtratoLoading(true)
                  try {
                    const res = await analyticsApi.extrato(inicio, fim)
                    setExtrato(res.data)
                  } catch { toast.error('Erro ao carregar o extrato') }
                  finally { setExtratoLoading(false) }
                }
              }}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-700/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="w-4 h-4 text-brand-400 shrink-0" />
                <div className="text-left min-w-0">
                  <p className="font-bold text-white text-sm">Extrato do período</p>
                  <p className="text-xs text-gray-500">
                    Cada entrada com a origem — e o que foi estornado
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {extrato && (
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold font-mono text-accent-green">{fmt(extrato.totalEmReais)}</p>
                    {extrato.totalEstornado > 0 && (
                      <p className="text-[11px] text-red-400">−{fmt(extrato.totalEstornado)} estornado</p>
                    )}
                  </div>
                )}
                {extratoLoading
                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  : extratoOpen
                    ? <ChevronUp className="w-4 h-4 text-gray-500" />
                    : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </div>
            </button>

            {extratoOpen && extrato && (
              <div className="border-t border-surface-500">
                <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-surface-500">
                  {([
                    ['todos',               'Tudo'],
                    ['venda_balcao',        'Balcão'],
                    ['comanda',             'Comanda'],
                    ['site',                'Site'],
                    ['pre_venda',           'Pré-venda'],
                    ['pagamento_crediario', 'Crediário'],
                  ] as const).map(([valor, label]) => (
                    <button
                      key={valor}
                      onClick={() => setExtratoTipo(valor)}
                      className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                        extratoTipo === valor
                          ? 'bg-brand-600/20 border-brand-500/60 text-brand-300'
                          : 'bg-surface-700 border-surface-500 text-gray-400 hover:text-white')}
                    >{label}</button>
                  ))}
                </div>

                <div className="max-h-[28rem] overflow-y-auto divide-y divide-surface-700">
                  {extrato.linhas
                    .filter(l => extratoTipo === 'todos' || l.tipo === extratoTipo)
                    .map(l => (
                      <div key={`${l.tipo}-${l.id}`} className="px-5 py-2.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={clsx('text-sm', l.estornada ? 'text-gray-500 line-through' : 'text-white')}>
                            {l.descricao}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {new Date(l.data).toLocaleString('pt-BR', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                            {l.cliente && ` · ${l.cliente}`}
                            {l.formaPagamento && ` · ${l.formaPagamento}`}
                            {l.lancadoPor && ` · por ${l.lancadoPor}`}
                          </p>
                          {l.estornada && (
                            <p className="text-[11px] text-red-400 mt-0.5">
                              Estornado{l.motivoEstorno ? `: ${l.motivoEstorno}` : ''}
                            </p>
                          )}
                        </div>
                        <span className={clsx('font-mono text-sm shrink-0',
                          l.estornada ? 'text-gray-600 line-through' : 'text-accent-green')}>
                          {fmt(l.valorEmReais)}
                        </span>
                      </div>
                    ))}
                  {extrato.linhas.length === 0 && (
                    <p className="px-5 py-6 text-center text-xs text-gray-500">
                      Nenhuma entrada no período.
                    </p>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-surface-500 flex items-center justify-between text-xs">
                  <span className="text-gray-500">{extrato.lancamentos} lançamento(s) no período</span>
                  <span className="text-gray-300">
                    Entrou: <strong className="text-accent-green font-mono">{fmt(extrato.totalEmReais)}</strong>
                    {extrato.totalEstornado > 0 && (
                      <> · estornado: <strong className="text-red-400 font-mono">{fmt(extrato.totalEstornado)}</strong></>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── DRE ─────────────────────────────────────────────────────── */}
          {d.receita > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-500 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-400" />
                  <h3 className="text-sm font-semibold text-gray-300">DRE — Demonstração do Resultado</h3>
                </div>
                <span className="text-[11px] text-gray-500">{inicio === fim ? inicio : `${inicio} → ${fim}`}</span>
              </div>

              <div className="p-5 space-y-0">
                {/* Receita Bruta */}
                <div className="flex items-center justify-between py-2.5 border-b border-surface-500">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Receita Bruta</p>
                    <div className="flex gap-4 mt-1">
                      <span className="text-xs text-gray-500">Comandas: <span className="text-gray-300">{fmt(d.receitaComandas)}</span></span>
                      <span className="text-xs text-gray-500">Avulsas: <span className="text-gray-300">{fmt(d.receitaAvulsa)}</span></span>
                      <span className="text-xs text-gray-500">Site: <span className="text-gray-300">{fmt(d.receitaSite)}</span></span>
                      <span className="text-xs text-gray-500">Pré-venda: <span className="text-gray-300">{fmt(d.receitaPreVenda)}</span></span>
                    </div>
                  </div>
                  <span className="text-emerald-400 font-bold font-mono text-lg">{fmt(d.receita)}</span>
                </div>

                {/* CMV */}
                {d.custo > 0 ? (
                  <>
                    <div className="flex items-center justify-between py-2.5 border-b border-surface-500">
                      <p className="text-sm text-gray-400">(−) CMV — Custo das Mercadorias Vendidas</p>
                      <span className="text-red-400 font-mono">({fmt(d.custo)})</span>
                    </div>

                    {/* Lucro Bruto */}
                    <div className="flex items-center justify-between py-3 border-b-2 border-surface-400">
                      <p className="text-base font-black text-white">LUCRO BRUTO</p>
                      <div className="text-right">
                        <span className={`font-black font-mono text-xl ${d.margem >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                          {fmt(d.margem)}
                        </span>
                        <span className="text-xs text-gray-500 ml-2 font-mono">({d.margemPercent.toFixed(1)}%)</span>
                      </div>
                    </div>

                    {/* Crediários */}
                    {d.crediarios > 0 && (
                      <>
                        <div className="flex items-center justify-between py-2.5 border-b border-surface-500">
                          <p className="text-sm text-gray-400">(−) Crediários em Aberto</p>
                          <span className="text-amber-400 font-mono">({fmt(d.crediarios)})</span>
                        </div>
                        <div className="flex items-center justify-between py-2.5 border-b border-surface-500">
                          <p className="text-sm text-gray-300">Resultado Estimado</p>
                          <span className={`font-semibold font-mono ${d.margem - d.crediarios >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmt(d.margem - d.crediarios)}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Projeção */}
                    {diasRestantes > 0 && mediaDiaria > 0 && preset === 'mes' && (
                      <div className="flex items-center justify-between py-3 mt-1 rounded-xl bg-brand-500/8 px-4 -mx-0">
                        <div>
                          <p className="text-xs font-semibold text-brand-300">📈 Projeção para o mês completo</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {diasRestantes} dias restantes · média {fmt(mediaDiaria)}/dia
                          </p>
                        </div>
                        <span className="font-black font-mono text-brand-400 text-lg">{fmt(projecaoMes)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="py-3 text-xs text-yellow-400/80">
                    Cadastre o preço de custo nos produtos para ver Lucro Bruto e CMV.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Meta de Faturamento ─────────────────────────────────────────── */}
          {d.receita > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-500 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-gray-300">Meta de Faturamento</h3>
                </div>
                {/* Seletor margem alvo */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Margem alvo:</span>
                  {[30, 40, 50, 60].map(pct => (
                    <button key={pct} onClick={() => setTargetPct(pct)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                        targetPct === pct
                          ? 'bg-brand-500/20 border-brand-500/60 text-brand-300'
                          : 'bg-surface-700 border-surface-500 text-gray-400 hover:text-gray-200'
                      }`}>
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Meta automática */}
                  <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Meta Automática</p>
                    <p className="text-lg font-bold font-mono text-brand-400">{metaAuto > 0 ? fmt(metaAuto) : '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-1">Custo ÷ (1 − {targetPct}%) · baseada no CMV do período</p>
                  </div>
                  {/* Meta manual */}
                  <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Meta Manual</p>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">R$</span>
                      <input
                        className="input py-1 text-sm font-mono flex-1 min-w-0"
                        placeholder="Ex: 10000"
                        value={metaManualInput}
                        onChange={e => setMetaManualInput(e.target.value)}
                        type="number" min="0" step="0.01"
                      />
                      {metaManualInput && (
                        <button onClick={() => setMetaManualInput('')} className="text-gray-500 hover:text-gray-300 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      {metaManualInput ? 'Meta manual ativa' : 'Vazio = usa meta automática'}
                    </p>
                  </div>
                  {/* Realizado */}
                  <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Realizado</p>
                    <p className={`text-lg font-bold font-mono ${metaPct >= 100 ? 'text-emerald-400' : metaPct >= 75 ? 'text-brand-400' : metaPct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {fmt(d.receita)}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Falta {metaFinal > d.receita ? fmt(metaFinal - d.receita) : 'Meta atingida!'}
                    </p>
                  </div>
                </div>

                {/* Barra de progresso */}
                {metaFinal > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Progresso em direção à meta de {fmt(metaFinal)}</span>
                      <span className={`font-bold font-mono ${metaPct >= 100 ? 'text-emerald-400' : metaPct >= 75 ? 'text-brand-400' : metaPct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {metaPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-3 bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${metaPct >= 100 ? 'bg-emerald-500' : metaPct >= 75 ? 'bg-brand-500' : metaPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, metaPct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>R$ 0</span>
                      {metaPct < 90 && <span style={{ marginLeft: `${Math.max(0, metaPct - 5)}%` }}>{fmt(d.receita)}</span>}
                      <span>{fmt(metaFinal)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Gráfico + Donut — pizza para 1 dia, barras para múltiplos */}
          <div className="space-y-2">
            {/* Mini filtro de período — comodidade para quem está rolando a página */}
            <div className="card py-2.5 px-4">
              <DateQuickFilter
                preset={preset}
                onPreset={applyPreset}
                inicio={inicio}
                fim={fim}
              />
            </div>

            {inicio === fim ? (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3">
                  <DayPieChart formas={d.pagamentosPorForma} receita={d.receita} custo={d.custo} date={inicio} />
                </div>
                <MargemDonut receita={d.receita} custo={d.custo} />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3">
                  <BarChart dias={d.diaDia} onDayClick={setDayModal} />
                </div>
                <MargemDonut receita={d.receita} custo={d.custo} />
              </div>
            )}
          </div>

          {/* Formas de pagamento */}
          {d.pagamentosPorForma.length > 0 && (
            <FormasPagamentoSection formas={d.pagamentosPorForma} />
          )}

          {/* Top produtos */}
          {d.topProdutos.length > 0 && (
            <div className="card p-0 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-surface-500 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-gray-300">
                      {tableView === 'analise' ? 'Top Produtos — Rentabilidade & Sugestão de Preço'
                        : tableView === 'abc'  ? 'Top Produtos — Curva ABC & Peso por Categoria'
                        : 'Top Produtos — Resumo de Vendas'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Toggle Simples / Análise / Curva ABC */}
                    <div className="flex rounded-lg overflow-hidden border border-surface-500 text-xs font-semibold">
                      <button
                        onClick={() => setTableView('simples')}
                        className={`px-3 py-1.5 transition-colors ${tableView === 'simples' ? 'bg-brand-600/30 text-brand-300' : 'text-gray-400 hover:text-gray-200'}`}
                      >Simples</button>
                      <button
                        onClick={() => setTableView('analise')}
                        className={`px-3 py-1.5 transition-colors border-l border-surface-500 ${tableView === 'analise' ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:text-gray-200'}`}
                      >Análise</button>
                      <button
                        onClick={() => setTableView('abc')}
                        className={`px-3 py-1.5 transition-colors border-l border-surface-500 flex items-center gap-1 ${tableView === 'abc' ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        <span className="text-emerald-400 font-black text-[10px]">ABC</span>
                        Curva
                      </button>
                    </div>
                  </div>
                </div>

                {/* Filtro por origem */}
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex rounded-lg overflow-hidden border border-surface-500 text-xs font-semibold">
                    {(['Todos', 'Comanda', 'PDV', 'Site', 'PréVenda'] as const).map(o => (
                      <button
                        key={o}
                        onClick={() => setTopOrigemFilter(o)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${o !== 'Todos' ? 'border-l border-surface-500' : ''} ${
                          topOrigemFilter === o ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {o === 'Comanda'  && <ShoppingCart className="w-3 h-3" />}
                        {o === 'PDV'      && <Store        className="w-3 h-3" />}
                        {o === 'Site'     && <Globe        className="w-3 h-3" />}
                        {o === 'PréVenda' && <Trophy       className="w-3 h-3" />}
                        {o === 'PréVenda' ? 'Pré-venda' : o}
                      </button>
                    ))}
                  </div>

                  {/* Chips de categoria */}
                  {topCats.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setTopCatFilter(null)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          topCatFilter === null
                            ? 'bg-surface-600 border-surface-400 text-white'
                            : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-500'
                        }`}
                      >Todas</button>
                      {topCats.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setTopCatFilter(cat === topCatFilter ? null : cat)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            topCatFilter === cat
                              ? 'bg-brand-600/30 border-brand-500 text-brand-200'
                              : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-500'
                          }`}
                        >{cat}</button>
                      ))}
                    </div>
                  )}

                  <span className="text-[11px] text-gray-500 ml-auto">
                    {topFiltered.length} produto{topFiltered.length !== 1 ? 's' : ''}
                    {(topOrigemFilter !== 'Todos' || topCatFilter) && ` filtrado${topFiltered.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>

              <div className={tableView === 'abc' ? 'p-4' : 'overflow-x-auto'}>
                {tableView === 'abc' ? (
                  <CurvaABCSection produtos={topFiltered} targetPct={targetPct} />
                ) : tableView === 'simples' ? (
                  <table className="w-full text-sm">
                    <thead className="bg-surface-800">
                      <tr className="text-left">
                        {['#', 'Produto', 'Categoria', 'Qtd', 'Comanda', 'PDV', 'Site', 'Pré-venda', 'Receita'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-500">
                      {topFiltered.map((p, i) => {
                        const qtdShow     = topOrigemFilter === 'Comanda' ? p.qtdComandas : topOrigemFilter === 'PDV' ? p.qtdAvulsa : topOrigemFilter === 'Site' ? p.qtdSite : topOrigemFilter === 'PréVenda' ? p.qtdPreVenda : p.qtd
                        const receitaShow = topOrigemFilter === 'Comanda' ? p.receitaComandas : topOrigemFilter === 'PDV' ? p.receitaAvulsa : topOrigemFilter === 'Site' ? p.receitaSite : topOrigemFilter === 'PréVenda' ? p.receitaPreVenda : p.receita
                        const misturado   = [p.receitaComandas > 0, p.receitaAvulsa > 0, p.receitaSite > 0, p.receitaPreVenda > 0].filter(Boolean).length > 1
                        return (
                          <tr key={p.nome} className="hover:bg-surface-500/20 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{i + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-white max-w-[200px]">
                              <p className="truncate">{p.nome}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-[10px] bg-surface-600 text-gray-300 px-2 py-0.5 rounded-full whitespace-nowrap">{p.categoria || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-300 text-xs font-mono font-semibold">{qtdShow}x</td>
                            <td className="px-4 py-2.5 text-brand-400 text-xs font-mono">
                              {p.qtdComandas > 0 ? `${p.qtdComandas}x` : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-amber-400 text-xs font-mono">
                              {p.qtdAvulsa > 0 ? `${p.qtdAvulsa}x` : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-blue-400 text-xs font-mono">
                              {p.qtdSite > 0 ? `${p.qtdSite}x` : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-purple-400 text-xs font-mono">
                              {p.qtdPreVenda > 0 ? `${p.qtdPreVenda}x` : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-emerald-400 font-bold text-sm">
                              {fmt(receitaShow)}
                              {topOrigemFilter === 'Todos' && misturado && (
                                <p className="text-[10px] text-gray-500 font-normal">
                                  <span className="text-brand-400/70">{fmt(p.receitaComandas)}</span> · <span className="text-amber-400/70">{fmt(p.receitaAvulsa)}</span> · <span className="text-blue-400/70">{fmt(p.receitaSite)}</span> · <span className="text-purple-400/70">{fmt(p.receitaPreVenda)}</span>
                                </p>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-surface-800">
                      <tr className="text-left">
                        {['#', 'Produto', 'Qtd', 'Preço Médio', 'Custo Médio', 'Margem Atual', 'Sugestão', 'Ação'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-500">
                      {topFiltered.map((p, i) => {
                        const qtdShow    = topOrigemFilter === 'Comanda' ? p.qtdComandas : topOrigemFilter === 'PDV' ? p.qtdAvulsa : topOrigemFilter === 'Site' ? p.qtdSite : topOrigemFilter === 'PréVenda' ? p.qtdPreVenda : p.qtd
                        const recShow    = topOrigemFilter === 'Comanda' ? p.receitaComandas : topOrigemFilter === 'PDV' ? p.receitaAvulsa : topOrigemFilter === 'Site' ? p.receitaSite : topOrigemFilter === 'PréVenda' ? p.receitaPreVenda : p.receita
                        const precoMedio  = qtdShow > 0 ? recShow / qtdShow : 0
                        const custoMedio  = p.qtd > 0 ? p.custo / p.qtd : 0
                        const margemAtual = precoMedio > 0 && custoMedio > 0
                          ? ((precoMedio - custoMedio) / precoMedio) * 100
                          : null
                        const precoSugerido = custoMedio > 0 ? custoMedio / (1 - targetPct / 100) : null
                        const diff = precoSugerido !== null ? precoSugerido - precoMedio : null
                        return (
                          <tr key={p.nome} className="hover:bg-surface-700 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{i + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-white max-w-[180px]">
                              <p className="truncate">{p.nome}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] bg-surface-600 text-gray-400 px-1.5 py-0 rounded">{p.categoria || '—'}</span>
                                {p.qtdComandas > 0 && <span className="text-[10px] text-brand-400/70">{p.qtdComandas}x cmd</span>}
                                {p.qtdAvulsa > 0   && <span className="text-[10px] text-amber-400/70">{p.qtdAvulsa}x pdv</span>}
                                {p.qtdSite > 0     && <span className="text-[10px] text-blue-400/70">{p.qtdSite}x site</span>}
                                {p.qtdPreVenda > 0 && <span className="text-[10px] text-purple-400/70">{p.qtdPreVenda}x pré</span>}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{qtdShow}x</td>
                            <td className="px-4 py-2.5 font-mono text-gray-200 font-semibold text-xs">
                              {precoMedio > 0 ? fmt(precoMedio) : '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-red-400 text-xs">
                              {custoMedio > 0 ? fmt(custoMedio) : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {margemAtual !== null ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-12 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${margemAtual >= targetPct ? 'bg-emerald-500' : margemAtual >= 0 ? 'bg-purple-500' : 'bg-red-500'}`}
                                      style={{ width: `${Math.min(100, Math.abs(margemAtual))}%` }} />
                                  </div>
                                  <span className={`text-xs font-mono font-bold ${margemAtual >= targetPct ? 'text-emerald-400' : margemAtual >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                                    {margemAtual.toFixed(0)}%
                                  </span>
                                </div>
                              ) : <span className="text-gray-600 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">
                              {precoSugerido !== null
                                ? <span className="text-brand-400 font-semibold">{fmt(precoSugerido)}</span>
                                : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {diff !== null ? (
                                Math.abs(diff) < 0.50 ? (
                                  <span className="flex items-center gap-1 text-xs text-emerald-400"><Minus className="w-3 h-3" /> Ok</span>
                                ) : diff > 0 ? (
                                  <span className="flex items-center gap-1 text-xs text-red-400 font-semibold"><ArrowUp className="w-3 h-3" /> +{fmt(diff)}</span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-emerald-400"><ArrowDown className="w-3 h-3" /> {fmt(diff)}</span>
                                )
                              ) : <span className="text-gray-600 text-xs">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {/* Legenda */}
                <div className="px-4 py-3 border-t border-surface-500 flex flex-wrap gap-4 text-[11px] text-gray-500">
                  <span><span className="text-brand-400 font-bold">Comanda</span> = mesas · <span className="text-amber-400 font-bold">PDV</span> = balcão avulso · <span className="text-blue-400 font-bold">Site</span> = pedido normal do site · <span className="text-purple-400 font-bold">Pré-venda</span> = produto marcado como pré-venda</span>
                  {tableView === 'analise' && <>
                    <span><span className="text-brand-400 font-bold">Sugestão</span> = Custo Médio ÷ (1 − {targetPct}%)</span>
                    <span><ArrowUp className="w-3 h-3 text-red-400 inline" /> subir preço · <ArrowDown className="w-3 h-3 text-emerald-400 inline" /> pode baixar · <Minus className="w-3 h-3 text-emerald-400 inline" /> preço ok</span>
                  </>}
                </div>
              </div>
            </div>
          )}

          {/* Aviso sem custo */}
          {d.custo === 0 && d.receita > 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm text-yellow-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Preço de custo não cadastrado</p>
                <p className="text-yellow-400/70 mt-0.5">Cadastre o <strong>Preço de custo</strong> nos produtos em <a href="/admin/estoque" className="underline">Estoque</a> para ver a margem real.</p>
              </div>
            </div>
          )}

          {d.receita === 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-surface-700 border border-surface-500 p-6 text-sm text-gray-400">
              <DollarSign className="w-5 h-5 text-gray-400" />
              Nenhuma venda registrada no período selecionado.
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
