'use client'
// Aba "Rodadas" da Central da Liguinha: todas as rodadas já soltas, com mesa, jogadores, deck e
// resultado — pra conferir depois quem jogou contra quem (no Challonge é a chave).
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { torneioApi, MesaDto, JogadorMesa } from '@/lib/api'
import AvatarJogador from '@/components/liga/AvatarJogador'

function Lado({ j, venceu, perdeu }: { j: JogadorMesa; venceu: boolean; perdeu: boolean }) {
  return (
    <span className={clsx('flex items-center gap-2 min-w-0 flex-1', perdeu && 'opacity-50')}>
      <span className="w-8 flex justify-center shrink-0"><AvatarJogador pokemon={j.pokemon} shiny={j.shiny} deck={j.deck} tamanho={28} /></span>
      <span className="min-w-0">
        <span className={clsx('block text-sm truncate', venceu ? 'font-bold text-white' : 'text-gray-200')}>{j.nome}</span>
        {j.deck && <span className="block text-[11px] text-gray-500 truncate">{j.deck}</span>}
      </span>
    </span>
  )
}

export default function HistoricoRodadas({ id, rodadaAtual }: { id: string; rodadaAtual: number }) {
  const [rodadas, setRodadas] = useState<MesaDto[][] | null>(null)

  useEffect(() => {
    if (rodadaAtual === 0) { setRodadas([]); return }
    Promise.all(Array.from({ length: rodadaAtual }, (_, i) => torneioApi.rodada(id, i + 1).then(r => r.data)))
      .then(setRodadas)
      .catch(() => setRodadas([]))
  }, [id, rodadaAtual])

  if (!rodadas) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-400 animate-spin" /></div>
  if (rodadas.length === 0) return <p className="card text-sm text-gray-400">Nenhuma rodada solta ainda.</p>

  return (
    <div className="space-y-4">
      {rodadas.map((mesas, i) => {
        const n = i + 1
        const abertas = mesas.filter(m => m.b && !m.resultado).length
        return (
          <section key={n} className="card">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              Rodada {n}
              <span className="text-xs font-normal text-gray-400">
                {abertas > 0 ? `${abertas} mesa${abertas === 1 ? '' : 's'} em jogo` : 'encerrada'}
              </span>
            </h3>
            <div className="grid gap-2 md:grid-cols-2">
              {mesas.map(m => {
                const vA = m.resultado === 'VitoriaA' || !m.b, vB = m.resultado === 'VitoriaB'
                return (
                  <div key={m.partidaId} className="rounded-xl bg-surface-700 px-3 py-2 flex items-center gap-3">
                    <span className="w-8 text-center text-xs font-bold text-gray-400 shrink-0">{m.b ? m.mesa : 'BYE'}</span>
                    <Lado j={m.a} venceu={vA} perdeu={vB} />
                    {m.b ? (
                      <>
                        <span className="text-[11px] font-bold text-gray-500 shrink-0">
                          {m.resultado === 'Empate' ? 'EMP' : m.resultado ? 'x' : 'vs'}
                        </span>
                        <Lado j={m.b} venceu={vB} perdeu={m.resultado === 'VitoriaA'} />
                      </>
                    ) : <span className="text-xs text-gray-400 flex-1">vitória automática</span>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
