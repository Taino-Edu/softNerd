// =============================================================================
// lib/relatorio.ts — Relatório Financeiro PDF estilo Bling
// Fundo branco, tipografia limpa, imprime sem gastar tinta
// =============================================================================

import { FinanceiroDto } from './api'
import { FORMAS_PAGAMENTO } from './pagamentos'

async function getJsPDF() {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  return jsPDF
}

// ── Paleta ────────────────────────────────────────────────────────────────────
const BLACK   = [20,  20,  20]  as [number, number, number]
const GRAY    = [100, 100, 100] as [number, number, number]
const LGRAY   = [180, 180, 180] as [number, number, number]
const BGROW   = [248, 248, 248] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]
const ACCENT  = [79,  70,  229] as [number, number, number]  // indigo — toque de cor sutil
const GREEN   = [22,  163, 74]  as [number, number, number]
const RED     = [220, 38,  38]  as [number, number, number]
const AMBER   = [180, 120, 0]   as [number, number, number]

const PW = 210
const ML = 14
const MR = 14
const CW = PW - ML - MR

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

const FORMA_LABEL: Record<string, string> = Object.fromEntries(FORMAS_PAGAMENTO.map(f => [f.value, f.label]))

// ── Helpers de desenho ────────────────────────────────────────────────────────

function hRule(doc: any, y: number, color = LGRAY, lw = 0.3) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.line(ML, y, PW - MR, y)
}

function sectionHeader(doc: any, title: string, y: number): number {
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT)
  doc.text(title.toUpperCase(), ML, y)
  hRule(doc, y + 1.5, ACCENT, 0.4)
  return y + 6
}

function addPage(doc: any) {
  doc.addPage()
  return 16
}

function checkPageBreak(doc: any, y: number, needed = 30): number {
  if (y + needed > 278) return addPage(doc)
  return y
}

// ── Função principal ──────────────────────────────────────────────────────────
export async function gerarRelatorioPDF(
  d: FinanceiroDto,
  periodo: { inicio: string; fim: string },
) {
  const JsPDF = await getJsPDF()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any

  let y = 0

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  // Linha colorida no topo
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, PW, 1.5, 'F')

  // Nome da empresa
  doc.setTextColor(...BLACK)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Santuário Nerd', ML, 14)

  // Subtítulo
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text('Controle Financeiro', ML, 20)

  // Período + data de geração (canto direito)
  const iniStr = fmtDate(periodo.inicio)
  const fimStr = fmtDate(periodo.fim)
  const periodoStr = iniStr === fimStr ? iniStr : `${iniStr} a ${fimStr}`
  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(`Período: ${periodoStr}`, PW - MR, 12, { align: 'right' })
  doc.text(`Gerado em: ${geradoEm}`, PW - MR, 17, { align: 'right' })

  hRule(doc, 24, LGRAY, 0.5)
  y = 30

  // ── KPIs em 4 boxes ────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Receita Total',      value: fmt(d.receita),    color: BLACK },
    { label: 'Custo Estimado',     value: fmt(d.custo),      color: AMBER },
    { label: 'Margem Bruta',       value: fmt(d.margem),     color: d.margem >= 0 ? GREEN : RED },
    { label: 'Crediários Abertos', value: fmt(d.crediarios), color: d.crediarios > 0 ? RED : GREEN },
  ]

  const boxW = CW / 4
  kpis.forEach((k, i) => {
    const x = ML + i * boxW
    // Borda sutil
    doc.setDrawColor(...LGRAY)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, boxW - 2, 18, 1, 1, 'S')
    // Label
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(k.label, x + (boxW - 2) / 2, y + 5.5, { align: 'center' })
    // Valor
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...k.color)
    doc.text(k.value, x + (boxW - 2) / 2, y + 13, { align: 'center' })
  })

  y += 24

  // ── Origem da Receita ──────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Origem da Receita', y)

  const pctC = d.receita > 0 ? (d.receitaComandas / d.receita * 100).toFixed(1) : '0.0'
  const pctA = d.receita > 0 ? (d.receitaAvulsa   / d.receita * 100).toFixed(1) : '0.0'

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Origem', 'Valor', '% do Total']],
    body: [
      ['Comandas (Mesas)',       fmt(d.receitaComandas), `${pctC}%`],
      ['Venda Avulsa (Balcão)', fmt(d.receitaAvulsa),   `${pctA}%`],
      ['Total',                  fmt(d.receita),          '100%'],
    ],
    headStyles: {
      fillColor: [240, 240, 245], textColor: BLACK,
      fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3,
    },
    bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.row.index === 2) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [235, 235, 245]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Formas de Pagamento ────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 40)
  y = sectionHeader(doc, 'Recebimentos por Forma de Pagamento', y)

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Forma de Pagamento', 'Transações', 'Total']],
    body: d.pagamentosPorForma.map(f => [
      FORMA_LABEL[f.forma] ?? f.forma,
      String(f.quantidade),
      fmt(f.total),
    ]),
    headStyles: {
      fillColor: [240, 240, 245], textColor: BLACK,
      fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3,
    },
    bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
  })

  y = doc.lastAutoTable.finalY + 6

  // Sub-tabelas de transações por forma
  for (const f of d.pagamentosPorForma) {
    if (!f.transacoes || f.transacoes.length === 0) continue

    y = checkPageBreak(doc, y, 20)

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY)
    doc.text(`Detalhe — ${FORMA_LABEL[f.forma] ?? f.forma}`, ML + 2, y)
    y += 4

    doc.autoTable({
      startY: y,
      margin: { left: ML + 2, right: MR },
      head: [['Origem', 'Cliente', 'Data / Hora', 'Valor']],
      body: f.transacoes.map(t => [
        t.origem === 'Comanda' ? 'Mesa' : 'Balcão',
        t.cliente ?? '—',
        fmtDt(t.data),
        fmt(t.valor),
      ]),
      headStyles: {
        fillColor: [245, 245, 248], textColor: GRAY,
        fontSize: 7, fontStyle: 'bold', lineColor: LGRAY, lineWidth: 0.2,
      },
      bodyStyles:  { fontSize: 7.5, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: WHITE },
      columnStyles: { 3: { halign: 'right' } },
    })

    y = doc.lastAutoTable.finalY + 7
  }

  // ── Top Produtos ───────────────────────────────────────────────────────────
  if (d.topProdutos.length > 0) {
    y = checkPageBreak(doc, y, 40)
    y = sectionHeader(doc, 'Top Produtos por Receita', y)

    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head: [['#', 'Produto', 'Qtd', 'Receita', 'Custo', 'Margem']],
      body: d.topProdutos.map((p, i) => [
        String(i + 1),
        p.nome,
        String(p.qtd),
        fmt(p.receita),
        fmt(p.custo),
        fmt(p.margem),
      ]),
      headStyles: {
        fillColor: [240, 240, 245], textColor: BLACK,
        fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3,
      },
      bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })

    y = doc.lastAutoTable.finalY + 10
  }

  // ── Receita Dia a Dia ──────────────────────────────────────────────────────
  if (d.diaDia.length > 1) {
    y = checkPageBreak(doc, y, 40)
    y = sectionHeader(doc, 'Receita Dia a Dia', y)

    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Data', 'Receita', 'Custo', 'Margem', 'Margem %']],
      body: d.diaDia.map(dia => {
        const margem = dia.receita - dia.custo
        const pct = dia.receita > 0 ? (margem / dia.receita * 100).toFixed(1) : '0.0'
        return [dia.dia, fmt(dia.receita), fmt(dia.custo), fmt(margem), `${pct}%`]
      }),
      headStyles: {
        fillColor: [240, 240, 245], textColor: BLACK,
        fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3,
      },
      bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    })
  }

  // ── Rodapé em todas as páginas ─────────────────────────────────────────────
  const total = doc.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    hRule(doc, 284, LGRAY, 0.3)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...LGRAY)
    doc.text('Santuário Nerd  ·  Documento confidencial  ·  Uso interno', ML, 289)
    doc.text(`Pág. ${i} / ${total}`, PW - MR, 289, { align: 'right' })
  }

  // ── Download ───────────────────────────────────────────────────────────────
  const nomePeriodo = iniStr === fimStr
    ? iniStr.replace(/\//g, '-')
    : `${iniStr.replace(/\//g, '-')}_${fimStr.replace(/\//g, '-')}`
  doc.save(`relatorio-financeiro-${nomePeriodo}.pdf`)
}
