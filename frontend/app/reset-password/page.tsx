'use client'
// Recuperar senha: pede o link por e-mail; com ?token= define a senha nova.
// Na moldura do /entrar (components/auth/Moldura.tsx).
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { CheckCircle, KeyRound, Mail } from 'lucide-react'
import { MolduraEntrada, TituloEntrada, CampoEntrada, BotaoEntrada, LinhaEntrada, LinkEntrada, useMarca, L } from '@/components/auth/Moldura'

function ResetPasswordForm() {
  const params  = useSearchParams()
  const router  = useRouter()
  const token   = params.get('token') ?? ''

  // Fase 1: pedir email para receber o link
  const [email,    setEmail]    = useState('')
  const [emailSent, setEmailSent] = useState(false)

  // Fase 2: definir nova senha (quando há token na URL)
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [done,     setDone]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const { cor } = useMarca()

  // ── Fase 1: solicitar link ─────────────────────────────────────────────────
  async function handleRequestLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setEmailSent(true)
    } catch {
      toast.error('E-mail não encontrado.')
    } finally {
      setLoading(false)
    }
  }

  // ── Fase 2: redefinir senha ────────────────────────────────────────────────
  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('As senhas não coincidem.'); return }
    if (password.length < 8)  { toast.error('Mínimo 8 caracteres.'); return }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch {
      toast.error('Link inválido ou expirado. Solicite um novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MolduraEntrada selo="Recuperar acesso">
      {done ? (
        <div className="text-center py-2 space-y-4">
          <CheckCircle className="w-12 h-12 mx-auto" style={{ color: '#22A55B' }} />
          <TituloEntrada titulo="Senha nova salva!" sub="Agora é só entrar com ela." />
          <BotaoEntrada type="button" cor={cor} onClick={() => router.push('/entrar')}>Ir para o login →</BotaoEntrada>
        </div>
      ) : token ? (
        <>
          <TituloEntrada titulo="Crie uma senha nova" sub="Mínimo 8 caracteres." />
          <form onSubmit={handleReset} className="mt-6 space-y-4">
            <CampoEntrada rotulo="Nova senha" icone={KeyRound} senha cor={cor} required minLength={8} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
            <CampoEntrada rotulo="Confirmar senha" icone={KeyRound} senha cor={cor} required minLength={8} autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a senha"
              erro={confirm && password !== confirm ? 'As senhas não coincidem.' : undefined} />
            <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Salvando...' : 'Salvar senha nova →'}</BotaoEntrada>
          </form>
        </>
      ) : emailSent ? (
        <div className="space-y-4">
          <Mail className="w-12 h-12" style={{ color: cor }} />
          <TituloEntrada titulo="Confira seu e-mail" />
          <p className="text-sm" style={{ color: L.suave }}>
            Se <strong style={{ color: L.texto }}>{email}</strong> estiver cadastrado, o link chega em instantes (olhe também o spam).
            Ele vale por 2 horas.
          </p>
          <p className="text-xs rounded-xl p-3" style={{ backgroundColor: L.campo, color: L.suave, border: `1px solid ${L.borda}` }}>
            Não recebeu? Se sua conta foi criada na loja só com nome e WhatsApp (sem e-mail), fale com a gente no balcão
            ou pelo WhatsApp — a equipe redefine sua senha na hora.
          </p>
          <button type="button" onClick={() => setEmailSent(false)} className="text-sm font-semibold hover:underline" style={{ color: cor }}>
            Usar outro e-mail
          </button>
        </div>
      ) : (
        <>
          <TituloEntrada titulo="Esqueceu a senha?" sub="A gente manda um link pro seu e-mail pra criar uma nova." />
          <form onSubmit={handleRequestLink} className="mt-6 space-y-4">
            <CampoEntrada rotulo="E-mail da conta" icone={Mail} type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
            <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Enviando...' : 'Enviar link →'}</BotaoEntrada>
          </form>
        </>
      )}
      <LinhaEntrada>Lembrou? <LinkEntrada href="/entrar" cor={cor}>Voltar para o login</LinkEntrada></LinhaEntrada>
    </MolduraEntrada>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
