// =============================================================================
// lib/reportarErro.ts — avisa o Vigia quando uma tela quebra (POST /api/vigia/erro-tela)
//
// Sem axios e sem esperar resposta: a tela pode estar quebrada justamente no meio da
// sessão. Cada erro diferente vai no máximo uma vez por página aberta, e no máximo 5
// por página — um loop de erro não vira enxurrada. Falha no envio é ignorada.
// Pedaço do site de antes de um deploy (ChunkLoadError) recarrega a página uma vez em vez de quebrar.
// Quem chama: app/error.tsx, app/global-error.tsx e o RelatorDeErros (erros soltos).
// =============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
const enviados = new Set<string>()
const MAX_POR_PAGINA = 5

/**
 * Ruído que não é erro do site (passeio pelos alertas de 24/11, mesma lista no VigiaService.RuidoDeFora):
 * - "Java object is gone": script do navegador interno do Instagram/Facebook (iabjs://) ao fechar a aba;
 * - "Handshake was canceled": o servidor cortou a conexão do tempo real no meio (troca de tela, deploy);
 *   o SignalR religa sozinho;
 * - "Object Not Found Matching Id": o robô do Outlook/Bing que abre os links pra conferir.
 */
const IGNORAR = [
  /ResizeObserver loop/i, /Script error\.?$/i, /Non-Error promise rejection captured/i,
  /Java object is gone/i, /Handshake was canceled/i, /Object Not Found Matching Id/i,
]
/** Erro vindo de script que não é do site (extensão, navegador de app). */
const DE_FORA = /(iabjs|chrome-extension|moz-extension|safari-(web-)?extension):\/\//i

/**
 * Tela aberta antes de um deploy pedindo um pedaço do site que mudou: "Loading chunk 2619 failed" ou
 * "(0 , R.jq) is not a function" (página velha chamando função que o pacote novo não tem mais).
 */
const VERSAO_VELHA = [/ChunkLoadError/i, /Loading (CSS )?chunk [\w-]+ failed/i, /\(0 ?, ?[\w$]+\.[\w$]+\) is not a function/]
const CHAVE_RECARGA = 'recarregou-versao-nova'

/** Versão velha: recarrega a página uma vez (a cada 5 min) em vez de mostrar o erro. true = recarregando. */
function recarregarSeVersaoVelha(msg: string, detalhe?: string): boolean {
  if (!VERSAO_VELHA.some(r => r.test(msg) || (detalhe ? r.test(detalhe) : false))) return false
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE_RECARGA) ?? 0)
    if (Date.now() - ultima < 5 * 60_000) return false // já recarregou e voltou: aí é erro de verdade
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()))
  } catch { return false } // sem sessionStorage não dá pra evitar recarregar em loop
  window.location.reload()
  return true
}

export function reportarErro(mensagem: string, detalhe?: string) {
  try {
    if (typeof window === 'undefined') return
    const msg = (mensagem || 'Erro sem mensagem').slice(0, 300)
    if (IGNORAR.some(r => r.test(msg))) return
    if (detalhe && DE_FORA.test(detalhe)) return
    if (recarregarSeVersaoVelha(msg, detalhe)) return
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
