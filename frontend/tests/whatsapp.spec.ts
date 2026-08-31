import { expect, test } from '@playwright/test'

test('caixa do WhatsApp renderiza conversas e mensagens', async ({ context, page }) => {
  await context.addCookies([
    { name: 'userRole', value: 'Admin', url: 'http://localhost:3011' },
    { name: 'userName', value: 'Maikon', url: 'http://localhost:3011' },
    { name: 'userId', value: '11111111-1111-1111-1111-111111111111', url: 'http://localhost:3011' },
  ])

  await page.route('**/api/admin/whatsapp/status', route => route.fulfill({
    json: { configured: true, connected: true, state: 'open' },
  }))
  await page.route('**/api/admin/whatsapp/conversations?**', route => route.fulfill({ json: [{
    phone: '17999990000', displayName: 'Cliente Teste', userId: '1', pointsBalance: 42,
    activeReservations: 2, lastMessage: 'Quero saber das minhas reservas',
    lastMessageAt: new Date().toISOString(), unreadCount: 2, humanMode: false,
  }] }))
  await page.route('**/api/admin/whatsapp/conversations/*/messages', route => route.fulfill({ json: [
    { id: '1', direction: 'inbound', author: 'customer', text: 'Oi, quero saber das minhas reservas', sentAt: new Date(Date.now() - 60_000).toISOString(), status: 'processed' },
    { id: '2', direction: 'outbound', author: 'bot', text: 'Encontrei 2 reservas. Digite PIX para gerar a cobrança.', sentAt: new Date().toISOString(), status: 'processed' },
  ] }))
  await page.route('**/api/admin/whatsapp/conversations/*/read', route => route.fulfill({ status: 204 }))
  await page.route('**/api/notifications/unread-count', route => route.fulfill({ json: { count: 0 } }))
  await page.route('**/api/integrations/fiscal/config', route => route.fulfill({ json: { certificadoConfigurado: false } }))

  await page.goto('http://localhost:3011/admin/whatsapp')

  await expect(page.getByRole('heading', { name: 'WhatsApp' })).toBeVisible()
  await expect(page.getByText('Cliente Teste', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Encontrei 2 reservas. Digite PIX para gerar a cobrança.')).toBeVisible()
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0)
})
