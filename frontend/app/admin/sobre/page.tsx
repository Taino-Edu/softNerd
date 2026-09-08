'use client'

import { useEffect, useState } from 'react'
import {
  Tag, Calendar, CheckCircle, Wrench, Zap,
  BookOpen, ChevronDown, ChevronUp, FileDown,
  LayoutDashboard, ShoppingBag, ShoppingCart, Package,
  Users, CreditCard, Trophy, BarChart2, Layers, Megaphone, Settings, Keyboard,
} from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'

// ── Minimal Markdown Renderer ──────────────────────────────────────────────────

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'li'; text: string }
  | { type: 'hr' }
  | { type: 'p'; text: string }
  | { type: 'blank' }

function parseMd(raw: string): Block[] {
  return raw.split('\n').map(line => {
    if (/^# /.test(line))   return { type: 'h1', text: line.slice(2).trim() }
    if (/^## /.test(line))  return { type: 'h2', text: line.slice(3).trim() }
    if (/^### /.test(line)) return { type: 'h3', text: line.slice(4).trim() }
    if (/^- /.test(line))   return { type: 'li', text: line.slice(2).trim() }
    if (/^---/.test(line))  return { type: 'hr' }
    if (line.trim() === '') return { type: 'blank' }
    return { type: 'p', text: line.trim() }
  })
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  )
}

function extractVersion(text: string) {
  const m = text.match(/\[([^\]]+)\]/)
  return m ? m[1] : text
}
function extractDate(text: string) {
  const m = text.match(/—\s*(.+)$/)
  return m ? m[1].trim() : ''
}

const sectionIcons: Record<string, React.ReactNode> = {
  'Adicionado': <Zap className="w-3.5 h-3.5" />,
  'Corrigido':  <Wrench className="w-3.5 h-3.5" />,
}
const sectionColors: Record<string, string> = {
  'Adicionado': 'text-accent-green',
  'Corrigido':  'text-yellow-400',
}

function ChangelogView({ blocks }: { blocks: Block[] }) {
  const nodes: React.ReactNode[] = []
  let key = 0

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === 'h1') {
      // skip
    } else if (b.type === 'h2') {
      const ver  = extractVersion(b.text)
      const date = extractDate(b.text)
      nodes.push(
        <div key={key++} className="flex items-center gap-3 mt-6 mb-3 first:mt-0">
          <span className="px-3 py-1 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-400 text-sm font-bold font-mono">
            {ver}
          </span>
          {date && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              {date}
            </span>
          )}
          <div className="flex-1 h-px bg-surface-500" />
        </div>
      )
    } else if (b.type === 'h3') {
      const icon  = sectionIcons[b.text]
      const color = sectionColors[b.text] ?? 'text-gray-400'
      nodes.push(
        <div key={key++} className={`flex items-center gap-1.5 mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wider ${color}`}>
          {icon}
          {b.text}
        </div>
      )
    } else if (b.type === 'li') {
      nodes.push(
        <div key={key++} className="flex items-start gap-2 text-sm text-gray-300 mb-1 pl-2">
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-600" />
          <span>{renderInline(b.text)}</span>
        </div>
      )
    } else if (b.type === 'hr') {
      nodes.push(<hr key={key++} className="border-surface-500 my-4" />)
    } else if (b.type === 'p' && b.text) {
      nodes.push(
        <p key={key++} className="text-sm text-gray-400 mb-1">{renderInline(b.text)}</p>
      )
    }
  }
  return <>{nodes}</>
}

// ── Manual do Usuário ─────────────────────────────────────────────────────────

interface ManualSection {
  icon: React.ReactNode
  title: string
  color: string
  steps: { title: string; desc: string }[]
  tips?: string[]
}

const MANUAL: ManualSection[] = [
  {
    icon: <LayoutDashboard className="w-4 h-4" />,
    title: 'Dashboard',
    color: 'text-brand-400',
    steps: [
      { title: 'Comandas em destaque', desc: 'Ao abrir o dashboard, as comandas ativas aparecem imediatamente — sem precisar rolar a página. Os 4 KPIs no topo (comandas ativas, receita do dia, valor em aberto, estoque baixo) ficam sempre visíveis.' },
      { title: 'Tab Ativas', desc: 'Lista em tempo real de todas as comandas abertas. Use a busca para filtrar por cliente.' },
      { title: 'Tab Histórico', desc: 'Comandas fechadas e canceladas do dia. Inclui filtro por nome do cliente e por intervalo de horário (de HH:mm até HH:mm), além do breakdown por forma de pagamento calculado sobre os registros filtrados.' },
      { title: 'Tab Análises', desc: 'Todos os painéis financeiros: detalhe do dia, gráfico de receita 7 dias, previsão do mês, patrimônio em estoque, top clientes, LGPD e pré-inscrições de campeonatos. Cada painel é colapsável individualmente.' },
      { title: 'Atualização automática', desc: 'Intervalo configurável nas Preferências (15s, 30s, 1min ou manual). Também conecta via SignalR para receber eventos em tempo real.' },
    ],
    tips: [
      'Quais painéis aparecem na tab Análises é controlado pelas Configurações → Dashboard.',
      'O esquema de cores do gráfico (Padrão, Azul, Neon) também é configurável por usuário.',
    ],
  },
  {
    icon: <ShoppingBag className="w-4 h-4" />,
    title: 'Comandas (Mesa / QR Code)',
    color: 'text-blue-400',
    steps: [
      { title: 'Como funciona', desc: 'O cliente escaneia o QR Code da mesa e abre a própria comanda. O sistema identifica o cliente automaticamente.' },
      { title: 'Adicionar itens', desc: 'No painel admin, clique na comanda aberta e pesquise o produto. Você também pode adicionar itens manualmente com nome e preço.' },
      { title: 'Fechar a comanda', desc: 'Clique em "Fechar Comanda", escolha a forma de pagamento (Dinheiro, Pix, Cartão, Crediário, Pontos ou Cashback) e confirme. O sistema desconta o estoque automaticamente.' },
      { title: 'Split de pagamento', desc: 'É possível usar duas formas de pagamento ao mesmo tempo. Selecione a segunda forma e informe o valor dela.' },
      { title: 'Cancelar comanda', desc: 'Se o cliente desistir, use "Cancelar". O estoque não é alterado e a comanda some do painel.' },
      { title: 'Agrupar itens', desc: 'Itens iguais são somados automaticamente na visualização para facilitar a conferência.' },
    ],
    tips: [
      'Comandas com status "Aberta" ainda não têm itens. "Em Andamento" já tem pelo menos um item.',
      'O admin pode abrir uma comanda manualmente em nome de um cliente pelo botão "Nova Comanda".',
    ],
  },
  {
    icon: <ShoppingCart className="w-4 h-4" />,
    title: 'Venda Avulsa — Frente de Caixa (PDV)',
    color: 'text-emerald-400',
    steps: [
      { title: 'Quando usar', desc: 'Para vendas rápidas no balcão, sem precisar de QR Code ou comanda. Ideal para clientes que chegam e pagam na hora.' },
      { title: 'Wizard 3 etapas', desc: 'O PDV guia você por três passos: 1) selecionar cliente, 2) adicionar produtos, 3) escolher pagamento. Navegue livremente entre as etapas sem perder o carrinho.' },
      { title: 'Adicionar produtos', desc: 'Na etapa de itens, pesquise pelo nome ou escaneie o código de barras. A câmera pode ser usada para escanear direto do celular.' },
      { title: 'Barra flutuante de finalização', desc: 'O total e o botão de finalizar ficam visíveis em todas as etapas numa barra fixa no rodapé. Inclui botão de desconto rápido sem precisar navegar entre abas.' },
      { title: 'Desconto rápido', desc: 'Aplique desconto percentual diretamente na barra flutuante ou no bottom sheet da comanda. O sistema mostra o valor original e o valor com desconto em tempo real.' },
      { title: 'Split de pagamento', desc: 'Na etapa de pagamento, selecione uma segunda forma e informe o valor — o saldo restante é calculado automaticamente.' },
      { title: 'Analytics de vendas', desc: 'Após as vendas do dia, acesse o histórico do PDV com gráfico de pico de horário, top produtos vendidos e breakdown por forma de pagamento.' },
    ],
    tips: [
      'O desconto padrão (0%, 5%, 10%, 15% ou 20%) pode ser pré-configurado nas Preferências → Frente de Caixa.',
      'Vendas avulsas com cliente identificado ficam no histórico do cliente.',
    ],
  },
  {
    icon: <Package className="w-4 h-4" />,
    title: 'Estoque (Produtos)',
    color: 'text-orange-400',
    steps: [
      { title: 'Cadastrar produto', desc: 'Vá em Estoque → Novo Produto. Preencha nome, categoria, preço de custo, preço de venda e estoque inicial.' },
      { title: 'Estoque mínimo', desc: 'Defina um estoque mínimo para receber alertas quando o produto estiver baixo. Aparece em destaque no painel.' },
      { title: 'Promoção', desc: 'Ative o campo "Em Promoção" e informe o preço promocional. O sistema usa o preço com desconto automaticamente nas vendas.' },
      { title: 'Código de barras', desc: 'Cadastre o código de barras para agilizar vendas no caixa — basta escanear para adicionar o produto.' },
      { title: 'Ajuste de estoque', desc: 'Para corrigir o estoque (entrada de mercadoria, inventário), use o botão de ajuste manual no produto.' },
      { title: 'Desativar produto', desc: 'Produtos inativos não aparecem nas vendas, mas o histórico é mantido. Use isso em vez de excluir.' },
    ],
    tips: [
      'O estoque é descontado automaticamente a cada venda — comanda ou PDV.',
      'Produtos com estoque zerado ainda podem ser vendidos manualmente, mas aparecem com aviso.',
    ],
  },
  {
    icon: <Users className="w-4 h-4" />,
    title: 'Clientes & Cashback',
    color: 'text-purple-400',
    steps: [
      { title: 'Cadastrar cliente', desc: 'Clique em "Novo Cliente". Nome é obrigatório; CPF, WhatsApp e e-mail são opcionais mas ajudam na identificação.' },
      { title: 'Pontos Maikon', desc: 'A cada R$1 gasto, o cliente ganha 1 ponto. Os pontos expiram em 30 dias após a última compra. Use para dar desconto em comandas e vendas avulsas.' },
      { title: 'Adicionar pontos manualmente', desc: 'Selecione o cliente no painel e informe a quantidade de pontos e o motivo (ex: "Campeonato de Pokémon").' },
      { title: 'Cashback (Saldo)', desc: 'Diferente de pontos — é saldo em reais que o cliente pode usar como pagamento. Crédite ou débite manualmente pelo painel.' },
      { title: 'Histórico completo', desc: 'Clique em "Ver Histórico" no painel do cliente para ver todas as comandas, vendas no caixa, crediários e campeonatos do cliente em um único lugar.' },
      { title: 'Clientes inativos', desc: 'A aba "Inativos" mostra clientes que não aparecem há mais de 30 dias — útil para campanhas de reativação.' },
    ],
    tips: [
      'Pontos e cashback são coisas diferentes: pontos têm validade e são 1:1 com centavos; cashback é saldo em reais sem validade.',
      'Para redefinir a senha de um cliente, use o botão "Redefinir Senha" no painel lateral.',
    ],
  },
  {
    icon: <CreditCard className="w-4 h-4" />,
    title: 'Crediário',
    color: 'text-orange-400',
    steps: [
      { title: 'O que é', desc: 'O cliente leva os produtos e paga depois. O sistema cria uma dívida vinculada ao cliente com vencimento em 30 dias.' },
      { title: 'Como abrir', desc: 'Ao fechar uma comanda ou venda avulsa, selecione "Crediário" como forma de pagamento. O cliente precisa estar cadastrado.' },
      { title: 'Um crediário por vez', desc: 'Cada cliente só pode ter um crediário aberto. Novas compras no crediário acumulam no mesmo saldo.' },
      { title: 'Ver os itens', desc: 'No painel de crediário, expanda o card do cliente para ver exatamente o que ele levou em todas as visitas.' },
      { title: 'Registrar pagamento parcial', desc: 'Clique em "Registrar Pagamento" e informe o valor pago e a forma de pagamento. O saldo é atualizado automaticamente.' },
      { title: 'Quitar o crediário', desc: 'Quando o valor total for pago, clique em "Marcar como Pago". O cliente fica liberado para abrir um novo.' },
      { title: 'Crediário vencido', desc: 'Aparece em vermelho no painel quando passou dos 30 dias sem pagamento. Use para cobrar os clientes em atraso.' },
      { title: 'Recebimentos no Financeiro', desc: 'Na tela Financeiro, o card de Crediários mostra no sub-texto o total recebido no período filtrado. Clique no card para ver a lista detalhada de cada pagamento: cliente, valor, forma de pagamento, horário e observação.' },
      { title: 'PDF de Crediário', desc: 'Em Relatórios → Crediário, gere um PDF com a situação atual de todos os devedores (saldo, dias em atraso, vencimento, WhatsApp) e o histórico completo de pagamentos recebidos no mês selecionado.' },
    ],
    tips: [
      'O vencimento é renovado automaticamente sempre que o cliente faz um novo pagamento parcial.',
      'Crediários criados via venda avulsa e via comanda aparecem juntos no mesmo painel.',
    ],
  },
  {
    icon: <Trophy className="w-4 h-4" />,
    title: 'Campeonatos',
    color: 'text-yellow-400',
    steps: [
      { title: 'Criar campeonato', desc: 'Vá em Campeonatos → Novo. Informe nome, jogo (Pokémon, Magic, etc.), data, taxa de inscrição e número máximo de participantes.' },
      { title: 'Status do campeonato', desc: '"Planejado" → "Inscrições Abertas" → "Em Andamento" → "Finalizado". Mude o status conforme o evento avança.' },
      { title: 'Inscrever participantes', desc: 'Clientes podem se inscrever pelo site. A inclusão manual pelo painel é exclusiva do Maikon. Em campeonato pago, o Pix é obrigatório e não há pagamento na chegada.' },
      { title: 'Pré-inscrições da landing page', desc: 'Clientes sem conta podem se pré-inscrever pelo link público do campeonato. Você aprova ou rejeita as pré-inscrições no painel.' },
      { title: 'Definir colocações', desc: 'Após o campeonato, clique no participante e informe o lugar (1º, 2º, 3º...). O sistema monta o pódio automaticamente.' },
      { title: 'Pódio público', desc: 'O resultado final aparece na página pública do campeonato para todos verem.' },
    ],
    tips: [
      'A taxa de inscrição é registrada manualmente — o sistema não cobra automaticamente.',
      'Use "Cancelado" para campeonatos que não aconteceram para manter o histórico limpo.',
    ],
  },
  {
    icon: <BarChart2 className="w-4 h-4" />,
    title: 'Relatórios',
    color: 'text-cyan-400',
    steps: [
      { title: 'Relatório PDV', desc: 'Mostra todas as vendas avulsas do período: receita dia a dia, top produtos vendidos e formas de pagamento usadas.' },
      { title: 'Relatório de Clientes', desc: 'Lista todos os clientes com pontos, cashback e status de atividade. Ajuda a identificar quem está ativo e quem parou de visitar.' },
      { title: 'Comandas Abertas', desc: 'Mostra as comandas que estão há mais dias abertas. Útil para identificar clientes que ainda não fecharam a conta.' },
      { title: 'Relatório Financeiro', desc: 'Visão consolidada de receitas por período, formas de pagamento e ticket médio.' },
      { title: 'Relatório de Crediário', desc: 'Lista todos os devedores atuais com saldo, dias em atraso, vencimento e WhatsApp (marcados em vermelho quando vencidos) e a tabela completa de pagamentos recebidos no mês, com subtotal ao final.' },
      { title: 'Exportar PDF', desc: 'Cada relatório tem botão de exportação em PDF para imprimir ou compartilhar.' },
    ],
  },
  {
    icon: <Layers className="w-4 h-4" />,
    title: 'Catálogo TCG',
    color: 'text-pink-400',
    steps: [
      { title: 'O que é', desc: 'Catálogo integrado de cartas de jogos de coleção (Pokémon, Magic, etc.) com preços de mercado atualizados.' },
      { title: 'Buscar cartas', desc: 'Pesquise por nome da carta e jogo. O sistema busca na base de dados externa e mostra preços de referência.' },
      { title: 'Adicionar à comanda', desc: 'Encontrou a carta? Adicione diretamente na comanda aberta do cliente, com preço de mercado como referência.' },
    ],
    tips: ['Os preços do catálogo são referência de mercado — você define o preço final na comanda.'],
  },
  {
    icon: <Megaphone className="w-4 h-4" />,
    title: 'Anúncios e Banners',
    color: 'text-rose-400',
    steps: [
      { title: 'Criar anúncio', desc: 'Vá em Anúncios → Novo. Escolha o tipo (Banner, Aviso ou Destaque), escreva o texto e defina se tem imagem e data de expiração.' },
      { title: 'Banners', desc: 'Aparecem em destaque na área do cliente — ideal para promoções e eventos.' },
      { title: 'Avisos e destaques', desc: 'Aparecem em carrossel rotativo abaixo do hero da landing page. Navegação por setas e pausa automática ao tocar.' },
      { title: 'Expiração automática', desc: 'Defina uma data de expiração e o anúncio some automaticamente. Útil para promoções com prazo.' },
    ],
  },
  {
    icon: <Settings className="w-4 h-4" />,
    title: 'Configurações e Preferências',
    color: 'text-gray-300',
    steps: [
      { title: 'Preferências por perfil', desc: 'Cada usuário tem suas próprias configurações salvas no servidor. Mudar em um dispositivo reflete em todos os outros automaticamente.' },
      { title: 'Assistente IA', desc: 'Ative ou desative o chat IA flutuante. Escolha entre botão arrastável (posição salva) ou fixo em um dos 4 cantos da tela.' },
      { title: 'VLibras (Acessibilidade)', desc: 'Ative ou desative o widget de tradução em Libras e escolha o canto da tela onde ele aparece.' },
      { title: 'Dashboard — Painéis visíveis', desc: 'Escolha quais painéis aparecem na tab Análises: detalhe financeiro, gráfico, previsão, patrimônio, top clientes, LGPD, top produtos e pré-inscrições.' },
      { title: 'Dashboard — Intervalo e cores', desc: 'Configure o intervalo de atualização automática (15s, 30s, 1min ou manual) e o esquema de cores do gráfico de receita.' },
      { title: 'Frente de Caixa — Desconto padrão', desc: 'Pré-selecione o desconto padrão (0%, 5%, 10%, 15% ou 20%) que aparece ao abrir uma nova venda no PDV.' },
    ],
    tips: [
      'Todas as mudanças nas configurações são aplicadas em tempo real — sem precisar recarregar a página.',
      'Use "Resetar layout" nas configurações do Dashboard para reabrir todos os painéis colapsados.',
    ],
  },
  {
    icon: <Keyboard className="w-4 h-4" />,
    title: 'Atalhos de Teclado',
    color: 'text-pink-400',
    steps: [
      { title: 'Navegar pelo teclado', desc: 'Pressione uma tecla para ir direto à página (sem clicar no menu): D → Dashboard, P → PDV, E → Estoque, U → Clientes, C → Crediário, F → Financeiro, R → Relatórios, A → Campeonatos. Só funciona quando nenhum campo de texto está focado.' },
      { title: 'Ver todos os atalhos', desc: 'Pressione ? (Shift + /) em qualquer tela para abrir o painel de ajuda com a lista completa de atalhos. Pressione ? novamente ou Esc para fechar.' },
      { title: 'Fechar com Esc', desc: 'A tecla Esc fecha modais, painéis flutuantes e o painel de atalhos em qualquer contexto.' },
      { title: 'Badges no menu lateral', desc: 'No desktop, ao passar o mouse sobre um item do menu, a tecla de atalho correspondente aparece discretamente ao lado do nome.' },
      { title: 'Não interfere com digitação', desc: 'Os atalhos de navegação ficam desativados enquanto você digita em campos de busca ou formulários. Só a tecla ? continua ativa em qualquer contexto.' },
    ],
    tips: [
      'As teclas são case-insensitive — maiúscula ou minúscula funciona igual.',
      'Funciona também com teclado físico Bluetooth conectado ao celular.',
    ],
  },
]

function ManualSection({ section }: { section: ManualSection }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${open ? 'border-surface-400' : 'border-surface-500'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-700/50 transition-colors"
      >
        <span className={`${section.color} shrink-0`}>{section.icon}</span>
        <span className="font-semibold text-white text-sm flex-1">{section.title}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-surface-500">
          <div className="pt-3 space-y-2.5">
            {section.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-surface-700 border border-surface-500 flex items-center justify-center text-[10px] font-bold text-gray-400 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{step.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {section.tips && section.tips.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-500 space-y-1.5">
              <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider">Dicas</p>
              {section.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="text-brand-400 shrink-0 mt-0.5">→</span>
                  {tip}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SobrePage() {
  const [raw,     setRaw]     = useState<string | null>(null)
  const [error,   setError]   = useState(false)
  const [version, setVersion] = useState('—')
  const [tab,     setTab]     = useState<'manual' | 'changelog'>('manual')

  useEffect(() => {
    fetch('/CHANGELOG.md')
      .then(r => { if (!r.ok) throw new Error(); return r.text() })
      .then(text => {
        setRaw(text)
        const m = text.match(/^## \[([^\]]+)\]/m)
        if (m) setVersion(m[1])
      })
      .catch(() => setError(true))
  }, [])

  const blocks = raw ? parseMd(raw) : []

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Sobre o Sistema"
        subtitle="Santuário Nerd — Plataforma de Gestão"
        actions={
          <>
            <Tag className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-mono font-semibold text-brand-400">{version}</span>
            <Link
              href="/admin/manual"
              target="_blank"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 hover:bg-brand-500/20 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" /> Manual PDF
            </Link>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl mb-6">
        <button
          onClick={() => setTab('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'manual' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Manual do Usuário
        </button>
        <button
          onClick={() => setTab('changelog')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'changelog' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Zap className="w-4 h-4" /> Atualizações
        </button>
      </div>

      {/* Manual */}
      {tab === 'manual' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-4">
            Clique em qualquer módulo para ver como usar. Tudo aqui foi pensado para ser simples e direto.
          </p>
          {MANUAL.map(section => (
            <ManualSection key={section.title} section={section} />
          ))}
        </div>
      )}

      {/* Changelog */}
      {tab === 'changelog' && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Histórico de Atualizações
          </h2>

          {error && (
            <p className="text-sm text-red-400">
              Não foi possível carregar o changelog. Verifique se o arquivo
              <code className="mx-1 px-1 bg-surface-700 rounded text-xs">public/CHANGELOG.md</code>
              existe.
            </p>
          )}

          {!raw && !error && (
            <div className="space-y-3 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-surface-700 rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
              ))}
            </div>
          )}

          {raw && <ChangelogView blocks={blocks} />}
        </div>
      )}
    </div>
  )
}
