'use client'
// =============================================================================
// Footer.tsx — Rodapé global com links legais (LGPD)
// Oculto automaticamente no painel admin (/admin/*).
// Com a chave "visual-produto-e-rodape" (v1.49.0) segue o azul do topo de Personalizar Site,
// num tom mais fechado — vira a faixa final do rodapé azul da home em vez de um bloco roxo à parte.
// =============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import CookieSettingsButton from '@/components/CookieSettingsButton'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { useSiteConfig } from '@/lib/useSiteConfig'
import { mixHex } from '@/lib/colors'

export default function Footer() {
  const pathname = usePathname()
  const novo = useFuncionalidade('visual-produto-e-rodape') !== false
  const site = useSiteConfig()

  // Não exibe o footer no painel admin
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/login')
    || pathname?.startsWith('/janela')) return null

  // Cores no style (não em classe text-*): o tema claro do site força algumas classes de cor
  const fundo   = novo ? mixHex(site?.colorHero ?? '#1E4FD6', '#000000', 0.62) : '#10286B'
  const texto   = novo ? 'rgba(255,255,255,0.62)' : undefined
  const fraco   = novo ? 'rgba(255,255,255,0.28)' : undefined
  const nome    = novo ? (site?.siteName ?? 'Santuário Nerd') : 'Santuário Nerd'

  return (
    <footer className={`py-5 px-4 text-xs ${novo ? '' : 'text-gray-400'}`} style={{ backgroundColor: fundo, color: texto }}>
      <div className="max-w-5xl mx-auto space-y-3">
        {/* Links legais */}
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/privacidade" className="hover:text-white transition-colors">Política de Privacidade</Link>
          <span className={novo ? '' : 'text-gray-700'} style={{ color: fraco }}>|</span>
          <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
          <span className={novo ? '' : 'text-gray-700'} style={{ color: fraco }}>|</span>
          <Link href="/lgpd" className="hover:text-white transition-colors">Seus Direitos (LGPD)</Link>
          <span className={novo ? '' : 'text-gray-700'} style={{ color: fraco }}>|</span>
          <CookieSettingsButton />
          <span className={novo ? '' : 'text-gray-700'} style={{ color: fraco }}>|</span>
          <a href="mailto:contato@santuarionerd.com.br" className="hover:text-white transition-colors">
            contato@santuarionerd.com.br
          </a>
        </nav>
        {/* Copyright */}
        <p className={`text-center ${novo ? '' : 'text-gray-600'}`} style={novo ? { color: 'rgba(255,255,255,0.45)' } : undefined}>
          © {new Date().getFullYear()} <span className={novo ? '' : 'text-gray-400'} style={novo ? { color: 'rgba(255,255,255,0.75)' } : undefined}>{nome}</span> — José Bonifácio, SP. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
