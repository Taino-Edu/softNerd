'use client'
// Primeiro acesso de quem comprou no balcão: CPF → cria senha (ou entra, se já ativou).
// Na moldura do /entrar (components/auth/Moldura.tsx).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, CpfLookupResponse } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import toast from 'react-hot-toast'
import { ArrowLeft, CreditCard, Mail, KeyRound } from 'lucide-react'
import Link from 'next/link'
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
      // A Minha Conta abre perguntando o Pokémon preferido (chave pokemon-preferido)
      router.push('/cliente/perfil?pokemon=escolher')
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
