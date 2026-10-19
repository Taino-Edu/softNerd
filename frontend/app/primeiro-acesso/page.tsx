'use client'
// Primeiro acesso de quem comprou no balcão: CPF → cria senha (ou entra, se já ativou).
// Com a chave "login-telas-unificadas" (v1.57.0) usa a moldura do /entrar; desligada, o cartão de antes.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, CpfLookupResponse } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import toast, { Toaster } from 'react-hot-toast'
import { Loader2, Gamepad2, ArrowLeft, CreditCard, Mail, KeyRound, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { MolduraEntrada, TituloEntrada, CampoEntrada, BotaoEntrada, LinhaEntrada, LinkEntrada, useMarca, L } from '@/components/auth/Moldura'

type Step = 'cpf' | 'criar' | 'login'

function formatCpf(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

export default function PrimeiroAcessoPage() {
  const router = useRouter()
  const [step, setStep]           = useState<Step>('cpf')
  const [cpf, setCpf]             = useState('')
  const [lookup, setLookup]       = useState<CpfLookupResponse | null>(null)
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const unificadas = useFuncionalidade('login-telas-unificadas') !== false
  const { cor } = useMarca()

  async function handleCpfSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authApi.cpfLookup(cpf)
      setLookup(data)
      setStep(data.hasPassword ? 'login' : 'criar')
    } catch {
      toast.error('CPF não encontrado. Visite a loja e escaneie o QR Code para criar sua conta.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('As senhas não coincidem.'); return }
    setLoading(true)
    try {
      const { data } = await authApi.setupAccount(cpf, email, password)
      saveAuth(data)
      toast.success('Conta criada! Bem-vindo, ' + data.userName)
      router.push('/cliente/perfil')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authApi.clientLogin(email, password)
      saveAuth(data)
      toast.success(`Bem-vindo, ${data.userName}!`)
      router.push('/cliente/perfil')
    } catch {
      toast.error('E-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  if (unificadas) {
    const passos = ['CPF', 'Senha'] as const
    const passo = step === 'cpf' ? 0 : 1
    return (
      <MolduraEntrada selo="Comprou na loja">
        {step !== 'cpf' && (
          <button type="button" onClick={() => setStep('cpf')} className="flex items-center gap-1.5 text-xs font-semibold mb-3 hover:underline" style={{ color: L.suave }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Outro CPF
          </button>
        )}
        <TituloEntrada
          titulo={step === 'cpf' ? 'Ative sua conta' : step === 'criar' ? `Olá, ${lookup?.name?.split(' ')[0] ?? ''}!` : `Bem-vindo de volta, ${lookup?.name?.split(' ')[0] ?? ''}!`}
          sub={step === 'cpf' ? 'Já comprou ou jogou na loja? Seu cadastro já existe — é só achar pelo CPF.'
            : step === 'criar' ? 'Achamos seu cadastro. Agora crie e-mail e senha pra entrar no site.'
            : 'Essa conta já foi ativada. Entre com seu e-mail e senha.'} />
        {/* Passos: deixa claro onde a pessoa está */}
        <ol className="flex items-center gap-2 mt-5 text-xs font-bold" aria-label="Passos">
          {passos.map((p, i) => (
            <li key={p} className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full flex items-center justify-center"
                style={i <= passo ? { backgroundColor: cor, color: '#FFFFFF' } : { backgroundColor: L.campo, color: L.suave, border: `1px solid ${L.borda}` }}>{i + 1}</span>
              <span style={{ color: i <= passo ? L.texto : L.suave }}>{p}</span>
              {i < passos.length - 1 && <span className="w-8 h-px" style={{ backgroundColor: L.borda }} />}
            </li>
          ))}
        </ol>

        {step === 'cpf' && (
          <form onSubmit={handleCpfSubmit} className="mt-6 space-y-4">
            <CampoEntrada rotulo="CPF" icone={CreditCard} inputMode="numeric" autoComplete="off" required maxLength={11}
              value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} placeholder="Somente números" />
            <BotaoEntrada carregando={loading} cor={cor} disabled={cpf.length !== 11}>{loading ? 'Buscando...' : 'Continuar →'}</BotaoEntrada>
          </form>
        )}
        {step === 'criar' && (
          <form onSubmit={handleSetup} className="mt-6 space-y-4">
            <CampoEntrada rotulo="E-mail" icone={Mail} type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
            <CampoEntrada rotulo="Senha" icone={KeyRound} senha cor={cor} required minLength={8} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
            <CampoEntrada rotulo="Confirmar senha" icone={KeyRound} senha cor={cor} required autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a senha"
              erro={confirm && password !== confirm ? 'As senhas não coincidem.' : undefined} />
            <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Ativando...' : 'Ativar minha conta →'}</BotaoEntrada>
          </form>
        )}
        {step === 'login' && (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <CampoEntrada rotulo="E-mail" icone={Mail} type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
            <CampoEntrada rotulo="Senha" icone={KeyRound} senha cor={cor} required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha"
              acao={<Link href="/reset-password" className="text-xs font-semibold hover:underline" style={{ color: cor }}>Esqueceu a senha?</Link>} />
            <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Entrando...' : 'Entrar →'}</BotaoEntrada>
          </form>
        )}
        <LinhaEntrada>Já tem conta com e-mail? <LinkEntrada href="/entrar" cor={cor}>Entrar</LinkEntrada></LinhaEntrada>
        <LinhaEntrada pequena>Nunca comprou na loja? <LinkEntrada href="/cadastro" cor={cor}>Criar conta</LinkEntrada></LinhaEntrada>
      </MolduraEntrada>
    )
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e1e28', color: '#fff', border: '1px solid #32323f' }}} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link href={step === 'cpf' ? '/' : '#'} onClick={step !== 'cpf' ? () => setStep('cpf') : undefined}
          className="flex items-center gap-2 text-gray-500 hover:text-white transition mb-8 w-fit">
          <ArrowLeft className="w-4 h-4" />
          {step === 'cpf' ? 'Voltar para a loja' : 'Voltar'}
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600/20 border border-brand-500/30 rounded-2xl mb-4">
            <Gamepad2 className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {step === 'cpf'   && 'Primeiro Acesso'}
            {step === 'criar' && `Olá, ${lookup?.name}!`}
            {step === 'login' && `Bem-vindo, ${lookup?.name}!`}
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            {step === 'cpf'   && 'Digite seu CPF para identificar sua conta'}
            {step === 'criar' && 'Crie uma senha para acessar o site'}
            {step === 'login' && 'Você já tem uma conta. Faça login.'}
          </p>
        </div>

        {/* Step 1 — CPF */}
        {step === 'cpf' && (
          <form onSubmit={handleCpfSubmit} className="card space-y-5">
            <div>
              <label className="label">CPF</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  className="input pl-9 font-mono tracking-wider"
                  placeholder="Somente números"
                  value={cpf}
                  onChange={e => setCpf(formatCpf(e.target.value))}
                  maxLength={11}
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={loading || cpf.length !== 11} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {loading ? 'Buscando...' : 'Continuar'}
            </button>
            <p className="text-center text-sm text-gray-500">
              Já tem conta?{' '}
              <Link href="/entrar" className="text-brand-400 hover:text-brand-300 font-medium">Entrar</Link>
            </p>
          </form>
        )}

        {/* Step 2 — Criar conta */}
        {step === 'criar' && (
          <form onSubmit={handleSetup} className="card space-y-5">
            <div>
              <label className="label">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="email" required className="input pl-9" placeholder="seu@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="password" required minLength={8} className="input pl-9" placeholder="Mínimo 8 caracteres"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Confirmar senha</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="password" required className="input pl-9" placeholder="Repita a senha"
                  value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {loading ? 'Criando conta...' : 'Criar minha conta'}
            </button>
          </form>
        )}

        {/* Step 3 — Já tem senha, fazer login */}
        {step === 'login' && (
          <form onSubmit={handleLogin} className="card space-y-5">
            <div className="bg-brand-600/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-300">
              Você já ativou sua conta. Entre com seu e-mail e senha.
            </div>
            <div>
              <label className="label">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="email" required className="input pl-9" placeholder="seu@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="password" required className="input pl-9" placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <Link href="/reset-password" className="block text-center text-xs text-gray-400 hover:text-gray-400 transition">
              Esqueci minha senha
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
