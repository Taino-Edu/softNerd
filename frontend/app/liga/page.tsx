'use client'
// Página pública da Liga Mensal. Duas telas, escolhidas pela chave "liga-visual-novo":
//   PaginaNova   — pódio, sprite do deck de cada jogador (lib/spritesDeck.ts), decks do mês (v1.46.0)
//   PaginaAntiga — a lista simples de antes, guardada pra volta.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { pixel } from '@/lib/fontePixel'
import { ArrowLeft, Trophy, Medal, Award, Loader2, Layers, ChevronDown, Swords, Gift } from 'lucide-react'
import { ligaMensalApi, siteConfigApi, LigaMensalDto, LigaMensalMesDto, LigaEstatisticasDto } from '@/lib/api'
import { mixHex } from '@/lib/colors'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import SpriteDeck from '@/components/liga/SpriteDeck'

const MEDAL_COLOR = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-brand-400']

export default function LigaMensalPage() {
  // Enquanto a chave carrega já vai a nova (é o padrão); só "desligada" volta a antiga
  const nova = useFuncionalidade('liga-visual-novo') !== false
  return nova ? <PaginaNova /> : <PaginaAntiga />
}

function PaginaAntiga() {
  const [data, setData]   = useState<LigaMensalDto | null>(null)
  const [meses, setMeses] = useState<LigaMensalMesDto[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState<string>('') // "ano-mes"

  useEffect(() => {
    ligaMensalApi.meses().then(r => setMeses(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const [ano, mes] = selecionado ? selecionado.split('-').map(Number) : [undefined, undefined]
    ligaMensalApi.ranking(ano, mes)
      .then(r => {
        setData(r.data)
        if (!selecionado) setSelecionado(`${r.data.ano}-${r.data.mes}`)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado])

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <nav className="fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 gap-3 bg-surface-900/90 backdrop-blur-md border-b border-surface-700">
        <Link href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-gray-300 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <Link href="/liga/jogar" className="ml-auto btn-primary text-sm py-1.5">
          <Swords className="w-4 h-4" /> Sou jogador
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-4 pt-20 pb-16">
        <div className="flex items-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-brand-400" />
          <h1 className="text-2xl font-black">Liga Mensal</h1>
        </div>
        <p className="text-sm text-gray-400 mb-5">
          Pontuação acumulada dos campeonatos semanais. Top 4 do mês ganha brinde.
        </p>

        {meses.length > 0 && (
          <div className="relative mb-5 w-full sm:w-64">
            <select
              value={selecionado}
              onChange={e => setSelecionado(e.target.value)}
              className="w-full appearance-none bg-surface-800 border border-surface-500 rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:outline-none focus:border-brand-500 transition-colors"
            >
              {!meses.some(m => `${m.ano}-${m.mes}` === selecionado) && data && (
                <option value={`${data.ano}-${data.mes}`}>{data.mesLabel}</option>
              )}
              {meses.map(m => (
                <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>{m.mesLabel}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 text-brand-400 animate-spin" />
          </div>
        )}

        {!loading && data && data.ranking.length === 0 && (
          <div className="bg-surface-800 rounded-xl p-8 border border-surface-500 text-center">
            <Trophy className="w-10 h-10 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 text-sm">Nenhuma pontuação registrada em {data.mesLabel.toLowerCase()} ainda.</p>
          </div>
        )}

        {!loading && data && data.ranking.length > 0 && (
          <div className="space-y-2.5">
            {data.ranking.map((r, i) => {
              const isTop4 = i < 4
              const MedalIcon = i < 3 ? Medal : (isTop4 ? Award : null)
              return (
                <div key={r.userId}
                  className={`bg-surface-800 rounded-xl p-4 border flex items-center gap-4 ${isTop4 ? 'border-brand-500/40' : 'border-surface-500'}`}>
                  <div className="w-8 flex-shrink-0 flex items-center justify-center">
                    {MedalIcon
                      ? <MedalIcon className={`w-6 h-6 ${MEDAL_COLOR[i]}`} />
                      : <span className="text-sm font-bold text-gray-500">{i + 1}º</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white truncate">{r.playerName}</p>
                      {isTop4 && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 flex-shrink-0">
                          Brinde
                        </span>
                      )}
                    </div>
                    {r.decks.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 truncate">
                        <Layers className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{r.decks.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-black text-brand-400 leading-none">{r.totalPoints}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{r.eventsPlayed} evento{r.eventsPlayed !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página nova (v1.46.0) — pedido do Maikon: "o tapa no visual" da liga
// ─────────────────────────────────────────────────────────────────────────────

/** Ouro, prata, bronze e o 4º (que também ganha brinde). */
/** "cor" pinta medalha e borda; "texto" é o tom que dá leitura nos dois temas (prata clara some no branco). */
const PODIO = [
  { cor: '#F5C518', texto: '#D29E00', fundo: 'rgba(245,197,24,0.16)', rotulo: '1º' },
  { cor: '#B8C4D6', texto: '#7D8BA1', fundo: 'rgba(125,139,161,0.16)', rotulo: '2º' },
  { cor: '#D08A4E', texto: '#C0702F', fundo: 'rgba(208,138,78,0.16)', rotulo: '3º' },
  { cor: '#3EC2F2', texto: '#1A9CD0', fundo: 'rgba(62,194,242,0.14)', rotulo: '4º' },
]

/** "3 eventos"; lançamento manual não tem evento contado, então não mostra nada. */
function eventos(n: number) {
  return n > 0 ? `${n} evento${n !== 1 ? 's' : ''}` : ''
}

function PaginaNova() {
  const [data, setData]   = useState<LigaMensalDto | null>(null)
  // Métricas do mês (v1.60.0): títulos, V-E-D, campeões das etapas e decks com % de vitória
  const [stats, setStats] = useState<LigaEstatisticasDto | null>(null)
  const [meses, setMeses] = useState<LigaMensalMesDto[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState<string>('') // "ano-mes"
  const [cor, setCor] = useState('#1E4FD6')

  useEffect(() => {
    ligaMensalApi.meses().then(r => setMeses(r.data)).catch(() => {})
    siteConfigApi.get().then(r => r.data.colorHero && setCor(r.data.colorHero)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const [ano, mes] = selecionado ? selecionado.split('-').map(Number) : [undefined, undefined]
    ligaMensalApi.ranking(ano, mes)
      .then(r => {
        setData(r.data)
        if (!selecionado) setSelecionado(`${r.data.ano}-${r.data.mes}`)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    // Métricas são extra: se falharem, a página fica como era
    setStats(null)
    ligaMensalApi.estatisticas({ periodo: 'mes', ano, mes })
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado])

  const ranking = data?.ranking ?? []
  const top3 = ranking.slice(0, 3)
  const statsDe = useMemo(() => new Map((stats?.ranking ?? []).map(l => [l.userId, l])), [stats])

  // Decks do mês: quantos jogadores usaram cada deck (o nome como foi digitado, sem repetir por maiúscula)
  const decksDoMes = useMemo(() => {
    const cont = new Map<string, { nome: string; jogadores: number }>()
    for (const r of ranking)
      for (const d of r.decks) {
        const chave = d.trim().toLowerCase()
        const atual = cont.get(chave)
        if (atual) atual.jogadores++
        else cont.set(chave, { nome: d.trim(), jogadores: 1 })
      }
    return [...cont.values()].sort((a, b) => b.jogadores - a.jogadores || a.nome.localeCompare(b.nome)).slice(0, 8)
  }, [ranking])

  // Botões dos meses: o selecionado sempre aparece, mesmo sem dado ainda (mês atual vazio)
  const botoesMes = useMemo(() => {
    const lista = [...meses]
    if (data && !lista.some(m => m.ano === data.ano && m.mes === data.mes))
      lista.unshift({ ano: data.ano, mes: data.mes, mesLabel: data.mesLabel })
    return lista
  }, [meses, data])

  const faixa = `linear-gradient(135deg, ${mixHex(cor, '#FFFFFF', 0.10)} 0%, ${cor} 50%, ${mixHex(cor, '#000000', 0.40)} 100%)`

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      {/* Cor do texto da faixa no style: o tema claro força .text-white pra escuro */}
      <header className="relative overflow-hidden" style={{ background: faixa, color: '#FFFFFF' }}>
        {/* Grade de pixels + estrelas: só decoração */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.10]" aria-hidden
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {[[6, 22], [12, 72], [22, 12], [78, 14], [88, 66], [94, 30], [4, 48]].map(([x, y], i) => (
            <span key={i} className="absolute w-1.5 h-1.5 animate-pulse"
              style={{ left: `${x}%`, top: `${y}%`, backgroundColor: i % 2 ? '#FFE45E' : '#FFFFFF', animationDelay: `${i * 0.4}s` }} />
          ))}
        </div>

        <nav className="relative max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <Link href="/liga/jogar"
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-black px-4 py-2 rounded-xl transition active:scale-95"
            style={{ backgroundColor: '#FFE45E', color: '#0F1B33' }}>
            <Swords className="w-4 h-4" /> Sou jogador
          </Link>
        </nav>

        <div className="relative max-w-5xl mx-auto px-4 pt-6 pb-10 md:pt-10 md:pb-14 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] border"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)' }}>
            <Trophy className="w-3.5 h-3.5" style={{ color: '#FFE45E' }} /> Temporada {data?.mesLabel ?? ''}
          </span>
          <h1 className={`${pixel.className} mt-5 text-2xl sm:text-4xl md:text-5xl leading-tight`}
            style={{ color: '#FFE45E', textShadow: '3px 3px 0 rgba(0,0,0,0.35)' }}>
            LIGA MENSAL
          </h1>
          <p className="mt-4 text-sm md:text-base max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.88)' }}>
            Pontuação dos campeonatos da semana. <strong style={{ color: '#FFFFFF' }}>Top 4 do mês ganha brinde.</strong>
          </p>
          <p className={`${pixel.className} mt-4 text-[9px] sm:text-[10px] leading-relaxed`} style={{ color: 'rgba(255,255,255,0.75)' }}>
            1º 10 PTS · 2º 7 · 3º 5 · 4º 3 · DEMAIS 1
          </p>
          {stats && stats.resumo.etapas > 0 && (
            <div className="mt-5 inline-flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <span><strong style={{ color: '#FFE45E' }}>{stats.resumo.etapas}</strong> etapa{stats.resumo.etapas === 1 ? '' : 's'}</span>
              <span><strong style={{ color: '#FFE45E' }}>{stats.resumo.jogadoresUnicos}</strong> jogadores</span>
              <span><strong style={{ color: '#FFE45E' }}>{stats.resumo.mediaPorEtapa.toLocaleString('pt-BR')}</strong> por etapa</span>
            </div>
          )}

          {botoesMes.length > 1 && (
            <div className="mt-6 flex gap-2 overflow-x-auto justify-start sm:justify-center pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {botoesMes.map(m => {
                const chave = `${m.ano}-${m.mes}`
                const ativo = chave === selecionado
                return (
                  <button key={chave} onClick={() => setSelecionado(chave)}
                    className="shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl border transition"
                    style={ativo
                      ? { backgroundColor: '#FFFFFF', color: mixHex(cor, '#000000', 0.35), borderColor: '#FFFFFF' }
                      : { backgroundColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.25)' }}>
                    {m.mesLabel}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        )}

        {!loading && data && ranking.length === 0 && (
          <div className="mt-8 bg-surface-800 rounded-2xl p-10 border border-surface-500 text-center">
            <p className={`${pixel.className} text-xs text-brand-400 mb-4`}>NOVA TEMPORADA</p>
            <p className="text-gray-300">Ninguém pontuou em {data.mesLabel.toLowerCase()} ainda.</p>
            <p className="text-sm text-gray-500 mt-1">O primeiro campeonato do mês abre o ranking — bora garantir o seu lugar no pódio?</p>
            <Link href="/#eventos" className="btn-primary inline-flex mt-5">
              <Trophy className="w-4 h-4" /> Ver campeonatos
            </Link>
          </div>
        )}

        {!loading && ranking.length > 0 && (
          <>
            {/* ── Pódio ── */}
            <section className="-mt-6 relative">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
                {[1, 0, 2].map(pos => {
                  const r = top3[pos]
                  if (!r) return <div key={pos} />
                  const p = PODIO[pos]
                  const altura = pos === 0 ? 'pt-6 pb-5 sm:pt-8 sm:pb-7' : 'pt-4 pb-4 sm:pt-6 sm:pb-5'
                  return (
                    <div key={r.userId}
                      className={`bg-surface-800 rounded-2xl border text-center px-2 sm:px-4 ${altura} ${pos === 0 ? 'shadow-xl' : ''}`}
                      style={{ borderColor: p.cor, boxShadow: pos === 0 ? `0 16px 40px -18px ${p.cor}` : undefined }}>
                      <span className={`${pixel.className} inline-flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-xl text-[10px] sm:text-xs`}
                        style={{ backgroundColor: p.cor, color: '#0F1B33' }}>
                        {p.rotulo}
                      </span>
                      <div className="flex justify-center mt-2 sm:mt-3 h-14 sm:h-24 items-end">
                        <SpriteDeck deck={r.decks[0]} tamanho={pos === 0 ? 96 : 72} className="scale-75 sm:scale-100 origin-bottom" />
                      </div>
                      <p className="font-black text-white text-sm sm:text-lg leading-tight truncate mt-1" title={r.playerName}>{r.playerName}</p>
                      <p className="text-[11px] sm:text-xs text-gray-500 truncate">{r.decks[0] ?? 'Deck não informado'}</p>
                      <p className={`${pixel.className} mt-2 sm:mt-3 text-sm sm:text-xl`} style={{ color: p.texto }}>
                        {r.totalPoints}<span className="text-[8px] sm:text-[10px] ml-1">PTS</span>
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1 min-h-[1em]">{eventos(r.eventsPlayed)}</p>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
              {/* ── Classificação completa ── */}
              <section>
                <h2 className={`${pixel.className} text-[11px] text-brand-400 mb-3`}>CLASSIFICAÇÃO</h2>
                <div className="space-y-2">
                  {ranking.map((r, i) => {
                    const p = PODIO[i]
                    return (
                      <div key={r.userId}
                        className="bg-surface-800 rounded-xl px-3 sm:px-4 py-3 border flex items-center gap-3"
                        style={{ borderColor: p ? p.cor + '66' : undefined }}>
                        <span className={`${pixel.className} w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[10px]`}
                          style={p ? { backgroundColor: p.fundo, color: p.texto } : undefined}>
                          {i + 1}
                        </span>
                        {/* Largura fixa: deck com dois sprites não empurra o nome */}
                        <span className="w-14 shrink-0 flex justify-center"><SpriteDeck deck={r.decks[0]} tamanho={40} /></span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white truncate">{r.playerName}</p>
                            {i < 4 && (
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0"
                                style={{ backgroundColor: PODIO[i].fundo, color: PODIO[i].texto }}>
                                <Gift className="w-3 h-3" /> Brinde
                              </span>
                            )}
                          </div>
                          {r.decks.length > 0 && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {r.decks.join(' · ')}
                            </p>
                          )}
                          {(() => {
                            const s = statsDe.get(r.userId)
                            if (!s) return null
                            const ved = s.vitorias + s.empates + s.derrotas
                            if (!s.titulos && !ved) return null
                            return (
                              <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                                {s.titulos > 0 && <span className="inline-flex items-center gap-1"><Trophy className="w-3 h-3 text-accent-gold" /> {s.titulos} título{s.titulos === 1 ? '' : 's'}</span>}
                                {ved > 0 && <span title="Vitórias-Empates-Derrotas nas partidas">{s.vitorias}-{s.empates}-{s.derrotas}{s.pctVitoria !== null ? ` · ${s.pctVitoria.toFixed(0)}% vit.` : ''}</span>}
                              </p>
                            )
                          })()}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`${pixel.className} text-sm text-brand-400`}>{r.totalPoints}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{eventos(r.eventsPlayed)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="space-y-6 lg:sticky lg:top-4">
              {/* ── Campeões das etapas ── */}
              {stats && stats.etapas.length > 0 && (
                <aside className="bg-surface-800 rounded-2xl border border-surface-500 p-4">
                  <h2 className={`${pixel.className} text-[11px] text-brand-400 mb-3`}>CAMPEÕES DAS ETAPAS</h2>
                  <ul className="space-y-2.5">
                    {stats.etapas.map(e => (
                      <li key={e.id} className="flex items-center gap-2.5">
                        <span className="w-10 text-center shrink-0">
                          <span className={`${pixel.className} block text-[10px] text-white`}>{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' }).format(new Date(e.data))}</span>
                          <span className="block text-[9px] uppercase text-gray-500">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).format(new Date(e.data)).replace('.', '')}</span>
                        </span>
                        <span className="w-10 shrink-0 flex justify-center"><SpriteDeck deck={e.deckCampeao} tamanho={32} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white truncate">{e.campeao ?? '—'}</span>
                          <span className="block text-[11px] text-gray-500 truncate">{e.deckCampeao ?? 'sem deck'} · {e.jogadores} jogadores</span>
                        </span>
                        <Trophy className="w-4 h-4 text-accent-gold shrink-0" />
                      </li>
                    ))}
                  </ul>
                </aside>
              )}

              {/* ── Decks do mês ── */}
              {stats && stats.decks.length > 0 ? (
                <aside className="bg-surface-800 rounded-2xl border border-surface-500 p-4">
                  <h2 className={`${pixel.className} text-[11px] text-brand-400 mb-1`}>DECKS DO MÊS</h2>
                  <p className="text-xs text-gray-500 mb-3">Mais usados, títulos e % de vitória nas partidas</p>
                  <div className="space-y-2.5">
                    {stats.decks.slice(0, 8).map((d, i) => {
                      const max = stats.decks[0].usos
                      return (
                        <div key={d.deck} className="flex items-center gap-2.5">
                          <span className="w-12 shrink-0 flex justify-center"><SpriteDeck deck={d.deck} tamanho={36} /></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-white truncate">{d.deck}</p>
                              <p className="text-xs text-gray-400 shrink-0">{d.usos}×</p>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-600 mt-1 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(d.usos / max) * 100}%`, backgroundColor: i === 0 ? '#F5C518' : '#3EC2F2' }} />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {d.titulos > 0 ? `${d.titulos} título${d.titulos === 1 ? '' : 's'}` : 'sem título'}
                              {d.pctVitoria !== null ? ` · ${d.pctVitoria.toFixed(0)}% de vitória` : ''}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </aside>
              ) : decksDoMes.length > 0 && (
                <aside className="bg-surface-800 rounded-2xl border border-surface-500 p-4">
                  <h2 className={`${pixel.className} text-[11px] text-brand-400 mb-1`}>DECKS DO MÊS</h2>
                  <p className="text-xs text-gray-500 mb-3">Quantos jogadores da liga usaram cada deck</p>
                  <div className="space-y-2">
                    {decksDoMes.map((d, i) => {
                      const max = decksDoMes[0].jogadores
                      return (
                        <div key={d.nome} className="flex items-center gap-2.5">
                          <span className="w-12 shrink-0 flex justify-center"><SpriteDeck deck={d.nome} tamanho={36} /></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-white truncate">{d.nome}</p>
                              <p className="text-xs text-gray-400 shrink-0">{d.jogadores}</p>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-600 mt-1 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(d.jogadores / max) * 100}%`, backgroundColor: i === 0 ? '#F5C518' : '#3EC2F2' }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </aside>
              )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
