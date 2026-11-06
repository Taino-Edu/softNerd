import type { Metadata } from 'next'

// Título e descrição da loja no Google e na prévia do link (a página é montada no navegador)
export const metadata: Metadata = {
  title: 'Produtos — boosters, cartas, action figures e acessórios',
  description: 'Catálogo da Santuário Nerd: Pokémon TCG, One Piece, Magic, action figures, sleeves, pastas e pré-vendas. ' +
    'Preço no Pix com desconto, parcelamento no cartão e retirada na loja em José Bonifácio, SP.',
  alternates: { canonical: '/produtos' },
  openGraph: { url: '/produtos', title: 'Produtos — Santuário Nerd' },
}

export default function LayoutDosProdutos({ children }: { children: React.ReactNode }) {
  return children
}
