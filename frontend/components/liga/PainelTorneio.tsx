'use client'

// =============================================================================
// PainelTorneio — Painel do organizador da liguinha (era a página
// /admin/campeonatos/[id]/torneio; virou componente pra Central da Liguinha
// usar na aba "Painel" sem duplicar — a página antiga só embrulha este)
//
// Preparar (código + melhor de + tempo + lugares) → check-in → soltar pareamentos →
// começar rodada (relógio) → resolver divergências → próxima rodada → encerrar
// (colocação vai pra Liga Mensal).
// Atualiza sozinho pelo /hubs/torneio. Regras: Services/Liga/TorneioService.cs.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  ArrowLeft, Loader2, Swords, Play, RefreshCw, Flag, Monitor, Copy, AlertTriangle, CheckCircle2, UserX, ThumbsUp,
} from 'lucide-react'
import { torneioApi, PainelTorneioDto, MesaDto, ResultadoPartida, rodadaComecou, mesasDeSetup } from '@/lib/api'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
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

/** embutido: dentro da Central (sem o "← Campeonatos" e o título, que a Central já mostra).
 *  somaNaLiga: false em campeonato avulso (modalidade Campeonato) — muda só os textos de encerrar. */
export default function PainelTorneio({ id, embutido = false, somaNaLiga = true }: { id: string; embutido?: boolean; somaNaLiga?: boolean }) {
  const [p, setP] = useState<PainelTorneioDto | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [melhorDe, setMelhorDe] = useState(1)
  const [minutos, setMinutos] = useState(50)
  const [lugares, setLugares] = useState(24)
  const [rodadas, setRodadas] = useState<number | ''>('')

  const recarregar = useCallback(() => {
    torneioApi.painel(id)
      .then(r => { setP(r.data); setErro('') })
      .catch(e => setErro(mensagemDe(e, 'Não deu pra carregar o torneio.')))
  }, [id])

  useEffect(() => { recarregar() }, [recarregar])
  useTorneioAoVivo(id, recarregar)

  // "Estou pronto" (chave liguinha-pronto-na-mesa): quando a última mesa fica pronta, avisa
  // com som e toast — o organizador pode estar longe do computador, olhando as mesas.
  const prontoLigado = useFuncionalidade('liguinha-pronto-na-mesa') !== false
  const setupAgora = p && p.rodadaAtual > 0 && !rodadaComecou(p.timer, p.rodadaAtual) ? mesasDeSetup(p.mesas) : null
  const todasProntas = !!prontoLigado && !!setupAgora?.todas
  const avisouRodada = useRef<number | null>(null)
  useEffect(() => {
    if (!todasProntas || !p || avisouRodada.current === p.rodadaAtual) return
    avisouRodada.current = p.rodadaAtual
    toast.success(`Todas as mesas prontas! Pode começar a rodada ${p.rodadaAtual}.`, { duration: 8000 })
    tocarAviso()
  }, [todasProntas, p])

  // Formulário começa com o que está salvo
  useEffect(() => {
    if (!p) return
    setMelhorDe(p.melhorDe)
    setMinutos(p.minutosRodada)
    setLugares(p.lugares)
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
  // Pareamentos soltos mas o relógio ainda parado: falta o "Começar rodada"
  const esperandoComecar = p.rodadaAtual > 0 && !rodadaComecou(p.timer, p.rodadaAtual) && abertas.length > 0

  return (
    <div className="space-y-6 max-w-5xl">
      {!embutido && (
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/campeonatos" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Campeonatos
          </Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Swords className="w-5 h-5 text-brand-400" /> {p.nome}</h1>
          <Link href={`/liga/torneio/${p.id}`} target="_blank" className="ml-auto btn-secondary text-sm">
            <Monitor className="w-4 h-4" /> Abrir telão
          </Link>
        </div>
      )}

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
            <label className="text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Lugares na loja</span>
              <input type="number" min={2} max={400} value={lugares}
                onChange={e => setLugares(Number(e.target.value))} className="input w-28" />
            </label>
            <button
              onClick={() => acao('preparar', () => torneioApi.preparar(id, { melhorDe, minutosRodada: minutos, lugares }),
                preparado ? 'Configuração salva.' : 'Check-in aberto!')}
              disabled={ocupado !== null} className="btn-primary">
              {ocupado === 'preparar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {preparado ? 'Salvar' : 'Abrir check-in'}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {Math.floor(lugares / 2)} mesas. Se tiver mais jogadores que lugares, as mesas a mais aparecem como
            &ldquo;aguardando mesa&rdquo; e jogam quando uma liberar — ninguém fica de fora da inscrição.
          </p>
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
                    `Pareamentos da rodada ${p.rodadaAtual + 1} soltos!`)}
                  disabled={ocupado !== null || (p.rodadaAtual > 0 && abertas.length > 0) || (p.rodadaAtual === 0 && presentes.length < 2)}
                  className="btn-primary">
                  {ocupado === 'rodada' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {p.rodadaAtual === 0 ? `Soltar pareamentos da rodada 1 (${presentes.length} presentes)` : `Soltar pareamentos da rodada ${p.rodadaAtual + 1}`}
                </button>
              )}
              {p.rodadaAtual > 0 && (
                <button
                  onClick={() => confirm(somaNaLiga
                    ? 'Encerrar o torneio? A classificação vira a colocação final e vai pra Liga Mensal.'
                    : 'Encerrar o campeonato? A classificação vira a colocação final (campeonato avulso: não soma na Liga).')
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

          {esperandoComecar && (
            <div className={clsx('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
              todasProntas ? 'border-green-500 bg-green-500/10' : 'border-surface-400 bg-surface-700')}>
              {prontoLigado && setupAgora ? (
                <div className="flex-1 min-w-[14rem] space-y-2">
                  <p className={clsx('text-sm font-semibold flex items-center gap-1.5', todasProntas ? 'txt-ok' : 'text-white')}>
                    {todasProntas
                      ? <><CheckCircle2 className="w-4 h-4" /> Todas as mesas prontas — pode começar a rodada</>
                      : <><ThumbsUp className="w-4 h-4" /> {setupAgora.prontas} de {setupAgora.total} mesas prontas</>}
                  </p>
                  <div className="h-2 rounded-full bg-surface-600 overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-[width]"
                      style={{ width: `${setupAgora.total ? (setupAgora.prontas / setupAgora.total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-gray-400">
                    Cada jogador aperta &quot;Estou pronto&quot; no celular com os básicos em campo. Quem está sem celular: marque a mesa abaixo.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-300 flex-1 min-w-[14rem]">
                  Pareamentos soltos — os jogadores já veem a mesa deles. Quando todo mundo estiver com o setup pronto,
                  comece a rodada: aí o relógio corre.
                </p>
              )}
              <button onClick={() => acao('comecar', () => torneioApi.comecarRodada(id), `Rodada ${p.rodadaAtual} começou!`)}
                disabled={ocupado !== null} className="btn-primary">
                {ocupado === 'comecar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Começar rodada {p.rodadaAtual}
              </button>
            </div>
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
                  resolver={r => acao(`m${m.partidaId}`, () => torneioApi.resolver(id, m.partidaId, r))}
                  setup={prontoLigado && esperandoComecar}
                  marcarPronta={v => acao(`p${m.partidaId}`, () => torneioApi.mesaPronta(id, m.partidaId, v))} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Classificação ───────────────────────────────────────────────── */}
      {p.classificacao.length > 0 && (
        <div>
          {encerrado && <p className="text-sm txt-ok mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {somaNaLiga ? 'Torneio encerrado — colocações gravadas e somadas na Liga Mensal.' : 'Campeonato encerrado — colocações gravadas (não soma na Liga).'}</p>}
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

/** Aprovado = os dois lançaram igual (ou o organizador decidiu). Senão, de quem falta a confirmação. */
function StatusMesa({ m }: { m: MesaDto }) {
  if (m.resultado)
    return <span className="ml-auto txt-ok text-xs font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Aprovado · {LANCOU[m.resultado](m)}</span>
  if (m.divergente)
    return <span className="ml-auto txt-alerta text-xs font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Divergente — decida abaixo</span>
  const falta = !m.reportA && !m.reportB ? null : !m.reportA ? m.a.nome : m.b?.nome
  return falta
    ? <span className="ml-auto text-xs txt-alerta">Aguardando confirmação de {falta.split(' ')[0]}</span>
    : <span className="ml-auto text-xs text-gray-400">Aguardando resultado</span>
}

/** Bipe curto de aviso (Web Audio, sem arquivo). Navegador sem áudio liberado: só o toast. */
function tocarAviso() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.18].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.2, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.15)
    })
  } catch { /* sem áudio */ }
}

/** Selo de pronto de um lado da mesa (fase de setup). */
function SeloPronto({ pronto, nome }: { pronto?: boolean; nome: string }) {
  return pronto
    ? <span className="txt-ok font-semibold">{nome.split(' ')[0]}: pronto</span>
    : <span className="txt-alerta">{nome.split(' ')[0]}: montando</span>
}

function Mesa({ m, resolver, ocupado, setup = false, marcarPronta }: {
  m: MesaDto; resolver: (r: ResultadoPartida) => void; ocupado: boolean
  setup?: boolean; marcarPronta?: (pronta: boolean) => void
}) {
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
        {m.aguardandoMesa
          ? <span className="px-2 h-8 rounded-lg bg-surface-600 flex items-center justify-center text-xs font-semibold txt-alerta shrink-0" title="Mais jogadores que lugares: joga quando uma mesa liberar">aguardando mesa</span>
          : <span className="w-8 h-8 rounded-lg bg-surface-600 flex items-center justify-center font-bold text-white shrink-0">{m.mesa}</span>}
        <span className="text-white font-semibold">{m.a.nome}</span>
        <span className="text-gray-500">×</span>
        <span className="text-white font-semibold">{m.b.nome}</span>
        {setup && !m.aguardandoMesa
          ? <span className={clsx('ml-auto text-xs font-semibold flex items-center gap-1', m.prontoA && m.prontoB ? 'txt-ok' : 'text-gray-400')}>
              {m.prontoA && m.prontoB ? <><CheckCircle2 className="w-4 h-4" /> Mesa pronta</> : 'Montando o setup'}
            </span>
          : <StatusMesa m={m} />}
      </div>
      {setup && !m.aguardandoMesa && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pl-10">
          <SeloPronto pronto={m.prontoA} nome={m.a.nome} />
          <SeloPronto pronto={m.prontoB} nome={m.b.nome} />
          <button disabled={ocupado} onClick={() => marcarPronta?.(!(m.prontoA && m.prontoB))}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg btn-secondary">
            {m.prontoA && m.prontoB ? 'Desfazer' : 'Marcar mesa pronta'}
          </button>
        </div>
      )}
      {!setup && <>
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
      </>}
    </div>
  )
}
