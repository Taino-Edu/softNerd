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

  // Cores sempre no style (nunca text-gray-*): o tema claro do site troca essas classes por cinza-escuro,
  // que some em cima do azul-marinho do rodapé
  const fundo   = novo ? mixHex(site?.colorHero ?? '#1E4FD6', '#000000', 0.62) : '#10286B'
  const nome    = novo ? (site?.siteName ?? 'Santuário Nerd') : 'Santuário Nerd'
  const link    = 'rgba(255,255,255,0.88)'
  const sep     = 'rgba(255,255,255,0.35)'
  // Celular: links em grade de 2 colunas, sem os "|" (que quebravam linha); do sm pra cima, em linha com "|"
  const item    = 'py-1.5 sm:py-0 text-center hover:underline underline-offset-2'
  const barra   = <span aria-hidden className="hidden sm:inline" style={{ color: sep }}>|</span>

  return (
    <footer className="py-6 px-4 text-[13px] sm:text-xs" style={{ backgroundColor: fundo, color: link }}>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-3">
        {/* Links legais */}
        <nav aria-label="Links legais" className="grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
          <Link href="/privacidade" className={item}>Política de Privacidade</Link>
          {barra}
          <Link href="/termos" className={item}>Termos de Uso</Link>
          {barra}
          <Link href="/lgpd" className={item}>Seus Direitos (LGPD)</Link>
          {barra}
          <CookieSettingsButton className={`${item} inline-flex items-center justify-center gap-1.5`} />
          {barra}
          <a href="mailto:contato@santuarionerd.com.br" className={`${item} col-span-2 break-all`}>
            contato@santuarionerd.com.br
          </a>
        </nav>
        {/* Copyright */}
        <p className="text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
          © {new Date().getFullYear()} <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{nome}</span> — José Bonifácio, SP. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
