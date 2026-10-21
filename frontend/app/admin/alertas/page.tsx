'use client'
// =============================================================================
// /admin/alertas — Vigia do sistema (Configuração → Alertas do sistema, só o dono)
//
// O que os gatilhos acharam (a cada 10 min) e os erros de tela do site. Busca por texto,
// filtro por tipo/gravidade, "Resolver" (fica ciente: o mesmo caso não volta) e "Rodar agora".
// Regras: CardGameStore/Services/Vigia. Chave "vigia-sistema".
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Search, CheckCircle2, ShieldAlert, AlertTriangle, Info, ExternalLink } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import clsx from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { vigiaApi, AlertaSistemaDto, ResumoVigiaDto, GravidadeAlerta } from '@/lib/api'
import { dataHoraBR } from '@/lib/format'

const GRAVIDADE: Record<GravidadeAlerta, { rotulo: string; tom: 'danger' | 'warning' | 'info'; icone: typeof Info }> = {
  critico: { rotulo: 'Crítico', tom: 'danger',  icone: ShieldAlert },
  aviso:   { rotulo: 'Aviso',   tom: 'warning', icone: AlertTriangle },
  info:    { rotulo: 'Info',    tom: 'info',    icone: Info },
}

type Status = 'abertos' | 'resolvidos' | 'todos'

export default function AlertasPage() {
  const [resumo, setResumo] = useState<ResumoVigiaDto>()
  const [lista, setLista] = useState<AlertaSistemaDto[]>()
  const [status, setStatus] = useState<Status>('abertos')
  const [gravidade, setGravidade] = useState('')
  const [codigo, setCodigo] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [aberto, setAberto] = useState<string>()
  const [rodando, setRodando] = useState(false)

  const carregar = useCallback(() => {
    vigiaApi.resumo().then(r => setResumo(r.data)).catch(() => {})
    vigiaApi.alertas({ status, gravidade: gravidade || undefined, codigo: codigo || undefined, busca: buscaAplicada || undefined })
      .then(r => setLista(r.data))
      .catch(() => { setLista([]); toast.error('Não foi possível carregar os alertas.') })
  }, [status, gravidade, codigo, buscaAplicada])

  useEffect(() => { carregar() }, [carregar])
  // Busca enquanto digita, sem uma chamada por tecla
  useEffect(() => { const t = setTimeout(() => setBuscaAplicada(busca.trim()), 350); return () => clearTimeout(t) }, [busca])

  async function rodar() {
    setRodando(true)
    try {
      const { data } = await vigiaApi.rodar()
      toast.success(data.novos > 0 ? `${data.novos} alerta(s) novo(s).` : 'Tudo conferido — nada novo.')
      carregar()
    } catch { toast.error('Não deu pra rodar agora.') }
    finally { setRodando(false) }
  }

  async function resolver(a: AlertaSistemaDto) {
    if (!confirm(`Marcar como resolvido?\n\n${a.titulo}\n\nEsse mesmo caso não volta a aparecer.`)) return
    try { await vigiaApi.resolver(a.id); toast.success('Resolvido.'); carregar() }
    catch { toast.error('Não deu pra resolver.') }
  }

  const nomeDo = (c: string) => resumo?.verificacoes.find(v => v.codigo === c)?.nome ?? c

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-5xl">
      <Toaster position="top-center" />
      <PageHeader
        title="Alertas do sistema"
        subtitle="O sistema confere sozinho a cada 10 minutos o que pode ter ficado torto (Pix, pedidos, estoque) e registra os erros de tela do site."
        actions={
          <button onClick={rodar} disabled={rodando} className="btn-primary">
            {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Rodar agora
          </button>
        }
      />

      {resumo && !resumo.ligado && (
        <div className="card text-sm txt-alerta">O Vigia está desligado (Configuração → Mudanças com volta → &quot;vigia-sistema&quot;).</div>
      )}

      {resumo && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { rotulo: 'Abertos', n: resumo.resumo.abertos, cls: 'text-white' },
            { rotulo: 'Críticos', n: resumo.resumo.criticos, cls: resumo.resumo.criticos ? 'txt-erro' : 'text-white' },
            { rotulo: 'Avisos', n: resumo.resumo.avisos, cls: resumo.resumo.avisos ? 'txt-alerta' : 'text-white' },
          ].map(c => (
            <div key={c.rotulo} className="card !p-3 text-center">
              <p className={clsx('text-2xl font-bold', c.cls)}>{c.n}</p>
              <p className="text-xs text-gray-400">{c.rotulo}</p>
            </div>
          ))}
          <p className="col-span-3 text-xs text-gray-400">
            {resumo.resumo.ultimaVolta ? `Última conferência: ${dataHoraBR(resumo.resumo.ultimaVolta)}` : 'Ainda sem conferência desde que a API subiu.'}
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="card !p-3 flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar: cliente, produto, tela, Pix…"
            className="input w-full pl-9" aria-label="Buscar nos alertas" />
        </label>
        <select value={status} onChange={e => setStatus(e.target.value as Status)} className="input sm:w-36" aria-label="Situação">
          <option value="abertos">Abertos</option>
          <option value="resolvidos">Resolvidos</option>
          <option value="todos">Todos</option>
        </select>
        <select value={gravidade} onChange={e => setGravidade(e.target.value)} className="input sm:w-32" aria-label="Gravidade">
          <option value="">Gravidade</option>
          <option value="critico">Crítico</option>
          <option value="aviso">Aviso</option>
          <option value="info">Info</option>
        </select>
        <select value={codigo} onChange={e => setCodigo(e.target.value)} className="input sm:w-56" aria-label="Tipo de alerta">
          <option value="">Todos os tipos</option>
          {resumo?.verificacoes.map(v => <option key={v.codigo} value={v.codigo}>{v.nome}</option>)}
        </select>
      </div>

      {/* ── Lista ── */}
      {lista === undefined && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>}
      {lista?.length === 0 && (
        <div className="card text-sm text-gray-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 txt-ok" /> {status === 'abertos' ? 'Nenhum alerta aberto. Tudo certo por aqui.' : 'Nada encontrado com esses filtros.'}
        </div>
      )}
      <div className="space-y-2">
        {lista?.map(a => {
          const g = GRAVIDADE[a.gravidade] ?? GRAVIDADE.aviso
          const Icone = g.icone
          const expandido = aberto === a.id
          return (
            <div key={a.id} className={clsx('card !p-3 space-y-2', a.resolvidoEm && 'opacity-70')}>
              <button onClick={() => setAberto(expandido ? undefined : a.id)} className="w-full text-left flex items-start gap-3">
                <Icone className={clsx('w-5 h-5 shrink-0 mt-0.5', a.gravidade === 'critico' ? 'txt-erro' : a.gravidade === 'aviso' ? 'txt-alerta' : 'text-gray-400')} />
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white break-words">{a.titulo}</span>
                    <Badge tone={g.tom}>{g.rotulo}</Badge>
                    {a.ocorrencias > 1 && <Badge tone="neutral">{a.ocorrencias}×</Badge>}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {nomeDo(a.codigo)} · desde {dataHoraBR(a.criadoEm)}{a.ocorrencias > 1 ? ` · última vez ${dataHoraBR(a.ultimaVezEm)}` : ''}
                    {a.resolvidoEm && ` · resolvido ${a.resolvidoPor === 'sozinho' ? 'sozinho (o problema sumiu)' : `por ${a.resolvidoPor}`} em ${dataHoraBR(a.resolvidoEm)}`}
                  </span>
                </span>
              </button>
              {expandido && (
                <div className="pl-8 space-y-2">
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words bg-surface-700 rounded-lg p-3 font-sans">{a.detalhe}</pre>
                  <div className="flex flex-wrap gap-2">
                    {a.link && (
                      <Link href={a.link} className="btn-secondary text-sm"><ExternalLink className="w-4 h-4" /> Abrir a tela</Link>
                    )}
                    {!a.resolvidoEm && (
                      <button onClick={() => resolver(a)} className="btn-secondary text-sm"><CheckCircle2 className="w-4 h-4" /> Resolver</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
