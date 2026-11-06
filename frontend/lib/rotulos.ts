// =============================================================================
// lib/rotulos.ts — Textos que a tela mostra a partir de valores crus da API
// (status de comanda, nome da mesa, telefone). Saiu do teste do fluxo do
// cliente no celular (06/11): "EMANDAMENTO", "Mesa Mesa 3" e "17999990611".
// =============================================================================

const STATUS_COMANDA: Record<string, string> = {
  Aberta:      'Aberta',
  EmAndamento: 'Em andamento',
  Fechada:     'Fechada',
  Cancelada:   'Cancelada',
  Estornada:   'Estornada',
}

/** "EmAndamento" → "Em andamento". Status desconhecido sai como veio. */
export const rotuloStatusComanda = (status: string | null | undefined) =>
  status ? STATUS_COMANDA[status] ?? status : ''

/**
 * Nome da mesa pro cliente: "3" → "Mesa 3"; quem digitou "Mesa 3" ou "mesa 3"
 * não vira "Mesa Mesa 3"; vazio → o texto de reserva.
 */
export function rotuloMesa(mesa: string | null | undefined, semMesa = 'Sua comanda'): string {
  const t = (mesa ?? '').trim()
  if (!t) return semMesa
  return /^mesa\b/i.test(t) ? `Mesa ${t.replace(/^mesa\s*/i, '')}`.trim() : `Mesa ${t}`
}

/**
 * Só os dígitos, no máximo 11 (DDD + celular). Número colado com o código do Brasil
 * ("+55 (17) 99112-2890") perde o 55 antes do corte — senão sumiam os 2 últimos dígitos (Codex, #147).
 */
export function soDigitosTelefone(v: string): string {
  const d = v.replace(/\D/g, '')
  return (d.length > 11 && d.startsWith('55') ? d.slice(2) : d).slice(0, 11)
}

/** "17999990611" → "(17) 99999-0611"; fixo "1733334444" → "(17) 3333-4444"; incompleto vai formando enquanto digita. */
export function telefoneBR(v: string | null | undefined): string {
  const d = soDigitosTelefone(v ?? '')
  if (d.length <= 2) return d ? `(${d}` : ''
  const ddd = d.slice(0, 2), resto = d.slice(2)
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  const meio = resto.length > 8 ? 5 : 4
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`
}
