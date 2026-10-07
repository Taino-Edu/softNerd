// =============================================================================
// lib/api — chamadas à API, um arquivo por assunto
//
// As telas importam tudo de "@/lib/api" (este arquivo). Pra achar uma função,
// veja docs/mapa/ENDPOINTS.md ou o arquivo do assunto:
//   client.ts        axios + renovação de sessão
//   auth.ts          Login, cadastro, sessão
//   usuarios.ts      Usuários, perfil, preferências, histórico do cliente, perfil público
//   comandas.ts      Comandas e as listas de formas de pagamento do PDV/comanda
//   produtos.ts      Produtos, variantes, categorias, upload de imagem
//   site.ts          Avisos da home e personalização do site
//   cartas.ts        Cartas (TCG), decks e vitrine de cartas
//   campeonatos.ts   Campeonatos, timer e liga mensal
//   vendas.ts        Vendas avulsas (PDV), extrato e compras do cliente
//   crediario.ts     Crediário (admin, cliente e link público /pagar/{token})
//   reservas.ts      Reservas (pré-venda)
//   fiscal.ts        NFC-e, certificado, naturezas de operação, notas do cliente
//   relatorios.ts    Analytics, financeiro e relatórios
//   lgpd.ts          Pedidos LGPD (público e admin)
//   comunicacao.ts   Assistente IA, notificações, push, mensageria, WhatsApp
// =============================================================================
export * from './client'
export * from './auth'
export * from './usuarios'
export * from './comandas'
export * from './produtos'
export * from './site'
export * from './cartas'
export * from './campeonatos'
export * from './vendas'
export * from './crediario'
export * from './reservas'
export * from './fiscal'
export * from './relatorios'
export * from './lgpd'
export * from './comunicacao'
