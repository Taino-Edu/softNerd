'use client'
// Telas com barra de ações presa no pé (Nova venda do PDV, Adicionar itens e Fechar comanda).
// Quem tem a barra marca com useMarcarRodapeFixo(); a mão do VLibras e o botão do assistente
// leem useTemRodapeFixo() e sobem acima dela. Antes a regra era pelo endereço da página, e a
// comanda (que mora no Painel Geral) ficava com os botões por cima do "Confirmar".

import { useEffect, useSyncExternalStore } from 'react'

let ativos = 0
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach(ouvinte => ouvinte())

export function useMarcarRodapeFixo(ativo = true) {
  useEffect(() => {
    if (!ativo) return
    ativos++
    avisar()
    return () => { ativos--; avisar() }
  }, [ativo])
}

export function useTemRodapeFixo() {
  return useSyncExternalStore(
    ouvinte => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte) } },
    () => ativos > 0,
    () => false,
  )
}
