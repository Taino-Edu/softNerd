'use client'
// Topo único das telas da conta do cliente (v1.52.0): mesma barra no azul da loja, mesmo botão de
// voltar (sempre pra um lugar fixo — antes cada tela voltava pra um canto: /, /cliente, /cliente/perfil)
// e título branco. Cores no style, não em text-white: o tema claro força .text-white pra escuro e o
// título sumia no fundo escuro (Meus Decks, Configurações).
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { mixHex } from '@/lib/colors'
import { useSiteConfig } from '@/lib/useSiteConfig'

export default function CabecalhoCliente({ titulo, subtitulo, voltar = '/cliente', voltarRotulo = 'Voltar', acao }: {
  titulo: string
  subtitulo?: string
  /** Pra onde o "voltar" leva. Padrão: a área do cliente (o "início" de quem está logado). */
  voltar?: string
  voltarRotulo?: string
  /** Botão/elemento à direita (ex.: "Novo deck"). */
  acao?: React.ReactNode
}) {
  const site = useSiteConfig()
  const cor = site?.colorHero ?? '#1E4FD6'
  return (
    <header style={{ background: `linear-gradient(135deg, ${mixHex(cor, '#000000', 0.18)} 0%, ${mixHex(cor, '#000000', 0.38)} 100%)` }}>
      <div className="max-w-lg mx-auto px-5 pt-10 pb-6 flex items-center gap-3">
        <Link href={voltar} aria-label={voltarRotulo} title={voltarRotulo}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors hover:bg-white/25 active:scale-90"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black leading-tight truncate" style={{ color: '#FFFFFF' }}>{titulo}</h1>
          {subtitulo && <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{subtitulo}</p>}
        </div>
        {acao}
      </div>
    </header>
  )
}
