'use client'
// Animação de vitória, derrota, empate e colocação final na tela do jogador (/liga/jogar),
// chave "liga-animacao-resultado" (v1.55.0). Quem venceu: o Pokémon do deck pula e o do
// oponente desmaia (cai de lado, cinza). Na derrota, o contrário. Empate: os dois balançam.
// No fim do torneio: colocação, com coroa e confete pro pódio.
// Cores no style (não em text-white): o tema claro do site força .text-white pra escuro.
// Movimento nas classes .liga-* de globals.css — com "reduzir movimento" do celular fica parado.
import { useEffect, useRef } from 'react'
import { Crown } from 'lucide-react'
import { pixel } from '@/lib/fontePixel'
import SpriteDeck from '@/components/liga/SpriteDeck'

export type CenaResultado =
  | { tipo: 'vitoria' | 'derrota' | 'empate'; rodada: number; meuDeck: string | null; oponente: { nome: string; deck?: string | null } }
  | { tipo: 'final'; meuDeck: string | null; posicao: number; total: number; pontos: number; campanha: string }

const B = '#FFFFFF'
const SUAVE = 'rgba(255,255,255,0.78)'
const AMARELO = '#FFE45E'
const PODIO = ['#FFE45E', '#CBD5E1', '#E7A36B']
const CONFETE = ['#FFE45E', '#7FA0F0', '#FFFFFF', '#4ADE80', '#F472B6', '#E7A36B']

/** Frases da derrota: sem drama, puxando pra próxima. */
const ANIMO = ['Faz parte! A próxima é sua.', 'Respira, embaralha e bora pra próxima.', 'Todo campeão já perdeu uma. Segue o jogo!']

function Confete() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} className="liga-confete absolute top-0 block"
          style={{
            left: `${(i * 37 + 5) % 100}%`,
            width: 6 + (i % 3) * 2, height: 6 + (i % 3) * 2,
            backgroundColor: CONFETE[i % CONFETE.length],
            animationDuration: `${2.6 + (i % 5) * 0.35}s`,
            animationDelay: `${(i % 7) * 0.22}s`,
            ['--deriva' as string]: `${((i % 5) - 2) * 30}px`,
          }} />
      ))}
    </div>
  )
}

function Lutador({ deck, nome, classe }: { deck: string | null | undefined; nome: string; classe: string }) {
  return (
    <div className="flex flex-col items-center gap-2 w-32 min-w-0">
      <div className="h-28 flex items-end justify-center" style={{ color: B }}>
        <span className={`inline-block ${classe}`}><SpriteDeck deck={deck} tamanho={96} /></span>
      </div>
      <p className="text-sm font-black truncate max-w-full" style={{ color: B }}>{nome}</p>
    </div>
  )
}

export default function AnimacaoResultado({ cena, onFechar }: { cena: CenaResultado; onFechar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    botao.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onFechar])

  let fundo: string, titulo: string, corTitulo: string, pontos: string | null, frase: string, festa: boolean
  if (cena.tipo === 'final') {
    const podio = cena.posicao <= 3
    corTitulo = podio ? PODIO[cena.posicao - 1] : B
    titulo = cena.posicao === 1 ? 'CAMPEÃO!' : `${cena.posicao}º LUGAR`
    fundo = podio ? 'linear-gradient(180deg, #1E4FD6 0%, #10286B 60%, #0B1E51 100%)' : 'linear-gradient(180deg, #163CA8 0%, #0B1E51 100%)'
    pontos = `${cena.pontos} PT${cena.pontos === 1 ? '' : 'S'}`
    frase = cena.posicao === 1 ? 'Ninguém segurou você hoje!'
      : podio ? 'No pódio! Mandou muito bem.'
      : `De ${cena.total} jogadores. Valeu por jogar — te vejo na próxima liguinha!`
    festa = podio
  } else if (cena.tipo === 'vitoria') {
    fundo = 'linear-gradient(180deg, #1E4FD6 0%, #10286B 60%, #0B1E51 100%)'
    titulo = 'VITÓRIA!'; corTitulo = AMARELO; pontos = '+3 PTS'
    frase = 'Mandou bem! Já pode respirar até a próxima rodada.'
    festa = true
  } else if (cena.tipo === 'derrota') {
    fundo = 'linear-gradient(180deg, #334155 0%, #1E293B 60%, #0F172A 100%)'
    titulo = 'DERROTA'; corTitulo = '#FCA5A5'; pontos = null
    frase = ANIMO[cena.rodada % ANIMO.length]
    festa = false
  } else {
    fundo = 'linear-gradient(180deg, #163CA8 0%, #10286B 100%)'
    titulo = 'EMPATE'; corTitulo = B; pontos = '+1 PT'
    frase = 'Ninguém cedeu! Um ponto pra cada.'
    festa = false
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="anim-resultado-titulo"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center px-6 text-center overflow-hidden"
      style={{ background: fundo, color: B }} onClick={onFechar}>
      {festa && <Confete />}

      <div className="relative flex flex-col items-center" onClick={e => e.stopPropagation()}>
        {cena.tipo !== 'final' && (
          <p className={`${pixel.className} text-[10px] mb-3`} style={{ color: SUAVE }}>RODADA {cena.rodada}</p>
        )}
        {cena.tipo === 'final' && cena.posicao === 1 && (
          <Crown className="w-12 h-12 mb-2 animate-bounce" style={{ color: AMARELO }} aria-hidden />
        )}
        <h2 id="anim-resultado-titulo" className={`${pixel.className} liga-surge text-3xl sm:text-4xl leading-tight`}
          style={{ color: corTitulo, textShadow: '0 4px 0 rgba(0,0,0,0.35)' }}>
          {titulo}
        </h2>

        <div className="mt-8 flex items-end justify-center gap-4 sm:gap-8">
          {cena.tipo === 'final' ? (
            <Lutador deck={cena.meuDeck} nome="Você" classe={cena.posicao <= 3 ? 'liga-pulo' : 'liga-balanco'} />
          ) : (
            <>
              <Lutador deck={cena.meuDeck} nome="Você"
                classe={cena.tipo === 'vitoria' ? 'liga-pulo' : cena.tipo === 'derrota' ? 'liga-desmaio' : 'liga-balanco'} />
              <span className={`${pixel.className} text-xs pb-10`} style={{ color: SUAVE }}>VS</span>
              <Lutador deck={cena.oponente.deck} nome={cena.oponente.nome}
                classe={cena.tipo === 'vitoria' ? 'liga-desmaio' : cena.tipo === 'derrota' ? 'liga-pulo' : 'liga-balanco'} />
            </>
          )}
        </div>

        {pontos && (
          <p className={`${pixel.className} liga-surge mt-6 text-xl`} style={{ color: AMARELO, animationDelay: '0.9s' }}>{pontos}</p>
        )}
        {cena.tipo === 'final' && <p className="mt-2 text-sm font-semibold" style={{ color: SUAVE }}>{cena.campanha}</p>}
        <p className="mt-4 max-w-xs text-base" style={{ color: B }}>{frase}</p>

        <button ref={botao} type="button" onClick={onFechar}
          className="mt-8 px-8 py-3 rounded-xl font-black text-base"
          style={{ backgroundColor: AMARELO, color: '#3D2E00' }}>
          Continuar
        </button>
      </div>
    </div>
  )
}
