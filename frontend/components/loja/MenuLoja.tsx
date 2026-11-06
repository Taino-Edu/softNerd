'use client'

// =============================================================================
// MenuLoja — o menu do site da loja, igual em todas as páginas (pedido do Taino, 04/11)
//
// Era o menu da página principal; Produtos, a página do produto e a Sacola tinham cada uma a sua
// barra, sem menu — no celular, quem entrava em Produtos não chegava em Torneios, Liga ou Minha
// Conta. Aqui fica uma vez só: faixa de aviso, barra (some ao rolar pra baixo, volta ao subir),
// menu do celular e "Libras" no menu (a mão flutuante some nessas páginas — VLibrasController).
//
// Na página principal os links de Torneios e Pontos rolam até a seção (#eventos); nas outras
// levam pra ela (/#eventos). Quem usa o menu sem um topo que já desconte a altura dele (o topo da
// página principal desconta) passa `espaco`, e o conteúdo começa logo abaixo da barra.
// =============================================================================

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { Accessibility, Moon, ShoppingBag, Sparkles, Sun } from 'lucide-react'
import { SiteConfigDto } from '@/lib/api'
import { mixHex } from '@/lib/colors'
import { useSiteConfig } from '@/lib/useSiteConfig'
import { useReservationCart } from '@/hooks/useReservationCart'
import { abrirVLibras } from '@/components/VLibrasController'
import { isLoggedIn } from '@/lib/auth'

/** Rótulos e cores do menu enquanto Personalizar Site não chega (o mesmo padrão da página principal). */
const PADRAO = {
  // colorAccent: a cor de destaque de Personalizar Site (amarelo por padrão), a mesma da página principal
  siteName: 'Santuário Nerd', colorHero: '#1E4FD6', colorNavy: '#0C3D5A', colorAccent: '#FFE45E',
  avisoTopo: 'Jogue, evolua e divirta-se — encontre tudo para sua próxima partida!',
  navTorneiosLabel: 'Torneios', navProdutosLabel: 'Produtos', navMercadoLabel: 'Mercado de Cartas',
  navLigaLabel: 'Liga Mensal', navPontosLabel: 'Pontos', ctaVerEventosLabel: 'Ver Eventos',
}
type Marca = typeof PADRAO

function marcaDe(site: Partial<SiteConfigDto> | null | undefined): Marca {
  const m = { ...PADRAO }
  for (const k of Object.keys(PADRAO) as (keyof Marca)[]) {
    const v = site?.[k]
    if (typeof v === 'string') m[k] = v
  }
  return m
}

/** Altura da faixa de aviso (px) — 0 quando Personalizar Site deixa o aviso em branco. */
export function alturaFaixa(site: Partial<SiteConfigDto> | null | undefined) {
  return marcaDe(site).avisoTopo.trim() ? 32 : 0
}

/** Azul da barra: o da marca escurecido (o mesmo do topo da página principal). */
export function azulDoMenu(site: Partial<SiteConfigDto> | null | undefined) {
  return mixHex(marcaDe(site).colorHero, '#000000', 0.32)
}

export default function MenuLoja({
  site: siteDaPagina, isDark, onToggleDark, naHome = false, espaco = false, corFaixa, extras,
}: {
  /** Personalizar Site já carregado pela página; sem ele, o menu busca sozinho. */
  site?: Partial<SiteConfigDto> | null
  isDark: boolean
  onToggleDark: () => void
  /** Página principal: Torneios/Pontos rolam até a seção em vez de abrir a página principal. */
  naHome?: boolean
  /** Põe um espaço da altura do menu embaixo dele (páginas sem topo próprio). */
  espaco?: boolean
  /** Cor da faixa de aviso; padrão = a da barra. */
  corFaixa?: string
  /** Botões a mais na barra, antes do menu do celular (ex.: compartilhar, avatar). */
  extras?: ReactNode
}) {
  const buscado = useSiteConfig()
  const site = marcaDe(siteDaPagina ?? buscado)
  const { totalItems: itensSacola } = useReservationCart()
  const [aberto, setAberto] = useState(false)
  const [visivel, setVisivel] = useState(true)
  const [hover, setHover] = useState(false)
  // Visitante vê "Entrar / Cadastrar"; logado vê "Minha Conta" e vai direto pra área dele.
  // Lido depois de montar (cookie) pra não divergir do HTML do servidor.
  const [logado, setLogado] = useState(false)
  useEffect(() => { setLogado(isLoggedIn()) }, [])

  useEffect(() => {
    let ultimo = window.scrollY
    const rolou = () => {
      const y = window.scrollY
      setVisivel(y < 80 || y < ultimo)
      ultimo = y
    }
    window.addEventListener('scroll', rolou, { passive: true })
    return () => window.removeEventListener('scroll', rolou)
  }, [])

  const aviso = site.avisoTopo.trim()
  const faixa = aviso ? 32 : 0
  // "Jogue, evolua e divirta-se — encontre tudo…": o trecho antes do travessão sai em amarelo
  const [avisoDestaque, ...avisoResto] = aviso.split(' — ')
  const azul = azulDoMenu(site)
  const mostra = visivel || hover || aberto
  const secao = (id: string) => (naHome ? `#${id}` : `/#${id}`)
  const fechar = () => setAberto(false)
  const link = 'hover:opacity-80 transition-opacity'
  const linkCelular = 'block py-2.5 text-sm hover:text-white transition-colors'
  const botaoCelular = 'flex items-center justify-center gap-1.5 py-2.5 text-sm rounded-xl border hover:text-white transition-colors'
  const corCelular = { color: 'rgba(255,255,255,0.70)', borderColor: 'rgba(255,255,255,0.25)' }

  return (
    <>
      {/* Faixa de 12 px no topo: passar o mouse traz o menu de volta quando ele está escondido */}
      <div className="fixed top-0 inset-x-0 h-3 z-[51]" onMouseEnter={() => setHover(true)} />

      {aviso && (
        <div className="fixed inset-x-0 top-0 z-[52] h-8 flex items-center justify-center gap-1.5 px-4 text-[11px] sm:text-xs font-bold transition-transform duration-300"
          style={{ backgroundColor: corFaixa ?? azul, color: '#FFFFFF', transform: mostra ? 'translateY(0)' : 'translateY(-100%)' }}
          onMouseEnter={() => setHover(true)}>
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: site.colorAccent }} />
          <span className="truncate">
            {avisoResto.length > 0
              ? <><span style={{ color: site.colorAccent }}>{avisoDestaque}</span> — {avisoResto.join(' — ')}</>
              : aviso}
          </span>
        </div>
      )}

      <nav className="fixed inset-x-0 top-0 z-50 h-16 flex items-center transition-transform duration-300"
        style={{ top: faixa, backgroundColor: azul, backdropFilter: 'blur(16px)', transform: mostra ? 'translateY(0)' : `translateY(calc(-100% - ${faixa}px))` }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}>

        {/* Menu numa linha só: nada quebra em duas (era "Mercado de / Cartas" entre 1280 e 1440px) */}
        <div className="w-full max-w-7xl mx-auto px-5 flex items-center justify-between gap-4 2xl:gap-6">

          {/* Marca no começo, como nas lojas grandes. Só o nome: o mascote de IA saiu do menu (Taino, 04/11) */}
          <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink">
            <span className="font-black text-xl leading-none truncate" style={{ color: '#ffffff' }}>{site.siteName}</span>
          </Link>

          <div className="hidden xl:flex items-center gap-3 2xl:gap-5 text-sm font-medium whitespace-nowrap flex-1 justify-center">
            <a href={secao('eventos')} style={{ color: '#ffffff' }} className={link}>{site.navTorneiosLabel}</a>
            <Link href="/produtos" style={{ color: '#ffffff' }} className={link}>{site.navProdutosLabel}</Link>
            <Link href="/cliente/mercado" style={{ color: '#ffffff' }} className={link}>{site.navMercadoLabel}</Link>
            <Link href="/liga" style={{ color: '#ffffff' }} className={link}>{site.navLigaLabel}</Link>
            <a href={secao('pontos')} style={{ color: '#ffffff' }} className={link}>{site.navPontosLabel}</a>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={abrirVLibras} aria-label="Abrir Libras (VLibras)" title="Acessibilidade em Libras"
              className="hidden xl:block p-2 rounded-xl transition-colors hover:bg-white/10" style={{ color: '#ffffff' }}>
              <Accessibility className="w-4 h-4" />
            </button>
            {/* Com a bolinha da conta (extras), no celular o tema fica só dentro do menu ("Escuro"):
                os dois juntos cortavam o nome da loja em "Santuário …" (teste do fluxo, 06/11) */}
            <button onClick={onToggleDark} title={isDark ? 'Modo claro' : 'Modo escuro'} aria-label={isDark ? 'Modo claro' : 'Modo escuro'}
              className={`${extras ? 'hidden sm:block' : ''} p-2 rounded-xl transition-colors hover:bg-white/10`} style={{ color: '#ffffff' }}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link href={logado ? '/cliente' : '/entrar'}
              className="hidden xl:block text-sm px-4 py-2 rounded-xl border transition-colors hover:bg-white/10 whitespace-nowrap"
              style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.40)' }}>
              {logado ? 'Minha Conta' : 'Entrar / Cadastrar'}
            </Link>
            {/* Sacola = carrinho de reserva (/cliente/reserva/carrinho); no celular vira só o ícone */}
            <Link href="/cliente/reserva/carrinho" aria-label={`Sacola: ${itensSacola} ${itensSacola === 1 ? 'item' : 'itens'}`}
              className="flex items-center gap-2 text-sm px-2.5 xl:px-4 py-2 rounded-xl xl:border transition-colors hover:bg-white/10 whitespace-nowrap"
              style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.40)' }}>
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden xl:inline">Sacola</span>
              <span className="min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-black flex items-center justify-center"
                style={{ backgroundColor: site.colorAccent, color: '#3D2E00' }}>{itensSacola}</span>
            </Link>
            {extras}
            {/* "Ver Eventos" repete o link Torneios: só aparece quando sobra espaço (2xl) */}
            <a href={secao('eventos')}
              className="hidden 2xl:block text-sm font-black px-5 py-2 rounded-xl transition-all active:scale-95 whitespace-nowrap"
              style={{ backgroundColor: site.colorAccent, color: site.colorNavy }}>
              {site.ctaVerEventosLabel}
            </a>
            <button onClick={() => setAberto(v => !v)} aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto}
              className="xl:hidden p-2" style={{ color: '#ffffff' }}>
              <div className="space-y-1.5">
                <span className={`block w-5 h-0.5 bg-current transition-transform ${aberto ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block w-5 h-0.5 bg-current transition-opacity ${aberto ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-0.5 bg-current transition-transform ${aberto ? '-rotate-45 -translate-y-2' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Menu do celular */}
      {aberto && (
        <div className="fixed inset-x-0 z-40 border-b xl:hidden px-5 py-4 space-y-1"
          style={{ top: 64 + faixa, backgroundColor: azul, borderColor: 'rgba(255,255,255,0.10)' }}>
          <a href={secao('eventos')} onClick={fechar} className={linkCelular} style={{ color: 'rgba(255,255,255,0.70)' }}>{site.navTorneiosLabel}</a>
          <Link href="/produtos" onClick={fechar} className={linkCelular} style={{ color: 'rgba(255,255,255,0.70)' }}>{site.navProdutosLabel}</Link>
          <Link href="/cliente/mercado" onClick={fechar} className={linkCelular} style={{ color: 'rgba(255,255,255,0.70)' }}>{site.navMercadoLabel}</Link>
          <Link href="/liga" onClick={fechar} className={linkCelular} style={{ color: 'rgba(255,255,255,0.70)' }}>{site.navLigaLabel}</Link>
          <a href={secao('pontos')} onClick={fechar} className={linkCelular} style={{ color: 'rgba(255,255,255,0.70)' }}>{site.navPontosLabel}</a>
          {/* Duas colunas: em quatro numa linha, "Minha Conta" quebrava e "Eventos" desalinhava */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <Link href={logado ? '/cliente' : '/entrar'} onClick={fechar} className={`${botaoCelular} font-medium`} style={corCelular}>
              {logado ? 'Minha Conta' : 'Entrar / Cadastrar'}
            </Link>
            <button onClick={() => { onToggleDark(); fechar() }} className={`${botaoCelular} font-medium`} style={corCelular}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDark ? 'Claro' : 'Escuro'}
            </button>
            <button onClick={() => { abrirVLibras(); fechar() }} className={`${botaoCelular} font-bold`} style={corCelular}>
              <Accessibility className="w-4 h-4" /> Libras
            </button>
            <a href={secao('eventos')} onClick={fechar}
              className="flex items-center justify-center py-2.5 text-sm rounded-xl font-black"
              style={{ backgroundColor: site.colorHero, color: '#fff' }}>
              Eventos
            </a>
          </div>
        </div>
      )}

      {espaco && <div aria-hidden style={{ height: 64 + faixa }} />}
    </>
  )
}
