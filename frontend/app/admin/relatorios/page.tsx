'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  relatorioApi, RelatorioVendasDto, RelatorioCategoria,
  RelatorioCrediarioDto, DevedorDto, PagamentoMesDto,
  analyticsApi, productApi, categoryApi, userApi, comandaApi,
} from '@/lib/api'
import { gerarRelatorioPDF } from '@/lib/relatorio'
import { gerarRelatorioOperacional, gerarRelatorioGerencial } from '@/lib/relatorio-estoque'
import { gerarRelatorioClientes, gerarRelatorioPDV, gerarRelatorioComandas, gerarRelatorioCrediario } from '@/lib/relatorio-admin'
import { PageHeader } from '@/components/ui/PageHeader'
import toast from 'react-hot-toast'
import {
  BarChart2, ChevronDown, ChevronUp, Loader2, Package,
  TrendingUp, ShoppingCart, CreditCard, AlertTriangle,
  CheckCircle, DollarSign, Phone, FileText, BarChart,
  Users, Store, ClipboardList,
} from 'lucide-react'
import clsx from 'clsx'

const fmt     = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')
const fmtHour = (d: string) => new Date(d).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── Aba Vendas ────────────────────────────────────────────────────────────────

function CategoriaCard({ cat, totalGeral }: { cat: RelatorioCategoria; totalGeral: number }) {
  const [open, setOpen] = useState(false)
  const pct = totalGeral > 0 ? (cat.quantidadeVendida / totalGeral) * 100 : 0

  return (
    <div className="card">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 text-left">
        <span className="text-2xl w-8 text-center shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-white truncate">{cat.categoria}</p>
            <span className="text-accent-gold font-bold text-sm shrink-0">{fmt(cat.totalEmReais)}</span>
          </div>
          <div className="mt-1.5 h-1.5 bg-surface-600 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
            <span>{cat.quantidadeVendida} un. vendidas</span>
            <span>{pct.toFixed(1)}% do total</span>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 border-t border-surface-500 pt-3 space-y-1">
          {cat.produtos.map((p, i) => (
            <div key={i} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-500 text-xs w-4 shrink-0">{i + 1}.</span>
                <span className="text-white truncate">{p.nome}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-2">
                <span className="text-gray-400 text-xs">{p.quantidadeVendida} un.</span>
                <span className="text-accent-gold font-mono font-semibold">{fmt(p.totalEmReais)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AbaVendas({ mes, ano }: { mes: number; ano: number }) {
  const [data, setData]       = useState<RelatorioVendasDto | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data: d } = await relatorioApi.vendas(mes, ano); setData(d) }
    catch { toast.error('Erro ao carregar relatório de vendas') }
    finally { setLoading(false) }
  }, [mes, ano])

  useEffect(() => { fetch() }, [fetch])

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
  if (!data || data.porCategoria.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart2 className="w-12 h-12 text-gray-400 mb-3" />
        <p className="text-gray-400 font-medium">Nenhuma venda em {MESES[mes - 1]} {ano}</p>
      </div>
    )

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total vendido',     value: fmt(data.totalGeralEmReais),      icon: TrendingUp,  color: 'text-accent-gold',  bg: 'bg-amber-500/10' },
          { label: 'Itens vendidos',    value: `${data.totalItensVendidos} un.`, icon: ShoppingCart, color: 'text-brand-400',   bg: 'bg-brand-500/10' },
          { label: 'Categorias',        value: `${data.porCategoria.length}`,    icon: Package,      color: 'text-accent-green', bg: 'bg-accent-green/10' },
        ].map(m => (
          <div key={m.label} className="card flex items-center gap-3 py-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', m.bg)}>
              <m.icon className={clsx('w-5 h-5', m.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-white truncate">{m.value}</p>
              <p className="text-xs text-gray-400">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
        {MESES[mes - 1]} {ano} — clique para ver os produtos
      </p>
      {data.porCategoria.map((cat, i) => (
        <CategoriaCard key={i} cat={cat} totalGeral={data.totalItensVendidos} />
      ))}
    </div>
  )
}

// ── Aba Crediário ─────────────────────────────────────────────────────────────

function DevedorRow({ d }: { d: DevedorDto }) {
  return (
    <div className={clsx('card py-3', d.vencido && 'border-red-500/30')}>
      <div className="flex items-center gap-3">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          d.vencido ? 'bg-red-500/10' : 'bg-amber-500/10')}>
          {d.vencido
            ? <AlertTriangle className="w-4 h-4 text-red-400" />
            : <CreditCard className="w-4 h-4 text-amber-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{d.nome}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {d.vencido
              ? <span className="text-xs text-red-400">{d.diasAtraso} dias em atraso</span>
              : <span className="text-xs text-gray-500">Vence {fmtDate(d.dataVencimento)}</span>
            }
            {d.whatsApp && (
              <a href={`https://wa.me/55${d.whatsApp.replace(/\D/g,'')}`}
                 target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                <Phone className="w-3 h-3" /> WhatsApp
              </a>
            )}
          </div>
        </div>
        <span className={clsx('font-bold text-lg shrink-0', d.vencido ? 'text-red-400' : 'text-amber-400')}>
          {fmt(d.saldoEmReais)}
        </span>
      </div>
    </div>
  )
}

function AbaCrediario({ mes, ano }: { mes: number; ano: number }) {
  const [data, setData]       = useState<RelatorioCrediarioDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPgtos, setShowPgtos] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data: d } = await relatorioApi.crediario(mes, ano); setData(d) }
    catch { toast.error('Erro ao carregar relatório de crediário') }
    finally { setLoading(false) }
  }, [mes, ano])

  useEffect(() => { fetch() }, [fetch])

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
  if (!data) return null

  return (
    <div className="space-y-4">
      {/* KPIs situação atual */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total em aberto',  value: fmt(data.totalEmAbertoEmReais), icon: CreditCard,     color: 'text-amber-400',    bg: 'bg-amber-500/10',      sub: `${data.qtdAbertos} cliente${data.qtdAbertos !== 1 ? 's' : ''}` },
          { label: 'Vencidos',         value: fmt(data.totalVencidoEmReais),  icon: AlertTriangle,  color: 'text-red-400',      bg: 'bg-red-500/10',        sub: `${data.qtdVencidos} em atraso` },
          { label: `Recebido em ${MESES[mes-1].slice(0,3)}`, value: fmt(data.recebidoNoMesEmReais), icon: CheckCircle, color: 'text-accent-green', bg: 'bg-accent-green/10', sub: `${data.qtdPagamentosNoMes} pagamento${data.qtdPagamentosNoMes !== 1 ? 's' : ''}` },
          { label: 'Saldo líquido',    value: fmt(data.totalEmAbertoEmReais - data.totalVencidoEmReais), icon: DollarSign, color: 'text-brand-400', bg: 'bg-brand-500/10', sub: 'em dia' },
        ].map(m => (
          <div key={m.label} className="card flex items-center gap-3 py-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', m.bg)}>
              <m.icon className={clsx('w-5 h-5', m.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-white truncate">{m.value}</p>
              <p className="text-[11px] text-gray-400 truncate">{m.label}</p>
              <p className="text-[10px] text-gray-400 truncate">{m.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Devedores */}
      {data.devedores.length === 0 ? (
        <div className="card text-center py-8">
          <CheckCircle className="w-10 h-10 text-accent-green mx-auto mb-2" />
          <p className="text-accent-green font-semibold">Nenhum crediário em aberto</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
            Devedores ativos ({data.devedores.length})
          </p>
          {data.devedores.map((d, i) => <DevedorRow key={i} d={d} />)}
        </div>
      )}

      {/* Pagamentos do mês */}
      {data.pagamentosNoMes.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowPgtos(v => !v)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-wider font-semibold"
          >
            {showPgtos ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Pagamentos recebidos em {MESES[mes - 1]} ({data.pagamentosNoMes.length})
          </button>
          {showPgtos && (
            <div className="space-y-1.5">
              {data.pagamentosNoMes.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-surface-700 rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-sm text-white font-medium">{p.clienteNome}</p>
                    <p className="text-xs text-gray-500">
                      {p.formaPagamento} · {fmtHour(p.createdAt)}
                      {p.observacao && ` · ${p.observacao}`}
                    </p>
                  </div>
                  <span className="text-accent-green font-bold font-mono ml-3 shrink-0">{fmt(p.valorEmReais)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type Aba    = 'vendas' | 'crediario'
type PdfKey = 'financeiro' | 'operacional' | 'gerencial' | 'clientes' | 'pdv' | 'comandas' | 'crediario' | null

export default function RelatoriosPage() {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [aba, setAba] = useState<Aba>('vendas')
  const [pdfLoading, setPdfLoading] = useState<PdfKey>(null)
  const [diasPdv, setDiasPdv]         = useState(30)
  const [diasComandas, setDiasComandas] = useState(0)

  const anos = Array.from({ length: 3 }, (_, i) => hoje.getFullYear() - i)

  const handleFinanceiroPDF = useCallback(async () => {
    setPdfLoading('financeiro')
    try {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const fimDate = new Date(ano, mes, 0)
      const fim = `${fimDate.getFullYear()}-${String(fimDate.getMonth() + 1).padStart(2, '0')}-${String(fimDate.getDate()).padStart(2, '0')}`
      const { data } = await analyticsApi.financeiro(inicio, fim)
      await gerarRelatorioPDF(data, { inicio, fim })
    } catch { toast.error('Erro ao gerar PDF financeiro') }
    finally { setPdfLoading(null) }
  }, [mes, ano])

  const handleOperacionalPDF = useCallback(async () => {
    setPdfLoading('operacional')
    try {
      const [{ data: products }, { data: categories }] = await Promise.all([productApi.listAdmin(), categoryApi.list()])
      await gerarRelatorioOperacional(products, categories)
    } catch { toast.error('Erro ao gerar PDF operacional') }
    finally { setPdfLoading(null) }
  }, [])

  const handleGerencialPDF = useCallback(async () => {
    setPdfLoading('gerencial')
    try {
      const [{ data: products }, { data: categories }] = await Promise.all([productApi.listAdmin(), categoryApi.list()])
      await gerarRelatorioGerencial(products, categories)
    } catch { toast.error('Erro ao gerar PDF gerencial') }
    finally { setPdfLoading(null) }
  }, [])

  const handleClientesPDF = useCallback(async () => {
    setPdfLoading('clientes')
    try {
      const { data } = await analyticsApi.clientes()
      await gerarRelatorioClientes(data)
    } catch { toast.error('Erro ao gerar PDF de clientes') }
    finally { setPdfLoading(null) }
  }, [])

  const handlePdvPDF = useCallback(async () => {
    setPdfLoading('pdv')
    try {
      const toLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const fim    = toLocal(new Date())
      const inicio = toLocal(new Date(Date.now() - diasPdv * 86_400_000))
      const { data } = await analyticsApi.financeiro(inicio, fim)
      await gerarRelatorioPDV(data, { inicio, fim, dias: diasPdv })
    } catch { toast.error('Erro ao gerar PDF PDV') }
    finally { setPdfLoading(null) }
  }, [diasPdv])

  const handleComandasPDF = useCallback(async () => {
    setPdfLoading('comandas')
    try {
      const { data } = await comandaApi.dashboard()
      await gerarRelatorioComandas(data, diasComandas)
    } catch { toast.error('Erro ao gerar PDF de comandas') }
    finally { setPdfLoading(null) }
  }, [diasComandas])

  const handleCrediarioPDF = useCallback(async () => {
    setPdfLoading('crediario')
    try {
      const { data } = await relatorioApi.crediario(mes, ano)
      await gerarRelatorioCrediario(data)
    } catch { toast.error('Erro ao gerar PDF de crediário') }
    finally { setPdfLoading(null) }
  }, [mes, ano])

  // ── Cards de relatório ──────────────────────────────────────────────────────
  const reports = [
    {
      key: 'financeiro' as PdfKey,
      icon: FileText,
      color: 'text-brand-400',
      bg:   'bg-brand-500/10',
      title: 'Financeiro Mensal',
      tag: 'Finanças',
      desc: 'Resumo completo de receita, custo e margem do mês selecionado. Inclui breakdown por forma de pagamento, top produtos vendidos e comparativo de desempenho. Use para fechamento mensal e apresentação ao gestor.',
      control: (
        <span className="text-xs text-gray-400">{MESES[mes - 1]} {ano}</span>
      ),
      onGenerate: handleFinanceiroPDF,
    },
    {
      key: 'operacional' as PdfKey,
      icon: Package,
      color: 'text-amber-400',
      bg:   'bg-amber-500/10',
      title: 'Estoque Operacional',
      tag: 'Estoque',
      desc: 'Inventário completo com quantidade, custo unitário e valor total por produto. Destaca itens em estoque crítico (≤3 un.) e produtos zerados. Use para conferência física, compras e auditoria de estoque.',
      onGenerate: handleOperacionalPDF,
    },
    {
      key: 'gerencial' as PdfKey,
      icon: BarChart,
      color: 'text-purple-400',
      bg:   'bg-purple-500/10',
      title: 'Estoque Gerencial',
      tag: 'Estoque',
      desc: 'Visão executiva do estoque: capital imobilizado por categoria, top 10 produtos por valor parado, lista de reposição urgente e patrimônio total. Use para tomada de decisão sobre compras e liquidações.',
      onGenerate: handleGerencialPDF,
    },
    {
      key: 'clientes' as PdfKey,
      icon: Users,
      color: 'text-emerald-400',
      bg:   'bg-emerald-500/10',
      title: 'Clientes & Fidelidade',
      tag: 'Clientes',
      desc: 'Lista completa de clientes com número de visitas, última visita, gasto total, ticket médio, saldo de pontos e validade. Identifica clientes inativos há 30+ dias. Use para campanhas de reativação e gestão do programa de fidelidade.',
      onGenerate: handleClientesPDF,
    },
    {
      key: 'pdv' as PdfKey,
      icon: Store,
      color: 'text-cyan-400',
      bg:   'bg-cyan-500/10',
      title: 'PDV — Ponto de Venda',
      tag: 'Vendas',
      desc: 'Desempenho de vendas do período escolhido: receita total, custo, margem, top produtos, formas de pagamento e evolução dia a dia. Use para análise de períodos específicos, fechamento semanal ou comparativo de campanhas.',
      control: (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Últimos</span>
          <input
            type="number" min={1} max={365} value={diasPdv}
            onChange={e => setDiasPdv(Math.max(1, Math.min(365, Number(e.target.value))))}
            className="input py-0.5 px-2 text-xs w-16 text-center"
          />
          <span className="text-xs text-gray-400">dias</span>
        </div>
      ),
      onGenerate: handlePdvPDF,
    },
    {
      key: 'comandas' as PdfKey,
      icon: ClipboardList,
      color: 'text-rose-400',
      bg:   'bg-rose-500/10',
      title: 'Comandas Abertas',
      tag: 'Operação',
      desc: 'Snapshot de todas as comandas atualmente em aberto com cliente, mesa, valor, itens e há quantos dias está aberta (alerta vermelho para 3+ dias). Use para identificar mesas esquecidas, cobranças pendentes e controle do caixa em aberto.',
      control: (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Abertas nos últimos</span>
          <input
            type="number" min={0} max={365} value={diasComandas}
            onChange={e => setDiasComandas(Math.max(0, Math.min(365, Number(e.target.value))))}
            className="input py-0.5 px-2 text-xs w-16 text-center"
          />
          <span className="text-xs text-gray-400">dias (0 = todas)</span>
        </div>
      ),
      onGenerate: handleComandasPDF,
    },
    {
      key: 'crediario' as PdfKey,
      icon: CreditCard,
      color: 'text-amber-400',
      bg:   'bg-amber-500/10',
      title: 'Crediário',
      tag: 'Crediário',
      desc: 'Situação atual de todos os crediários em aberto (quem deve, quanto, se está vencido) e histórico completo de pagamentos recebidos no mês — data, cliente, valor e forma de pagamento. Use para cobrança, fechamento mensal e auditoria de recebíveis.',
      control: (
        <span className="text-xs text-gray-400">{MESES[mes - 1]} {ano}</span>
      ),
      onGenerate: handleCrediarioPDF,
    },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Relatórios"
        subtitle="Análise de vendas, estoque e clientes"
        actions={
          <>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} className="input py-1.5 text-sm max-w-[130px]">
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} className="input py-1.5 text-sm w-[80px]">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        }
      />

      {/* Grid de relatórios PDF */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">
          Exportar PDF
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {reports.map(r => {
            const Icon = r.icon
            const loading = pdfLoading === r.key
            return (
              <div key={r.key as string} className="card flex flex-col gap-3">
                {/* Topo do card */}
                <div className="flex items-start gap-3">
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', r.bg)}>
                    <Icon className={clsx('w-4 h-4', r.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-sm">{r.title}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-surface-700 px-1.5 py-0.5 rounded">
                        {r.tag}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{r.desc}</p>
                  </div>
                </div>

                {/* Controle + botão */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-500">
                  <div>{r.control ?? <span />}</div>
                  <button
                    onClick={r.onGenerate}
                    disabled={pdfLoading !== null}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
                      pdfLoading !== null
                        ? 'opacity-50 cursor-not-allowed bg-surface-700 text-gray-400'
                        : 'bg-brand-600 hover:bg-brand-500 text-white'
                    )}
                  >
                    {loading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando...</>
                      : <><FileText className="w-3.5 h-3.5" /> Gerar PDF</>
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 border border-surface-500 p-1 rounded-xl w-fit">
        {([
          { key: 'vendas',    label: 'Vendas',    icon: ShoppingCart },
          { key: 'crediario', label: 'Crediário', icon: CreditCard },
        ] as { key: Aba; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              aba === key ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {aba === 'vendas'    && <AbaVendas    mes={mes} ano={ano} />}
      {aba === 'crediario' && <AbaCrediario mes={mes} ano={ano} />}
    </div>
  )
}
