// =============================================================================
// lib/api/client.ts — Cliente HTTP centralizado (axios + interceptors JWT)
//
// Segurança: os tokens JWT são armazenados como cookies HttpOnly pelo backend.
// O browser envia esses cookies automaticamente — não há manipulação manual
// de tokens no frontend, evitando exposição via JavaScript (proteção XSS).
// =============================================================================
import axios from 'axios'
import { clearAuth } from '../auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // withCredentials garante que o browser envie os cookies HttpOnly
  // (accessToken, refreshToken) em todas as requisições cross-origin.
  withCredentials: true,
})

// Mutex de refresh: evita múltiplas requisições simultâneas disparando vários refreshes
// quando o token expira com várias chamadas em paralelo na mesma página.
let refreshPromise: Promise<void> | null = null

async function doRefresh(): Promise<void> {
  // O refreshToken é enviado automaticamente via cookie HttpOnly (withCredentials).
  // O backend lê o cookie e retorna novos cookies — sem manipulação manual de tokens.
  await axios.post(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
}

/**
 * O refresh só é definitivo quando o backend responde 401/403: aí o token realmente
 * não vale mais. Timeout, 5xx e queda de rede não são sessão expirada — deslogar
 * nesses casos era o que tirava o lojista do sistema no meio do atendimento.
 */
function sessaoRealmenteExpirou(err: unknown): boolean {
  const status = statusDe(err)
  if (status === 401 || status === 403) return true
  // Sem resposta, timeout e 5xx nunca provam que a sessão expirou. Manter os
  // dados locais permite que o usuário continue assim que a rede voltar.
  return false
}

function statusDe(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/**
 * Régua específica da CHAMADA DE RENOVAÇÃO, mais larga que a de cima de propósito.
 *
 * Qualquer 4xx aqui significa que este cliente não consegue renovar: token ausente,
 * inválido, corpo recusado. Nenhum F5 muda isso, então insistir só prende o operador
 * numa tela de erro. Foi exatamente o que aconteceu — o endpoint devolvia 400 (corpo
 * vazio barrado pela validação antes da action), 400 não era 401, ninguém encerrava
 * nada, e a única saída era sair e entrar na mão.
 *
 * 5xx e queda de rede continuam de fora: esses são transitórios e derrubar a sessão
 * neles é o que tirava o lojista do sistema no meio do atendimento.
 */
function renovacaoFalhouDeVez(err: unknown): boolean {
  const status = statusDe(err)
  return status !== undefined && status >= 400 && status < 500
}

function encerrarSessao() {
  if (typeof window === 'undefined') return

  const path = window.location.pathname
  // Já está numa tela de autenticação: limpar e redirecionar só causaria um loop.
  if (path.startsWith('/login') || path.startsWith('/entrar')) return

  clearAuth()

  // Redireciona de acordo com o tipo de página:
  //   /admin/*   → /login   (painel de gestão)
  //   /cliente/* → /entrar, guardando pra onde voltar depois de entrar
  //   demais     → limpa cookies e fica na página (QR code, campeonatos, etc.)
  if (path.startsWith('/admin')) {
    window.location.href = '/login'
  } else if (path.startsWith('/cliente')) {
    const returnTo = encodeURIComponent(path + window.location.search)
    window.location.href = `/entrar?returnTo=${returnTo}`
  }
}

// Tenta renovar o token se receber 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      // As duas falhas possíveis daqui pra frente pedem réguas diferentes, por isso
      // os catches são separados.
      try {
        // Reutiliza o mesmo promise se já há um refresh em andamento
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => { refreshPromise = null })
        }
        await refreshPromise
      } catch (falhaNaRenovacao) {
        if (renovacaoFalhouDeVez(falhaNaRenovacao)) encerrarSessao()
        return Promise.reject(error)
      }

      // Renovação deu certo: repete a original com o cookie novo. O `await` não é
      // enfeite — sem ele a promise voltava crua e a rejeição dela passava longe
      // de qualquer catch, então "renovou mas ainda dá 401" não encerrava nada.
      try {
        return await api(original)
      } catch (falhaNaRepeticao) {
        if (sessaoRealmenteExpirou(falhaNaRepeticao)) encerrarSessao()
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)
