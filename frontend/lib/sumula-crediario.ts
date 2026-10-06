// =============================================================================
// lib/sumula-crediario.ts — Súmula de uma conta de crediário em PDF
// A tela mostra o resumo (itens somados); a súmula é o papel completo: resumo
// dos itens, extrato com data/hora de cada compra, pagamento e estorno (e de
// onde veio cada um), saldo correndo, itens por compra e lembretes enviados.
// Mesmo visual dos outros relatórios (relatorio-admin.ts): branco, sem gastar tinta.
// =============================================================================

import { CrediariosDto, LancamentoCrediarioDto } from './api'
import { agruparItens, totalUnidades } from './crediario'

async function getJsPDF() {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  return jsPDF
}

const BLACK  = [20, 20, 20]    as [number, number, number]
const GRAY   = [100, 100, 100] as [number, number, number]
const LGRAY  = [180, 180, 180] as [number, number, number]
const BGROW  = [248, 248, 248] as [number, number, number]
const WHITE  = [255, 255, 255] as [number, number, number]
const ACCENT = [79, 70, 229]   as [number, number, number]
const GREEN  = [22, 163, 74]   as [number, number, number]
const RED    = [220, 38, 38]   as [number, number, number]
const AMBER  = [180, 120, 0]   as [number, number, number]

const PW = 210; const ML = 14; const MR = 14; const CW = PW - ML - MR

const ORIGEM: Record<string, string> = {
  Comanda:     'Comanda',
  VendaAvulsa: 'Venda no balcão',
  Manual:      'Lançamento manual',
  Ajuste:      'Itens adicionados na edição',
  Legado:      'Compras anteriores',
}

const FORMA: Record<string, string> = {
  Dinheiro:      'Dinheiro',
  Pix:           'Pix',
  CartaoCredito: 'Cartão de crédito',
  CartaoDebito:  'Cartão de débito',
}

const CANAL: Record<string, string> = { app: 'App', email: 'E-mail', whatsapp: 'WhatsApp' }

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function origemDe(l: LancamentoCrediarioDto) {
  const nome = ORIGEM[l.origem] ?? l.origem
  if (l.origem === 'Legado') return `${nome} (antes do detalhamento por compra)`
  return l.descricao && l.origem !== 'Ajuste' ? `${nome} — ${l.descricao}` : nome
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any

function hRule(doc: Doc, y: number, color = LGRAY) {
  doc.setDrawColor(...color); doc.setLineWidth(0.2)
  doc.line(ML, y, PW - MR, y)
}

function secao(doc: Doc, y: number, titulo: string) {
  if (y > 255) { doc.addPage(); y = 18 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAY)
  doc.text(titulo.toUpperCase(), ML, y)
  hRule(doc, y + 2)
  return y + 7
}

const tabelaBase = {
  styles:             { fontSize: 8, cellPadding: 2.2, textColor: BLACK },
  alternateRowStyles: { fillColor: BGROW },
  margin:             { left: ML, right: MR },
}

/**
 * `paraCliente`: versão que o próprio cliente baixa no perfil — título "Extrato",
 * sem observações internas dos pagamentos (txid etc.) e sem a lista de lembretes.
 */
export async function gerarSumulaCrediario(
  c: CrediariosDto, nomeLoja = 'Santuário Nerd', opcoes: { paraCliente?: boolean } = {},
) {
  const paraCliente = !!opcoes.paraCliente
  const titulo      = paraCliente ? 'Extrato do Crediário' : 'Súmula do Crediário'
  const JsPDF = await getJsPDF()
  const doc: Doc = new (JsPDF as Doc)({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const compras    = [...c.lancamentos].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const ativas     = compras.filter(l => !l.estornadoEm)
  const todosItens = ativas.flatMap(l => l.itens)
  const resumo     = agruparItens(todosItens).sort((a, b) => b.subtotalInReais - a.subtotalInReais)

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(...ACCENT); doc.rect(0, 0, PW, 1.5, 'F')
  let y = 12
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...BLACK)
  doc.text(nomeLoja, ML, y)
  doc.setFontSize(11)
  doc.text(titulo, PW - MR, y, { align: 'right' })
  y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY)
  doc.text(`Cliente: ${c.userName}${c.userEmail ? `  ·  ${c.userEmail}` : ''}`, ML, y)
  doc.setFontSize(8)
  doc.text(`Emitido em ${dataHora(new Date().toISOString())}`, PW - MR, y, { align: 'right' })
  y += 5
  doc.text(
    `Conta aberta em ${dataHora(c.dataAbertura)}  ·  Vencimento ${data(c.dataVencimento)}` +
    (c.dataPagamento ? `  ·  Quitada em ${dataHora(c.dataPagamento)}` : ''),
    ML, y)
  y += 4; hRule(doc, y, ACCENT); y += 6

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const situacao = c.status === 'Pago' ? 'Quitada' : c.vencido ? `Vencida há ${Math.abs(c.diasRestantes)}d` : 'Em aberto'
  const kpis: { label: string; value: string; color: [number, number, number] }[] = [
    { label: 'Total da conta', value: brl(c.valorEmReais),          color: BLACK },
    { label: 'Pago',           value: brl(c.valorPagoEmReais),      color: GREEN },
    { label: 'Saldo',          value: brl(c.saldoRestanteEmReais),  color: c.saldoRestanteEmReais > 0 ? AMBER : GREEN },
    { label: 'Situação',       value: situacao,                     color: c.vencido ? RED : c.status === 'Pago' ? GREEN : BLACK },
  ]
  const w = CW / kpis.length
  kpis.forEach((k, i) => {
    const x = ML + i * w
    doc.setFillColor(...BGROW); doc.roundedRect(x + 1, y, w - 2, 16, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...k.color)
    doc.text(k.value, x + (w - 2) / 2, y + 7, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY)
    doc.text(k.label, x + (w - 2) / 2, y + 13, { align: 'center' })
  })
  y += 22

  // ── Resumo dos itens (tudo somado) ─────────────────────────────────────────
  if (resumo.length > 0) {
    y = secao(doc, y, `Resumo dos itens — ${totalUnidades(todosItens)} unidades`)
    doc.autoTable({
      ...tabelaBase,
      startY: y,
      head: [['Produto', 'Qtd', 'Preço unit.', 'Total']],
      body: resumo.map(i => [i.itemName, String(i.quantity), brl(i.unitPriceInReais), brl(i.subtotalInReais)]),
      foot: [['', String(totalUnidades(todosItens)), '', brl(resumo.reduce((s, i) => s + i.subtotalInReais, 0))]],
      headStyles: { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold' },
      footStyles: { fillColor: WHITE, textColor: BLACK, fontStyle: 'bold' },
      columnStyles: {
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Extrato: compras, estornos e pagamentos em ordem, com saldo ────────────
  type Linha = { quando: string; tipo: string; origem: string; valor: number }
  const linhas: Linha[] = []
  for (const l of compras) {
    linhas.push({ quando: l.createdAt, tipo: 'Compra', origem: origemDe(l), valor: l.valorEmReais })
    if (l.estornadoEm)
      linhas.push({ quando: l.estornadoEm, tipo: 'Estorno', origem: origemDe(l), valor: -l.valorEmReais })
  }
  for (const p of c.pagamentos)
    linhas.push({
      quando: p.createdAt, tipo: 'Pagamento',
      origem: (FORMA[p.formaPagamento] ?? p.formaPagamento) + (!paraCliente && p.observacao ? ` — ${p.observacao}` : ''),
      valor: -p.valorEmReais,
    })
  linhas.sort((a, b) => a.quando.localeCompare(b.quando))

  // Valor da conta editado à mão: a diferença entra como ajuste pra o saldo fechar
  const somaCompras = ativas.reduce((s, l) => s + l.valorEmReais, 0)
  const ajuste = compras.length > 0 ? c.valorEmReais - somaCompras : 0
  if (Math.abs(ajuste) >= 0.01)
    linhas.push({ quando: '', tipo: 'Ajuste', origem: 'Ajuste manual no valor da conta', valor: ajuste })

  let saldo = 0
  const corpo = linhas.map(l => {
    saldo += l.valor
    return [
      l.quando ? dataHora(l.quando) : '—',
      l.tipo,
      l.origem.length > 70 ? l.origem.slice(0, 67) + '...' : l.origem,
      // Hífen comum: o '−' (U+2212) não existe na fonte padrão do PDF e vira lixo
      (l.valor < 0 ? '- ' : '+ ') + brl(Math.abs(l.valor)),
      brl(Math.max(0, saldo)),
    ]
  })

  y = secao(doc, y, 'Extrato da conta')
  doc.autoTable({
    ...tabelaBase,
    startY: y,
    head: [['Data e hora', 'Tipo', 'Origem / forma', 'Valor', 'Saldo']],
    body: corpo,
    headStyles: { fillColor: BLACK, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 20 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(d: Doc) {
      if (d.section !== 'body' || d.column.index !== 3) return
      const tipo = d.row.raw[1]
      d.cell.styles.textColor = tipo === 'Pagamento' ? GREEN : tipo === 'Estorno' ? RED : BLACK
    },
  })
  y = doc.lastAutoTable.finalY + 8

  // ── Itens de cada compra ───────────────────────────────────────────────────
  const comItens = compras.filter(l => l.itens.length > 0)
  if (comItens.length > 0) {
    y = secao(doc, y, 'Itens de cada compra')
    for (const l of comItens) {
      if (y > 260) { doc.addPage(); y = 18 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.setTextColor(...(l.estornadoEm ? RED : BLACK))
      doc.text(`${dataHora(l.createdAt)}  ·  ${origemDe(l)}${l.estornadoEm ? '  (ESTORNADA)' : ''}`, ML, y)
      if (l.valorEmReais > 0) doc.text(brl(l.valorEmReais), PW - MR, y, { align: 'right' })
      y += 1.5
      doc.autoTable({
        ...tabelaBase,
        startY: y,
        showHead: 'never',
        body: agruparItens(l.itens).map(i => [`${i.quantity}×  ${i.itemName}`, brl(i.unitPriceInReais), brl(i.subtotalInReais)]),
        styles: { ...tabelaBase.styles, fontSize: 7.5, cellPadding: 1.5, textColor: l.estornadoEm ? GRAY : BLACK },
        columnStyles: { 1: { cellWidth: 28, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' } },
      })
      y = doc.lastAutoTable.finalY + 5
    }
  }

  // ── Lembretes enviados ─────────────────────────────────────────────────────
  if (!paraCliente && c.avisos.length > 0) {
    y = secao(doc, y + 2, 'Lembretes de vencimento enviados')
    doc.autoTable({
      ...tabelaBase,
      startY: y,
      head: [['Data e hora', 'Como', 'Canais', 'Observação']],
      body: [...c.avisos].reverse().map(a => [
        dataHora(a.enviadoEm),
        a.automatico ? 'Automático' : 'Manual',
        a.canais.map(k => CANAL[k] ?? k).join(', ') || '—',
        a.falhas ?? '',
      ]),
      headStyles: { fillColor: GRAY, textColor: WHITE, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 22 }, 2: { cellWidth: 40 } },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Assinatura ─────────────────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); y = 30 } else y += 12
  doc.setDrawColor(...GRAY); doc.setLineWidth(0.2)
  doc.line(ML, y, ML + 80, y)
  doc.line(PW - MR - 80, y, PW - MR, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY)
  doc.text(c.userName, ML, y + 4)
  doc.text(nomeLoja, PW - MR - 80, y + 4)

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    hRule(doc, 285)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...LGRAY)
    doc.text(`${nomeLoja} — ${titulo} de ${c.userName}`, ML, 290)
    doc.text(`${i} / ${paginas}`, PW - MR, 290, { align: 'right' })
  }

  const nomeArquivo = `${paraCliente ? 'extrato' : 'sumula'}-crediario-${c.userName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${data(c.dataAbertura).replace(/\//g, '-')}.pdf`
  doc.save(nomeArquivo)
}
