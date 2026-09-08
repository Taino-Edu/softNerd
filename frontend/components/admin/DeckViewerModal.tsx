'use client'
// =============================================================================
// DeckViewerModal.tsx — Deck de um cliente, carta por carta, pro admin conferir.
//
// Serve tanto à conferência de campeonato quanto ao histórico do cliente. É só
// leitura: o admin confere, não edita o deck de ninguém (o backend também
// bloqueia). O veredito das regras aparece antes da lista, porque é o que o
// juiz quer saber em dois segundos — a lista é pra bater carta a carta depois.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertTriangle, CheckCircle, Printer, Layers } from 'lucide-react'
import { deckApi, DeckDto } from '@/lib/api'
import { analisarDeck, DeckAnalise } from '@/lib/deckRules'
import { printDecks } from '@/lib/printDeck'

export default function DeckViewerModal({ deckId, jogador, numeroJogador, onClose }: {
  deckId: string
  /** Nome de quem registrou o deck — vai no cabeçalho e na folha impressa. */
  jogador: string
  numeroJogador?: number | null
  onClose: () => void
}) {
  const [deck,    setDeck]    = useState<DeckDto | null>(null)
  const [analise, setAnalise] = useState<DeckAnalise | null>(null)
  const [erro,    setErro]    = useState(false)
  const fecharRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let vivo = true
    deckApi.get(deckId)
      .then(r => {
        if (!vivo) return
        setDeck(r.data)
        setAnalise(analisarDeck(r.data.cardsJson, r.data.game))
      })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [deckId])

  // Teclado: Esc fecha e o foco começa no botão de fechar, senão quem navega
  // por teclado cai atrás do modal, na página que ficou embaixo.
  useEffect(() => {
    fecharRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function imprimir() {
    if (!deck || !analise) return
    printDecks([{
      jogador, numeroJogador,
      deckNome: deck.name, jogo: deck.game, formato: deck.format, analise,
    }], `Deck de ${jogador}`)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-viewer-titulo"
    >
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-500 shrink-0">
          <div className="min-w-0">
            <h2 id="deck-viewer-titulo" className="font-bold text-white text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-400" aria-hidden="true" />
              {deck?.name ?? 'Deck'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {jogador}
              {numeroJogador ? ` · jogador #${numeroJogador}` : ''}
              {deck ? ` · ${deck.game}${deck.format ? ` · ${deck.format}` : ''}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {deck && (
              <button
                onClick={imprimir}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Imprimir folha de conferência deste deck"
                title="Imprimir folha de conferência"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              ref={fecharRef}
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label="Fechar visualização do deck"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {erro ? (
            <p className="text-sm text-gray-400 text-center py-10" role="alert">
              Não foi possível carregar este deck.
            </p>
          ) : !deck || !analise ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-brand-400" aria-label="Carregando deck" />
            </div>
          ) : (
            <>
              <VeredictoDoDeck analise={analise} />

              {analise.cartas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Nenhuma carta registrada neste deck.
                </p>
              ) : (
                <ul className="mt-4 space-y-1.5" aria-label={`Cartas do deck ${deck.name}`}>
                  {analise.cartas.map((c, idx) => {
                    const excede = analise.acimaDoLimite.some(x => x.name === c.name)
                    return (
                      <li
                        key={`${c.id}-${idx}`}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 border ${
                          excede
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-surface-700 border-surface-500'
                        }`}
                      >
                        {c.imageSmall ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.imageSmall}
                            alt=""
                            className="w-9 h-12 object-cover rounded-md shrink-0 bg-surface-600"
                          />
                        ) : (
                          <div className="w-9 h-12 rounded-md bg-surface-600 shrink-0" aria-hidden="true" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{c.name}</p>
                          {(c.setName || c.number) && (
                            <p className="text-xs text-gray-400 truncate">
                              {c.setName}{c.setName && c.number ? ' · ' : ''}{c.number}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-sm font-bold shrink-0 ${excede ? 'txt-alerta' : 'text-brand-300'}`}
                          aria-label={`${c.quantity} cópias`}
                        >
                          {c.quantity}×
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Faixa de veredito: o que o juiz precisa saber antes de olhar a lista. */
function VeredictoDoDeck({ analise }: { analise: DeckAnalise }) {
  if (analise.invalido) {
    return (
      <p className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 bg-red-500/10 border border-red-500/30 txt-erro" role="alert">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        Deck ilegível — o conteúdo salvo não pôde ser lido.
      </p>
    )
  }

  if (analise.regular) {
    return (
      <p className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 bg-green-500/10 border border-green-500/30 txt-ok">
        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        {analise.total} cartas — dentro das regras de {analise.maxCards} cartas e {analise.maxCopies} cópias.
      </p>
    )
  }

  return (
    <div className="text-sm rounded-xl px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 txt-alerta" role="alert">
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        {analise.total} cartas — confira antes de liberar
      </p>
      <ul className="mt-1.5 space-y-0.5 pl-6 list-disc">
        {analise.faltando  > 0 && <li>Faltam {analise.faltando} carta(s) para as {analise.maxCards} do formato.</li>}
        {analise.excedendo > 0 && <li>{analise.excedendo} carta(s) acima das {analise.maxCards} do formato.</li>}
        {analise.acimaDoLimite.map(c => (
          <li key={c.name}>{c.name}: {c.quantity} cópias (limite {c.limite}).</li>
        ))}
      </ul>
    </div>
  )
}
