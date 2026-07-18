'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { Sword, Loader2, CheckCircle, KeyRound, Mail } from 'lucide-react'
import Link from 'next/link'

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
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-brand-600/30 border border-brand-500/30 rounded-xl flex items-center justify-center">
            <Sword className="w-5 h-5 text-brand-400" />
          </div>
          <span className="font-bold text-white text-xl">Santuário Nerd</span>
        </div>

        <div className="card">
          {/* ── Fase 2: sucesso ── */}
          {done && (
            <div className="text-center py-4 space-y-4">
              <CheckCircle className="w-12 h-12 text-accent-green mx-auto" />
              <div>
                <p className="font-bold text-white text-lg">Senha redefinida!</p>
                <p className="text-gray-400 text-sm mt-1">Sua nova senha foi salva com sucesso.</p>
              </div>
              <button onClick={() => router.push('/entrar')} className="btn-primary w-full justify-center">
                Ir para o login
              </button>
            </div>
          )}

          {/* ── Fase 2: formulário nova senha ── */}
          {!done && token && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 bg-brand-600/20 rounded-lg flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <h1 className="font-bold text-white">Nova senha</h1>
                  <p className="text-xs text-gray-500">Mínimo 8 caracteres</p>
                </div>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="label">Nova senha</label>
                  <input type="password" className="input" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required minLength={8} />
                </div>
                <div>
                  <label className="label">Confirmar senha</label>
                  <input type="password" className="input" placeholder="••••••••"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    required minLength={8} />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Redefinir senha'}
                </button>
              </form>
            </>
          )}

          {/* ── Fase 1: email enviado ── */}
          {!token && emailSent && (
            <div className="text-center py-4 space-y-4">
              <Mail className="w-12 h-12 text-brand-400 mx-auto" />
              <div>
                <p className="font-bold text-white text-lg">Se este e-mail estiver cadastrado, o link chega em instantes</p>
                <p className="text-gray-400 text-sm mt-1">
                  Verifique a caixa de entrada de <span className="text-white">{email}</span> (e o spam).
                  O link expira em 2 horas.
                </p>
                <p className="text-gray-500 text-xs mt-3">
                  Não recebeu? Se sua conta foi criada na loja só com nome e WhatsApp (sem e-mail),
                  fale com a gente no balcão ou pelo WhatsApp — a equipe redefine sua senha na hora.
                </p>
              </div>
              <button onClick={() => setEmailSent(false)} className="text-sm text-gray-500 hover:text-gray-300 transition">
                Usar outro e-mail
              </button>
            </div>
          )}

          {/* ── Fase 1: solicitar link ── */}
          {!token && !emailSent && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 bg-brand-600/20 rounded-lg flex items-center justify-center">
                  <Mail className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <h1 className="font-bold text-white">Recuperar senha</h1>
                  <p className="text-xs text-gray-500">Enviaremos um link por e-mail</p>
                </div>
              </div>
              <form onSubmit={handleRequestLink} className="space-y-4">
                <div>
                  <label className="label">E-mail da conta</label>
                  <input type="email" className="input" placeholder="seu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : 'Enviar link de recuperação'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link href="/entrar" className="text-xs text-gray-500 hover:text-gray-300 transition">
                  Voltar para o login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
