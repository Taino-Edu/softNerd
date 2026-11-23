// lib/cotacaoCartas.ts — dólar de agora pro preço de referência (v1.95.0, chave "dolar-tempo-real-cartas").
// A API lê o dólar comercial (AwesomeAPI) no máximo a cada 10 min, com a PTAX oficial de reserva. A tela converte o
// preço em dólar do catálogo pra reais com ele — reais primeiro, dólar ao lado (pedido do Taino, 23/11).
'use client'
import { useEffect, useState } from 'react'
import { catalogoCartasApi, CotacaoCartas } from '@/lib/api'

let guardada: { em: number; cotacao: CotacaoCartas } | null = null
const VALIDADE_MS = 5 * 60_000

/** Cotação da conversão, lida uma vez a cada 5 min por aba (a API ainda segura 10 min do lado dela). */
export function useCotacaoCartas(ativo = true): CotacaoCartas | null {
  const [cotacao, setCotacao] = useState<CotacaoCartas | null>(guardada?.cotacao ?? null)
  useEffect(() => {
    if (!ativo) return
    if (guardada && Date.now() - guardada.em < VALIDADE_MS) { setCotacao(guardada.cotacao); return }
    let vivo = true
    catalogoCartasApi.cotacao()
      .then(r => { guardada = { em: Date.now(), cotacao: r.data }; if (vivo) setCotacao(r.data) })
      .catch(() => {})
    return () => { vivo = false }
  }, [ativo])
  return cotacao
}

/** Dólar → centavos de real pela cotação (null sem preço ou sem cotação). */
export function emCentavos(usd: number | null | undefined, cotacao: CotacaoCartas | null): number | null {
  if (usd == null || !cotacao) return null
  return Math.round(usd * cotacao.valor * 100)
}

/** "US$ 7,43" */
export function usd(v: number | null | undefined): string {
  return v == null ? '—' : `US$ ${v.toFixed(2).replace('.', ',')}`
}

/** "dólar R$ 5,977 · mercado às 09:27" / "dólar R$ 5,889 · PTAX de 20/11" */
export function rotuloCotacao(c: { valor: number; obtidaEm: string | null; fonte: string | null } | null): string {
  if (!c) return ''
  const valor = `dólar R$ ${c.valor.toFixed(3).replace('.', ',')}`
  if (!c.obtidaEm) return valor
  const d = new Date(c.obtidaEm)
  const mercado = (c.fonte ?? '').toLowerCase().includes('mercado')
  const quando = mercado
    ? `mercado às ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`
    : `PTAX de ${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}`
  return `${valor} · ${quando}`
}
