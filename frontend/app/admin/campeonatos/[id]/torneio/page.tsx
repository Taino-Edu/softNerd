'use client'

// =============================================================================
// /admin/campeonatos/[id]/torneio — Painel do organizador da liguinha
//
// Preparar (código + melhor de + tempo) → check-in → gerar rodada → resolver
// divergências → próxima rodada → encerrar (colocação vai pra Liga Mensal).
// Atualiza sozinho pelo /hubs/torneio. Regras: Services/Liga/TorneioService.cs.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  ArrowLeft, Loader2, Swords, Play, RefreshCw, Flag, Monitor, Copy, AlertTriangle, CheckCircle2, UserX,
} from 'lucide-react'
import { torneioApi, PainelTorneioDto, MesaDto, ResultadoPartida } from '@/lib/api'
import { useTorneioAoVivo } from '@/lib/useTorneioAoVivo'
import { Switch } from '@/components/ui/Switch'
import Relogio from '@/components/liga/Relogio'
import TabelaTorneio from '@/components/liga/TabelaTorneio'

function mensagemDe(e: unknown, padrao: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? padrao
}

const LANCOU: Record<ResultadoPartida, (m: MesaDto) => string> = {
  VitoriaA: m => `${m.a.nome} venceu`,
  VitoriaB: m => `${m.b?.nome ?? '—'} venceu`,
  Empate:   () => 'Empate',
}

export default function PainelTorneioPage() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<PainelTorneioDto | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [melhorDe, setMelhorDe] = useState(1)
  const [minutos, setMinutos] = useState(50)
  const [rodadas, setRodadas] = useState<number | ''>('')

  const recarregar = useCallback(() => {
    torneioApi.painel(id)
      .then(r => { setP(r.data); setErro('') })
      .catch(e => setErro(mensagemDe(e, 'Não deu pra carregar o torneio.')))
  }, [id])

  useEffect(() => { recarregar() }, [recarregar])
  useTorneioAoVivo(id, recarregar)

  // Formulário começa com o que está salvo
  useEffect(() => {
    if (!p) return
    setMelhorDe(p.melhorDe)
    setMinutos(p.minutosRodada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id])

  async function acao(nome: string, fn: () => Promise<unknown>, ok?: string) {
    setOcupado(nome)
    try {
      await fn()
      if (ok) toast.success(ok)
      recarregar()
    } catch (e) {
      toast.error(mensagemDe(e, 'Não deu certo.'))
    } finally {
      setOcupado(null)
    }
  }

  if (!p) {
    return (
      <div className="flex justify-center py-16">
        {erro ? <p className="txt-erro">{erro}</p> : <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />}
      </div>
    )
  }

  const preparado = p.formato === 'Suico' && !!p.codigoEntrada
  const encerrado = p.status === 'Finalizado'
  const presentes = p.participantes.filter(x => x.checkInEm && !x.desistiuNaRodada)
  const abertas = p.mesas.filter(m => !m.resultado)
  const divergentes = p.mesas.filter(m => m.divergente)
  const ultimaRodada = p.numeroRodadas !== null && p.rodadaAtual >= p.numeroRodadas

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/campeonatos" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Campeonatos
        </Link>
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Swords className="w-5 h-5 text-brand-400" /> {p.nome}</h1>
        <Link href={`/liga/torneio/${p.id}`} target="_blank" className="ml-auto btn-secondary text-sm">
          <Monitor className="w-4 h-4" /> Abrir telão
        </Link>
      </div>

      {/* ── 1. Preparar ─────────────────────────────────────────────────── */}
      {!encerrado && p.rodadaAtual === 0 && (
        <section className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-white">1. Configurar e abrir o check-in</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Partida</span>
              <select value={melhorDe} onChange={e => setMelhorDe(Number(e.target.value))} className="input">
                <option value={1}>Melhor de 1</option>
                <option value={3}>Melhor de 3</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Minutos por rodada</span>
              <input type="number" min={5} max={180} value={minutos}
                onChange={e => setMinutos(Number(e.target.value))} className="input w-28" />
            </label>
            <button
              onClick={() => acao('preparar', () => torneioApi.preparar(id, { melhorDe, minutosRodada: minutos }),
                preparado ? 'Configuração salva.' : 'Check-in aberto!')}
              disabled={ocupado !== null} className="btn-primary">
              {ocupado === 'preparar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {preparado ? 'Salvar' : 'Abrir check-in'}
            </button>
          </div>
        </section>
      )}

      {/* ── Código ──────────────────────────────────────────────────────── */}
      {preparado && !encerrado && (
        <section className="bg-surface-800 border border-surface-500 rounded-2xl p-5 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400">Código pros jogadores (santuarionerd.com/liga/jogar)</p>
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-white">{p.codigoEntrada}</p>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => { navigator.clipboard?.writeText(p.codigoEntrada!); toast.success('Código copiado') }}
              className="btn-secondary text-sm"><Copy className="w-4 h-4" /> Copiar</button>
            <button onClick={() => confirm('Gerar um código novo? O antigo para de funcionar (quem já entrou continua).')
                && acao('codigo', () => torneioApi.novoCodigo(id), 'Código novo gerado.')}
              disabled={ocupado !== null} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /> Trocar</button>
          </div>
        </section>
      )}

      {/* ── Rodada atual ────────────────────────────────────────────────── */}
      {preparado && !encerrado && (
        <section className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold text-white">
              {p.rodadaAtual === 0 ? '2. Iniciar' : `Rodada ${p.rodadaAtual}${p.numeroRodadas ? ` de ${p.numeroRodadas}` : ''}`}
            </h2>
            {p.rodadaAtual > 0 && (
              <span className="text-sm text-gray-400">
                {abertas.length === 0 ? 'todas as partidas fechadas' : `${abertas.length} partida(s) em aberto`}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {p.rodadaAtual === 0 && (
                <label className="text-sm flex items-center gap-2 text-gray-400">
                  Rodadas
                  <input type="number" min={1} max={20} value={rodadas} placeholder={String(p.rodadasSugeridas || '')}
                    onChange={e => setRodadas(e.target.value ? Number(e.target.value) : '')} className="input w-20" />
                </label>
              )}
              {(!ultimaRodada || p.rodadaAtual === 0) && (
                <button
                  onClick={() => acao('rodada', () => torneioApi.gerarRodada(id, p.rodadaAtual === 0 && rodadas ? rodadas : undefined),
                    `Rodada ${p.rodadaAtual + 1} gerada!`)}
                  disabled={ocupado !== null || (p.rodadaAtual > 0 && abertas.length > 0) || (p.rodadaAtual === 0 && presentes.length < 2)}
                  className="btn-primary">
                  {ocupado === 'rodada' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {p.rodadaAtual === 0 ? `Gerar rodada 1 (${presentes.length} presentes)` : `Gerar rodada ${p.rodadaAtual + 1}`}
                </button>
              )}
              {p.rodadaAtual > 0 && (
                <button
                  onClick={() => confirm('Encerrar o torneio? A classificação vira a colocação final e vai pra Liga Mensal.')
                    && acao('encerrar', () => torneioApi.encerrar(id), 'Torneio encerrado!')}
                  disabled={ocupado !== null || abertas.length > 0}
                  className={ultimaRodada ? 'btn-primary' : 'btn-secondary'}>
                  {ocupado === 'encerrar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} Encerrar
                </button>
              )}
            </div>
          </div>

          {p.rodadaAtual === 0 && presentes.length === 0 && p.participantes.length > 0 && (
            <p className="text-sm txt-alerta">
              Ninguém fez check-in ainda. Se gerar assim, jogam todos os inscritos com vaga (e pagos, se tiver taxa).
            </p>
          )}

          {p.rodadaAtual > 0 && <Relogio timer={p.timer} />}

          {divergentes.length > 0 && (
            <p className="text-sm txt-alerta flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {divergentes.length} mesa(s) com resultados diferentes — decida abaixo.
            </p>
          )}

          {p.mesas.length > 0 && (
            <div className="space-y-2">
              {p.mesas.map(m => (
                <Mesa key={m.partidaId} m={m} ocupado={ocupado !== null}
                  resolver={r => acao(`m${m.partidaId}`, () => torneioApi.resolver(id, m.partidaId, r))} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Classificação ───────────────────────────────────────────────── */}
      {p.classificacao.length > 0 && (
        <div>
          {encerrado && <p className="text-sm txt-ok mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Torneio encerrado — colocações gravadas e somadas na Liga Mensal.</p>}
          <TabelaTorneio linhas={p.classificacao} grande />
        </div>
      )}

      {/* ── Jogadores ───────────────────────────────────────────────────── */}
      <section className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-white">
          Jogadores <span className="text-sm font-normal text-gray-400">({presentes.length} presentes de {p.participantes.length} inscritos)</span>
        </h2>
        {p.participantes.length === 0 && (
          <p className="text-sm text-gray-400">Ninguém inscrito ainda. Jogadores com conta entram pelo código; os outros você adiciona na tela de campeonatos.</p>
        )}
        <div className="divide-y divide-surface-500">
          {p.participantes.map(x => (
            <div key={x.id} className="flex items-center gap-3 py-2">
              <span className="w-8 text-xs text-gray-500">#{x.playerNumber}</span>
              <span className="flex-1 min-w-0">
                <span className={clsx('block text-sm truncate', x.desistiuNaRodada ? 'text-gray-500 line-through' : 'text-white')}>{x.nome}</span>
                <span className="block text-xs text-gray-400 truncate">
                  {x.deck ?? 'sem deck'}{!x.pago ? ' · inscrição não paga' : ''}
                  {x.desistiuNaRodada ? ` · saiu na rodada ${x.desistiuNaRodada}` : ''}
                </span>
              </span>
              {!encerrado && !x.desistiuNaRodada && (
                <>
                  <span className="text-xs text-gray-400">presente</span>
                  <Switch ligado={!!x.checkInEm} label={`Presença de ${x.nome}`} disabled={ocupado !== null}
                    onChange={v => acao(`c${x.id}`, () => torneioApi.checkIn(id, x.id, v))} />
                  {p.rodadaAtual > 0 && (
                    <button title="Registrar desistência"
                      onClick={() => confirm(`${x.nome} desistiu? Ele sai das próximas rodadas.`)
                        && acao(`d${x.id}`, () => torneioApi.desistencia(id, x.id), 'Desistência registrada.')}
                      className="text-gray-500 hover:text-white p-1"><UserX className="w-4 h-4" /></button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Mesa({ m, resolver, ocupado }: { m: MesaDto; resolver: (r: ResultadoPartida) => void; ocupado: boolean }) {
  if (!m.b) {
    return (
      <div className="bg-surface-700 rounded-xl px-4 py-3 text-sm text-gray-300">
        <span className="font-semibold text-white">{m.a.nome}</span> — bye (vitória automática)
      </div>
    )
  }
  const opcoes: { r: ResultadoPartida; rotulo: string }[] = [
    { r: 'VitoriaA', rotulo: m.a.nome.split(' ')[0] },
    { r: 'Empate', rotulo: 'Empate' },
    { r: 'VitoriaB', rotulo: m.b.nome.split(' ')[0] },
  ]
  return (
    <div className={clsx('bg-surface-700 rounded-xl px-4 py-3 space-y-2', m.divergente && 'border border-surface-400')}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-8 h-8 rounded-lg bg-surface-600 flex items-center justify-center font-bold text-white shrink-0">{m.mesa}</span>
        <span className="text-white font-semibold">{m.a.nome}</span>
        <span className="text-gray-500">×</span>
        <span className="text-white font-semibold">{m.b.nome}</span>
        {m.resultado
          ? <span className="ml-auto txt-ok text-xs flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {LANCOU[m.resultado](m)}</span>
          : m.divergente
            ? <span className="ml-auto txt-alerta text-xs flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> divergente</span>
            : <span className="ml-auto text-xs text-gray-400">em jogo</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 pl-10">
        <span>{m.a.nome.split(' ')[0]}: {m.reportA ? LANCOU[m.reportA](m) : 'não lançou'}</span>
        <span>{m.b.nome.split(' ')[0]}: {m.reportB ? LANCOU[m.reportB](m) : 'não lançou'}</span>
      </div>
      <div className="flex flex-wrap gap-2 pl-10">
        {opcoes.map(o => (
          <button key={o.r} disabled={ocupado} onClick={() => resolver(o.r)}
            className={clsx('text-xs px-3 py-1.5 rounded-lg', m.resultado === o.r ? 'btn-primary' : 'btn-secondary')}>
            {o.r === 'Empate' ? 'Empate' : `${o.rotulo} venceu`}
          </button>
        ))}
      </div>
    </div>
  )
}
