'use client'
// =============================================================================
// ConferenciaDecksModal.tsx — Conferência dos decks de um campeonato.
//
// O que o juiz precisa antes de começar a rodada: quem registrou deck, quem não
// registrou, e quais decks estão fora das regras. A lista carrega os decks de
// todos os participantes de uma vez pra poder avisar de irregularidade sem
// obrigar a abrir um por um — e imprime tudo pra conferir na mesa.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertTriangle, CheckCircle, Printer, FileWarning, ClipboardCheck } from 'lucide-react'
import { deckApi, ChampionshipParticipant } from '@/lib/api'
import { analisarDeck, DeckAnalise, resumoDaAnalise } from '@/lib/deckRules'
import { printDecks, DeckParaImpressao } from '@/lib/printDeck'
import DeckViewerModal from './DeckViewerModal'

type Linha = {
  participante: ChampionshipParticipant
  analise: DeckAnalise | null   // null = sem deck registrado ou falha ao carregar
  falhou: boolean
}

export default function ConferenciaDecksModal({ championshipName, participants, onClose }: {
  championshipName: string
  participants: ChampionshipParticipant[]
  onClose: () => void
}) {
  const [linhas,  setLinhas]  = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)
  const [aberto,  setAberto]  = useState<ChampionshipParticipant | null>(null)
  const fecharRef = useRef<HTMLButtonElement>(null)

  const carregar = useCallback(async () => {
    const resultado = await Promise.all(participants.map(async p => {
      if (!p.deckId) return { participante: p, analise: null, falhou: false }
      try {
        const { data } = await deckApi.get(p.deckId)
        return { participante: p, analise: analisarDeck(data.cardsJson, data.game), falhou: false }
      } catch {
        return { participante: p, analise: null, falhou: true }
      }
    }))
    setLinhas(resultado)
    setLoading(false)
  }, [participants])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    fecharRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !aberto) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, aberto])

  const comDeck    = linhas.filter(l => l.analise !== null)
  const semDeck    = linhas.filter(l => l.analise === null && !l.falhou)
  const irregulares = comDeck.filter(l => !l.analise!.regular)

  function imprimirTudo() {
    const paraImprimir: DeckParaImpressao[] = comDeck.map(l => ({
      jogador:       l.participante.userName || 'Sem nome',
      numeroJogador: l.participante.playerNumber,
      deckNome:      l.participante.deckName ?? 'Deck',
      jogo:          '',
      analise:       l.analise!,
    }))
    printDecks(paraImprimir, `Conferência de decks — ${championshipName}`)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conferencia-decks-titulo"
      >
        <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">

          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-500 shrink-0">
            <div className="min-w-0">
              <h2 id="conferencia-decks-titulo" className="font-bold text-white text-base flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-brand-400" aria-hidden="true" />
                Conferência de decks
              </h2>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{championshipName}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {comDeck.length > 0 && (
                <button
                  onClick={imprimirTudo}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg
                             text-gray-300 hover:text-white hover:bg-surface-700 border border-surface-500 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-brand-500"
                  aria-label="Imprimir folha de conferência de todos os decks"
                >
                  <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Imprimir
                </button>
              )}
              <button
                ref={fecharRef}
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Fechar conferência de decks"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-14">
              <Loader2 className="w-7 h-7 animate-spin text-brand-400" aria-label="Carregando decks" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-surface-500 shrink-0">
                <Resumo valor={comDeck.length}     rotulo="Com deck"    cor="text-brand-300" />
                <Resumo valor={irregulares.length} rotulo="Com alerta"  cor="txt-alerta" />
                <Resumo valor={semDeck.length}     rotulo="Sem deck"    cor="text-gray-300" />
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {linhas.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">
                    Nenhum participante inscrito ainda.
                  </p>
                ) : (
                  <ul className="space-y-2" aria-label="Participantes e seus decks">
                    {linhas.map(l => (
                      <LinhaParticipante
                        key={l.participante.id}
                        linha={l}
                        onAbrir={() => setAberto(l.participante)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {aberto?.deckId && (
        <DeckViewerModal
          deckId={aberto.deckId}
          jogador={aberto.userName || 'Sem nome'}
          numeroJogador={aberto.playerNumber}
          onClose={() => setAberto(null)}
        />
      )}
    </>
  )
}

function Resumo({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-black ${cor}`}>{valor}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{rotulo}</p>
    </div>
  )
}

function LinhaParticipante({ linha, onAbrir }: { linha: Linha; onAbrir: () => void }) {
  const { participante: p, analise, falhou } = linha
  const temDeck = !!analise

  const conteudo = (
    <>
      <span className="text-xs font-mono text-gray-400 w-6 text-right shrink-0">#{p.playerNumber}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{p.userName || 'Sem nome'}</p>
        <p className="text-xs text-gray-400 truncate">
          {falhou
            ? 'Não foi possível carregar o deck'
            : analise
              ? <>{p.deckName ?? 'Deck'} · {resumoDaAnalise(analise)}</>
              : 'Não registrou deck no sistema'}
        </p>
      </div>
      {temDeck ? (
        analise!.regular ? (
          <CheckCircle className="w-4 h-4 txt-ok shrink-0" aria-label="Deck regular" />
        ) : (
          <AlertTriangle className="w-4 h-4 txt-alerta shrink-0" aria-label="Deck com irregularidade" />
        )
      ) : (
        <FileWarning className="w-4 h-4 text-gray-500 shrink-0" aria-label="Sem deck registrado" />
      )}
    </>
  )

  // Sem deck não abre nada: vira uma linha informativa, não um botão morto.
  return (
    <li>
      {temDeck ? (
        <button
          onClick={onAbrir}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors
                     bg-surface-700 border-surface-500 hover:border-brand-500/60 hover:bg-surface-600
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label={`Ver deck de ${p.userName || 'participante'}, carta por carta`}
        >
          {conteudo}
        </button>
      ) : (
        <div className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border border-surface-500 bg-surface-800">
          {conteudo}
        </div>
      )}
    </li>
  )
}
