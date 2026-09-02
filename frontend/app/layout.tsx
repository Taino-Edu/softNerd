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
  icons: {
    icon: [
      { url: '/logo-maikon.png', type: 'image/png' },
    ],
    apple: '/logo-maikon.png',
    shortcut: '/logo-maikon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Santuário Nerd',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={nunito.variable}>
      <head>
        {/* iOS Safari PWA meta tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        {/* Aplica o tema salvo antes do primeiro render para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.remove('light')}else{document.documentElement.classList.add('light');if(!t)localStorage.setItem('theme','light')}}catch(e){document.documentElement.classList.add('light')}})();`
          }}
        />
      </head>
      <body>
        <ClientProviders>
        {/* Script VLibras — Acessibilidade (atributos customizados via spread para evitar erro TS) */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <div {...({ vw: 'true' } as any)} className="enabled">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <div {...({ 'vw-access-button': 'true' } as any)} className="active"></div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <div {...({ 'vw-plugin-wrapper': 'true' } as any)}>
            <div className="vw-plugin-top-wrapper"></div>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.VLibras = window.VLibras || {};
              var script = document.createElement('script');
              script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
              script.onload = function() { new window.VLibras.Widget('https://vlibras.gov.br/app'); };
              document.body.appendChild(script);
            `
          }}
        />
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
