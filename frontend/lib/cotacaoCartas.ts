// lib/cotacaoCartas.ts — dólar de agora pro preço de referência (v1.95.0, chave "dolar-tempo-real-cartas").
// A API lê o dólar comercial (AwesomeAPI) no máximo a cada 10 min, com a PTAX oficial de reserva. A tela converte o
// preço em dólar do catálogo pra reais com ele — reais primeiro, dólar ao lado (pedido do Taino, 23/11).
'use client'
import { useEffect, useState } from 'react'
import { catalogoCartasApi, CotacaoCartas } from '@/lib/api'

let guardada: { em: number; cotacao: CotacaoCartas } | null = null
const VALIDADE_MS = 5 * 60_000

async function lerCotacao(): Promise<CotacaoCartas | null> {
  if (guardada && Date.now() - guardada.em < VALIDADE_MS) return guardada.cotacao
  try {
    const { data } = await catalogoCartasApi.cotacao()
    guardada = { em: Date.now(), cotacao: data }
    return data
  } catch { return guardada?.cotacao ?? null }
}

/**
 * Cotação da conversão. Lê ao abrir e de novo a cada 5 min enquanto a tela fica aberta (a lista e o catálogo ficam
 * abertos o dia todo no balcão — sem isso a cotação congelava na da abertura; achado do Codex no PR #188).
 */
export function useCotacaoCartas(ativo = true): CotacaoCartas | null {
  const [cotacao, setCotacao] = useState<CotacaoCartas | null>(guardada?.cotacao ?? null)
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    const atualizar = () => lerCotacao().then(c => { if (vivo && c) setCotacao(c) })
    atualizar()
    const relogio = setInterval(atualizar, VALIDADE_MS)
    return () => { vivo = false; clearInterval(relogio) }
  }, [ativo])
  return cotacao
}

/**
 * Dólar → centavos de real pela cotação. Null sem preço, sem cotação ou com cotação DEGRADADA: sem nenhuma fonte, a
 * API devolve um valor de emergência (R$ 5,00) que não é cotação — converter por ele mostraria um preço com cara de
 * certo (achado do Codex no PR #188). A tela cai na referência guardada pelo robô ou no dólar.
 */
export function emCentavos(usd: number | null | undefined, cotacao: CotacaoCartas | null): number | null {
  if (usd == null || !cotacao || cotacao.degradada) return null
  return Math.round(usd * cotacao.valor * 100)
}

/** "US$ 7,43" */
export function usd(v: number | null | undefined): string {
  return v == null ? '—' : `US$ ${v.toFixed(2).replace('.', ',')}`
}

/** "dólar R$ 5,977 · mercado às 09:27" / "dólar R$ 5,889 · PTAX de 20/11" */
export function rotuloCotacao(c: { valor: number; obtidaEm: string | null; fonte: string | null; degradada?: boolean } | null): string {
  if (!c || c.degradada) return ''
  const valor = `dólar R$ ${c.valor.toFixed(3).replace('.', ',')}`
  if (!c.obtidaEm) return valor
  const d = new Date(c.obtidaEm)
  const mercado = (c.fonte ?? '').toLowerCase().includes('mercado')
  const quando = mercado
    ? `mercado às ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`
    : `PTAX de ${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}`
  return `${valor} · ${quando}`
}
