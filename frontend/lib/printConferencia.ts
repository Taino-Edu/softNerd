// =============================================================================
// printConferencia.ts — lista de conferência dos itens (SEM valor fiscal)
//
// Papel que o balconista imprime ANTES de fechar a venda/comanda pra conferir
// item a item com o cliente na entrega. Não é DANFE, não é cupom fiscal e não
// substitui nenhum dos dois — a emissão fiscal continua no fluxo do fechamento.
//
// Três formatos: 80mm (bobina padrão da térmica), 58mm (bobina menor) e A4,
// que é o que serve pra "salvar como PDF" na janela de impressão.
// =============================================================================

export type ConferenciaFormato = '80mm' | '58mm' | 'a4'

export const CONFERENCIA_FORMATOS: { value: ConferenciaFormato; label: string; hint: string }[] = [
  { value: '80mm', label: 'Bobina 80mm', hint: 'Térmica padrão' },
  { value: '58mm', label: 'Bobina 58mm', hint: 'Térmica menor' },
  { value: 'a4',   label: 'A4 / PDF',    hint: 'Salvar como PDF' },
]

export interface ConferenciaItem {
  name: string
  variantLabel?: string | null
  quantity: number
  unitPriceInCents: number
}

export interface ConferenciaOpts {
  items: ConferenciaItem[]
  totalInCents: number
  formato: ConferenciaFormato
  clienteNome?: string | null
  /** Contexto de onde veio: "Comanda #12 · Mesa 3", "Venda balcão"… */
  origem?: string | null
}

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const money = (cents: number) => `R$&nbsp;${(cents / 100).toFixed(2).replace('.', ',')}`

/** Bobina térmica: uma coluna, fonte monoespaçada, sem tabela larga. */
function bobinaHTML(o: ConferenciaOpts, larguraMm: 80 | 58) {
  const fonte    = larguraMm === 80 ? 12 : 10
  const unidades = o.items.reduce((s, i) => s + i.quantity, 0)

  const itemsHTML = o.items.map(({ name, variantLabel, quantity, unitPriceInCents }) => `
    <div class="item">
      <div class="linha1">☐ <strong>${quantity}×</strong> ${esc(name)}</div>
      ${variantLabel ? `<div class="var">${esc(variantLabel)}</div>` : ''}
      <div class="linha2">
        <span>${money(unitPriceInCents)} un.</span>
        <span><strong>${money(unitPriceInCents * quantity)}</strong></span>
      </div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Conferência de itens — Santuário Nerd</title>
<style>
  @page { size: ${larguraMm}mm auto; margin: ${larguraMm === 80 ? 4 : 3}mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: ${fonte}px; color: #000; padding: 4px; }
  h1 { font-size: ${fonte + 3}px; text-align: center; letter-spacing: 1px; }
  .aviso { text-align: center; font-size: ${fonte - 2}px; font-weight: bold; border: 1px solid #000;
           border-radius: 3px; padding: 2px; margin: 4px 0; }
  .meta { font-size: ${fonte - 2}px; text-align: center; margin-bottom: 4px; }
  hr { border: none; border-top: 1px dashed #666; margin: 5px 0; }
  .item { margin-bottom: 5px; }
  .linha1 { line-height: 1.25; }
  .var { font-size: ${fonte - 2}px; padding-left: 12px; }
  .linha2 { display: flex; justify-content: space-between; font-size: ${fonte - 1}px; padding-left: 12px; }
  .total { display: flex; justify-content: space-between; font-size: ${fonte + 2}px; font-weight: bold; }
  .resumo { font-size: ${fonte - 2}px; display: flex; justify-content: space-between; }
  .assinatura { margin-top: 22px; border-top: 1px solid #000; padding-top: 3px;
                text-align: center; font-size: ${fonte - 2}px; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>Santuário Nerd</h1>
<div class="aviso">CONFERÊNCIA — SEM VALOR FISCAL</div>
<p class="meta">${new Date().toLocaleString('pt-BR')}</p>
<p class="meta">Cliente: <strong>${o.clienteNome ? esc(o.clienteNome) : 'Balcão'}</strong></p>
${o.origem ? `<p class="meta">${esc(o.origem)}</p>` : ''}
<hr>
${itemsHTML}
<hr>
<div class="resumo">
  <span>${o.items.length} produto${o.items.length !== 1 ? 's' : ''}</span>
  <span>${unidades} unidade${unidades !== 1 ? 's' : ''}</span>
</div>
<div class="total"><span>TOTAL</span><span>${money(o.totalInCents)}</span></div>
<div class="assinatura">Recebido por (cliente)</div>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`
}

/** A4: tabela completa — é o formato pra salvar em PDF e arquivar. */
function a4HTML(o: ConferenciaOpts) {
  const unidades = o.items.reduce((s, i) => s + i.quantity, 0)

  const itemsHTML = o.items.map(({ name, variantLabel, quantity, unitPriceInCents }, idx) => `
    <tr>
      <td align="center" class="check">☐</td>
      <td align="center">${idx + 1}</td>
      <td>${esc(name)}${variantLabel ? `<br><span class="var">${esc(variantLabel)}</span>` : ''}</td>
      <td align="center" class="qtd">${quantity}</td>
      <td align="right">${money(unitPriceInCents)}</td>
      <td align="right"><strong>${money(unitPriceInCents * quantity)}</strong></td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Conferência de itens — Santuário Nerd</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
  h1 { font-size: 19px; margin-bottom: 2px; }
  .aviso { display: inline-block; margin: 6px 0 12px; padding: 3px 8px; border: 1px solid #bbb;
           border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #555; }
  .meta { color: #666; font-size: 11px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f4f4f8; text-align: left; padding: 5px 8px; font-size: 11px; color: #444; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  .check { font-size: 15px; color: #888; }
  .qtd { font-weight: bold; font-size: 13px; }
  .var { color: #7c3aed; font-size: 10px; }
  .total-row td { font-weight: bold; font-size: 14px; background: #f9f6ff; border-bottom: none; }
  .assinatura { margin-top: 34px; display: flex; gap: 40px; }
  .assinatura div { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #666; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>Santuário Nerd — Conferência de itens</h1>
<div class="aviso">Documento sem valor fiscal — uso interno / conferência na entrega</div>
<p class="meta">
  Cliente: <strong>${o.clienteNome ? esc(o.clienteNome) : 'Venda balcão'}</strong>
  ${o.origem ? `&nbsp;|&nbsp; ${esc(o.origem)}` : ''}
  &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleString('pt-BR')}
  &nbsp;|&nbsp; ${o.items.length} produto${o.items.length !== 1 ? 's' : ''} / ${unidades} unidade${unidades !== 1 ? 's' : ''}
</p>

<table>
  <thead><tr><th></th><th>#</th><th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead>
  <tbody>${itemsHTML}</tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="3">TOTAL</td>
      <td align="center">${unidades}</td>
      <td></td>
      <td align="right">${money(o.totalInCents)}</td>
    </tr>
  </tfoot>
</table>

<div class="assinatura">
  <div>Conferido por (loja)</div>
  <div>Recebido por (cliente)</div>
</div>

<script>window.onload = function() { window.print(); }<\/script>
</body></html>`
}

export function printConferencia(o: ConferenciaOpts) {
  if (o.items.length === 0) return
  const largura = o.formato === 'a4' ? 700 : 420
  const w = window.open('', '_blank', `width=${largura},height=800`)
  if (!w) { alert('Permita pop-ups para gerar a lista de conferência'); return }

  w.document.write(o.formato === 'a4' ? a4HTML(o) : bobinaHTML(o, o.formato === '80mm' ? 80 : 58))
  w.document.close()
}
