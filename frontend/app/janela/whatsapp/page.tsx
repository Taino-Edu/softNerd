'use client'

import WhatsAppInbox from '@/components/admin/whatsapp/WhatsAppInbox'

/**
 * Janela destacada do atendimento.
 *
 * Mora fora de /admin de propósito: o admin/layout.tsx carrega sidebar, widget de
 * IA, overlay de atalhos e o próprio painel flutuante de WhatsApp. Abrindo
 * /admin/whatsapp num popup, a janela vinha com o painel inteiro dentro e um
 * segundo WhatsApp flutuando por cima da tela de WhatsApp.
 *
 * A coluna de pontos/pedidos fica de fora: no tamanho de popup (1180px) as três
 * colunas espremem o texto da conversa. Ela continua no /admin/whatsapp cheio.
 */
export default function JanelaWhatsAppPage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-surface-900">
      <WhatsAppInbox fillWindow hideCustomerPanel />
    </main>
  )
}
