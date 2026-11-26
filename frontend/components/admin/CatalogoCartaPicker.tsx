'use client'
// Buscar no catálogo (v1.92.0, chave "preco-referencia-cartas") — dentro do cadastro de carta avulsa.
// Jogo (o do formulário) → coleção → carta. O catálogo é o tcgcsv.com (espelho do TCGplayer, todos os jogos):
// escolher a carta preenche nome, coleção, número, raridade e foto, e liga a carta ao preço de mercado do dia.
// A coleção vem do catálogo por coleção (não há busca por nome no jogo inteiro): a sigla ajuda a achar
// (ex.: MEW = 151), é o código impresso no canto da carta.
// tipo="selados" (v1.94.0, Estoque): a mesma escolha, mas lista os produtos selados da coleção (booster, box, deck).
// emTela (v1.102.0, chave "cadastro-carta-telas"): ocupa a tela "Escolher a carta" — listas com a altura da página,
// grade mais larga no computador e sem o botão Fechar (quem sai é o cabeçalho da tela).
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Search, Loader2, ChevronLeft, BookOpen, ImageOff } from 'lucide-react'
import { catalogoCartasApi, ColecaoCatalogo, CartaCatalogo } from '@/lib/api'
import { brlDeCentavos } from '@/lib/format'
import { useCotacaoCartas, emCentavos, usd, rotuloCotacao } from '@/lib/cotacaoCartas'

/** Quantas cartas mostrar de cada vez (coleção grande passa de 200). */
const POR_VEZ = 60

/**
 * Foto do catálogo numa caixa de tamanho fixo. Se a do CDN do TCGplayer falhar (acontece em rajada), tenta a menor
 * (_200w) e depois mostra um quadro vazio — antes a caixa encolhia e desmontava a grade (print do Taino, 23/11).
 */
function FotoCatalogo({ src, selado }: { src: string | null; selado: boolean }) {
  const [atual, setAtual] = useState(src)
  const [falhou, setFalhou] = useState(!src)
  return (
    <div className={clsx('relative w-full rounded bg-surface-700 overflow-hidden', selado ? 'aspect-square' : 'aspect-[63/88]')}>
      {!falhou && atual ? (
        <img src={atual} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-contain"
          onError={() => {
            if (atual.endsWith('_400w.jpg')) setAtual(atual.replace('_400w.jpg', '_200w.jpg'))
            else setFalhou(true)
          }} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-gray-500" title="Foto indisponível no catálogo agora">
          <ImageOff className="w-5 h-5" />
        </span>
      )}
    </div>
  )
}

/** Coleção que ainda vai sair (data de lançamento no futuro) — no catálogo ela costuma ter só os lacrados. */
function aindaVaiSair(c: ColecaoCatalogo) {
  return !!c.lancamento && new Date(c.lancamento).getTime() > Date.now()
}

export default function CatalogoCartaPicker({ jogo, onEscolher, tipo = 'cartas', rotulo, abertoDeInicio = false, emTela = false }: {
  jogo: string
  onEscolher: (carta: CartaCatalogo, colecao: ColecaoCatalogo) => void
  /** cartas (Mercado de Cartas) ou selados (Estoque: booster, box, deck). */
  tipo?: 'cartas' | 'selados'
  /** Texto do botão fechado (padrão: "Buscar no catálogo de {jogo}"). */
  rotulo?: string
  abertoDeInicio?: boolean
  /** Tela própria (cadastro de carta em telas): sem limite de altura apertado nem botão Fechar. */
  emTela?: boolean
}) {
  const selados = tipo === 'selados'
  // Reais primeiro (v1.95.0): o preço do catálogo vem em dólar e a tela converte pelo dólar de agora
  const cotacao = useCotacaoCartas()
  const [aberto, setAberto]         = useState(abertoDeInicio || emTela)
  const [colecoes, setColecoes]     = useState<ColecaoCatalogo[] | null>(null)
  const [erro, setErro]             = useState<string | null>(null)
  const [buscaColecao, setBuscaColecao] = useState('')
  const [colecao, setColecao]       = useState<ColecaoCatalogo | null>(null)
  const [cartas, setCartas]         = useState<CartaCatalogo[] | null>(null)
  const [buscaCarta, setBuscaCarta] = useState('')
  const [limite, setLimite]         = useState(POR_VEZ)

  // Trocou o jogo: volta pra lista de coleções dele
  useEffect(() => { setColecoes(null); setColecao(null); setCartas(null); setBuscaColecao(''); setErro(null) }, [jogo])

  useEffect(() => {
    if (!aberto || colecoes) return
    catalogoCartasApi.colecoes(jogo)
      .then(r => setColecoes(r.data))
      .catch(e => setErro(e?.response?.data?.message ?? 'O catálogo não respondeu. Tente de novo daqui a pouco.'))
  }, [aberto, jogo, colecoes])

  useEffect(() => {
    if (!colecao) return
    setCartas(null); setBuscaCarta('')
    const pedido: Promise<CartaCatalogo[]> = selados
      // Selado não tem número nem raridade: entra no mesmo formato da lista
      ? catalogoCartasApi.selados(colecao.categoria, colecao.grupo).then(r => r.data.map(s => ({ ...s, numero: null, raridade: null })))
      : catalogoCartasApi.cartas(colecao.categoria, colecao.grupo).then(r => r.data)
    pedido
      .then(setCartas)
      .catch(e => setErro(e?.response?.data?.message ?? 'O catálogo não respondeu.'))
  }, [colecao, selados])

  const colecoesVisiveis = useMemo(() => {
    const t = buscaColecao.trim().toLowerCase()
    const lista = colecoes ?? []
    return (t ? lista.filter(c => c.nomeCompleto.toLowerCase().includes(t) || (c.sigla ?? '').toLowerCase() === t
      || (c.sigla ?? '').toLowerCase().startsWith(t)) : lista).slice(0, 40)
  }, [colecoes, buscaColecao])

  // Volta pro começo ao trocar de coleção ou de busca
  useEffect(() => { setLimite(POR_VEZ) }, [colecao, buscaCarta])

  const cartasFiltradas = useMemo(() => {
    const t = buscaCarta.trim().toLowerCase()
    const lista = cartas ?? []
    return t ? lista.filter(c => c.nome.toLowerCase().includes(t) || (c.numero ?? '').toLowerCase().includes(t)) : lista
  }, [cartas, buscaCarta])
  const cartasVisiveis = cartasFiltradas.slice(0, limite)

  if (jogo === 'Outro') return null

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-brand-500/50 py-2.5 text-sm font-semibold text-brand-300 hover:bg-brand-500/10">
        <BookOpen className="w-4 h-4" /> {rotulo ?? `Buscar no catálogo de ${jogo}`}
      </button>
    )
  }

  return (
    // Na tela própria, sem a caixa cinza: o catálogo fica direto no cartão branco da tela (pedido do Taino, 25/11)
    <div className={clsx('space-y-2.5', !emTela && 'rounded-xl border border-surface-500 bg-surface-700/40 p-3')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white flex items-center gap-1.5 min-w-0">
          {colecao && (
            <button type="button" onClick={() => { setColecao(null); setCartas(null) }} aria-label="Voltar pras coleções"
              className="p-0.5 rounded hover:bg-surface-700 text-gray-400 shrink-0"><ChevronLeft className="w-4 h-4" /></button>
          )}
          <span className="truncate">{colecao ? colecao.nome : `Catálogo de ${jogo}`}</span>
        </p>
        {!emTela && <button type="button" onClick={() => setAberto(false)} className="text-xs text-gray-400 hover:text-white shrink-0">Fechar</button>}
      </div>

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {!colecao ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input className="input pl-9" autoFocus value={buscaColecao} onChange={e => setBuscaColecao(e.target.value)}
              placeholder="Coleção ou sigla (ex.: 151, MEW, Surging Sparks)" />
          </div>
          {!colecoes && !erro ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
          ) : (
            <ul className={clsx('overflow-y-auto divide-y divide-surface-600 rounded-lg border border-surface-600',
              emTela ? 'max-h-[max(16rem,calc(100dvh-22rem))]' : 'max-h-56')}>
              {colecoesVisiveis.map(c => (
                <li key={`${c.categoria}-${c.grupo}`}>
                  <button type="button" onClick={() => setColecao(c)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{c.nome}{c.japonesa && <span className="text-gray-400"> · Japão</span>}</span>
                      {c.nomeCompleto !== c.nome && <span className="block text-[11px] text-gray-400 truncate">{c.nomeCompleto}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      {c.sigla && <span className="block text-[11px] font-black text-brand-300">{c.sigla}</span>}
                      {c.lancamento && (aindaVaiSair(c)
                        ? <span className="block text-[10px] font-bold text-yellow-400" title="Ainda vai sair: o catálogo costuma ter só os lacrados">
                            sai {new Date(c.lancamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          </span>
                        : <span className="block text-[11px] text-gray-400">{new Date(c.lancamento).getUTCFullYear()}</span>)}
                    </span>
                  </button>
                </li>
              ))}
              {colecoes && colecoesVisiveis.length === 0 && <li className="px-3 py-3 text-xs text-gray-400">Nenhuma coleção com esse nome.</li>}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input className="input pl-9" autoFocus value={buscaCarta} onChange={e => setBuscaCarta(e.target.value)}
              placeholder={selados ? 'Nome (ex.: Booster Box, Elite Trainer, Bundle)' : 'Nome ou número (ex.: Charizard, 199)'} />
          </div>
          {!cartas && !erro ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
          ) : (
            <>
            <div className={clsx('overflow-y-auto grid gap-2 pr-1',
              emTela ? 'max-h-[max(18rem,calc(100dvh-22rem))] grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
                : 'max-h-72 grid-cols-3 sm:grid-cols-4')}>
              {cartasVisiveis.map(c => {
                const preco = c.precos.find(p => p.referencia != null)
                return (
                  <button key={c.produtoId} type="button" onClick={() => onEscolher(c, colecao)}
                    className={clsx('text-left rounded-lg border border-surface-600 p-1.5 hover:border-brand-500 hover:bg-surface-700 transition-colors')}>
                    <FotoCatalogo key={c.imagem ?? c.produtoId} src={c.imagem} selado={selados} />
                    <p className="text-[11px] font-semibold text-white leading-tight mt-1 line-clamp-2">{c.nome}</p>
                    <p className="text-[10px] text-gray-400">{c.numero}{c.raridade ? ` · ${c.raridade}` : ''}</p>
                    {(() => {
                      const reais = emCentavos(preco?.referencia, cotacao)
                      return reais != null
                        ? <><p className="text-[11px] font-black text-brand-300">{brlDeCentavos(reais)}</p>
                            <p className="text-[9px] text-gray-500">{usd(preco?.referencia)}</p></>
                        : <p className="text-[10px] font-bold text-brand-300">{usd(preco?.referencia)}</p>
                    })()}
                  </button>
                )
              })}
              {cartas && cartasVisiveis.length === 0 && (
                <p className="col-span-full text-xs text-gray-400 py-3 leading-snug">
                  {cartas.length > 0
                    ? (selados ? 'Nenhum produto com essa busca.' : 'Nenhuma carta com essa busca.')
                    : selados
                    ? 'Esta coleção não tem produto lacrado no catálogo.'
                    : colecao && aindaVaiSair(colecao)
                    ? `Esta coleção sai em ${new Date(colecao.lancamento!).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} — o catálogo ainda não tem as cartas, só os lacrados. Cadastre à mão ou volte depois do lançamento.`
                    : 'O catálogo não tem cartas avulsas nesta coleção (costuma ser deck pronto, kit de evento ou coleção nova que ainda não foi cadastrada lá). Cadastre à mão ou escolha outra coleção.'}
                </p>
              )}
            </div>
            {cartasFiltradas.length > cartasVisiveis.length && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                <span>Mostrando {cartasVisiveis.length} de {cartasFiltradas.length} — busque pelo nome ou número</span>
                <button type="button" onClick={() => setLimite(l => l + POR_VEZ)} className="font-semibold text-brand-300 hover:underline shrink-0">
                  Mostrar mais
                </button>
              </div>
            )}
            </>
          )}
        </>
      )}
      <p className="text-[10px] text-gray-500 leading-snug">
        Preço do TCGplayer (EUA, carta em inglês) em reais pelo {rotuloCotacao(cotacao) || 'dólar do dia'}. Pro mercado brasileiro, confira no &quot;Ver na Liga&quot;.
      </p>
    </div>
  )
}
