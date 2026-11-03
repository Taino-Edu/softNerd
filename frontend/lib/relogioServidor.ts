// =============================================================================
// relogioServidor — "agora" na hora do servidor, não na do aparelho
//
// O timer da rodada vem com a hora em que ligou (startedAt, do servidor) e cada tela
// conta quanto passou com o relógio do próprio aparelho. Celular com a hora alguns
// segundos fora mostrava o tempo errado, e cada um diferente (Maikon, 03/11: "o timer
// da liga está com delay"). As respostas do timer trazem `agora` (hora do servidor);
// a diferença pro relógio do aparelho fica guardada e entra em toda conta de tempo.
// =============================================================================

/** Servidor − aparelho, em ms. Começa em 0 (sem resposta ainda, conta pelo aparelho). */
let diferenca = 0
/** Cada resposta acerta o relógio uma vez só: a tela recalcula a cada segundo com o mesmo objeto. */
const jaAcertou = new WeakSet<object>()

// Acerto fino (lib/api/client.ts mede a ida e volta de cada chamada que traz `agora`): a hora do
// servidor chegou atrasada pela rede, então vale a do meio da ida e volta — a mesma conta do NTP.
// A amostra de ida e volta mais curta é a mais precisa; ela vale por 1 min, depois entra a próxima.
const VALE_POR_MS = 60_000
let melhorIdaVolta = Infinity
let medidoEm = -Infinity

/** Acerto fino: hora do servidor + quando a chamada saiu e voltou (Date.now do aparelho). */
export function acertarComIdaEVolta(agora: string, saiu: number, voltou: number) {
  const servidor = new Date(agora).getTime()
  const idaVolta = voltou - saiu
  if (Number.isNaN(servidor) || idaVolta < 0) return
  const nova = servidor + idaVolta / 2 - voltou
  // Relógio do aparelho pulou (o Windows acertou a hora no meio da rodada): vale na hora, sem esperar
  const pulou = Math.abs(nova - diferenca) > 1000
  if (!pulou && idaVolta > melhorIdaVolta && voltou - medidoEm < VALE_POR_MS) return
  diferenca = nova
  melhorIdaVolta = idaVolta
  medidoEm = voltou
}

/**
 * Acerto pelo timer que veio na resposta, sem saber a ida e volta (resposta que não passou pelo
 * cliente da API). Só vale sem acerto fino recente; erra pela demora da rede (menos de 1 s),
 * e o erro do relógio do celular pode passar de minutos.
 */
export function acertarPeloServidor(dto: { agora?: string | null } | null | undefined) {
  if (!dto?.agora || jaAcertou.has(dto)) return
  jaAcertou.add(dto)
  if (Date.now() - medidoEm < VALE_POR_MS) return
  const servidor = new Date(dto.agora).getTime()
  if (!Number.isNaN(servidor)) diferenca = servidor - Date.now()
}

/** Date.now() na hora do servidor. */
export function agoraNoServidor(): number {
  return Date.now() + diferenca
}
