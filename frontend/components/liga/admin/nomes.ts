// Ajudantes da Central da Liguinha: comparar nomes e ler listas coladas.

/** "  José   da Silva " e "jose da silva" são o mesmo nome (mesma regra do servidor). */
export function normalizarNome(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean).join(' ').toLowerCase()
}

/**
 * Uma linha por jogador, na ordem da colocação. Aceita numeração na frente ("1.", "1º", "#1", "1)")
 * e o deck depois de " - ", " – ", " — ", ";" ou tab.
 */
export function lerLista(texto: string): { nome: string; deck: string | null }[] {
  return texto.split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^#?\s*\d+\s*(?:º|°|ª|\.|\)|-)?\s+/, ''))
    .map(l => {
      const [nome, ...resto] = l.split(/\s+[-–—]\s+|;|\t/)
      const deck = resto.join(' ').trim()
      return { nome: nome.trim(), deck: deck || null }
    })
    .filter(j => j.nome.length > 0)
}

/** Mesma pontuação do servidor (LigaMensalService): 1º=10, 2º=7, 3º=5, 4º=3, demais=1. */
export function pontosPorColocacao(p: number) {
  return p === 1 ? 10 : p === 2 ? 7 : p === 3 ? 5 : p === 4 ? 3 : 1
}

/** Data/hora no calendário de Brasília (nunca toISOString().slice(0, 10)). */
export function dataBR(iso: string, opcoes: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opcoes }).format(new Date(iso))
}

/** "2026-10" do instante, no calendário de Brasília. */
export function mesBR(iso: string) {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date(iso))
}
