'use client'

import { useCallback, useEffect, useState } from 'react'
import { reservationApi, ReservationPixStatus } from '@/lib/api'
import { QrCode, Copy, RefreshCw, Loader2, X, CheckCircle, MessageCircle } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

/** Modal de pagamento Pix de um grupo de pré-venda.
 * Usado no perfil do cliente (pagar) e no admin (gerar/copiar o código pra mandar
 * no WhatsApp). Reutiliza a cobrança ATIVA existente; gera uma nova se não houver.
 * Com `clienteWhatsApp` (admin), mostra botão que abre o wa.me com a mensagem pronta. */
export default function PixReservaModal({ groupId, dark = false, clienteWhatsApp, onClose, onPago }: {
  groupId: string
  dark?: boolean
  /** WhatsApp do cliente (admin) — habilita o botão "Enviar no WhatsApp" com o código pronto. */
  clienteWhatsApp?: string | null
  onClose: () => void
  onPago?: () => void
}) {
  const [pix,       setPix]       = useState<ReservationPixStatus | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [verifying, setVerifying] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await reservationApi.getPix(groupId)
      if (data.hasPix && (data.status === 'CONCLUIDA' || (data.status === 'ATIVA' && data.pixCopiaCola))) {
        setPix(data)
      } else {
        const r = await reservationApi.gerarPix(groupId)
        setPix({ hasPix: true, ...r.data })
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string; Message?: string } } })?.response?.data
      toast.error(msg?.message ?? msg?.Message ?? 'Pix indisponível no momento — pague na retirada.')
      onClose()
    } finally { setLoading(false) }
  }, [groupId, onClose])

  useEffect(() => { carregar() }, [carregar])

  async function verificar() {
    setVerifying(true)
    try {
      const { data } = await reservationApi.verificarPix(groupId)
      setPix(prev => prev ? { ...prev, status: data.status, pagoEm: data.pagoEm } : prev)
      if (data.status === 'CONCLUIDA') {
        toast.success('Pagamento confirmado!')
        onPago?.()
      } else {
        toast('Ainda não identificamos o pagamento. Tenta de novo em alguns segundos.')
      }
    } catch { toast.error('Erro ao verificar pagamento.') }
    finally { setVerifying(false) }
  }

  function copiar() {
    if (!pix?.pixCopiaCola) return
    navigator.clipboard.writeText(pix.pixCopiaCola)
    toast.success('Código Pix copiado!')
  }

  // Link wa.me com a mensagem pronta (valor + copia-e-cola) — fluxo "pedido pelo zap".
  const waLink = (() => {
    if (!clienteWhatsApp || !pix?.pixCopiaCola) return null
    const digits = clienteWhatsApp.replace(/\D/g, '')
    if (digits.length < 10) return null
    const fone = digits.startsWith('55') ? digits : `55${digits}`
    const valor = pix.valorEmReais !== undefined ? `R$ ${pix.valorEmReais.toFixed(2).replace('.', ',')}` : ''
    const msg = `Olá! Segue o Pix da sua pré-venda no Santuário Nerd:\n\nValor: ${valor}\n\nCódigo copia-e-cola:\n${pix.pixCopiaCola}\n\nQualquer dúvida é só chamar!`
    return `https://wa.me/${fone}?text=${encodeURIComponent(msg)}`
  })()

  const pago = pix?.status === 'CONCLUIDA'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className={clsx('w-full max-w-sm rounded-2xl p-6 space-y-4 border',
        dark ? 'bg-surface-800 border-surface-500' : 'bg-white border-gray-100 shadow-xl')}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className={clsx('text-lg font-black flex items-center gap-2', dark ? 'text-white' : 'text-gray-900')}>
            <QrCode className="w-5 h-5" style={{ color: '#7C3AED' }} /> Pagamento via Pix
          </h2>
          <button onClick={onClose} className={clsx('p-1.5 rounded-lg transition-colors',
            dark ? 'hover:bg-surface-500 text-gray-400' : 'text-gray-400 hover:text-gray-600')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#7C3AED' }} />
          </div>
        ) : pago ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
            <p className={clsx('font-black', dark ? 'text-white' : 'text-gray-900')}>Pago ✅</p>
            <p className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>
              Pré-venda quitada — agora é só aguardar a retirada.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pix?.imagemQrCode && (
              <img src={pix.imagemQrCode} alt="QR Code Pix"
                className={clsx('w-44 h-44 mx-auto rounded-xl border', dark ? 'border-surface-500' : 'border-gray-200')} />
            )}
            {pix?.pixCopiaCola && (
              <button onClick={copiar}
                className={clsx('w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-colors',
                  dark ? 'border-surface-500 text-gray-300 hover:bg-surface-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                <Copy className="w-3.5 h-3.5" /> Copiar código Pix
              </button>
            )}
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors"
                style={{ backgroundColor: '#25D366', color: '#fff' }}>
                <MessageCircle className="w-3.5 h-3.5" /> Enviar no WhatsApp do cliente
              </a>
            )}
            {pix?.valorEmReais !== undefined && (
              <p className={clsx('text-center text-lg font-black', dark ? 'text-white' : 'text-gray-900')}>
                R$ {pix.valorEmReais.toFixed(2).replace('.', ',')}
              </p>
            )}
            <p className={clsx('text-center text-xs', dark ? 'text-gray-500' : 'text-gray-400')}>
              Aguardando pagamento...
            </p>
            <button onClick={verificar} disabled={verifying}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-60"
              style={{ borderColor: '#7C3AED', color: '#7C3AED' }}>
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Já paguei, verificar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
