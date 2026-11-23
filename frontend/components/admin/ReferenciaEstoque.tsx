'use client'
// Preço de referência de um produto do Estoque (v1.94.0, chave "preco-referencia-estoque") — dentro da gaveta
// "Detalhes do Produto". Pedido do Taino (23/11): o preço de mercado das cartas avulsas também nos produtos que já
// estão à venda (boosters, boxes, decks). O produto se liga a um produto selado do catálogo (tcgcsv/TCGplayer) e o
// robô "Preço das cartas" lê o preço todo dia. Só sugere; troca sozinho só com "Ajustar o preço sozinho".
// A ligação é salva pelo endpoint próprio (PUT /api/product/catalogo-cartas/ligacao/{id}), não pelo formulário.
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Loader2, TrendingUp, TrendingDown, Link2 } from 'lucide-react'
import { catalogoCartasApi, productApi, Product, ReferenciaAgora, VariacaoPreco, CartaCatalogo, ColecaoCatalogo } from '@/lib/api'
import { brl } from '@/lib/format'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { JOGOS_DE_CARTA } from '@/lib/cartasAvulsas'
import { Switch } from '@/components/ui/Switch'
import CatalogoCartaPicker from '@/components/admin/CatalogoCartaPicker'

const usd = (v: number | null | undefined) => (v == null ? '—' : `US$ ${v.toFixed(2).replace('.', ',')}`)
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Jogo do catálogo pelo nome da categoria do produto ("Pokémon", "One Piece"...). */
function jogoDaCategoria(categoria: string): string {
  const c = sem(categoria)
  return JOGOS_DE_CARTA.find(j => j !== 'Outro' && c.includes(sem(j).replace(/[^a-z0-9 ]/g, '').split(' ')[0])) ?? 'Pokémon'
}

function pct(atual: number | null | undefined, antes: number | null | undefined) {
  if (atual == null || antes == null || antes <= 0) return null
  return Math.round(((atual - antes) / antes) * 100)
}

function Variacao({ v, rotulo }: { v: number | null; rotulo: string }) {
  if (v == null) return null
  const Icone = v >= 0 ? TrendingUp : TrendingDown
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[11px] font-bold', v > 0 ? 'txt-ok' : v < 0 ? 'text-red-400' : 'text-gray-400')}>
      <Icone className="w-3 h-3" />{v > 0 ? '+' : ''}{v}% {rotulo}
    </span>
  )
}

export default function ReferenciaEstoque({ product, onAtualizado }: {
  product: Product
  onAtualizado: (p: Product) => void
}) {
  const ligada = useFuncionalidade('preco-referencia-estoque') === true
  const ligadoAoCatalogo = !!(product.cartaTcgProdutoId && product.cartaTcgCategoria && product.cartaTcgGrupo)
  const [jogo, setJogo]           = useState(() => jogoDaCategoria(product.category))
  const [escolhendo, setEscolhendo] = useState(false)
  const [salvando, setSalvando]   = useState(false)
  const [ref, setRef]             = useState<ReferenciaAgora | null>(null)
  const [variacao, setVariacao]   = useState<VariacaoPreco | null>(null)

  useEffect(() => {
    if (!ligada || !ligadoAoCatalogo) { setRef(null); setVariacao(null); return }
    let vivo = true
    catalogoCartasApi.referencia({ produtoId: product.cartaTcgProdutoId!, categoria: product.cartaTcgCategoria!, grupo: product.cartaTcgGrupo!, variante: product.cartaTcgVariante })
      .then(r => { if (vivo) setRef(r.data) }).catch(() => { if (vivo) setRef(null) })
    catalogoCartasApi.variacoes()
      .then(r => { if (vivo) setVariacao(r.data.find(v => v.productId === product.id) ?? null) }).catch(() => {})
    return () => { vivo = false }
  }, [ligada, ligadoAoCatalogo, product.id, product.cartaTcgProdutoId, product.cartaTcgCategoria, product.cartaTcgGrupo, product.cartaTcgVariante, product.cartaRefEm])

  if (!ligada || product.cartaAvulsa) return null

  async function ligar(l: { produtoId: number | null; categoria: number | null; grupo: number | null; variante?: string | null; automatico: boolean }, msg: string) {
    setSalvando(true)
    try {
      const { data } = await catalogoCartasApi.ligar(product.id, l)
      onAtualizado(data)
      setEscolhendo(false)
      toast.success(msg)
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não deu pra salvar')
    } finally { setSalvando(false) }
  }

  function escolher(c: CartaCatalogo, _col: ColecaoCatalogo) {
    ligar({ produtoId: c.produtoId, categoria: c.categoria, grupo: c.grupo, variante: c.precos.find(p => p.referencia != null)?.variante ?? null,
      automatico: false }, `Ligado a "${c.nome}" — a referência atualiza todo dia`)
  }

  async function usarSugestao(centavos: number) {
    setSalvando(true)
    try {
      await productApi.update(product.id, { ...product, priceInCents: centavos })
      onAtualizado({ ...product, priceInCents: centavos, priceInReais: centavos / 100 })
      toast.success('Preço de venda atualizado')
    } catch { toast.error('Não deu pra trocar o preço') }
    finally { setSalvando(false) }
  }

  const referencia = product.cartaRefCentavos ?? ref?.referenciaCentavos ?? null
  const diferenca = referencia ? Math.round(((product.priceInCents - referencia) / referencia) * 100) : null

  return (
    <div className="bg-surface-700 rounded-xl p-4 space-y-3 border border-surface-500 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 uppercase tracking-wider font-semibold">Preço de referência</span>
        {ligadoAoCatalogo && !escolhendo && (
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setEscolhendo(true)} className="text-brand-300 hover:underline">Trocar</button>
            <button type="button" disabled={salvando}
              onClick={() => ligar({ produtoId: null, categoria: null, grupo: null, automatico: false }, 'Desligado do catálogo')}
              className="text-gray-400 hover:text-red-400">Desligar</button>
          </span>
        )}
      </div>

      {(!ligadoAoCatalogo || escolhendo) ? (
        <>
          <p className="text-gray-400 leading-snug">
            Ligue o produto ao catálogo (TCGplayer) pra ver o preço de mercado de hoje em reais e a sugestão pela regra da loja.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-gray-400 shrink-0">Jogo</label>
            <select className="input !py-1.5 text-xs" value={jogo} onChange={e => setJogo(e.target.value)}>
              {JOGOS_DE_CARTA.filter(j => j !== 'Outro').map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          {salvando ? (
            <p className="flex items-center gap-2 text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo o preço…</p>
          ) : (
            <CatalogoCartaPicker key={jogo} jogo={jogo} tipo="selados" onEscolher={escolher} rotulo="Ligar ao catálogo" abertoDeInicio={escolhendo} />
          )}
          {escolhendo && <button type="button" onClick={() => setEscolhendo(false)} className="text-gray-400 hover:text-white">Cancelar a troca</button>}
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-gray-300"><Link2 className="w-3.5 h-3.5 text-brand-300" /> Mercado lá fora</span>
            <span className="text-lg font-black font-mono text-white">{referencia != null ? brl(referencia / 100) : '—'}</span>
          </div>
          <p className="text-gray-400">
            {usd(product.cartaRefUsd ?? ref?.mercadoUsd)}{ref ? ` × dólar R$ ${ref.cotacao.toFixed(2).replace('.', ',')}` : ''}
            {product.cartaRefEm && ` · lido em ${new Date(product.cartaRefEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
          </p>
          <div className="flex gap-3">
            <Variacao v={pct(referencia, variacao?.ha7Dias)} rotulo="7d" />
            <Variacao v={pct(referencia, variacao?.ha30Dias)} rotulo="30d" />
          </div>
          {diferenca != null && (
            <p className="text-gray-400">
              Seu preço ({brl(product.priceInReais)}) está{' '}
              <b className={diferenca >= 0 ? 'txt-ok' : 'text-red-400'}>{Math.abs(diferenca)}% {diferenca >= 0 ? 'acima' : 'abaixo'}</b> da referência
            </p>
          )}
          {ref?.cotacaoDegradada && <p className="text-yellow-400">{ref.avisoCotacao ?? 'Cotação do dólar desatualizada.'}</p>}
          {ref?.sugestaoCentavos != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-300">Sugestão pela regra: <b className="text-brand-300">{brl(ref.sugestaoCentavos / 100)}</b></span>
              {ref.sugestaoCentavos !== product.priceInCents && (
                <button type="button" disabled={salvando} onClick={() => usarSugestao(ref.sugestaoCentavos!)}
                  className="btn-secondary !py-1 !px-2.5 text-xs">Usar</button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-gray-300">
              <b className="text-white">Ajustar o preço sozinho</b> todo dia
              <span className="block text-[10px] text-gray-500">Desligado: só sugere.</span>
            </span>
            <Switch ligado={product.cartaPrecoAutomatico ?? false} disabled={salvando} label="Ajustar o preço sozinho todo dia"
              onChange={v => ligar({ produtoId: product.cartaTcgProdutoId!, categoria: product.cartaTcgCategoria!, grupo: product.cartaTcgGrupo!,
                variante: product.cartaTcgVariante, automatico: v }, v ? 'O preço vai acompanhar a referência todo dia' : 'Agora só sugere')} />
          </div>
          <p className="text-[10px] text-gray-500 leading-snug">
            Preço dos EUA (TCGplayer), em dólar. Produto lacrado aqui costuma ter outro preço — use como referência, não como regra.
          </p>
        </>
      )}
    </div>
  )
}
