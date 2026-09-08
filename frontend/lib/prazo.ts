// =============================================================================
// prazo.ts — Formatação de contagem regressiva.
// Usada onde o cliente precisa ver quanto tempo ainda tem (vaga de campeonato
// segurada esperando o Pix, por enquanto).
// =============================================================================

/** Milissegundos → "mm:ss", ou "h:mm:ss" quando passa de uma hora. Nunca negativo. */
export function fmtRestante(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dois = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`
}
