// =============================================================================
// lib/relatorio-admin.ts — Relatórios gerenciais: Clientes, PDV, Comandas
// Mesmo padrão visual de relatorio.ts (fundo branco, tipografia limpa)
// =============================================================================

import { ClienteInsightDto, FinanceiroDto, ComandaDto, RelatorioCrediarioDto } from './api'

async function getJsPDF() {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  return jsPDF
}

// ── Paleta ────────────────────────────────────────────────────────────────────
const BLACK  = [20,  20,  20]  as [number, number, number]
const GRAY   = [100, 100, 100] as [number, number, number]
const LGRAY  = [180, 180, 180] as [number, number, number]
const BGROW  = [248, 248, 248] as [number, number, number]
const WHITE  = [255, 255, 255] as [number, number, number]
const ACCENT = [79,  70,  229] as [number, number, number]
const GREEN  = [22,  163, 74]  as [number, number, number]
const RED    = [220, 38,  38]  as [number, number, number]
const AMBER  = [180, 120, 0]   as [number, number, number]

const PW = 210; const ML = 14; const MR = 14; const CW = PW - ML - MR

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}
function today() {
  return new Date().toLocaleDateString('pt-BR')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hRule(doc: any, y: number, color = LGRAY) {
  doc.setDrawColor(...color); doc.setLineWidth(0.2)
  doc.line(ML, y, PW - MR, y)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageHeader(doc: any, title: string, subtitle: string) {
  doc.setFillColor(...ACCENT); doc.rect(0, 0, PW, 1.5, 'F')
  let y = 12
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...BLACK)
  doc.text('Santuário Nerd', ML, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY)
  doc.text(subtitle, ML, y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...BLACK)
  doc.text(title, PW - MR, y - 6, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY)
  doc.text(`Emitido em ${today()}`, PW - MR, y, { align: 'right' })
  y += 5; hRule(doc, y, ACCENT); y += 6
  return y
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kpiRow(doc: any, y: number, kpis: { label: string; value: string; color?: [number,number,number] }[]) {
  const w = CW / kpis.length
  kpis.forEach((k, i) => {
    const x = ML + i * w
    doc.setFillColor(...BGROW); doc.roundedRect(x + 1, y, w - 2, 16, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.setTextColor(...(k.color ?? BLACK))
    doc.text(k.value, x + (w - 2) / 2, y + 7, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY)
    doc.text(k.label, x + (w - 2) / 2, y + 13, { align: 'center' })
  })
  return y + 20
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sectionTitle(doc: any, y: number, title: string) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(title.toUpperCase(), ML, y)
  hRule(doc, y + 2)
  return y + 7
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addFooters(doc: any) {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    hRule(doc, 285, LGRAY)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...LGRAY)
    doc.text('Santuário Nerd — Documento confidencial', ML, 290)
    doc.text(`${i} / ${total}`, PW - MR, 290, { align: 'right' })
  }
}

// =============================================================================
// 1. RELATÓRIO DE CLIENTES
// =============================================================================
export async function gerarRelatorioClientes(clientes: ClienteInsightDto[]) {
  const JsPDF = await getJsPDF()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (JsPDF as any)({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as any

  const ativos     = clientes.filter(c => !c.inativo30)
  const inativos   = clientes.filter(c => c.inativo30)
  const comPontos  = clientes.filter(c => c.pontos > 0)
  const totalGasto = clientes.reduce((s, c) => s + c.gastoTotal, 0)

  let y = pageHeader(doc, 'Relatório de Clientes', `${clientes.length} clientes cadastrados`)

  // KPIs
  y = kpiRow(doc, y, [
    { label: 'Total de Clientes',    value: String(clientes.length) },
    { label: 'Ativos (30 dias)',      value: String(ativos.length),   color: GREEN },
    { label: 'Inativos (30+ dias)',   value: String(inativos.length), color: inativos.length > 0 ? RED : GREEN },
    { label: 'Com Pontos',            value: String(comPontos.length), color: ACCENT },
    { label: 'Gasto Total (período)', value: fmt(totalGasto),          color: BLACK },
  ])

  y = sectionTitle(doc, y, 'Lista de clientes')

  const PW_L = 297
  ;(doc as any).autoTable({
    startY: y,
    head: [['Cliente', 'WhatsApp', 'Visitas', 'Última Visita', 'Gasto Total', 'Ticket Médio', 'Pontos', 'Vence em', 'Status']],
    body: clientes.map(c => [
      c.nome,
      c.whatsApp ?? '—',
      String(c.numVisitas),
      fmtDate(c.ultimaVisita),
      fmt(c.gastoTotal),
      fmt(c.ticketMedio),
      c.pontos > 0 ? String(c.pontos) : '—',
      c.pontosVencemEm == null
        ? '—'
        : c.pontosVencemEm < 0
          ? 'Vencido'
          : `${c.pontosVencemEm}d`,
      c.inativo30 ? 'Inativo' : 'Ativo',
    ]),
    styles:      { fontSize: 7.5, cellPadding: 2.5, textColor: BLACK },
    headStyles:  { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 26 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 20, halign: 'center' },
    },
    didParseCell(data: any) {
      if (data.column.index === 8 && data.section === 'body') {
        data.cell.styles.textColor = data.cell.raw === 'Inativo' ? RED : GREEN
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index === 7 && data.section === 'body' && data.cell.raw === 'Vencido') {
        data.cell.styles.textColor = RED
      }
    },
    margin: { left: ML, right: MR },
  })

  addFooters(doc)
  doc.save(`clientes_${today().replace(/\//g, '-')}.pdf`)
}

// =============================================================================
// 2. RELATÓRIO PDV — Resumo de vendas do período
// =============================================================================
export async function gerarRelatorioPDV(
  data: FinanceiroDto,
  periodo: { inicio: string; fim: string; dias: number },
) {
  const JsPDF = await getJsPDF()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any

  const subtitle = `${fmtDate(periodo.inicio)} a ${fmtDate(periodo.fim)} (últimos ${periodo.dias} dias)`
  let y = pageHeader(doc, 'Relatório PDV', subtitle)

  // KPIs principais
  y = kpiRow(doc, y, [
    { label: 'Receita Bruta',  value: fmt(data.receita),        color: GREEN },
    { label: 'Custo',          value: fmt(data.custo),           color: RED },
    { label: 'Margem Líquida', value: fmt(data.margem),          color: data.margem >= 0 ? GREEN : RED },
    { label: 'Margem %',       value: `${data.margemPercent.toFixed(1)}%`, color: data.margemPercent >= 0 ? GREEN : RED },
  ])

  y = kpiRow(doc, y, [
    { label: 'Comandas',      value: fmt(data.receitaComandas) },
    { label: 'Vendas Avulsas',value: fmt(data.receitaAvulsa) },
    { label: 'Crediários',    value: fmt(data.crediarios),       color: AMBER },
  ])

  // Formas de pagamento
  if (data.pagamentosPorForma.length > 0) {
    y = sectionTitle(doc, y, 'Receita por forma de pagamento')
    ;(doc as any).autoTable({
      startY: y,
      head: [['Forma de Pagamento', 'Transações', 'Total']],
      body: data.pagamentosPorForma.map(f => [
        f.forma, String(f.quantidade), fmt(f.total),
      ]),
      styles:      { fontSize: 8, cellPadding: 2.5, textColor: BLACK },
      headStyles:  { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
      margin: { left: ML, right: MR },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Top produtos
  if (data.topProdutos.length > 0) {
    y = sectionTitle(doc, y, 'Top produtos no período')
    ;(doc as any).autoTable({
      startY: y,
      head: [['#', 'Produto', 'Qtd', 'Receita', 'Custo', 'Margem']],
      body: data.topProdutos.slice(0, 20).map((p, i) => [
        String(i + 1), p.nome, String(p.qtd),
        fmt(p.receita), fmt(p.custo),
        p.receita > 0 ? `${((p.margem / p.receita) * 100).toFixed(1)}%` : '—',
      ]),
      styles:      { fontSize: 7.5, cellPadding: 2.5, textColor: BLACK },
      headStyles:  { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      didParseCell(d: any) {
        if (d.column.index === 5 && d.section === 'body') {
          const v = parseFloat(d.cell.raw)
          if (!isNaN(v)) {
            d.cell.styles.textColor = v >= 0 ? GREEN : RED
            d.cell.styles.fontStyle = 'bold'
          }
        }
      },
      margin: { left: ML, right: MR },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Dia a dia
  if (data.diaDia.length > 0) {
    if (y > 220) { doc.addPage(); y = 20 }
    y = sectionTitle(doc, y, 'Receita por dia')
    ;(doc as any).autoTable({
      startY: y,
      head: [['Data', 'Receita', 'Custo', 'Margem']],
      body: data.diaDia.map(d => [
        d.dia, fmt(d.receita), fmt(d.custo), fmt(d.receita - d.custo),
      ]),
      styles:      { fontSize: 7.5, cellPadding: 2, textColor: BLACK },
      headStyles:  { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: ML, right: MR },
    })
  }

  addFooters(doc)
  doc.save(`pdv_${periodo.dias}dias_${today().replace(/\//g, '-')}.pdf`)
}

// =============================================================================
// 3. RELATÓRIO DE COMANDAS ABERTAS
// =============================================================================
export async function gerarRelatorioComandas(comandas: ComandaDto[], dias: number) {
  const JsPDF = await getJsPDF()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (JsPDF as any)({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as any

  const corte = new Date(Date.now() - dias * 86_400_000)
  const filtradas = dias > 0
    ? comandas.filter(c => new Date(c.openedAt) >= corte)
    : comandas

  const totalAberto = filtradas.reduce((s, c) => s + c.totalInReais, 0)
  const subtitle = dias > 0
    ? `Abertas nos últimos ${dias} dias · ${filtradas.length} comanda${filtradas.length !== 1 ? 's' : ''}`
    : `Todas as comandas abertas · ${filtradas.length} comanda${filtradas.length !== 1 ? 's' : ''}`

  let y = pageHeader(doc, 'Comandas Abertas', subtitle)

  y = kpiRow(doc, y, [
    { label: 'Comandas Abertas', value: String(filtradas.length) },
    { label: 'Valor Total em Aberto', value: fmt(totalAberto), color: AMBER },
    { label: 'Ticket Médio Aberto',
      value: filtradas.length > 0 ? fmt(totalAberto / filtradas.length) : '—' },
  ])

  y = sectionTitle(doc, y, 'Detalhamento das comandas')

  const diasAberta = (openedAt: string) =>
    Math.floor((Date.now() - new Date(openedAt).getTime()) / 86_400_000)

  ;(doc as any).autoTable({
    startY: y,
    head: [['Cliente', 'Mesa', 'Status', 'Abertura', 'Dias Aberta', 'Itens', 'Total']],
    body: filtradas
      .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
      .map(c => [
        c.userName,
        c.tableIdentifier ?? '—',
        c.status,
        new Date(c.openedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        `${diasAberta(c.openedAt)}d`,
        String(c.items.length),
        fmt(c.totalInReais),
      ]),
    styles:      { fontSize: 8, cellPadding: 2.5, textColor: BLACK },
    headStyles:  { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { halign: 'right' },
    },
    didParseCell(d: any) {
      if (d.column.index === 4 && d.section === 'body') {
        const v = parseInt(d.cell.raw)
        if (v >= 3) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold' }
        else if (v >= 1) { d.cell.styles.textColor = AMBER }
      }
    },
    margin: { left: ML, right: MR },
  })

  addFooters(doc)
  doc.save(`comandas_abertas_${today().replace(/\//g, '-')}.pdf`)
}

// =============================================================================
// 4. RELATÓRIO DE CREDIÁRIO — Situação atual + pagamentos do mês
// =============================================================================
const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export async function gerarRelatorioCrediario(data: RelatorioCrediarioDto) {
  const JsPDF = await getJsPDF()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any

  const mesLabel = `${MESES_SHORT[data.mes - 1]}/${data.ano}`
  const subtitle = `Situação atual · Pagamentos de ${mesLabel}`
  let y = pageHeader(doc, 'Relatório de Crediário', subtitle)

  // KPIs
  y = kpiRow(doc, y, [
    { label: 'Total em Aberto',      value: fmt(data.totalEmAbertoEmReais),   color: AMBER },
    { label: 'Vencidos',             value: fmt(data.totalVencidoEmReais),     color: RED },
    { label: `Recebido em ${mesLabel}`, value: fmt(data.recebidoNoMesEmReais), color: GREEN },
    { label: 'Clientes em Aberto',   value: String(data.qtdAbertos) },
  ])

  // ── Devedores ──────────────────────────────────────────────────────────────
  const isCurrentMonth = data.mes === (new Date().getMonth() + 1) && data.ano === new Date().getFullYear();

  if (data.devedores.length > 0 && isCurrentMonth) {
    y = sectionTitle(doc, y, 'Clientes com crediário em aberto (Situação Atual)')
    ;(doc as any).autoTable({
      startY: y,
      head: [['Cliente', 'WhatsApp', 'Vencimento', 'Dias Atraso', 'Saldo Devedor']],
      body: data.devedores.map(d => [
        d.nome,
        d.whatsApp ?? '—',
        fmtDate(d.dataVencimento),
        d.vencido ? `${d.diasAtraso}d` : '—',
        fmt(d.saldoEmReais),
      ]),
      styles:      { fontSize: 8, cellPadding: 2.5, textColor: BLACK },
      headStyles:  { fillColor: AMBER, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 32 },
        2: { cellWidth: 32, halign: 'center' },
        3: { cellWidth: 24, halign: 'center' },
        4: { halign: 'right' },
      },
      didParseCell(d: any) {
        // Dias de atraso — vermelho se vencido
        if (d.column.index === 3 && d.section === 'body' && d.cell.raw !== '—') {
          d.cell.styles.textColor = RED
          d.cell.styles.fontStyle = 'bold'
        }
        // Saldo devedor — vermelho se vencido (detectado pela linha)
        if (d.column.index === 4 && d.section === 'body') {
          d.cell.styles.fontStyle = 'bold'
        }
      },
      margin: { left: ML, right: MR },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Pagamentos do mês ─────────────────────────────────────────────────────
  if (data.pagamentosNoMes.length > 0) {
    if (y > 220) { doc.addPage(); y = 20 }
    y = sectionTitle(doc, y, `Pagamentos recebidos em ${mesLabel}`)
    ;(doc as any).autoTable({
      startY: y,
      head: [['Data/Hora', 'Cliente', 'Forma de Pagamento', 'Observação', 'Valor']],
      body: data.pagamentosNoMes.map(p => [
        new Date(p.createdAt).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit',
        }),
        p.clienteNome,
        p.formaPagamento,
        p.observacao ? (p.observacao.length > 35 ? p.observacao.substring(0, 32) + '...' : p.observacao.replace(/\n/g, ' ')) : '—',
        fmt(p.valorEmReais),
      ]),
      styles:      { fontSize: 8, cellPadding: 2.5, textColor: BLACK },
      headStyles:  { fillColor: GREEN, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 50 },
        2: { cellWidth: 35 },
        4: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell(d: any) {
        if (d.column.index === 4 && d.section === 'body') {
          d.cell.styles.textColor = GREEN
        }
      },
      margin: { left: ML, right: MR },
    })

    // Subtotal
    const lastY = (doc as any).lastAutoTable.finalY + 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.setTextColor(...BLACK)
    doc.text(`Total recebido em ${mesLabel}:`, PW - MR - 50, lastY, { align: 'left' })
    doc.setTextColor(...GREEN)
    doc.text(fmt(data.recebidoNoMesEmReais), PW - MR, lastY, { align: 'right' })
  } else {
    if (y > 240) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...LGRAY)
    doc.text(`Nenhum pagamento registrado em ${mesLabel}.`, ML, y)
  }

  addFooters(doc)
  doc.save(`crediario_${mesLabel.replace('/', '-')}_${today().replace(/\//g, '-')}.pdf`)
}
