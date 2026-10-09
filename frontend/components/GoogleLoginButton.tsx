'use client'

// =============================================================================
// GoogleLoginButton — "Entrar com Google" (Google Identity Services)
//
// Escondido enquanto o servidor não tiver GoogleAuth:ClientId (GET /api/auth/google/config).
// O Google devolve um ID token; o servidor confere e cria/liga a conta pelo e-mail
// verificado (CardGameStore/Services/Implementations/LoginGoogle.cs).
// Com `mesa`, já abre a comanda da mesa do QR Code.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { authApi, AuthResponse } from '@/lib/api'
import { saveAuth } from '@/lib/auth'

interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

const SCRIPT_ID = 'google-identity-services'

function carregarScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((ok, falha) => {
    const existente = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const s = existente ?? document.createElement('script')
    s.addEventListener('load', () => ok())
    s.addEventListener('error', () => falha(new Error('script do Google não carregou')))
    if (!existente) {
      s.id = SCRIPT_ID
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      document.head.appendChild(s)
    }
  })
}

export default function GoogleLoginButton({
  mesa, onEntrou, onErro, texto = 'signin_with', comOu = false, claro = false,
}: {
  mesa?: string
  onEntrou: (data: AuthResponse) => void
  onErro?: (mensagem: string) => void
  /** Texto do botão do Google: "signin_with" (Fazer login com o Google) ou "continue_with". */
  texto?: 'signin_with' | 'continue_with'
  /** Mostra um "ou" antes do botão (só aparece junto com ele). */
  comOu?: boolean
  /** Fundo branco fixo (tela da mesa), em vez das cores do tema. */
  claro?: boolean
}) {
  const alvo = useRef<HTMLDivElement>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const onEntrouRef = useRef(onEntrou); onEntrouRef.current = onEntrou
  const onErroRef = useRef(onErro); onErroRef.current = onErro

  useEffect(() => {
    authApi.googleConfig().then(r => setClientId(r.data.clientId)).catch(() => setClientId(null))
  }, [])

  useEffect(() => {
    if (!clientId || !alvo.current) return
    let cancelado = false
    carregarScript().then(() => {
      if (cancelado || !alvo.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            const { data } = await authApi.google(credential, mesa)
            saveAuth(data)
            onEntrouRef.current(data)
          } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
            onErroRef.current?.(msg ?? 'Não deu pra entrar com o Google. Tente de novo.')
          }
        },
      })
      window.google.accounts.id.renderButton(alvo.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: texto, locale: 'pt-BR',
        width: Math.min(alvo.current.offsetWidth || 320, 400),
      })
    }).catch(() => { /* sem Google (bloqueado/offline): o resto da tela segue funcionando */ })
    return () => { cancelado = true }
  }, [clientId, mesa, texto])

  if (!clientId) return null
  return (
    <div className="w-full space-y-3">
      {comOu && (
        <div className={`flex items-center gap-3 text-xs ${claro ? 'text-gray-400' : 'text-gray-500'}`}>
          <span className={`h-px flex-1 ${claro ? 'bg-gray-200' : 'bg-surface-500'}`} /> ou <span className={`h-px flex-1 ${claro ? 'bg-gray-200' : 'bg-surface-500'}`} />
        </div>
      )}
      <div ref={alvo} className="w-full flex justify-center min-h-[44px]" />
    </div>
  )
}
