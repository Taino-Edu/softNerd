'use client'
// Cartas avulsas da loja (v1.91.0, chave "cartas-como-produto") — tela Marketplace do painel.
// Cada carta é um produto marcado (cartaAvulsa): o cliente reserva pela sacola e paga no Pix como qualquer
// produto, o estoque baixa sozinho e a carta também sai no Frente de Caixa. Cópias iguais = quantidade.
// "Ver na Liga" abre a busca da carta na Liga pra conferir o menor preço (pedido do Maikon, 19/11).
// Preço de referência (v1.92.0, chave "preco-referencia-cartas"): "Buscar no catálogo" liga a carta ao catálogo de
// todos os jogos (tcgcsv/TCGplayer), mostra a referência do dia e a sugestão pela regra da loja; a lista mostra a
// referência e a variação de 7 dias. "Ajustar o preço sozinho" é por carta — o padrão é só sugerir.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  productApi, uploadApi, catalogoCartasApi, Product, CartaCatalogo, ColecaoCatalogo, ReferenciaAgora, VariacaoPreco,
  RegraPrecoCarta,
} from '@/lib/api'
import { brlDeCentavos } from '@/lib/format'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { Switch } from '@/components/ui/Switch'
import CatalogoCartaPicker from '@/components/admin/CatalogoCartaPicker'
import { useCotacaoCartas, emCentavos, rotuloCotacao } from '@/lib/cotacaoCartas'
import { Table } from '@/components/ui/Table'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  JOGOS_DE_CARTA, CONDICOES_DE_CARTA, IDIOMAS_DE_CARTA, CATEGORIA_CARTA_AVULSA, resumoCarta, linkDaLiga, raridadesDoJogo,
} from '@/lib/cartasAvulsas'
import {
  Search, Package, Loader2, Trash2, Eye, Plus, Pencil, X, ImagePlus, ExternalLink, Layers, Link2, RefreshCw,
  SlidersHorizontal, TrendingUp, TrendingDown,
} from 'lucide-react'

type Form = {
  nome: string; jogo: string; condicao: string; idioma: string; colecao: string
  numero: string; raridade: string; preco: string; quantidade: string; descricao: string
}

function centavosDe(texto: string) {
  return Math.round(parseFloat(texto.replace(/\./g, '').replace(',', '.') || '0') * 100)
}

function usd(v: number | null | undefined) {
  return v == null ? '—' : `US$ ${v.toFixed(2).replace('.', ',')}`
}

/** "+12%" / "−5%" entre a referência de hoje e a de antes (null = sem histórico ainda). */
function variacao(atual: number | null | undefined, antes: number | null | undefined): number | null {
  if (atual == null || antes == null || antes <= 0) return null
  return Math.round(((atual - antes) / antes) * 100)
}

function Variacao({ pct, rotulo }: { pct: number | null; rotulo: string }) {
  if (pct == null) return null
  const Icone = pct >= 0 ? TrendingUp : TrendingDown
  return (
    <span title={`Variação da referência em ${rotulo}`}
      className={clsx('inline-flex items-center gap-0.5 text-[11px] font-bold', pct > 0 ? 'txt-ok' : pct < 0 ? 'text-red-400' : 'text-gray-400')}>
      <Icone className="w-3 h-3" />{pct > 0 ? '+' : ''}{pct}% {rotulo}
    </span>
  )
}

type LigacaoCatalogo = { produtoId: number; categoria: number; grupo: number }

// ── Modal criar / editar carta ────────────────────────────────────────────────
function CartaModal({ inicial, colecoes, comCatalogo, onClose, onSalvo }: {
  inicial?: Product
  /** Chave "preco-referencia-cartas" ligada: "Buscar no catálogo", referência e "Ajustar sozinho". */
  comCatalogo: boolean
  /** Coleções já cadastradas por jogo — sugeridas no campo pro Mercado agrupar certo (mesmo nome, mesma coleção). */
  colecoes: Record<string, string[]>
  onClose: () => void
  onSalvo: (p: Product) => void
}) {
  const [form, setForm] = useState<Form>({
    nome:       inicial?.name ?? '',
    jogo:       inicial?.cartaJogo ?? 'Pokémon',
    condicao:   inicial?.cartaCondicao ?? 'NM',
    idioma:     inicial?.cartaIdioma ?? 'PT',
    colecao:    inicial?.cartaColecao ?? '',
    numero:     inicial?.cartaNumero ?? '',
    raridade:   inicial?.cartaRaridade ?? '',
    preco:      inicial ? (inicial.priceInCents / 100).toFixed(2).replace('.', ',') : '',
    quantidade: String(inicial?.stockQuantity ?? 1),
    descricao:  inicial?.description ?? '',
  })
  const [foto, setFoto]         = useState<string | null>(inicial?.imageUrl ?? null)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const liga = linkDaLiga(form.jogo, form.nome)

  // Ligação com o catálogo (preço de referência)
  const [tcg, setTcg] = useState<LigacaoCatalogo | null>(
    inicial?.cartaTcgProdutoId && inicial.cartaTcgCategoria && inicial.cartaTcgGrupo
      ? { produtoId: inicial.cartaTcgProdutoId, categoria: inicial.cartaTcgCategoria, grupo: inicial.cartaTcgGrupo } : null)
  const [variante, setVariante]     = useState<string | null>(inicial?.cartaTcgVariante ?? null)
  const [automatico, setAutomatico] = useState(inicial?.cartaPrecoAutomatico ?? false)
  const [ref, setRef]               = useState<ReferenciaAgora | null>(null)
  const [carregandoRef, setCarregandoRef] = useState(false)

  useEffect(() => {
    if (!comCatalogo || !tcg) { setRef(null); return }
    let vivo = true
    setCarregandoRef(true)
    catalogoCartasApi.referencia({ ...tcg, variante })
      .then(r => { if (vivo) setRef(r.data) })
      .catch(() => { if (vivo) setRef(null) })
      .finally(() => { if (vivo) setCarregandoRef(false) })
    return () => { vivo = false }
  }, [comCatalogo, tcg, variante])

  function escolherDoCatalogo(c: CartaCatalogo, col: ColecaoCatalogo) {
    setForm(f => ({ ...f, nome: c.nome, colecao: col.nome, numero: c.numero ?? f.numero, raridade: c.raridade ?? f.raridade }))
    if (c.imagemGrande || c.imagem) setFoto(c.imagemGrande ?? c.imagem)
    setTcg({ produtoId: c.produtoId, categoria: c.categoria, grupo: c.grupo })
    setVariante(c.precos.find(p => p.referencia != null)?.variante ?? null)
    toast.success('Carta preenchida pelo catálogo — confira estado, idioma e quantidade')
  }

  function desligarCatalogo() { setTcg(null); setVariante(null); setAutomatico(false) }

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setEnviando(true)
    try { setFoto((await uploadApi.image(f)).data.url) }
    catch { toast.error('Não deu pra enviar a foto') }
    finally { setEnviando(false); e.target.value = '' }
  }

  async function salvar() {
    const nome = form.nome.trim()
    const preco = centavosDe(form.preco)
    const quantidade = parseInt(form.quantidade || '0', 10)
    if (!nome) { toast.error('Informe o nome da carta'); return }
    if (preco <= 0) { toast.error('Informe o preço'); return }
    if (!Number.isFinite(quantidade) || quantidade < 0) { toast.error('Quantidade inválida'); return }
    setSalvando(true)
    try {
      // Edição parte do produto inteiro (o PUT grava campo a campo — não pode perder custo, código de barras...)
      const corpo: Partial<Product> = {
        ...(inicial ?? {
          costPriceInCents: 0, isActive: true, isFeatured: false, showOnSite: true, showOnMarketplace: true,
          isPreVenda: false, hasVariants: false, imageUrls: [],
        }),
        name: nome,
        category: inicial?.category || CATEGORIA_CARTA_AVULSA,
        priceInCents: preco,
        stockQuantity: quantidade,
        // Carta é peça única: sem "últimas unidades" nem alerta de estoque baixo
        minimumStock: 0,
        imageUrl: foto,
        description: form.descricao.trim() || null,
        cartaAvulsa: true,
        cartaJogo: form.jogo,
        cartaCondicao: form.condicao,
        cartaIdioma: form.idioma,
        cartaColecao: form.colecao.trim() || null,
        cartaNumero: form.numero.trim() || null,
        cartaRaridade: form.raridade.trim() || null,
        cartaTcgProdutoId: tcg?.produtoId ?? null,
        cartaTcgCategoria: tcg?.categoria ?? null,
        cartaTcgGrupo: tcg?.grupo ?? null,
        cartaTcgVariante: tcg ? variante : null,
        cartaPrecoAutomatico: !!tcg && automatico,
      }
      const { data } = inicial ? await productApi.update(inicial.id, corpo) : await productApi.create(corpo)
      // Ligada ao catálogo: já grava a referência de hoje (sem esperar o robô das 17h30)
      if (comCatalogo && tcg) await catalogoCartasApi.atualizar([data.id]).catch(() => {})
      onSalvo(data)
      toast.success(inicial ? 'Carta atualizada' : 'Carta no Mercado!')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Não deu pra salvar')
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-auto">
      {/* mb-32 no celular: os botões do pé rolam acima do assistente flutuante (que fica por cima do modal) */}
      <div className="bg-surface-800 border border-surface-500 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-5 p-6 mt-4 mb-32 sm:my-4 self-start sm:self-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{inicial ? 'Editar carta' : 'Nova carta'}</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg hover:bg-surface-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        {comCatalogo && (tcg ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-brand-200 min-w-0">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Ligada ao catálogo{form.numero ? ` · ${form.numero}` : ''} — o preço de referência atualiza todo dia</span>
            </span>
            <button type="button" onClick={desligarCatalogo} className="text-gray-400 hover:text-red-400 shrink-0">Desligar</button>
          </div>
        ) : (
          <CatalogoCartaPicker jogo={form.jogo} onEscolher={escolherDoCatalogo} />
        ))}

        <div className="flex gap-4 items-start">
          {/* Foto */}
          <div className="shrink-0">
            <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={enviarFoto} />
            <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando}
              aria-label={foto ? 'Trocar a foto da carta' : 'Enviar foto da carta'}
              className={clsx('w-20 sm:w-24 aspect-[63/88] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 overflow-hidden text-gray-400',
                foto ? 'border-brand-500/40' : 'border-surface-500 hover:border-brand-500/60')}>
              {enviando ? <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                : foto ? <img src={foto} alt="" className="w-full h-full object-contain" />
                : <><ImagePlus className="w-6 h-6" /><span className="text-[11px] font-medium text-center px-1 leading-tight">Foto da carta</span></>}
            </button>
            {foto && <button type="button" onClick={() => setFoto(null)} className="mt-1 w-full text-[11px] text-gray-400 hover:text-red-400">Tirar foto</button>}
          </div>

          <div className="flex-1 min-w-0">
            <label className="label">Nome da carta *</label>
            <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Charizard ex" />
            <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
              Uma linha por carta. Cópias iguais (mesmo estado e idioma) entram como quantidade.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Jogo</label>
            <select className="input" value={form.jogo} onChange={e => set('jogo', e.target.value)}>
              {JOGOS_DE_CARTA.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Idioma</label>
            <select className="input" value={form.idioma} onChange={e => set('idioma', e.target.value)}>
              {IDIOMAS_DE_CARTA.map(i => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.condicao} onChange={e => set('condicao', e.target.value)}>
              {CONDICOES_DE_CARTA.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quantidade</label>
            <input className="input" type="number" min={0} inputMode="numeric" value={form.quantidade}
              onChange={e => set('quantidade', e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>

        {/* Coleção, número e raridade: o Mercado separa as cartas por coleção e filtra/ordena pelo resto */}
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <div className="min-w-0">
            <label className="label">Coleção</label>
            <input className="input" list="colecoes-da-carta" value={form.colecao} onChange={e => set('colecao', e.target.value)}
              placeholder="Ex: Escarlate e Violeta 151" />
            <datalist id="colecoes-da-carta">
              {(colecoes[form.jogo] ?? []).map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="199/165" />
          </div>
        </div>

        <div>
          <label className="label">Raridade</label>
          <input className="input" list="raridades-da-carta" value={form.raridade} onChange={e => set('raridade', e.target.value)}
            placeholder="Escolha ou escreva (ex: Rara Dupla)" />
          <datalist id="raridades-da-carta">
            {raridadesDoJogo(form.jogo).map(r => <option key={r} value={r} />)}
          </datalist>
        </div>

        <div>
          <label className="label">Preço (R$) *</label>
          <div className="flex gap-2">
            <input className="input flex-1 min-w-0" type="text" inputMode="decimal" placeholder="0,00" value={form.preco}
              onChange={e => {
                const v = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',')
                if (/^\d*(,\d{0,2})?$/.test(v)) set('preco', v)
              }} />
            {liga && (
              <a href={liga} target="_blank" rel="noopener noreferrer"
                className="btn-secondary shrink-0 flex items-center gap-1.5 whitespace-nowrap">
                <ExternalLink className="w-4 h-4" /> Ver na Liga
              </a>
            )}
          </div>
          {comCatalogo && tcg && (
            <div className="mt-2 rounded-xl border border-surface-500 bg-surface-700/40 p-3 space-y-2 text-xs">
              {carregandoRef && !ref ? (
                <p className="flex items-center gap-2 text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo o preço de mercado…</p>
              ) : !ref || ref.precos.length === 0 ? (
                <p className="text-gray-400">Esta carta ainda não tem preço no catálogo — use o &quot;Ver na Liga&quot;.</p>
              ) : (
                <>
                  {ref.precos.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ref.precos.map(p => (
                        <button key={p.variante} type="button" onClick={() => setVariante(p.variante)}
                          className={clsx('rounded-lg border px-2 py-1 font-semibold',
                            (variante ?? ref.variante) === p.variante ? 'border-brand-500 bg-brand-500/20 text-white' : 'border-surface-500 text-gray-400')}>
                          {p.variante} · {p.referencia != null ? brlDeCentavos(Math.round(p.referencia * ref.cotacao * 100)) : '—'}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Reais primeiro, dólar ao lado (v1.95.0) */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-300">Referência (mercado lá fora)</span>
                    <b className="text-base font-black text-white">{ref.referenciaCentavos != null ? brlDeCentavos(ref.referenciaCentavos) : '—'}</b>
                  </div>
                  <p className="text-gray-400">
                    {usd(ref.mercadoUsd)} × {rotuloCotacao({ valor: ref.cotacao, obtidaEm: ref.cotacaoEm ?? null, fonte: ref.cotacaoFonte ?? null })}
                  </p>
                  {ref.cotacaoDegradada && <p className="text-yellow-400">{ref.avisoCotacao ?? 'Cotação do dólar desatualizada — confira antes de precificar.'}</p>}
                  {ref.sugestaoCentavos != null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-300">Sugestão pela regra da loja: <b className="text-brand-300">{brlDeCentavos(ref.sugestaoCentavos)}</b></span>
                      <button type="button" onClick={() => set('preco', (ref.sugestaoCentavos! / 100).toFixed(2).replace('.', ','))}
                        className="btn-secondary !py-1 !px-2.5 text-xs">Usar</button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-gray-300">
                      <b className="text-white">Ajustar o preço sozinho</b> todo dia pela regra da loja
                      <span className="block text-[10px] text-gray-500">Desligado: só sugere — o preço de venda é o que você digitar.</span>
                    </span>
                    <Switch ligado={automatico} onChange={setAutomatico} label="Ajustar o preço sozinho todo dia (pela regra da loja)" />
                  </div>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Preço dos EUA, em dólar, de carta em inglês e sem diferença por estado. Carta em português costuma ter outro preço aqui — confira no &quot;Ver na Liga&quot;.
                  </p>
                </>
              )}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-1.5">
            {liga ? 'Abre a busca desta carta na Liga numa aba nova — confira o menor preço e digite aqui.'
              : form.nome.trim() ? 'Este jogo não tem Liga — pesquise o preço por fora.'
              : 'Digite o nome pra conferir o preço na Liga.'}
          </p>
        </div>

        <div>
          <label className="label">Observação (opcional)</label>
          <textarea className="input h-16 resize-none" value={form.descricao} onChange={e => set('descricao', e.target.value)}
            placeholder="Ex: holo, primeira edição, pequena marca no verso" />
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={salvando || enviando} className="btn-primary flex items-center gap-2">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {inicial ? 'Salvar' : 'Pôr no Mercado'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tela ──────────────────────────────────────────────────────────────────────
// ── Regra de preço da loja ────────────────────────────────────────────────────
function RegraModal({ onClose }: { onClose: () => void }) {
  const [regra, setRegra] = useState<RegraPrecoCarta | null>(null)
  const [fator, setFator] = useState('100')
  const [arredondar, setArredondar] = useState(50)
  const [minimo, setMinimo] = useState('1,00')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    catalogoCartasApi.regra().then(({ data }) => {
      setRegra(data)
      setFator(String(data.fatorPercent).replace('.', ','))
      setArredondar(data.arredondarCentavos)
      setMinimo((data.minimoCentavos / 100).toFixed(2).replace('.', ','))
    }).catch(() => toast.error('Não deu pra ler a regra'))
  }, [])

  const fatorNum = parseFloat(fator.replace(',', '.')) || 0
  const exemplo = Math.max(Math.ceil((10000 * fatorNum / 100) / arredondar) * arredondar, centavosDe(minimo))

  async function salvar() {
    setSalvando(true)
    try {
      await catalogoCartasApi.salvarRegra({ fatorPercent: fatorNum, arredondarCentavos: arredondar, minimoCentavos: centavosDe(minimo) })
      toast.success('Regra salva — vale pras sugestões e pro ajuste de amanhã')
      onClose()
    } catch (e: unknown) {
      const r = (e as { response?: { status?: number; data?: { message?: string } } })?.response
      toast.error(r?.status === 403 ? 'Só o admin muda a regra de preço' : r?.data?.message ?? 'Não deu pra salvar')
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-auto">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-4 p-6 mb-32 sm:mb-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Regra de preço das cartas</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg hover:bg-surface-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-400 leading-snug">
          A sugestão de preço sai da referência (mercado lá fora × dólar do dia). Vale pro botão &quot;Usar&quot; do cadastro e pras cartas
          marcadas com &quot;Ajustar o preço sozinho&quot;.
        </p>
        {!regra ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div> : (
          <>
            <div>
              <label className="label">Porcentagem da referência</label>
              <div className="flex items-center gap-2">
                <input className="input w-28" inputMode="decimal" value={fator}
                  onChange={e => { const v = e.target.value.replace(/[^\d,]/g, ''); if (/^\d{0,3}(,\d{0,2})?$/.test(v)) setFator(v) }} />
                <span className="text-sm text-gray-400">% (100 = igual, 90 = 10% abaixo)</span>
              </div>
            </div>
            <div>
              <label className="label">Arredondar pra cima em</label>
              <select className="input" value={arredondar} onChange={e => setArredondar(Number(e.target.value))}>
                <option value={1}>Centavo (sem arredondar)</option>
                <option value={50}>R$ 0,50</option>
                <option value={100}>R$ 1,00</option>
                <option value={500}>R$ 5,00</option>
              </select>
            </div>
            <div>
              <label className="label">Preço mínimo (R$)</label>
              <input className="input w-32" inputMode="decimal" value={minimo}
                onChange={e => { const v = e.target.value.replace(/[^\d,]/g, ''); if (/^\d*(,\d{0,2})?$/.test(v)) setMinimo(v) }} />
            </div>
            <p className="text-xs text-gray-300">Exemplo: referência de R$ 100,00 → sugestão de <b className="text-brand-300">{brlDeCentavos(exemplo)}</b></p>
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button onClick={salvar} disabled={salvando || fatorNum <= 0} className="btn-primary flex items-center gap-2">
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar regra
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function CartasDaLoja() {
  const comCatalogo = useFuncionalidade('preco-referencia-cartas') === true
  // Referência em reais pelo dólar de agora (v1.95.0): o robô guarda o preço em dólar do dia; a tela converte ao vivo
  const cotacao = useCotacaoCartas(comCatalogo)
  const refAoVivo = (c: Product) => emCentavos(c.cartaRefUsd, cotacao) ?? c.cartaRefCentavos ?? null
  const [variacoes, setVariacoes] = useState<Map<string, VariacaoPreco>>(new Map())
  const [regraAberta, setRegraAberta] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  const [cartas, setCartas]       = useState<Product[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca]         = useState('')
  const [jogo, setJogo]           = useState('')
  const [nova, setNova]           = useState(false)
  const [editando, setEditando]   = useState<Product | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      const { data } = await productApi.listAdmin()
      setCartas(data.filter(p => p.cartaAvulsa).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    } catch { toast.error('Não deu pra carregar as cartas') }
    finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [])

  async function carregarVariacoes() {
    try {
      const { data } = await catalogoCartasApi.variacoes()
      setVariacoes(new Map(data.map(v => [v.productId, v])))
    } catch { /* sem variação: a lista continua */ }
  }
  useEffect(() => { if (comCatalogo) carregarVariacoes() }, [comCatalogo])

  async function atualizarPrecos() {
    setAtualizando(true)
    try {
      const { data } = await catalogoCartasApi.atualizar()
      if (data.rodou) toast.success(data.mensagem); else toast.error(data.mensagem)
      await Promise.all([carregar(), carregarVariacoes()])
    } catch { toast.error('Não deu pra atualizar agora') }
    finally { setAtualizando(false) }
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return cartas.filter(c =>
      (!jogo || c.cartaJogo === jogo) &&
      (!t || c.name.toLowerCase().includes(t) || (c.cartaColecao ?? '').toLowerCase().includes(t)
          || (c.cartaNumero ?? '').toLowerCase().includes(t)))
  }, [cartas, busca, jogo])

  // Coleções já usadas, por jogo — o cadastro sugere pra não nascer "151" e "Coleção 151" separadas no Mercado
  const colecoes = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const c of cartas) if (c.cartaJogo && c.cartaColecao) (m[c.cartaJogo] ??= new Set()).add(c.cartaColecao)
    return Object.fromEntries(Object.entries(m).map(([j, s]) => [j, [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))]))
  }, [cartas])

  const aVenda    = cartas.filter(c => c.stockQuantity > 0)
  const copias    = aVenda.reduce((s, c) => s + c.stockQuantity, 0)
  const esgotadas = cartas.length - aVenda.length

  function salvo(p: Product) {
    // Ligada ao catálogo: recarrega pra trazer a referência que o salvar acabou de gravar
    if (comCatalogo && p.cartaTcgProdutoId) { carregar(); carregarVariacoes() }
    setCartas(prev => {
      const i = prev.findIndex(c => c.id === p.id)
      if (i >= 0) { const n = [...prev]; n[i] = p; return n }
      return [p, ...prev]
    })
    setNova(false); setEditando(null)
  }

  async function tirar(p: Product) {
    if (!confirm(`Tirar "${p.name}" do Mercado? A carta sai da loja (dá pra cadastrar de novo depois).`)) return
    try {
      await productApi.deactivate(p.id)
      setCartas(prev => prev.filter(c => c.id !== p.id))
      toast.success('Carta tirada do Mercado')
    } catch { toast.error('Não deu pra tirar') }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Cartas avulsas"
        subtitle="O cliente reserva pelo Mercado de Cartas e paga no Pix, como qualquer produto"
        actions={
          <div className="flex flex-wrap gap-2 justify-end">
            {comCatalogo && (
              <>
                <button onClick={() => setRegraAberta(true)} className="btn-secondary flex items-center gap-2" title="Como a sugestão de preço é calculada">
                  <SlidersHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Regra de preço</span>
                </button>
                <button onClick={atualizarPrecos} disabled={atualizando} className="btn-secondary flex items-center gap-2"
                  title="Lê o preço de mercado de hoje das cartas ligadas ao catálogo (o robô faz isso sozinho todo dia às 17h30)">
                  <RefreshCw className={clsx('w-4 h-4', atualizando && 'animate-spin')} /> <span className="hidden sm:inline">Atualizar preços</span>
                </button>
              </>
            )}
            <button onClick={() => setNova(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nova carta
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { rotulo: 'À venda',  valor: aVenda.length, cor: 'txt-ok' },
          { rotulo: 'Cópias',   valor: copias,        cor: 'text-brand-300' },
          { rotulo: 'Esgotadas', valor: esgotadas,    cor: 'text-gray-400' },
        ].map(s => (
          <div key={s.rotulo} className="card text-center">
            <p className="text-xs text-gray-400 mb-1">{s.rotulo}</p>
            <p className={clsx('text-2xl font-black', s.cor)}>{s.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input className="input pl-9" placeholder="Buscar por nome, coleção ou número..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="input sm:w-48" value={jogo} onChange={e => setJogo(e.target.value)}>
          <option value="">Todos os jogos</option>
          {JOGOS_DE_CARTA.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : cartas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="mb-1 font-semibold text-white">Nenhuma carta cadastrada ainda</p>
          <p className="mb-5 text-sm">Cadastre as singles da pastinha — cada uma aparece no Mercado de Cartas pra reservar.</p>
          <button onClick={() => setNova(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Plus className="w-4 h-4" /> Cadastrar a primeira carta
          </button>
        </div>
      ) : visiveis.length === 0 ? (
        <p className="text-center py-12 text-gray-400 text-sm">Nenhuma carta com essa busca.</p>
      ) : (
        <Table>
          <Table.Head>
            <tr>
              <th className="text-left p-3 sm:p-4 text-gray-400 font-semibold">Carta</th>
              <th className="hidden sm:table-cell text-left p-4 text-gray-400 font-semibold">Preço</th>
              {comCatalogo && <th className="hidden md:table-cell text-left p-4 text-gray-400 font-semibold">Referência</th>}
              <th className="hidden sm:table-cell text-left p-4 text-gray-400 font-semibold">Qtd.</th>
              <th className="text-right p-3 sm:p-4 text-gray-400 font-semibold">Ações</th>
            </tr>
          </Table.Head>
          <Table.Body>
            {visiveis.map(c => (
              <tr key={c.id} className="hover:bg-surface-500/30 transition-colors">
                <td className="p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    {c.imageUrl
                      ? <img src={c.imageUrl} alt="" className="w-9 h-12 rounded-md object-contain bg-surface-700 shrink-0" />
                      : <div className="w-9 h-12 rounded-md bg-surface-700 flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-gray-500" /></div>}
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate max-w-[150px] sm:max-w-[240px]">{c.name}</p>
                      <p className="text-xs text-brand-400">{resumoCarta(c)}</p>
                      {(c.cartaColecao || c.cartaNumero || c.cartaRaridade) && (
                        <p className="text-xs text-gray-400 truncate max-w-[150px] sm:max-w-[240px]">
                          {[c.cartaColecao, c.cartaNumero, c.cartaRaridade].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {/* Celular: preço e quantidade aqui (as colunas só aparecem do tablet pra cima) */}
                      <p className="sm:hidden text-xs mt-0.5">
                        <span className="font-bold text-brand-300">{brlDeCentavos(c.priceInCents)}</span>
                        <span className="text-gray-400"> · {c.stockQuantity > 0 ? `${c.stockQuantity} ${c.stockQuantity === 1 ? 'cópia' : 'cópias'}` : 'esgotada'}</span>
                      </p>
                      {comCatalogo && refAoVivo(c) != null && (
                        <p className="md:hidden text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          ref. {brlDeCentavos(refAoVivo(c))}
                          <Variacao pct={variacao(refAoVivo(c), variacoes.get(c.id)?.ha7Dias)} rotulo="7d" />
                          {c.cartaPrecoAutomatico && <span className="text-[10px] font-black text-brand-300">AUTO</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="hidden sm:table-cell p-4 font-bold text-brand-300 whitespace-nowrap">{brlDeCentavos(c.priceInCents)}</td>
                {comCatalogo && (
                  <td className="hidden md:table-cell p-4 whitespace-nowrap">
                    {refAoVivo(c) != null ? (
                      <div title={`${usd(c.cartaRefUsd)} × ${rotuloCotacao(cotacao) || 'dólar do dia'}${c.cartaRefEm ? ` · preço lido em ${new Date(c.cartaRefEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`}>
                        <p className="font-semibold text-white flex items-center gap-1.5">
                          {brlDeCentavos(refAoVivo(c))}
                          {c.cartaPrecoAutomatico && <span className="text-[10px] font-black px-1.5 rounded bg-brand-500/20 text-brand-300" title="O preço de venda acompanha a referência todo dia">AUTO</span>}
                        </p>
                        <div className="flex gap-2">
                          <Variacao pct={variacao(refAoVivo(c), variacoes.get(c.id)?.ha7Dias)} rotulo="7d" />
                          <Variacao pct={variacao(refAoVivo(c), variacoes.get(c.id)?.ha30Dias)} rotulo="30d" />
                        </div>
                        <p className="text-[10px] text-gray-500">{usd(c.cartaRefUsd)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">{c.cartaTcgProdutoId ? 'sem preço hoje' : 'à mão'}</span>
                    )}
                  </td>
                )}
                <td className="hidden sm:table-cell p-4">
                  {c.stockQuantity > 0
                    ? <span className="font-semibold text-white">{c.stockQuantity}</span>
                    : <span className="text-xs font-semibold text-gray-400">Esgotada</span>}
                </td>
                <td className="p-3 sm:p-4">
                  <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                    <button onClick={() => setEditando(c)} title="Editar carta" aria-label="Editar carta"
                      className="p-1.5 rounded-lg bg-surface-700 hover:bg-brand-500/20 text-gray-400 hover:text-brand-400 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <Link href={`/produtos/${c.id}`} target="_blank" title="Ver na loja" aria-label="Ver na loja"
                      className="p-1.5 rounded-lg bg-surface-700 hover:bg-brand-500/20 text-gray-400 hover:text-brand-400 transition-colors">
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button onClick={() => tirar(c)} title="Tirar do Mercado" aria-label="Tirar do Mercado"
                      className="p-1.5 rounded-lg bg-surface-700 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table.Body>
        </Table>
      )}

      {nova && <CartaModal colecoes={colecoes} comCatalogo={comCatalogo} onClose={() => setNova(false)} onSalvo={salvo} />}
      {editando && <CartaModal inicial={editando} colecoes={colecoes} comCatalogo={comCatalogo} onClose={() => setEditando(null)} onSalvo={salvo} />}
      {regraAberta && <RegraModal onClose={() => setRegraAberta(false)} />}
    </div>
  )
}
