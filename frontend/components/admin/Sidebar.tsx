'use client'
// Menu lateral do painel: no azul da loja nos dois temas, logo de Personalizar Site, item ativo
// em destaque branco e rodapé (usuário, Ver Loja, tema, Sair) no mesmo estilo. Cores no style,
// não em text-white: o tema claro força .text-white pra escuro.
//
// v1.88.0: no computador o menu fica preso na altura da tela e rola sozinho (antes esticava a
// página e o Sair ficava lá embaixo). Chave "menu-lateral-enxuto": grupos abrem e fecham no título
// e o rodapé vira uma linha. Chave "avisos-pra-equipe": sininho (AvisosDaLoja) e o número de
// pedidos em aberto no item Pré-vendas.
//
// v1.89.0 (mesma chave do menu): pesquisa no topo (Ctrl+K ou "/") que filtra os itens de todos os
// grupos enquanto digita — setas escolhem, Enter abre — e o grupo da tela atual agora fecha também.
import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { clearAuth, getUserName, getRole, hasPermission } from '@/lib/auth'
import { useMontado } from '@/lib/useMontado'
import { authApi, notificationsApi, reservationApi } from '@/lib/api'
import {
  LayoutDashboard, Package, Trophy, Search, QrCode, Swords,
  LogOut, ShoppingBag, Users, Megaphone,
  Loader2, X, Menu, CreditCard, Store, Shield, TrendingUp, Tag, BarChart2, Info, UserCog, Settings, Timer, BookOpen,
  Wallet, Plug, ClipboardList, MessageSquare, Palette, ChevronsLeft, ChevronsRight, Award, RotateCcw,
  BellRing, ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import ThemeToggle from '@/components/ThemeToggle'
import { mixHex } from '@/lib/colors'
import { fotoLeve } from '@/lib/fotoLeve'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { useSiteConfig } from '@/lib/useSiteConfig'
import { SIDEBAR_SHORTCUT_KEYS } from '@/components/admin/KeyboardShortcutsOverlay'
import AvisosDaLoja from '@/components/admin/AvisosDaLoja'

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
      { href: '/admin/dashboard',    label: 'Painel Geral',     icon: LayoutDashboard, badge: 'LIVE', perm: 'dashboard', busca: 'inicio home resumo hoje ao vivo' },
      { href: '/admin/venda-avulsa', label: 'Frente de Caixa',  icon: ShoppingBag,                    perm: 'pdv', busca: 'pdv caixa vender venda balcao cobrar' },
      { href: '/admin/reservas',     label: 'Pré-vendas',       icon: ClipboardList,                  perm: 'estoque', busca: 'pedidos pedido reservas reserva pre venda encomenda fila espera retirada site pix' },
      { href: '/admin/qrcodes',      label: 'Gatilhos QR Code', icon: QrCode,                         perm: 'qrcodes', busca: 'qr gatilho codigo' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/admin/estoque',     label: 'Estoque',           icon: Package, perm: 'estoque', busca: 'produtos produto cadastrar preco' },
      { href: '/admin/categorias',  label: 'Categorias',        icon: Tag,     perm: 'categorias', busca: 'categoria' },
      { href: '/admin/cartas',      label: 'Cartas TCG',        icon: Search,  perm: 'cartas', busca: 'carta tcg magic pokemon yugioh one piece' },
      { href: '/admin/marketplace', label: 'Mercado de Cartas', icon: Store,   perm: 'estoque', busca: 'mercado vitrine cartas avulsas' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { href: '/admin/usuarios',          label: 'Clientes',   icon: Users,      perm: 'usuarios', busca: 'cliente usuarios cadastro pontos' },
      { href: '/admin/clientes/analises', label: 'Análises',   icon: BarChart2,  perm: 'usuarios', busca: 'analise clientes ranking top' },
      { href: '/admin/crediario',         label: 'Crediário',  icon: CreditCard, perm: 'crediario', busca: 'fiado divida conta cliente' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/admin/financeiro',     label: 'Financeiro',        icon: TrendingUp, perm: 'financeiro', busca: 'dinheiro faturamento caixa receita despesa vendas' },
      { href: '/admin/contas-receber', label: 'Contas a Pagar/Rec', icon: Wallet,    perm: 'financeiro', busca: 'contas pagar receber boleto despesa' },
      { href: '/admin/relatorios',     label: 'Relatórios',        icon: BarChart2,  perm: 'relatorios', busca: 'relatorio vendas exportar' },
    ],
  },
  {
    label: 'Eventos',
    items: [
      { href: '/admin/liguinha',    label: 'Central da Liguinha', icon: Swords, perm: 'campeonatos', busca: 'liga torneio suico pokemon rodada' },
      { href: '/admin/campeonatos', label: 'Campeonatos', icon: Trophy, perm: 'campeonatos', busca: 'torneio campeonato evento inscricao' },
      { href: '/admin/liga-mensal', label: 'Liga Mensal', icon: Award,  perm: 'campeonatos', busca: 'ranking liga mensal pontos' },
      { href: '/admin/timer',       label: 'Timers',      icon: Timer,  perm: 'campeonatos', busca: 'cronometro relogio tempo' },
    ],
  },
  {
    label: 'Divulgação',
    items: [
      { href: '/admin/anuncios',   label: 'Anúncios',   icon: Megaphone,      perm: 'anuncios', busca: 'banner anuncio promocao divulgar' },
      { href: '/admin/mensageria', label: 'Mensageria', icon: MessageSquare,  perm: 'anuncios', busca: 'mensagem whatsapp email avisar enviar' },
    ],
  },
  {
    label: 'Configuração',
    adminOnly: true,
    items: [
      { href: '/admin/site',        label: 'Personalizar Site', icon: Palette, perm: null, busca: 'personalizar cores logo tema site' },
      { href: '/admin/integracoes', label: 'Integrações',       icon: Plug,    perm: null, busca: 'integracao inter pix api chave' },
      { href: '/admin/perfis',      label: 'Perfis de Acesso',  icon: UserCog, perm: null, busca: 'operador permissao acesso funcionario perfil' },
      { href: '/admin/funcionalidades', label: 'Mudanças com volta', icon: RotateCcw, perm: null, busca: 'chave liga desliga voltar mudanca' },
      { href: '/admin/alertas',     label: 'Alertas do sistema', icon: BellRing, perm: null, chave: 'vigia-sistema', busca: 'alerta vigia erro sistema' },
    ],
  },
  {
    label: 'Ajuda & Sistema',
    items: [
      { href: '/admin/manual',        label: 'Manual do Sistema', icon: BookOpen, perm: null, busca: 'ajuda manual como usar' },
      { href: '/admin/lgpd',          label: 'LGPD & Auditoria',  icon: Shield,   perm: 'lgpd', busca: 'privacidade log auditoria' },
      { href: '/admin/sobre',         label: 'Sobre o Sistema',   icon: Info,     perm: null, busca: 'versao changelog novidades' },
      { href: '/admin/configuracoes', label: 'Configurações',     icon: Settings, perm: null, busca: 'configuracao preferencias som notificacao' },
    ],
  },
]

/** Cores do menu (texto sempre claro sobre o azul, nos dois temas). */
const BRANCO = '#FFFFFF'
const SUAVE  = 'rgba(255,255,255,0.78)'
const FRACO  = 'rgba(255,255,255,0.5)'
const AMARELO = '#FFE45E'

const CHAVE_GRUPOS = 'admin-menu-grupos'
/** Grupos abertos de saída (os outros abrem no título; o da tela atual abre ao entrar nela). */
const GRUPOS_ABERTOS_PADRAO = ['Dia a dia']

type ItemDoMenu = { href: string; label: string; icon: React.ElementType; perm: string | null; badge?: string; chave?: string; busca?: string }

function lerGrupos(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHAVE_GRUPOS) ?? '{}') ?? {} } catch { return {} }
}

/** Minúsculo e sem acento, letra a letra (o índice continua batendo com o texto original). */
function normalizar(texto: string) {
  return [...texto].map(c => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()).join('')
}

/** Todas as palavras digitadas aparecem no nome, no grupo ou nos apelidos do item? */
function combina(item: ItemDoMenu, grupo: string, termos: string[]) {
  const onde = normalizar(`${item.label} ${grupo} ${item.busca ?? ''}`)
  return termos.every(t => onde.includes(t))
}

/** Nome do item com o trecho digitado em destaque. */
function Destacar({ texto, termo }: { texto: string; termo: string }) {
  const i = termo ? normalizar(texto).indexOf(termo) : -1
  if (i < 0) return <>{texto}</>
  return <>{texto.slice(0, i)}<mark className="bg-transparent font-black underline decoration-2 underline-offset-2" style={{ color: 'inherit' }}>{texto.slice(i, i + termo.length)}</mark>{texto.slice(i + termo.length)}</>
}

function NavItems({ pathname, onClose, unreadCount, collapsed = false, cor = '#1E4FD6', enxuto = false, avisos = false, pedidosAbertos = 0, atalhoBusca = false, onExpandir }: {
  pathname: string; onClose?: () => void; unreadCount: number; collapsed?: boolean; cor?: string
  enxuto?: boolean; avisos?: boolean; pedidosAbertos?: number
  /** Só o menu do computador escuta Ctrl+K e "/" (o do celular fica escondido). */
  atalhoBusca?: boolean
  /** Menu recolhido: a lupa expande o menu antes de abrir a pesquisa. */
  onExpandir?: () => void
}) {
  // Perfil e permissões vêm de cookie: só depois de montar (senão o menu do servidor
  // sai diferente do navegador e a hidratação falha)
  const montado = useMontado()
  const router = useRouter()
  const vigia = useFuncionalidade('vigia-sistema') !== false
  const role = montado ? getRole() : ''
  const isAdmin = role === 'Admin'
  // Grupo aberto/fechado escolhido à mão (lembrado no aparelho); sem escolha, vale o padrão
  const [escolhidos, setEscolhidos] = useState<Record<string, boolean>>({})
  useEffect(() => { setEscolhidos(lerGrupos()) }, [])

  // Pesquisa (chave "menu-lateral-enxuto"): filtra os itens de todos os grupos enquanto digita
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const [focarAoAbrir, setFocarAoAbrir] = useState(false)
  const campoBusca = useRef<HTMLInputElement>(null)
  const pesquisavel = enxuto

  function salvarGrupos(proximo: Record<string, boolean>) {
    try { localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(proximo)) } catch {}
    return proximo
  }

  function alternarGrupo(label: string, abertoAgora: boolean) {
    setEscolhidos(atual => salvarGrupos({ ...atual, [label]: !abertoAgora }))
  }

  const secoesVisiveis = sections
    .filter(s => !s.adminOnly || isAdmin)
    .map(s => ({
      label: s.label,
      items: montado
        ? (s.items as ItemDoMenu[]).filter(i => (i.perm === null || hasPermission(i.perm)) && (i.chave !== 'vigia-sistema' || vigia))
        : [],
    }))
    .filter(s => s.items.length > 0)

  // Entrou numa tela de outro grupo: ele abre (mesmo que tenha sido fechado antes). Dentro do
  // grupo dá pra fechar à vontade — antes o grupo da tela atual ficava preso aberto.
  const grupoAtivo = secoesVisiveis.find(s => s.items.some(i => pathname.startsWith(i.href)))?.label
  const grupoAnterior = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!grupoAtivo || grupoAtivo === grupoAnterior.current) return
    grupoAnterior.current = grupoAtivo
    setEscolhidos(atual => atual[grupoAtivo] === false ? salvarGrupos({ ...atual, [grupoAtivo]: true }) : atual)
  }, [grupoAtivo])

  const termo = normalizar(busca.trim())
  const termos = termo.split(/\s+/).filter(Boolean)
  const resultados = termos.length === 0 ? [] : secoesVisiveis
    .map(s => ({ ...s, items: s.items.filter(i => combina(i, s.label, termos)) }))
    .filter(s => s.items.length > 0)
  const resultadosPlanos = resultados.flatMap(s => s.items)

  useEffect(() => { setSelecionado(0) }, [termo])

  function irPara(href: string) {
    setBusca('')
    campoBusca.current?.blur()
    onClose?.()
    router.push(href)
  }

  function teclaNaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelecionado(i => Math.min(i + 1, resultadosPlanos.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelecionado(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { const alvo = resultadosPlanos[selecionado]; if (alvo) { e.preventDefault(); irPara(alvo.href) } }
    else if (e.key === 'Escape') { e.stopPropagation(); setBusca(''); campoBusca.current?.blur() }
  }

  // Ctrl+K ou "/" (fora de campo de texto) abre a pesquisa
  useEffect(() => {
    if (!atalhoBusca || !pesquisavel) return
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (!ctrlK && !(e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey)) return
      e.preventDefault()
      if (collapsed) { setFocarAoAbrir(true); onExpandir?.() } else campoBusca.current?.focus()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [atalhoBusca, pesquisavel, collapsed, onExpandir])

  useEffect(() => {
    if (focarAoAbrir && !collapsed) { campoBusca.current?.focus(); setFocarAoAbrir(false) }
  }, [focarAoAbrir, collapsed])

  function renderItem({ href, label: itemLabel, icon: Icon, badge }: ItemDoMenu, destaque = false) {
    const active   = pathname.startsWith(href)
    const shortcut = SIDEBAR_SHORTCUT_KEYS[href]
    // Com o sininho, a bolinha de não lidos sai de Mensageria (não tinha a ver com mensagens)
    const hasDot   = !avisos && (href === '/admin/mensageria' && unreadCount > 0)
    const numero   = avisos && href === '/admin/reservas' ? pedidosAbertos : 0
    return (
      <Link
        key={href}
        href={href}
        onClick={() => { setBusca(''); onClose?.() }}
        title={collapsed ? itemLabel : undefined}
        className={clsx(
          'flex items-center w-full rounded-xl font-medium text-sm transition-all duration-150 group py-2.5',
          collapsed ? 'justify-center px-0' : 'gap-4 px-4',
          active ? 'shadow-sm' : 'hover:bg-white/10',
          destaque && !active && 'bg-white/15 ring-1 ring-white/40',
        )}
        style={active ? { backgroundColor: BRANCO, color: cor } : { color: SUAVE }}
      >
        <div className="relative shrink-0">
          <Icon className="w-5 h-5" style={{ color: active ? cor : SUAVE }} />
          {hasDot && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          {collapsed && numero > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black leading-4 text-center"
              style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>{numero > 99 ? '99+' : numero}</span>
          )}
        </div>
        {!collapsed && (
          <>
            <span className={clsx('flex-1', active && 'font-black')}>
              {termos.length > 0 ? <Destacar texto={itemLabel} termo={termos[0]} /> : itemLabel}
            </span>
            {numero > 0 && (
              <span title={`${numero} pedido(s) pra cobrar ou entregar`}
                className="text-[10px] min-w-[20px] text-center px-1.5 py-0.5 rounded-full font-black"
                style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
                {numero > 99 ? '99+' : numero}
              </span>
            )}
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
  }

  return (
    <>
      {pesquisavel && (collapsed ? (
        <div className="shrink-0 flex justify-center pb-1">
          <button type="button" onClick={() => { setFocarAoAbrir(true); onExpandir?.() }}
            title="Procurar no menu (Ctrl+K)" aria-label="Procurar no menu"
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/15" style={{ color: SUAVE }}>
            <Search className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="shrink-0 px-3 pb-2">
          <label className="flex items-center gap-2 px-3 h-9 rounded-xl transition-colors focus-within:ring-2 focus-within:ring-white/40"
            style={{ backgroundColor: 'rgba(255,255,255,0.10)', color: SUAVE }}>
            <Search className="w-4 h-4 shrink-0" />
            <input ref={campoBusca} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={teclaNaBusca}
              placeholder="Procurar no menu…" aria-label="Procurar no menu"
              className="menu-busca flex-1 min-w-0 bg-transparent border-0 outline-none text-sm p-0 focus:ring-0"
              style={{ color: BRANCO }} />
            {busca ? (
              <button type="button" onClick={() => { setBusca(''); campoBusca.current?.focus() }} aria-label="Limpar pesquisa"
                className="shrink-0 rounded hover:bg-white/15 p-0.5"><X className="w-3.5 h-3.5" /></button>
            ) : (
              <kbd className="hidden md:inline-block shrink-0 text-[9px] rounded px-1.5 py-0.5 font-mono font-bold leading-none"
                style={{ color: SUAVE, backgroundColor: 'rgba(255,255,255,0.12)' }}>Ctrl K</kbd>
            )}
          </label>
        </div>
      ))}
      <nav className="menu-rolagem flex-1 min-h-0 flex flex-col gap-1 px-3 pb-6 overflow-y-auto">
        {termos.length > 0 ? (
          // Pesquisando: só o que combina, em todos os grupos, com o primeiro já marcado (Enter abre)
          resultados.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: FRACO }}>
              Nada no menu com &ldquo;{busca.trim()}&rdquo;.
            </p>
          ) : resultados.map(s => (
            <div key={s.label} className="mb-0.5">
              <p className="text-[10px] uppercase font-bold mt-2 mb-0.5 px-4 tracking-wider" style={{ color: FRACO }}>{s.label}</p>
              {s.items.map(i => renderItem(i, resultadosPlanos[selecionado]?.href === i.href))}
            </div>
          ))
        ) : secoesVisiveis.map(({ label, items }) => {
          // Recolhida (só ícones) mostra tudo: não tem título pra clicar
          const dobravel = enxuto && !collapsed
          const aberto = !dobravel || (escolhidos[label] ?? (label === grupoAtivo || GRUPOS_ABERTOS_PADRAO.includes(label)))
          const numeroDoGrupo = avisos && items.some(i => i.href === '/admin/reservas') ? pedidosAbertos : 0
          return (
            <div key={label} className={dobravel ? 'mb-0.5' : 'mb-2'}>
              {/* Recolhida: sem cabeçalho de seção (texto pequeno demais pra caber) —
                  só uma linha divisória sutil pra ainda separar os grupos visualmente. */}
              {collapsed ? (
                <div className="h-px mx-2 mt-3 mb-2 bg-white/15" />
              ) : dobravel ? (
                <button type="button" onClick={() => alternarGrupo(label, aberto)}
                  aria-expanded={aberto}
                  title={aberto ? 'Fechar grupo' : 'Abrir grupo'}
                  className="w-full flex items-center gap-2 mt-2 mb-0.5 px-4 py-1.5 rounded-lg text-[11px] uppercase font-bold tracking-wider transition-colors hover:bg-white/10"
                  style={{ color: aberto ? SUAVE : FRACO }}>
                  <span className="flex-1 text-left">{label}</span>
                  {!aberto && label === grupoAtivo && (
                    <span title="A tela aberta é deste grupo" className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BRANCO }} />
                  )}
                  {!aberto && numeroDoGrupo > 0 && (
                    <span className="text-[10px] px-1.5 rounded-full font-black" style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>{numeroDoGrupo}</span>
                  )}
                  <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', !aberto && '-rotate-90')} />
                </button>
              ) : (
                <p className="text-[10px] uppercase font-bold mt-3 mb-1 px-4 tracking-wider" style={{ color: FRACO }}>
                  {label}
                </p>
              )}
              {aberto && items.map(i => renderItem(i))}
            </div>
          )
        })}
      </nav>
    </>
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
  const enxuto = useFuncionalidade('menu-lateral-enxuto') === true
  const avisos = useFuncionalidade('avisos-pra-equipe') === true
  const [pedidosAbertos, setPedidosAbertos] = useState(0)
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

  // Lupa do menu recolhido / Ctrl+K: abre o menu pra pesquisar
  const expandir = useCallback(() => {
    setCollapsed(false)
    try { localStorage.setItem('admin-sidebar-collapsed', 'false') } catch {}
  }, [])

  function toggleCollapsed() {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem('admin-sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  // Jeito antigo (sem o sininho): bolinha em Mensageria. Com o sininho, quem consulta é ele.
  useEffect(() => {
    if (avisos) return
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
  }, [avisos])

  // Número de pedidos em aberto no item Pré-vendas (só quem enxerga Pré-vendas); reconta ao trocar de tela
  useEffect(() => {
    if (!avisos || !hasPermission('estoque')) return
    let vivo = true
    const contar = () => reservationApi.abertosCount()
      .then(r => { if (vivo) setPedidosAbertos(r.data.count) })
      .catch(() => {})
    contar()
    const id = setInterval(contar, 60_000)
    return () => { vivo = false; clearInterval(id) }
  }, [avisos, pathname])

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
    // Chave "menu-lateral-enxuto": uma linha só (usuário + Ver Loja, tema e Sair em ícone)
    if (enxuto && !isCollapsed) {
      return (
        <div className="px-3 py-3 border-t border-white/15 shrink-0">
          <div className="flex items-center gap-1.5 p-2 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <div title={`${nomeUsuario} (${roleLabel})`} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-black text-sm"
              style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
              {nomeUsuario.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 ml-0.5">
              <p className="text-xs font-bold truncate" style={{ color: BRANCO }}>{nomeUsuario}</p>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: AMARELO }}>{roleLabel}</span>
            </div>
            <a href="/" target="_blank" rel="noopener noreferrer" title="Ver Loja" aria-label="Ver Loja"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 shrink-0" style={{ color: SUAVE }}>
              <Store className="w-4 h-4" />
            </a>
            <div className="shrink-0" style={{ color: SUAVE }}><ThemeToggle compact sobreAzul /></div>
            <button onClick={handleLogout} disabled={loggingOut} title="Sair" aria-label="Sair"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/15 disabled:opacity-50 shrink-0"
              style={{ color: BRANCO }}>
              {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className={clsx('py-4 border-t border-white/15 shrink-0', isCollapsed ? 'px-3 flex flex-col items-center gap-2' : 'px-3')}>
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
        <div className="flex items-center gap-1">
          {avisos && <AvisosDaLoja lado="baixo" />}
          <button onClick={() => setMobileOpen(true)} className="p-1" style={{ color: BRANCO }}
            aria-label="Abrir menu">
            <Menu className="w-6 h-6" />
          </button>
        </div>
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
        <NavItems pathname={pathname} onClose={() => setMobileOpen(false)} unreadCount={unreadCount} cor={cor}
          enxuto={enxuto} avisos={avisos} pedidosAbertos={pedidosAbertos} />
        {renderFooter(false)}
      </aside>

      {/* Desktop sidebar — recolhível pra caber melhor em telas menores (notebook) */}
      <aside className={clsx(
        // Preso na altura da tela: o menu rola sozinho e o rodapé fica sempre à vista
        'hidden md:flex sticky top-0 self-start h-screen z-30 flex-col shrink-0 transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[260px]',
      )} style={{ background: fundoMenu }}>
        <div className={clsx('shrink-0 flex items-center gap-3', enxuto ? 'py-5' : 'py-7', collapsed ? 'px-0 justify-center flex-col' : 'pl-6 pr-4')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={nomeLoja} className="h-10 w-10 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-base leading-tight truncate font-black" style={{ color: BRANCO }}>{nomeLoja}</p>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: AMARELO, fontWeight: 900 }}>Painel</p>
            </div>
          )}
          {avisos && <AvisosDaLoja lado="direita" />}
        </div>
        <NavItems pathname={pathname} unreadCount={unreadCount} collapsed={collapsed} cor={cor}
          enxuto={enxuto} avisos={avisos} pedidosAbertos={pedidosAbertos} atalhoBusca onExpandir={expandir} />
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
