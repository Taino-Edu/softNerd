import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import PWAInstallButton from '@/components/PWAInstallButton'
import CookieBanner from '@/components/CookieBanner'
import Footer from '@/components/Footer'
import VLibrasController from '@/components/VLibrasController'
import ClientProviders from '@/components/ClientProviders'
import { daApi, SITE } from '@/lib/servidor'

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

// O que aparece no Google e na prévia do link (WhatsApp, Instagram). Antes a descrição era
// "Sistema de gestão da loja de Card Games" em TODAS as páginas (revisão de SEO, 06/11).
const DESCRICAO = 'Loja de card games em José Bonifácio, SP: Pokémon TCG, One Piece, Magic, action figures, acessórios e pré-vendas. ' +
  'Torneios toda semana, Liga Mensal e pontos a cada compra. Reserve pelo site e retire na loja.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Santuário Nerd — Card games, TCG e colecionáveis em José Bonifácio', template: '%s — Santuário Nerd' },
  description: DESCRICAO,
  applicationName: 'Santuário Nerd',
  keywords: ['card games', 'TCG', 'Pokémon TCG', 'One Piece card game', 'Magic', 'booster', 'action figure', 'loja nerd', 'José Bonifácio', 'torneio Pokémon'],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Santuário Nerd',
    url: SITE,
    title: 'Santuário Nerd — Card games, TCG e colecionáveis',
    description: DESCRICAO,
    images: [{ url: '/og-santuario.jpg', width: 1200, height: 630, alt: 'Santuário Nerd — card games, TCG e colecionáveis' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-santuario.jpg'] },
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

/** A loja física pro Google (pesquisa local e Maps): nome, cidade, contato. Dados do Personalizar Site. */
async function DadosDaLoja() {
  const cfg = await daApi<{ siteName?: string; addressLine?: string; whatsappNumber?: string }>('/api/site-config', 3600)
  const [cidade, uf] = (cfg?.addressLine ?? 'José Bonifácio — SP').split(/[—-]/).map(s => s.trim())
  const dados = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: cfg?.siteName || 'Santuário Nerd',
    url: SITE,
    image: `${SITE}/og-santuario.jpg`,
    description: DESCRICAO,
    address: { '@type': 'PostalAddress', addressLocality: cidade || 'José Bonifácio', addressRegion: uf || 'SP', addressCountry: 'BR' },
    ...(cfg?.whatsappNumber ? { telephone: `+${cfg.whatsappNumber.replace(/\D/g, '')}` } : {}),
  }
  // JSON gerado aqui; "<" vira < pra nenhum texto fechar a tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, '\\u003c') }} />
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
        <DadosDaLoja />
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
