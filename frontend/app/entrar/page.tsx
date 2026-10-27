'use client'
// Login dos clientes (pedido do Maikon, 14/10/2026): painel na cor do topo com a ilustração de
// Personalizar Site + formulário. Sempre clara, de propósito (ele pediu: login de empresa grande
// é claro, mesmo com o site no modo escuro).
// A lógica (entrar, Google, destino depois do login) é a mesma pras duas.
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi, comandaApi } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import toast from 'react-hot-toast'
import { Mail, KeyRound } from 'lucide-react'
import Link from 'next/link'
import GoogleLoginButton from '@/components/GoogleLoginButton'
import { MolduraEntrada, TituloEntrada, AbasEntrada, CampoEntrada, BotaoEntrada, LinhaEntrada, LinkEntrada, useMarca } from '@/components/auth/Moldura'

export default function EntrarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-900" />}>
      <EntrarForm />
    </Suspense>
  )
}

function EntrarForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  /** Null = ninguém pediu destino; aí decidimos pela comanda aberta. */
  // Só caminho do próprio site: "https://..." ou "//outro.site" virariam redirecionamento pra fora
  const pedido = searchParams.get('returnTo')
  const returnTo = pedido && pedido.startsWith('/') && !pedido.startsWith('//') && !pedido.startsWith('/\\') ? pedido : null
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  /**
   * Com comanda aberta, entrar pela conta cai direto na comanda. Antes ia sempre
   * pro perfil, e o cliente tinha que reler o QR Code da mesa só pra achar o que
   * já era dele.
   */
  async function destinoDepoisDoLogin(): Promise<string> {
    if (returnTo) return returnTo
    try {
      await comandaApi.myComanda()
      return '/cliente'
    } catch {
      return '/cliente/perfil'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authApi.clientLogin(email, password)
      saveAuth(data)
      toast.success(`Bem-vindo, ${data.userName}!`)
      router.push(await destinoDepoisDoLogin())
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

  const cadastroHref = returnTo ? `/cadastro?returnTo=${encodeURIComponent(returnTo)}` : '/cadastro'
  const aoEntrarComGoogle = async (data: { userName: string }) => {
    toast.success(`Bem-vindo, ${data.userName}!`)
    router.push(await destinoDepoisDoLogin())
  }

  return (
    <TelaNova
      email={email} setEmail={setEmail} password={password} setPassword={setPassword}
      loading={loading} onSubmit={handleSubmit} cadastroHref={cadastroHref} onGoogle={aoEntrarComGoogle}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela nova (v1.45.0) — desde a v1.57.0 a moldura (painel da marca + formulário) mora em
// components/auth/Moldura.tsx e é a mesma do cadastro, primeiro acesso e recuperar senha.
// ─────────────────────────────────────────────────────────────────────────────

function TelaNova({
  email, setEmail, password, setPassword, loading, onSubmit, cadastroHref, onGoogle,
}: {
  email: string; setEmail: (v: string) => void
  password: string; setPassword: (v: string) => void
  loading: boolean; onSubmit: (e: React.FormEvent) => void
  cadastroHref: string; onGoogle: (data: { userName: string }) => void
}) {
  const { cor } = useMarca()
  return (
    <MolduraEntrada>
      <TituloEntrada titulo="Boas-vindas!" sub="Entre na sua conta para continuar." />
      <AbasEntrada ativa="entrar" entrarHref="#" criarHref={cadastroHref} />

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <CampoEntrada rotulo="E-mail" icone={Mail} type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
        <CampoEntrada rotulo="Senha" id="senha" icone={KeyRound} senha cor={cor} required autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha"
          acao={<Link href="/reset-password" className="text-xs font-semibold hover:underline" style={{ color: cor }}>Esqueceu a senha?</Link>} />
        <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Entrando...' : 'Entrar na minha conta →'}</BotaoEntrada>
        <GoogleLoginButton comOu claro texto="continue_with"
          onEntrou={onGoogle}
          onErro={msg => toast.error(msg, { duration: 6000 })} />
      </form>

      <LinhaEntrada>Ainda não tem uma conta? <LinkEntrada href={cadastroHref} cor={cor}>Cadastre-se</LinkEntrada></LinhaEntrada>
      <LinhaEntrada pequena>Já comprou na loja física? <LinkEntrada href="/primeiro-acesso" cor={cor}>Ative sua conta pelo CPF</LinkEntrada></LinhaEntrada>
    </MolduraEntrada>
  )
}
