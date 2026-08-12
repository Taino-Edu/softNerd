'use client'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { productApi, categoryApi, vendaAvulsaApi, userApi, fiscalApi, PAYMENT_METHODS, PAYMENT_NEEDS_USER, SECOND_PAYMENT_METHODS, Product, ProductCategory, ProductVariant, VendaAvulsaDto, UserSummary, EditarPagamentoVendaAvulsaRequest } from '@/lib/api'
import { useThrottle } from '@/lib/hooks'
import { usePreferences } from '@/hooks/usePreferences'
import { PageHeader } from '@/components/ui/PageHeader'
import toast from 'react-hot-toast'
import {
  ShoppingBag, Plus, Minus, User, CheckCircle, RotateCcw,
  Loader2, Receipt, PackageOpen, Banknote, CreditCard, QrCode,
  Tag, History, TrendingUp, Clock, FileText, AlertCircle, Star, Wallet, X,
  BarChart2, ArrowRight, ChevronLeft, Pencil,
} from 'lucide-react'
import clsx from 'clsx'
import VariantPicker from '@/components/admin/VariantPicker'
import ConferenciaButton from '@/components/admin/ConferenciaButton'
import PercentPicker from '@/components/admin/PercentPicker'

interface CartItem {
  product: Product
  quantity: number
  variantId?: string
  variantLabel?: string
  cartKey: string   // product.id + (variantId || '') — permite mesma peça em tamanhos diferentes
}

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

  const discountRow = receipt.discountPercent > 0 ? `
    <tr style="color:#16a34a;">
      <td>Desconto (${receipt.discountPercent}%)</td>
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
  const [emitindoNota, setEmitindoNota] = useState(false)

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

  async function handleEmitirNota() {
    setEmitindoNota(true)
    try {
      const { data } = await fiscalApi.emitirNotaVendaAvulsa(venda.id)
      if (data.status === 'Autorizada') {
        toast.success('Nota fiscal autorizada!')
        window.open(`/admin/fiscal/cupom/${data.id}`, '_blank')
      } else {
        toast.error(`Nota registrada, aguardando: ${data.status}${data.motivoRejeicao ? ' — ' + data.motivoRejeicao : ''}`)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao emitir nota fiscal.')
    } finally {
      setEmitindoNota(false)
    }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
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
          {venda.discountPercent > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-400 font-mono">
                  {fmt(venda.totalInReais + venda.discountInReais)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-accent-green">Desconto ({venda.discountPercent}%)</span>
                <span className="text-accent-green font-mono">−{fmt(venda.discountInReais)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center pt-1">
            <span className="font-semibold text-white">Total</span>
            <span className="text-xl font-bold text-accent-gold">{fmt(venda.totalInReais)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 pt-1">
            {PAYMENT_ICONS_INNER[venda.paymentMethod]}
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

          <button
            onClick={handleEmitirNota}
            disabled={emitindoNota}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-600/10 border border-amber-600/30 hover:border-amber-500/50 rounded-xl py-2 transition-colors disabled:opacity-50"
          >
            {emitindoNota ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
            Emitir nota fiscal
          </button>
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

const PAYMENT_ICONS_INNER: Record<string, React.ReactNode> = {
  Pix:           <QrCode     className="w-4 h-4" />,
  Dinheiro:      <Banknote   className="w-4 h-4" />,
  CartaoCredito: <CreditCard className="w-4 h-4" />,
  CartaoDebito:  <CreditCard className="w-4 h-4" />,
  Crediario:     <FileText   className="w-4 h-4" />,
  Pontos:        <Star       className="w-4 h-4" />,
  Cashback:      <Wallet     className="w-4 h-4" />,
}

const PAYMENT_ICONS = PAYMENT_ICONS_INNER

const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

/** Após um registro com "Emitir cupom fiscal" marcado: abre o cupom sozinho se autorizou,
 * ou avisa o motivo se rejeitou/ficou pendente (SEFAZ fora do ar — o retry automático tenta de novo). */
function handleNotaFiscalResult(notaId?: string | null, status?: string | null, motivo?: string | null) {
  if (!status) return
  if (status === 'Bloqueada') {
    toast.error(motivo ?? 'Módulo bloqueado por hora')
    return
  }
  if (status === 'Autorizada' && notaId) {
    window.open(`/admin/fiscal/cupom/${notaId}`, '_blank')
  } else {
    toast.error(`Nota fiscal não autorizou ainda (${status})${motivo ? ' — ' + motivo : ''}. O sistema tenta de novo automaticamente.`)
  }
}

// ── Wizard de nova venda (3 etapas) ──────────────────────────────────────────

function VendaWizard({
  products,
  defaultDiscount,
  onComplete,
  onClose,
}: {
  products: Product[]
  defaultDiscount: number
  onComplete: (receipt: VendaAvulsaDto) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Etapa 1 — cliente
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<UserSummary[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')

  // Etapa 2 — produtos
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCat] = useState<string | null>(null)
  const [allCategories, setAllCategories] = useState<ProductCategory[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)

  // Etapa 3 — pagamento
  const [payment, setPayment] = useState<string>(PAYMENT_METHODS[0].value)
  const [discountMode, setDiscountMode] = useState<'percent' | 'cents'>('percent')
  const [discountPct, setDiscountPct] = useState(defaultDiscount)
  const [discountValueStr, setDiscountValueStr] = useState('')
  const [received, setReceived] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Pagamento dividido (segundo método)
  const [splitEnabled, setSplit] = useState(false)
  const [secondPayment, setSecondPayment] = useState<string>(PAYMENT_METHODS[1].value)
  const [secondAmountStr, setSecondAmountStr] = useState('')

  // Emissão de nota fiscal — o admin decide explicitamente no fechamento (Maikon não quer
  // nota emitida sem antes perguntar); só vem pré-marcado pras formas de pagamento que ele
  // configurou como auto-emissão em Admin > Fiscal.
  const [autoEmitMethods, setAutoEmitMethods] = useState<string[]>([])
  const [fiscalModuloAtivo, setFiscalModuloAtivo] = useState(false)
  const [emitirNota, setEmitirNota] = useState(false)
  const [notaTouched, setNotaTouched] = useState(false)

  useEffect(() => {
    fiscalApi.getConfig().then(r => {
      setAutoEmitMethods(r.data.formasPagamentoAutoEmissao ?? [])
      setFiscalModuloAtivo(r.data.moduloFiscalAtivo ?? false)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    categoryApi.list().then(r => setAllCategories(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!fiscalModuloAtivo) setEmitirNota(false)
    else if (!notaTouched) setEmitirNota(autoEmitMethods.includes(payment))
  }, [payment, autoEmitMethods, notaTouched, fiscalModuloAtivo])

  useEffect(() => {
    if (step === 2) setTimeout(() => searchRef.current?.focus(), 80)
  }, [step])

  // Pre-load de item + cliente vindo da Lista de Espera
  useEffect(() => {
    const raw = sessionStorage.getItem('wl_pdv_preload')
    if (!raw) return
    sessionStorage.removeItem('wl_pdv_preload')
    try {
      const { productId, userId, userName } = JSON.parse(raw)
      // carrega produto
      productApi.get(productId).then(r => {
        const p = r.data
        const cartKey = p.id
        setCart([{ product: p, quantity: 1, cartKey }])
      }).catch(() => {})
      // carrega cliente se tiver userId
      if (userId) {
        userApi.getById(userId).then(r => {
          const u = r.data
          setSelectedUser(u)
          setSelectedUserId(u.id)
          setClientName(u.name)
          setClientSearch(u.name)
        }).catch(() => {
          // fallback: só preenche nome
          setClientName(userName ?? '')
          setClientSearch(userName ?? '')
        })
      } else if (userName) {
        setClientName(userName)
        setClientSearch(userName)
      }
    } catch {}
  }, [])

  // Debounce busca de clientes
  useEffect(() => {
    if (clientSearch.trim().length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      setClientLoading(true)
      try {
        const { data } = await userApi.list(clientSearch)
        setClientResults(data.filter(u => u.role === 'Customer' && u.isActive).slice(0, 6))
      } catch { /* silencioso */ }
      finally { setClientLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  function selectClient(u: UserSummary) {
    setSelectedUser(u); setSelectedUserId(u.id)
    setClientName(u.name); setClientSearch(u.name); setClientResults([])
  }
  function clearClient() {
    setSelectedUser(null); setSelectedUserId(null)
    setClientName(''); setClientSearch(''); setClientResults([])
  }

  function addToCart(product: Product, variant?: ProductVariant) {
    if (product.hasVariants && !variant) {
      setVariantPickerProduct(product)
      return
    }
    const cartKey = product.id + (variant?.id ?? '')
    const maxStock = variant ? variant.stockQuantity : product.stockQuantity
    setCart(prev => {
      const ex = prev.find(i => i.cartKey === cartKey)
      if (ex) {
        if (ex.quantity >= maxStock) {
          toast.error(`Estoque máximo: ${maxStock} un.`, { id: cartKey })
          return prev
        }
        return prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { product, quantity: 1, variantId: variant?.id, variantLabel: variant?.label, cartKey }]
    })
  }
  function changeQty(cartKey: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.cartKey !== cartKey) return i
      const maxStock = i.variantId
        ? (i.product.stockQuantity) // aproximação — backend valida
        : i.product.stockQuantity
      return { ...i, quantity: Math.max(1, Math.min(i.quantity + delta, maxStock)) }
    }))
  }
  function removeFromCart(cartKey: string) {
    setCart(prev => prev.filter(i => i.cartKey !== cartKey))
  }

  const subtotal = cart.reduce((s, i) => {
    const price = i.product.isOnPromo && i.product.discountPriceInCents != null
      ? i.product.discountPriceInCents : i.product.priceInCents
    return s + price * i.quantity
  }, 0)

  // Carrinho no formato da lista de conferência (mesmo papel usado na comanda).
  const conferenciaItems = cart.map(({ product, quantity, variantLabel }) => ({
    name: product.name,
    variantLabel,
    quantity,
    unitPriceInCents: product.isOnPromo && product.discountPriceInCents != null
      ? product.discountPriceInCents : product.priceInCents,
  }))
  const discountCents     = discountMode === 'cents'
    ? Math.min(Math.round(parseFloat(discountValueStr.replace(',', '.') || '0') * 100), subtotal)
    : Math.round(subtotal * discountPct / 100)
  const total             = subtotal - discountCents
  const receivedCents     = Math.round(parseFloat(received.replace(',', '.') || '0') * 100)
  const troco             = receivedCents - total
  const secondAmountCents = splitEnabled ? Math.round(parseFloat(secondAmountStr.replace(',', '.') || '0') * 100) : 0
  const primaryAmountCents = total - secondAmountCents
  const splitValid        = !splitEnabled || (secondAmountCents > 0 && secondAmountCents < total)
  const secondNeedsUser   = splitEnabled && (PAYMENT_NEEDS_USER as readonly string[]).includes(secondPayment)
  const needsUser         = (PAYMENT_NEEDS_USER as readonly string[]).includes(payment) || secondNeedsUser

  // Agrupa os chips de categoria mostrando cada subcategoria logo após sua categoria-pai
  // (só quando o pai também tem produtos, ou seja, também tem chip próprio nessa lista).
  const categories = useMemo(() => {
    const namesInUse = new Set(products.map(p => p.category))
    const byName = new Map(allCategories.map(c => [c.name, c]))
    const parentNameOf = (name: string): string | null => {
      const cat = byName.get(name)
      if (!cat?.parentCategoryId) return null
      const parent = allCategories.find(c => c.id === cat.parentCategoryId)
      return parent && namesInUse.has(parent.name) ? parent.name : null
    }

    const tops = [...namesInUse].filter(n => !parentNameOf(n)).sort()
    const ordered: { name: string; isChild: boolean }[] = []
    for (const top of tops) {
      ordered.push({ name: top, isChild: false })
      const children = [...namesInUse].filter(n => parentNameOf(n) === top).sort()
      for (const child of children) ordered.push({ name: child, isChild: true })
    }
    return ordered
  }, [products, allCategories])
  const filtered = products.filter(p => {
    const matchCat    = !catFilter || p.category === catFilter
    const q           = search.toLowerCase()
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.barcode != null && p.barcode.includes(search))
    return matchCat && matchSearch
  })

  const submitRaw = useCallback(async () => {
    if (cart.length === 0) { toast.error('Adicione pelo menos um produto.'); return }
    if (!splitValid) { toast.error('Valor do segundo pagamento inválido.'); return }
    setSubmitting(true)
    try {
      const { data } = await vendaAvulsaApi.register(
        clientName.trim() || null,
        payment,
        cart.map(i => ({ productId: i.product.id, quantity: i.quantity, variantId: i.variantId })),
        discountMode === 'percent' ? discountPct : 0,
        selectedUserId ?? undefined,
        splitEnabled ? secondPayment : null,
        splitEnabled ? secondAmountCents : 0,
        discountMode === 'cents' ? discountCents : undefined,
        emitirNota,
      )
      onComplete(data)
      toast.success('Venda registrada!')
      handleNotaFiscalResult(data.notaFiscalId, data.notaFiscalStatus, data.notaFiscalMotivoRejeicao)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao registrar venda.')
    } finally { setSubmitting(false) }
  }, [cart, clientName, payment, discountMode, discountPct, discountCents, selectedUserId, onComplete, splitEnabled, secondPayment, secondAmountCents, splitValid, emitirNota])

  const handleSubmit = useThrottle(submitRaw, 2000)

  const STEPS = [
    { n: 1 as const, label: 'Cliente' },
    { n: 2 as const, label: 'Produtos' },
    { n: 3 as const, label: 'Pagamento' },
  ]

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={clsx(
        "bg-surface-800 border border-surface-500 rounded-2xl w-full flex flex-col shadow-2xl animate-fade-in",
        step === 2 ? "max-w-3xl max-h-[92vh]" : "max-w-md max-h-[92vh]"
      )}>

        {/* Header + step indicator */}
        <div className="px-5 pt-4 pb-3 border-b border-surface-500 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2 text-base">
              <ShoppingBag className="w-4 h-4 text-brand-400" /> Nova Venda
            </h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center">
            {STEPS.map(({ n, label }, idx) => (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                    n < step  ? 'bg-accent-green text-black' :
                    n === step ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' :
                    'bg-surface-600 border border-surface-500 text-gray-500'
                  )}>
                    {n < step ? <CheckCircle className="w-3.5 h-3.5" /> : n}
                  </div>
                  <span className={clsx('text-[9px] mt-1 font-medium',
                    n < step   ? 'text-accent-green' :
                    n === step ? 'text-brand-400' : 'text-gray-600'
                  )}>{label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={clsx('flex-1 h-px mx-2 mb-3 transition-colors',
                    n < step ? 'bg-accent-green' : 'bg-surface-600'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div className={clsx("flex-1 p-5 min-h-0", step === 2 ? "overflow-hidden flex flex-col" : "overflow-y-auto")}>

          {/* ── Etapa 1: Cliente ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Busque um cliente cadastrado ou pule para venda balcão.</p>

              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 z-10" />
                <input
                  autoFocus
                  className="input pl-9 text-sm"
                  placeholder="Nome, CPF ou e-mail…"
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setClientName(e.target.value)
                    if (selectedUser) { setSelectedUser(null); setSelectedUserId(null) }
                  }}
                  maxLength={100}
                />
                {clientLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 animate-spin" />
                )}
              </div>

              {selectedUser ? (
                <div className="flex items-center gap-3 bg-brand-600/10 border border-brand-500/30 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 font-bold shrink-0 text-sm">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{selectedUser.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {selectedUser.pointsBalance > 0 && (
                        <span className="text-[10px] text-amber-400">{selectedUser.pointsBalance} pts</span>
                      )}
                      {selectedUser.balanceInCents > 0 && (
                        <span className="text-[10px] text-accent-green">
                          R$ {(selectedUser.balanceInCents / 100).toFixed(2).replace('.', ',')} cashback
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={clearClient} className="text-gray-500 hover:text-red-400 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : clientResults.length > 0 ? (
                <div className="bg-surface-700 border border-surface-500 rounded-xl overflow-hidden">
                  {clientResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => selectClient(u)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-700 transition-colors text-left border-b border-surface-500 last:border-0 text-white"
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-600/20 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-brand-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u.name}</p>
                        {u.cpf && <p className="text-[10px] text-gray-400">{u.cpf}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* ── Etapa 2: Produtos ──────────────────────────────── */}
          {step === 2 && (
            <div className="flex gap-4 flex-1 min-h-0">

              {/* Coluna esquerda — catálogo */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                <input
                  ref={searchRef}
                  className="input text-sm shrink-0"
                  placeholder="Buscar produto, categoria ou código de barras…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filtered.length === 1) {
                      addToCart(filtered[0]); setSearch('')
                    }
                  }}
                />

                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <button
                      onClick={() => setCat(null)}
                      className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        !catFilter
                          ? 'bg-brand-600/20 border-brand-500/60 text-brand-300'
                          : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-400'
                      )}
                    >Todos</button>
                    {categories.map(({ name, isChild }) => (
                      <button
                        key={name}
                        onClick={() => setCat(name === catFilter ? null : name)}
                        className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                          isChild && 'ml-2',
                          catFilter === name
                            ? 'bg-brand-600/20 border-brand-500/60 text-brand-300'
                            : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-surface-400'
                        )}
                      >{isChild && '↳ '}{name}</button>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-500">
                      <PackageOpen className="w-8 h-8" />
                      <p className="text-xs">Nenhum produto encontrado</p>
                    </div>
                  ) : filtered.map(p => {
                    const inCart = cart.find(i => i.product.id === p.id)
                    const price  = p.isOnPromo && p.discountPriceInCents != null ? p.discountPriceInCents : p.priceInCents
                    return (
                      <div
                        key={p.id}
                        className={clsx(
                          'flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all',
                          inCart ? 'border-brand-500/40 bg-brand-600/5' : 'bg-surface-700 border-surface-500 hover:border-surface-500'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          {p.isPreVenda && (
                            <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded mr-1 bg-purple-600 text-white">Pré</span>
                          )}
                          {!p.isPreVenda && p.isOnPromo && (
                            <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded mr-1 bg-red-500 text-white">Promo</span>
                          )}
                          <span className="text-sm text-white font-medium">{p.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-accent-gold text-xs font-bold">{fmt(price / 100)}</span>
                            <span className="text-gray-600 text-[10px]">{p.stockQuantity} un.</span>
                          </div>
                        </div>
                        <button
                          onClick={() => addToCart(p)}
                          disabled={!p.hasVariants && (inCart ? inCart.quantity >= p.stockQuantity : p.stockQuantity === 0)}
                          className={clsx(
                            'shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all',
                            p.hasVariants
                              ? 'bg-violet-600/20 border-violet-500/40 text-violet-300 hover:bg-violet-600/35'
                              : inCart
                              ? 'bg-brand-600/25 border-brand-500/50 text-brand-300 hover:bg-brand-600/40'
                              : 'bg-brand-600/15 border-brand-500/30 text-brand-400 hover:bg-brand-600/25',
                            !p.hasVariants && inCart && inCart.quantity >= p.stockQuantity ? 'opacity-40 cursor-not-allowed' : ''
                          )}
                          title={p.hasVariants ? 'Escolher tamanho/cor' : 'Adicionar'}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Divisor */}
              <div className="w-px bg-surface-600 shrink-0" />

              {/* Coluna direita — carrinho (w-72: com w-52 o nome do produto ficava cortado
                  no meio e pedido grande não dava pra conferir) */}
              <div className="w-72 shrink-0 flex flex-col gap-2 min-h-0">
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    Carrinho {cart.length > 0 && <span className="text-brand-400">({cart.reduce((s, i) => s + i.quantity, 0)})</span>}
                  </p>
                  <ConferenciaButton compact items={conferenciaItems} totalInCents={subtotal}
                    clienteNome={clientName.trim() || null} origem="Venda balcão (PDV)" />
                </div>

                {cart.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-600">
                    <ShoppingBag className="w-8 h-8 opacity-30" />
                    <p className="text-[11px] text-center">Nenhum item<br/>adicionado</p>
                  </div>
                ) : (
                  // Barra de rolagem destacada: a global tem 6px quase invisível no escuro
                  // e o pessoal do balcão não percebia que a lista continuava pra baixo.
                  <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-surface-400 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {cart.map(({ product, quantity, variantLabel, cartKey }) => {
                      const price = product.isOnPromo && product.discountPriceInCents != null
                        ? product.discountPriceInCents : product.priceInCents
                      return (
                        <div key={cartKey} className="bg-surface-700 border border-surface-500 rounded-xl px-2.5 py-2 space-y-1.5">
                          <p className="text-xs text-white font-medium leading-tight break-words">{product.name}</p>
                          {variantLabel && (
                            <p className="text-[10px] text-violet-400 font-medium">{variantLabel}</p>
                          )}
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-accent-gold font-bold font-mono">
                              {fmt(price * quantity / 100)}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => quantity === 1 ? removeFromCart(cartKey) : changeQty(cartKey, -1)}
                                className="w-5 h-5 rounded bg-surface-600 hover:bg-red-600/30 flex items-center justify-center transition-colors"
                              >
                                <Minus className="w-2.5 h-2.5 text-gray-300" />
                              </button>
                              <span className="text-xs font-bold text-white w-4 text-center">{quantity}</span>
                              <button
                                onClick={() => changeQty(cartKey, 1)}
                                className="w-5 h-5 rounded bg-surface-600 hover:bg-brand-600/30 flex items-center justify-center transition-colors disabled:opacity-40"
                              >
                                <Plus className="w-2.5 h-2.5 text-gray-300" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {cart.length > 0 && (
                  <div className="bg-surface-900 rounded-xl px-3 py-2.5 border border-surface-500 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Total</span>
                      <span className="text-accent-gold font-black text-base">{fmt(subtotal / 100)}</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── Etapa 3: Desconto + Pagamento ──────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Resumo do carrinho — nome inteiro (sem cortar) e altura maior: em pedido
                  grande o balconista precisa conferir item a item antes de fechar. */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-gray-500">
                    Itens do pedido <span className="text-gray-400 font-semibold">
                      ({cart.length} produto{cart.length !== 1 ? 's' : ''} / {cart.reduce((s, i) => s + i.quantity, 0)} un.)
                    </span>
                  </p>
                  <ConferenciaButton items={conferenciaItems} totalInCents={subtotal}
                    clienteNome={clientName.trim() || null} origem="Venda balcão (PDV)" />
                </div>
                <div className="bg-surface-700 rounded-xl p-3 space-y-1.5 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-surface-400 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {cart.map(({ product, quantity, variantLabel, cartKey }) => {
                    const price = product.isOnPromo && product.discountPriceInCents != null
                      ? product.discountPriceInCents : product.priceInCents
                    return (
                      <div key={cartKey} className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-300 flex-1 leading-snug">
                          <span className="text-white font-semibold">{quantity}×</span> {product.name}
                          {variantLabel && <span className="text-violet-400 text-xs"> · {variantLabel}</span>}
                        </span>
                        <span className="text-gray-400 font-mono shrink-0">{fmt(price * quantity / 100)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Desconto */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Desconto
                  </p>
                  <div className="flex gap-1 bg-surface-900 rounded-lg p-0.5">
                    {(['percent', 'cents'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setDiscountMode(mode)}
                        className={clsx(
                          'px-2.5 py-1 rounded-md text-[11px] font-bold transition-all',
                          discountMode === mode
                            ? 'bg-accent-green/20 text-accent-green'
                            : 'text-gray-500 hover:text-gray-300'
                        )}
                      >{mode === 'percent' ? '%' : 'R$'}</button>
                    ))}
                  </div>
                </div>

                {discountMode === 'percent' ? (
                  <PercentPicker value={discountPct} onChange={setDiscountPct} />
                ) : (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={discountValueStr}
                    onChange={e => setDiscountValueStr(e.target.value)}
                    className="input text-sm w-full font-mono"
                  />
                )}
              </div>

              {/* Total */}
              <div className="bg-surface-900 rounded-xl px-4 py-3 space-y-1.5">
                {discountCents > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Subtotal</span>
                      <span className="text-gray-400 font-mono">{fmt(subtotal / 100)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-accent-green">
                        Desconto{discountMode === 'percent' ? ` ${discountPct}%` : ''}
                      </span>
                      <span className="text-accent-green font-mono">−{fmt(discountCents / 100)}</span>
                    </div>
                    <div className="h-px bg-surface-600" />
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-white font-semibold">Total</span>
                  <span className="text-2xl font-black text-accent-gold">{fmt(total / 100)}</span>
                </div>
              </div>

              {/* Formas de pagamento */}
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                  {splitEnabled ? 'Pagamento principal (restante)' : 'Forma de pagamento'}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setPayment(m.value)
                        setReceived('')
                        if (splitEnabled && m.value === secondPayment)
                          setSecondPayment(PAYMENT_METHODS.find(p => p.value !== m.value)?.value ?? 'Dinheiro')
                      }}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                        payment === m.value
                          ? m.value === 'Crediario'
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                            : 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                          : 'border-surface-500 text-gray-400 hover:border-surface-400 hover:text-gray-200'
                      )}
                    >
                      {PAYMENT_ICONS[m.value]}
                      <span className="flex-1">{m.label}</span>
                      {splitEnabled && payment === m.value && primaryAmountCents > 0 && (
                        <span className="text-xs font-mono text-white">
                          {fmt(primaryAmountCents / 100)}
                        </span>
                      )}
                      {!splitEnabled && m.value === 'Crediario' && (
                        <span className="text-xs text-amber-400/70 font-normal">acumula no saldo</span>
                      )}
                      {!splitEnabled && m.value === 'Cashback' && selectedUser && selectedUser.balanceInCents > 0 && (
                        <span className="text-xs text-emerald-400/70 font-normal">
                          R$ {(selectedUser.balanceInCents / 100).toFixed(2).replace('.', ',')} disp.
                        </span>
                      )}
                      {!splitEnabled && m.value === 'Pontos' && selectedUser && selectedUser.pointsBalance > 0 && (
                        <span className="text-xs text-amber-400/70 font-normal">
                          {selectedUser.pointsBalance} pts disp.
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Segundo método de pagamento */}
              <div>
                <button
                  type="button"
                  onClick={() => { setSplit(v => !v); setSecondAmountStr('') }}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all',
                    splitEnabled
                      ? 'bg-brand-600/10 border-brand-500/40 text-brand-300'
                      : 'border-surface-500 text-gray-500 hover:border-surface-400 hover:text-gray-300'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    Dividir em dois métodos de pagamento
                  </span>
                  <span className={clsx('w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0',
                    splitEnabled ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-400'
                  )}>
                    {splitEnabled && '✓'}
                  </span>
                </button>

                {splitEnabled && (
                  <div className="mt-2 bg-surface-800 rounded-xl p-3 space-y-3">
                    <p className="text-xs text-gray-400 font-medium">Segundo pagamento</p>
                    <select
                      value={secondPayment}
                      onChange={e => setSecondPayment(e.target.value)}
                      className="input text-sm w-full"
                    >
                      {PAYMENT_METHODS
                        .filter(m => m.value !== payment)
                        .map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))
                      }
                    </select>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Valor (R$)</label>
                      <div className="flex items-center gap-2">
                      <input
                        type="number" min="0.01" step="0.01"
                        className="input text-sm flex-1"
                        placeholder="0,00"
                        value={secondAmountStr}
                        onChange={e => setSecondAmountStr(e.target.value)}
                        autoFocus
                      />
                      {secondAmountCents > 0 && secondAmountCents < total && (
                        <span className="text-xs text-gray-400 shrink-0">
                          resto: <span className="text-white font-mono">{fmt(primaryAmountCents / 100)}</span>
                        </span>
                      )}
                      </div>
                    </div>
                    {secondAmountCents >= total && secondAmountStr !== '' && (
                      <p className="text-xs text-red-400">Valor do segundo pagamento deve ser menor que o total.</p>
                    )}
                    {selectedUser && secondPayment === 'Cashback' && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>Saldo disponível:</span>
                        <span className={clsx('font-bold', selectedUser.balanceInCents > 0 ? 'text-accent-green' : 'text-red-400')}>
                          R$ {(selectedUser.balanceInCents / 100).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    )}
                    {selectedUser && secondPayment === 'Pontos' && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>Pontos disponíveis:</span>
                        <span className={clsx('font-bold', selectedUser.pointsBalance > 0 ? 'text-amber-400' : 'text-red-400')}>
                          {selectedUser.pointsBalance} pts
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {needsUser && !selectedUserId && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-xs text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>
                      {payment === 'Crediario' ? 'Crediário' :
                       (PAYMENT_NEEDS_USER as readonly string[]).includes(payment) ? payment :
                       secondPayment === 'Cashback' ? 'Cashback' : 'Pontos'}
                    </strong> exige cliente cadastrado.
                    Volte e selecione um cliente.
                  </span>
                </div>
              )}

              {selectedUser && (payment === 'Pontos' || payment === 'Cashback') && (
                <div className="bg-surface-700 border border-surface-500 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                  <span className="text-gray-400">Saldo de {selectedUser.name.split(' ')[0]}:</span>
                  {payment === 'Pontos' && (
                    <span className={clsx('font-bold', selectedUser.pointsBalance > 0 ? 'text-amber-400' : 'text-red-400')}>
                      {selectedUser.pointsBalance} pontos
                    </span>
                  )}
                  {payment === 'Cashback' && (
                    <span className={clsx('font-bold', selectedUser.balanceInCents > 0 ? 'text-accent-green' : 'text-red-400')}>
                      R$ {(selectedUser.balanceInCents / 100).toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </div>
              )}

              {payment === 'Dinheiro' && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5" /> Valor recebido (R$)
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    className="input text-sm"
                    placeholder="0,00"
                    value={received}
                    onChange={e => setReceived(e.target.value)}
                    autoFocus
                  />
                  {received && receivedCents >= 0 && (
                    <div className={clsx(
                      'flex justify-between text-sm font-semibold rounded-xl px-3 py-2',
                      troco >= 0 ? 'bg-accent-green/10 text-accent-green' : 'bg-red-500/10 text-red-400'
                    )}>
                      <span>{troco >= 0 ? 'Troco' : 'Falta'}</span>
                      <span className="font-mono">{fmt(Math.abs(troco) / 100)}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={!fiscalModuloAtivo}
                onClick={() => { setEmitirNota(v => !v); setNotaTouched(true) }}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60',
                  emitirNota
                    ? 'bg-brand-600/10 border-brand-500/40 text-brand-300'
                    : 'border-surface-500 text-gray-500 hover:border-surface-400 hover:text-gray-300'
                )}
              >
                <span>Emitir cupom fiscal (NFC-e) agora</span>
                <span className={clsx('w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0',
                  emitirNota ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-400'
                )}>
                  {emitirNota && '✓'}
                </span>
              </button>
              {!fiscalModuloAtivo ? (
                <p className="text-xs text-red-400 -mt-1">Módulo bloqueado por hora</p>
              ) : !emitirNota && (
                <p className="text-xs text-gray-500 -mt-1">
                  Sem nota agora. Depois é possível emitir pelo histórico de vendas.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Rodapé de navegação */}
        <div className="flex gap-2 px-5 py-4 border-t border-surface-500 shrink-0">
          {step === 1 ? (
            <>
              <button onClick={onClose} className="btn-secondary flex-1 justify-center text-sm py-2">Cancelar</button>
              <button onClick={() => setStep(2)} className="btn-primary flex-1 justify-center text-sm">
                {selectedUser || clientName.trim() ? 'Próximo' : 'Pular'} <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : step === 2 ? (
            <>
              <button onClick={() => setStep(1)} className="btn-secondary py-2 px-3">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={cart.length === 0}
                className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
              >
                Próximo <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(2)} className="btn-secondary py-2 px-3">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (needsUser && !selectedUserId) || !splitValid}
                className="btn-success flex-1 justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                  : <><CheckCircle className="w-4 h-4" /> Confirmar venda</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Seletor de variante (tamanho/cor) */}
    {variantPickerProduct && (
      <VariantPicker
        productId={variantPickerProduct.id}
        productName={variantPickerProduct.name}
        onConfirm={variant => {
          addToCart(variantPickerProduct, variant)
          setVariantPickerProduct(null)
        }}
        onClose={() => setVariantPickerProduct(null)}
      />
    )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function VendaAvulsaPage() {
  const { prefs } = usePreferences()
  const [tab, setTab]               = useState<'venda' | 'historico'>('venda')
  const [products, setProducts]     = useState<Product[]>([])
  const [loading, setLoading]       = useState(true)
  const [receipt, setReceipt]       = useState<VendaAvulsaDto | null>(null)
  const [wizardOpen, setWizard]     = useState(false)
  const [todayHistory, setTodayH]   = useState<VendaAvulsaDto[]>([])
  const [history, setHistory]       = useState<VendaAvulsaDto[]>([])
  const [histLoading, setHistLoad]  = useState(false)
  const [histDate, setHistDate]     = useState(() =>
    new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  )

  const todayStr = useMemo(
    () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
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
              {PAYMENT_ICONS[receipt.paymentMethod]} {payLabel}
            </p>
          </div>
          <div className="bg-surface-800 rounded-xl divide-y divide-surface-500 text-left">
            {receipt.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-gray-300">{item.quantity}× {item.productName}</span>
                <span className="text-gray-400 font-mono">{fmt(item.subtotalInReais)}</span>
              </div>
            ))}
            {receipt.discountPercent > 0 && (
              <div className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-accent-green">Desconto ({receipt.discountPercent}%)</span>
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

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-slide-up">

      {wizardOpen && !loading && createPortal(
        <VendaWizard
          products={products}
          defaultDiscount={prefs.pdv.defaultDiscount}
          onComplete={r => { setWizard(false); setReceipt(r); refreshToday() }}
          onClose={() => setWizard(false)}
        />,
        document.body
      )}

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
                disabled={loading}
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
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PAY_COLORS[p.method] ?? '#4B5563' }} />
                        <span className="text-[11px] text-gray-400 w-16 shrink-0 truncate">{p.label}</span>
                        <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: PAY_COLORS[p.method] ?? '#4B5563' }} />
                        </div>
                        <span className="text-[10px] font-semibold w-6 text-right shrink-0" style={{ color: PAY_COLORS[p.method] ?? '#4B5563' }}>{p.pct}%</span>
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
              <button onClick={() => setWizard(true)} className="btn-primary mt-2">
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
                        {v.discountPercent > 0 && (
                          <p className="text-[10px] text-accent-green">−{v.discountPercent}%</p>
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

      {/* Mobile FAB — Começar Venda */}
      {tab === 'venda' && (
        <button
          onClick={() => setWizard(true)}
          disabled={loading}
          className="md:hidden fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-500 active:scale-95 flex items-center justify-center shadow-xl shadow-brand-600/40 disabled:opacity-50 transition-all"
          aria-label="Começar venda"
        >
          <Plus className="w-6 h-6 text-white" />
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
  const today    = new Date().toISOString().slice(0, 10)
  const isToday  = date === today

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
            onClick={() => {
              const d = new Date(date + 'T12:00:00')
              d.setDate(d.getDate() - 1)
              onDateChange(d.toISOString().slice(0, 10))
            }}
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
              const d = new Date(date + 'T12:00:00')
              d.setDate(d.getDate() + 1)
              const next = d.toISOString().slice(0, 10)
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
                          {PAYMENT_ICONS[v.paymentMethod]}
                          {payLabel}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-accent-gold font-bold">{fmt(v.totalInReais)}</p>
                        {v.discountPercent > 0 && (
                          <p className="text-xs text-accent-green">−{v.discountPercent}% desc.</p>
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
