'use client'

// =============================================================================
// /admin/liguinha — Central da Liguinha (chave "admin-liguinha-central", v1.56.0)
//
// Pedido do Maikon (19/10/2026): "algo igual o Challonge" pra conferir, lançar e
// administrar os torneios e a Liga num lugar só, na identidade visual da loja.
// Lista de torneios com busca e filtro, criar torneio em um passo, lançar etapa
// jogada fora do sistema e a Liga do mês ao lado. Cada torneio abre em
// /admin/liguinha/[id] (painel, jogadores, rodadas, classificação).
// As telas antigas (Campeonatos, Liga Mensal) continuam no menu.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Award, BarChart3, CalendarDays, ChevronRight, ClipboardList, Crown, Loader2, Monitor, Plus, Search, Swords, Trophy, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge, BadgeTone } from '@/components/ui/Badge'
import { championshipApi, ligaMensalApi, Championship, LigaMensalDto, Modalidade } from '@/lib/api'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { hojeBrasil } from '@/lib/format'
import { pixel } from '@/lib/fontePixel'
import CriarTorneio from '@/components/liga/admin/CriarTorneio'
import { precosRecentes } from '@/components/liga/admin/EscolherEntrada'
import { brlDeCentavos } from '@/lib/format'
import LancarEtapa from '@/components/liga/admin/LancarEtapa'
import { dataBR, mesBR, normalizarNome } from '@/components/liga/admin/nomes'

type Filtro = 'todos' | 'andamento' | 'inscricoes' | 'encerrados' | 'cancelados'

const STATUS: Record<string, { rotulo: string; tone: BadgeTone }> = {
  Planejado:   { rotulo: 'Rascunho',          tone: 'neutral' },
  Inscricoes:  { rotulo: 'Inscrições abertas', tone: 'info' },
  EmAndamento: { rotulo: 'Em andamento',      tone: 'warning' },
  Finalizado:  { rotulo: 'Encerrado',         tone: 'success' },
  Cancelado:   { rotulo: 'Cancelado',         tone: 'danger' },
}

/** Rodando agora: já tem rodada solta e não encerrou. */
const emJogo = (c: Championship) => (c.rodadaAtual ?? 0) > 0 && c.status !== 'Finalizado' && c.status !== 'Cancelado'

function passaNoFiltro(c: Championship, f: Filtro) {
  switch (f) {
    case 'andamento':  return emJogo(c) || c.status === 'EmAndamento'
    case 'inscricoes': return (c.status === 'Inscricoes' || c.status === 'Planejado') && !emJogo(c)
    case 'encerrados': return c.status === 'Finalizado'
    case 'cancelados': return c.status === 'Cancelado'
    default:           return true
  }
}

function Numero({ icone, rotulo, valor, detalhe }: { icone: React.ReactNode; rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="card !p-4">
      <p className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">{icone}{rotulo}</p>
      <p className="text-2xl font-bold text-white mt-1 truncate">{valor}</p>
      {detalhe && <p className="text-xs text-gray-500 truncate">{detalhe}</p>}
    </div>
  )
}

export default function CentralLiguinhaPage() {
  const [lista, setLista] = useState<Championship[] | null>(null)
  const [liga, setLiga] = useState<LigaMensalDto | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [criando, setCriando] = useState(false)
  const modalidades = useFuncionalidade('liga-modalidades') !== false
  const [modo, setModo] = useState<'tudo' | Modalidade>('tudo')
  const modalidadeDe = (c: Championship): Modalidade => c.modalidade ?? 'Liga'
  const [lancando, setLancando] = useState(false)

  const carregar = useCallback(() => {
    championshipApi.listAll().then(r => setLista(r.data)).catch(() => setLista([]))
    ligaMensalApi.ranking().then(r => setLiga(r.data)).catch(() => setLiga(null))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const mesAtual = hojeBrasil().slice(0, 7)
  const ordenada = useMemo(() => [...(lista ?? [])].sort((a, b) => {
    // em jogo primeiro; depois do mais novo pro mais antigo
    if (emJogo(a) !== emJogo(b)) return emJogo(a) ? -1 : 1
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  }), [lista])
  const termo = normalizarNome(busca)
  const doModo = ordenada.filter(c => !modalidades || modo === 'tudo' || modalidadeDe(c) === modo)
  const visiveis = doModo.filter(c => passaNoFiltro(c, filtro) && (!termo || normalizarNome(c.name).includes(termo)))
  const contagem = (f: Filtro) => doModo.filter(c => passaNoFiltro(c, f)).length

  // etapa da Liga = evento de modalidade Liga encerrado no mês (campeonato avulso não conta)
  const etapasNoMes = ordenada.filter(c => c.status === 'Finalizado' && mesBR(c.startDate) === mesAtual
    && (!modalidades || modalidadeDe(c) === 'Liga')).length
  const agora = ordenada.filter(emJogo)
  const lider = liga?.ranking[0]

  const FILTROS: { f: Filtro; rotulo: string }[] = [
    { f: 'todos', rotulo: 'Todos' }, { f: 'andamento', rotulo: 'Em andamento' }, { f: 'inscricoes', rotulo: 'Inscrições' },
    { f: 'encerrados', rotulo: 'Encerrados' }, { f: 'cancelados', rotulo: 'Cancelados' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Central da Liguinha"
        subtitle="Torneios, etapas e a Liga do mês num lugar só"
        actions={<>
          <Link href="/admin/liguinha/liga" className="btn-secondary"><BarChart3 className="w-4 h-4" /> Liga e métricas</Link>
          <button onClick={() => setLancando(true)} className="btn-secondary"><ClipboardList className="w-4 h-4" /> Lançar etapa de fora</button>
          <button onClick={() => setCriando(true)} className="btn-primary"><Plus className="w-4 h-4" /> Criar torneio</button>
        </>}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Numero icone={<Swords className="w-3.5 h-3.5" />} rotulo="Acontecendo agora" valor={agora.length}
          detalhe={agora[0] ? `${agora[0].name} · rodada ${agora[0].rodadaAtual}` : 'nenhum torneio rodando'} />
        <Numero icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Etapas no mês" valor={etapasNoMes}
          detalhe={liga?.mesLabel} />
        <Numero icone={<Crown className="w-3.5 h-3.5" />} rotulo="Líder da Liga" valor={lider?.playerName ?? '—'}
          detalhe={lider ? `${lider.totalPoints} pts` : 'sem pontos no mês'} />
        <Numero icone={<Users className="w-3.5 h-3.5" />} rotulo="Jogadores na Liga" valor={liga?.ranking.length ?? 0}
          detalhe="pontuaram no mês" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px] items-start">
        {/* ── Torneios ─────────────────────────────────────────────────── */}
        <section className="space-y-3 min-w-0">
          {modalidades && (
            <div className="inline-flex rounded-xl border border-surface-500 p-1 gap-1" role="tablist" aria-label="Modalidade">
              {([['tudo', 'Tudo'], ['Liga', 'Liga'], ['Campeonato', 'Campeonatos']] as const).map(([m, rotulo]) => (
                <button key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
                  className={clsx('text-sm px-3 py-1 rounded-lg font-semibold', modo === m ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white')}
                  style={modo === m ? { color: '#FFFFFF' } : undefined}>
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procure seus torneios"
              aria-label="Procurar torneio" className="input w-full pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar torneios">
            {FILTROS.map(({ f, rotulo }) => (
              <button key={f} role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}
                className={clsx('text-sm px-3 py-1.5 rounded-full whitespace-nowrap', filtro === f ? 'btn-primary' : 'btn-secondary')}>
                {rotulo} <span className="opacity-70">{lista ? contagem(f) : ''}</span>
              </button>
            ))}
          </div>

          {!lista ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-400 animate-spin" /></div>
          ) : visiveis.length === 0 ? (
            <div className="card text-center py-10 space-y-3">
              <Trophy className="w-10 h-10 text-gray-500 mx-auto" />
              <p className="text-gray-300">{lista.length === 0 ? 'Nenhum torneio ainda.' : 'Nenhum torneio com esse filtro.'}</p>
              {lista.length === 0 && (
                <p className="text-sm text-gray-500">Crie o primeiro ou lance uma etapa que foi jogada fora do sistema.</p>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {visiveis.map(c => {
                const st = emJogo(c) ? { rotulo: `Rodada ${c.rodadaAtual}${c.numeroRodadas ? ` de ${c.numeroRodadas}` : ''}`, tone: 'warning' as BadgeTone } : STATUS[c.status] ?? STATUS.Planejado
                const suico = c.formato === 'Suico'
                const jogadores = c.participantCount ?? 0
                return (
                  <li key={c.id} className="card !p-0 overflow-hidden">
                    <Link href={`/admin/liguinha/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-700/40">
                      <div className="w-14 shrink-0 text-center rounded-xl bg-surface-700 py-2">
                        <p className={`${pixel.className} text-sm text-white`}>{dataBR(c.startDate, { day: '2-digit' })}</p>
                        <p className="text-[10px] uppercase font-bold text-gray-400 mt-1">{dataBR(c.startDate, { month: 'short' }).replace('.', '')}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{c.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {modalidades ? `${modalidadeDe(c) === 'Liga' ? 'Liguinha' : 'Campeonato'} · ` : ''}{c.game}
                          {modalidades && modalidadeDe(c) === 'Campeonato' && !suico
                            ? ` · ${jogadores} inscrito${jogadores === 1 ? '' : 's'}${c.maxParticipants ? ` de ${c.maxParticipants}` : ''}`
                            : ` · ${suico ? 'Suíço' : 'Livre / lançado'} · ${jogadores} jogador${jogadores === 1 ? '' : 'es'}`}
                          {` · ${c.entryFeeInCents > 0 ? `entrada ${brlDeCentavos(c.entryFeeInCents)}` : 'grátis'}`}
                          {suico && !['Finalizado', 'Cancelado'].includes(c.status) && (c.presentesCount ?? 0) > 0 ? ` · ${c.presentesCount} presentes` : ''}
                        </p>
                      </div>
                      <Badge tone={st.tone} className="hidden sm:inline-flex shrink-0">{st.rotulo}</Badge>
                      {suico && <span className="hidden md:inline-flex" title="Telão"><Monitor className="w-4 h-4 text-gray-500" /></span>}
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Liga do mês ──────────────────────────────────────────────── */}
        <aside className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className={`${pixel.className} text-[11px] text-brand-400`}>LIGA DO MÊS</h2>
            <span className="text-xs text-gray-400">{liga?.mesLabel}</span>
          </div>
          {!liga ? (
            <Loader2 className="w-5 h-5 text-brand-400 animate-spin mx-auto" />
          ) : liga.ranking.length === 0 ? (
            <p className="text-sm text-gray-400">Ninguém pontuou ainda neste mês. Encerre um torneio ou lance uma etapa de fora.</p>
          ) : (
            <ol className="space-y-1.5">
              {liga.ranking.slice(0, 10).map((l, i) => (
                <li key={l.userId} className="flex items-center gap-3 text-sm">
                  <span className={clsx('w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0',
                    i === 0 ? 'bg-yellow-400 text-yellow-950' : i === 1 ? 'bg-gray-300 text-gray-900' : i === 2 ? 'bg-amber-600 text-white' : 'text-gray-400')}>
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-white truncate">{l.playerName}</span>
                  <span className="text-xs text-gray-500 shrink-0">{l.eventsPlayed} etapa{l.eventsPlayed === 1 ? '' : 's'}</span>
                  <span className="font-bold text-white w-8 text-right">{l.totalPoints}</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/admin/liguinha/liga" className="text-sm text-brand-400 inline-flex items-center gap-1">
            <BarChart3 className="w-4 h-4" /> Ranking completo, campeões e decks
          </Link>
          <Link href="/admin/liga-mensal" className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-300">
            <Award className="w-3.5 h-3.5" /> Lançamentos manuais
          </Link>
        </aside>
      </div>

      {criando && <CriarTorneio onFechar={() => setCriando(false)} sugestoes={{
        Liga: precosRecentes(ordenada.filter(c => modalidadeDe(c) === 'Liga')),
        Campeonato: precosRecentes(ordenada.filter(c => modalidadeDe(c) === 'Campeonato')),
      }} />}
      {lancando && <LancarEtapa onFechar={() => setLancando(false)} onLancada={carregar} />}
    </div>
  )
}
