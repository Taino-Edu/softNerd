'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2, X, QrCode, Copy, CheckCircle, AlertTriangle } from 'lucide-react'
import { PixCobrancaDto } from '@/lib/api'
import { brl as fmt } from '@/lib/format'


interface CobrancaPixModalProps {
  clienteNome: string
  gerar: () => Promise<{ data: PixCobrancaDto }>
  verificar: (txid: string) => Promise<{ data: { status: string } }>
  onClose: () => void
  onSuccess: () => void
}

/// Modal genérico de cobrança Pix — usado tanto pra Crediário quanto pra Comanda.
/// O chamador só precisa passar as funções de API certas pra origem (gerar/verificar).
export function CobrancaPixModal({ clienteNome, gerar, verificar, onClose, onSuccess }: CobrancaPixModalProps) {
  const [gerando, setGerando]         = useState(true)
  const [pix, setPix]                 = useState<PixCobrancaDto | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [erro, setErro]               = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await gerar()
        setPix(data)
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: unknown }; message?: string }
        const d = e?.response?.data
        const fromObj = typeof d === 'object' && d !== null
          ? ((d as Record<string, unknown>).message as string | undefined) ||
            ((d as Record<string, unknown>).Message as string | undefined) ||
            ((d as Record<string, unknown>).title  as string | undefined) ||
            null
          : null
        const msg = fromObj || (typeof d === 'string' && d ? d : null) || e?.message || 'Erro ao gerar cobrança Pix'
        setErro(e?.response?.status ? `[${e.response.status}] ${msg}` : msg)
      } finally {
        setGerando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copiar() {
    if (!pix?.pixCopiaCola) return
    await navigator.clipboard.writeText(pix.pixCopiaCola)
    toast.success('Código copiado!')
  }

  async function verificarPagamento(silencioso = false) {
    if (!pix) return
    if (!silencioso) setVerificando(true)
    try {
      const { data } = await verificar(pix.txId)
      if (data.status === 'CONCLUIDA') {
        toast.success('Pagamento confirmado!')
        onSuccess()
        onClose()
      } else if (!silencioso) {
        toast('Ainda não identificamos o pagamento.', { icon: '⏳' })
      }
    } catch (err: unknown) {
      if (!silencioso) {
        const e = err as { response?: { data?: { message?: string; Message?: string } } }
        toast.error(e?.response?.data?.message ?? e?.response?.data?.Message ?? 'Erro ao verificar pagamento')
      }
    } finally {
      if (!silencioso) setVerificando(false)
    }
  }

  // Verificação automática enquanto o modal está aberto — o admin não precisa
  // ficar clicando: quando o Pix cai, confirma e fecha sozinho.
  useEffect(() => {
    if (!pix) return
    const id = setInterval(() => verificarPagamento(true), 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-brand-400" /> Cobrança Pix
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{clienteNome}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {gerando ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Gerando cobrança no Inter...</p>
            </div>
          ) : erro ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-red-400">{erro}</p>
            </div>
          ) : pix ? (
            <>
              <div className="bg-surface-700 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-gray-400">Valor da cobrança</p>
                <p className="text-2xl font-bold text-accent-gold">{fmt(pix.valorEmReais)}</p>
              </div>

              {pix.imagemQrCode ? (
                <div className="flex justify-center bg-white rounded-xl p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pix.imagemQrCode} alt="QR Code Pix" className="w-48 h-48" />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-400 bg-surface-700 rounded-xl border border-surface-500/50">
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>QR Code indisponível — use o Pix Copia e Cola abaixo</span>
                </div>
              )}

              <div>
                <label className="label">Pix Copia e Cola</label>
                <textarea
                  readOnly
                  value={pix.pixCopiaCola ?? ''}
                  rows={3}
                  className="input w-full text-xs font-mono resize-none"
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={copiar}
                  className="btn-secondary w-full justify-center mt-2 text-sm"
                >
                  <Copy className="w-4 h-4" /> Copiar código
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                {pix.imagemQrCode
                  ? 'O cliente pode escanear o QR Code, colar o código no app do banco — ou pagar direto pela comanda no celular dele.'
                  : 'O cliente pode colar o código no app do banco — ou pagar direto pela comanda no celular dele.'}
                {' '}A confirmação é automática enquanto esta janela estiver aberta.
              </p>
            </>
          ) : null}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
            Fechar
          </button>
          <button
            type="button"
            onClick={() => verificarPagamento()}
            disabled={!pix || verificando}
            className="btn-success flex-1 justify-center"
          >
            {verificando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
              : <><CheckCircle className="w-4 h-4" /> Verificar pagamento</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
