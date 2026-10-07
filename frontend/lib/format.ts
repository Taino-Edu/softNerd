// =============================================================================
// lib/format.ts — Formatação única de dinheiro e datas
//
// Antes cada tela tinha o seu `fmt` (17 cópias) e ~116 `toFixed(2).replace`
// soltos; datas "de hoje" eram calculadas de 3 jeitos, um deles errado depois
// das 21h. Tudo de dinheiro e de data do front passa por aqui.
// =============================================================================

const FUSO = 'America/Sao_Paulo'

/** 1234.5 → "R$ 1.234,50" (mesmo formato dos PDFs). */
export function brl(valor: number | null | undefined): string {
  return `R$ ${numeroBR(valor ?? 0)}`
}

/** Centavos inteiros (como a API manda em *InCents) → "R$ 12,50". */
export const brlDeCentavos = (centavos: number | null | undefined) => brl((centavos ?? 0) / 100)

/** 1234.5 → "1.234,50" — número com duas casas, sem o "R$". */
export function numeroBR(valor: number): string {
  const [inteiro, decimal] = Math.abs(valor).toFixed(2).split('.')
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${valor < 0 ? '-' : ''}${comPontos},${decimal}`
}

// ── Datas (sempre no calendário de Brasília) ─────────────────────────────────

/**
 * Hoje em Brasília no formato YYYY-MM-DD. Nunca use
 * `new Date().toISOString().slice(0, 10)` — das 21h à meia-noite dá amanhã.
 */
export function hojeBrasil(): string {
  return dataISOBrasil(new Date())
}

/** Instante → dia (YYYY-MM-DD) no calendário de Brasília. */
export function dataISOBrasil(instante: Date | string): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: FUSO }).format(new Date(instante))
}

/** Soma dias a uma data YYYY-MM-DD sem depender do fuso do computador. */
export function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Instante (ISO da API) → "07/10/2026". */
export const dataBR = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO })

/** Instante (ISO da API) → "07/10/2026 14:30". */
export const dataHoraBR = (iso: string | Date) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: FUSO,
  })
