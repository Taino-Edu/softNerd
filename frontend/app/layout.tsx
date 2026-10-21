import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import PWAInstallButton from '@/components/PWAInstallButton'
import CookieBanner from '@/components/CookieBanner'
import Footer from '@/components/Footer'
import VLibrasController from '@/components/VLibrasController'
import ClientProviders from '@/components/ClientProviders'

// Nunito do pacote @fontsource (npm), não do Google na hora do build: o download do Google
// falhava de vez em quando e derrubava o build do CI e do deploy (v1.64.0). Mesmos arquivos.
// next/font exige os caminhos por extenso (sem montar com variável)
const nunito = localFont({
  src: [
    { path: '../node_modules/@fontsource/nunito/files/nunito-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/nunito/files/nunito-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/nunito/files/nunito-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../node_modules/@fontsource/nunito/files/nunito-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../node_modules/@fontsource/nunito/files/nunito-latin-800-normal.woff2', weight: '800', style: 'normal' },
    { path: '../node_modules/@fontsource/nunito/files/nunito-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-nunito',
  display: 'swap',
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
