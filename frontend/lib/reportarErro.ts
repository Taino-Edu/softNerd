// =============================================================================
// lib/reportarErro.ts — avisa o Vigia quando uma tela quebra (POST /api/vigia/erro-tela)
//
// Sem axios e sem esperar resposta: a tela pode estar quebrada justamente no meio da
// sessão. Cada erro diferente vai no máximo uma vez por página aberta, e no máximo 5
// por página — um loop de erro não vira enxurrada. Falha no envio é ignorada.
// Quem chama: app/error.tsx, app/global-error.tsx e o RelatorDeErros (erros soltos).
// =============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
const enviados = new Set<string>()
const MAX_POR_PAGINA = 5

/** Ruído do navegador que não é erro do site. */
const IGNORAR = [/ResizeObserver loop/i, /Script error\.?$/i, /Non-Error promise rejection captured/i]

export function reportarErro(mensagem: string, detalhe?: string) {
  try {
    if (typeof window === 'undefined') return
    const msg = (mensagem || 'Erro sem mensagem').slice(0, 300)
    if (IGNORAR.some(r => r.test(msg))) return
    const rota = window.location.pathname
    const chave = rota + '|' + msg
    if (enviados.has(chave) || enviados.size >= MAX_POR_PAGINA) return
    enviados.add(chave)

    const corpo = JSON.stringify({ mensagem: msg, rota, detalhe: detalhe?.slice(0, 1500) })
    fetch(`${BASE_URL}/api/vigia/erro-tela`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
      credentials: 'include',
      keepalive: true,
    }).catch(() => { /* sem rede: paciência */ })
  } catch { /* nunca deixar o relator quebrar a tela */ }
}
