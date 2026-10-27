'use client'
// Cadastro do cliente, na mesma moldura do /entrar (components/auth/Moldura.tsx) com o seletor
// Entrar | Criar conta.
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import toast from 'react-hot-toast'
import { Mail, KeyRound, User, Phone } from 'lucide-react'
import Link from 'next/link'
import { MolduraEntrada, TituloEntrada, AbasEntrada, CampoEntrada, BotaoEntrada, LinhaEntrada, LinkEntrada, useMarca } from '@/components/auth/Moldura'

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
  // Só páginas do próprio site (igual ao /entrar): um link malicioso não leva pra fora depois do cadastro
  const pedido       = searchParams.get('returnTo')
  const returnTo     = pedido && pedido.startsWith('/') && !pedido.startsWith('//') && !pedido.startsWith('/\\') ? pedido : '/cliente/perfil'

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
  const { cor } = useMarca()
  const entrarHref = pedido && returnTo !== '/cliente/perfil' ? `/entrar?returnTo=${encodeURIComponent(returnTo)}` : '/entrar'

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
      // Indo pra Minha Conta, ela já abre perguntando o Pokémon preferido (se a chave estiver ligada);
      // quem veio de uma compra ou de outra tela segue direto pra lá
      router.push(returnTo === '/cliente/perfil' ? '/cliente/perfil?pokemon=escolher' : returnTo)
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

  const limpaErro = (campo: string) => { if (erroCampo === campo) { setErroCampo(null); setErroMensagem(null) } }
  const irProLogin = <> <Link href={entrarHref} className="underline">Ir para o login</Link></>
  return (
    <MolduraEntrada>
      <TituloEntrada titulo="Crie sua conta" sub="Acompanhe campeonatos, reservas e seus pontos." />
      <AbasEntrada ativa="criar" entrarHref={entrarHref} criarHref="#" />
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <CampoEntrada rotulo="Nome" icone={User} required autoComplete="name" value={name}
          onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />
        <CampoEntrada rotulo="E-mail" icone={Mail} type="email" required autoComplete="email" value={email}
          onChange={e => { setEmail(e.target.value); limpaErro('email') }} placeholder="voce@email.com"
          erro={erroCampo === 'email' ? <>{erroMensagem}{irProLogin}</> : undefined} />
        <CampoEntrada rotulo="WhatsApp" opcional icone={Phone} type="tel" autoComplete="tel" value={whatsApp}
          onChange={e => { setWhatsApp(e.target.value); limpaErro('whatsapp') }} placeholder="(17) 99999-9999"
          erro={erroCampo === 'whatsapp' ? <>{erroMensagem}{irProLogin}</> : undefined} />
        <CampoEntrada rotulo="Senha" icone={KeyRound} senha cor={cor} required minLength={8} autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
        <CampoEntrada rotulo="Confirmar senha" icone={KeyRound} senha cor={cor} required autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a senha"
          erro={confirm && password !== confirm ? 'As senhas não coincidem.' : undefined} />
        <BotaoEntrada carregando={loading} cor={cor}>{loading ? 'Criando...' : 'Criar minha conta →'}</BotaoEntrada>
      </form>
      <LinhaEntrada>Já tem conta? <LinkEntrada href={entrarHref} cor={cor}>Entrar</LinkEntrada></LinhaEntrada>
      <LinhaEntrada pequena>Já comprou na loja física? <LinkEntrada href="/primeiro-acesso" cor={cor}>Ative sua conta pelo CPF</LinkEntrada></LinhaEntrada>
    </MolduraEntrada>
  )
}
