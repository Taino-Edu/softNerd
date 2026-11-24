// lib/printComprovanteInscricao.ts — comprovante da inscrição em campeonato (v1.98.0, chave
// "comprovante-inscricao"). Abre uma janela pronta pra imprimir ou "Salvar como PDF" — o mesmo jeito da
// lista de conferência (lib/printConferencia). Os dados são os de Meus Campeonatos; o código é o mesmo do
// e-mail (EmailDaInscricao.Codigo: 8 primeiros hexadecimais do id da inscrição). Datas em Brasília.
import { brl, dataHoraBR } from '@/lib/format'

export interface ComprovanteInscricao {
  loja: string
  jogador: string
  participationId: string
  campeonato: string
  jogo: string
  inicio: string
  numeroDoJogador: number
  valorEmReais: number
  pagoEm?: string | null
  formaDePagamento?: string | null
}

export const codigoDaInscricao = (participationId: string) =>
  participationId.replace(/-/g, '').slice(0, 8).toUpperCase()

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function comprovanteHTML(c: ComprovanteInscricao) {
  const linhas: [string, string][] = [
    ['Campeonato', c.campeonato],
    ['Jogo', c.jogo],
    ['Data', dataHoraBR(c.inicio)],
    ['Jogador', c.jogador],
    ['Nº do jogador', `#${c.numeroDoJogador}`],
  ]
  if (c.valorEmReais > 0) {
    linhas.push(['Inscrição', brl(c.valorEmReais)])
    if (c.pagoEm) {
      linhas.push(['Pago via', c.formaDePagamento || 'Pix'])
      linhas.push(['Pago em', dataHoraBR(c.pagoEm)])
    }
  } else linhas.push(['Inscrição', 'Gratuita'])
  linhas.push(['Código da inscrição', codigoDaInscricao(c.participationId)])

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante de inscrição — ${esc(c.campeonato)}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111; max-width: 560px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .loja { color: #555; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; }
  td:first-child { color: #555; width: 45%; }
  td:last-child { font-weight: 700; }
  .ok { display: inline-block; background: #dcfce7; color: #166534; font-weight: 700; padding: 4px 10px; border-radius: 999px; margin-bottom: 16px; }
  .rodape { margin-top: 20px; color: #777; font-size: 12px; }
  @media print { body { margin: 12mm auto; } }
</style></head><body>
<h1>Comprovante de inscrição</h1>
<p class="loja">${esc(c.loja)}</p>
<span class="ok">Vaga garantida ✓</span>
<table>${linhas.map(([r, v]) => `<tr><td>${esc(r)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p class="rodape">Comprovante de inscrição, sem valor fiscal. Emitido em ${esc(dataHoraBR(new Date()))}.</p>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`
}

export function printComprovanteInscricao(c: ComprovanteInscricao) {
  const w = window.open('', '_blank', 'width=640,height=800')
  if (!w) { alert('Permita pop-ups para abrir o comprovante'); return }
  w.document.write(comprovanteHTML(c))
  w.document.close()
}
