'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import toast, { Toaster } from 'react-hot-toast'
import { Mail, KeyRound, Loader2, Gamepad2, ArrowLeft, User, Phone } from 'lucide-react'
import Link from 'next/link'

export default function CadastroPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-900" />}>
      <CadastroForm />
    </Suspense>
  )
}

function CadastroForm() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const returnTo     = searchParams.get('returnTo') || '/cliente/perfil'

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [whatsApp, setWhatsApp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  // Qual campo o servidor recusou ("email" | "whatsapp" | "cpf") — a mensagem aparece
  // embaixo do campo certo em vez de um toast solto dizendo "erro ao criar conta".
  const [erroCampo,    setErroCampo]    = useState<string | null>(null)
  const [erroMensagem, setErroMensagem] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('As senhas não coincidem.'); return }
    if (password.length < 8) { toast.error('A senha precisa ter pelo menos 8 caracteres.'); return }
    setLoading(true)
    setErroCampo(null); setErroMensagem(null)
    try {
      const { data } = await authApi.register(name.trim(), email.trim(), password, whatsApp.trim() || undefined)
      saveAuth(data)
      toast.success('Conta criada! Bem-vindo, ' + data.userName)
      router.push(returnTo)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; campo?: string } } })?.response?.data
      const msg  = data?.message || 'Erro ao criar conta.'
      setErroCampo(data?.campo ?? null)
      setErroMensagem(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e1e28', color: '#fff', border: '1px solid #32323f' }}} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-white transition mb-8 w-fit">
          <ArrowLeft className="w-4 h-4" /> Voltar para a loja
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600/20 border border-brand-500/30 rounded-2xl mb-4">
            <Gamepad2 className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Criar Conta</h1>
          <p className="text-gray-400 mt-1 text-sm">Cadastre-se para acompanhar campeonatos, pagamentos e seus pontos</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="label">Nome</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" required value={name}
                onChange={e => setName(e.target.value)}
                className="input pl-9"
                placeholder="Seu nome completo"
              />
            </div>
          </div>
          <div>
            <label className="label">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email" required value={email}
                onChange={e => { setEmail(e.target.value); if (erroCampo === 'email') { setErroCampo(null); setErroMensagem(null) } }}
                className={`input pl-9 ${erroCampo === 'email' ? 'border-red-500/60' : ''}`}
                placeholder="seu@email.com"
              />
            </div>
            {erroCampo === 'email' && (
              <p className="text-xs text-red-400 mt-1.5">
                {erroMensagem} <Link href="/entrar" className="underline hover:text-red-300">Ir para o login</Link>
              </p>
            )}
          </div>
          <div>
            <label className="label">WhatsApp <span className="text-gray-500 font-normal">(opcional)</span></label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="tel" value={whatsApp}
                onChange={e => { setWhatsApp(e.target.value); if (erroCampo === 'whatsapp') { setErroCampo(null); setErroMensagem(null) } }}
                className={`input pl-9 ${erroCampo === 'whatsapp' ? 'border-red-500/60' : ''}`}
                placeholder="11999999999"
              />
            </div>
            {erroCampo === 'whatsapp' && (
              <p className="text-xs text-red-400 mt-1.5">
                {erroMensagem} <Link href="/entrar" className="underline hover:text-red-300">Ir para o login</Link>
              </p>
            )}
          </div>
          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                className="input pl-9"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
          </div>
          <div>
            <label className="label">Confirmar senha</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password" required value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input pl-9"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <User className="w-5 h-5" />}
            {loading ? 'Criando...' : 'Criar conta'}
          </button>

          <div className="text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link href="/entrar" className="text-brand-400 hover:text-brand-300 font-medium transition">
              Entrar
            </Link>
          </div>
          <div className="text-center text-xs text-gray-600">
            Já comprou na loja física?{' '}
            <Link href="/primeiro-acesso" className="text-brand-400 hover:text-brand-300 transition">
              Ative sua conta pelo CPF
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
