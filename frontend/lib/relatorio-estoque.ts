// =============================================================================
// lib/relatorio-estoque.ts — Relatórios de Estoque PDF padrão enterprise
// Mesmo estilo visual do relatorio.ts (Santuário Nerd)
// =============================================================================

import { Product, ProductCategory } from './api'
import { brl as fmt } from './format'

async function getJsPDF() {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  return jsPDF
}

// ── Paleta (espelha relatorio.ts) ─────────────────────────────────────────────
const BLACK  = [20,  20,  20]  as [number, number, number]
const GRAY   = [100, 100, 100] as [number, number, number]
const LGRAY  = [180, 180, 180] as [number, number, number]
const BGROW  = [248, 248, 248] as [number, number, number]
const WHITE  = [255, 255, 255] as [number, number, number]
const ACCENT = [79,  70,  229] as [number, number, number]
const GREEN  = [22,  163, 74]  as [number, number, number]
const RED    = [220, 38,  38]  as [number, number, number]
const AMBER  = [180, 120, 0]   as [number, number, number]
const TEAL   = [13,  148, 136] as [number, number, number]

const PW = 210
const ML = 14
const MR = 14
const CW = PW - ML - MR

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function diasSemMov(updatedAt: string): number {
  const diff = Date.now() - new Date(updatedAt).getTime()
  return Math.floor(diff / 86_400_000)
}

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
function checkPageBreak(doc: any, y: number, needed = 30): number {
  if (y + needed > 278) { doc.addPage(); return 16 }
  return y
}
function addFooters(doc: any) {
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
}
function drawHeader(doc: any, subtitle: string): number {
  // Faixa colorida no topo
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, PW, 1.5, 'F')
  // Empresa
  doc.setTextColor(...BLACK)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Santuário Nerd', ML, 14)
  // Subtítulo
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(subtitle, ML, 20)
  // Data de geração
  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  doc.setFontSize(8)
  doc.text(`Gerado em: ${geradoEm}`, PW - MR, 17, { align: 'right' })
  hRule(doc, 24, LGRAY, 0.5)
  return 30
}
function drawKpis(doc: any, y: number, kpis: { label: string; value: string; color: [number,number,number] }[]): number {
  const boxW = CW / kpis.length
  kpis.forEach((k, i) => {
    const x = ML + i * boxW
    doc.setDrawColor(...LGRAY)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, boxW - 2, 18, 1, 1, 'S')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(k.label, x + (boxW - 2) / 2, y + 5.5, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...k.color)
    doc.text(k.value, x + (boxW - 2) / 2, y + 13, { align: 'center' })
  })
  return y + 24
}

// =============================================================================
// RELATÓRIO OPERACIONAL
// Lista completa de produtos com valores, custos e movimentação
// =============================================================================
export async function gerarRelatorioOperacional(
  products: Product[],
  _categories: ProductCategory[],
) {
  const JsPDF = await getJsPDF()
  const doc = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any

  const ativos   = products.filter(p => p.isActive)
  const patrimonio    = ativos.reduce((s, p) => s + p.costPriceInCents  / 100 * p.stockQuantity, 0)
  const valPotencial  = ativos.reduce((s, p) => s + p.priceInCents      / 100 * p.stockQuantity, 0)
  const semEstoque    = ativos.filter(p => p.stockQuantity === 0).length
  const semCusto      = ativos.filter(p => p.costPriceInCents === 0).length

  let y = drawHeader(doc, 'Relatório Operacional de Estoque')

  y = drawKpis(doc, y, [
    { label: 'Patrimônio em Estoque',   value: fmt(patrimonio),          color: ACCENT },
    { label: 'Valor Potencial de Vendas', value: fmt(valPotencial),      color: TEAL },
    { label: 'Total de SKUs Ativos',    value: String(ativos.length),    color: BLACK },
    { label: 'Itens sem Estoque',       value: String(semEstoque),       color: semEstoque > 0 ? RED : GREEN },
  ])

  if (semCusto > 0) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...AMBER)
    doc.text(`⚠  ${semCusto} produto${semCusto > 1 ? 's' : ''} sem custo cadastrado — patrimônio subestimado`, ML, y)
    y += 6
  }

  y = sectionHeader(doc, 'Inventário Completo de Produtos', y)

  // Ordena: por categoria, depois nome
  const sorted = [...ativos].sort((a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [['#', 'Produto', 'Categoria', 'Custo', 'Venda', 'Margem%', 'Qtd', 'Mín.', 'Valor Estoque', 'Mov. (dias)']],
    body: sorted.map((p, i) => {
      const valorEstoque = (p.costPriceInCents / 100) * p.stockQuantity
      const dias = diasSemMov(p.updatedAt)
      return [
        String(i + 1),
        p.name,
        p.category,
        p.costPriceInCents > 0 ? fmt(p.costPriceInCents / 100) : '—',
        fmt(p.priceInCents / 100),
        p.costPriceInCents > 0 ? `${p.marginPercent.toFixed(1)}%` : '—',
        String(p.stockQuantity),
        String(p.minimumStock ?? 5),
        p.costPriceInCents > 0 && p.stockQuantity > 0 ? fmt(valorEstoque) : '—',
        String(dias),
      ]
    }),
    headStyles: {
      fillColor: [240, 240, 245], textColor: BLACK,
      fontStyle: 'bold', fontSize: 7.5, lineColor: LGRAY, lineWidth: 0.3,
    },
    bodyStyles:  { fontSize: 7.5, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: {
      0: { halign: 'center', cellWidth: 7 },
      1: { cellWidth: 48 },
      2: { cellWidth: 28 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 10 },
      7: { halign: 'center', cellWidth: 10 },
      8: { halign: 'right', cellWidth: 22 },
      9: { halign: 'center', cellWidth: 17 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body') {
        const prod = sorted[data.row.index]
        if (!prod) return
        // Linha zerada em vermelho claro
        if (prod.stockQuantity === 0) data.cell.styles.textColor = [200, 50, 50]
        // Estoque crítico em âmbar
        else if (prod.isLowStock) data.cell.styles.textColor = [160, 100, 0]
        // Dias parado: > 60 dias em âmbar, > 120 em vermelho
        if (data.column.index === 9) {
          const dias = parseInt(data.cell.text[0] ?? '0')
          if (dias > 120) data.cell.styles.textColor = [200, 50, 50]
          else if (dias > 60) data.cell.styles.textColor = [160, 100, 0]
          else data.cell.styles.textColor = [22, 163, 74]
        }
      }
    },
  })

  addFooters(doc)
  doc.save(`estoque-operacional-${fmtDate(new Date()).replace(/\//g, '-')}.pdf`)
}

// =============================================================================
// RELATÓRIO GERENCIAL
// Visão executiva: patrimônio, categorias, críticos, parados
// =============================================================================
export async function gerarRelatorioGerencial(
  products: Product[],
  _categories: ProductCategory[],
) {
  const JsPDF = await getJsPDF()
  const doc = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any

  const ativos = products.filter(p => p.isActive)
  const comEstoque = ativos.filter(p => p.stockQuantity > 0)
  const patrimonio = comEstoque.reduce((s, p) => s + (p.costPriceInCents / 100) * p.stockQuantity, 0)
  const valPotencial = comEstoque.reduce((s, p) => s + (p.priceInCents / 100) * p.stockQuantity, 0)
  const margemPotencial = patrimonio > 0 ? ((valPotencial - patrimonio) / valPotencial * 100) : 0
  const criticos = ativos.filter(p => p.stockQuantity > 0 && p.stockQuantity <= (p.minimumStock ?? 5))
  const zerados  = ativos.filter(p => p.stockQuantity === 0)
  const semCusto = ativos.filter(p => p.costPriceInCents === 0 && p.stockQuantity > 0)
  const capitalRisco = criticos.reduce((s, p) => s + (p.costPriceInCents / 100) * p.stockQuantity, 0)

  let y = drawHeader(doc, 'Relatório Gerencial de Estoque')

  y = drawKpis(doc, y, [
    { label: 'Patrimônio Imobilizado', value: fmt(patrimonio),             color: ACCENT },
    { label: 'Margem Potencial',       value: `${margemPotencial.toFixed(1)}%`, color: margemPotencial >= 30 ? GREEN : AMBER },
    { label: 'SKUs com Estoque',       value: String(comEstoque.length),   color: BLACK },
    { label: 'Capital em Risco',       value: fmt(capitalRisco),           color: capitalRisco > 0 ? RED : GREEN },
  ])

  // ── 1. Breakdown por Categoria ─────────────────────────────────────────────
  y = sectionHeader(doc, '1. Patrimônio por Categoria', y)

  const catMap = new Map<string, { skus: number; qtd: number; patrimonio: number; potencial: number }>()
  for (const p of ativos) {
    const e = catMap.get(p.category) ?? { skus: 0, qtd: 0, patrimonio: 0, potencial: 0 }
    e.skus++
    e.qtd += p.stockQuantity
    e.patrimonio += (p.costPriceInCents / 100) * p.stockQuantity
    e.potencial  += (p.priceInCents / 100) * p.stockQuantity
    catMap.set(p.category, e)
  }
  const catRows = [...catMap.entries()]
    .sort((a, b) => b[1].patrimonio - a[1].patrimonio)

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Categoria', 'SKUs', 'Qtd Total', 'Patrimônio', 'Val. Potencial', '% Patrimônio']],
    body: catRows.map(([cat, e]) => [
      cat,
      String(e.skus),
      String(e.qtd),
      fmt(e.patrimonio),
      fmt(e.potencial),
      patrimonio > 0 ? `${(e.patrimonio / patrimonio * 100).toFixed(1)}%` : '—',
    ]),
    headStyles: { fillColor: [240, 240, 245], textColor: BLACK, fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3 },
    bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    foot: [['TOTAL', String(ativos.length), String(ativos.reduce((s, p) => s + p.stockQuantity, 0)), fmt(patrimonio), fmt(valPotencial), '100%']],
    footStyles: { fillColor: [235, 235, 245], textColor: BLACK, fontStyle: 'bold', fontSize: 8 },
  })
  y = doc.lastAutoTable.finalY + 10

  // ── 2. Top 10 Maior Patrimônio Imobilizado ────────────────────────────────
  y = checkPageBreak(doc, y, 50)
  y = sectionHeader(doc, '2. Top 10 — Maior Capital Imobilizado', y)

  const top10 = [...comEstoque]
    .filter(p => p.costPriceInCents > 0)
    .sort((a, b) => (b.costPriceInCents * b.stockQuantity) - (a.costPriceInCents * a.stockQuantity))
    .slice(0, 10)

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [['#', 'Produto', 'Categoria', 'Custo Unit.', 'Qtd', 'Patrimônio', '% do Total', 'Dias s/ Mov.']],
    body: top10.map((p, i) => {
      const pat = (p.costPriceInCents / 100) * p.stockQuantity
      const pct = patrimonio > 0 ? (pat / patrimonio * 100).toFixed(1) : '0.0'
      const dias = diasSemMov(p.updatedAt)
      return [
        String(i + 1), p.name, p.category,
        fmt(p.costPriceInCents / 100), String(p.stockQuantity),
        fmt(pat), `${pct}%`, String(dias),
      ]
    }),
    headStyles: { fillColor: [240, 240, 245], textColor: BLACK, fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3 },
    bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: BGROW },
    columnStyles: {
      0: { halign: 'center', cellWidth: 7 },
      3: { halign: 'right' }, 4: { halign: 'center' },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        const dias = parseInt(data.cell.text[0] ?? '0')
        if (dias > 120)     data.cell.styles.textColor = RED
        else if (dias > 60) data.cell.styles.textColor = AMBER
        else                data.cell.styles.textColor = GREEN
      }
    },
  })
  y = doc.lastAutoTable.finalY + 10

  // ── 3. Estoque Crítico (abaixo do mínimo) ─────────────────────────────────
  if (criticos.length > 0) {
    y = checkPageBreak(doc, y, 50)
    y = sectionHeader(doc, `3. Estoque Crítico — Abaixo do Mínimo (${criticos.length} produto${criticos.length > 1 ? 's' : ''})`, y)

    const sorted = [...criticos].sort((a, b) => a.stockQuantity - b.stockQuantity)
    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Produto', 'Categoria', 'Atual', 'Mínimo', 'Déficit', 'Valor em Risco', 'Ação Sugerida']],
      body: sorted.map(p => {
        const deficit = (p.minimumStock ?? 5) - p.stockQuantity
        const risco   = (p.costPriceInCents / 100) * deficit
        return [
          p.name, p.category,
          String(p.stockQuantity), String(p.minimumStock ?? 5),
          String(deficit),
          p.costPriceInCents > 0 ? fmt(risco) : '—',
          `Repor ${deficit} un.`,
        ]
      }),
      headStyles: { fillColor: [255, 240, 240], textColor: [150, 30, 30], fontStyle: 'bold', fontSize: 8, lineColor: [220, 180, 180], lineWidth: 0.3 },
      bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: {
        2: { halign: 'center' }, 3: { halign: 'center' },
        4: { halign: 'center', fontStyle: 'bold', textColor: RED as any },
        5: { halign: 'right' }, 6: { fontStyle: 'italic', textColor: AMBER as any },
      },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── 4. Estoque Zerado (parado total) ──────────────────────────────────────
  if (zerados.length > 0) {
    y = checkPageBreak(doc, y, 50)
    y = sectionHeader(doc, `4. Estoque Zerado — Sem Mercadoria (${zerados.length} produto${zerados.length > 1 ? 's' : ''})`, y)

    const sortedZ = [...zerados].sort((a, b) => diasSemMov(b.updatedAt) - diasSemMov(a.updatedAt))
    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Produto', 'Categoria', 'Preço Venda', 'Último Custo', 'Dias s/ Mov.', 'Disponível no Site']],
      body: sortedZ.map(p => [
        p.name, p.category,
        fmt(p.priceInCents / 100),
        p.costPriceInCents > 0 ? fmt(p.costPriceInCents / 100) : '—',
        String(diasSemMov(p.updatedAt)),
        p.showOnSite ? 'Sim (badge "Indisponível")' : 'Não',
      ]),
      headStyles: { fillColor: [245, 245, 250], textColor: BLACK, fontStyle: 'bold', fontSize: 8, lineColor: LGRAY, lineWidth: 0.3 },
      bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── 5. Patrimônio Não Mensurado (sem custo cadastrado) ────────────────────
  if (semCusto.length > 0) {
    y = checkPageBreak(doc, y, 50)
    y = sectionHeader(doc, `5. Patrimônio Não Mensurado — Sem Custo (${semCusto.length} produto${semCusto.length > 1 ? 's' : ''})`, y)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...AMBER)
    doc.text('Estes produtos estão em estoque mas não contribuem para o cálculo do patrimônio pois não têm custo cadastrado.', ML, y)
    y += 7

    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Produto', 'Categoria', 'Qtd em Estoque', 'Preço de Venda', 'Val. Potencial']],
      body: semCusto.map(p => [
        p.name, p.category,
        String(p.stockQuantity),
        fmt(p.priceInCents / 100),
        fmt((p.priceInCents / 100) * p.stockQuantity),
      ]),
      headStyles: { fillColor: [255, 248, 230], textColor: [120, 80, 0], fontStyle: 'bold', fontSize: 8, lineColor: [220, 190, 120], lineWidth: 0.3 },
      bodyStyles:  { fontSize: 8, textColor: BLACK, lineColor: LGRAY, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: BGROW },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
  }

  addFooters(doc)
  doc.save(`estoque-gerencial-${fmtDate(new Date()).replace(/\//g, '-')}.pdf`)
}
