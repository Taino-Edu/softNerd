'use client'

// =============================================================================
// /admin/liguinha/liga — Liga e métricas (Central da Liguinha, v1.58.0)
//
// Pedido do Maikon: posição, pontuação, V/E/D, decks mais usados, % de vitória por deck,
// campeões da semana/mês/temporada — o que ele precisa pra conferir a Liga e decidir prêmios.
// Dados: GET /api/liga-mensal/estatisticas (Services/Liga/LigaEstatisticasService.cs), na hora.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Copy, Crown, Layers, Loader2, Sparkles, Swords, Trophy, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ligaMensalApi, LigaEstatisticasDto, PeriodoLiga } from '@/lib/api'
import { hojeBrasil, somarDias } from '@/lib/format'
import { pixel } from '@/lib/fontePixel'
import SpriteDeck from '@/components/liga/SpriteDeck'
import { dataBR } from '@/components/liga/admin/nomes'

const PERIODOS: { p: PeriodoLiga; rotulo: string }[] = [
  { p: 'semana', rotulo: 'Semana' }, { p: 'mes', rotulo: 'Mês' }, { p: 'ano', rotulo: 'Temporada' },
]

/** Medalha do pódio (mesmas cores da Liga pública). */
const PODIO = ['bg-yellow-400 text-yellow-950', 'bg-gray-300 text-gray-900', 'bg-amber-600 text-white']

function Numero({ icone, rotulo, valor, detalhe }: { icone: React.ReactNode; rotulo: string; valor: React.ReactNode; detalhe?: string }) {
  return (
    <div className="card !p-4">
      <p className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">{icone}{rotulo}</p>
      <p className="text-2xl font-bold text-white mt-1">{valor}</p>
      {detalhe && <p className="text-xs text-gray-500">{detalhe}</p>}
    </div>
  )
}

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-500">—</span>
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="hidden sm:block w-14 h-1.5 rounded-full bg-surface-600 overflow-hidden">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${v}%` }} />
      </span>
      <span className="tabular-nums">{v.toFixed(0)}%</span>
    </span>
  )
}

/** Texto pronto pro grupo do WhatsApp: top 10 e campeões das etapas. */
function textoWhatsApp(d: LigaEstatisticasDto) {
  const medalha = ['🥇', '🥈', '🥉']
  const linhas = [`🏆 *Liga — ${d.rotulo}*`, '']
  d.ranking.slice(0, 10).forEach(l => linhas.push(`${medalha[l.posicao - 1] ?? `${l.posicao}º`} ${l.nome} — *${l.pontos} pts* (${l.etapas} etapa${l.etapas === 1 ? '' : 's'})`))
  if (d.etapas.length > 0) {
    linhas.push('', '⚔️ *Campeões das etapas*')
    d.etapas.forEach(e => linhas.push(`${dataBR(e.data, { day: '2-digit', month: '2-digit' })} — ${e.campeao ?? '—'}${e.deckCampeao ? ` (${e.deckCampeao})` : ''}`))
  }
  return linhas.join('\n')
}

export default function LigaMetricasPage() {
  const hoje = hojeBrasil()
  const [periodo, setPeriodo] = useState<PeriodoLiga>('mes')
  // âncora do período: um dia dentro dele (yyyy-mm-dd, calendário de Brasília)
  const [dia, setDia] = useState(hoje)
  const [d, setD] = useState<LigaEstatisticasDto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    setCarregando(true); setErro('')
    const ano = Number(dia.slice(0, 4)), mes = Number(dia.slice(5, 7))
    ligaMensalApi.estatisticas({ periodo, ano, mes, dia })
      .then(r => setD(r.data))
      .catch(e => setErro((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não deu pra carregar a Liga.'))
      .finally(() => setCarregando(false))
  }, [periodo, dia])
  useEffect(() => { carregar() }, [carregar])

  function andar(passo: -1 | 1) {
    if (periodo === 'semana') setDia(somarDias(dia, 7 * passo))
    else if (periodo === 'mes') {
      const a = Number(dia.slice(0, 4)), m = Number(dia.slice(5, 7)) - 1 + passo
      const alvo = new Date(Date.UTC(a, m, 1))
      setDia(`${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-01`)
    } else setDia(`${Number(dia.slice(0, 4)) + passo}-01-01`)
  }
  const noAtual = d ? hoje >= d.inicio.slice(0, 10) && hoje <= d.fim.slice(0, 10) : true

  async function copiar() {
    if (!d) return
    try { await navigator.clipboard.writeText(textoWhatsApp(d)); toast.success('Ranking copiado — é só colar no grupo.') }
    catch { toast.error('Não deu pra copiar.') }
  }

  const lider = d?.ranking[0]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="space-y-3">
        <Link href="/admin/liguinha" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Central da Liguinha
        </Link>
        <PageHeader title="Liga e métricas" subtitle="Ranking, campeões, decks e presença — pra conferir a Liga e decidir os prêmios"
          actions={<button onClick={copiar} disabled={!d || d.ranking.length === 0} className="btn-secondary"><Copy className="w-4 h-4" /> Copiar pro WhatsApp</button>} />
      </div>

      {/* ── Período ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-surface-500 p-1 gap-1" role="tablist" aria-label="Período">
          {PERIODOS.map(({ p, rotulo }) => (
            <button key={p} role="tab" aria-selected={periodo === p} onClick={() => setPeriodo(p)}
              className={clsx('text-sm px-3 py-1 rounded-lg font-semibold', periodo === p ? 'bg-brand-500' : 'text-gray-400 hover:text-white')}
              style={periodo === p ? { color: '#FFFFFF' } : undefined}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => andar(-1)} className="btn-secondary !px-2" aria-label="Período anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className={`${pixel.className} text-[11px] text-white px-2 min-w-[12rem] text-center`}>{d?.rotulo.toUpperCase() ?? '…'}</span>
          <button onClick={() => andar(1)} className="btn-secondary !px-2" aria-label="Próximo período"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {!noAtual && <button onClick={() => setDia(hoje)} className="text-sm text-brand-400 hover:underline">Voltar pro atual</button>}
        {carregando && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
      </div>

      {erro && <p className="txt-erro text-sm">{erro}</p>}

      {d && (
        <>
          {/* ── Resumo ──────────────────────────────────────────────────── */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Numero icone={<Swords className="w-3.5 h-3.5" />} rotulo="Etapas" valor={d.resumo.etapas}
              detalhe={d.resumo.maiorEtapa ? `maior com ${d.resumo.maiorEtapa} jogadores` : undefined} />
            <Numero icone={<Users className="w-3.5 h-3.5" />} rotulo="Jogadores" valor={d.resumo.jogadoresUnicos} detalhe="diferentes no período" />
            <Numero icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Média por etapa" valor={d.resumo.mediaPorEtapa.toLocaleString('pt-BR')} detalhe="jogadores" />
            <Numero icone={<Sparkles className="w-3.5 h-3.5" />} rotulo="Novatos" valor={d.resumo.novatos} detalhe="primeira etapa na Liga" />
            <Numero icone={<Crown className="w-3.5 h-3.5" />} rotulo={periodo === 'semana' ? 'Melhor da semana' : periodo === 'mes' ? 'Líder do mês' : 'Líder da temporada'}
              valor={<span className="text-xl truncate block">{lider?.nome ?? '—'}</span>} detalhe={lider ? `${lider.pontos} pts` : 'sem pontos ainda'} />
          </div>

          {d.ranking.length === 0 ? (
            <div className="card text-center py-10 space-y-2">
              <Trophy className="w-10 h-10 text-gray-500 mx-auto" />
              <p className="text-gray-300">Nenhuma etapa da Liga neste período.</p>
              <p className="text-sm text-gray-500">Encerre um torneio da liguinha ou lance uma etapa de fora na Central.</p>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1fr_360px] items-start">
              {/* ── Ranking ─────────────────────────────────────────────── */}
              <section className="card !p-0 overflow-hidden">
                <h2 className={`${pixel.className} text-[11px] text-brand-400 px-4 pt-4 pb-3`}>RANKING</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-surface-500">
                        <th className="text-left px-4 py-2 w-10">#</th>
                        <th className="text-left py-2">Jogador</th>
                        <th className="py-2 px-2 text-right">Pts</th>
                        <th className="py-2 px-2 text-right" title="Etapas jogadas">Etapas</th>
                        <th className="py-2 px-2 text-right" title="Etapas vencidas">Títulos</th>
                        <th className="py-2 px-2 text-right hidden md:table-cell" title="Vezes entre os 4 primeiros">Top 4</th>
                        <th className="py-2 px-2 text-right hidden md:table-cell" title="Vitórias-Empates-Derrotas nas partidas do suíço">V-E-D</th>
                        <th className="py-2 px-4 text-right hidden sm:table-cell" title="% de vitória nas partidas (sem bye)">% vit.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.ranking.map(l => (
                        <tr key={l.userId} className="border-b border-surface-500 last:border-0">
                          <td className="px-4 py-2">
                            <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold', PODIO[l.posicao - 1] ?? 'text-gray-400')}>{l.posicao}</span>
                          </td>
                          <td className="py-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="w-8 flex justify-center shrink-0"><SpriteDeck deck={l.deckPrincipal} tamanho={28} /></span>
                              <span className="min-w-0">
                                <span className="block text-white font-semibold truncate">{l.nome}</span>
                                <span className="block text-[11px] text-gray-500 truncate">{l.deckPrincipal ?? (l.melhorColocacao === 0 ? 'lançamento manual' : 'sem deck')}</span>
                              </span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-white tabular-nums">{l.pontos}</td>
                          <td className="py-2 px-2 text-right text-gray-300 tabular-nums">{l.etapas}</td>
                          <td className="py-2 px-2 text-right text-gray-300 tabular-nums">{l.titulos || '—'}</td>
                          <td className="py-2 px-2 text-right text-gray-300 tabular-nums hidden md:table-cell">{l.top4 || '—'}</td>
                          <td className="py-2 px-2 text-right text-gray-300 tabular-nums hidden md:table-cell">
                            {l.vitorias + l.empates + l.derrotas > 0 ? `${l.vitorias}-${l.empates}-${l.derrotas}` : '—'}
                          </td>
                          <td className="py-2 px-4 text-right text-gray-300 hidden sm:table-cell"><Pct v={l.pctVitoria} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-500 px-4 py-3 border-t border-surface-500">
                  Pontos por etapa: 1º 10 · 2º 7 · 3º 5 · 4º 3 · demais 1. Empate em pontos: quem jogou mais etapas.
                  V-E-D e % só das etapas jogadas no sistema (a lançada de fora tem só a colocação).
                </p>
              </section>

              <div className="space-y-6">
                {/* ── Campeões das etapas ─────────────────────────────── */}
                <section className="card space-y-3">
                  <h2 className={`${pixel.className} text-[11px] text-brand-400`}>CAMPEÕES DAS ETAPAS</h2>
                  <ul className="space-y-2">
                    {d.etapas.map(e => (
                      <li key={e.id}>
                        <Link href={`/admin/liguinha/${e.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-700/40">
                          <span className="w-12 text-center shrink-0">
                            <span className={`${pixel.className} block text-[11px] text-white`}>{dataBR(e.data, { day: '2-digit' })}</span>
                            <span className="block text-[10px] uppercase text-gray-500">{dataBR(e.data, { month: 'short' }).replace('.', '')}</span>
                          </span>
                          <span className="w-8 flex justify-center shrink-0"><SpriteDeck deck={e.deckCampeao} tamanho={28} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-white font-semibold truncate">{e.campeao ?? '—'}</span>
                            <span className="block text-[11px] text-gray-500 truncate">{e.deckCampeao ?? 'sem deck'} · {e.jogadores} jogadores</span>
                          </span>
                          <Trophy className="w-4 h-4 text-accent-gold shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* ── Decks ───────────────────────────────────────────── */}
                <section className="card space-y-3">
                  <h2 className={`${pixel.className} text-[11px] text-brand-400 flex items-center gap-2`}><Layers className="w-4 h-4" /> DECKS</h2>
                  {d.decks.length === 0 ? (
                    <p className="text-sm text-gray-400">Ninguém informou deck neste período.</p>
                  ) : (
                    <ul className="space-y-2">
                      {d.decks.slice(0, 12).map(x => (
                        <li key={x.deck} className="flex items-center gap-3">
                          <span className="w-8 flex justify-center shrink-0"><SpriteDeck deck={x.deck} tamanho={28} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-white truncate">{x.deck}</span>
                            <span className="block text-[11px] text-gray-500">
                              {x.usos} uso{x.usos === 1 ? '' : 's'} · {x.jogadores} jogador{x.jogadores === 1 ? '' : 'es'}
                              {x.titulos ? ` · ${x.titulos} título${x.titulos === 1 ? '' : 's'}` : ''}
                              {x.partidas ? ` · ${x.vitorias}-${x.empates}-${x.derrotas}` : ''}
                            </span>
                          </span>
                          <span className="text-xs text-gray-300 shrink-0"><Pct v={x.pctVitoria} /></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
