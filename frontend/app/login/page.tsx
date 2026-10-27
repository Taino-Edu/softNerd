'use client'
// Login do painel (Maikon e operadores), na moldura do /entrar com o selo "Painel da loja".
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import toast from 'react-hot-toast'
import { KeyRound, Mail } from 'lucide-react'
import { MolduraEntrada, TituloEntrada, CampoEntrada, BotaoEntrada, LinhaEntrada, LinkEntrada, useMarca } from '@/components/auth/Moldura'

export default function LoginPage() {
  const router  = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const { cor } = useMarca()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authApi.login(email, password)
      saveAuth(data)
      toast.success(`Bem-vindo, ${data.userName}!`)
      router.push(data.role === 'Customer' ? '/cliente' : '/admin/dashboard')
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { message?: string } } })?.response
      if (resp?.status === 429) {
        // Conta travada por senha errada (o servidor diz por quanto tempo) ou limite de tentativas
        toast.error(resp.data?.message ?? 'Muitas tentativas. Aguarde 1 minuto e tente novamente.', { duration: 8000 })
      } else {
        toast.error('E-mail ou senha inválidos.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <MolduraEntrada selo="Painel da loja">
      <TituloEntrada titulo="Painel de gestão" sub="Entre com a conta da equipe." />
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <CampoEntrada rotulo="E-mail" icone={Mail} type="email" required autoComplete="username"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com.br" />
        <CampoEntrada rotulo="Senha" icone={KeyRound} senha cor={cor} required autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" />
        <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Entrando...' : 'Entrar no painel →'}</BotaoEntrada>
      </form>
      <LinhaEntrada>É cliente? <LinkEntrada href="/entrar" cor={cor}>Acesse a sua conta</LinkEntrada></LinhaEntrada>
    </MolduraEntrada>
  )
}
