// =============================================================================
// useRascunho — guarda o que o caixa já marcou num modal, pra fechar sem perder
//
// O Maikon perdia pagamento, desconto e carrinho ao clicar fora do modal, então
// clique fora não fechava. Com o rascunho guardado, fechar (Esc, clique fora, X)
// é seguro: ao abrir de novo o modal volta como estava.
//
// Fica no localStorage, com validade (um rascunho de ontem não deve reaparecer na
// frente de outro cliente). Sem storage (aba privada, bloqueado) o modal funciona
// igual, só não lembra.
// =============================================================================
'use client'

import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'

const PREFIXO = 'rascunho:'
const VALIDADE_MS = 12 * 60 * 60 * 1000

interface Guardado<T> { v: T; t: number }

let varrido = false

// Comanda que fechou por outro caminho (Pix pago, cancelada em outra aba) deixa o
// rascunho pra trás; uma varredura por carregamento tira os vencidos.
function varrerVencidos() {
  varrido = true
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(PREFIXO)) continue
      try {
        if (Date.now() - (JSON.parse(localStorage.getItem(k) ?? '{}') as Guardado<unknown>).t > VALIDADE_MS) localStorage.removeItem(k)
      } catch { localStorage.removeItem(k) }
    }
  } catch { /* sem storage */ }
}

function ler<T>(chave: string): T | undefined {
  if (!varrido) varrerVencidos()
  try {
    const bruto = localStorage.getItem(PREFIXO + chave)
    if (!bruto) return undefined
    const g = JSON.parse(bruto) as Guardado<T>
    if (Date.now() - g.t > VALIDADE_MS) { localStorage.removeItem(PREFIXO + chave); return undefined }
    return g.v
  } catch { return undefined }
}

function gravar<T>(chave: string, valor: T) {
  try { localStorage.setItem(PREFIXO + chave, JSON.stringify({ v: valor, t: Date.now() } satisfies Guardado<T>)) }
  catch { /* sem storage: segue sem lembrar */ }
}

function apagar(chave: string) {
  try { localStorage.removeItem(PREFIXO + chave) } catch { /* sem storage */ }
}

/** Só vale guardar o que difere do padrão (o resto é o modal recém-aberto). */
const ehPadrao = (valor: unknown, padrao: unknown) => JSON.stringify(valor) === JSON.stringify(padrao)

/** Apaga todos os rascunhos cuja chave começa com `prefixo` (venda confirmada, comanda cancelada...). */
export function limparRascunhos(prefixo: string) {
  try {
    const alvo = PREFIXO + prefixo
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(alvo)) localStorage.removeItem(k)
    }
  } catch { /* sem storage */ }
}

/**
 * Igual ao useState, mas o valor sobrevive ao modal fechar. Valor igual ao inicial
 * não é guardado: abrir e fechar sem mexer em nada não deixa rascunho.
 */
export function useRascunho<T>(chave: string, inicial: T): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(() => ler<T>(chave) ?? inicial)
  const padrao = useRef(inicial)

  useEffect(() => {
    if (ehPadrao(valor, padrao.current)) apagar(chave)
    else gravar(chave, valor)
  }, [chave, valor])

  return [valor, setValor]
}

/** Grava direto um valor derivado (ex.: o carrinho reduzido a ids) sem passar por useState. */
export function useGravarRascunho<T>(chave: string, valor: T, padrao: T) {
  useEffect(() => {
    if (ehPadrao(valor, padrao)) apagar(chave)
    else gravar(chave, valor)
    // padrao é constante do chamador
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, valor])
}

/** Lê uma vez (pra montar o estado inicial de algo que não é um useState simples). */
export const lerRascunho = ler
