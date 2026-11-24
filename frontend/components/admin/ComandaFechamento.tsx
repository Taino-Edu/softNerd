'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { CheckCircle, ChevronLeft, ClipboardList, CreditCard, QrCode } from 'lucide-react'
import { COMANDA_PAYMENT_METHODS, PAYMENT_METHODS, SECOND_PAYMENT_METHODS, type ComandaDto } from '@/lib/api'
import { brl } from '@/lib/format'
import { rotuloCurtoPagamento } from '@/lib/pagamentos'
import { useRascunho } from '@/lib/useRascunho'
import { useDispensarModal } from '@/lib/useDispensarModal'
import { PagamentoIcone } from '@/components/PagamentoIcone'
import PercentPicker from '@/components/admin/PercentPicker'
import { Switch } from '@/components/ui/Switch'
import ComandaResumo from './ComandaResumo'
import { CabecalhoPdv, RODAPE_PDV } from './PdvProdutos'
import { useMarcarRodapeFixo } from '@/lib/rodapeFixo'

function MolduraFechamento({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  const fundo = useDispensarModal(onCancel)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" {...fundo}>
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-sm max-h-[90vh] flex flex-col">{children}</div>
    </div>
  )
}

// ── Modal: selecionar pagamento ao fechar comanda ────────────────────────────

export default function ComandaFechamento({
  comanda, onConfirm, onCancel, onGerarPix, onItens,
}: {
  comanda:   ComandaDto
  onItens?: () => void
  onConfirm: (paymentMethod: string, secondMethod?: string, secondAmountInCents?: number, discountInCents?: number) => void | Promise<void>
  onCancel:  () => void
  onGerarPix: (discountInCents: number) => void
}) {
  // Pagamento, divisão e desconto ficam guardados por comanda (lib/useRascunho): dá pra
  // fechar o modal por engano e voltar sem perder o que já estava marcado.
  const rascunho = `fechar:${comanda.id}:`
  const responsivo = Boolean(onItens)
  // Tela nova (chave "comanda-telas"): Pix já marcado e as formas na mesma ordem da Nova venda do PDV
  // (pedido do Taino, 24/11). A janela antiga continua com Dinheiro primeiro.
  const formas = responsivo ? PAYMENT_METHODS : COMANDA_PAYMENT_METHODS
  const [method,        setMethod]        = useRascunho(rascunho + 'method', formas[0].value)
  const [splitEnabled,  setSplitEnabled]  = useRascunho(rascunho + 'split', false)
  const [secondMethod,  setSecondMethod]  = useRascunho(rascunho + 'method2', 'Cashback')
  const [secondAmtStr,  setSecondAmtStr]  = useRascunho(rascunho + 'valor2', '')
  // Comanda só guarda desconto em centavos no banco (sem campo de percentual) — o
  // percentual é resolvido aqui no front antes de mandar, mesmo padrão do Venda Avulsa.
  const [discountMode,  setDiscountMode]  = useRascunho<'percent' | 'cents'>(rascunho + 'descModo', 'percent')
  const [discountPct,   setDiscountPct]   = useRascunho(rascunho + 'descPct', 0)
  const [descontoStr,   setDescontoStr]   = useRascunho(rascunho + 'descValor', '')
  const [enviando, setEnviando] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  useMarcarRodapeFixo(responsivo)

  useEffect(() => {
    if (responsivo) titulo.current?.focus()
  }, [responsivo])

  const totalAntesDesconto = comanda.totalInReais - comanda.pointsApplied / 100
  const totalAntesDescontoCents = Math.round(totalAntesDesconto * 100)
  const descontoCents  = Math.min(
    discountMode === 'percent'
      ? Math.round(totalAntesDescontoCents * discountPct / 100)
      : Math.round(parseFloat(descontoStr.replace(',', '.') || '0') * 100),
    totalAntesDescontoCents,
  )
  const totalRestante  = totalAntesDesconto - descontoCents / 100
  const saldoCashback  = comanda.userBalanceInCents / 100
  const saldoPontos    = comanda.userPointsBalance

  const secondAmtCents = splitEnabled ? Math.round(parseFloat(secondAmtStr || '0') * 100) : 0
  const primaryAmtCents = Math.round(totalRestante * 100) - secondAmtCents
  const primaryAmtReais = primaryAmtCents / 100

  // Validações
  const semSaldoCashback = method === 'Cashback' && !splitEnabled && saldoCashback < totalRestante
  const semSaldoPontos   = method === 'Pontos'   && !splitEnabled && saldoPontos < Math.round(totalRestante * 100)
  const splitInvalido    = splitEnabled && (secondAmtCents <= 0 || secondAmtCents >= Math.round(totalRestante * 100))
  const splitSemCashback = splitEnabled && secondMethod === 'Cashback' && secondAmtCents > comanda.userBalanceInCents
  const splitSemPontos   = splitEnabled && secondMethod === 'Pontos'   && secondAmtCents > saldoPontos
  const bloqueado = semSaldoCashback || semSaldoPontos || splitInvalido || splitSemCashback || splitSemPontos

  async function handleConfirm() {
    if (enviando || bloqueado) return
    setEnviando(true)
    try {
      if (splitEnabled && secondAmtCents > 0)
        await onConfirm(method, secondMethod, secondAmtCents, descontoCents)
      else
        await onConfirm(method, undefined, undefined, descontoCents)
    } finally {
      setEnviando(false)
    }
  }

  const desconto = (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Desconto</p>
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
              value={descontoStr}
              onChange={e => setDescontoStr(e.target.value)}
              className="input text-sm w-full font-mono"
            />
          )}

          {descontoCents > 0 && (
            <p className="text-xs text-accent-green mt-1">
              Total após desconto: {brl(totalRestante)}
            </p>
          )}
        </div>
  )

  const pagamento = (
    <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
            {splitEnabled ? 'Pagamento principal (restante)' : 'Forma de pagamento'}
          </p>
          <div className={clsx('grid gap-2', responsivo && 'sm:grid-cols-2')}>
            {formas.map(pm => (
              <button
                key={pm.value}
                aria-pressed={method === pm.value}
                onClick={() => setMethod(pm.value)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left',
                  method === pm.value
                    ? pm.value === 'Crediario'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                      : 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'border-surface-500 text-gray-400 hover:border-surface-400 hover:text-gray-200'
                )}
              >
                <PagamentoIcone forma={pm.value} />
                <span className="flex-1">{pm.label}</span>
                {splitEnabled && method === pm.value && (
                  <span className="text-xs font-mono text-white">
                    {primaryAmtReais > 0 ? brl(primaryAmtReais) : 'R$ —'}
                  </span>
                )}
                {!splitEnabled && pm.value === 'Crediario' && (
                  <span className="text-xs text-amber-400/70 font-normal">acumula no saldo</span>
                )}
                {!splitEnabled && pm.value === 'Cashback' && saldoCashback > 0 && (
                  <span className="text-xs text-emerald-400/70 font-normal">
                    {brl(saldoCashback)} disp.
                  </span>
                )}
                {!splitEnabled && pm.value === 'Pontos' && saldoPontos > 0 && (
                  <span className="text-xs text-amber-400/70 font-normal">
                    {saldoPontos} pts disp.
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {responsivo ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm font-semibold">
            <span>Dividir pagamento</span>
            <Switch ligado={splitEnabled} onChange={valor => { setSplitEnabled(valor); setSecondAmtStr('') }} label="Dividir pagamento" />
          </div>
        ) : (
        <button
          onClick={() => { setSplitEnabled(v => !v); setSecondAmtStr('') }}
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

        )}

        {/* Segundo pagamento */}
        {splitEnabled && (
          <div className="bg-surface-800 rounded-xl p-3 space-y-3">
            <p className="text-xs text-gray-400 font-medium">Segundo pagamento</p>
            <select
              value={secondMethod}
              onChange={e => setSecondMethod(e.target.value)}
              className="input text-sm w-full"
            >
              {SECOND_PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor (R$)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={(totalRestante - 0.01).toFixed(2)}
                placeholder="0,00"
                value={secondAmtStr}
                onChange={e => setSecondAmtStr(e.target.value)}
                className="input text-sm w-full font-mono"
              />
              {secondMethod === 'Cashback' && saldoCashback > 0 && (
                <button
                  type="button"
                  onClick={() => setSecondAmtStr(Math.min(saldoCashback, totalRestante - 0.01).toFixed(2))}
                  className="mt-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Usar tudo ({brl(saldoCashback)})
                </button>
              )}
              {secondMethod === 'Pontos' && saldoPontos > 0 && (
                <button
                  type="button"
                  onClick={() => setSecondAmtStr((Math.min(saldoPontos, Math.round(totalRestante * 100) - 1) / 100).toFixed(2))}
                  className="mt-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Usar tudo ({saldoPontos} pts = {brl((saldoPontos / 100))})
                </button>
              )}
            </div>
            {secondAmtCents > 0 && primaryAmtCents > 0 && !splitInvalido && (
              <div className="text-xs text-gray-400 pt-1 border-t border-surface-500 space-y-1">
                <div className="flex justify-between">
                  <span>{SECOND_PAYMENT_METHODS.find(m => m.value === secondMethod)?.label}:</span>
                  <span className="text-white font-mono">{brl((secondAmtCents / 100))}</span>
                </div>
                <div className="flex justify-between">
                  <span>{formas.find(m => m.value === method)?.label ?? method}:</span>
                  <span className="text-white font-mono">{brl((primaryAmtCents / 100))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {method === 'Crediario' && !splitEnabled && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
            O valor será acumulado no saldo devedor do cliente. Novas comandas podem ser abertas normalmente.
          </div>
        )}
        {method === 'Crediario' && splitEnabled && secondAmtCents > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
            {brl((primaryAmtCents / 100))} irá para o crediário. O restante já foi quitado.
          </div>
        )}
        {semSaldoCashback && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Saldo insuficiente. Cliente tem {brl(saldoCashback)} mas a comanda custa {brl(totalRestante)}.
          </div>
        )}
        {semSaldoPontos && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Pontos insuficientes. Cliente tem {saldoPontos} pts mas a comanda requer {Math.round(totalRestante * 100)} pts.
          </div>
        )}
        {splitSemCashback && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Cashback insuficiente. Cliente tem {brl(saldoCashback)} mas foi solicitado {brl((secondAmtCents / 100))}.
          </div>
        )}
        {splitSemPontos && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            Pontos insuficientes para o segundo pagamento. Cliente tem {saldoPontos} pts, solicitado {secondAmtCents} pts.
          </div>
        )}
        {splitEnabled && splitInvalido && secondAmtStr !== '' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            O segundo valor deve ser maior que zero e menor que o total ({brl(totalRestante)}).
          </div>
        )}

        {method === 'Pix' && !splitEnabled && (
          <p className="text-xs text-gray-500 -mt-1">
            Cliente já pagou por fora? Use "Confirmar" direto. Pra gerar um QR Code de cobrança, use "Gerar QR Pix".
          </p>
        )}
    </div>
  )

  const acoes = (
       <div className="shrink-0 border-t border-surface-500 p-4">
        {method === 'Pix' && !splitEnabled ? (
          <div className="space-y-2">
            <button
              disabled={enviando}
              onClick={() => onGerarPix(descontoCents)}
              className="btn-success w-full justify-center"
            >
              <QrCode className="w-4 h-4" /> Gerar QR Pix
            </button>
            <div className="flex gap-3">
              <button onClick={onCancel} disabled={enviando} className="btn-secondary flex-1 justify-center">Voltar</button>
              <button
                onClick={handleConfirm}
                disabled={bloqueado || enviando}
                className="btn-secondary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4" /> Confirmar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={enviando} className="btn-secondary justify-center shrink-0">Voltar</button>
            <button
              onClick={handleConfirm}
              disabled={bloqueado || enviando}
              className="btn-success flex-1 justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-4 h-4" /> {enviando ? 'Fechando…' : `Confirmar · ${rotuloCurtoPagamento(method)}`}
            </button>
          </div>
        )}
       </div>
  )

  if (onItens) {
    // Mesma tela da etapa de pagamento do PDV (PdvVenda): cabeçalho com etapas, duas colunas e rodapé preso no pé.
    const pixDireto = method === 'Pix' && !splitEnabled
    return (
      <section aria-label="Fechamento da comanda" className="min-w-0 rounded-xl border bg-[var(--bg-card)]">
        <CabecalhoPdv titulo="Fechar comanda" tituloRef={titulo} sair={onCancel} rotuloSair="Voltar às comandas" desabilitado={enviando}
          subtitulo={`${comanda.userName}${comanda.tableIdentifier ? ` · Mesa ${comanda.tableIdentifier}` : ''}`}
          icone={<ClipboardList aria-hidden="true" className="h-5 w-5 text-brand-400" />}
          etapas={['Itens', 'Fechamento']} etapa={2} />
        <fieldset disabled={enviando} className="grid min-w-0 items-start gap-4 p-3 sm:p-5 xl:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <ComandaResumo comanda={comanda} desconto={descontoCents} />
            <section aria-label="Desconto da comanda">{desconto}</section>
          </div>
          <section aria-label="Pagamento da comanda" className="min-w-0">{pagamento}</section>
        </fieldset>
        <div className={RODAPE_PDV}>
          <button onClick={onItens} disabled={enviando} aria-label="Voltar aos itens" className="btn-secondary py-2 px-3 disabled:opacity-50">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Itens
          </button>
          {pixDireto && (
            <button onClick={handleConfirm} disabled={bloqueado || enviando}
              className="btn-secondary justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed max-sm:flex-1">
              <CheckCircle aria-hidden="true" className="h-4 w-4" /> Confirmar
            </button>
          )}
          <button
            onClick={pixDireto ? () => onGerarPix(descontoCents) : handleConfirm}
            disabled={enviando || (!pixDireto && bloqueado)}
            // Com Pix são três botões: no celular o "Gerar QR Pix" ganha a linha de cima inteira (não quebra o texto).
            className={clsx('btn-success flex-1 justify-center whitespace-nowrap text-sm disabled:opacity-50 disabled:cursor-not-allowed',
              pixDireto && 'max-sm:order-first max-sm:basis-full')}
          >
            {pixDireto
              ? <><QrCode aria-hidden="true" className="h-4 w-4" /> Gerar QR Pix</>
              : <><CheckCircle aria-hidden="true" className="h-4 w-4" /> {enviando ? 'Fechando…' : `Confirmar · ${rotuloCurtoPagamento(method)}`}</>}
          </button>
        </div>
      </section>
    )
  }

  // FALLBACK da chave "comanda-telas"
  return (
    <MolduraFechamento onCancel={onCancel}>
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-white text-lg">Fechar comanda</h3>
          <p className="text-gray-400 text-sm mt-1">
            {comanda.userName} · <span className="text-accent-gold font-bold">{`${brl(totalRestante)}`}</span>
          </p>
          {(saldoPontos > 0 || saldoCashback > 0) && (
            <div className="flex gap-3 mt-2">
              {saldoPontos > 0 && (
                <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                  {saldoPontos} pts
                </span>
              )}
              {saldoCashback > 0 && (
                <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                  {brl(saldoCashback)} cashback
                </span>
              )}
            </div>
          )}
        </div>
        {desconto}
        {pagamento}
      </div>
      {acoes}
    </MolduraFechamento>
  )
}
