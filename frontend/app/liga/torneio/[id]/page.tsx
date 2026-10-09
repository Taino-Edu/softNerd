'use client'

// =============================================================================
// /liga/torneio/[id] — Telão do torneio (público, sem login)
// Timer da rodada, mesas e classificação ao vivo (/hubs/torneio). docs/liguinha.md
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Swords, Trophy, CheckCircle2 } from 'lucide-react'
import { torneioApi, TorneioPublicoDto } from '@/lib/api'
import { useTorneioAoVivo } from '@/lib/useTorneioAoVivo'
import Relogio from '@/components/liga/Relogio'
import TabelaTorneio from '@/components/liga/TabelaTorneio'

export default function TelaoTorneioPage() {
  const { id } = useParams<{ id: string }>()
  const [t, setT] = useState<TorneioPublicoDto | null>(null)
  const [erro, setErro] = useState(false)

  const recarregar = useCallback(() => {
    torneioApi.publico(id).then(r => { setT(r.data); setErro(false) }).catch(() => setErro(true))
  }, [id])

  useEffect(() => { recarregar() }, [recarregar])
  useTorneioAoVivo(id, recarregar)

  if (!t) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        {erro ? <p className="text-gray-400">Torneio não encontrado.</p> : <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />}
      </div>
    )
  }

  const encerrado = t.status === 'Finalizado'

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <nav className="h-14 flex items-center px-4 gap-3 border-b border-surface-500">
        <Link href="/liga" className="flex items-center gap-1.5 text-sm text-gray-300"><ArrowLeft className="w-4 h-4" /> Liga</Link>
        <Link href={`/liga/jogar?t=${t.id}`} className="ml-auto btn-secondary text-sm"><Swords className="w-4 h-4" /> Sou jogador</Link>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{t.nome}</h1>
            <p className="text-gray-400">
              {encerrado ? 'Torneio encerrado'
                : t.rodadaAtual > 0 ? `Rodada ${t.rodadaAtual}${t.numeroRodadas ? ` de ${t.numeroRodadas}` : ''}`
                : 'Check-in aberto — aguardando a rodada 1'}
              {` · suíço, melhor de ${t.melhorDe}`}
            </p>
          </div>
        </header>

        {!encerrado && t.rodadaAtual > 0 && <Relogio timer={t.timer} grande />}

        {encerrado && t.classificacao.length > 0 && (
          <section className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
            {t.classificacao.slice(0, 3).map(l => (
              <div key={l.participanteId} className={`bg-surface-800 border border-surface-500 rounded-2xl p-4 text-center ${l.posicao === 1 ? 'md:-translate-y-2' : ''}`}>
                <Trophy className={`w-8 h-8 mx-auto mb-1 ${l.posicao === 1 ? 'text-accent-gold' : 'text-gray-400'}`} />
                <p className="text-2xl font-bold text-white">{l.posicao}º</p>
                <p className="font-semibold text-white truncate">{l.nome}</p>
                <p className="text-xs text-gray-400">{l.pontos} pts</p>
              </div>
            ))}
          </section>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {!encerrado && t.mesas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mesas da rodada {t.rodadaAtual}</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {t.mesas.map(m => (
                  <div key={m.partidaId} className="bg-surface-800 border border-surface-500 rounded-xl p-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center font-bold text-white shrink-0">
                      {m.b ? m.mesa : '—'}
                    </span>
                    <span className="flex-1 min-w-0 text-sm">
                      <span className="block text-white truncate">{m.a.nome}</span>
                      <span className="block text-gray-400 truncate">{m.b ? `× ${m.b.nome}` : 'bye'}</span>
                    </span>
                    {m.resultado && <CheckCircle2 className="w-5 h-5 txt-ok shrink-0" />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {t.classificacao.length > 0 && (
            <div className={encerrado || t.mesas.length === 0 ? 'lg:col-span-2' : ''}>
              <TabelaTorneio linhas={t.classificacao} grande />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
