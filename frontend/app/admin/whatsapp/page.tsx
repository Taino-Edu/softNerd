'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ExternalLink, Loader2, MessageCircle, QrCode, X } from 'lucide-react'
import toast from 'react-hot-toast'
import WhatsAppInbox from '@/components/admin/whatsapp/WhatsAppInbox'
import { PageHeader } from '@/components/ui/PageHeader'
import { whatsappAdminApi } from '@/lib/api'

export default function WhatsAppPage() {
  const [loadingQr, setLoadingQr] = useState(false)
  const [qr, setQr] = useState<{ base64?: string; pairingCode?: string } | null>(null)

  async function loadQr() {
    setLoadingQr(true)
    try {
      const { data } = await whatsappAdminApi.qrCode()
      setQr(data)
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'A Evolution API ainda não está disponível.')
    } finally { setLoadingQr(false) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="WhatsApp"
        subtitle="Bot, atendimento humano e dados reais da loja na mesma conversa."
        actions={<>
          <button onClick={loadQr} className="btn-secondary flex items-center gap-2" disabled={loadingQr}>
            {loadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Conectar número
          </button>
          <button onClick={() => window.open('/admin/whatsapp', 'softnerd-whatsapp', 'popup,width=1180,height=760,resizable=yes')}
            className="btn-primary flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Abrir em janela
          </button>
        </>}
      />

      <WhatsAppInbox />

      {qr && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={() => setQr(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface-800 border border-surface-500 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><MessageCircle className="text-emerald-400" /><h2 className="font-bold text-white">Conectar WhatsApp</h2></div>
              <button onClick={() => setQr(null)} className="p-2 text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            {qr.base64 && <Image src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`}
              alt="QR Code para conectar o WhatsApp" width={360} height={360} unoptimized
              className="w-full rounded-xl bg-white p-3" />}
            {qr.pairingCode && <div className="rounded-xl bg-surface-900 border border-surface-500 p-4 text-center font-mono text-2xl text-white tracking-widest">{qr.pairingCode}</div>}
            <p className="text-xs text-gray-400 mt-4">No celular do Maikon: WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
          </div>
        </div>
      )}
    </div>
  )
}
