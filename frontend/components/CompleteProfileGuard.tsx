'use client'
import { useEffect, useState } from 'react'
import { authApi, userApi } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { Loader2, MailCheck } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Guard de perfil completo. Conta criada via quick-login (só nome + WhatsApp) não
 * tem e-mail nem senha — e sem e-mail a redefinição de senha não funciona.
 * Montado no layout de /cliente: busca o perfil e, se incompleto, abre um modal
 * pedindo e-mail + senha.
 *
 * Com a chave "cadastro-completo-pode-adiar" ligada, o modal tem "Agora não" (vale
 * até fechar o navegador): era obrigatório, e quem abria a comanda pela mesa e
 * digitava um e-mail que já tinha conta ficava preso nele, sem ver a comanda.
 *
 * Conta criada pelo Google já tem e-mail confirmado e não precisa de senha: aí o
 * que falta é o WhatsApp (e o CPF, opcional) — POST /api/auth/completar-cadastro.
 */
const ADIADO = 'cadastro-completo-adiado'

function adiadoNestaSessao() {
  try { return sessionStorage.getItem(ADIADO) === '1' } catch { return false }
}

export default function CompleteProfileGuard() {
  const chaveAdiar = useFuncionalidade('cadastro-completo-pode-adiar')
  const podeAdiar = chaveAdiar === true
  const [incomplete, setIncomplete] = useState(false)
  /** O e-mail digitado já é de outra conta: explica e deixa seguir com a comanda. */
  const [emailDeOutraConta, setEmailDeOutraConta] = useState(false)
  /** Entrou com Google: pede WhatsApp/CPF em vez de e-mail/senha. */
  const [google, setGoogle]         = useState(false)
  const [whatsApp, setWhatsApp]     = useState('')
  const [cpf, setCpf]               = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (!isLoggedIn()) return
    userApi.me()
      .then(({ data }) => {
        if (data.profileComplete) return
        setIncomplete(true)
        setGoogle(!!data.entrouComGoogle)
        if (data.email) setEmail(data.email) // já tem e-mail: falta só a senha
      })
      .catch(() => { /* as páginas tratam os próprios erros de auth — aqui é melhor-esforço */ })
  }, [])

  async function completarGoogle() {
    if (whatsApp.replace(/\D/g, '').length < 10) { toast.error('Informe o WhatsApp com DDD.'); return }
    setLoading(true)
    try {
      await authApi.completarCadastroGoogle(whatsApp, cpf.replace(/\D/g, '') || null)
      toast.success('Cadastro completo!')
      setIncomplete(false)
    } catch (err) {
      const data = (err as { response?: { data?: { Message?: string; message?: string } } })?.response?.data
      toast.error(data?.Message ?? data?.message ?? 'Não foi possível salvar. Confira os dados e tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (google) { await completarGoogle(); return }
    if (password.length < 8) { toast.error('A senha precisa de pelo menos 8 caracteres.'); return }
    if (password !== confirm) { toast.error('As senhas não conferem.'); return }

    setLoading(true)
    setEmailDeOutraConta(false)
    try {
      await authApi.completeProfile(email.trim(), password)
      toast.success('Cadastro completo! Se um dia esquecer a senha, você já consegue redefinir pelo e-mail.')
      setIncomplete(false)
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { Message?: string; message?: string; campo?: string } } })?.response
      const data = resp?.data
      if (resp?.status === 409 && data?.campo === 'email') { setEmailDeOutraConta(true); return }
      // 409 sem campo = a conta já estava completa (outra aba, por exemplo): nada a pedir
      if (resp?.status === 409) { setIncomplete(false); return }
      toast.error(data?.Message ?? data?.message ?? 'Não foi possível salvar. Confira o e-mail e tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  function agoraNao() {
    try { sessionStorage.setItem(ADIADO, '1') } catch { /* sem storage: só fecha */ }
    setIncomplete(false)
  }

  // Espera a chave: sem isso o modal piscava pra quem já tinha tocado em "Agora não"
  if (!incomplete || chaveAdiar === undefined || (podeAdiar && adiadoNestaSessao())) return null

  const inputStyle: React.CSSProperties = {
    borderColor: 'rgba(12,61,90,0.15)', color: '#0C3D5A', backgroundColor: '#F5F8FA',
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border p-6 space-y-4"
        style={{ backgroundColor: '#FFFFFF', borderColor: 'rgba(12,61,90,0.10)' }}>
        <div className="text-center space-y-2">
          <MailCheck className="w-10 h-10 mx-auto" style={{ color: '#7C3AED' }} />
          <h2 className="text-lg font-black" style={{ color: '#0C3D5A' }}>Complete seu cadastro</h2>
          <p className="text-sm" style={{ color: '#4D8FAC' }}>
            {google
              ? 'Você entrou com o Google. Falta só o seu WhatsApp — é por ele que a loja avisa de comanda, crediário e campeonato.'
              : 'Sua conta foi criada rapidamente na loja (só nome e WhatsApp). Cadastre um e-mail e uma senha — é o que garante seu acesso pelo site e a redefinição de senha se você esquecer.'}
          </p>
        </div>

        {google ? (
          <>
            <input
              type="tel" required placeholder="WhatsApp com DDD"
              value={whatsApp} onChange={e => setWhatsApp(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]/40"
              style={inputStyle}
            />
            <input
              type="tel" placeholder="CPF (opcional)"
              value={cpf} onChange={e => setCpf(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]/40"
              style={inputStyle}
            />
          </>
        ) : (<>
        <input
          type="email" required placeholder="Seu e-mail"
          value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]/40"
          style={inputStyle}
        />
        <input
          type="password" required minLength={8} placeholder="Senha (mín. 8 caracteres)"
          value={password} onChange={e => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]/40"
          style={inputStyle}
        />
        <input
          type="password" required placeholder="Confirmar senha"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]/40"
          style={inputStyle}
        />
        {emailDeOutraConta && (
          <p className="text-xs rounded-xl p-3" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
            Esse e-mail já tem outra conta no site. Use outro e-mail{podeAdiar ? ' ou toque em "Agora não" pra seguir com a comanda' : ''} —
            se as duas contas são suas, peça no balcão pra juntar.
          </p>
        )}
        </>)}

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-60"
          style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar e continuar
        </button>
        {podeAdiar && (
          <button type="button" onClick={agoraNao} disabled={loading}
            className="w-full py-2 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ color: '#4D8FAC' }}>
            Agora não
          </button>
        )}
      </form>
    </div>
  )
}
