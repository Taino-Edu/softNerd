'use client'
// =============================================================================
// CookieBanner.tsx — Consentimento de cookies (LGPD Art. 8°)
//
// Regras que o banner segue:
//   • diz o que é guardado e para quê ANTES de pedir o aceite (Art. 9°);
//   • registra aceite e recusa no backend, para virar evidência;
//   • some depois de decidido e pode ser reaberto pelo rodapé;
//   • não aparece no painel admin nem no login — mesma regra do rodapé: ali é
//     ferramenta de trabalho autenticada, e o card tapava a frente de caixa.
// =============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Cookie, ShieldCheck, Settings2, X } from 'lucide-react'
import { lgpdApi } from '@/lib/api'
import {
  OPEN_SETTINGS_EVENT,
  createConsent,
  readConsent,
  saveConsent,
} from '@/lib/cookieConsent'

export default function CookieBanner() {
  const pathname = usePathname()
  const [visible,     setVisible]     = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [preferences, setPreferences] = useState(true)
  const [decided,     setDecided]     = useState(false)

  const hidden = pathname?.startsWith('/admin') || pathname?.startsWith('/login')
    || pathname?.startsWith('/janela')

  useEffect(() => {
    const saved = readConsent()
    if (saved) {
      setPreferences(saved.preferences)
      setDecided(true)
    } else {
      setVisible(true)
    }

    // Rodapé pediu para reabrir: entra direto no detalhamento das categorias.
    const openSettings = () => {
      const current = readConsent()
      setPreferences(current?.preferences ?? true)
      setDecided(!!current)
      setCustomizing(true)
      setVisible(true)
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings)
  }, [])

  const persist = useCallback(async (allowPreferences: boolean) => {
    const consent = createConsent(allowPreferences)
    saveConsent(consent)
    setPreferences(allowPreferences)
    setDecided(true)
    setVisible(false)
    setCustomizing(false)

    // Evidência do consentimento — aceite e recusa. Falha de rede não trava o site.
    try { await lgpdApi.recordConsent(allowPreferences) } catch { /* best effort */ }
  }, [])

  if (!visible || hidden) return null

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[9999] mx-auto max-w-3xl print:hidden"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
    >
      <div
        className="rounded-2xl border shadow-2xl p-4 sm:p-5"
        style={{
          borderColor:     'var(--border-color)',
          backgroundColor: 'var(--bg-card)',
          boxShadow:       '0 12px 40px rgba(0,0,0,.35)',
        }}
      >
        <div className="flex items-start gap-3">
          {/* No celular o ícone só gastaria altura numa tela onde o card já
              disputa espaço com o conteúdo — o título diz do que se trata. */}
          <span className="hidden sm:inline-flex rounded-xl p-2 bg-[#42B6EE]/10 text-[#42B6EE] shrink-0">
            <Cookie className="w-5 h-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="cookie-title" className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  Sua privacidade, sua escolha
                </h2>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Guardamos o necessário para manter seu login, sua comanda e a segurança da conta.
                  <span className="hidden sm:inline"> Preferências como o tema da tela só ficam salvas se você autorizar.</span>{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Não usamos rastreamento, publicidade nem venda de dados.
                  </strong>
                </p>
              </div>

              {/* O X só existe depois que há uma decisão gravada: fechar sem
                  escolher nada deixaria o visitante sem consentimento algum. */}
              {decided && (
                <button
                  onClick={() => { setVisible(false); setCustomizing(false) }}
                  aria-label="Fechar preferências de cookies"
                  className="rounded-lg p-1 transition-colors hover:bg-[#42B6EE]/10 shrink-0"
                  style={{ color: 'var(--text-faint)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {customizing && (
              <div className="mt-4 space-y-2" aria-label="Categorias de cookies">
                <Categoria
                  titulo="Necessários"
                  descricao="Login, sessão, segurança e a comanda aberta na mesa. Sem eles o sistema não funciona."
                  checked
                  disabled
                  onChange={() => {}}
                />
                <Categoria
                  titulo="Preferências"
                  descricao="Tema claro/escuro e a dispensa do convite de instalação do app. Ficam só no seu aparelho."
                  checked={preferences}
                  onChange={setPreferences}
                />
                <p className="text-xs px-1" style={{ color: 'var(--text-faint)' }}>
                  Não existe categoria de análise ou publicidade aqui: o site não carrega
                  cookie de terceiros, nem pixel de rede social.
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* pr no celular: o botao do VLibras fica fixo no canto inferior
                  direito e cobria o ultimo link da linha. */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pr-14 sm:pr-0">
                <Link href="/privacidade#s9" className="font-medium text-[#42B6EE] underline hover:no-underline">
                  Política de Privacidade
                </Link>
                <Link href="/termos" className="font-medium text-[#42B6EE] underline hover:no-underline">
                  Termos de Uso
                </Link>
                <Link href="/lgpd" className="font-medium text-[#42B6EE] underline hover:no-underline">
                  Seus direitos
                </Link>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {!customizing && (
                  <button
                    onClick={() => setCustomizing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[#42B6EE]/10"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Personalizar
                  </button>
                )}
                <button
                  onClick={() => persist(false)}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[#42B6EE]/10"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  Só os necessários
                </button>
                <button
                  onClick={() => persist(customizing ? preferences : true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#42B6EE] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#2f9fd4]"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {customizing ? 'Salvar escolhas' : 'Aceitar tudo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Categoria({ titulo, descricao, checked, disabled, onChange }: {
  titulo: string; descricao: string; checked: boolean; disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label
      className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
      style={{
        borderColor:     'var(--border-color)',
        backgroundColor: 'var(--bg-input)',
        cursor:          disabled ? 'default' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        className="w-4 h-4 accent-[#42B6EE]"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</span>
        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{descricao}</span>
      </span>
      {disabled && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-green-500 shrink-0">
          Sempre ativo
        </span>
      )}
    </label>
  )
}
