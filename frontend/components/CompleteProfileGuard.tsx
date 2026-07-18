'use client'
import { useEffect, useState } from 'react'
import { authApi, userApi } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { Loader2, MailCheck } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Guard de perfil completo. Conta criada via quick-login (só nome + WhatsApp) não
 * tem e-mail nem senha — e sem e-mail a redefinição de senha não funciona.
 * Montado no layout de /cliente: busca o perfil e, se incompleto, abre um modal
 * NÃO-dismissável exigindo e-mail + senha antes de usar a área do cliente.
 */
export default function CompleteProfileGuard() {
  const [incomplete, setIncomplete] = useState(false)
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (!isLoggedIn()) return
    userApi.me()
      .then(({ data }) => { if (!data.profileComplete) setIncomplete(true) })
      .catch(() => { /* as páginas tratam os próprios erros de auth — aqui é melhor-esforço */ })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('A senha precisa de pelo menos 8 caracteres.'); return }
    if (password !== confirm) { toast.error('As senhas não conferem.'); return }

    setLoading(true)
    try {
      await authApi.completeProfile(email.trim(), password)
      toast.success('Cadastro completo! Se um dia esquecer a senha, você já consegue redefinir pelo e-mail.')
      setIncomplete(false)
    } catch (err) {
      const data = (err as { response?: { data?: { Message?: string; message?: string } } })?.response?.data
      toast.error(data?.Message ?? data?.message ?? 'Não foi possível salvar. Confira o e-mail e tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  if (!incomplete) return null

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
            Sua conta foi criada rapidamente na loja (só nome e WhatsApp). Cadastre um e-mail e uma
            senha — é o que garante seu acesso pelo site e a redefinição de senha se você esquecer.
          </p>
        </div>

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

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-60"
          style={{ backgroundColor: '#7C3AED', color: '#fff' }}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar e continuar
        </button>
      </form>
    </div>
  )
}
