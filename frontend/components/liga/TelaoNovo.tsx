'use client'
// Telão da liguinha no estilo da Liga Mensal (chave "telao-novo", v1.54.0) — feito pra TV de longe:
// relógio gigante em fonte pixel, mesas com o sprite do deck de cada lado, classificação com sprite,
// deck, V/E/D, OWP e pontos, e pódio com sprites grandes quando encerra.
// Cores no style (não em text-white): o tema claro do site força .text-white pra escuro.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Press_Start_2P } from 'next/font/google'
import { ArrowLeft, Swords, CheckCircle2, Clock, Crown } from 'lucide-react'
import { TorneioPublicoDto, MesaDto, LinhaTabela, rodadaComecou, segundosRestantes } from '@/lib/api'
import { mixHex } from '@/lib/colors'
import { useSiteConfig } from '@/lib/useSiteConfig'
import SpriteDeck from '@/components/liga/SpriteDeck'

const pixel = Press_Start_2P({ weight: '400', subsets: ['latin'], display: 'swap' })

const B = '#FFFFFF'
const SUAVE = 'rgba(255,255,255,0.72)'
const FRACO = 'rgba(255,255,255,0.45)'
const AMARELO = '#FFE45E'
const CARD = { backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }

/** Ouro, prata e bronze (mesmas cores da página da Liga Mensal). */
const PODIO = [
  { cor: '#FFE45E', texto: '#3D2E00', rotulo: '1º' },
  { cor: '#CBD5E1', texto: '#1E293B', rotulo: '2º' },
  { cor: '#E7A36B', texto: '#3B1D06', rotulo: '3º' },
]

function RelogioTelao({ t, cor, compacto }: { t: TorneioPublicoDto; cor: string; compacto?: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const resta = segundosRestantes(t.timer)
  if (resta === null) return null
  const total = t.timer?.durationSeconds || t.minutosRodada * 60
  const pct = Math.max(0, Math.min(100, (resta / total) * 100))
  const acabou = resta === 0
  const pouco = !acabou && resta <= 5 * 60
  const corTempo = acabou ? '#F87171' : pouco ? AMARELO : B
  const mm = String(Math.floor(resta / 60)).padStart(2, '0')
  const ss = String(resta % 60).padStart(2, '0')
  return (
    <section className={`rounded-3xl px-6 ${compacto ? 'py-4' : 'py-5 md:py-6'} text-center`} style={CARD} aria-live="polite">
      <p className={`${pixel.className} text-[10px] md:text-xs`} style={{ color: SUAVE }}>
        <Clock className="inline w-4 h-4 -mt-1 mr-2" />
        {t.timer?.state === 'paused' ? 'RELÓGIO PAUSADO' : `TEMPO DA RODADA ${t.rodadaAtual}`}
      </p>
      <p className={`${pixel.className} ${compacto ? 'mt-3 text-6xl md:text-7xl' : 'mt-4 text-6xl md:text-8xl 2xl:text-9xl'} leading-none ${acabou ? 'animate-pulse' : ''}`}
        style={{ color: corTempo, textShadow: `0 6px 0 ${mixHex(cor, '#000000', 0.5)}` }}>
        {acabou ? 'TEMPO!' : `${mm}:${ss}`}
      </p>
      <div className={`${compacto ? 'mt-4' : 'mt-5'} h-3 rounded-full overflow-hidden max-w-3xl mx-auto`} style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
        <div className="h-full rounded-full transition-[width] duration-1000"
          style={{ width: `${pct}%`, backgroundColor: acabou ? '#F87171' : pouco ? AMARELO : '#7FA0F0' }} />
      </div>
    </section>
  )
}

function Jogador({ nome, deck, venceu, perdeu, compacto }: { nome: string; deck?: string | null; venceu?: boolean; perdeu?: boolean; compacto?: boolean }) {
  return (
    <div className={`flex items-center ${compacto ? 'gap-2' : 'gap-3'} min-w-0 ${perdeu ? 'opacity-50' : ''}`}>
      <span className={`${compacto ? 'w-9 h-9' : 'w-12 h-12'} shrink-0 flex items-end justify-center`}><SpriteDeck deck={deck} tamanho={compacto ? 36 : 48} /></span>
      <div className="min-w-0 flex-1">
        <p className={`${compacto ? 'text-sm md:text-base' : 'text-base md:text-lg'} font-black leading-tight truncate`} style={{ color: B }}>
          {nome}{venceu && <CheckCircle2 className="inline w-4 h-4 ml-1.5 -mt-0.5" style={{ color: '#4ADE80' }} />}
        </p>
        {deck && <p className={`${compacto ? 'text-[11px]' : 'text-xs'} truncate`} style={{ color: FRACO }}>{deck}</p>}
      </div>
    </div>
  )
}

function CartaoMesa({ m, compacto }: { m: MesaDto; compacto?: boolean }) {
  const recuo = compacto ? 'pl-[44px]' : 'pl-[60px]'
  const venceuA = m.resultado === 'VitoriaA', venceuB = m.resultado === 'VitoriaB'
  return (
    <div className={`rounded-2xl ${compacto ? 'px-3 py-2.5 gap-3' : 'px-4 py-3 gap-4'} flex items-center`} style={CARD}>
      <div className={`shrink-0 ${compacto ? 'w-12' : 'w-16'} text-center`}>
        {m.aguardandoMesa ? (
          <span className={`${pixel.className} block text-[8px] leading-relaxed px-1 py-2 rounded-lg`} style={{ backgroundColor: 'rgba(255,228,94,0.15)', color: AMARELO }}>
            AGUARDA<br />MESA
          </span>
        ) : (
          <>
            <span className={`${pixel.className} block text-[8px]`} style={{ color: FRACO }}>{m.b ? 'MESA' : 'BYE'}</span>
            <span className={`${pixel.className} block text-2xl mt-1`} style={{ color: m.b ? AMARELO : FRACO }}>{m.b ? m.mesa : '—'}</span>
          </>
        )}
      </div>
      <div className={`flex-1 min-w-0 ${compacto ? 'space-y-1' : 'space-y-2'}`}>
        <Jogador nome={m.a.nome} deck={m.a.deck} venceu={venceuA || !m.b} perdeu={venceuB} compacto={compacto} />
        {m.b ? (
          <>
            <p className={`${pixel.className} text-[8px] ${recuo}`} style={{ color: FRACO }}>{m.resultado === 'Empate' ? 'EMPATE' : 'VS'}</p>
            <Jogador nome={m.b.nome} deck={m.b.deck} venceu={venceuB} perdeu={venceuA} compacto={compacto} />
          </>
        ) : (
          <p className={`text-xs ${recuo}`} style={{ color: SUAVE }}>Vitória automática nesta rodada</p>
        )}
      </div>
    </div>
  )
}

function Classificacao({ linhas, cheia }: { linhas: LinhaTabela[]; cheia: boolean }) {
  // Em jogo a classificação divide a tela com relógio e mesas: com mais de 10 jogadores as linhas
  // ficam mais baixas e, em TV (2xl), vão pra duas colunas — 16 jogadores cabem em 1080px sem rolar
  const compacta = !cheia && linhas.length > 10
  return (
    <section className="rounded-3xl p-4 md:p-5" style={CARD}>
      <h2 className={`${pixel.className} text-[11px] mb-3`} style={{ color: AMARELO }}>CLASSIFICAÇÃO</h2>
      <div className={`grid ${compacta ? 'gap-1 2xl:grid-cols-2 2xl:gap-x-4' : 'gap-1.5'} ${cheia ? 'xl:grid-cols-2 xl:gap-x-6' : ''}`}>
        {linhas.map(l => {
          const p = PODIO[l.posicao - 1]
          return (
            <div key={l.participanteId} className={`flex items-center ${compacta ? 'gap-2 py-1' : 'gap-3 py-1.5'} rounded-xl px-2 ${l.desistiuNaRodada ? 'opacity-50' : ''}`}
              style={p ? { backgroundColor: 'rgba(255,255,255,0.05)' } : undefined}>
              <span className={`${pixel.className} ${compacta ? 'w-7 h-7 text-[9px]' : 'w-9 h-9 text-[10px]'} shrink-0 rounded-lg flex items-center justify-center`}
                style={p ? { backgroundColor: p.cor, color: p.texto } : { color: SUAVE }}>
                {l.posicao}
              </span>
              <span className={`${compacta ? 'w-9' : 'w-11'} shrink-0 flex justify-center`}><SpriteDeck deck={l.deck} tamanho={compacta ? 32 : 40} /></span>
              <div className="flex-1 min-w-0">
                <p className={`${compacta ? 'text-sm md:text-base' : 'text-base md:text-lg'} font-black leading-tight truncate`} style={{ color: B }}>
                  {l.nome}{l.desistiuNaRodada ? <span className="text-xs font-semibold" style={{ color: FRACO }}> (saiu)</span> : null}
                </p>
                {l.deck && <p className={`${compacta ? 'text-[11px]' : 'text-xs'} truncate`} style={{ color: FRACO }}>{l.deck}</p>}
              </div>
              <span className="hidden sm:block text-sm tabular-nums shrink-0" style={{ color: SUAVE }} title="Vitórias / Empates / Derrotas">
                {l.vitorias}-{l.empates}-{l.derrotas}
              </span>
              <span className={`hidden md:block ${compacta ? '2xl:hidden' : ''} text-xs tabular-nums w-14 text-right shrink-0`} style={{ color: FRACO }} title="Aproveitamento dos adversários (desempate)">
                {l.owp.toFixed(0)}%
              </span>
              <span className={`${pixel.className} text-sm md:text-base ${compacta ? 'w-9' : 'w-12'} text-right shrink-0`} style={{ color: AMARELO }}>{l.pontos}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] mt-3" style={{ color: FRACO }}>V-E-D · % = aproveitamento dos adversários (desempate) · 3 pts vitória, 1 empate</p>
    </section>
  )
}

function Podio({ linhas }: { linhas: LinhaTabela[] }) {
  const top = [linhas[1], linhas[0], linhas[2]].filter(Boolean)
  return (
    <section className="flex items-end justify-center gap-3 md:gap-6 pt-4">
      {top.map(l => {
        const p = PODIO[l.posicao - 1]
        const campeao = l.posicao === 1
        return (
          <div key={l.participanteId} className={`flex-1 max-w-[240px] rounded-3xl px-3 pt-4 pb-5 text-center ${campeao ? 'md:-translate-y-4' : ''}`}
            style={{ ...CARD, borderColor: p.cor, boxShadow: campeao ? `0 0 40px -10px ${p.cor}` : undefined }}>
            {campeao && <Crown className="w-8 h-8 mx-auto mb-1 animate-bounce" style={{ color: AMARELO }} />}
            <span className={`${pixel.className} inline-flex w-11 h-11 rounded-xl items-center justify-center text-xs`} style={{ backgroundColor: p.cor, color: p.texto }}>
              {p.rotulo}
            </span>
            <div className="mt-3 flex justify-center h-24 items-end"><SpriteDeck deck={l.deck} tamanho={campeao ? 96 : 72} /></div>
            <p className="mt-2 text-lg md:text-xl font-black truncate" style={{ color: B }}>{l.nome}</p>
            {l.deck && <p className="text-xs truncate" style={{ color: FRACO }}>{l.deck}</p>}
            <p className={`${pixel.className} mt-3 text-base md:text-xl`} style={{ color: p.cor }}>{l.pontos} PTS</p>
          </div>
        )
      })}
    </section>
  )
}

export default function TelaoNovo({ t }: { t: TorneioPublicoDto }) {
  const site = useSiteConfig()
  const cor = site?.colorHero ?? '#1E4FD6'
  const encerrado = t.status === 'Finalizado'
  const emJogo = !encerrado && t.rodadaAtual > 0
  // Muitas mesas (16+ jogadores): relógio menor e mesas em 3 colunas na TV, pra rodada caber em 1080px
  const muitasMesas = t.mesas.length > 6
  const setup = emJogo && !rodadaComecou(t.timer, t.rodadaAtual) && t.mesas.some(m => !m.resultado)
  const situacao = encerrado ? 'TORNEIO ENCERRADO'
    : t.rodadaAtual > 0 ? `RODADA ${t.rodadaAtual}${t.numeroRodadas ? ` DE ${t.numeroRodadas}` : ''}`
    : 'CHECK-IN ABERTO'

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${mixHex(cor, '#000000', 0.55)} 0%, ${mixHex(cor, '#000000', 0.78)} 100%)`, color: B, colorScheme: 'dark' }}>
      <header className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${mixHex(cor, '#FFFFFF', 0.08)} 0%, ${cor} 50%, ${mixHex(cor, '#000000', 0.35)} 100%)` }}>
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" aria-hidden
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-7xl 2xl:max-w-[1760px] mx-auto px-4 md:px-6 py-4 flex items-center gap-3">
          <Link href="/liga" className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80" style={{ color: SUAVE }}>
            <ArrowLeft className="w-4 h-4" /> Liga
          </Link>
          <Link href={`/liga/jogar?t=${t.id}`} className="ml-auto inline-flex items-center gap-2 text-sm font-black px-4 py-2 rounded-xl"
            style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
            <Swords className="w-4 h-4" /> Sou jogador
          </Link>
        </div>
        <div className="relative max-w-7xl 2xl:max-w-[1760px] mx-auto px-4 md:px-6 pb-6 pt-2 text-center">
          <p className={`${pixel.className} inline-block text-[9px] md:text-[11px] px-3 py-1.5 rounded-full`}
            style={{ backgroundColor: 'rgba(255,255,255,0.14)', color: AMARELO }}>
            {situacao}
          </p>
          <h1 className={`${pixel.className} mt-4 text-xl md:text-3xl lg:text-4xl leading-tight`} style={{ color: B, textShadow: `0 4px 0 ${mixHex(cor, '#000000', 0.45)}` }}>
            {t.nome}
          </h1>
          <p className="mt-3 text-sm" style={{ color: SUAVE }}>Suíço · melhor de {t.melhorDe} · {t.minutosRodada} min por rodada</p>
        </div>
      </header>

      <main className="max-w-7xl 2xl:max-w-[1760px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {!encerrado && t.rodadaAtual === 0 && (
          <section className="rounded-3xl p-8 text-center" style={CARD}>
            <p className={`${pixel.className} text-sm md:text-lg`} style={{ color: AMARELO }}>FAÇA SEU CHECK-IN</p>
            <p className="mt-3 text-base md:text-lg" style={{ color: SUAVE }}>
              No celular: <strong style={{ color: B }}>santuarionerd.com.br/liga/jogar</strong> — toque em &quot;Estou aqui&quot; ou digite o código que o organizador passar.
            </p>
          </section>
        )}

        {encerrado && t.classificacao.length > 0 && <Podio linhas={t.classificacao} />}

        {/* Em jogo: relógio e mesas na esquerda, classificação na direita — cabe numa TV 1920×1080 sem rolar */}
        <div className={`grid gap-6 items-start ${emJogo && t.classificacao.length > 0 ? 'xl:grid-cols-[1.15fr_1fr]' : ''}`}>
          {emJogo && (
            <div className="space-y-5 min-w-0">
              <RelogioTelao t={t} cor={cor} compacto={muitasMesas} />
              {setup && (
                <p className={`${pixel.className} text-center text-[10px] md:text-sm leading-relaxed rounded-2xl py-4 px-3`}
                  style={{ backgroundColor: 'rgba(255,228,94,0.12)', color: AMARELO, border: '1px solid rgba(255,228,94,0.35)' }}>
                  PAREAMENTOS DA RODADA {t.rodadaAtual} SAÍRAM — VÁ PRA SUA MESA E MONTE O SETUP
                </p>
              )}
              {t.mesas.length > 0 && (
                <section className="space-y-3">
                  <h2 className={`${pixel.className} text-[11px]`} style={{ color: AMARELO }}>MESAS DA RODADA {t.rodadaAtual}</h2>
                  <div className={`grid md:grid-cols-2 gap-3 ${muitasMesas ? '2xl:grid-cols-3' : ''}`}>
                    {t.mesas.map(m => <CartaoMesa key={m.partidaId} m={m} compacto={muitasMesas} />)}
                  </div>
                </section>
              )}
            </div>
          )}
          {t.classificacao.length > 0 && <Classificacao linhas={t.classificacao} cheia={!emJogo} />}
        </div>
      </main>
    </div>
  )
}
