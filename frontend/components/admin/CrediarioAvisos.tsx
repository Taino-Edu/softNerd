'use client'
// Lembretes de vencimento do crediário: configuração do robô, envio manual com
// prévia (e WhatsApp pelo próprio celular quando o da loja não está pareado) e a
// linha de "último aviso" que aparece em cada conta.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Switch } from '@/components/ui/Switch'
import { Bell, BellOff, Copy, Link2, Loader2, MessageCircle, Send, X } from 'lucide-react'
import {
  crediarioApi, CrediariosDto, AvisoCrediarioDto, CrediarioAvisoConfigDto, PreviaAvisoCrediarioDto,
} from '@/lib/api'

const CANAL_LABEL: Record<string, string> = {
  app:      'App',
  email:    'E-mail',
  whatsapp: 'WhatsApp',
}

// Dias em relação ao vencimento que o admin pode escolher
const MARCOS_ANTES  = [-7, -3, -1]
const MARCOS_DEPOIS = [1, 3, 7, 15, 30]

function nomeMarco(m: number) {
  if (m === 0) return 'No dia'
  if (m < 0)   return m === -1 ? '1 dia antes' : `${-m} dias antes`
  return m === 1 ? '1 dia depois' : `${m} dias depois`
}

function mensagemErro(err: unknown, padrao: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao
}


// ── Botão do cabeçalho: mostra se está ligado e abre a configuração ─────────

export function AvisosAutomaticosButton() {
  const [cfg, setCfg]     = useState<CrediarioAvisoConfigDto | null>(null)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    crediarioApi.avisoConfig().then(r => setCfg(r.data)).catch(() => {})
  }, [])

  return (
    <>
      <button onClick={() => setAberto(true)} className="btn-secondary shrink-0">
        {cfg?.ativo === false
          ? <BellOff className="w-4 h-4 text-gray-400" />
          : <Bell className="w-4 h-4 text-amber-400" />}
        Avisos {cfg ? (cfg.ativo ? 'ligados' : 'desligados') : ''}
      </button>
      {aberto && cfg && (
        <AvisosConfigModal inicial={cfg} onClose={() => setAberto(false)} onSaved={setCfg} />
      )}
    </>
  )
}

function AvisosConfigModal({
  inicial, onClose, onSaved,
}: {
  inicial: CrediarioAvisoConfigDto
  onClose: () => void
  onSaved: (c: CrediarioAvisoConfigDto) => void
}) {
  const [cfg, setCfg]       = useState(inicial)
  const [salvando, setSalvando] = useState(false)

  const set = <K extends keyof CrediarioAvisoConfigDto>(k: K, v: CrediarioAvisoConfigDto[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }))

  function alternarMarco(m: number) {
    set('marcos', cfg.marcos.includes(m)
      ? cfg.marcos.filter(x => x !== m)
      : [...cfg.marcos, m].sort((a, b) => a - b))
  }

  async function salvar() {
    setSalvando(true)
    try {
      const { data } = await crediarioApi.salvarAvisoConfig(cfg)
      onSaved(data)
      toast.success(data.ativo ? 'Avisos automáticos salvos' : 'Avisos automáticos desligados')
      onClose()
    } catch (err) {
      toast.error(mensagemErro(err, 'Erro ao salvar os avisos'))
    } finally {
      setSalvando(false)
    }
  }

  const chip = (m: number) => (
    <button
      key={m}
      type="button"
      onClick={() => alternarMarco(m)}
      className={clsx(
        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
        // Marcado = sólido; o azul clarinho de antes sumia no tema claro e parecia desligado
        cfg.marcos.includes(m)
          ? 'bg-brand-500 border-brand-500 text-white font-semibold'
          : 'bg-surface-700 border-surface-500 text-gray-400 hover:text-white',
      )}
    >
      {nomeMarco(m)}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500 shrink-0">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" /> Avisos de vencimento
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">O sistema lembra o cliente sozinho, nos dias escolhidos</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center justify-between gap-4 bg-surface-700 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Avisos automáticos</p>
              <p className="text-xs text-gray-400">
                {cfg.ativo
                  ? 'Ligado: o sistema manda os lembretes nos dias marcados abaixo'
                  : 'Desligado: nada sai sozinho — o botão "Avisar" continua funcionando'}
              </p>
            </div>
            <Switch ligado={cfg.ativo} onChange={v => set('ativo', v)} label="Avisos automáticos" />
          </div>

          <fieldset disabled={!cfg.ativo} className={clsx('space-y-5', !cfg.ativo && 'opacity-50')}>
            <div>
              <p className="label">Quando avisar</p>
              <div className="flex flex-wrap gap-2">
                {MARCOS_ANTES.map(chip)}
                {chip(0)}
                {MARCOS_DEPOIS.map(chip)}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Cada aviso sai uma vez por vencimento. Se o prazo for prorrogado, os avisos recomeçam pela data nova.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="hora-envio">Horário</label>
              <select
                id="hora-envio"
                className="input w-40"
                value={cfg.horaEnvio}
                onChange={e => set('horaEnvio', Number(e.target.value))}
              >
                {Array.from({ length: 14 }, (_, i) => i + 6).map(h => (
                  <option key={h} value={h}>a partir das {h}h</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Horário de Brasília. Depois das 20h nada é enviado.</p>
            </div>

            <div className="space-y-2">
              <p className="label">Por onde</p>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-200">Notificação no app e push no celular</span>
                <Switch ligado={cfg.canalApp} onChange={v => set('canalApp', v)} label="App e push" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-200">E-mail</span>
                <Switch ligado={cfg.canalEmail} onChange={v => set('canalEmail', v)} label="E-mail" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-200">
                  WhatsApp da loja
                  <span className={clsx('ml-2 text-[11px]', cfg.whatsAppConectado ? 'txt-ok' : 'txt-alerta')}>
                    {cfg.whatsAppConectado ? '● conectado' : '● não conectado'}
                  </span>
                </span>
                <Switch ligado={cfg.canalWhatsApp} onChange={v => set('canalWhatsApp', v)} label="WhatsApp" />
              </div>
              {cfg.canalWhatsApp && !cfg.whatsAppConectado && (
                <p className="text-[11px] txt-alerta">
                  O WhatsApp da loja não está pareado agora — os avisos por ele vão falhar até ler o QR Code em Atendimento → WhatsApp.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 bg-surface-700 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm text-white">Resumo do dia pra você</p>
                <p className="text-xs text-gray-400">Quem vence hoje, quem está atrasado e quanto — no sininho e no push</p>
              </div>
              <Switch ligado={cfg.resumoAdmin} onChange={v => set('resumoAdmin', v)} label="Resumo do dia" />
            </div>

            <div>
              <label className="label" htmlFor="mensagem-extra">Recado no fim da mensagem (opcional)</label>
              <textarea
                id="mensagem-extra"
                className="input min-h-[64px]"
                maxLength={300}
                placeholder="Ex.: Pix: santuarionerd@gmail.com"
                value={cfg.mensagemExtra ?? ''}
                onChange={e => set('mensagemExtra', e.target.value)}
              />
            </div>
          </fieldset>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-surface-500 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="btn-primary flex-1 justify-center">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Avisar agora (uma conta) ────────────────────────────────────────────────

export function AvisarModal({
  crediario, onClose, onSuccess,
}: {
  crediario: CrediariosDto
  onClose: () => void
  onSuccess: () => void
}) {
  const [previa, setPrevia]     = useState<PreviaAvisoCrediarioDto | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    crediarioApi.previaAviso(crediario.id)
      .then(r => setPrevia(r.data))
      .catch(err => { toast.error(mensagemErro(err, 'Erro ao montar o aviso')); onClose() })
    // onClose vem como arrow nova a cada render da página — só a conta importa aqui
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crediario.id])

  async function enviar() {
    setEnviando(true)
    try {
      const { data } = await crediarioApi.avisarAgora(crediario.id)
      const canais = data.canais.map(c => CANAL_LABEL[c] ?? c).join(', ')
      if (data.falhas) toast(`Enviado por ${canais}. Falhou: ${data.falhas}`, { icon: '⚠️', duration: 6000 })
      else toast.success(`Aviso enviado por ${canais}`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(mensagemErro(err, 'Erro ao enviar o aviso'))
    } finally {
      setEnviando(false)
    }
  }

  async function copiar() {
    if (!previa) return
    try {
      await navigator.clipboard.writeText(previa.texto)
      toast.success('Mensagem copiada')
    } catch {
      toast.error('Não deu pra copiar')
    }
  }

  // Link público de pagamento (/pagar/{token}) — o mesmo que vai dentro do aviso
  async function copiarLink() {
    if (!crediario.pagamentoToken) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pagar/${crediario.pagamentoToken}`)
      toast.success('Link de pagamento copiado')
    } catch {
      toast.error('Não deu pra copiar')
    }
  }

  // Sem o WhatsApp da loja pareado, dá pra mandar do próprio celular com o texto pronto
  const waLink = previa?.whatsApp
    ? `https://wa.me/55${previa.whatsApp}?text=${encodeURIComponent(previa.texto)}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-500 shrink-0">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <Send className="w-5 h-5 text-brand-400" /> Avisar cliente
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{crediario.userName}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          {!previa ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (
            <>
              <div className="bg-surface-900 border border-surface-500 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-2">{previa.titulo}</p>
                <p className="text-sm text-gray-200 whitespace-pre-line">{previa.texto}</p>
              </div>
              <p className="text-xs text-gray-400">
                {previa.canaisDisponiveis.length > 0
                  ? <>Vai por: <span className="text-gray-200">{previa.canaisDisponiveis.map(c => CANAL_LABEL[c] ?? c).join(', ')}</span></>
                  : 'Nenhum canal ligado na configuração dos avisos — use o WhatsApp do seu celular.'}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 px-6 py-4 border-t border-surface-500 shrink-0">
          <button
            type="button"
            onClick={enviar}
            disabled={!previa || enviando || previa.canaisDisponiveis.length === 0}
            className="btn-primary justify-center"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar aviso
          </button>
          <div className="flex gap-2">
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 justify-center">
                <MessageCircle className="w-4 h-4 text-green-400" /> Pelo meu WhatsApp
              </a>
            )}
            <button type="button" onClick={copiar} disabled={!previa} className="btn-secondary flex-1 justify-center">
              <Copy className="w-4 h-4" /> Copiar texto
            </button>
          </div>
          {crediario.pagamentoToken && (
            <button type="button" onClick={copiarLink} className="btn-secondary justify-center">
              <Link2 className="w-4 h-4" /> Copiar link de pagamento por Pix
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Linha "último aviso" do card ────────────────────────────────────────────

export function UltimoAviso({ avisos }: { avisos: AvisoCrediarioDto[] }) {
  if (avisos.length === 0) return null
  const a = avisos[0]
  const quando = new Date(a.enviadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const canais = a.canais.map(c => CANAL_LABEL[c] ?? c).join(', ') || 'nenhum canal'

  return (
    <span
      className={clsx('flex items-center gap-1', a.falhas ? 'txt-alerta' : 'text-gray-400')}
      title={[
        `${avisos.length} aviso(s) enviado(s)`,
        a.falhas ? `Falhou: ${a.falhas}` : null,
      ].filter(Boolean).join('\n')}
    >
      <Bell className="w-3 h-3" />
      Avisado {quando} · {canais}{a.automatico ? '' : ' (manual)'}
    </span>
  )
}
