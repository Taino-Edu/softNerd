// =============================================================================
// useDispensarModal — Esc e clique fora fecham o modal (só o do topo)
//
// Só use em modal que guarda rascunho (lib/useRascunho): sem isso, fechar por
// engano apaga o que o caixa tinha marcado — foi o motivo de o clique fora não
// fechar nada até aqui.
//
// Com modais empilhados (ex.: escolher variante dentro da venda) o Esc fecha só o
// de cima, e o clique no fundo conta só se começou e terminou no próprio fundo
// (arrastar um texto pra fora do campo não fecha nada).
// =============================================================================
'use client'

import { MouseEvent, useCallback, useEffect, useRef } from 'react'

const pilha: symbol[] = []

/**
 * Tem modal aberto? Os que usam este hook entram na pilha; os demais (feitos à mão, um
 * `fixed inset-0` com fundo escuro) a gente reconhece pelo fundo. Usado pelos atalhos de
 * teclado de navegação: digitar com um modal aberto e sem foco num campo trocava de tela.
 */
export function haModalAberto(): boolean {
  return pilha.length > 0 || !!document.querySelector('div.fixed.inset-0[class*="bg-black"]')
}

export function useDispensarModal(dispensar: () => void) {
  const id = useRef(Symbol('modal')).current
  const dispensarRef = useRef(dispensar)
  dispensarRef.current = dispensar

  useEffect(() => {
    pilha.push(id)
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pilha[pilha.length - 1] === id) dispensarRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      const i = pilha.indexOf(id)
      if (i >= 0) pilha.splice(i, 1)
    }
  }, [id])

  const comecouNoFundo = useRef(false)
  const aoPressionar = useCallback((e: MouseEvent) => { comecouNoFundo.current = e.target === e.currentTarget }, [])
  const aoClicar = useCallback((e: MouseEvent) => {
    if (comecouNoFundo.current && e.target === e.currentTarget && pilha[pilha.length - 1] === id) dispensarRef.current()
    comecouNoFundo.current = false
  }, [id])

  /** Espalhe no elemento do fundo escuro: `<div className="fixed inset-0 ..." {...fundo}>`. */
  return { onMouseDown: aoPressionar, onClick: aoClicar }
}
