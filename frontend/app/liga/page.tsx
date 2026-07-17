'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Trophy, Medal, Award, Loader2, Layers, ChevronDown } from 'lucide-react'
import { ligaMensalApi, LigaMensalDto, LigaMensalMesDto } from '@/lib/api'

const MEDAL_COLOR = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-brand-400']

export default function LigaMensalPage() {
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
              className="w-full appearance-none bg-surface-800 border border-surface-600 rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:outline-none focus:border-brand-500 transition-colors"
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
          <div className="bg-surface-800 rounded-xl p-8 border border-surface-600 text-center">
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
                  className={`bg-surface-800 rounded-xl p-4 border flex items-center gap-4 ${isTop4 ? 'border-brand-500/40' : 'border-surface-600'}`}>
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
