'use client'

// =============================================================================
// /liga/jogar — Jogador no celular: código → deck → minha mesa → lançar resultado
// Atualiza sozinha pelo /hubs/torneio (lib/useTorneioAoVivo). docs/liguinha.md
// =============================================================================

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Swords, Trophy, CheckCircle2, AlertTriangle, LogOut, Layers, Hand, PartyPopper, ThumbsUp } from 'lucide-react'
import {
  torneioApi, deckApi, DeckListDto, MinhaMesaDto, ResultadoJogador, TorneioResumoDto, rodadaComecou,
} from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { useTorneioAoVivo } from '@/lib/useTorneioAoVivo'
import Relogio from '@/components/liga/Relogio'
import TabelaTorneio from '@/components/liga/TabelaTorneio'
import SpriteDeck from '@/components/liga/SpriteDeck'
import AnimacaoResultado, { CenaResultado } from '@/components/liga/AnimacaoResultado'
import { useFuncionalidade } from '@/lib/useFuncionalidade'

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
            <div key={t.id} className="bg-surface-800 border border-surface-500 rounded-xl p-4 flex items-center gap-3">
              <button onClick={() => onEntrou(t.id)} className="flex-1 min-w-0 text-left flex items-center gap-3">
                <Trophy className="w-5 h-5 text-brand-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-white truncate">{t.nome}</span>
                  <span className="block text-xs text-gray-400">
                    {t.rodadaAtual > 0 ? `Rodada ${t.rodadaAtual}${t.numeroRodadas ? ` de ${t.numeroRodadas}` : ''}` : 'Aguardando início'}
                    {t.checkIn ? ' · check-in feito' : ' · sem check-in'}
                  </span>
                </span>
              </button>
              {!t.checkIn && (
                <button
                  onClick={async () => {
                    try { await torneioApi.checkInProprio(t.id); onEntrou(t.id) }
                    catch (e) { setErro(mensagemDe(e, 'Não deu pra fazer o check-in.')) }
                  }}
                  className="btn-primary text-sm shrink-0">
                  <Hand className="w-4 h-4" /> Estou aqui
                </button>
              )}
            </div>
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

// Animação de resultado (chave "liga-animacao-resultado"): toca uma vez por partida e uma vez no fim do
// torneio. Guarda as últimas vistas no aparelho; sem armazenamento, lembra só enquanto a página está aberta.
const CHAVE_VISTAS = 'liga-animacoes-vistas'
const vistasNaMemoria = new Set<string>()
function jaViu(chave: string) {
  if (vistasNaMemoria.has(chave)) return true
  try { return (JSON.parse(localStorage.getItem(CHAVE_VISTAS) ?? '[]') as string[]).includes(chave) } catch { return false }
}
function marcaVista(chave: string) {
  vistasNaMemoria.add(chave)
  try {
    const lista = (JSON.parse(localStorage.getItem(CHAVE_VISTAS) ?? '[]') as string[]).filter(c => c !== chave)
    localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...lista, chave].slice(-40)))
  } catch { /* sem armazenamento: fica só na memória */ }
}

/** Cena da partida já decidida (null em bye ou sem resultado). */
function cenaDaMesa(dados: MinhaMesaDto): CenaResultado | null {
  const m = dados.mesa
  if (!m?.resultado || !m.b || !dados.participanteId) return null
  const souA = m.a.participanteId === dados.participanteId
  const eu = souA ? m.a : m.b
  const op = souA ? m.b : m.a
  const tipo = m.resultado === 'Empate' ? 'empate' : (m.resultado === 'VitoriaA') === souA ? 'vitoria' : 'derrota'
  return { tipo, rodada: dados.torneio.rodadaAtual, meuDeck: eu.deck ?? dados.deck, oponente: { nome: op.nome, deck: op.deck } }
}

/** Cena da colocação final (null se o torneio não acabou ou a pessoa não jogou). */
function cenaFinal(dados: MinhaMesaDto): CenaResultado | null {
  const t = dados.torneio
  const eu = t.classificacao.find(l => l.participanteId === dados.participanteId)
  if (t.status !== 'Finalizado' || !eu) return null
  const n = (q: number, palavra: string) => `${q} ${palavra}${q === 1 ? '' : 's'}`
  return { tipo: 'final', meuDeck: eu.deck ?? dados.deck, posicao: eu.posicao, total: t.classificacao.length,
    pontos: eu.pontos, campanha: `${n(eu.vitorias, 'vitória')} · ${n(eu.empates, 'empate')} · ${n(eu.derrotas, 'derrota')}` }
}

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

  const animar = useFuncionalidade('liga-animacao-resultado') !== false
  const [cena, setCena] = useState<CenaResultado | null>(null)
  const fecharCena = useCallback(() => setCena(null), [])
  // Resultado confirmado (pelo oponente, ao vivo, ou pelo organizador) → anima uma vez
  useEffect(() => {
    if (!animar || !dados || cena) return
    const fim = cenaFinal(dados)
    const nova = fim ?? cenaDaMesa(dados)
    const chave = fim ? `fim-${dados.torneio.id}` : `partida-${dados.mesa?.partidaId}`
    if (!nova || jaViu(chave)) return
    marcaVista(chave)
    setCena(nova)
  }, [animar, dados, cena])

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

  // "Estou pronto" (chave liguinha-pronto-na-mesa): setup montado, básicos em campo
  const prontoLigado = useFuncionalidade('liguinha-pronto-na-mesa') !== false
  const [marcandoPronto, setMarcandoPronto] = useState(false)
  async function marcarPronto(pronto: boolean) {
    setMarcandoPronto(true)
    try { await torneioApi.pronto(torneioId, pronto); recarregar() }
    catch (e) { setErro(mensagemDe(e, 'Não deu pra marcar.')) }
    finally { setMarcandoPronto(false) }
  }

  const [marcando, setMarcando] = useState(false)
  async function estouAqui() {
    setMarcando(true)
    try { await torneioApi.checkInProprio(torneioId); recarregar() }
    catch (e) { setErro(mensagemDe(e, 'Não deu pra fazer o check-in.')) }
    finally { setMarcando(false) }
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

  const meuDeck = mesa ? ((souA ? mesa.a.deck : mesa.b?.deck) ?? dados.deck) : dados.deck
  const emSetup = !!mesa && !mesa.resultado && !mesa.aguardandoMesa && !rodadaComecou(t.timer, t.rodadaAtual)
  const euPronto = !!mesa && (souA ? mesa.prontoA : mesa.prontoB)
  const oponentePronto = !!mesa && (souA ? mesa.prontoB : mesa.prontoA)
  const rever = animar ? (encerrado ? cenaFinal(dados) : cenaDaMesa(dados)) : null

  return (
    <div className="space-y-4">
      {cena && <AnimacaoResultado cena={cena} onFechar={fecharCena} />}
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
          {rever && (
            <button onClick={() => setCena(rever)} className="mt-3 text-sm text-brand-400 inline-flex items-center gap-1.5">
              <PartyPopper className="w-4 h-4" /> Ver a comemoração de novo
            </button>
          )}
        </div>
      ) : dados.desistiuNaRodada ? (
        <p className="bg-surface-800 border border-surface-500 rounded-2xl p-5 text-sm text-gray-300">
          Você saiu do torneio na rodada {dados.desistiuNaRodada}. Fale com o organizador se foi engano.
        </p>
      ) : dados.participanteId && !dados.checkIn && !mesa ? (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-3 text-center">
          <p className="text-sm text-gray-300">
            Você está inscrito. Chegou na loja? Toque abaixo pra fazer o check-in
            {t.rodadaAtual > 0 ? ' — você entra na próxima rodada.' : '.'}
          </p>
          <button onClick={estouAqui} disabled={marcando} className="btn-primary w-full justify-center py-3 text-base">
            {marcando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hand className="w-5 h-5" />} Estou aqui
          </button>
        </div>
      ) : t.rodadaAtual === 0 ? (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 txt-ok shrink-0" />
          <p className="text-sm text-gray-300">Check-in feito{dados.deck ? ` com ${dados.deck}` : ''}. Assim que os pareamentos saírem, sua mesa aparece aqui.</p>
        </div>
      ) : !mesa ? (
        <p className="bg-surface-800 border border-surface-500 rounded-2xl p-5 text-sm text-gray-300">
          {dados.checkIn
            ? 'Check-in feito! Você chegou depois dos pareamentos desta rodada — entra na próxima, sem precisar fazer mais nada.'
            : 'Você não está nesta rodada. Se chegou agora, avise o organizador — você entra na próxima.'}
        </p>
      ) : !oponente ? (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 text-center">
          <p className="text-lg font-bold text-white">Bye nesta rodada</p>
          <p className="text-sm text-gray-400">Você ganha os 3 pontos sem jogar. Descansa que a próxima já vem.</p>
        </div>
      ) : (
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-5 space-y-4">
          {mesa.aguardandoMesa ? (
            <div className="text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mesa</p>
              <p className="text-2xl font-bold txt-alerta leading-tight">Aguardando mesa livre</p>
              <p className="text-xs text-gray-400">A loja está cheia: o organizador chama vocês quando uma mesa liberar.</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mesa</p>
              <p className="text-5xl font-bold text-white leading-tight">{mesa.mesa}</p>
            </div>
          )}
          {emSetup && (prontoLigado ? (
            <div className="bg-surface-700 rounded-xl p-4 space-y-3 text-center">
              {euPronto ? (
                <>
                  <p className="flex items-center justify-center gap-2 txt-ok font-bold text-lg">
                    <CheckCircle2 className="w-6 h-6" /> Setup confirmado
                  </p>
                  <p className="text-sm text-gray-300">
                    {oponentePronto
                      ? 'Seu oponente também confirmou. O relógio começa quando o organizador mandar.'
                      : `Esperando ${oponente.nome.split(' ')[0]} confirmar.`}
                  </p>
                  <button onClick={() => marcarPronto(false)} disabled={marcandoPronto}
                    className="text-xs text-gray-400 underline underline-offset-2">
                    Desfazer
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-300">
                    Vá pra mesa, monte o setup e coloque o <strong className="text-white">Pokémon básico em campo</strong>. Depois toque abaixo.
                  </p>
                  <button onClick={() => marcarPronto(true)} disabled={marcandoPronto}
                    className="btn-primary w-full justify-center py-4 text-lg">
                    {marcandoPronto ? <Loader2 className="w-5 h-5 animate-spin" /> : <ThumbsUp className="w-5 h-5" />} Estou pronto
                  </button>
                  <p className="text-xs text-gray-400">
                    {oponentePronto ? `${oponente.nome.split(' ')[0]} já confirmou.` : 'Quando todas as mesas estiverem prontas, o organizador começa a rodada.'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-center text-gray-300 bg-surface-700 rounded-xl p-3">
              Vá pra mesa e monte o setup. O relógio começa quando o organizador mandar.
            </p>
          ))}
          {animar ? (
            <div className="bg-surface-700 rounded-xl p-3 flex items-end gap-2">
              <div className="flex-1 min-w-0 flex flex-col items-center text-center">
                <SpriteDeck deck={meuDeck} tamanho={64} />
                <p className="text-sm font-semibold text-white">Você</p>
                {meuDeck && <p className="text-xs text-gray-400 truncate max-w-full">{meuDeck}</p>}
              </div>
              <span className="text-xs font-black text-gray-500 pb-6">VS</span>
              <div className="flex-1 min-w-0 flex flex-col items-center text-center">
                <SpriteDeck deck={oponente.deck} tamanho={64} />
                <p className="text-sm font-semibold text-white truncate max-w-full">{oponente.nome}</p>
                {oponente.deck && <p className="text-xs text-gray-400 truncate max-w-full">{oponente.deck}</p>}
              </div>
            </div>
          ) : (
            <div className="bg-surface-700 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Seu oponente</p>
              <p className="text-lg font-semibold text-white">{oponente.nome}</p>
              {oponente.deck && <p className="text-xs text-gray-400">{oponente.deck}</p>}
            </div>
          )}

          {mesa.resultado && rever && (
            <button onClick={() => setCena(rever)} className="w-full text-sm text-brand-400 flex items-center justify-center gap-1.5">
              <PartyPopper className="w-4 h-4" /> Ver a animação de novo
            </button>
          )}
          {emSetup && prontoLigado ? null : mesa.resultado ? (
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
