'use client'
// Buscar no catálogo (v1.92.0, chave "preco-referencia-cartas") — dentro do cadastro de carta avulsa.
// Jogo (o do formulário) → coleção → carta. O catálogo é o tcgcsv.com (espelho do TCGplayer, todos os jogos):
// escolher a carta preenche nome, coleção, número, raridade e foto, e liga a carta ao preço de mercado do dia.
// A coleção vem do catálogo por coleção (não há busca por nome no jogo inteiro): a sigla ajuda a achar
// (ex.: MEW = 151), é o código impresso no canto da carta.
// tipo="selados" (v1.94.0, Estoque): a mesma escolha, mas lista os produtos selados da coleção (booster, box, deck).
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Search, Loader2, ChevronLeft, BookOpen } from 'lucide-react'
import { catalogoCartasApi, ColecaoCatalogo, CartaCatalogo } from '@/lib/api'
import { brlDeCentavos } from '@/lib/format'
import { useCotacaoCartas, emCentavos, usd, rotuloCotacao } from '@/lib/cotacaoCartas'

export default function CatalogoCartaPicker({ jogo, onEscolher, tipo = 'cartas', rotulo, abertoDeInicio = false }: {
  jogo: string
  onEscolher: (carta: CartaCatalogo, colecao: ColecaoCatalogo) => void
  /** cartas (Mercado de Cartas) ou selados (Estoque: booster, box, deck). */
  tipo?: 'cartas' | 'selados'
  /** Texto do botão fechado (padrão: "Buscar no catálogo de {jogo}"). */
  rotulo?: string
  abertoDeInicio?: boolean
}) {
  const selados = tipo === 'selados'
  // Reais primeiro (v1.95.0): o preço do catálogo vem em dólar e a tela converte pelo dólar de agora
  const cotacao = useCotacaoCartas()
  const [aberto, setAberto]         = useState(abertoDeInicio)
  const [colecoes, setColecoes]     = useState<ColecaoCatalogo[] | null>(null)
  const [erro, setErro]             = useState<string | null>(null)
  const [buscaColecao, setBuscaColecao] = useState('')
  const [colecao, setColecao]       = useState<ColecaoCatalogo | null>(null)
  const [cartas, setCartas]         = useState<CartaCatalogo[] | null>(null)
  const [buscaCarta, setBuscaCarta] = useState('')

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

  const cartasVisiveis = useMemo(() => {
    const t = buscaCarta.trim().toLowerCase()
    const lista = cartas ?? []
    return (t ? lista.filter(c => c.nome.toLowerCase().includes(t) || (c.numero ?? '').toLowerCase().includes(t)) : lista).slice(0, 60)
  }, [cartas, buscaCarta])

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
    <div className="rounded-xl border border-surface-500 bg-surface-700/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white flex items-center gap-1.5 min-w-0">
          {colecao && (
            <button type="button" onClick={() => { setColecao(null); setCartas(null) }} aria-label="Voltar pras coleções"
              className="p-0.5 rounded hover:bg-surface-700 text-gray-400 shrink-0"><ChevronLeft className="w-4 h-4" /></button>
          )}
          <span className="truncate">{colecao ? colecao.nome : `Catálogo de ${jogo}`}</span>
        </p>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-gray-400 hover:text-white shrink-0">Fechar</button>
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
            <ul className="max-h-56 overflow-y-auto divide-y divide-surface-600 rounded-lg border border-surface-600">
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
                      {c.lancamento && <span className="block text-[11px] text-gray-400">{new Date(c.lancamento).getUTCFullYear()}</span>}
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
            <div className="max-h-72 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-2 pr-1">
              {cartasVisiveis.map(c => {
                const preco = c.precos.find(p => p.referencia != null)
                return (
                  <button key={c.produtoId} type="button" onClick={() => onEscolher(c, colecao)}
                    className={clsx('text-left rounded-lg border border-surface-600 p-1.5 hover:border-brand-500 hover:bg-surface-700 transition-colors')}>
                    {c.imagem
                      ? <img src={c.imagem} alt="" loading="lazy" className="w-full aspect-[63/88] object-contain rounded" />
                      : <div className="w-full aspect-[63/88] rounded bg-surface-700" />}
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
                <p className="col-span-full text-xs text-gray-400 py-3">
                  {selados && cartas.length === 0 ? 'Esta coleção não tem produto selado no catálogo.' : selados ? 'Nenhum produto com essa busca.' : 'Nenhuma carta com essa busca.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-gray-500 leading-snug">
        Preço do TCGplayer (EUA, carta em inglês) em reais pelo {rotuloCotacao(cotacao) || 'dólar do dia'}. Pro mercado brasileiro, confira no &quot;Ver na Liga&quot;.
      </p>
    </div>
  )
}
