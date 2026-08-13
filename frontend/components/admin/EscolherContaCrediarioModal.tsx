'use client'
import { useState } from 'react'
import { CreditCard, X, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { CrediariosDto } from '@/lib/api'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Escolha da conta de crediário quando o cliente já tem conta aberta: acumular
 * numa existente (sem renovar o prazo dela) ou abrir conta nova com vencimento
 * próprio. Usado no fechamento de comanda e na venda do PDV — antes o PDV
 * grudava tudo na primeira conta aberta sem perguntar.
 */
export default function EscolherContaCrediarioModal({
  userName,
  contasAbertas,
  valorNovo,
  onEscolher,
  onNova,
  onCancel,
}: {
  userName:      string
  contasAbertas: CrediariosDto[]
  valorNovo:     number
  onEscolher:    (crediarioId: string) => void
  /** dataVencimento no formato YYYY-MM-DD; undefined = 30 dias (padrão). */
  onNova:        (dataVencimento?: string) => void
  onCancel:      () => void
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null)

  // Vencimento da conta nova: o Maikon precisa casar o prazo com a chegada do produto
  // (pré-venda que chega dia 16 não pode virar dívida vencida no dia 11).
  const trintaDias = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  const [vencimento, setVencimento] = useState(trintaDias)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-surface-500">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" /> Conta de Crediário
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {userName} já tem {contasAbertas.length} conta{contasAbertas.length > 1 ? 's' : ''} em aberto
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Adicionar a uma conta existente</p>

          {contasAbertas.map(c => {
            const sel = escolhido === c.id
            return (
              <button
                key={c.id}
                onClick={() => setEscolhido(sel ? null : c.id)}
                className={clsx(
                  'w-full text-left rounded-xl border px-4 py-3 transition-all',
                  sel
                    ? 'border-amber-400 bg-amber-400/10'
                    : 'border-surface-500 bg-surface-700 hover:border-surface-400'
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-white">
                    Saldo em aberto: <span className="text-accent-gold">{fmt(c.saldoRestanteEmReais)}</span>
                    {c.vencido && <span className="ml-2 text-[10px] text-red-400 font-semibold">[VENCIDO]</span>}
                  </span>
                  <span className={clsx('w-4 h-4 rounded-full border-2 shrink-0',
                    sel ? 'border-amber-400 bg-amber-400' : 'border-gray-500'
                  )} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Vence {new Date(c.dataVencimento).toLocaleDateString('pt-BR')} ·{' '}
                  {c.observacao ?? 'Sem observação'}
                </p>
                {sel && (
                  <p className="text-xs text-amber-300 mt-1">
                    Novo total: {fmt(c.saldoRestanteEmReais + valorNovo / 100)}
                  </p>
                )}
              </button>
            )
          })}

          <div className="border-t border-surface-500 pt-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">Ou criar conta nova</p>
            <button
              onClick={() => setEscolhido('__nova__')}
              className={clsx(
                'w-full text-left rounded-xl border px-4 py-3 transition-all',
                escolhido === '__nova__'
                  ? 'border-brand-400 bg-brand-400/10'
                  : 'border-surface-500 bg-surface-700 hover:border-surface-400'
              )}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-white">Nova conta — prazo 30 dias</span>
                <span className={clsx('w-4 h-4 rounded-full border-2 shrink-0',
                  escolhido === '__nova__' ? 'border-brand-400 bg-brand-400' : 'border-gray-500'
                )} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Dívida independente com vencimento próprio</p>
            </button>

            {escolhido === '__nova__' && (
              <div className="mt-2 pl-1">
                <label className="text-xs text-gray-400 font-semibold block mb-1">Vence em</label>
                <input
                  type="date"
                  value={vencimento}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setVencimento(e.target.value)}
                  className="input text-sm w-full"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  A cobrança e os avisos usam esta data. Padrão: 30 dias.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!escolhido) return
              if (escolhido === '__nova__') onNova(vencimento || undefined)
              else onEscolher(escolhido)
            }}
            disabled={!escolhido}
            className="btn-primary flex-1 justify-center"
          >
            <CheckCircle className="w-4 h-4" /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

