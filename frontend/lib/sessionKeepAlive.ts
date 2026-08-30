// =============================================================================
// lib/sessionKeepAlive.ts — Mantém a sessão viva sem pedir login no meio do uso
//
// O logout automático vinha de três lugares:
//   1. o refresh só acontecia no painel admin (a área do cliente não renovava nada);
//   2. cada aba renovava por conta própria, e duas renovando juntas se derrubavam;
//   3. voltar de uma aba em segundo plano usava um token já vencido.
//
// Aqui a renovação é única pro navegador inteiro (as abas se coordenam por
// localStorage), roda em intervalo, ao voltar o foco e ao recuperar a internet.
// A correção do lado do servidor (sessão por dispositivo + janela de graça na
// rotação) está em AuthService.RefreshTokenAsync.
// =============================================================================
import axios from 'axios'
import { saveAuth, isLoggedIn } from './auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

/** Marca do último refresh bem-sucedido — compartilhada entre as abas. */
const LAST_REFRESH_KEY = 'auth-last-refresh'

/** Renovação periódica. Curto o bastante pra token de 8h nunca vencer com a aba aberta. */
const INTERVALO_MS = 20 * 60 * 1000

/** Se outra aba renovou há menos que isso, não renova de novo. */
const JANELA_COMPARTILHADA_MS = 5 * 60 * 1000

/** Ao voltar o foco, só renova se a última renovação já tem esta idade. */
const IDADE_PARA_RENOVAR_NO_FOCO_MS = 10 * 60 * 1000

function lidoDoStorage(): number {
  try {
    const raw = localStorage.getItem(LAST_REFRESH_KEY)
    return raw ? Number(raw) || 0 : 0
  } catch { return 0 }
}

function gravaNoStorage(ts: number) {
  try { localStorage.setItem(LAST_REFRESH_KEY, String(ts)) } catch {}
}

let emAndamento: Promise<void> | null = null

/**
 * Renova o access token. `idadeMinimaMs` evita corrida entre abas: se outra já
 * renovou dentro da janela, esta chamada vira no-op.
 */
export async function renovarSessao(idadeMinimaMs = JANELA_COMPARTILHADA_MS): Promise<void> {
  if (typeof window === 'undefined' || !isLoggedIn()) return
  if (emAndamento) return emAndamento

  const desde = Date.now() - lidoDoStorage()
  if (desde < idadeMinimaMs) return

  emAndamento = (async () => {
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
      if (res.data) saveAuth(res.data)
      gravaNoStorage(Date.now())
    } catch {
      // 401 real cai no interceptor do api.ts na próxima requisição, que decide
      // se desloga. Falha de rede aqui é só uma tentativa perdida.
    } finally {
      emAndamento = null
    }
  })()

  return emAndamento
}

/** Liga os gatilhos de renovação. Devolve a função de limpeza. */
export function iniciarKeepAlive(): () => void {
  if (typeof window === 'undefined') return () => {}

  const intervalo = window.setInterval(() => { renovarSessao() }, INTERVALO_MS)

  const aoVoltarOFoco = () => {
    if (document.visibilityState === 'visible') renovarSessao(IDADE_PARA_RENOVAR_NO_FOCO_MS)
  }
  // Voltar a ter internet costuma vir junto de uma leva de requisições: renova antes.
  const aoVoltarARede = () => { renovarSessao(0) }

  document.addEventListener('visibilitychange', aoVoltarOFoco)
  window.addEventListener('online', aoVoltarARede)

  return () => {
    window.clearInterval(intervalo)
    document.removeEventListener('visibilitychange', aoVoltarOFoco)
    window.removeEventListener('online', aoVoltarARede)
  }
}
