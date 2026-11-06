// /robots.txt — o que o Google pode visitar e onde está o sitemap.
// A Cloudflare junta as regras dela (sinais de conteúdo, bloqueio de robôs de IA) a estas.
import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/servidor'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      // Painel, área do cliente, API e telas de login não são páginas pra pesquisa
      disallow: ['/admin', '/cliente', '/api/', '/entrar', '/cadastro', '/login', '/primeiro-acesso', '/reset-password', '/pagar/', '/mesa/'],
    }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
