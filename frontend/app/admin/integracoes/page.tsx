'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import {
  CheckCircle, XCircle, Settings, Loader2, RefreshCw,
  Upload, Info, ExternalLink, X, Save, Wallet,
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
}

const fmtMoeda = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function IntegracoesPage() {
  const [integracoes, setIntegracoes] = useState<IntegracaoStatus[]>([])
  const [loading,     setLoading]     = useState(true)
  const [configModal, setConfigModal] = useState<ConfigModal | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [syncingInter, setSyncingInter] = useState(false)
  /** Saldo e última sincronização lidos do Inter — a tela mostra sem ninguém conferir. */
  const [interInfo, setInterInfo] = useState<{ saldo: number | null; lastSyncAt: string | null }>(
    { saldo: null, lastSyncAt: null },
  )

  async function load() {
    setLoading(true)
    try {
      const { data: ints } = await api.get('/api/contas-receber/integracoes')
      setIntegracoes(ints)
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
          {/* Cards de integrações */}
          {integracoes.map(int => {
            const info = INTEGRACAO_INFO[int.source]
            if (!info) return null
            const isReady = int.isConnected
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

          {/* Info */}
          <div className="flex items-start gap-3 p-4 bg-surface-800/50 rounded-2xl border border-surface-700/50 text-sm text-gray-400">
            <Info className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <p>
              A integração com o Inter é gratuita: só exige a conta PJ da loja e o certificado gerado no portal do Inter.
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
