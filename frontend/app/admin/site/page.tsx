'use client'

import { useEffect, useState } from 'react'
import { siteConfigApi, uploadApi, SiteConfigDto } from '@/lib/api'
import { mixHex, getContrastText } from '@/lib/colors'
import toast, { Toaster } from 'react-hot-toast'
import { Palette, Save, Loader2, ExternalLink, Upload, Image as ImageIcon } from 'lucide-react'

const DEFAULTS: SiteConfigDto = {
  siteName: 'Santuário Nerd',
  heroSubtitle: 'Produtos, torneios e a melhor experiência TCG da região. Acumule pontos, compre na mesa e participe de campeonatos.',
  addressLine: 'José Bonifácio — SP',
  contactPersonName: 'Maikon',
  logoUrl: null,
  faviconUrl: null,
  pwaIconUrl: null,
  adminIconUrl: null,
  whatsappNumber: '5517997633103',
  contactEmail: 'santuarionerd@gmail.com',
  navTorneiosLabel: 'Torneios',
  navProdutosLabel: 'Produtos',
  navMercadoLabel: 'Mercado de Cartas',
  navPontosLabel: 'Pontos',
  navLigaLabel: 'Liga Mensal',
  ctaVerEventosLabel: 'Ver Eventos',
  ctaVerTorneiosLabel: 'Ver Torneios',
  ctaVerProdutosLabel: 'Ver Produtos',
  torneiosEyebrow: 'Agenda',
  torneiosTitle: 'Próximos Torneios',
  produtosEyebrow: 'Vitrine',
  produtosTitle: 'Em Destaque',
  pontosEyebrow: 'Programa de Fidelidade',
  pontosTitle: 'Ganhe pontos a cada visita',
  pontosParagraph: 'Acumule pontos nas suas compras e troque por descontos. Só com CPF e WhatsApp — nada de senha ou aplicativo.',
  colorPrimary: '#3EC2F2',
  colorAccent: '#FFE45E',
  colorNavy: '#0C3D5A',
  colorBackground: '#EBF7FD',
  colorCard: '#FFFFFF',
  borderRadiusStyle: 'Padrao',
}

const RADIUS_OPTIONS: { value: SiteConfigDto['borderRadiusStyle']; label: string; previewRadius: string }[] = [
  { value: 'Padrao',           label: 'Padrão',           previewRadius: '0.5rem' },
  { value: 'Suave',            label: 'Suave',             previewRadius: '0.9rem' },
  { value: 'MuitoArredondado', label: 'Fofo e redondo',    previewRadius: '1.5rem' },
]
// Espelha RADIUS_PRESETS de app/page.tsx — "xl" pros botões CTA, "2xl" pra cards, senão o preview
// mostra um arredondamento que não bate com o que aparece no site real.
const RADIUS_PREVIEW_MAP: Record<SiteConfigDto['borderRadiusStyle'], string> = {
  Padrao: '0.75rem', Suave: '1rem', MuitoArredondado: '1.75rem',
}
const RADIUS_PREVIEW_MAP_2XL: Record<SiteConfigDto['borderRadiusStyle'], string> = {
  Padrao: '1rem', Suave: '1.25rem', MuitoArredondado: '2.25rem',
}

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold mb-1 block">{label}</label>
      {children}
      {desc && <p className="text-[11px] text-gray-500 mt-1">{desc}</p>}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold mb-1 block">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-surface-500 bg-transparent cursor-pointer shrink-0"
        />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="input w-full font-mono text-sm"
        />
      </div>
    </div>
  )
}

/** Upload de um ícone (logo/favicon/PWA/admin) — envia na hora pro servidor e guarda a URL
 * retornada no estado local do formulário; só persiste de verdade quando o admin clica em
 * "Salvar", igual todo o resto desta tela. */
function IconUploadField({
  label, desc, value, uploading, onUpload,
}: { label: string; desc: string; value: string | null | undefined; uploading: boolean; onUpload: (file: File) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold mb-1 block">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg border border-surface-500 bg-surface-800 flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="w-5 h-5 text-gray-600" />
          )}
        </div>
        <label className="btn-secondary text-sm py-1.5 cursor-pointer">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Enviar
          <input
            type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }}
          />
        </label>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">{desc}</p>
    </div>
  )
}

/** Preview ao vivo — miniatura da navbar + hero + card da landing page, refletindo o
 * formulário em tempo real, antes de salvar. */
function LivePreview({ cfg }: { cfg: SiteConfigDto }) {
  const [firstWord, ...rest] = cfg.siteName.split(' ')
  const restWord = rest.join(' ')
  const cardAlt = mixHex(cfg.colorCard, cfg.colorPrimary, 0.08)

  return (
    <div className="lg:sticky lg:top-4 rounded-2xl overflow-hidden border border-surface-500 shadow-xl">
      <div className="px-3 py-2 bg-surface-800 border-b border-surface-500 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-2 text-[10px] text-gray-500 font-medium">Preview</span>
      </div>

      {/* Navbar */}
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ backgroundColor: cfg.colorNavy }}>
        <span className="flex items-center gap-1.5 min-w-0">
          {cfg.logoUrl && (
            <img src={cfg.logoUrl} alt="Logo" className="w-6 h-6 object-contain shrink-0" />
          )}
          <span className="font-black text-sm truncate" style={{ color: getContrastText(cfg.colorNavy) }}>
            {cfg.siteName || 'Nome do site'}
          </span>
        </span>
        <span className="text-[10px] font-black px-2.5 py-1 shrink-0" style={{
          backgroundColor: cfg.colorAccent, color: cfg.colorNavy,
          borderRadius: RADIUS_PREVIEW_MAP[cfg.borderRadiusStyle] ?? RADIUS_PREVIEW_MAP.Padrao,
        }}>
          {cfg.ctaVerEventosLabel || 'Ver Eventos'}
        </span>
      </div>

      {/* Hero */}
      <div className="p-4" style={{ backgroundColor: cfg.colorBackground }}>
        <p className="text-base font-black leading-tight mb-1.5">
          <span style={{ color: cfg.colorAccent }}>{firstWord || 'Nome'}</span>
          {restWord && <span style={{ color: cfg.colorPrimary }}> {restWord}</span>}
        </p>
        <p className="text-[10px] leading-snug mb-3" style={{ color: getContrastText(cfg.colorBackground, '#4D8FAC', 'rgba(255,255,255,0.85)') }}>
          {cfg.heroSubtitle || 'Frase de apresentação...'}
        </p>
        <div className="flex gap-1.5 mb-3">
          <span className="text-[10px] font-black px-2 py-1" style={{
            backgroundColor: cfg.colorAccent, color: cfg.colorNavy,
            borderRadius: RADIUS_PREVIEW_MAP[cfg.borderRadiusStyle] ?? RADIUS_PREVIEW_MAP.Padrao,
          }}>
            {cfg.ctaVerTorneiosLabel || 'Ver Torneios'}
          </span>
          <span className="text-[10px] font-semibold px-2 py-1 border" style={{
            borderColor: cfg.colorPrimary, color: cfg.colorPrimary,
            borderRadius: RADIUS_PREVIEW_MAP[cfg.borderRadiusStyle] ?? RADIUS_PREVIEW_MAP.Padrao,
          }}>
            {cfg.ctaVerProdutosLabel || 'Ver Produtos'}
          </span>
        </div>

        {/* Card de exemplo */}
        <div className="overflow-hidden border" style={{
          backgroundColor: cfg.colorCard, borderColor: 'rgba(12,61,90,0.10)',
          borderRadius: RADIUS_PREVIEW_MAP_2XL[cfg.borderRadiusStyle] ?? RADIUS_PREVIEW_MAP_2XL.Padrao,
        }}>
          <div className="h-14" style={{ backgroundColor: cardAlt }} />
          <div className="p-2.5">
            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: cfg.colorPrimary }}>
              {cfg.produtosEyebrow || 'Vitrine'}
            </p>
            <p className="text-xs font-black" style={{ color: getContrastText(cfg.colorCard, '#0C3D5A', '#FFFFFF') }}>{cfg.produtosTitle || 'Em Destaque'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SiteConfigPage() {
  const [cfg, setCfg]         = useState<SiteConfigDto>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState<'logoUrl' | 'faviconUrl' | 'pwaIconUrl' | 'adminIconUrl' | null>(null)

  useEffect(() => {
    siteConfigApi.get()
      .then(r => setCfg(r.data))
      .catch(() => toast.error('Erro ao carregar personalização do site'))
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof SiteConfigDto>(key: K, value: SiteConfigDto[K]) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  async function uploadIcon(field: 'logoUrl' | 'faviconUrl' | 'pwaIconUrl' | 'adminIconUrl', file: File) {
    setUploadingIcon(field)
    try {
      const { data } = await uploadApi.image(file)
      set(field, data.url)
      toast.success('Enviado! Clique em Salvar pra aplicar.')
    } catch {
      toast.error('Erro ao enviar imagem')
    } finally {
      setUploadingIcon(null)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const { data } = await siteConfigApi.save(cfg)
      setCfg(data)
      toast.success('Personalização do site salva!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <Toaster position="top-center" />

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Palette className="w-6 h-6 text-brand-400" /> Personalizar Site
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Nome, textos e cores da página pública — mudanças aparecem pra todo mundo</p>
        </div>
        <a href="/" target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors">
          Ver site <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="space-y-6">

      {/* Identidade */}
      <div className="card p-5 space-y-3">
        <h3 className="font-bold text-white mb-1">Identidade</h3>
        <Field label="Nome do site" desc="Aparece na navbar, rodapé e título principal">
          <input value={cfg.siteName} onChange={e => set('siteName', e.target.value)} className="input w-full" />
        </Field>
        <Field label="Frase de apresentação (abaixo do título principal)">
          <textarea value={cfg.heroSubtitle} onChange={e => set('heroSubtitle', e.target.value)}
            rows={2} className="input w-full resize-none" />
        </Field>
        <Field label="Endereço / cidade" desc="Aparece no rodapé">
          <input value={cfg.addressLine} onChange={e => set('addressLine', e.target.value)} className="input w-full" />
        </Field>
        <Field label="Nome de quem atende" desc={'Usado em textos como "Falar com [nome]" e "[nome] vai confirmar sua vaga..."'}>
          <input value={cfg.contactPersonName} onChange={e => set('contactPersonName', e.target.value)} className="input w-full" />
        </Field>
      </div>

      {/* Identidade visual */}
      <div className="card p-5 space-y-4">
        <h3 className="font-bold text-white mb-1">Identidade visual</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <IconUploadField
            label="Logo da loja" desc="Aparece ao lado do nome na navbar"
            value={cfg.logoUrl} uploading={uploadingIcon === 'logoUrl'}
            onUpload={f => uploadIcon('logoUrl', f)}
          />
          <IconUploadField
            label="Favicon" desc="Aparece na aba do navegador"
            value={cfg.faviconUrl} uploading={uploadingIcon === 'faviconUrl'}
            onUpload={f => uploadIcon('faviconUrl', f)}
          />
          <IconUploadField
            label="Ícone do PWA" desc="Aparece quando o cliente instala o site como app"
            value={cfg.pwaIconUrl} uploading={uploadingIcon === 'pwaIconUrl'}
            onUpload={f => uploadIcon('pwaIconUrl', f)}
          />
          <IconUploadField
            label="Ícone do admin" desc="Aparece no painel administrativo. Vazio = usa a logo da loja"
            value={cfg.adminIconUrl} uploading={uploadingIcon === 'adminIconUrl'}
            onUpload={f => uploadIcon('adminIconUrl', f)}
          />
        </div>
      </div>

      {/* Contato */}
      <div className="card p-5 space-y-3">
        <h3 className="font-bold text-white mb-1">Contato</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="WhatsApp" desc="Só números, com DDI (ex: 5517999999999)">
            <input value={cfg.whatsappNumber} onChange={e => set('whatsappNumber', e.target.value)} className="input w-full font-mono" />
          </Field>
          <Field label="E-mail de contato">
            <input value={cfg.contactEmail} onChange={e => set('contactEmail', e.target.value)} className="input w-full" />
          </Field>
        </div>
      </div>

      {/* Cores */}
      <div className="card p-5 space-y-3">
        <h3 className="font-bold text-white mb-1">Cores</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ColorField label="Cor primária (azul)" value={cfg.colorPrimary} onChange={v => set('colorPrimary', v)} />
          <ColorField label="Cor de destaque (amarelo)" value={cfg.colorAccent} onChange={v => set('colorAccent', v)} />
          <ColorField label="Cor da navbar" value={cfg.colorNavy} onChange={v => set('colorNavy', v)} />
          <ColorField label="Fundo da página" value={cfg.colorBackground} onChange={v => set('colorBackground', v)} />
          <ColorField label="Fundo dos cards" value={cfg.colorCard} onChange={v => set('colorCard', v)} />
        </div>
        <p className="text-[11px] text-gray-500">Fundo e cards só valem no modo claro — o modo escuro mantém a paleta própria dele.</p>
      </div>

      {/* Estilo visual */}
      <div className="card p-5 space-y-3">
        <h3 className="font-bold text-white mb-1">Estilo visual</h3>
        <p className="text-[11px] text-gray-500 -mt-1">Arredondamento dos cantos de cards, botões e imagens.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {RADIUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('borderRadiusStyle', opt.value)}
              className={`flex flex-col items-center gap-2 p-3 border transition-colors ${
                cfg.borderRadiusStyle === opt.value
                  ? 'border-brand-400 bg-brand-500/10'
                  : 'border-surface-500 hover:border-surface-400'
              }`}
              style={{ borderRadius: '0.75rem' }}
            >
              <span
                className="w-full h-10 border-2"
                style={{ borderRadius: opt.previewRadius, borderColor: cfg.colorPrimary, backgroundColor: 'transparent' }}
              />
              <span className="text-xs font-semibold text-gray-300">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Textos da navbar */}
      <div className="card p-5 space-y-3">
        <h3 className="font-bold text-white mb-1">Textos da navbar</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Link 'Torneios'">
            <input value={cfg.navTorneiosLabel} onChange={e => set('navTorneiosLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Link 'Produtos'">
            <input value={cfg.navProdutosLabel} onChange={e => set('navProdutosLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Link 'Mercado de Cartas'">
            <input value={cfg.navMercadoLabel} onChange={e => set('navMercadoLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Link 'Pontos'">
            <input value={cfg.navPontosLabel} onChange={e => set('navPontosLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Link 'Liga Mensal'">
            <input value={cfg.navLigaLabel} onChange={e => set('navLigaLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Botão 'Ver Eventos' (navbar)">
            <input value={cfg.ctaVerEventosLabel} onChange={e => set('ctaVerEventosLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Botão 'Ver Torneios' (topo)">
            <input value={cfg.ctaVerTorneiosLabel} onChange={e => set('ctaVerTorneiosLabel', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Botão 'Ver Produtos' (topo)">
            <input value={cfg.ctaVerProdutosLabel} onChange={e => set('ctaVerProdutosLabel', e.target.value)} className="input w-full" />
          </Field>
        </div>
      </div>

      {/* Textos das seções */}
      <div className="card p-5 space-y-4">
        <h3 className="font-bold text-white mb-1">Textos das seções</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Torneios — etiqueta">
            <input value={cfg.torneiosEyebrow} onChange={e => set('torneiosEyebrow', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Torneios — título">
            <input value={cfg.torneiosTitle} onChange={e => set('torneiosTitle', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Produtos — etiqueta">
            <input value={cfg.produtosEyebrow} onChange={e => set('produtosEyebrow', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Produtos — título">
            <input value={cfg.produtosTitle} onChange={e => set('produtosTitle', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Pontos — etiqueta">
            <input value={cfg.pontosEyebrow} onChange={e => set('pontosEyebrow', e.target.value)} className="input w-full" />
          </Field>
          <Field label="Pontos — título">
            <input value={cfg.pontosTitle} onChange={e => set('pontosTitle', e.target.value)} className="input w-full" />
          </Field>
        </div>
        <Field label="Pontos — parágrafo">
          <textarea value={cfg.pontosParagraph} onChange={e => set('pontosParagraph', e.target.value)}
            rows={2} className="input w-full resize-none" />
        </Field>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar
      </button>

      </div>

      <div className="mt-6 lg:mt-0">
        <LivePreview cfg={cfg} />
      </div>
      </div>
    </div>
  )
}
