'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  CheckCircle, XCircle, Settings, Loader2, RefreshCw,
  Upload, Info, AlertTriangle, ExternalLink, X, Save, Link2,
  Search, Wallet,
} from 'lucide-react'

type IntegracaoStatus = {
  source:      string
  isActive:    boolean
  isConnected: boolean
  cnpj?:       string
  pixKey?:     string
  lastSyncAt?: string
  expiresAt?:  string
}

type ConfigModal = {
  source: string
  clientId: string
  clientSecret: string
  cnpj: string
  pixKey: string
  certOk?: boolean
  certUploading?: boolean
}

type TenantErpStatus = {
  enabled: boolean
  endpoint?: string
}

type TenantErpProbe = {
  configured: boolean
  authenticated: boolean
  financeiro: { success: boolean; statusCode?: number; message: string }
  fiscal: { success: boolean; statusCode?: number; message: string }
  durationMs: number
}

type IbptResult = {
  ncm: string; uf: string; importado: boolean
  percentualFederal: number; percentualEstadual: number; percentualMunicipal: number; percentualTotal: number
  fonte?: string; versao?: string; vigenciaInicio?: string; vigenciaFim?: string; vencida: boolean
}

const INTEGRACAO_INFO: Record<string, {
  label: string; icon: string; desc: string; fields: string[]; docs?: string
}> = {
  inter: {
    label: 'Banco Inter PJ',
    icon:  '🏦',
    desc:  'Puxa extrato, saldo, Pix recebidos e boletos automaticamente a cada 15 minutos via API gratuita do Inter para conta PJ. A chave Pix é usada para gerar cobranças no Crediário — a baixa dos pagamentos é automática, sem conferência manual.',
    fields: ['clientId', 'clientSecret', 'pixKey'],
    docs: 'https://developers.bancointer.com.br',
  },
  mercadopago: {
    label: 'Mercado Pago',
    icon:  '💳',
    desc:  'Integra vendas no cartão e Pix via API do Mercado Pago. Não exige taxa extra além da maquininha.',
    fields: ['clientId', 'clientSecret'],
    docs: 'https://www.mercadopago.com.br/developers',
  },
  sefaz: {
    label: 'SEFAZ NF-e',
    icon:  '📋',
    desc:  'Consulta NF-e emitidas contra o CNPJ via SEFAZ DFe Distribuição. Requer certificado A1 (DFe.NET).',
    fields: ['cnpj'],
  },
}

const fmtMoeda = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtTempoRestante(ms: number) {
  const totalSegundos = Math.max(0, Math.ceil(ms / 1000))
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.floor((totalSegundos % 3600) / 60)
  const segundos = totalSegundos % 60
  return horas > 0
    ? `${horas}h ${String(minutos).padStart(2, '0')}min`
    : `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`
}

export default function IntegracoesPage() {
  const [integracoes, setIntegracoes] = useState<IntegracaoStatus[]>([])
  const [loading,     setLoading]     = useState(true)
  const [sefazOk,     setSefazOk]     = useState(false)
  const [configModal, setConfigModal] = useState<ConfigModal | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [ofxLoading,  setOfxLoading]  = useState(false)
  const [syncingInter, setSyncingInter] = useState(false)
  /** Saldo e última sincronização lidos do Inter — a tela mostra sem ninguém conferir. */
  const [interInfo, setInterInfo] = useState<{ saldo: number | null; lastSyncAt: string | null }>(
    { saldo: null, lastSyncAt: null },
  )
  const [syncingSefaz, setSyncingSefaz] = useState(false)
  const [tenantErp, setTenantErp] = useState<TenantErpStatus>({ enabled: false })
  const [tenantErpProbe, setTenantErpProbe] = useState<TenantErpProbe | null>(null)
  const [testingTenantErp, setTestingTenantErp] = useState(false)
  const [ibptNcm, setIbptNcm] = useState('')
  const [ibptUf, setIbptUf] = useState('SP')
  const [ibptImportado, setIbptImportado] = useState(false)
  const [ibptLoading, setIbptLoading] = useState(false)
  const [ibptResult, setIbptResult] = useState<IbptResult | null>(null)
  const [sefazProximaConsultaEm, setSefazProximaConsultaEm] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  const sefazTempoRestante = sefazProximaConsultaEm
    ? new Date(sefazProximaConsultaEm).getTime() - agora
    : 0
  const sefazCooldownAtivo = sefazTempoRestante > 0

  async function load() {
    setLoading(true)
    try {
      const [{ data: ints }, { data: sefaz }, tenantErpResponse] = await Promise.all([
        api.get('/api/contas-receber/integracoes'),
        api.get('/api/contas-receber/sefaz-status'),
        api.get<TenantErpStatus>('/api/integrations/tenant-erp/status').catch(() => null),
      ])
      setIntegracoes(ints)
      setSefazOk(sefaz.configured)
      setSefazProximaConsultaEm(sefaz.proximaConsultaEm ?? null)
      if (tenantErpResponse) setTenantErp(tenantErpResponse.data)
    } catch { toast.error('Erro ao carregar integrações') }
    finally  { setLoading(false) }
  }

  /** Lê saldo e data do último sync direto do Inter. Falha aqui só some com o saldo. */
  async function carregarInfoInter() {
    try {
      const { data } = await api.get('/api/contas-receber/integracoes/inter/status?comSaldo=true')
      if (data.configured) {
        setInterInfo({ saldo: data.saldo ?? null, lastSyncAt: data.lastSyncAt ?? null })
      }
    } catch { /* sem saldo na tela, o resto continua */ }
  }

  useEffect(() => { load(); carregarInfoInter() }, [])

  // O robô de sync roda a cada 15 min no servidor; a tela reflete isso sozinha
  // enquanto estiver aberta, sem depender de alguém clicar em nada.
  useEffect(() => {
    const id = window.setInterval(() => { load(); carregarInfoInter() }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function openConfig(src: string, current?: IntegracaoStatus) {
    let certOk = false
    if (src === 'inter') {
      try {
        const { data } = await api.get('/api/contas-receber/integracoes/inter/status')
        certOk = !!data.certificateOk
      } catch { /* ignora */ }
    }
    setConfigModal({
      source: src, clientId: '', clientSecret: '',
      cnpj: current?.cnpj ?? '', pixKey: current?.pixKey ?? '',
      certOk,
    })
  }

  async function uploadCertificado(crt: File, key: File) {
    setConfigModal(m => m ? { ...m, certUploading: true } : m)
    try {
      const form = new FormData()
      form.append('crt', crt)
      form.append('key', key)
      await api.post('/api/contas-receber/integracoes/inter/certificado', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Certificado instalado!')
      setConfigModal(m => m ? { ...m, certOk: true, certUploading: false } : m)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao instalar certificado')
      setConfigModal(m => m ? { ...m, certUploading: false } : m)
    }
  }

  async function saveConfig() {
    if (!configModal) return
    setSaving(true)
    try {
      const payload: any = {}
      if (configModal.clientId)     payload.clientId     = configModal.clientId
      if (configModal.clientSecret) payload.clientSecret = configModal.clientSecret
      if (configModal.cnpj)         payload.cnpj         = configModal.cnpj
      if (configModal.pixKey)       payload.pixKey       = configModal.pixKey
      payload.isActive = true

      await api.put(`/api/contas-receber/integracoes/${configModal.source}`, payload)
      toast.success('Configuração salva!')
      setConfigModal(null)
      load()
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  /**
   * Puxa extrato + saldo do Inter e já reflete tudo na tela: lançamentos, saldo e
   * data do sync vêm na mesma resposta. Antes só importava e era preciso ir
   * conferir em Contas a Receber pra ver se tinha entrado alguma coisa.
   */
  async function syncInterAgora() {
    setSyncingInter(true)
    try {
      const { data } = await api.post('/api/contas-receber/integracoes/inter/sync')

      setInterInfo({
        saldo:      data.saldo ?? null,
        lastSyncAt: data.lastSyncAt ?? new Date().toISOString(),
      })

      const saldoTxt = data.saldo != null ? ` Saldo: ${fmtMoeda(data.saldo)}.` : ''
      toast.success(
        `${data.imported} transação(ões) importada(s)` +
        `${data.duplicates ? `, ${data.duplicates} já existiam` : ''}.${saldoTxt}`,
        { duration: 6000 },
      )

      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao sincronizar — confira Client ID/Secret e certificado.')
    } finally {
      setSyncingInter(false)
    }
  }

  async function syncSefazAgora() {
    setSyncingSefaz(true)
    try {
      const { data } = await api.post('/api/contas-receber/sefaz/sync')
      toast.success(
        `${data.novasNotas} nota(s) nova(s), ${data.manifestadas} ciência(s), ${data.contasCriadas} conta(s) a pagar.`,
        { duration: 6000 },
      )
      if (data.mensagem) toast(data.mensagem, { duration: 8000 })
      load()
    } catch (err: any) {
      const proxima = err?.response?.data?.proximaTentativaEm
      if (proxima) setSefazProximaConsultaEm(proxima)
      toast.error(err?.response?.data?.message ?? 'Erro ao sincronizar com a SEFAZ.')
      load()
    } finally {
      setSyncingSefaz(false)
    }
  }

  async function testTenantErp() {
    setTestingTenantErp(true)
    try {
      const { data } = await api.post<TenantErpProbe>('/api/integrations/tenant-erp/test')
      setTenantErpProbe(data)
      if (data.authenticated && data.financeiro.success && data.fiscal.success)
        toast.success('Tenant-ERP conectado ao Financeiro e Fiscal.')
      else if (data.authenticated)
        toast.error('Autenticação aceita, mas há escopo ou módulo pendente.')
      else
        toast.error(data.financeiro.message || 'Credencial recusada pelo Tenant-ERP.')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível testar o Tenant-ERP.')
    } finally {
      setTestingTenantErp(false)
    }
  }

  async function lookupIbpt() {
    const ncm = ibptNcm.replace(/\D/g, '')
    if (ncm.length !== 8) {
      toast.error('Informe os 8 dígitos do NCM.')
      return
    }
    setIbptLoading(true)
    setIbptResult(null)
    try {
      const { data } = await api.get<IbptResult>(`/api/integrations/tenant-erp/fiscal/ibpt/${ncm}`, {
        params: { uf: ibptUf, importado: ibptImportado },
      })
      setIbptResult(data)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'NCM não encontrado na tabela IBPT publicada.')
    } finally {
      setIbptLoading(false)
    }
  }

  async function handleOfxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setOfxLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/api/contas-receber/import-ofx', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(`${data.imported} transações importadas (${data.skipped} duplicadas ignoradas)`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao importar OFX')
    } finally {
      setOfxLoading(false)
      e.target.value = ''
    }
  }

  const cfgInfo = configModal ? INTEGRACAO_INFO[configModal.source] : null

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <Toaster />

      <PageHeader
        title="Integrações Financeiras"
        subtitle="Conecte fontes de dados — todas gratuitas"
        actions={
          <button onClick={load} className="p-2 rounded-xl bg-surface-700 hover:bg-surface-500 text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className={clsx('card p-5 flex gap-4', tenantErpProbe?.authenticated && 'border-green-500/20')}>
            <Link2 className="w-7 h-7 text-brand-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-white">Tenant-ERP</h3>
                <Badge tone={tenantErpProbe?.authenticated ? 'success' : 'neutral'} className="uppercase">
                  {tenantErpProbe?.authenticated ? 'Conectado' : tenantErp.enabled ? 'Configurado' : 'Não configurado'}
                </Badge>
                {tenantErp.endpoint && <span className="text-xs text-gray-500 ml-auto">{tenantErp.endpoint}</span>}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Canal técnico com a 3ESysten. Os dados da loja continuam no banco do Soft Nerd.
              </p>
              {tenantErpProbe && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                  <span className={tenantErpProbe.financeiro.success ? 'text-green-400' : 'text-amber-400'}>
                    Financeiro: {tenantErpProbe.financeiro.success ? 'escopo confirmado' : tenantErpProbe.financeiro.message}
                  </span>
                  <span className={tenantErpProbe.fiscal.success ? 'text-green-400' : 'text-amber-400'}>
                    Fiscal: {tenantErpProbe.fiscal.success ? 'escopo confirmado' : tenantErpProbe.fiscal.message}
                  </span>
                  <span className="text-gray-500">{tenantErpProbe.durationMs} ms</span>
                </div>
              )}
              <button
                onClick={testTenantErp}
                disabled={!tenantErp.enabled || testingTenantErp}
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30
                           border border-brand-500/30 text-sm text-brand-300 transition-colors disabled:opacity-50">
                {testingTenantErp
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                {testingTenantErp ? 'Testando conexão…' : 'Testar conexão'}
              </button>

              <div className="mt-4 border-t border-surface-600 pt-4">
                <p className="text-xs font-semibold uppercase text-gray-500">Consulta fiscal IBPT</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_90px_auto_auto]">
                  <input value={ibptNcm} onChange={event => setIbptNcm(event.target.value)} inputMode="numeric" maxLength={10} placeholder="NCM, ex.: 95044000" className="input w-full" />
                  <select value={ibptUf} onChange={event => setIbptUf(event.target.value)} className="input w-full">
                    {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => <option key={uf}>{uf}</option>)}
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-surface-500 bg-surface-700 px-3 text-xs text-gray-300">
                    <input type="checkbox" checked={ibptImportado} onChange={event => setIbptImportado(event.target.checked)} /> Importado
                  </label>
                  <button onClick={lookupIbpt} disabled={!tenantErp.enabled || ibptLoading} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/20 px-3 py-2 text-sm text-brand-300 disabled:opacity-50">
                    {ibptLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Consultar
                  </button>
                </div>
                {ibptResult && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {[
                      ['Federal', ibptResult.percentualFederal], ['Estadual', ibptResult.percentualEstadual],
                      ['Municipal', ibptResult.percentualMunicipal], ['Total', ibptResult.percentualTotal],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-lg bg-surface-700 p-2">
                        <p className="text-gray-500">{label as string}</p><p className="text-base font-bold text-white">{Number(value).toFixed(2)}%</p>
                      </div>
                    ))}
                    <p className="col-span-full text-gray-500">Versão {ibptResult.versao ?? 'não informada'} · {ibptResult.fonte ?? 'IBPT'}{ibptResult.vencida ? ' · tabela vencida' : ''}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cards de integrações */}
          {integracoes.map(int => {
            const info = INTEGRACAO_INFO[int.source]
            if (!info) return null
            const isReady = int.source === 'sefaz' ? sefazOk && !!int.cnpj : int.isConnected
            return (
              <div key={int.source} className={clsx(
                'card p-5 flex gap-4',
                isReady && 'border-green-500/20'
              )}>
                <div className="text-3xl flex-shrink-0 mt-0.5">{info.icon}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white">{info.label}</h3>
                    <Badge tone={isReady ? 'success' : 'neutral'} className="uppercase">
                      {isReady ? '✓ Conectado' : 'Não configurado'}
                    </Badge>
                    <span className="text-xs text-green-500 font-semibold ml-auto">Grátis</span>
                  </div>

                  <p className="text-sm text-gray-400 mt-1">{info.desc}</p>

                  {int.source === 'inter' && isReady && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 text-xs">
                        <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-gray-400">Saldo no banco:</span>
                        <strong className="text-emerald-300">
                          {interInfo.saldo != null ? fmtMoeda(interInfo.saldo) : '—'}
                        </strong>
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Atualiza sozinho a cada 15 min
                        {interInfo.lastSyncAt ? ` · última: ${fmtDate(interInfo.lastSyncAt)}` : ''}
                      </span>
                    </div>
                  )}
                  {int.lastSyncAt && int.source !== 'inter' && (
                    <p className="text-xs text-gray-500 mt-1">Última sincronização: {fmtDate(int.lastSyncAt)}</p>
                  )}
                  {int.cnpj && (
                    <p className="text-xs text-gray-500 mt-0.5">CNPJ: {int.cnpj}</p>
                  )}
                  {int.pixKey && (
                    <p className="text-xs text-gray-500 mt-0.5">Chave Pix: {int.pixKey}</p>
                  )}

                  {int.source === 'sefaz' && !sefazOk && (
                    <div className="flex items-center gap-2 mt-2 text-amber-400 text-xs bg-amber-500/10 rounded-lg p-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      Requer certificado A1 e CNPJ/UF configurados em Admin → Fiscal.
                    </div>
                  )}
                  {int.source === 'sefaz' && sefazOk && !int.isActive && (
                    <div className="flex items-center gap-2 mt-2 text-amber-400 text-xs bg-amber-500/10 rounded-lg p-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      Certificado ok. Clique em Configurar e salve para ativar a consulta automática (a cada 2h).
                    </div>
                  )}
                  {int.source === 'sefaz' && sefazCooldownAtivo && (
                    <div className="flex items-center gap-2 mt-2 text-amber-400 text-xs bg-amber-500/10 rounded-lg p-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      Intervalo de segurança do SEFAZ. Nova consulta disponível em {fmtTempoRestante(sefazTempoRestante)}
                      {sefazProximaConsultaEm ? ` (${fmtDate(sefazProximaConsultaEm)})` : ''}.
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => openConfig(int.source, int)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-500
                                 border border-surface-500 text-sm text-gray-300 transition-colors">
                      <Settings className="w-3.5 h-3.5" />
                      {isReady ? 'Reconfigurar' : 'Configurar'}
                    </button>
                    {int.source === 'inter' && isReady && (
                      <button
                        onClick={syncInterAgora}
                        disabled={syncingInter}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30
                                   border border-brand-500/30 text-sm text-brand-300 transition-colors disabled:opacity-50">
                        {syncingInter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {syncingInter ? 'Sincronizando…' : 'Atualizar do banco agora'}
                      </button>
                    )}
                    {int.source === 'sefaz' && sefazOk && (
                      <button
                        onClick={syncSefazAgora}
                        disabled={syncingSefaz || sefazCooldownAtivo}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30
                                   border border-brand-500/30 text-sm text-brand-300 transition-colors disabled:opacity-50">
                        {syncingSefaz ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {syncingSefaz
                          ? 'Consultando SEFAZ…'
                          : sefazCooldownAtivo
                            ? `Aguarde ${fmtTempoRestante(sefazTempoRestante)}`
                            : 'Sincronizar agora'}
                      </button>
                    )}
                    {info.docs && (
                      <a href={info.docs} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
                        Documentação <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Card OFX — sempre disponível */}
          <div className="card p-5 flex gap-4">
            <div className="text-3xl flex-shrink-0 mt-0.5">📂</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white">Extrato OFX (Manual)</h3>
                <span className="text-xs text-green-500 font-semibold ml-auto">Grátis · Sempre disponível</span>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Importe arquivos .OFX exportados pelo seu banco. Funciona com qualquer banco: Sicredi, Nubank, Inter, Bradesco, Itaú e outros.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                No banco: <span className="text-gray-400">Extratos → Exportar → OFX</span>
              </p>
              <label className={clsx(
                'inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg',
                'bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/30',
                'text-brand-300 text-sm font-semibold cursor-pointer transition-colors',
                ofxLoading && 'opacity-60 pointer-events-none')}>
                {ofxLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {ofxLoading ? 'Importando…' : 'Importar arquivo OFX'}
                <input type="file" accept=".ofx,.OFX" className="hidden" onChange={handleOfxUpload} />
              </label>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-3 p-4 bg-surface-800/50 rounded-2xl border border-surface-700/50 text-sm text-gray-400">
            <Info className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <p>
              Todas as integrações são gratuitas e não exigem contrato com terceiros.
              Pluggy, Belvo e similares são pagos e não são necessários aqui.
              Inter e Mercado Pago exigem apenas que o estabelecimento tenha conta nessas plataformas.
            </p>
          </div>
        </div>
      )}

      {/* Modal de configuração */}
      {configModal && cfgInfo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-white">{cfgInfo.icon} {cfgInfo.label}</h2>
              <button onClick={() => setConfigModal(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-400">{cfgInfo.desc}</p>

            <div className="flex flex-col gap-3">
              {cfgInfo.fields.includes('cnpj') && (
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">CNPJ do estabelecimento</label>
                  <input
                    value={configModal.cnpj}
                    onChange={e => setConfigModal(m => m ? { ...m, cnpj: e.target.value } : m)}
                    placeholder="00.000.000/0001-00" className="input w-full" />
                </div>
              )}
              {cfgInfo.fields.includes('clientId') && (
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Client ID</label>
                  <input
                    value={configModal.clientId}
                    onChange={e => setConfigModal(m => m ? { ...m, clientId: e.target.value } : m)}
                    placeholder="Client ID da API" className="input w-full" />
                </div>
              )}
              {cfgInfo.fields.includes('clientSecret') && (
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Client Secret</label>
                  <input
                    value={configModal.clientSecret}
                    onChange={e => setConfigModal(m => m ? { ...m, clientSecret: e.target.value } : m)}
                    type="password" placeholder="Client Secret da API" className="input w-full" />
                </div>
              )}
              {cfgInfo.fields.includes('pixKey') && (
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Chave Pix cadastrada</label>
                  <input
                    value={configModal.pixKey}
                    onChange={e => setConfigModal(m => m ? { ...m, pixKey: e.target.value } : m)}
                    placeholder="CNPJ, e-mail, telefone ou chave aleatória" className="input w-full" />
                  <p className="text-xs text-gray-500 mt-1">Usada para gerar cobranças Pix no Crediário e Comandas.</p>
                </div>
              )}

              {configModal.source === 'inter' && (
                <div className="border border-surface-500 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 font-semibold flex-1">
                      Certificado mTLS (.crt + .key)
                    </label>
                    {configModal.certOk
                      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">✓ Instalado</span>
                      : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Ausente</span>
                    }
                  </div>
                  <p className="text-xs text-gray-500">
                    Baixe o par de arquivos no portal Inter Developer ({'"'}Meus Certificados{'"'}) e faça upload dos dois juntos.
                  </p>
                  <label className={clsx(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm font-semibold w-fit',
                    configModal.certUploading
                      ? 'opacity-60 pointer-events-none bg-surface-700 text-gray-400'
                      : 'bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/30 text-brand-300',
                  )}>
                    {configModal.certUploading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Instalando…</>
                      : <><Upload className="w-3.5 h-3.5" /> Selecionar .crt e .key</>
                    }
                    <input
                      type="file"
                      accept=".crt,.key,.pem"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? [])
                        const crt = files.find(f => f.name.endsWith('.crt') || f.name.endsWith('.pem'))
                        const key = files.find(f => f.name.endsWith('.key'))
                        if (!crt || !key) { toast.error('Selecione um arquivo .crt e um .key juntos'); return }
                        uploadCertificado(crt, key)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {cfgInfo.docs && (
              <a href={cfgInfo.docs} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
                Ver documentação da API <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <div className="flex gap-3">
              <button onClick={() => setConfigModal(null)} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-surface-700 text-gray-300 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={saveConfig} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50
                           text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
