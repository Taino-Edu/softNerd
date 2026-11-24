'use client'

import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { productApi, vendaAvulsaApi, PAYMENT_METHODS } from '@/lib/api'
import type { Product, VendaAvulsaDto, EditarPagamentoVendaAvulsaRequest } from '@/lib/api'
import { usePreferences } from '@/hooks/usePreferences'
import { PageHeader } from '@/components/ui/PageHeader'
import toast from 'react-hot-toast'
import {
  ShoppingBag, Plus, CheckCircle, RotateCcw,
  Loader2, Receipt, PackageOpen, Banknote, CreditCard,
  History, TrendingUp, Clock, FileText, Star, X, BarChart2, Pencil,
} from 'lucide-react'
import clsx from 'clsx'
import { brl as fmt, hojeBrasil } from '@/lib/format'
import { PagamentoIcone } from '@/components/PagamentoIcone'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import PdvVenda from '@/components/admin/PdvVenda'

// Usado via style inline (cor dinâmica por chave de pagamento, não dá pra virar
// className do Tailwind) — os hex espelham exatamente os tokens de
// tailwind.config.ts (brand.500/accent.gold/accent.green/accent.orange) onde existe
// token equivalente, pra não ter duas fontes de verdade pra mesma cor.
const PAY_COLORS: Record<string, string> = {
  Pix:           '#3EC2F2', // brand.500
  Dinheiro:      '#FFE45E', // accent.gold
  CartaoCredito: '#00F0A8', // accent.green
  CartaoDebito:  '#f97316', // accent.orange
  Crediario:     '#f59e0b',
  Pontos:        '#a78bfa',
  Cashback:      '#34d399',
}

// ── Geração de PDF via print window ──────────────────────────────────────────

function printReceiptPDF(receipt: VendaAvulsaDto, payLabel: string) {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) { alert('Permita pop-ups para gerar o PDF'); return }

  const date = new Date(receipt.soldAt).toLocaleString('pt-BR')
  const itemsHTML = receipt.items.map(it => `
    <tr>
      <td>${it.quantity}× ${it.productName}</td>
      <td align="right">R$&nbsp;${it.subtotalInReais.toFixed(2).replace('.', ',')}</td>
    </tr>
  `).join('')

  // Desconto em R$ grava discountPercent = 0: a linha sumia do recibo e parecia que o desconto não
  // tinha entrado (relato do Maikon, 05/11). Vale o valor; o % só aparece quando foi em %.
  const discountRow = receipt.discountInReais > 0 ? `
    <tr style="color:#16a34a;">
      <td>Desconto${receipt.discountPercent > 0 ? ` (${receipt.discountPercent}%)` : ''}</td>
      <td align="right">−R$&nbsp;${receipt.discountInReais.toFixed(2).replace('.', ',')}</td>
    </tr>
  ` : ''

  w.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Comprovante — Santuário Nerd</title>
<style>
  @page { size: 80mm auto; margin: 6mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #111; padding: 8px; }
  h1 { font-size: 15px; text-align: center; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 10px; color: #555; margin-bottom: 8px; }
  hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .total-row td { font-size: 14px; font-weight: bold; padding-top: 4px; }
  .payment { font-size: 10px; color: #555; margin-top: 4px; }
  .footer { text-align: center; font-size: 10px; color: #777; margin-top: 10px; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>Santuário Nerd</h1>
<p class="sub">${date}</p>
${receipt.clientName ? `<p class="sub">Cliente: <strong>${receipt.clientName}</strong></p>` : ''}
<hr>
<table>
  ${itemsHTML}
  ${discountRow}
</table>
<hr>
<table>
  <tr class="total-row">
    <td>TOTAL</td>
    <td align="right">R$&nbsp;${receipt.totalInReais.toFixed(2).replace('.', ',')}</td>
  </tr>
</table>
<p class="payment">Pagamento: ${payLabel}</p>
<hr>
<p class="footer">Obrigado pela preferência! 🃏</p>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`)
  w.document.close()
}

function printDailyReportPDF(history: VendaAvulsaDto[], payMethods: typeof PAYMENT_METHODS) {
  const w = window.open('', '_blank', 'width=700,height=900')
  if (!w) { alert('Permita pop-ups para gerar o PDF'); return }

  const today = new Date().toLocaleDateString('pt-BR')
  const totalDia = history.reduce((s, v) => s + v.totalInReais, 0)

  const byMethod = payMethods.map(m => ({
    label: m.label,
    total: history.filter(v => v.paymentMethod === m.value).reduce((s, v) => s + v.totalInReais, 0),
    count: history.filter(v => v.paymentMethod === m.value).length,
  })).filter(m => m.count > 0)

  const vendasHTML = history.map(v => {
    const payLabel = payMethods.find(m => m.value === v.paymentMethod)?.label ?? v.paymentMethod
    const hora = new Date(v.soldAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const itens = v.items.map(it => `${it.quantity}× ${it.productName}`).join(', ')
    return `<tr>
      <td>${hora}</td>
      <td>${v.clientName ?? '—'}</td>
      <td style="max-width:200px;font-size:10px;">${itens}</td>
      <td>${payLabel}</td>
      <td align="right" style="font-weight:bold;">R$&nbsp;${v.totalInReais.toFixed(2).replace('.', ',')}</td>
    </tr>`
  }).join('')

  const byMethodHTML = byMethod.map(m => `
    <tr>
      <td>${m.label}</td>
      <td align="center">${m.count} venda${m.count !== 1 ? 's' : ''}</td>
      <td align="right">R$&nbsp;${m.total.toFixed(2).replace('.', ',')}</td>
    </tr>`).join('')

  w.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Relatório Diário — Santuário Nerd</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin: 16px 0 6px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .cards { display: flex; gap: 12px; margin-bottom: 16px; }
  .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 16px; flex: 1; }
  .card .val { font-size: 22px; font-weight: bold; color: #6C3FC5; }
  .card .lbl { font-size: 10px; color: #888; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f4f4f8; text-align: left; padding: 5px 8px; font-size: 11px; color: #444; }
  td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
  tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: bold; font-size: 13px; background: #f9f6ff; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>Santuário Nerd — Relatório Diário</h1>
<p class="meta">Data: ${today} &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleTimeString('pt-BR')}</p>

<div class="cards">
  <div class="card">
    <div class="val">${history.length}</div>
    <div class="lbl">Vendas realizadas</div>
  </div>
  <div class="card">
    <div class="val">R$&nbsp;${totalDia.toFixed(2).replace('.', ',')}</div>
    <div class="lbl">Total do dia</div>
  </div>
</div>

<h2>Por Forma de Pagamento</h2>
<table>
  <thead><tr><th>Método</th><th>Qtd.</th><th>Total</th></tr></thead>
  <tbody>${byMethodHTML}</tbody>
  <tfoot>
    <tr class="total-row">
      <td>TOTAL GERAL</td>
      <td align="center">${history.length}</td>
      <td align="right">R$&nbsp;${totalDia.toFixed(2).replace('.', ',')}</td>
    </tr>
  </tfoot>
</table>

<h2>Detalhamento das Vendas</h2>
<table>
  <thead><tr><th>Hora</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Total</th></tr></thead>
  <tbody>${vendasHTML}</tbody>
</table>

<script>window.onload = function() { window.print(); }<\/script>
</body></html>`)
  w.document.close()
}

// ── Modal de detalhes de uma venda ────────────────────────────────────────────

function VendaDetailModal({ venda, onClose, onUpdate }: { venda: VendaAvulsaDto; onClose: () => void; onUpdate: (updated: VendaAvulsaDto) => void }) {
  const payLabel = PAYMENT_METHODS.find(m => m.value === venda.paymentMethod)?.label ?? venda.paymentMethod
  const [editingPay, setEditingPay] = useState(false)
  const [newPm,      setNewPm]      = useState(venda.paymentMethod)
  const [newPm2,     setNewPm2]     = useState(venda.secondPaymentMethod ?? '')
  const [pm2val,     setPm2val]     = useState(String(venda.secondPaymentAmountInCents / 100))
  const [newClient,  setNewClient]  = useState(venda.clientName ?? '')
  const [newDisc,    setNewDisc]    = useState(venda.discountInReais > 0 ? String(venda.discountInReais.toFixed(2).replace('.', ',')) : '')
  const [saving,     setSaving]     = useState(false)

  // Estorno: venda lançada errada não se apaga — desfaz estoque/pontos/crediário e
  // sai do faturamento, mas continua no extrato com o motivo.
  const [estornando,    setEstornando]    = useState(false)
  const [confirmEstorno, setConfirmEstorno] = useState(false)
  const [motivoEstorno,  setMotivoEstorno]  = useState('')

  async function handleEstornar() {
    if (motivoEstorno.trim().length < 3) { toast.error('Escreva o motivo do estorno'); return }
    setEstornando(true)
    try {
      const { data } = await vendaAvulsaApi.estornar(venda.id, motivoEstorno.trim())
      toast.success('Venda estornada — estoque devolvido e valor fora do faturamento')
      onUpdate(data)
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erro ao estornar a venda')
    } finally { setEstornando(false) }
  }

  async function handleSavePay() {
    setSaving(true)
    try {
      const discVal = newDisc ? Math.round(parseFloat(newDisc.replace(',', '.') || '0') * 100) : undefined
      const req: EditarPagamentoVendaAvulsaRequest = {
        paymentMethod:              newPm,
        secondPaymentMethod:        newPm2 || undefined,
        secondPaymentAmountInCents: newPm2 ? Math.round(parseFloat(pm2val.replace(',', '.') || '0') * 100) : 0,
        clientName:                 newClient.trim() || undefined,
        clearClientName:            newClient.trim() === '' && !!venda.clientName,
        discountInCents:            discVal,
      }
      const { data } = await vendaAvulsaApi.editarPagamento(venda.id, req)
      toast.success('Venda atualizada!')
      onUpdate(data)
      setEditingPay(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao atualizar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    // Clique fora nao fecha: a edicao de pagamento acontece aqui dentro.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-500">
          <div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5 text-brand-400" />
              {venda.clientName ?? 'Cliente Balcão'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {new Date(venda.soldAt).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {venda.soldByAdminName && (
                <><span>·</span> <span>{venda.soldByAdminName}</span></>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors ml-3 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
          {venda.items.map((it, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <div className="flex-1 min-w-0">
                <span className="text-gray-300">{it.quantity}×&nbsp;</span>
                <span className="text-white">{it.productName}</span>
                {it.productCategory && (
                  <span className="ml-2 text-xs text-gray-400">{it.productCategory}</span>
                )}
              </div>
              <span className="text-gray-400 font-mono ml-3 shrink-0">
                {fmt(it.subtotalInReais)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-surface-500 px-5 py-4 space-y-2">
          {venda.discountInReais > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-400 font-mono">
                  {fmt(venda.totalInReais + venda.discountInReais)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-accent-green">Desconto{venda.discountPercent > 0 ? ` (${venda.discountPercent}%)` : ''}</span>
                <span className="text-accent-green font-mono">−{fmt(venda.discountInReais)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center pt-1">
            <span className="font-semibold text-white">Total</span>
            <span className="text-xl font-bold text-accent-gold">{fmt(venda.totalInReais)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 pt-1">
            <PagamentoIcone forma={venda.paymentMethod} />
            <span>{payLabel}</span>
          </div>
        </div>

        {editingPay ? (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Editar Venda</p>

            {/* Cliente */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cliente (opcional)</label>
              <input
                type="text"
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
                placeholder="Nome do cliente..."
                className="w-full bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm placeholder-gray-500"
              />
            </div>

            {/* Desconto */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Desconto R$ (opcional)</label>
              <input
                type="text"
                inputMode="decimal"
                value={newDisc}
                onChange={e => setNewDisc(e.target.value)}
                placeholder="0,00"
                className="w-full bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm placeholder-gray-500"
              />
            </div>

            {/* Pagamento principal */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Forma de pagamento</label>
              <select value={newPm} onChange={e => setNewPm(e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm">
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {/* Segundo pagamento */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Segundo pagamento (opcional)</label>
              <div className="flex gap-2">
                <select value={newPm2} onChange={e => setNewPm2(e.target.value)}
                  className="flex-1 bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm">
                  <option value="">Nenhum</option>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {newPm2 && (
                  <input type="number" step="0.01" min="0" value={pm2val} onChange={e => setPm2val(e.target.value)}
                    placeholder="Valor R$"
                    className="w-28 bg-surface-700 border border-surface-500 text-white rounded-xl px-3 py-2 text-sm" />
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingPay(false)} className="btn-secondary flex-1 justify-center text-sm">
                Cancelar
              </button>
              <button onClick={handleSavePay} disabled={saving} className="btn-primary flex-1 justify-center text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        ) : (
        <div className="px-5 pb-5 space-y-2">
          {venda.cancelada ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
              <p className="font-bold">Venda estornada</p>
              <p className="mt-0.5 text-red-200/80">
                {venda.motivoCancelamento}
                {venda.canceladaPorAdminNome && ` · por ${venda.canceladaPorAdminNome}`}
              </p>
              <p className="mt-0.5 text-red-200/60">Não conta mais no faturamento.</p>
            </div>
          ) : confirmEstorno ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-2">
              <p className="text-xs text-red-200">
                Isso devolve os itens ao estoque, desfaz pontos/cashback, baixa o crediário
                gerado e tira o valor do faturamento. A venda fica registrada como estornada.
              </p>
              <input
                autoFocus
                className="input text-sm w-full"
                placeholder="Motivo do estorno (ex.: lançado na conta errada)"
                value={motivoEstorno}
                onChange={e => setMotivoEstorno(e.target.value)}
                maxLength={300}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmEstorno(false); setMotivoEstorno('') }}
                  disabled={estornando}
                  className="btn-secondary flex-1 justify-center text-sm"
                >
                  Voltar
                </button>
                <button
                  onClick={handleEstornar}
                  disabled={estornando}
                  className="btn-danger flex-1 justify-center text-sm"
                >
                  {estornando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Confirmar estorno
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmEstorno(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-600/10 border border-red-600/30 hover:border-red-500/50 rounded-xl py-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Estornar venda
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => printReceiptPDF(venda, payLabel)}
              className="btn-secondary flex-1 justify-center text-sm"
            >
              <FileText className="w-4 h-4" /> Imprimir / PDF
            </button>
            <button onClick={() => setEditingPay(true)} className="btn-secondary flex-1 justify-center text-sm">
              <Pencil className="w-4 h-4" /> Pagamento
            </button>
            <button onClick={onClose} className="btn-primary flex-1 justify-center text-sm">
              Fechar
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function VendaAvulsaPage() {
  const { prefs } = usePreferences()
  const pdvResponsivo = useFuncionalidade('pdv-responsivo')
  // Painel novo: "Pontos" no azul da loja (era roxo); chave desligada = cor de antes
  const corPagamento = (m: string) => (m === 'Pontos' ? '#1E4FD6' : PAY_COLORS[m]) ?? '#4B5563'
  const [tab, setTab]               = useState<'venda' | 'historico'>('venda')
  const [products, setProducts]     = useState<Product[]>([])
  const [loading, setLoading]       = useState(true)
  const [receipt, setReceipt]       = useState<VendaAvulsaDto | null>(null)
  const [wizardOpen, setWizard]     = useState(false)
  const [todayHistory, setTodayH]   = useState<VendaAvulsaDto[]>([])
  const [history, setHistory]       = useState<VendaAvulsaDto[]>([])
  const [histLoading, setHistLoad]  = useState(false)
  const [histDate, setHistDate]     = useState(() =>
    hojeBrasil()
  )

  const todayStr = useMemo(
    () => hojeBrasil(),
    []
  )

  useEffect(() => {
    productApi.listAdmin()
      .then(r => setProducts(r.data.filter(p => p.isActive && p.stockQuantity > 0)))
      .catch(() => toast.error('Erro ao carregar produtos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    vendaAvulsaApi.byDate(todayStr).then(r => setTodayH(r.data)).catch(() => toast.error('Erro ao carregar vendas de hoje'))
  }, [todayStr])

  useEffect(() => {
    if (tab !== 'historico') return
    setHistLoad(true)
    vendaAvulsaApi.byDate(histDate)
      .then(r => setHistory(r.data))
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setHistLoad(false))
  }, [tab, histDate])

  function refreshToday() {
    vendaAvulsaApi.byDate(todayStr).then(r => setTodayH(r.data)).catch(() => toast.error('Erro ao atualizar vendas de hoje'))
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  const salesByHour = useMemo(() => {
    const map: Record<number, number> = {}
    todayHistory.forEach(v => { const h = new Date(v.soldAt).getHours(); map[h] = (map[h] || 0) + 1 })
    return map
  }, [todayHistory])

  const topProducts = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; receita: number }> = {}
    todayHistory.forEach(v => v.items.forEach(it => {
      if (!map[it.productName]) map[it.productName] = { nome: it.productName, qtd: 0, receita: 0 }
      map[it.productName].qtd += it.quantity
      map[it.productName].receita += it.subtotalInReais
    }))
    return Object.values(map).sort((a, b) => b.qtd - a.qtd).slice(0, 5)
  }, [todayHistory])

  const payBreakdown = useMemo(() => {
    const totalR = todayHistory.reduce((s, v) => s + v.totalInReais, 0)
    if (totalR === 0) return []
    const map: Record<string, number> = {}
    todayHistory.forEach(v => { map[v.paymentMethod] = (map[v.paymentMethod] || 0) + v.totalInReais })
    return Object.entries(map)
      .map(([method, value]) => ({
        method,
        label: PAYMENT_METHODS.find(m => m.value === method)?.label ?? method,
        value,
        pct: Math.round((value / totalR) * 100),
      }))
      .sort((a, b) => b.value - a.value)
  }, [todayHistory])

  // ── Comprovante ────────────────────────────────────────────────────────────

  if (receipt) {
    const payLabel = PAYMENT_METHODS.find(m => m.value === receipt.paymentMethod)?.label ?? receipt.paymentMethod
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="card space-y-5 text-center">
          <div className="w-16 h-16 bg-accent-green/10 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-accent-green" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Venda Registrada!</h2>
            {receipt.clientName && (
              <p className="text-gray-400 text-sm mt-1">
                Cliente: <span className="text-gray-200">{receipt.clientName}</span>
              </p>
            )}
            <p className="text-gray-500 text-xs mt-1 flex items-center justify-center gap-1">
              <PagamentoIcone forma={receipt.paymentMethod} /> {payLabel}
            </p>
          </div>
          <div className="bg-surface-800 rounded-xl divide-y divide-surface-500 text-left">
            {receipt.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-gray-300">{item.quantity}× {item.productName}</span>
                <span className="text-gray-400 font-mono">{fmt(item.subtotalInReais)}</span>
              </div>
            ))}
            {receipt.discountInReais > 0 && (
              <div className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-accent-green">Desconto{receipt.discountPercent > 0 ? ` (${receipt.discountPercent}%)` : ''}</span>
                <span className="text-accent-green font-mono">−{fmt(receipt.discountInReais)}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-3 font-bold">
              <span className="text-white">Total</span>
              <span className="text-accent-gold text-lg">{fmt(receipt.totalInReais)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">{new Date(receipt.soldAt).toLocaleString('pt-BR')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => printReceiptPDF(receipt, payLabel)}
              className="btn-secondary flex-1 justify-center"
            >
              <FileText className="w-4 h-4" /> Imprimir / PDF
            </button>
            <button
              onClick={() => { setReceipt(null) }}
              className="btn-primary flex-1 justify-center"
            >
              <RotateCcw className="w-4 h-4" /> Nova Venda
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Valores do dia ────────────────────────────────────────────────────────

  const todaySales = todayHistory.length
  const todayTotal = todayHistory.reduce((s, v) => s + v.totalInReais, 0)
  const ticketMedio = todaySales > 0 ? todayTotal / todaySales : 0
  const totalItens  = todayHistory.reduce((s, v) => s + v.items.reduce((si, i) => si + i.quantity, 0), 0)

  const hoursWithSales = Object.entries(salesByHour)
    .map(([h, count]) => ({ hour: parseInt(h), count }))
    .sort((a, b) => a.hour - b.hour)
  const maxSales = hoursWithSales.length > 0 ? Math.max(...hoursWithSales.map(h => h.count)) : 1
  const peakHour = hoursWithSales.reduce<{ hour: number; count: number } | null>(
    (best, h) => (!best || h.count > best.count) ? h : best, null
  )

  const assistente = wizardOpen && !loading && pdvResponsivo !== undefined && (
    <PdvVenda
      products={products}
      defaultDiscount={prefs.pdv.defaultDiscount}
      responsivo={pdvResponsivo}
      onComplete={r => { setWizard(false); setReceipt(r); refreshToday() }}
      onClose={() => setWizard(false)}
    />
  )

  if (pdvResponsivo && assistente) {
    return <div className="min-w-0 py-2 pl-2 pr-8 sm:p-5">{assistente}</div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-slide-up">

      {assistente && createPortal(assistente, document.body)}

      <PageHeader
        title="Frente de Caixa"
        subtitle="Venda direta no balcão"
        actions={
          <>
            <div className="flex gap-1 bg-surface-800 border border-surface-500 p-1 rounded-xl">
              <button
                onClick={() => setTab('venda')}
                className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                  tab === 'venda' ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-gray-400 hover:text-gray-200')}
              >
                <TrendingUp className="w-3.5 h-3.5" /> PDV
              </button>
              <button
                onClick={() => setTab('historico')}
                className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                  tab === 'historico' ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-gray-400 hover:text-gray-200')}
              >
                <History className="w-3.5 h-3.5" /> Histórico
              </button>
            </div>
            {tab === 'venda' && (
              <button
                onClick={() => setWizard(true)}
                disabled={loading || pdvResponsivo === undefined}
                className="btn-primary disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Começar venda
              </button>
            )}
          </>
        }
      />

      {/* ── Tab: PDV ──────────────────────────────────────────────────────── */}
      {tab === 'venda' && (
        <div className="space-y-5">

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Receipt className="w-4 h-4 text-brand-400" />,      bg: 'bg-brand-600/10',    val: todaySales,                                  label: 'Vendas hoje',    color: 'text-white'        },
              { icon: <TrendingUp className="w-4 h-4 text-accent-gold" />, bg: 'bg-amber-500/10',    val: fmt(todayTotal),                             label: 'Total hoje',     color: 'text-accent-gold'  },
              { icon: <CreditCard className="w-4 h-4 text-brand-400" />,   bg: 'bg-brand-600/10',    val: todaySales > 0 ? fmt(ticketMedio) : '—',     label: 'Ticket médio',   color: 'text-brand-300'    },
              { icon: <PackageOpen className="w-4 h-4 text-purple-400" />, bg: 'bg-purple-500/10',   val: products.length,                             label: 'Produtos ativos',color: 'text-white'        },
            ].map((k, i) => (
              <div key={i} className="card flex items-center gap-3 py-3">
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', k.bg)}>{k.icon}</div>
                <div>
                  <p className={clsx('text-lg font-bold leading-tight', k.color)}>{k.val}</p>
                  <p className="text-xs text-gray-400">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Analytics — só aparece se houver vendas hoje */}
          {todayHistory.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Horários de pico */}
              <div className="card">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <Clock className="w-3.5 h-3.5 text-brand-400" /> Horários de pico
                </h3>
                <div className="space-y-1.5">
                  {hoursWithSales.map(({ hour, count }) => (
                    <div key={hour} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 font-mono w-6 text-right shrink-0">{hour}h</span>
                      <div className="flex-1 h-3.5 bg-surface-800 rounded-sm overflow-hidden">
                        <div
                          className={clsx('h-full rounded-sm', count === maxSales ? 'bg-accent-gold' : 'bg-brand-600')}
                          style={{ width: `${(count / maxSales) * 100}%` }}
                        />
                      </div>
                      <span className={clsx('text-[10px] font-bold w-4 text-right shrink-0',
                        count === maxSales ? 'text-accent-gold' : 'text-gray-500'
                      )}>{count}</span>
                    </div>
                  ))}
                </div>
                {peakHour && (
                  <>
                    <div className="h-px bg-surface-600 my-2.5" />
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Pico do dia</span>
                      <span className="text-accent-gold font-semibold">
                        {peakHour.hour}h · {peakHour.count} {peakHour.count === 1 ? 'venda' : 'vendas'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Top Produtos */}
              <div className="card">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <Star className="w-3.5 h-3.5 text-accent-gold" /> Mais vendidos hoje
                </h3>
                {topProducts.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">Sem dados</p>
                ) : (
                  <div className="space-y-2.5">
                    {topProducts.map((p, i) => {
                      const maxQtd = topProducts[0].qtd
                      const rankCls = i === 0 ? 'text-accent-gold' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-600'
                      return (
                        <div key={p.nome} className="flex items-center gap-2">
                          <span className={clsx('text-xs font-bold w-4 shrink-0', rankCls)}>#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline">
                              <span className="text-xs font-medium text-white truncate mr-2">{p.nome}</span>
                              <span className="text-xs font-bold text-accent-gold shrink-0">{fmt(p.receita)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="flex-1 h-1 bg-surface-700 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${(p.qtd / maxQtd) * 100}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-500 shrink-0">{p.qtd} un.</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Resumo + Pagamentos */}
              <div className="card">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <BarChart2 className="w-3.5 h-3.5 text-brand-400" /> Resumo do dia
                </h3>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Vendas',     val: String(todaySales),                                   color: 'text-white'       },
                    { label: 'Ticket médio',val: todaySales > 0 ? fmt(ticketMedio) : '—',             color: 'text-accent-gold' },
                    { label: 'Total PDV',   val: fmt(todayTotal),                                     color: 'text-accent-green'},
                    { label: 'Itens/venda', val: todaySales > 0 ? (totalItens / todaySales).toFixed(1) : '—', color: 'text-brand-400'  },
                  ].map(m => (
                    <div key={m.label} className="bg-surface-800 rounded-lg p-2">
                      <p className="text-[10px] text-gray-500">{m.label}</p>
                      <p className={clsx('text-sm font-bold', m.color)}>{m.val}</p>
                    </div>
                  ))}
                </div>
                {payBreakdown.length > 0 && (
                  <div className="space-y-1.5">
                    {payBreakdown.map(p => (
                      <div key={p.method} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: corPagamento(p.method) }} />
                        <span className="text-[11px] text-gray-400 w-16 shrink-0 truncate">{p.label}</span>
                        <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: corPagamento(p.method) }} />
                        </div>
                        <span className="text-[10px] font-semibold w-6 text-right shrink-0" style={{ color: corPagamento(p.method) }}>{p.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {todayHistory.length === 0 && !loading && (
            <div className="card flex flex-col items-center justify-center py-16 gap-3 text-center">
              <ShoppingBag className="w-12 h-12 text-brand-600/30" />
              <div>
                <p className="text-white font-semibold">Nenhuma venda hoje ainda</p>
                <p className="text-gray-500 text-sm mt-1">Clique em "Começar venda" para registrar a primeira venda do dia.</p>
              </div>
              <button onClick={() => setWizard(true)} disabled={loading || pdvResponsivo === undefined} className="btn-primary mt-2">
                <Plus className="w-4 h-4" /> Começar venda
              </button>
            </div>
          )}

          {/* Últimas vendas */}
          {todayHistory.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-brand-400" /> Últimas vendas de hoje
              </h3>
              <div className="space-y-2">
                {[...todayHistory].slice(0, 5).map(v => {
                  const payLabel = PAYMENT_METHODS.find(m => m.value === v.paymentMethod)?.label ?? v.paymentMethod
                  const qtd = v.items.reduce((s, i) => s + i.quantity, 0)
                  return (
                    <div key={v.id} className="flex items-center gap-3 py-2 px-3 bg-surface-800 rounded-xl">
                      <div className="w-7 h-7 bg-accent-green/10 rounded-lg flex items-center justify-center shrink-0">
                        <CheckCircle className="w-3.5 h-3.5 text-accent-green" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {v.clientName ?? <span className="text-gray-500 italic text-xs">Balcão</span>}
                        </p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(v.soldAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          · {payLabel} · {qtd} {qtd === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-accent-gold">{fmt(v.totalInReais)}</p>
                        {v.discountInReais > 0 && (
                          <p className="text-[10px] text-accent-green">−{v.discountPercent > 0 ? `${v.discountPercent}%` : fmt(v.discountInReais)}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
                {todayHistory.length > 5 && (
                  <button
                    onClick={() => setTab('historico')}
                    className="w-full text-xs text-brand-400 hover:text-brand-300 transition-colors py-1 text-center"
                  >
                    Ver todas as {todayHistory.length} vendas →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Histórico ──────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <HistoricoTab
          history={history}
          loading={histLoading}
          date={histDate}
          onDateChange={setHistDate}
          onVendaUpdate={updated => setHistory(prev => prev.map(v => v.id === updated.id ? updated : v))}
        />
      )}

      {/* Mobile — Começar Venda: pílula no meio do rodapé. No canto direito ela ficava embaixo da mão do
          VLibras e do botão do assistente. */}
      {tab === 'venda' && (
        <button
          onClick={() => setWizard(true)}
          disabled={loading || pdvResponsivo === undefined}
          className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-30 h-12 pl-4 pr-5 rounded-full bg-brand-600 hover:bg-brand-500 active:scale-95 flex items-center gap-2 text-white text-sm font-semibold whitespace-nowrap shadow-xl shadow-brand-600/40 disabled:opacity-50 transition-all"
          aria-label="Começar venda"
        >
          <Plus className="w-5 h-5" /> Começar venda
        </button>
      )}

    </div>
  )
}

// ── Componente Histórico do Dia ───────────────────────────────────────────────

function HistoricoTab({ history, loading, date, onDateChange, onVendaUpdate }: {
  history: VendaAvulsaDto[]
  loading: boolean
  date: string
  onDateChange: (d: string) => void
  onVendaUpdate: (updated: VendaAvulsaDto) => void
}) {
  const [selectedVenda, setSelectedVenda] = useState<VendaAvulsaDto | null>(null)

  const totalDia = history.reduce((s, v) => s + v.totalInReais, 0)
  const countDia = history.length
  // Hoje no calendário de Brasília — toISOString dava a data UTC, que das 21h à
  // meia-noite já é amanhã (o "Hoje" pulava pra um dia sem vendas)
  const today    = hojeBrasil()
  const isToday  = date === today
  // Soma dias a uma data YYYY-MM-DD sem passar pelo fuso do computador
  const somarDias = (d: string, n: number) => {
    const x = new Date(`${d}T12:00:00Z`)
    x.setUTCDate(x.getUTCDate() + n)
    return x.toISOString().slice(0, 10)
  }

  const labelData = isToday
    ? 'hoje'
    : new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="flex-1 overflow-y-auto space-y-4">

      {selectedVenda && createPortal(
        <VendaDetailModal
          venda={selectedVenda}
          onClose={() => setSelectedVenda(null)}
          onUpdate={updated => { setSelectedVenda(updated); onVendaUpdate(updated) }}
        />,
        document.body
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDateChange(somarDias(date, -1))}
            className="w-8 h-8 rounded-lg bg-surface-700 border border-surface-500 hover:border-surface-400 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >‹</button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={e => onDateChange(e.target.value)}
            className="input py-1.5 text-sm w-40"
          />
          <button
            onClick={() => {
              const next = somarDias(date, 1)
              if (next <= today) onDateChange(next)
            }}
            disabled={date >= today}
            className="w-8 h-8 rounded-lg bg-surface-700 border border-surface-500 hover:border-surface-400 flex items-center justify-center text-gray-400 hover:text-white transition-colors disabled:opacity-30"
          >›</button>
          {!isToday && (
            <button
              onClick={() => onDateChange(today)}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Hoje
            </button>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={() => printDailyReportPDF(history, PAYMENT_METHODS)}
            className="btn-secondary text-sm flex items-center gap-2 ml-auto"
          >
            <FileText className="w-4 h-4" /> Exportar PDF
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-brand-600/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{countDia}</p>
                <p className="text-xs text-gray-400">Vendas {labelData}</p>
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-accent-gold" />
              </div>
              <div>
                <p className="text-2xl font-bold text-accent-gold">{fmt(totalDia)}</p>
                <p className="text-xs text-gray-400">Total {labelData}</p>
              </div>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
              <History className="w-10 h-10 text-gray-400" />
              <p className="text-sm">Nenhuma venda registrada em {labelData}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(v => {
                const payLabel = PAYMENT_METHODS.find(m => m.value === v.paymentMethod)?.label ?? v.paymentMethod
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVenda(v)}
                    className="card w-full text-left hover:border-brand-500/40 hover:bg-surface-700/50 active:scale-[0.99] transition-all duration-150 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {v.clientName ?? <span className="text-gray-500 italic">Cliente Balcão</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {new Date(v.soldAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          <span>·</span>
                          <PagamentoIcone forma={v.paymentMethod} />
                          {payLabel}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-accent-gold font-bold">{fmt(v.totalInReais)}</p>
                        {v.discountInReais > 0 && (
                          <p className="text-xs text-accent-green">−{v.discountPercent > 0 ? `${v.discountPercent}%` : fmt(v.discountInReais)} desc.</p>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {v.items.map((it, idx) => (
                        <span key={idx}>{idx > 0 && ', '}{it.quantity}× {it.productName}</span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
