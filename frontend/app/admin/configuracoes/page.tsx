'use client'
import { usePreferences } from '@/hooks/usePreferences'
import { Settings, BrainCircuit, Bell, Tag, Check, Loader2, Accessibility, LayoutDashboard, RotateCcw } from 'lucide-react'
import clsx from 'clsx'
import toast, { Toaster } from 'react-hot-toast'
import { UserPreferences, DashboardPanels, DEFAULT_DASHBOARD_PANELS } from '@/lib/api'

const CORNERS = [
  { value: 'bottom-right', label: 'Inferior direito' },
  { value: 'bottom-left',  label: 'Inferior esquerdo' },
  { value: 'top-right',    label: 'Superior direito' },
  { value: 'top-left',     label: 'Superior esquerdo' },
] as const

const DISCOUNTS = [0, 5, 10, 15, 20] as const

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <h2 className="font-bold text-white flex items-center gap-2">
        {icon}{title}
      </h2>
      {children}
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={clsx('relative w-11 h-6 rounded-full transition-colors duration-200', value ? 'bg-brand-500' : 'bg-surface-600')}
    >
      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200', value ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
}

export default function ConfiguracoesPage() {
  const { prefs, loading, saving, update } = usePreferences()

  function set<K extends keyof UserPreferences>(section: K, patch: Partial<UserPreferences[K]>) {
    update({ ...prefs, [section]: { ...prefs[section], ...patch } })
    toast.success('Salvo!', { duration: 1500 })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <Toaster position="top-center" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-brand-400" /> Configurações
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Preferências salvas por perfil de usuário</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {/* ── Botão IA ── */}
      <Section title="Assistente IA" icon={<BrainCircuit className="w-5 h-5 text-violet-400" />}>
        <Row label="Ativar chat IA" desc="Exibe o botão flutuante do assistente">
          <Toggle value={prefs.aiButton.enabled} onChange={v => set('aiButton', { enabled: v })} />
        </Row>

        {prefs.aiButton.enabled && (
          <>
            <Row label="Botão arrastável" desc="Arraste o botão para qualquer lugar da tela">
              <Toggle value={prefs.aiButton.mode === 'draggable'} onChange={v => set('aiButton', { mode: v ? 'draggable' : 'fixed' })} />
            </Row>

            {prefs.aiButton.mode === 'fixed' && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Posição fixa</p>
                <div className="grid grid-cols-2 gap-2">
                  {CORNERS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => set('aiButton', { corner: c.value })}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all',
                        prefs.aiButton.corner === c.value
                          ? 'bg-violet-600/20 border-violet-500/60 text-violet-300'
                          : 'bg-surface-700 border-surface-500 text-gray-400'
                      )}
                    >
                      {prefs.aiButton.corner === c.value && <Check className="w-3.5 h-3.5" />}
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── VLibras ── */}
      <Section title="VLibras (Acessibilidade)" icon={<Accessibility className="w-5 h-5 text-blue-400" />}>
        <Row label="Ativar VLibras" desc="Exibe o botão de tradução em Libras">
          <Toggle value={prefs.vlibras.enabled} onChange={v => set('vlibras', { enabled: v })} />
        </Row>

        {prefs.vlibras.enabled && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Posição na tela</p>
            <div className="grid grid-cols-2 gap-2">
              {CORNERS.map(c => (
                <button
                  key={c.value}
                  onClick={() => set('vlibras', { corner: c.value })}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all',
                    prefs.vlibras.corner === c.value
                      ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                      : 'bg-surface-700 border-surface-500 text-gray-400'
                  )}
                >
                  {prefs.vlibras.corner === c.value && <Check className="w-3.5 h-3.5" />}
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Notificações ── */}
      <Section title="Notificações" icon={<Bell className="w-5 h-5 text-amber-400" />}>
        <Row label="Sons" desc="Toca um som ao receber notificações">
          <Toggle value={prefs.notifications.soundEnabled} onChange={v => set('notifications', { soundEnabled: v })} />
        </Row>
        <Row label="Notificações do navegador" desc="Permite notificações push mesmo com a aba em segundo plano">
          <Toggle value={prefs.notifications.browserEnabled} onChange={v => set('notifications', { browserEnabled: v })} />
        </Row>
      </Section>

      {/* ── PDV ── */}
      <Section title="Frente de Caixa" icon={<Tag className="w-5 h-5 text-accent-green" />}>
        <Row label="Desconto padrão" desc="Pré-seleciona este desconto ao abrir uma nova venda">
          <div className="flex gap-1">
            {DISCOUNTS.map(d => (
              <button
                key={d}
                onClick={() => set('pdv', { defaultDiscount: d })}
                className={clsx(
                  'w-10 h-8 rounded text-xs font-bold border transition-all',
                  prefs.pdv.defaultDiscount === d
                    ? 'bg-accent-green/20 border-accent-green/60 text-accent-green'
                    : 'bg-surface-700 border-surface-500 text-gray-400'
                )}
              >
                {d === 0 ? '—' : `${d}%`}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* ── Dashboard ── */}
      <Section title="Dashboard" icon={<LayoutDashboard className="w-5 h-5 text-brand-400" />}>

        {/* Atualização automática */}
        <Row label="Atualização automática" desc="Intervalo para buscar novos dados das comandas">
          <div className="flex gap-1">
            {([15, 30, 60, 0] as const).map(v => (
              <button
                key={v}
                onClick={() => set('dashboard', { refreshInterval: v })}
                className={clsx(
                  'px-3 h-8 rounded text-xs font-bold border transition-all',
                  prefs.dashboard.refreshInterval === v
                    ? 'bg-brand-600/20 border-brand-500/60 text-brand-300'
                    : 'bg-surface-700 border-surface-500 text-gray-400'
                )}
              >
                {v === 0 ? 'Manual' : v === 60 ? '1min' : `${v}s`}
              </button>
            ))}
          </div>
        </Row>

        {/* Cores do gráfico */}
        <div>
          <p className="text-sm font-medium text-white mb-1">Cores do gráfico de receita</p>
          <p className="text-xs text-gray-500 mb-2">Esquema de cores das barras dos últimos 7 dias</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'default', label: 'Padrão',   colors: ['bg-accent-gold','bg-accent-green','bg-brand-600','bg-red-400'] },
              { value: 'blue',    label: 'Azul',      colors: ['bg-cyan-300','bg-brand-400','bg-brand-600','bg-blue-900'] },
              { value: 'neon',    label: 'Neon',      colors: ['bg-violet-400','bg-emerald-400','bg-fuchsia-500','bg-orange-500'] },
            ] as const).map(s => (
              <button
                key={s.value}
                onClick={() => set('dashboard', { chartScheme: s.value })}
                className={clsx(
                  'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all',
                  prefs.dashboard.chartScheme === s.value
                    ? 'bg-brand-600/20 border-brand-500/50'
                    : 'bg-surface-700 border-surface-500 hover:border-surface-400'
                )}
              >
                <div className="flex gap-1 items-end h-6">
                  {s.colors.map((c, i) => (
                    <div key={i} className={clsx('w-3 rounded-t', c)} style={{ height: `${[24,16,20,10][i]}px` }} />
                  ))}
                </div>
                <span className="text-xs text-gray-400">{s.label}</span>
                {prefs.dashboard.chartScheme === s.value && <Check className="w-3 h-3 text-brand-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Painéis visíveis */}
        <div>
          <p className="text-sm font-medium text-white mb-1">Painéis visíveis</p>
          <p className="text-xs text-gray-500 mb-3">Oculta permanentemente painéis que você não usa</p>
          <div className="space-y-2">
            {([
              { key: 'finHoje',       label: 'Detalhe financeiro hoje' },
              { key: 'grafico',       label: 'Gráfico de receita (7 dias)' },
              { key: 'previsao',      label: 'Previsão financeira do mês' },
              { key: 'patrimonio',    label: 'Patrimônio em estoque' },
              { key: 'clientes',      label: 'Top Clientes' },
              { key: 'produtos',      label: 'Top Produtos (7 dias)' },
              { key: 'lgpd',          label: 'LGPD' },
              { key: 'preInscricoes', label: 'Pré-inscrições campeonatos' },
              { key: 'preVenda',      label: 'Lista de espera pré-venda' },
            ] as { key: keyof DashboardPanels; label: string }[]).map(({ key, label }) => (
              <Row key={key} label={label}>
                <Toggle
                  value={prefs.dashboard.panels[key]}
                  onChange={v => set('dashboard', { panels: { ...prefs.dashboard.panels, [key]: v } })}
                />
              </Row>
            ))}
          </div>
        </div>

        {/* Reset layout */}
        <div className="pt-2 border-t border-surface-500">
          <Row label="Resetar layout" desc="Reabre todos os painéis colapsados (preferência local)">
            <button
              onClick={() => {
                const keys = ['grafico','previsao','patrimonio','clientes','produtos','lgpd','preinscricoes','finHoje']
                keys.forEach(k => localStorage.removeItem(`dash_panel_${k}`))
                toast.success('Layout resetado!', { duration: 2000 })
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-500 text-gray-400 hover:border-surface-400 hover:text-gray-200 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Resetar
            </button>
          </Row>
        </div>

      </Section>
    </div>
  )
}
