import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'
import PWAInstallButton from '@/components/PWAInstallButton'
import CookieBanner from '@/components/CookieBanner'
import Footer from '@/components/Footer'
import VLibrasController from '@/components/VLibrasController'
import ClientProviders from '@/components/ClientProviders'

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

export const viewport: Viewport = {
  themeColor: '#42B6EE',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: { default: 'Santuário Nerd', template: '%s — Santuário Nerd' },
  description: 'Sistema de gestão da loja de Card Games',
  manifest: '/manifest.json',
  // Ícones no tamanho certo (o logo-maikon.png original tinha 428 KB e era baixado em toda página)
  icons: {
    icon: [
      { url: '/icon-32.png',  type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/icon-32.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Santuário Nerd',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script abaixo põe a classe "light" antes do React montar (evita
    // o flash do tema); a diferença no <html> é esperada e só vale pra este elemento.
    <html lang="pt-BR" className={nunito.variable} suppressHydrationWarning>
      <head>
        {/* iOS Safari PWA meta tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        {/* Aplica o tema salvo antes do primeiro render para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.remove('light')}else{document.documentElement.classList.add('light');if(!t)localStorage.setItem('theme','light')}}catch(e){document.documentElement.classList.add('light')}})();`
          }}
        />
      </head>
      <body>
        <ClientProviders>
        {/* Carrega e controla o widget somente depois de conhecer as preferências do usuário. */}
        <VLibrasController />
        {children}
        {/* Rodapé com links legais (LGPD) — não aparece no painel admin */}
        <Footer />
        {/* Banner de consentimento de cookies (LGPD Art. 8°) */}
        <CookieBanner />
        {/* Botão flutuante de instalação PWA — aparece quando o Chrome suporta */}
        <PWAInstallButton />
        </ClientProviders>
      </body>
    </html>
  )
}
