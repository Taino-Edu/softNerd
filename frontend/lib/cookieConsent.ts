// =============================================================================
// cookieConsent.ts — Estado do consentimento de cookies (LGPD Art. 8°)
//
// A decisão do visitante é gravada em DOIS lugares, de propósito:
//
//   1. cookie de primeira parte com domain=.santuarionerd.com.br — vale para o
//      apex e para o www ao mesmo tempo. O localStorage é por origem, então
//      quem entrava pelo www via o banner de novo depois de já ter respondido
//      no domínio sem www; era esse o "ele sempre pede" relatado pela loja.
//   2. localStorage — sobrevive quando o cookie é bloqueado e serve de leitura
//      rápida no primeiro render.
//
// Categorias: só existem as que o sistema realmente usa. Não há analytics de
// terceiros nem pixel de publicidade no Santuário Nerd, e o banner diz isso em
// vez de oferecer um toggle que não liga nada.
// =============================================================================

export const CONSENT_KEY     = 'sn_cookie_consent'
export const CONSENT_VERSION = '2.0'

/** Disparado quando o visitante decide — quem depende da escolha se re-render. */
export const CONSENT_EVENT      = 'sn:cookie-consent-changed'
/** Disparado pelo rodapé para reabrir o banner já no modo "personalizar". */
export const OPEN_SETTINGS_EVENT = 'sn:open-cookie-settings'

/** Um ano: prazo usual de renovação do consentimento. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export type CookieConsent = {
  version: string
  /** Sessão, login e segurança. Sempre true — sem eles não há serviço. */
  necessary: true
  /** Tema, dispensa do convite de instalação e afins. Opcional. */
  preferences: boolean
  decidedAt: string
}

/** Chaves cosméticas que só podem ser gravadas com a categoria "preferences". */
export const OPTIONAL_STORAGE_KEYS = ['theme', 'landing-theme', 'pwa-dismissed']

// Guarda a decisão desta navegação quando o navegador recusa cookie e storage.
let volatileConsent: CookieConsent | null | undefined

export function createConsent(preferences: boolean, decidedAt = new Date().toISOString()): CookieConsent {
  return { version: CONSENT_VERSION, necessary: true, preferences, decidedAt }
}

export function parseConsent(value: string | null): CookieConsent | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<CookieConsent>
    if (
      parsed.version !== CONSENT_VERSION ||
      parsed.necessary !== true ||
      typeof parsed.preferences !== 'boolean' ||
      typeof parsed.decidedAt !== 'string'
    ) return null
    return parsed as CookieConsent
  } catch {
    // Formato antigo ('accepted' / 'rejected' em texto puro): a escolha precisa
    // ser refeita porque o banner de antes não dizia o que estava sendo aceito.
    return null
  }
}

function readCookie(): string | null {
  const match = document.cookie.split('; ').find(c => c.startsWith(`${CONSENT_KEY}=`))
  return match ? decodeURIComponent(match.slice(CONSENT_KEY.length + 1)) : null
}

/**
 * Grava o cookie no domínio mais abrangente possível: primeiro tenta o domínio
 * "pai" (.santuarionerd.com.br, que cobre o www), e cai para o host atual se o
 * navegador recusar — é o que acontece em localhost e em IP puro.
 */
function writeCookie(value: string) {
  const host  = window.location.hostname
  const parts = host.split('.')
  const parent = parts.length > 2 ? `.${parts.slice(-3).join('.')}` : null   // .santuarionerd.com.br
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  const base   = `${CONSENT_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`

  if (parent) {
    document.cookie = `${base}; Domain=${parent}`
    if (readCookie()) return
  }
  document.cookie = base
}

export function readConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null
  if (volatileConsent !== undefined) return volatileConsent

  const fromCookie = parseConsent(readCookie())
  if (fromCookie) return fromCookie

  try { return parseConsent(window.localStorage.getItem(CONSENT_KEY)) }
  catch { return null }
}

export function saveConsent(consent: CookieConsent) {
  const raw = JSON.stringify(consent)
  let persisted = false

  try { writeCookie(raw); persisted = !!readCookie() } catch { /* cookie bloqueado */ }

  try {
    window.localStorage.setItem(CONSENT_KEY, raw)
    window.localStorage.removeItem('cookieConsent')  // resquício do banner antigo
    persisted = true
  } catch { /* storage bloqueado */ }

  // Recusou as opcionais: apaga o que já estava guardado, senão a recusa só
  // valeria para o futuro e o que foi salvo antes continuaria no navegador.
  if (!consent.preferences) {
    try { OPTIONAL_STORAGE_KEYS.forEach(k => window.localStorage.removeItem(k)) } catch { /* ignore */ }
  }

  // Sem cookie e sem storage a decisão ainda vale nesta navegação — o banner
  // não pode voltar a aparecer a cada clique dentro do site.
  volatileConsent = persisted ? undefined : consent

  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }))
}

/** True quando o visitante liberou as preferências opcionais. */
export function allowsPreferences(): boolean {
  return readConsent()?.preferences === true
}

/**
 * Grava uma preferência cosmética respeitando a escolha do visitante.
 * Antes de decidir nada, deixa gravar: o padrão do site é funcionar, e a recusa
 * limpa essas chaves na hora em que for registrada.
 */
export function setOptionalItem(key: string, value: string) {
  try {
    if (readConsent()?.preferences === false) return
    window.localStorage.setItem(key, value)
  } catch { /* storage indisponível */ }
}
