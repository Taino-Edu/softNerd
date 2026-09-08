// =============================================================================
// printDeck.ts — Lista de deck em papel, pra conferência na mesa.
//
// O juiz confere o deck físico do jogador contra o que está registrado no
// sistema, e isso acontece longe da tela — daí o A4 com caixinha pra marcar
// carta por carta. Sem imagem: a folha é pra riscar, não pra enfeitar.
// =============================================================================

import { DeckCard } from '@/lib/api'
import { DeckAnalise } from '@/lib/deckRules'

export interface DeckParaImpressao {
  jogador: string
  numeroJogador?: number | null
  deckNome: string
  jogo: string
  formato?: string | null
  analise: DeckAnalise
}

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

function alertasHTML(a: DeckAnalise) {
  if (a.invalido) return '<p class="alerta">Deck ilegível — o conteúdo salvo não pôde ser lido.</p>'
  const itens: string[] = []
  if (a.faltando  > 0) itens.push(`Faltam ${a.faltando} carta(s) para as ${a.maxCards} do formato.`)
  if (a.excedendo > 0) itens.push(`${a.excedendo} carta(s) acima das ${a.maxCards} do formato.`)
  a.acimaDoLimite.forEach(c => itens.push(`${esc(c.name)}: ${c.quantity} cópias (limite ${c.limite}).`))
  if (itens.length === 0) return '<p class="ok">Sem irregularidades pelas regras do sistema.</p>'
  return `<ul class="alerta">${itens.map(i => `<li>${i}</li>`).join('')}</ul>`
}

function deckHTML(d: DeckParaImpressao, quebraDepois: boolean) {
  const linhas = d.analise.cartas.map((c: DeckCard, idx) => `
    <tr>
      <td align="center" class="check">☐</td>
      <td align="center">${idx + 1}</td>
      <td>${esc(c.name)}</td>
      <td>${c.setName ? esc(c.setName) : ''}${c.number ? ` · ${esc(c.number)}` : ''}</td>
      <td align="center" class="qtd">${c.quantity}</td>
    </tr>`).join('')

  return `
<section class="deck${quebraDepois ? ' quebra' : ''}">
  <h2>${esc(d.jogador)}${d.numeroJogador ? ` — jogador #${d.numeroJogador}` : ''}</h2>
  <p class="meta">
    Deck: <strong>${esc(d.deckNome)}</strong> · ${esc(d.jogo)}${d.formato ? ` · ${esc(d.formato)}` : ''}
    · <strong>${d.analise.total}</strong> cartas
  </p>
  ${alertasHTML(d.analise)}
  ${d.analise.cartas.length === 0 ? '<p class="vazio">Nenhuma carta registrada neste deck.</p>' : `
  <table>
    <thead><tr><th></th><th>#</th><th>Carta</th><th>Coleção</th><th>Qtd.</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`}
  <div class="assinatura">
    <div>Conferido por (juiz)</div>
    <div>${esc(d.jogador)}</div>
  </div>
</section>`
}

/** Abre a janela de impressão com um ou vários decks — um por página. */
export function printDecks(decks: DeckParaImpressao[], titulo: string) {
  if (decks.length === 0) return
  const w = window.open('', '_blank', 'width=760,height=800')
  if (!w) { alert('Permita pop-ups para gerar a folha de conferência'); return }

  const corpo = decks.map((d, i) => deckHTML(d, i < decks.length - 1)).join('')

  w.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Conferência de decks — Santuário Nerd</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  h2 { font-size: 15px; margin: 0 0 2px; }
  .cabecalho { border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 14px; }
  .aviso { display: inline-block; margin-top: 6px; padding: 3px 8px; border: 1px solid #bbb;
           border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #555; }
  .deck { margin-bottom: 18px; }
  .quebra { page-break-after: always; }
  .meta { color: #444; margin: 0 0 8px; }
  .alerta { color: #92400e; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px;
            padding: 6px 10px; margin: 0 0 10px; }
  .alerta li { margin-left: 4px; }
  .ok { color: #166534; background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px;
        padding: 6px 10px; margin: 0 0 10px; }
  .vazio { color: #666; font-style: italic; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 5px 6px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: .4px; }
  .check { font-size: 15px; width: 22px; }
  .qtd { font-weight: bold; width: 46px; }
  .assinatura { margin-top: 26px; display: flex; gap: 40px; }
  .assinatura div { flex: 1; border-top: 1px solid #999; padding-top: 4px; text-align: center;
                    font-size: 10px; color: #555; }
</style>
</head><body>
<div class="cabecalho">
  <h1>Santuário Nerd</h1>
  <p class="meta">${esc(titulo)} · ${new Date().toLocaleString('pt-BR')}</p>
  <span class="aviso">Conferência de decks — sem valor fiscal</span>
</div>
${corpo}
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`)
  w.document.close()
}
