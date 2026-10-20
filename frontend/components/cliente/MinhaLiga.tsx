'use client'
// "Minha Liga" na Minha conta → aba Campeonatos (v1.60.0): a posição do jogador na Liga do mês ou da
// temporada, os pontos, títulos, V-E-D, o desempenho com cada deck que ele montou (o "% de vitória com
// o deck" que o Maikon pediu) e as etapas jogadas. Dados: GET /api/liga-mensal/minha.
// Visual claro da conta; cores no style onde o tema claro do site trocaria a classe.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2, Trophy } from 'lucide-react'
import { ligaMensalApi, MinhaLigaDto, PeriodoLiga } from '@/lib/api'
import SpriteDeck from '@/components/liga/SpriteDeck'

const AZUL = '#1E4FD6'
const MEDALHA = ['#F5C518', '#B8C4D6', '#D08A4E']

function dataCurta(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

export default function MinhaLiga() {
  const [periodo, setPeriodo] = useState<PeriodoLiga>('mes')
  const [d, setD] = useState<MinhaLigaDto | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    setD(null); setErro(false)
    ligaMensalApi.minha({ periodo })
      .then(r => { if (vivo) setD(r.data) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [periodo])

  if (erro) return null // métrica é extra: se falhar, a aba fica como era

  const eu = d?.eu
  const ved = eu ? eu.vitorias + eu.empates + eu.derrotas : 0
  // Pontos lançados à mão pela loja (lançamento manual) entram no total mas não são etapa
  const manuais = eu && d ? eu.pontos - d.etapas.reduce((s, e) => s + e.pontos, 0) : 0

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: AZUL }}>Minha Liga</p>
          <p className="text-xs text-gray-500">{d?.rotulo ?? '…'}</p>
        </div>
        <div className="inline-flex rounded-full border border-gray-200 p-0.5 text-xs font-bold" role="tablist" aria-label="Período">
          {([['mes', 'Mês'], ['ano', 'Temporada']] as const).map(([p, rotulo]) => (
            <button key={p} role="tab" aria-selected={periodo === p} onClick={() => setPeriodo(p)}
              className="px-3 py-1 rounded-full"
              style={periodo === p ? { backgroundColor: AZUL, color: '#FFFFFF' } : { color: '#4B5563' }}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {!d ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: AZUL }} /></div>
      ) : !eu ? (
        <div className="text-center py-4 space-y-2">
          <Trophy className="w-8 h-8 mx-auto text-gray-200" />
          <p className="text-sm text-gray-500">Você ainda não pontuou {periodo === 'mes' ? 'neste mês' : 'nesta temporada'}.</p>
          <p className="text-xs text-gray-400">Cada etapa da liguinha vale pontos: 1º 10 · 2º 7 · 3º 5 · 4º 3 · demais 1.</p>
        </div>
      ) : (
        <>
          {/* ── Posição e números ── */}
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black"
              style={eu.posicao <= 3 ? { backgroundColor: MEDALHA[eu.posicao - 1], color: '#0F1B33' } : { backgroundColor: '#EEF3FB', color: AZUL }}>
              <span className="text-xl leading-none">{eu.posicao}º</span>
              <span className="text-[9px] uppercase opacity-70">de {d.totalJogadores}</span>
            </span>
            <div className="grid grid-cols-3 gap-2 flex-1 text-center">
              <div>
                <p className="text-xl font-black text-gray-900">{eu.pontos}</p>
                <p className="text-[10px] font-bold uppercase text-gray-400">pontos</p>
              </div>
              <div>
                <p className="text-xl font-black text-gray-900">{eu.etapas}</p>
                <p className="text-[10px] font-bold uppercase text-gray-400">etapas</p>
              </div>
              <div>
                <p className="text-xl font-black text-gray-900">{eu.titulos}</p>
                <p className="text-[10px] font-bold uppercase text-gray-400">títulos</p>
              </div>
            </div>
          </div>
          {ved > 0 && (
            <p className="text-xs text-gray-500">
              Nas partidas: <strong className="text-gray-800">{eu.vitorias}V {eu.empates}E {eu.derrotas}D</strong>
              {eu.pctVitoria !== null && <> · <strong style={{ color: AZUL }}>{eu.pctVitoria.toFixed(0)}% de vitória</strong></>}
            </p>
          )}

          {/* ── Meus decks ── */}
          {d.meusDecks.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Meus decks</p>
              {d.meusDecks.map(x => (
                <div key={x.deck} className="flex items-center gap-3">
                  <span className="w-10 flex justify-center shrink-0"><SpriteDeck deck={x.deck} tamanho={32} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate">{x.deck}</p>
                      <p className="text-xs font-bold shrink-0" style={{ color: AZUL }}>{x.pctVitoria !== null ? `${x.pctVitoria.toFixed(0)}%` : '—'}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${x.pctVitoria ?? 0}%`, backgroundColor: AZUL }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {x.usos} etapa{x.usos === 1 ? '' : 's'}
                      {x.partidas > 0 ? ` · ${x.vitorias}V ${x.empates}E ${x.derrotas}D` : ''}
                      {x.titulos > 0 ? ` · ${x.titulos} título${x.titulos === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Minhas etapas ── */}
          {(d.etapas.length > 0 || manuais > 0) && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Minhas etapas</p>
              {d.etapas.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="w-11 text-xs font-bold text-gray-400 shrink-0">{dataCurta(e.data)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-gray-800 truncate">{e.nome}</span>
                    <span className="block text-[11px] text-gray-400 truncate">{e.deck ?? 'sem deck'}</span>
                  </span>
                  <span className="text-xs font-black text-gray-700 shrink-0">{e.colocacao}º<span className="font-normal text-gray-400"> de {e.jogadores}</span></span>
                  <span className="text-xs font-black shrink-0 w-10 text-right" style={{ color: AZUL }}>+{e.pontos}</span>
                </div>
              ))}
              {manuais > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-11 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-gray-800 truncate">Pontos lançados pela loja</span>
                    <span className="block text-[11px] text-gray-400 truncate">etapas de fora ou ajustes</span>
                  </span>
                  <span className="text-xs font-black shrink-0 w-10 text-right" style={{ color: AZUL }}>+{manuais}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Link href="/liga" className="flex items-center justify-between text-sm font-bold pt-2 border-t border-gray-100" style={{ color: AZUL }}>
        Ver a Liga completa <ChevronRight className="w-4 h-4" />
      </Link>
    </section>
  )
}
