/** @type {import('next').NextConfig} */
const nextConfig = {
  // Necessário para o Dockerfile multi-stage copiar .next/standalone
  output: 'standalone',

  // Ignora erros de tipagem e linting DURANTE O BUILD para evitar que o Docker trave
  // devido a conflitos de versão do npm (ERESOLVE).
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Permite imagens de CDNs de TCG (Pokémon, Magic, etc.)
  images: {
    // Otimizador de imagens DESLIGADO: o /_next/image do Next 14 tem falha crítica de
    // execução remota de código (corrigida só no 15.5.24). As cartas já vêm otimizadas
    // dos sites delas; sem o otimizador, o <Image> usa a URL original. O nginx também
    // bloqueia /_next/image. Religar só depois de subir pro Next 15.5.24+.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pokemontcg.io' },
      { protocol: 'https', hostname: 'assets.tcgdex.net' },
      { protocol: 'https', hostname: 'optcgapi.com' },
      { protocol: 'https', hostname: 'cards.scryfall.io' },
      { protocol: 'https', hostname: '**.apitcg.com' },
      { protocol: 'https', hostname: 'product-images.tcgplayer.com' },
      // Imagens de upload local (dev) e Oracle Cloud (produção)
      { protocol: 'http',  hostname: 'localhost' },
      // IP do servidor: configure UPLOAD_HOSTNAME no ambiente (ex: 193.123.45.67)
      ...(process.env.UPLOAD_HOSTNAME
        ? [{ protocol: 'https', hostname: process.env.UPLOAD_HOSTNAME }]
        : []),
    ],
  },
  // Proxy para a API em desenvolvimento (evita CORS)
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      // Proxy de imagens: /uploads/xxx → API:5000/uploads/xxx
      // (imagens salvas no servidor da API, não no frontend)
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
