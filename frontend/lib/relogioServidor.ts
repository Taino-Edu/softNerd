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

/**
 * Acerta pela hora do servidor que veio na resposta. Chamado na primeira vez que a tela usa
 * aquele timer (milissegundos depois de chegar); a demora da rede fica de fora da conta — é
 * bem menos que 1 s, e o erro do relógio do celular pode passar de minutos.
 */
export function acertarPeloServidor(dto: { agora?: string | null } | null | undefined) {
  if (!dto?.agora || jaAcertou.has(dto)) return
  jaAcertou.add(dto)
  const servidor = new Date(dto.agora).getTime()
  if (!Number.isNaN(servidor)) diferenca = servidor - Date.now()
}

/** Date.now() na hora do servidor. */
export function agoraNoServidor(): number {
  return Date.now() + diferenca
}
