'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { clearAuth, getUserName, getRole, hasPermission } from '@/lib/auth'
import { authApi, notificationsApi, fiscalApi } from '@/lib/api'
import {
  LayoutDashboard, Package, Trophy, Search, QrCode,
  LogOut, User, ShoppingBag, Users, Megaphone,
  Loader2, X, Menu, CreditCard, Store, Shield, TrendingUp, Tag, BarChart2, Info, UserCog, Settings, Timer, BookOpen, History,
  Wallet, Plug, ClipboardList, MessageSquare, Receipt, Palette, ChevronsLeft, ChevronsRight, Award,
} from 'lucide-react'
import clsx from 'clsx'
import ThemeToggle from '@/components/ThemeToggle'
import { SIDEBAR_SHORTCUT_KEYS } from '@/components/admin/KeyboardShortcutsOverlay'

const sections = [
  {
    label: 'Operacional',
    items: [
      { href: '/admin/dashboard',    label: 'Painel Geral',    icon: LayoutDashboard, badge: 'LIVE', perm: 'dashboard' },
      { href: '/admin/venda-avulsa', label: 'Frente de Caixa', icon: ShoppingBag,                    perm: 'pdv' },
      { href: '/admin/qrcodes',      label: 'Gatilhos QR Code', icon: QrCode,                         perm: 'qrcodes' },
    ],
  },
  {
    label: 'Gestão & Loja',
    items: [
      { href: '/admin/usuarios',    label: 'Clientes',     icon: Users,       perm: 'usuarios' },
      { href: '/admin/crediario',   label: 'Crediário',    icon: CreditCard,  perm: 'crediario' },
      { href: '/admin/estoque',     label: 'Estoque',      icon: Package,     perm: 'estoque' },
      { href: '/admin/financeiro',      label: 'Financeiro',        icon: TrendingUp,    perm: 'financeiro' },
      { href: '/admin/contas-receber', label: 'Contas a Pagar/Rec', icon: Wallet,        perm: 'financeiro' },
      { href: '/admin/reservas',        label: 'Pré-vendas',         icon: ClipboardList, perm: 'estoque' },
      { href: '/admin/relatorios',      label: 'Relatórios',         icon: BarChart2,     perm: 'relatorios' },
      { href: '/admin/categorias',  label: 'Categorias',   icon: Tag,         perm: 'categorias' },
      { href: '/admin/anuncios',    label: 'Anúncios',     icon: Megaphone,       perm: 'anuncios' },
      { href: '/admin/mensageria', label: 'Mensageria',   icon: MessageSquare,   perm: 'anuncios' },
      { href: '/admin/cartas',      label: 'Cartas TCG',   icon: Search,      perm: 'cartas' },
      { href: '/admin/campeonatos',  label: 'Campeonatos',  icon: Trophy,      perm: 'campeonatos' },
      { href: '/admin/liga-mensal',  label: 'Liga Mensal',  icon: Award,       perm: 'campeonatos' },
      { href: '/admin/timer',        label: 'Timers',       icon: Timer,       perm: 'campeonatos' },
      { href: '/admin/marketplace',  label: 'Mercado de Cartas', icon: Store, perm: 'estoque' },
    ],
  },
  {
    label: 'Administração',
    adminOnly: true,
    items: [
      { href: '/admin/perfis',      label: 'Perfis de Acesso', icon: UserCog, perm: null },
      { href: '/admin/integracoes', label: 'Integrações',      icon: Plug,    perm: null },
      { href: '/admin/fiscal',      label: 'Fiscal',           icon: Receipt, perm: null },
      { href: '/admin/site',        label: 'Personalizar Site', icon: Palette, perm: null },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { href: '/admin/lgpd',  label: 'LGPD & Auditoria', icon: Shield, perm: 'lgpd' },
      { href: '/admin/sobre',     label: 'Sobre o Sistema',  icon: Info,     perm: null },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { href: '/admin/configuracoes', label: 'Configurações', icon: Settings, perm: null },
    ],
  },
]

function NavItems({ pathname, onClose, unreadCount, fiscalAlerta, collapsed = false }: { pathname: string; onClose?: () => void; unreadCount: number; fiscalAlerta: boolean; collapsed?: boolean }) {
  const role = getRole()
  const isAdmin = role === 'Admin'

  return (
    <nav className="flex-1 flex flex-col gap-1 px-3 pb-6 overflow-y-auto">
      {sections.map(({ label, items, adminOnly }) => {
        if (adminOnly && !isAdmin) return null
        const visibleItems = items.filter(({ perm }) => perm === null || hasPermission(perm))
        if (visibleItems.length === 0) return null
        return (
          <div key={label} className="mb-2">
            {/* Recolhida: sem cabeçalho de seção (texto pequeno demais pra caber) —
                só uma linha divisória sutil pra ainda separar os grupos visualmente. */}
            {collapsed ? (
              <div className="h-px bg-surface-700 mx-2 mt-3 mb-2" />
            ) : (
              <p className="text-[10px] uppercase text-gray-500 font-bold mt-3 mb-1 px-4 tracking-wider">
                {label}
              </p>
            )}
            {visibleItems.map(({ href, label: itemLabel, icon: Icon, badge }: { href: string; label: string; icon: React.ElementType; perm: string | null; badge?: string }) => {
              const active   = pathname.startsWith(href)
              const shortcut = SIDEBAR_SHORTCUT_KEYS[href]
              const hasDot   = (href === '/admin/mensageria' && unreadCount > 0)
                             || (href === '/admin/fiscal' && fiscalAlerta)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  title={collapsed ? itemLabel : undefined}
                  className={clsx(
                    'flex items-center w-full py-3 rounded-xl font-medium text-sm transition-all duration-150 group nav-item',
                    collapsed ? 'justify-center px-0' : 'gap-4 px-4',
                    active ? 'nav-item-active' : 'text-gray-500 hover:bg-surface-700 hover:text-white'
                  )}
                >
                  <div className="relative shrink-0">
                    <Icon className={clsx('w-5 h-5', active ? 'text-brand-500' : 'text-gray-500 group-hover:text-gray-300')} />
                    {hasDot && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <span className={clsx('flex-1 nav-item-label', active && 'font-semibold')}>{itemLabel}</span>
                      {badge && (
                        <span className="text-[10px] bg-accent-green/20 text-accent-green border border-accent-green/30 px-1.5 py-0.5 rounded-full font-bold animate-pulse-slow">
                          {badge}
                        </span>
                      )}
                      {shortcut && !active && (
                        <kbd className="hidden md:inline-block text-[9px] text-gray-600 bg-surface-800 border border-surface-500 rounded px-1.5 py-0.5 font-mono font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity">
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
  const [fiscalAlerta, setFiscalAlerta] = useState(false)
  // Sempre começa expandida (igual no server e no primeiro render do client) — ler localStorage
  // direto no initializer causaria mismatch de hidratação sempre que o valor salvo fosse
  // "recolhida". O valor real só é aplicado depois, via useEffect (client-only).
  const [collapsed,    setCollapsed]    = useState(false)

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

  // Dot do Fiscal usa um sinal próprio (validade do certificado), não o unreadCount
  // genérico de notificações — evita acender junto com o dot de Mensageria.
  useEffect(() => {
    if (getRole() !== 'Admin') return
    let mounted = true
    const poll = async () => {
      try {
        const { data } = await fiscalApi.getConfig()
        const dias = data.diasParaVencer
        if (mounted) setFiscalAlerta(data.certificadoConfigurado && dias !== undefined && dias !== null && dias <= 30)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 5 * 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try { await authApi.logout() } catch {}
    clearAuth()
    router.push('/login')
  }

  const role = getRole()
  const roleLabel = role === 'Admin' ? 'Admin' : role === 'Operator' ? 'Operador' : role

  function renderFooter(isCollapsed: boolean) {
    if (isCollapsed) {
      // Recolhida: só ícones empilhados, cada um com tooltip nativo (title) — navegação
      // continua clara sem o texto.
      return (
        <div className="px-3 py-4 border-t border-surface-500 flex flex-col items-center gap-2">
          <div
            title={`${getUserName() || 'Admin'} (${roleLabel})`}
            className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0"
          >
            <User className="w-5 h-5 text-brand-400" />
          </div>
          <a
            href="/" target="_blank" rel="noopener noreferrer" title="Ver Loja"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-surface-700 hover:text-brand-400 transition-colors"
          >
            <Store className="w-4 h-4" />
          </a>
          <ThemeToggle compact />
          <button
            onClick={handleLogout} disabled={loggingOut} title="Sair"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          </button>
        </div>
      )
    }

    return (
      <div className="px-3 py-4 border-t border-surface-500">
        <div className="flex items-center gap-3 bg-surface-700 p-3 rounded-xl border border-surface-500 mb-2">
          <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{getUserName() || 'Admin'}</p>
            <span className="badge-admin text-[10px]">{roleLabel}</span>
          </div>
        </div>
        {/* Link para a página pública da loja */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-surface-700 hover:text-white transition-all duration-150 mb-1 group"
        >
          <Store className="w-4 h-4 text-gray-500 group-hover:text-brand-400 shrink-0" />
          <span>Ver Loja</span>
          <svg className="w-3 h-3 ml-auto opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        {/* Toggle de tema */}
        <ThemeToggle />
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn-secondary w-full justify-center text-sm py-2.5"
        >
          {loggingOut
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saindo...</>
            : <><LogOut className="w-4 h-4" /> Sair</>}
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-surface-800 border-b border-surface-500 px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/logo-maikon.png" alt="Santuário Nerd" className="h-9" />
          <span className="text-xs text-brand-400 font-bold">Admin</span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="text-gray-400 hover:text-white p-1">
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
        'md:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-surface-900 border-r border-surface-500 flex flex-col transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between px-6 py-6 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo-maikon.png" alt="Santuário Nerd" className="h-10 w-10 object-contain shrink-0" />
            <div>
              <p className="text-white text-base leading-tight">Santuário Nerd</p>
              <p className="text-[10px] text-brand-400 font-semibold tracking-wider uppercase">Admin</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <NavItems pathname={pathname} onClose={() => setMobileOpen(false)} unreadCount={unreadCount} fiscalAlerta={fiscalAlerta} />
        {renderFooter(false)}
      </aside>

      {/* Desktop sidebar — recolhível pra caber melhor em telas menores (notebook) */}
      <aside className={clsx(
        'hidden md:flex min-h-screen bg-surface-900 border-r border-surface-500 flex-col shrink-0 relative transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[260px]',
      )}>
        <div className={clsx('py-7 shrink-0 flex items-center gap-3', collapsed ? 'px-0 justify-center' : 'px-6')}>
          <img src="/logo-maikon.png" alt="Santuário Nerd" className="h-10 w-10 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white text-base leading-tight truncate">Santuário Nerd</p>
              <p className="text-[10px] text-brand-400 font-semibold tracking-wider uppercase">Admin</p>
            </div>
          )}
        </div>
        <NavItems pathname={pathname} unreadCount={unreadCount} fiscalAlerta={fiscalAlerta} collapsed={collapsed} />
        {renderFooter(collapsed)}

        {/* Botão de recolher/expandir — preso na borda direita, sempre visível independente
            do scroll do menu. */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="absolute top-9 -right-3 w-6 h-6 rounded-full bg-surface-700 border border-surface-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-brand-500/50 hover:bg-surface-600 transition-colors shadow-md"
        >
          {collapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>
    </>
  )
}
