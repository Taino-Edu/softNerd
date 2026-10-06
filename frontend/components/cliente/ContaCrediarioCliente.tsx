'use client'
// Conta de crediário vista pelo cliente (perfil → aba Dívida). O cliente confere
// sozinho: quanto deve, quanto já pagou, o que levou (tudo somado) e, no
// histórico, quando cada compra entrou e quando cada pagamento foi feito.

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react'
import { CrediariosDto } from '@/lib/api'
import { agruparItens, totalUnidades } from '@/lib/crediario'
import { gerarSumulaCrediario } from '@/lib/sumula-crediario'

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const diaHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})

const ORIGEM: Record<string, string> = {
  Comanda:     'Comanda',
  VendaAvulsa: 'Compra no balcão',
  Manual:      'Lançamento da loja',
  Ajuste:      'Itens incluídos pela loja',
  Legado:      'Compras anteriores',
}

const FORMA: Record<string, string> = {
  Dinheiro: 'Dinheiro', Pix: 'Pix', CartaoCredito: 'Cartão de crédito', CartaoDebito: 'Cartão de débito',
}

type Evento =
  | { tipo: 'compra'; quando: string; titulo: string; valor: number; estornada: boolean; itens: ReturnType<typeof agruparItens> }
  | { tipo: 'pagamento'; quando: string; titulo: string; valor: number }

export default function ContaCrediarioCliente({ c }: { c: CrediariosDto }) {
  const [historico, setHistorico] = useState(false)
  const [gerando, setGerando]     = useState(false)

  const quitada    = c.status === 'Pago'
  const ativas     = c.lancamentos.filter(l => !l.estornadoEm)
  const todosItens = ativas.flatMap(l => l.itens)
  const resumo     = agruparItens(todosItens).sort((a, b) => b.subtotalInReais - a.subtotalInReais)
  // Valor editado pela loja: sem esta linha o total não bateria com as compras
  const ajuste     = c.lancamentos.length > 0
    ? c.valorEmReais - ativas.reduce((s, l) => s + l.valorEmReais, 0)
    : 0

  // Histórico: compras e pagamentos juntos, do mais recente pro mais antigo
  const eventos: Evento[] = [
    ...c.lancamentos.map(l => ({
      tipo: 'compra' as const,
      quando: l.createdAt,
      titulo: ORIGEM[l.origem] ?? l.origem,
      valor: l.valorEmReais,
      estornada: !!l.estornadoEm,
      itens: agruparItens(l.itens),
    })),
    ...c.pagamentos.map(p => ({
      tipo: 'pagamento' as const,
      quando: p.createdAt,
      titulo: `Pagamento — ${FORMA[p.formaPagamento] ?? p.formaPagamento}`,
      valor: p.valorEmReais,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando))

  async function baixarExtrato() {
    setGerando(true)
    try { await gerarSumulaCrediario(c, undefined, { paraCliente: true }) }
    catch { toast.error('Não deu pra gerar o extrato agora.') }
    finally { setGerando(false) }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
      {/* Situação */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {quitada ? (
            <>
              <p className="text-lg font-black text-emerald-600">Quitada</p>
              <p className="text-[11px] text-gray-400">
                {brl(c.valorEmReais)} · paga em {c.dataPagamento ? dia(c.dataPagamento) : '—'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-gray-400 font-bold uppercase">Falta pagar</p>
              <p className="text-2xl font-black text-gray-900">{brl(c.saldoRestanteEmReais)}</p>
              <p className="text-[11px] text-gray-500">
                Total {brl(c.valorEmReais)}
                {c.valorPagoEmReais > 0 && <> · já pago {brl(c.valorPagoEmReais)}</>}
              </p>
            </>
          )}
        </div>
        {!quitada && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-400 font-bold uppercase">Vencimento</p>
            <p className={c.vencido ? 'text-sm font-bold text-red-500' : 'text-sm font-bold text-gray-700'}>
              {dia(c.dataVencimento)}
            </p>
            {c.vencido && <span className="text-[10px] font-black uppercase text-red-500">vencida</span>}
          </div>
        )}
      </div>

      {!quitada && c.pagamentoToken && (
        <Link
          href={`/pagar/${c.pagamentoToken}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-black text-white bg-violet-600 hover:bg-violet-700 transition-colors"
        >
          Pagar {brl(c.saldoRestanteEmReais)} com Pix
        </Link>
      )}

      {/* O que levou — tudo somado */}
      {resumo.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
            O que você levou · {totalUnidades(todosItens)} {totalUnidades(todosItens) === 1 ? 'item' : 'itens'}
          </p>
          <div className="space-y-1">
            {resumo.map(i => (
              <div key={`${i.itemName}|${i.unitPriceInReais}`} className="flex justify-between gap-2 text-xs">
                <span className="text-gray-700 truncate"><b>{i.quantity}×</b> {i.itemName}</span>
                <span className="text-gray-500 font-mono shrink-0">{brl(i.subtotalInReais)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico com data e hora */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setHistorico(v => !v)}
          className="flex items-center gap-1 text-xs font-bold text-violet-600"
        >
          {historico ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {historico ? 'Esconder histórico' : 'Ver histórico (quando cada coisa entrou)'}
        </button>
        <button
          onClick={baixarExtrato}
          disabled={gerando}
          className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 disabled:opacity-60"
        >
          {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Extrato PDF
        </button>
      </div>

      {historico && (
        <div className="border-t border-gray-100 pt-2 space-y-2">
          {eventos.map((e, idx) => (
            <div key={idx} className={clsx('text-xs', e.tipo === 'compra' && e.estornada && 'opacity-50')}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-gray-700">
                  {e.titulo}
                  {e.tipo === 'compra' && e.estornada && <span className="ml-1 text-[10px] uppercase text-red-500">cancelada</span>}
                </span>
                <span className={clsx('font-mono shrink-0',
                  e.tipo === 'pagamento' ? 'text-emerald-600' : 'text-gray-700',
                  e.tipo === 'compra' && e.estornada && 'line-through')}>
                  {e.tipo === 'pagamento' ? '- ' : '+ '}{brl(e.valor)}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {diaHora(e.quando)}
                {e.tipo === 'compra' && e.titulo === ORIGEM.Legado && ' · data em que a conta foi aberta'}
              </p>
              {e.tipo === 'compra' && e.itens.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {e.itens.map(i => `${i.quantity}× ${i.itemName}`).join(', ')}
                </p>
              )}
            </div>
          ))}
          {Math.abs(ajuste) >= 0.01 && (
            <div className="text-xs flex items-baseline justify-between gap-2 border-t border-dashed border-gray-200 pt-2">
              <span className="font-bold text-gray-700">Ajuste de valor feito pela loja</span>
              <span className="font-mono text-gray-700 shrink-0">{ajuste > 0 ? '+ ' : '- '}{brl(Math.abs(ajuste))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
