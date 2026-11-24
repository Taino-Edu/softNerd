// lib/printComprovanteCompra.ts — comprovante de compra do cliente (v1.99.0, chave "comprovante-compra").
// Botão "Comprovante" em Minha conta → Compras (comanda, balcão ou pedido do site). Mesmo conteúdo do e-mail
// (Services/Comprovantes/ComprovanteDeCompra.cs) e mesmo código: os 8 últimos hexadecimais do id. Abre a janela
// pronta pra imprimir ou "Salvar como PDF", como a conferência (lib/printConferencia). Datas em Brasília.
import { brl, dataHoraBR } from '@/lib/format'

export interface ComprovanteCompra {
  loja: string
  cliente: string
  id: string
  origem: string
  quando: string
  itens: { nome: string; quantidade: number; subtotalEmReais: number }[]
  descontoEmReais?: number
  pontosEmReais?: number
  totalEmReais: number
  /** Uma linha por forma ("Pix — R$ 10,00"). */
  pagamento: string[]
}

export const codigoDaCompra = (id: string) => {
  const hex = id.replace(/[^0-9a-fA-F]/g, '')
  return (hex.length > 8 ? hex.slice(-8) : hex).toUpperCase()
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function comprovanteCompraHTML(c: ComprovanteCompra) {
  const linhas = c.itens.map(i =>
    `<tr><td>${i.quantidade}× ${esc(i.nome)}</td><td class="v">${esc(brl(i.subtotalEmReais))}</td></tr>`)
  if (c.descontoEmReais && c.descontoEmReais > 0)
    linhas.push(`<tr><td>Desconto</td><td class="v">−${esc(brl(c.descontoEmReais))}</td></tr>`)
  if (c.pontosEmReais && c.pontosEmReais > 0)
    linhas.push(`<tr><td>Pontos usados</td><td class="v">−${esc(brl(c.pontosEmReais))}</td></tr>`)

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante de compra — ${esc(codigoDaCompra(c.id))}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111; max-width: 560px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  td.v { text-align: right; white-space: nowrap; }
  tr.total td { border-top: 2px solid #111; border-bottom: none; font-weight: 800; font-size: 16px; }
  .rotulo { color: #555; margin: 16px 0 4px; }
  .pag { font-weight: 700; margin: 0; }
  .rodape { margin-top: 20px; color: #777; font-size: 12px; }
  @media print { body { margin: 12mm auto; } }
</style></head><body>
<h1>Comprovante de compra</h1>
<p class="sub">${esc(c.loja)} · ${esc(c.origem)} · ${esc(dataHoraBR(c.quando))}</p>
<p class="sub">Cliente: <strong>${esc(c.cliente)}</strong></p>
<table>${linhas.join('')}<tr class="total"><td>Total</td><td class="v">${esc(brl(c.totalEmReais))}</td></tr></table>
<p class="rotulo">Pagamento</p>
<p class="pag">${c.pagamento.map(esc).join('<br>')}</p>
<p class="rotulo">Código da compra: <strong>${esc(codigoDaCompra(c.id))}</strong></p>
<p class="rodape">Comprovante de compra, sem valor fiscal. Emitido em ${esc(dataHoraBR(new Date()))}.</p>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`
}

export function printComprovanteCompra(c: ComprovanteCompra) {
  const w = window.open('', '_blank', 'width=640,height=800')
  if (!w) { alert('Permita pop-ups para abrir o comprovante'); return }
  w.document.write(comprovanteCompraHTML(c))
  w.document.close()
}
