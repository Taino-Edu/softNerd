'use client'

// =============================================================================
// /liga/jogar — Jogador no celular: código → deck → minha mesa → lançar resultado
// Atualiza sozinha pelo /hubs/torneio (lib/useTorneioAoVivo). docs/liguinha.md
// =============================================================================

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Swords, Trophy, CheckCircle2, AlertTriangle, LogOut, Layers } from 'lucide-react'
import {
  torneioApi, deckApi, DeckListDto, MinhaMesaDto, ResultadoJogador, TorneioResumoDto,
} from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { useTorneioAoVivo } from '@/lib/useTorneioAoVivo'
import Relogio from '@/components/liga/Relogio'
import TabelaTorneio from '@/components/liga/TabelaTorneio'

function mensagemDe(e: unknown, padrao: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? padrao
}

export default function JogarPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Jogar />
    </Suspense>
  )
}

function Carregando() {
  return <div className="min-h-screen bg-surface-900 flex items-center justify-center"><Loader2 className="w-8 h-8 text-brand-400 animate-spin" /></div>
}

function Jogar() {
  const params = useSearchParams()
  const router = useRouter()
  const torneioId = params.get('t')
  const [logado, setLogado] = useState<boolean | null>(null)

  useEffect(() => { setLogado(isLoggedIn()) }, [])

  if (logado === null) return <Carregando />

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <nav className="sticky top-0 z-40 h-14 flex items-center px-4 gap-3 bg-surface-900 border-b border-surface-500">
        {torneioId ? (
          <button onClick={() => router.push('/liga/jogar')} className="flex items-center gap-1.5 text-sm text-gray-300">
            <ArrowLeft className="w-4 h-4" /> Torneios
          </button>
        ) : (
          <Link href="/liga" className="flex items-center gap-1.5 text-sm text-gray-300">
            <ArrowLeft className="w-4 h-4" /> Liga
          </Link>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold"><Swords className="w-4 h-4 text-brand-400" /> Liguinha</span>
      </nav>

      <main className="max-w-md mx-auto px-4 py-5">
        {!logado ? (
          <div className="bg-surface-800 border border-surface-500 rounded-2xl p-6 text-center space-y-4">
            <Swords className="w-10 h-10 text-brand-400 mx-auto" />
            <p className="text-gray-300 text-sm">Entre na sua conta da loja pra jogar o torneio e lançar seus resultados.</p>
            <Link href={`/entrar?returnTo=${encodeURIComponent('/liga/jogar' + (torneioId ? `?t=${torneioId}` : ''))}`}
              className="btn-primary w-full justify-center">Entrar</Link>
          </div>
        ) : torneioId ? (
          <MinhaMesa torneioId={torneioId} />
        ) : (
          <EntrarNoTorneio onEntrou={id => router.push(`/liga/jogar?t=${id}`)} />
        )}
      </main>
    </div>
  )
}

// ── Entrar pelo código ───────────────────────────────────────────────────────

function EntrarNoTorneio({ onEntrou }: { onEntrou: (id: string) => void }) {
  const [codigo, setCodigo] = useState('')
  const [decks, setDecks] = useState<DeckListDto[]>([])
  const [deckId, setDeckId] = useState('')
  const [deckNome, setDeckNome] = useState('')
  const [ativos, setAtivos] = useState<TorneioResumoDto[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    deckApi.list().then(r => setDecks(r.data)).catch(() => {})
    torneioApi.ativos().then(r => setAtivos(r.data)).catch(() => {})
  }, [])

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await torneioApi.entrar({
        codigo: codigo.trim(),
        deckId: deckId || null,
        deckNome: deckId ? null : (deckNome.trim() || null),
      })
      onEntrou(r.data.championshipId)
    } catch (e) {
      setErro(mensagemDe(e, 'Não deu pra entrar. Confira o código.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5">
      {ativos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Seus torneios</h2>
          {ativos.map(t => (
            <button key={t.id} onClick={() => onEntrou(t.id)}
              className="w-full text-left bg-surface-800 border border-surface-500 rounded-xl p-4 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-brand-400 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-white truncate">{t.nome}</span>
                <span className="block text-xs text-gray-400">
                  {t.rodadaAtual > 0 ? `Rodada ${t.rodadaAtual}${t.numeroRodadas ? ` de ${t.numeroRodadas}` : ''}` : 'Aguardando início'}
                  {t.checkIn ? ' · check-in feito' : ''}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}

      <form onSubmit={entrar} className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Código do torneio</label>
          <input
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            placeholder="EX.: KX7P2"
            autoCapitalize="characters" autoComplete="off" inputMode="text"
            className="input w-full text-center text-2xl font-mono tracking-[0.4em] py-3"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Seu deck nesta etapa</label>
          {decks.length > 0 && (
            <select value={deckId} onChange={e => setDeckId(e.target.value)} className="input w-full mb-2">
              <option value="">Digitar o nome…</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {!deckId && (
            <input value={deckNome} onChange={e => setDeckNome(e.target.value)} maxLength={200}
              placeholder="Ex.: Charizard ex" className="input w-full" />
          )}
          <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Os decks salvos em <Link href="/cliente/decks" className="text-brand-400">Meus decks</Link> aparecem aqui.
          </p>
        </div>

        {erro && <p className="txt-erro text-sm flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{erro}</p>}

        <button type="submit" disabled={codigo.length < 5 || enviando} className="btn-primary w-full justify-center py-3">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} Entrar no torneio
        </button>
        <p className="text-xs text-gray-500 text-center">Peça o código ao organizador.</p>
      </form>
    </div>
  )
}

// ── Minha mesa ───────────────────────────────────────────────────────────────

const ROTULO: Record<ResultadoJogador, string> = { Venci: 'Venci', Perdi: 'Perdi', Empatei: 'Empatei' }

function MinhaMesa({ torneioId }: { torneioId: string }) {
  const [dados, setDados] = useState<MinhaMesaDto | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState<ResultadoJogador | null>(null)

  const recarregar = useCallback(() => {
    torneioApi.minhaMesa(torneioId)
      .then(r => { setDados(r.data); setErro('') })
      .catch(e => setErro(mensagemDe(e, 'Não deu pra carregar o torneio.')))
  }, [torneioId])

  useEffect(() => { recarregar() }, [recarregar])
  useTorneioAoVivo(torneioId, recarregar)

  async function lancar(r: ResultadoJogador) {
    if (!dados?.mesa) return
    setEnviando(r)
    try {
      await torneioApi.lancar(torneioId, dados.mesa.partidaId, r)
      recarregar()
    } catch (e) {
      setErro(mensagemDe(e, 'Não deu pra lançar o resultado.'))
    } finally {
      setEnviando(null)
    }
  }

  async function desistir() {
    if (!confirm('Sair do torneio? Você não joga as próximas rodadas.')) return
    try { await torneioApi.desistir(torneioId); recarregar() }
    catch (e) { setErro(mensagemDe(e, 'Não deu pra desistir.')) }
  }

  if (!dados) return erro ? <p className="txt-erro text-sm">{erro}</p> : <Carregando />

  const t = dados.torneio
  const encerrado = t.status === 'Finalizado'
  const eu = t.classificacao.find(l => l.participanteId === dados.participanteId)
  const mesa = dados.mesa
  const souA = mesa?.a.participanteId === dados.participanteId
  const oponente = mesa ? (souA ? mesa.b : mesa.a) : null

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-white">{t.nome}</h1>
        <p className="text-sm text-gray-400">
          {encerrado ? 'Torneio encerrado'
            : t.rodadaAtual > 0 ? `Rodada ${t.rodadaAtual}${t.numeroRodadas ? ` de ${t.numeroRodadas}` : ''}`
            : 'Aguardando o organizador iniciar'}
          {` · melhor de ${t.melhorDe}`}
        </p>
      </header>

      {!encerrado && t.rodadaAtual > 0 && <Relogio timer={t.timer} />}

      {erro && <p className="txt-erro text-sm">{erro}</p>}

      {encerrado ? (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-6 text-center">
          <Trophy className="w-10 h-10 text-brand-400 mx-auto mb-2" />
          {eu ? <>
            <p className="text-3xl font-bold text-white">{eu.posicao}º</p>
            <p className="text-sm text-gray-400">{eu.pontos} pts · {eu.vitorias}V {eu.empates}E {eu.derrotas}D</p>
          </> : <p className="text-gray-400 text-sm">Você não jogou este torneio.</p>}
        </div>
      ) : dados.desistiuNaRodada ? (
        <p className="bg-surface-800 border border-surface-500 rounded-2xl p-5 text-sm text-gray-300">
          Você saiu do torneio na rodada {dados.desistiuNaRodada}. Fale com o organizador se foi engano.
        </p>
      ) : t.rodadaAtual === 0 ? (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 txt-ok shrink-0" />
          <p className="text-sm text-gray-300">Check-in feito{dados.deck ? ` com ${dados.deck}` : ''}. Assim que a rodada 1 sair, sua mesa aparece aqui.</p>
        </div>
      ) : !mesa ? (
        <p className="bg-surface-800 border border-surface-500 rounded-2xl p-5 text-sm text-gray-300">
          Você não está nesta rodada. Se chegou agora, avise o organizador — você entra na próxima.
        </p>
      ) : !oponente ? (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 text-center">
          <p className="text-lg font-bold text-white">Bye nesta rodada</p>
          <p className="text-sm text-gray-400">Você ganha os 3 pontos sem jogar. Descansa que a próxima já vem.</p>
        </div>
      ) : (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-4">
          <div className="text-center">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mesa</p>
            <p className="text-5xl font-bold text-white leading-tight">{mesa.mesa}</p>
          </div>
          <div className="bg-surface-700 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-400">Seu oponente</p>
            <p className="text-lg font-semibold text-white">{oponente.nome}</p>
            {oponente.deck && <p className="text-xs text-gray-400">{oponente.deck}</p>}
          </div>

          {mesa.resultado ? (
            <p className="flex items-center justify-center gap-2 txt-ok font-semibold">
              <CheckCircle2 className="w-5 h-5" /> Resultado confirmado: {dados.meuReport ? ROTULO[dados.meuReport] : 'definido pelo organizador'}
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-300 text-center">Como foi a partida?</p>
              <div className="grid grid-cols-3 gap-2">
                {(['Venci', 'Empatei', 'Perdi'] as ResultadoJogador[]).map(r => (
                  <button key={r} onClick={() => lancar(r)} disabled={enviando !== null}
                    className={`py-3 rounded-xl font-semibold border transition-colors ${
                      dados.meuReport === r ? 'btn-primary justify-center' : 'btn-secondary justify-center'}`}>
                    {enviando === r ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : ROTULO[r]}
                  </button>
                ))}
              </div>
              {dados.meuReport && !dados.reportOponente && (
                <p className="text-xs text-gray-400 text-center">Você lançou “{ROTULO[dados.meuReport]}”. Falta o oponente confirmar.</p>
              )}
              {dados.meuReport && dados.reportOponente && (
                <p className="txt-alerta text-sm text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Vocês lançaram resultados diferentes. Chame o organizador.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {t.classificacao.length > 0 && <TabelaTorneio linhas={t.classificacao} destaque={dados.participanteId} />}

      <div className="flex items-center justify-between pt-2">
        <Link href={`/liga/torneio/${t.id}`} className="text-sm text-brand-400">Ver todas as mesas</Link>
        {!encerrado && !dados.desistiuNaRodada && dados.participanteId && (
          <button onClick={desistir} className="text-sm text-gray-500 flex items-center gap-1"><LogOut className="w-4 h-4" /> Desistir</button>
        )}
      </div>
    </div>
  )
}
