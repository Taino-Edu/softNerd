// lib/api/site.ts — Avisos da home e personalização do site
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

export interface AnnouncementDto {
  id: string; title: string; body: string | null
  imageUrl: string | null; linkUrl: string | null
  type: string; isActive: boolean
  expiresAt: string | null; createdAt: string
}

export const ANNOUNCEMENT_TYPES = ['Banner', 'Aviso', 'Destaque'] as const

export const announcementApi = {
  visible: () => api.get<AnnouncementDto[]>('/api/announcements'),
  all:     () => api.get<AnnouncementDto[]>('/api/announcements/all'),
  create:  (data: Omit<AnnouncementDto, 'id' | 'createdAt'>) =>
    api.post<AnnouncementDto>('/api/announcements', data),
  update:  (id: string, data: Partial<Omit<AnnouncementDto, 'id' | 'createdAt'>>) =>
    api.put<AnnouncementDto>(`/api/announcements/${id}`, data),
  delete:  (id: string) => api.delete(`/api/announcements/${id}`),
}

// ── Personalização do site (nome, textos, cores da landing) ───────────────────

export interface SiteConfigDto {
  siteName: string
  heroSubtitle: string
  addressLine: string
  contactPersonName: string
  logoUrl?: string | null
  faviconUrl?: string | null
  pwaIconUrl?: string | null
  adminIconUrl?: string | null
  whatsappNumber: string
  contactEmail: string
  navTorneiosLabel: string
  navProdutosLabel: string
  navMercadoLabel: string
  navPontosLabel: string
  navLigaLabel: string
  ctaVerEventosLabel: string
  ctaVerTorneiosLabel: string
  ctaVerProdutosLabel: string
  torneiosEyebrow: string
  torneiosTitle: string
  produtosEyebrow: string
  produtosTitle: string
  pontosEyebrow: string
  pontosTitle: string
  pontosParagraph: string
  colorPrimary: string
  colorAccent: string
  colorNavy: string
  colorBackground: string
  colorCard: string
  borderRadiusStyle: 'Padrao' | 'Suave' | 'MuitoArredondado'
  /** Desconto padrão do Pix anunciado na vitrine, em %. 0 = não anuncia Pix. */
  pixDiscountPercent: number
  /** Parcelamento que vem pré-preenchido no cadastro de produto novo (o valor real é por produto). */
  maxInstallments: number
  /** Piso da parcela em centavos — evita "12x de R$ 1,67" em produto barato. */
  minInstallmentInCents: number
}

export const siteConfigApi = {
  get:  () => api.get<SiteConfigDto>('/api/site-config'),
  save: (body: Partial<SiteConfigDto>) => api.put<SiteConfigDto>('/api/site-config', body),
}
