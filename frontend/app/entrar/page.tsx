'use client'
// Login dos clientes. Duas telas, escolhidas pela chave "visual-topo-e-login":
//   TelaNova   — pedido do Maikon (14/10/2026): painel na cor do topo com a ilustração de
//                Personalizar Site + formulário. Sempre clara, de propósito (ele pediu: login
//                de empresa grande é claro, mesmo com o site no modo escuro).
//   tela antiga — o cartão simples de antes, guardado pra volta.
// A lógica (entrar, Google, destino depois do login) é a mesma pras duas.
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi, comandaApi, siteConfigApi, SiteConfigDto } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import { mixHex } from '@/lib/colors'
import { fotoLeve } from '@/lib/fotoLeve'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import toast, { Toaster } from 'react-hot-toast'
import { Mail, KeyRound, Loader2, Gamepad2, ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import Link from 'next/link'
import GoogleLoginButton from '@/components/GoogleLoginButton'

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
  // Enquanto a chave carrega já vai a tela nova (é o padrão); só "desligada" volta a antiga
  const visualNovo = useFuncionalidade('visual-topo-e-login') !== false

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

  if (visualNovo) {
    return (
      <TelaNova
        email={email} setEmail={setEmail} password={password} setPassword={setPassword}
        loading={loading} onSubmit={handleSubmit} cadastroHref={cadastroHref} onGoogle={aoEntrarComGoogle}
      />
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
        <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-white transition mb-8 w-fit">
          <ArrowLeft className="w-4 h-4" /> Voltar para a loja
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600/20 border border-brand-500/30 rounded-2xl mb-4">
            <Gamepad2 className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Minha Conta</h1>
          <p className="text-gray-400 mt-1 text-sm">Entre para ver sua comanda, pontos e histórico</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="label">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="input pl-9"
                placeholder="seu@email.com"
              />
            </div>
          </div>
          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                className="input pl-9"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {/* Escondido até o servidor ter GoogleAuth:ClientId */}
          <GoogleLoginButton comOu
            onEntrou={async data => { toast.success(`Bem-vindo, ${data.userName}!`); router.push(await destinoDepoisDoLogin()) }}
            onErro={msg => toast.error(msg, { duration: 6000 })} />

          <div className="text-center text-sm text-gray-500">
            Ainda não é cliente?{' '}
            <Link href={returnTo ? `/cadastro?returnTo=${encodeURIComponent(returnTo)}` : '/cadastro'} className="text-brand-400 hover:text-brand-300 font-medium transition">
              Criar conta
            </Link>
          </div>
          <div className="text-center text-xs text-gray-600">
            Já comprou na loja física?{' '}
            <Link href="/primeiro-acesso" className="text-brand-400 hover:text-brand-300 transition">
              Ative sua conta pelo CPF
            </Link>
          </div>
        </form>

        <div className="mt-4 text-center">
          <Link href="/reset-password" className="text-xs text-gray-400 hover:text-gray-400 transition">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela nova (v1.45.0)
// ─────────────────────────────────────────────────────────────────────────────

/** Paleta fixa e clara: a tela não segue o modo escuro do site (pedido do Maikon). */
const L = {
  fundo: '#EEF3FB', cartao: '#FFFFFF', texto: '#0F1B33', suave: '#5B6B84',
  campo: '#F5F8FC', borda: '#DCE4F0', amarelo: '#FFE45E',
}

function TelaNova({
  email, setEmail, password, setPassword, loading, onSubmit, cadastroHref, onGoogle,
}: {
  email: string; setEmail: (v: string) => void
  password: string; setPassword: (v: string) => void
  loading: boolean; onSubmit: (e: React.FormEvent) => void
  cadastroHref: string; onGoogle: (data: { userName: string }) => void
}) {
  const [site, setSite] = useState<Pick<SiteConfigDto, 'siteName' | 'colorHero' | 'heroImageUrl' | 'logoUrl'> | null>(null)
  const [verSenha, setVerSenha] = useState(false)

  useEffect(() => {
    siteConfigApi.get().then(r => setSite(r.data)).catch(() => { /* fica no padrão */ })
  }, [])

  const nome   = site?.siteName ?? 'Santuário Nerd'
  const cor    = site?.colorHero ?? '#1E4FD6'
  const arte   = site?.heroImageUrl || site?.logoUrl || '/logo-santuario.webp'
  // Logo só no quadradinho quando é diferente da arte grande (senão o mascote aparece duas vezes)
  const logo   = site?.logoUrl && site.logoUrl !== arte ? site.logoUrl : null
  const painel = `linear-gradient(150deg, ${mixHex(cor, '#FFFFFF', 0.12)} 0%, ${cor} 45%, ${mixHex(cor, '#000000', 0.35)} 100%)`
  const campo: React.CSSProperties = { backgroundColor: L.campo, border: `1px solid ${L.borda}`, color: L.texto }

  return (
    <div className="min-h-screen lg:flex lg:items-center lg:justify-center lg:p-8" style={{ backgroundColor: L.fundo, colorScheme: 'light' }}>
      <Toaster position="top-center" toastOptions={{ style: { background: '#FFFFFF', color: L.texto, border: `1px solid ${L.borda}` } }} />

      <div className="w-full lg:max-w-5xl lg:grid lg:grid-cols-2 lg:rounded-[2rem] lg:overflow-hidden lg:shadow-[0_30px_80px_-30px_rgba(15,27,51,0.35)]"
        style={{ backgroundColor: L.cartao }}>

        {/* ── Painel da marca (no celular vira o cabeçalho) ── */}
        {/* Textos do Maikon (14/10/2026). Cor do texto no style, não em "text-white": o tema claro força .text-white pra escuro */}
        <section className="relative overflow-hidden px-6 pt-6 pb-6 lg:p-8 rounded-b-[2rem] lg:rounded-none flex flex-col"
          style={{ background: painel, color: '#FFFFFF' }}>
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] rounded-full border border-white/10" />
            <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-[20rem] h-[20rem] rounded-full bg-white/[0.06] blur-2xl" />
          </div>

          <div className="relative flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3 min-w-0">
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: L.amarelo }}>
                {logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fotoLeve(logo, 160) ?? logo} alt="" className="w-10 h-10 object-contain" />
                  : <Gamepad2 className="w-5 h-5" style={{ color: mixHex(cor, '#000000', 0.4) }} />}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-lg font-black truncate">{nome}</span>
                <span className="block text-xs text-white/75">· Comunidade TCG</span>
              </span>
            </Link>
            <Link href="/" className="lg:hidden flex items-center gap-1 text-xs text-white/80 shrink-0">
              <ArrowLeft className="w-3.5 h-3.5" /> Loja
            </Link>
          </div>

          <div className="relative flex items-center gap-3 mt-5 lg:mt-6 lg:flex-col lg:text-center lg:flex-1">
            <div className="flex-1 min-w-0 lg:flex-none">
              <span className="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.14em] bg-white/15 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: L.amarelo }} /> Sua próxima rodada
              </span>
              <h1 className="text-[1.65rem] leading-[1.1] lg:text-[2.6rem] font-black">
                Jogue, <span style={{ color: L.amarelo }}>evolua</span> e divirta-se
              </h1>
              <p className="mt-2 text-sm font-bold text-white/90">Campeonatos todas as semanas</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoLeve(arte, 640) ?? arte} alt=""
              className="w-24 sm:w-32 lg:w-auto lg:max-h-[22rem] lg:mt-4 lg:flex-1 lg:min-h-0 h-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)] shrink-0" />
          </div>

          <p className="relative hidden lg:block mt-4 text-xs text-white/80">Uma comunidade. Muitas partidas. ✦</p>
        </section>

        {/* ── Formulário ── */}
        <section className="px-6 py-8 lg:px-12 lg:py-12">
          <div className="max-w-sm mx-auto">
            <div className="flex justify-end mb-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#E9F8EF', color: '#16794A' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22A55B' }} /> Área do jogador
              </span>
            </div>

            <h2 className="text-3xl font-black" style={{ color: L.texto }}>Boas-vindas!</h2>
            <p className="text-sm mt-1" style={{ color: L.suave }}>Entre na sua conta para continuar.</p>

            <div className="grid grid-cols-2 gap-1 p-1 mt-6 rounded-xl" style={{ backgroundColor: L.campo, border: `1px solid ${L.borda}` }}>
              <span className="text-center text-sm font-bold py-2 rounded-lg bg-white shadow-sm" style={{ color: L.texto }}>Entrar</span>
              <Link href={cadastroHref} className="text-center text-sm font-semibold py-2 rounded-lg transition-colors hover:bg-white/70"
                style={{ color: L.suave }}>
                Criar conta
              </Link>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="block text-sm font-bold mb-1.5" style={{ color: L.texto }}>E-mail</span>
                <span className="relative block">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: L.suave }} />
                  <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full rounded-xl py-3 pl-10 pr-3 text-sm outline-none transition focus:shadow-[0_0_0_3px_rgba(30,79,214,0.18)]"
                    style={campo} />
                </span>
              </label>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="senha" className="text-sm font-bold" style={{ color: L.texto }}>Senha</label>
                  <Link href="/reset-password" className="text-xs font-semibold hover:underline" style={{ color: cor }}>
                    Esqueceu a senha?
                  </Link>
                </div>
                <span className="relative block">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: L.suave }} />
                  <input id="senha" type={verSenha ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha"
                    className="w-full rounded-xl py-3 pl-10 pr-24 text-sm outline-none transition focus:shadow-[0_0_0_3px_rgba(30,79,214,0.18)]"
                    style={campo} />
                  <button type="button" onClick={() => setVerSenha(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color: cor }} aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}>
                    {verSenha ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {verSenha ? 'Esconder' : 'Mostrar'}
                  </button>
                </span>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition active:scale-[0.99] disabled:opacity-70"
                style={{ color: '#FFFFFF', background: `linear-gradient(135deg, ${cor}, ${mixHex(cor, '#000000', 0.2)})`, boxShadow: `0 12px 28px -12px ${cor}` }}>
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? 'Entrando...' : 'Entrar na minha conta →'}
              </button>

              <GoogleLoginButton comOu claro texto="continue_with"
                onEntrou={onGoogle}
                onErro={msg => toast.error(msg, { duration: 6000 })} />
            </form>

            <p className="text-center text-sm mt-6" style={{ color: L.suave }}>
              Ainda não tem uma conta?{' '}
              <Link href={cadastroHref} className="font-bold hover:underline" style={{ color: cor }}>Cadastre-se</Link>
            </p>
            <p className="text-center text-xs mt-2" style={{ color: L.suave }}>
              Já comprou na loja física?{' '}
              <Link href="/primeiro-acesso" className="font-semibold hover:underline" style={{ color: cor }}>Ative sua conta pelo CPF</Link>
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[11px] mt-5" style={{ color: L.suave }}>
              <Lock className="w-3 h-3" /> Seus dados estão protegidos
            </p>
            <Link href="/" className="hidden lg:flex items-center justify-center gap-1.5 text-xs mt-2 hover:underline" style={{ color: L.suave }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para a loja
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
