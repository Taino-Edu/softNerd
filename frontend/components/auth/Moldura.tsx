'use client'
// Moldura única das telas de entrada (v1.57.0, chave "login-telas-unificadas"): painel da marca
// na cor do topo com a arte de Personalizar Site + formulário à direita — o visual que o Maikon
// aprovou pro /entrar (14/10/2026), agora também no cadastro, no primeiro acesso pelo CPF, na
// recuperação de senha e no login do painel. Antes cada uma tinha um visual e o fluxo parecia
// pular de site em site.
// Sempre clara, de propósito (login de empresa grande é claro, mesmo com o site no escuro).
// Cores no style, nunca em text-white/text-gray: o tema claro do site troca essas classes.
import { InputHTMLAttributes, ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import { ArrowLeft, Eye, EyeOff, Gamepad2, Loader2, Lock } from 'lucide-react'
import { siteConfigApi, SiteConfigDto } from '@/lib/api'
import { mixHex } from '@/lib/colors'
import { fotoLeve } from '@/lib/fotoLeve'

/** Paleta fixa e clara da tela de entrada. */
export const L = {
  fundo: '#EEF3FB', cartao: '#FFFFFF', texto: '#0F1B33', suave: '#5B6B84',
  campo: '#F5F8FC', borda: '#DCE4F0', amarelo: '#FFE45E', erro: '#C62828',
}

type Marca = Pick<SiteConfigDto, 'siteName' | 'colorHero' | 'heroImageUrl' | 'logoUrl'>

/** Nome, cor e arte da loja (Personalizar Site), com o padrão enquanto carrega. */
export function useMarca() {
  const [site, setSite] = useState<Marca | null>(null)
  useEffect(() => { siteConfigApi.get().then(r => setSite(r.data)).catch(() => { /* fica no padrão */ }) }, [])
  const arte = site?.heroImageUrl || site?.logoUrl || '/logo-santuario.webp'
  return {
    nome: site?.siteName ?? 'Santuário Nerd',
    cor: site?.colorHero ?? '#1E4FD6',
    arte,
    // Logo só no quadradinho quando é diferente da arte grande (senão o mascote aparece duas vezes)
    logo: site?.logoUrl && site.logoUrl !== arte ? site.logoUrl : null,
  }
}

export function MolduraEntrada({ selo = 'Área do jogador', children }: { selo?: string; children: ReactNode }) {
  const { nome, cor, arte, logo } = useMarca()
  const painel = `linear-gradient(150deg, ${mixHex(cor, '#FFFFFF', 0.12)} 0%, ${cor} 45%, ${mixHex(cor, '#000000', 0.35)} 100%)`

  return (
    <div className="min-h-screen lg:flex lg:items-center lg:justify-center lg:p-8" style={{ backgroundColor: L.fundo, colorScheme: 'light' }}>
      <Toaster position="top-center" toastOptions={{ style: { background: '#FFFFFF', color: L.texto, border: `1px solid ${L.borda}` } }} />

      <div className="w-full lg:max-w-5xl lg:grid lg:grid-cols-2 lg:rounded-[2rem] lg:overflow-hidden lg:shadow-[0_30px_80px_-30px_rgba(15,27,51,0.35)]"
        style={{ backgroundColor: L.cartao }}>

        {/* ── Painel da marca (no celular vira o cabeçalho) ── */}
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
                <span className="block text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>· Comunidade TCG</span>
              </span>
            </Link>
            <Link href="/" className="lg:hidden flex items-center gap-1 text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.8)' }}>
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
              <p className="mt-2 text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Campeonatos todas as semanas</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoLeve(arte, 640) ?? arte} alt=""
              className="w-24 sm:w-32 lg:w-auto lg:max-h-[22rem] lg:mt-4 lg:flex-1 lg:min-h-0 h-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)] shrink-0" />
          </div>

          <p className="relative hidden lg:block mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>Uma comunidade. Muitas partidas. ✦</p>
        </section>

        {/* ── Formulário ── */}
        <section className="px-6 py-8 lg:px-12 lg:py-12">
          <div className="max-w-sm mx-auto">
            <div className="flex justify-end mb-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#E9F8EF', color: '#16794A' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22A55B' }} /> {selo}
              </span>
            </div>
            {children}
            <p className="flex items-center justify-center gap-1.5 text-[11px] mt-6" style={{ color: L.suave }}>
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

export function TituloEntrada({ titulo, sub }: { titulo: string; sub?: ReactNode }) {
  return (
    <>
      <h2 className="text-3xl font-black" style={{ color: L.texto }}>{titulo}</h2>
      {sub && <p className="text-sm mt-1" style={{ color: L.suave }}>{sub}</p>}
    </>
  )
}

/** Entrar | Criar conta — o mesmo seletor nas duas telas, pra ficar claro que é o mesmo lugar. */
export function AbasEntrada({ ativa, entrarHref, criarHref }: { ativa: 'entrar' | 'criar'; entrarHref: string; criarHref: string }) {
  const aba = (chave: 'entrar' | 'criar', rotulo: string, href: string) => ativa === chave
    ? <span className="text-center text-sm font-bold py-2 rounded-lg bg-white shadow-sm" style={{ color: L.texto }} aria-current="page">{rotulo}</span>
    : <Link href={href} className="text-center text-sm font-semibold py-2 rounded-lg transition-colors hover:bg-white/70" style={{ color: L.suave }}>{rotulo}</Link>
  return (
    <div className="grid grid-cols-2 gap-1 p-1 mt-6 rounded-xl" style={{ backgroundColor: L.campo, border: `1px solid ${L.borda}` }}>
      {aba('entrar', 'Entrar', entrarHref)}
      {aba('criar', 'Criar conta', criarHref)}
    </div>
  )
}

/** Campo com ícone. senha=true ganha o "Mostrar/Esconder". */
export function CampoEntrada({ rotulo, icone: Icone, opcional, erro, acao, senha, cor, ...input }: {
  rotulo: string; icone: React.ElementType; opcional?: boolean; erro?: ReactNode; acao?: ReactNode; senha?: boolean; cor?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false)
  const id = input.id ?? `campo-${rotulo.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-sm font-bold" style={{ color: L.texto }}>
          {rotulo}{opcional && <span className="font-normal" style={{ color: L.suave }}> (opcional)</span>}
        </label>
        {acao}
      </div>
      <span className="relative block">
        <Icone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: L.suave }} />
        <input id={id} {...input} type={senha ? (ver ? 'text' : 'password') : input.type}
          className={`w-full rounded-xl py-3 pl-10 ${senha ? 'pr-24' : 'pr-3'} text-sm outline-none transition focus:shadow-[0_0_0_3px_rgba(30,79,214,0.18)]`}
          style={{ backgroundColor: L.campo, border: `1px solid ${erro ? L.erro : L.borda}`, color: L.texto }} />
        {senha && (
          <button type="button" onClick={() => setVer(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ color: cor ?? '#1E4FD6' }} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>
            {ver ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {ver ? 'Esconder' : 'Mostrar'}
          </button>
        )}
      </span>
      {erro && <p className="text-xs mt-1.5" style={{ color: L.erro }}>{erro}</p>}
    </div>
  )
}

export function BotaoEntrada({ carregando, cor, children, ...resto }: {
  carregando?: boolean; cor: string; children: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="submit" {...resto} disabled={carregando || resto.disabled}
      className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition active:scale-[0.99] disabled:opacity-60"
      style={{ color: '#FFFFFF', background: `linear-gradient(135deg, ${cor}, ${mixHex(cor, '#000000', 0.2)})`, boxShadow: `0 12px 28px -12px ${cor}` }}>
      {carregando && <Loader2 className="w-5 h-5 animate-spin" />}
      {children}
    </button>
  )
}

/** Linha de link discreto embaixo do formulário ("Já tem conta? Entrar"). */
export function LinhaEntrada({ children, pequena }: { children: ReactNode; pequena?: boolean }) {
  return <p className={`text-center ${pequena ? 'text-xs mt-2' : 'text-sm mt-6'}`} style={{ color: L.suave }}>{children}</p>
}

export function LinkEntrada({ href, cor, children }: { href: string; cor: string; children: ReactNode }) {
  return <Link href={href} className="font-bold hover:underline" style={{ color: cor }}>{children}</Link>
}
