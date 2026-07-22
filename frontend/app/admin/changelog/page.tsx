'use client'

import { Zap, Wrench, Shield, Star, Package, Trophy, Timer, ShoppingBag, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

interface Release {
  version: string
  date: string
  tag: 'feature' | 'fix' | 'security' | 'improvement'
  title: string
  changes: { type: 'feat' | 'fix' | 'sec' | 'imp'; text: string }[]
}

const tagStyle: Record<Release['tag'], string> = {
  feature:     'bg-brand-500/20 text-brand-300 border-brand-500/30',
  fix:         'bg-red-500/20 text-red-400 border-red-500/30',
  security:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
  improvement: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const tagLabel: Record<Release['tag'], string> = {
  feature: 'Nova feature', fix: 'Correção', security: 'Segurança', improvement: 'Melhoria',
}
const typeIcon: Record<string, string> = {
  feat: '✨', fix: '🐛', sec: '🔐', imp: '⚡',
}

const RELEASES: Release[] = [
  {
    version: '1.10.0',
    date: '2026-06-28',
    tag: 'feature',
    title: 'Grade de produtos, Reservas, Mercado de Cartas, Manual e Changelog',
    changes: [
      { type: 'feat', text: 'Grade de tamanhos e cores no estoque (camisas, moletons, etc.)' },
      { type: 'feat', text: 'Sistema de reserva de itens via site — estoque não decrementa até admin confirmar' },
      { type: 'feat', text: 'Perfis públicos de usuários: decks públicos + histórico de torneios' },
      { type: 'imp',  text: 'Mercado renomeado para "Mercado de Cartas"' },
      { type: 'feat', text: 'Manual do sistema integrado (esta página)' },
      { type: 'feat', text: 'Changelog integrado ao sistema' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-06-27',
    tag: 'feature',
    title: 'Marketplace C2C + Perfis públicos',
    changes: [
      { type: 'feat', text: 'Mercado de Cartas: usuários anunciam, compram e vendem entre si' },
      { type: 'feat', text: 'Upload de foto de carta direto no modal (sem URL)' },
      { type: 'feat', text: 'Fluxo de venda via WhatsApp: comprador autoriza contato explicitamente (LGPD)' },
      { type: 'feat', text: 'Painel admin do Marketplace: moderar e gerenciar anúncios' },
      { type: 'sec',  text: 'Consentimento LGPD: WhatsApp do comprador só exposto com checkbox explícito' },
      { type: 'sec',  text: 'Declaração de maioridade obrigatória (ECA + Código Civil arts. 3-5)' },
      { type: 'feat', text: 'Perfil público: decks públicos + conquistas em campeonatos' },
      { type: 'feat', text: 'Módulo KYC preparado (esqueleto) — aguardando decisão para implementar' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-06-25',
    tag: 'feature',
    title: 'Timer de torneio global + Indicadores de comanda',
    changes: [
      { type: 'feat', text: 'Timer de torneio: criar, iniciar, pausar, resetar múltiplos timers' },
      { type: 'feat', text: 'Alarme de timer toca em todo o sistema admin (não só na página do timer)' },
      { type: 'feat', text: 'Popup lateral com alarme + botões Resetar/Dispensar de qualquer página' },
      { type: 'feat', text: 'Indicador visual em comandas: verde (+) e âmbar (−) por 5 minutos após alteração' },
      { type: 'imp',  text: 'Deck do cliente pré-preenchido ao confirmar pré-inscrição no campeonato' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-06-22',
    tag: 'feature',
    title: 'Decks + Campeonatos + Seleção de deck na inscrição',
    changes: [
      { type: 'feat', text: 'Gerenciador de decks: criar, editar, importar via texto, marcar como público' },
      { type: 'feat', text: 'Cliente seleciona deck na inscrição de campeonatos' },
      { type: 'feat', text: 'Admin vê deck de cada inscrito na lista de pré-inscrições' },
      { type: 'imp',  text: 'WhatsApp inclui deck escolhido na mensagem de inscrição' },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-06-20',
    tag: 'security',
    title: 'LGPD: logs de auditoria + monitoramento de segurança',
    changes: [
      { type: 'sec',  text: 'Audit log de LoginSucesso e LoginFalhou com IP hasheado (LGPD)' },
      { type: 'feat', text: 'Painel LGPD: alertas visuais para tentativas de invasão' },
      { type: 'feat', text: 'Filtros por tipo de evento no log de auditoria' },
      { type: 'imp',  text: 'IPs armazenados como SHA-256 + salt (nunca em texto puro)' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-06-15',
    tag: 'feature',
    title: 'Campeonatos + Pré-inscrições via site',
    changes: [
      { type: 'feat', text: 'Módulo de campeonatos: criar, abrir inscrições, gerir participantes' },
      { type: 'feat', text: 'Pré-inscrição via site: cliente se inscreve pelo celular' },
      { type: 'feat', text: 'Lista de espera automática quando campeonato está cheio' },
      { type: 'feat', text: 'Admin confirma pré-inscrição e define número do jogador' },
      { type: 'feat', text: 'Pódio editável: registrar colocações dos participantes' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-06-10',
    tag: 'feature',
    title: 'Frente de caixa (PDV) + Venda avulsa',
    changes: [
      { type: 'feat', text: 'PDV com busca de produto por nome ou código de barras' },
      { type: 'feat', text: 'Desconto por produto ou total da venda' },
      { type: 'feat', text: 'Múltiplas formas de pagamento numa venda' },
      { type: 'feat', text: 'Pontuação automática na venda (programa de fidelidade)' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-05',
    tag: 'feature',
    title: 'Crediário + Fidelidade',
    changes: [
      { type: 'feat', text: 'Sistema de crediário: saldo devedor por cliente, histórico de pagamentos' },
      { type: 'feat', text: 'Programa de pontos: acumulação e resgate' },
      { type: 'feat', text: 'Relatório de devedores: vencidos em destaque, dias de atraso' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-28',
    tag: 'feature',
    title: 'Comandas + Dashboard ao vivo',
    changes: [
      { type: 'feat', text: 'Sistema de comandas por mesa com QR Code' },
      { type: 'feat', text: 'Dashboard ao vivo com atualização automática' },
      { type: 'feat', text: 'Cliente acompanha própria comanda pelo celular' },
      { type: 'feat', text: 'Fila de espera via WhatsApp' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-15',
    tag: 'feature',
    title: 'Lançamento inicial',
    changes: [
      { type: 'feat', text: 'Cadastro de produtos e categorias' },
      { type: 'feat', text: 'Gestão de clientes e perfis' },
      { type: 'feat', text: 'Autenticação com JWT + refresh token' },
      { type: 'feat', text: 'Controle de permissões por perfil (Admin / Operador / Customer)' },
    ],
  },
]

export default function ChangelogPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Changelog" subtitle="Histórico de atualizações do sistema" />

      <div className="relative">
        {/* Linha vertical */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-surface-700" />

        <div className="flex flex-col gap-8">
          {RELEASES.map((r, idx) => (
            <div key={r.version} className="relative flex gap-5">
              {/* Círculo na linha */}
              <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black ${idx === 0 ? 'bg-brand-500 text-white' : 'bg-surface-700 text-gray-400'}`}>
                {idx === 0 ? <Zap className="w-4 h-4" /> : <span className="text-[10px]">{r.version.split('.')[0]}.{r.version.split('.')[1]}</span>}
              </div>

              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-black text-white bg-surface-700 px-2 py-0.5 rounded-lg">v{r.version}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tagStyle[r.tag]}`}>
                    {tagLabel[r.tag]}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">{new Date(r.date).toLocaleDateString('pt-BR')}</span>
                </div>

                <h3 className="font-bold text-white mb-3">{r.title}</h3>

                <div className="card flex flex-col gap-1.5 py-3 px-4">
                  {r.changes.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="shrink-0 mt-0.5">{typeIcon[c.type]}</span>
                      <span className="text-gray-300">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
