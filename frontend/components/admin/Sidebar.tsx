'use client'
// Menu lateral do painel: no azul da loja nos dois temas, logo de Personalizar Site, item ativo
// em destaque branco e rodapé (usuário, Ver Loja, tema, Sair) no mesmo estilo. Cores no style,
// não em text-white: o tema claro força .text-white pra escuro.
import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { clearAuth, getUserName, getRole, hasPermission } from '@/lib/auth'
import { useMontado } from '@/lib/useMontado'
import { authApi, notificationsApi } from '@/lib/api'
import {
  LayoutDashboard, Package, Trophy, Search, QrCode, Swords,
  LogOut, ShoppingBag, Users, Megaphone,
  Loader2, X, Menu, CreditCard, Store, Shield, TrendingUp, Tag, BarChart2, Info, UserCog, Settings, Timer, BookOpen,
  Wallet, Plug, ClipboardList, MessageSquare, Palette, ChevronsLeft, ChevronsRight, Award, RotateCcw,
  BellRing,
} from 'lucide-react'
import clsx from 'clsx'
import ThemeToggle from '@/components/ThemeToggle'
import { mixHex } from '@/lib/colors'
import { fotoLeve } from '@/lib/fotoLeve'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { useSiteConfig } from '@/lib/useSiteConfig'
import { SIDEBAR_SHORTCUT_KEYS } from '@/components/admin/KeyboardShortcutsOverlay'

// Agrupado por TAREFA, não por área do sistema: quem vai mexer em produto quer
// Estoque e Categorias no mesmo lugar, quem vai fechar o mês quer Financeiro,
// Contas e Relatórios juntos. Antes existia um balde "Gestão & Loja" com 16 itens
// onde Estoque e Categorias ficavam a 7 linhas de distância um do outro.
// A ordem dos grupos segue o dia a dia da loja: o que se usa toda hora primeiro,
// configuração no fim.
const sections = [
  {
    label: 'Dia a dia',
    items: [
      { href: '/admin/dashboard',    label: 'Painel Geral',     icon: LayoutDashboard, badge: 'LIVE', perm: 'dashboard' },
      { href: '/admin/venda-avulsa', label: 'Frente de Caixa',  icon: ShoppingBag,                    perm: 'pdv' },
      { href: '/admin/reservas',     label: 'Pré-vendas',       icon: ClipboardList,                  perm: 'estoque' },
      { href: '/admin/qrcodes',      label: 'Gatilhos QR Code', icon: QrCode,                         perm: 'qrcodes' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/admin/estoque',     label: 'Estoque',           icon: Package, perm: 'estoque' },
      { href: '/admin/categorias',  label: 'Categorias',        icon: Tag,     perm: 'categorias' },
      { href: '/admin/cartas',      label: 'Cartas TCG',        icon: Search,  perm: 'cartas' },
      { href: '/admin/marketplace', label: 'Mercado de Cartas', icon: Store,   perm: 'estoque' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { href: '/admin/usuarios',          label: 'Clientes',   icon: Users,      perm: 'usuarios' },
      { href: '/admin/clientes/analises', label: 'Análises',   icon: BarChart2,  perm: 'usuarios' },
      { href: '/admin/crediario',         label: 'Crediário',  icon: CreditCard, perm: 'crediario' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/admin/financeiro',     label: 'Financeiro',        icon: TrendingUp, perm: 'financeiro' },
      { href: '/admin/contas-receber', label: 'Contas a Pagar/Rec', icon: Wallet,    perm: 'financeiro' },
      { href: '/admin/relatorios',     label: 'Relatórios',        icon: BarChart2,  perm: 'relatorios' },
    ],
  },
  {
    label: 'Eventos',
    items: [
      { href: '/admin/liguinha',    label: 'Central da Liguinha', icon: Swords, perm: 'campeonatos' },
      { href: '/admin/campeonatos', label: 'Campeonatos', icon: Trophy, perm: 'campeonatos' },
      { href: '/admin/liga-mensal', label: 'Liga Mensal', icon: Award,  perm: 'campeonatos' },
      { href: '/admin/timer',       label: 'Timers',      icon: Timer,  perm: 'campeonatos' },
    ],
  },
  {
    label: 'Divulgação',
    items: [
      { href: '/admin/anuncios',   label: 'Anúncios',   icon: Megaphone,      perm: 'anuncios' },
      { href: '/admin/mensageria', label: 'Mensageria', icon: MessageSquare,  perm: 'anuncios' },
    ],
  },
  {
    label: 'Configuração',
    adminOnly: true,
    items: [
      { href: '/admin/site',        label: 'Personalizar Site', icon: Palette, perm: null },
      { href: '/admin/integracoes', label: 'Integrações',       icon: Plug,    perm: null },
      { href: '/admin/perfis',      label: 'Perfis de Acesso',  icon: UserCog, perm: null },
      { href: '/admin/funcionalidades', label: 'Mudanças com volta', icon: RotateCcw, perm: null },
      { href: '/admin/alertas',     label: 'Alertas do sistema', icon: BellRing, perm: null, chave: 'vigia-sistema' },
    ],
  },
  {
    label: 'Ajuda & Sistema',
    items: [
      { href: '/admin/manual',        label: 'Manual do Sistema', icon: BookOpen, perm: null },
      { href: '/admin/lgpd',          label: 'LGPD & Auditoria',  icon: Shield,   perm: 'lgpd' },
      { href: '/admin/sobre',         label: 'Sobre o Sistema',   icon: Info,     perm: null },
      { href: '/admin/configuracoes', label: 'Configurações',     icon: Settings, perm: null },
    ],
  },
]

/** Cores do menu (texto sempre claro sobre o azul, nos dois temas). */
const BRANCO = '#FFFFFF'
const SUAVE  = 'rgba(255,255,255,0.78)'
const FRACO  = 'rgba(255,255,255,0.5)'
const AMARELO = '#FFE45E'

function NavItems({ pathname, onClose, unreadCount, collapsed = false, cor = '#1E4FD6' }: { pathname: string; onClose?: () => void; unreadCount: number; collapsed?: boolean; cor?: string }) {
  // Perfil e permissões vêm de cookie: só depois de montar (senão o menu do servidor
  // sai diferente do navegador e a hidratação falha)
  const montado = useMontado()
  const vigia = useFuncionalidade('vigia-sistema') !== false
  const role = montado ? getRole() : ''
  const isAdmin = role === 'Admin'

  return (
    <nav className="flex-1 flex flex-col gap-1 px-3 pb-6 overflow-y-auto">
      {sections.map(({ label, items, adminOnly }) => {
        if (adminOnly && !isAdmin) return null
        const visibleItems = montado
          ? items.filter((i: { perm: string | null; chave?: string }) =>
              (i.perm === null || hasPermission(i.perm)) && (i.chave !== 'vigia-sistema' || vigia))
          : []
        if (visibleItems.length === 0) return null
        return (
          <div key={label} className="mb-2">
            {/* Recolhida: sem cabeçalho de seção (texto pequeno demais pra caber) —
                só uma linha divisória sutil pra ainda separar os grupos visualmente. */}
            {collapsed ? (
              <div className="h-px mx-2 mt-3 mb-2 bg-white/15" />
            ) : (
              <p className="text-[10px] uppercase font-bold mt-3 mb-1 px-4 tracking-wider" style={{ color: FRACO }}>
                {label}
              </p>
            )}
            {visibleItems.map(({ href, label: itemLabel, icon: Icon, badge }: { href: string; label: string; icon: React.ElementType; perm: string | null; badge?: string }) => {
              const active   = pathname.startsWith(href)
              const shortcut = SIDEBAR_SHORTCUT_KEYS[href]
              const hasDot   = (href === '/admin/mensageria' && unreadCount > 0)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  title={collapsed ? itemLabel : undefined}
                  className={clsx(
                    'flex items-center w-full rounded-xl font-medium text-sm transition-all duration-150 group py-2.5',
                    collapsed ? 'justify-center px-0' : 'gap-4 px-4',
                    active ? 'shadow-sm' : 'hover:bg-white/10'
                  )}
                  style={active ? { backgroundColor: BRANCO, color: cor } : { color: SUAVE }}
                >
                  <div className="relative shrink-0">
                    <Icon className="w-5 h-5" style={{ color: active ? cor : SUAVE }} />
                    {hasDot && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <span className={clsx('flex-1', active && 'font-black')}>{itemLabel}</span>
                      {badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse-slow"
                          style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
                          {badge}
                        </span>
                      )}
                      {shortcut && !active && (
                        <kbd className="hidden md:inline-block text-[9px] rounded px-1.5 py-0.5 font-mono font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: SUAVE, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                          {shortcut}
                        </kbd>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

export default function Sidebar() {
  const pathname      = usePathname()
  const router        = useRouter()
  const [loggingOut,   setLoggingOut]   = useState(false)
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  // Sempre começa expandida (igual no server e no primeiro render do client) — ler localStorage
  // direto no initializer causaria mismatch de hidratação sempre que o valor salvo fosse
  // "recolhida". O valor real só é aplicado depois, via useEffect (client-only).
  const [collapsed,    setCollapsed]    = useState(false)
  const site = useSiteConfig()
  const cor  = site?.colorHero ?? '#1E4FD6'
  const fundoMenu = `linear-gradient(180deg, ${mixHex(cor, '#000000', 0.28)} 0%, ${mixHex(cor, '#000000', 0.5)} 100%)`
  // "Ícone do admin" de Personalizar Site tem preferência; sem ele, o logo da loja
  const iconePainel = site?.adminIconUrl || site?.logoUrl
  const logo = iconePainel ? (fotoLeve(iconePainel, 160) ?? iconePainel) : '/logo-maikon-128.png'
  const nomeLoja = site?.siteName ?? 'Santuário Nerd'

  useEffect(() => {
    try {
      if (localStorage.getItem('admin-sidebar-collapsed') === 'true') setCollapsed(true)
    } catch {}
  }, [])

  function toggleCollapsed() {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem('admin-sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    let mounted = true
    const poll = async () => {
      try {
        const { data } = await notificationsApi.unreadCount()
        if (mounted) setUnreadCount(data.count)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try { await authApi.logout() } catch {}
    clearAuth()
    router.push('/login')
  }

  const montado = useMontado()
  const role = montado ? getRole() : ''
  const nomeUsuario = (montado ? getUserName() : '') || 'Admin'
  const roleLabel = role === 'Admin' ? 'Admin' : role === 'Operator' ? 'Operador' : role

  function renderFooter(isCollapsed: boolean) {
    return (
      <div className={clsx('py-4 border-t border-white/15', isCollapsed ? 'px-3 flex flex-col items-center gap-2' : 'px-3')}>
        {!isCollapsed && (
          <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black"
              style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
              {nomeUsuario.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: BRANCO }}>{nomeUsuario}</p>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: AMARELO }}>{roleLabel}</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div title={`${nomeUsuario} (${roleLabel})`} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black"
            style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
            {nomeUsuario.charAt(0).toUpperCase()}
          </div>
        )}
        <a href="/" target="_blank" rel="noopener noreferrer" title="Ver Loja"
          className={clsx('flex items-center rounded-xl text-sm font-medium transition-colors hover:bg-white/10',
            isCollapsed ? 'w-9 h-9 justify-center' : 'gap-2 w-full px-3 py-2.5 mb-1')}
          style={{ color: SUAVE }}>
          <Store className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Ver Loja</span>}
        </a>
        {/* Tema claro/escuro: muda só o conteúdo (o menu fica sempre azul) */}
        <div className={clsx('rounded-xl', !isCollapsed && 'mb-1')} style={{ color: SUAVE, backgroundColor: isCollapsed ? undefined : 'rgba(255,255,255,0.06)' }}>
          <ThemeToggle compact={isCollapsed} sobreAzul />
        </div>
        <button onClick={handleLogout} disabled={loggingOut} title="Sair"
          className={clsx('flex items-center justify-center rounded-xl text-sm font-bold transition-colors hover:bg-white/15 disabled:opacity-50',
            isCollapsed ? 'w-9 h-9' : 'gap-2 w-full py-2.5')}
          style={{ color: BRANCO, backgroundColor: 'rgba(255,255,255,0.10)' }}>
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          {!isCollapsed && (loggingOut ? 'Saindo...' : 'Sair')}
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ background: mixHex(cor, '#000000', 0.32) }}>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={nomeLoja} className="h-9 w-9 object-contain" />
          <span className="leading-tight"><span className="block text-sm font-black" style={{ color: BRANCO }}>{nomeLoja}</span><span className="block text-[10px] font-black uppercase tracking-wider" style={{ color: AMARELO }}>Painel</span></span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="p-1" style={{ color: BRANCO }}
          aria-label="Abrir menu">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={clsx(
        'md:hidden fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )} style={{ background: fundoMenu }}>
        <div className="flex items-center justify-between px-6 py-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={nomeLoja} className="h-10 w-10 object-contain shrink-0" />
            <div>
              <p className="text-base leading-tight font-black" style={{ color: BRANCO }}>{nomeLoja}</p>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: AMARELO, fontWeight: 900 }}>Painel</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} style={{ color: BRANCO }} aria-label="Fechar menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <NavItems pathname={pathname} onClose={() => setMobileOpen(false)} unreadCount={unreadCount} cor={cor} />
        {renderFooter(false)}
      </aside>

      {/* Desktop sidebar — recolhível pra caber melhor em telas menores (notebook) */}
      <aside className={clsx(
        'hidden md:flex min-h-screen flex-col shrink-0 relative transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[260px]',
      )} style={{ background: fundoMenu }}>
        <div className={clsx('py-7 shrink-0 flex items-center gap-3', collapsed ? 'px-0 justify-center' : 'px-6')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={nomeLoja} className="h-10 w-10 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-base leading-tight truncate font-black" style={{ color: BRANCO }}>{nomeLoja}</p>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: AMARELO, fontWeight: 900 }}>Painel</p>
            </div>
          )}
        </div>
        <NavItems pathname={pathname} unreadCount={unreadCount} collapsed={collapsed} cor={cor} />
        {renderFooter(collapsed)}

        {/* Botão de recolher/expandir — preso na borda direita, sempre visível independente
            do scroll do menu. */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="absolute top-9 -right-3 w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md"
          style={{ backgroundColor: BRANCO, color: cor, border: `1px solid ${mixHex(cor, '#FFFFFF', 0.7)}` }}
        >
          {collapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>
    </>
  )
}
