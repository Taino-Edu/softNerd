'use client'
// Cadastro da carta avulsa em telas próprias (v1.102.0, chave "cadastro-carta-telas") — no estilo das comandas do
// Painel Geral: cabeçalho com as etapas, conteúdo na largura da página e a barra de ações presa no pé do celular.
// A janela única de antes (CartaModal em CartasDaLoja.tsx) não cabia na tela: a lista de coleções, o cabeçalho e o
// formulário estouravam a altura e não dava pra escolher a carta nem fechar (print do Taino, 25/11).
//   1) /admin/marketplace/nova      → escolher a carta no catálogo (jogo → coleção → carta) ou seguir à mão.
//   2) /admin/marketplace/cadastro  → o cadastro completo. A carta escolhida vem no endereço (?jogo=&nome=&tcg=...),
//      então recarregar a página não perde a escolha. Editar abre direto aqui (?id=).
// O salvar é o mesmo da janela: mesmo corpo do produto, mesma atualização da referência quando ligada ao catálogo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  productApi, uploadApi, catalogoCartasApi, Product, CartaCatalogo, ColecaoCatalogo, ReferenciaAgora,
} from '@/lib/api'
import { brlDeCentavos } from '@/lib/format'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { useMarcarRodapeFixo } from '@/lib/rodapeFixo'
import { usd, rotuloCotacao } from '@/lib/cotacaoCartas'
import { Switch } from '@/components/ui/Switch'
import CatalogoCartaPicker from '@/components/admin/CatalogoCartaPicker'
import { CabecalhoPdv, RODAPE_PDV } from '@/components/admin/PdvProdutos'
import {
  JOGOS_DE_CARTA, CONDICOES_DE_CARTA, IDIOMAS_DE_CARTA, CATEGORIA_CARTA_AVULSA, linkDaLiga, raridadesDoJogo,
} from '@/lib/cartasAvulsas'
import { Loader2, ImagePlus, ExternalLink, Layers, Link2, ArrowRight, ChevronLeft, BookOpen, PenLine } from 'lucide-react'

const LISTA = '/admin/marketplace'
const ETAPAS = ['Escolher a carta', 'Cadastro']
/** Mesmo respiro da tela da comanda no Painel Geral; embaixo, folga pra barra presa no pé do celular. */
const MOLDURA = 'min-w-0 py-3 pl-3 pr-8 sm:p-6 max-md:pb-28'

type LigacaoCatalogo = { produtoId: number; categoria: number; grupo: number }

/** O que a tela "Escolher a carta" passa pro cadastro (tudo opcional: "Cadastrar à mão" manda só o jogo). */
export type CartaEscolhida = {
  jogo?: string; nome?: string; colecao?: string; numero?: string | null; raridade?: string | null
  foto?: string | null; tcg?: LigacaoCatalogo | null; variante?: string | null
}

export function enderecoCadastro(c: CartaEscolhida = {}) {
  const q = new URLSearchParams()
  const por = (k: string, v: string | null | undefined) => { if (v) q.set(k, v) }
  por('jogo', c.jogo); por('nome', c.nome); por('colecao', c.colecao); por('numero', c.numero)
  por('raridade', c.raridade); por('foto', c.foto); por('variante', c.variante)
  if (c.tcg) q.set('tcg', `${c.tcg.produtoId}.${c.tcg.categoria}.${c.tcg.grupo}`)
  const s = q.toString()
  return `${LISTA}/cadastro${s ? `?${s}` : ''}`
}

function lerEscolhida(p: URLSearchParams): CartaEscolhida {
  const [produtoId, categoria, grupo] = (p.get('tcg') ?? '').split('.').map(Number)
  return {
    jogo: p.get('jogo') ?? undefined, nome: p.get('nome') ?? undefined, colecao: p.get('colecao') ?? undefined,
    numero: p.get('numero'), raridade: p.get('raridade'), foto: p.get('foto'), variante: p.get('variante'),
    tcg: produtoId > 0 && categoria > 0 && grupo > 0 ? { produtoId, categoria, grupo } : null,
  }
}

function centavosDe(texto: string) {
  return Math.round(parseFloat(texto.replace(/\./g, '').replace(',', '.') || '0') * 100)
}

/** Jogo em botões (cabem na largura da tela, um toque troca o catálogo). */
function EscolherJogo({ jogo, mudar }: { jogo: string; mudar: (j: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Jogo" className="flex flex-wrap gap-2">
      {JOGOS_DE_CARTA.map(j => (
        <button key={j} type="button" role="radio" aria-checked={j === jogo} onClick={() => mudar(j)}
          className={clsx('min-h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:min-h-10 sm:px-3 sm:text-sm',
            j === jogo ? 'border-brand-500 bg-brand-500/20 text-white' : 'border-surface-500 text-gray-400 hover:bg-surface-700')}>
          {j}
        </button>
      ))}
    </div>
  )
}

// ── Etapa 1: escolher a carta ─────────────────────────────────────────────────
export function EscolherCartaTela() {
  const router = useRouter()
  const params = useSearchParams()
  const titulo = useRef<HTMLHeadingElement>(null)
  const comCatalogo = useFuncionalidade('preco-referencia-cartas')
  const [jogo, setJogo] = useState(params.get('jogo') || JOGOS_DE_CARTA[0])
  useMarcarRodapeFixo()

  // Sem catálogo não há o que escolher: vai direto pro cadastro
  useEffect(() => { if (comCatalogo === false) router.replace(enderecoCadastro({ jogo })) }, [comCatalogo]) // eslint-disable-line react-hooks/exhaustive-deps

  function escolher(c: CartaCatalogo, col: ColecaoCatalogo) {
    router.push(enderecoCadastro({
      jogo, nome: c.nome, colecao: col.nome, numero: c.numero, raridade: c.raridade,
      foto: c.imagemGrande ?? c.imagem,
      tcg: { produtoId: c.produtoId, categoria: c.categoria, grupo: c.grupo },
      variante: c.precos.find(p => p.referencia != null)?.variante ?? null,
    }))
  }

  return (
    <div className={MOLDURA}>
      <section aria-label="Escolher a carta" className="min-w-0 rounded-xl border bg-[var(--bg-card)]">
        <CabecalhoPdv titulo="Nova carta" tituloRef={titulo} sair={() => router.push(LISTA)} rotuloSair="Voltar às cartas"
          subtitulo="Escolha a carta no catálogo: nome, coleção, número, raridade e foto já vêm preenchidos"
          icone={<Layers aria-hidden="true" className="h-5 w-5 text-brand-400" />} etapas={ETAPAS} etapa={1} />
        <div className="min-w-0 space-y-4 p-3 sm:p-5">
          <EscolherJogo jogo={jogo} mudar={setJogo} />
          {comCatalogo === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
          ) : jogo === 'Outro' ? (
            <p className="rounded-xl border border-surface-500 p-4 text-sm text-gray-300">
              Este jogo não está no catálogo. Use <b className="text-white">Cadastrar à mão</b> para preencher a carta.
            </p>
          ) : (
            <CatalogoCartaPicker key={jogo} jogo={jogo} onEscolher={escolher} emTela />
          )}
        </div>
        <div className={RODAPE_PDV}>
          <p className="min-w-0 flex-1 text-xs text-gray-400 max-sm:hidden">
            Não achou no catálogo (carta nova, deck pronto, kit de evento)? Cadastre à mão.
          </p>
          <button type="button" onClick={() => router.push(enderecoCadastro({ jogo }))}
            className="btn-secondary min-h-11 flex-1 sm:flex-none justify-center text-sm">
            <PenLine aria-hidden="true" className="h-4 w-4" /> Cadastrar à mão <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  )
}

// ── Etapa 2: o cadastro completo (também é a tela de editar) ──────────────────
export function CadastroCartaTela() {
  const params = useSearchParams()
  const router = useRouter()
  const id = params.get('id')
  const comCatalogo = useFuncionalidade('preco-referencia-cartas') === true
  const [cartas, setCartas] = useState<Product[] | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    productApi.listAdmin()
      .then(({ data }) => setCartas(data.filter(p => p.cartaAvulsa)))
      .catch(() => { setFalhou(true); setCartas([]) })
  }, [])

  // Coleções já usadas, por jogo — sugeridas pra não nascer "151" e "Coleção 151" separadas no Mercado
  const colecoes = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const c of cartas ?? []) if (c.cartaJogo && c.cartaColecao) (m[c.cartaJogo] ??= new Set()).add(c.cartaColecao)
    return Object.fromEntries(Object.entries(m).map(([j, s]) => [j, [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))]))
  }, [cartas])

  if (id) {
    // Editar precisa da carta carregada antes de montar o formulário (os campos começam com os valores dela)
    const inicial = cartas?.find(c => c.id === id)
    if (!cartas) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
    if (!inicial) return (
      <div className={MOLDURA}>
        <div className="card text-center py-12 space-y-4">
          <p className="text-white font-semibold">{falhou ? 'Não deu pra carregar as cartas.' : 'Esta carta não está mais no Mercado.'}</p>
          <button onClick={() => router.push(LISTA)} className="btn-secondary mx-auto"><ChevronLeft className="w-4 h-4" /> Voltar às cartas</button>
        </div>
      </div>
    )
    return <FormularioCarta key={id} inicial={inicial} colecoes={colecoes} comCatalogo={comCatalogo} />
  }
  return <FormularioCarta key={params.toString()} escolhida={lerEscolhida(params)} colecoes={colecoes} comCatalogo={comCatalogo} />
}

type Form = {
  nome: string; jogo: string; condicao: string; idioma: string; colecao: string
  numero: string; raridade: string; preco: string; quantidade: string; descricao: string
}

function FormularioCarta({ inicial, escolhida, colecoes, comCatalogo }: {
  inicial?: Product
  escolhida?: CartaEscolhida
  colecoes: Record<string, string[]>
  comCatalogo: boolean
}) {
  const router = useRouter()
  const titulo = useRef<HTMLHeadingElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  useMarcarRodapeFixo()

  const [form, setForm] = useState<Form>({
    nome:       inicial?.name ?? escolhida?.nome ?? '',
    jogo:       inicial?.cartaJogo ?? escolhida?.jogo ?? JOGOS_DE_CARTA[0],
    condicao:   inicial?.cartaCondicao ?? 'NM',
    idioma:     inicial?.cartaIdioma ?? 'PT',
    colecao:    inicial?.cartaColecao ?? escolhida?.colecao ?? '',
    numero:     inicial?.cartaNumero ?? escolhida?.numero ?? '',
    raridade:   inicial?.cartaRaridade ?? escolhida?.raridade ?? '',
    preco:      inicial ? (inicial.priceInCents / 100).toFixed(2).replace('.', ',') : '',
    quantidade: String(inicial?.stockQuantity ?? 1),
    descricao:  inicial?.description ?? '',
  })
  const [foto, setFoto]         = useState<string | null>(inicial?.imageUrl ?? escolhida?.foto ?? null)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const liga = linkDaLiga(form.jogo, form.nome)

  // Ligação com o catálogo (preço de referência)
  const [tcg, setTcg] = useState<LigacaoCatalogo | null>(
    inicial
      ? (inicial.cartaTcgProdutoId && inicial.cartaTcgCategoria && inicial.cartaTcgGrupo
          ? { produtoId: inicial.cartaTcgProdutoId, categoria: inicial.cartaTcgCategoria, grupo: inicial.cartaTcgGrupo } : null)
      : escolhida?.tcg ?? null)
  const [variante, setVariante]     = useState<string | null>(inicial ? inicial.cartaTcgVariante ?? null : escolhida?.variante ?? null)
  const [automatico, setAutomatico] = useState(inicial?.cartaPrecoAutomatico ?? false)
  const [ref, setRef]               = useState<ReferenciaAgora | null>(null)
  const [carregandoRef, setCarregandoRef] = useState(false)
  const [buscando, setBuscando]     = useState(false)

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
    setBuscando(false)
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
      toast.success(inicial ? 'Carta atualizada' : 'Carta no Mercado!')
      router.push(LISTA)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Não deu pra salvar')
      setSalvando(false)
    }
  }

  const resumo = [form.colecao, form.numero].filter(Boolean).join(' · ')

  return (
    <div className={MOLDURA}>
      <section aria-label="Cadastro da carta" className="min-w-0 rounded-xl border bg-[var(--bg-card)]">
        <CabecalhoPdv titulo={inicial ? 'Editar carta' : 'Nova carta'} tituloRef={titulo} sair={() => router.push(LISTA)}
          rotuloSair="Voltar às cartas" desabilitado={salvando}
          subtitulo={form.nome.trim() ? `${form.nome.trim()}${resumo ? ` · ${resumo}` : ''}` : 'Complete o cadastro da carta'}
          icone={<Layers aria-hidden="true" className="h-5 w-5 text-brand-400" />}
          etapas={inicial ? [] : ETAPAS} etapa={inicial ? 0 : 2} />

        <fieldset disabled={salvando} className="grid min-w-0 items-start gap-5 p-3 sm:p-5 md:grid-cols-[11rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-6">
          {/* Coluna da foto: no celular fica ao lado da ligação com o catálogo */}
          <div className="flex min-w-0 items-start gap-4 md:flex-col">
            <div className="w-28 shrink-0 sm:w-32 md:w-full">
              <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={enviarFoto} />
              <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando}
                aria-label={foto ? 'Trocar a foto da carta' : 'Enviar foto da carta'}
                className={clsx('w-full aspect-[63/88] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 overflow-hidden text-gray-400',
                  foto ? 'border-brand-500/40' : 'border-surface-500 hover:border-brand-500/60')}>
                {enviando ? <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                  : foto ? <img src={foto} alt="" className="w-full h-full object-contain" />
                  : <><ImagePlus className="w-7 h-7" /><span className="text-xs font-medium text-center px-1 leading-tight">Foto da carta</span></>}
              </button>
              {foto && <button type="button" onClick={() => setFoto(null)} className="mt-1 w-full text-xs text-gray-400 hover:text-red-400">Tirar foto</button>}
            </div>

            <div className="min-w-0 flex-1 space-y-3 md:w-full">
              {comCatalogo && (tcg ? (
                <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs space-y-1">
                  <p className="flex items-start gap-1.5 text-brand-300">
                    <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Ligada ao catálogo{form.numero ? ` · ${form.numero}` : ''} — o preço de referência atualiza todo dia</span>
                  </p>
                  <button type="button" onClick={desligarCatalogo} className="text-gray-400 hover:text-red-400">Desligar do catálogo</button>
                </div>
              ) : form.jogo !== 'Outro' && !buscando && (
                <button type="button" onClick={() => setBuscando(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-brand-500/50 px-2 py-2.5 text-sm font-semibold text-brand-300 hover:bg-brand-500/10">
                  <BookOpen className="w-4 h-4 shrink-0" /> Buscar no catálogo
                </button>
              ))}
              <p className="text-xs text-gray-400 leading-snug">
                Uma linha por carta. Cópias iguais (mesmo estado e idioma) entram como quantidade.
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            {buscando && !tcg && (
              <CatalogoCartaPicker jogo={form.jogo} onEscolher={escolherDoCatalogo} abertoDeInicio />
            )}

            <div>
              <label className="label" htmlFor="carta-nome">Nome da carta *</label>
              <input id="carta-nome" className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Charizard ex" />
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div>
                <label className="label" htmlFor="carta-jogo">Jogo</label>
                <select id="carta-jogo" className="input" value={form.jogo} onChange={e => set('jogo', e.target.value)}>
                  {JOGOS_DE_CARTA.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="carta-idioma">Idioma</label>
                <select id="carta-idioma" className="input" value={form.idioma} onChange={e => set('idioma', e.target.value)}>
                  {IDIOMAS_DE_CARTA.map(i => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="carta-estado">Estado</label>
                <select id="carta-estado" className="input" value={form.condicao} onChange={e => set('condicao', e.target.value)}>
                  {CONDICOES_DE_CARTA.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="carta-qtd">Quantidade</label>
                <input id="carta-qtd" className="input" type="number" min={0} inputMode="numeric" value={form.quantidade}
                  onChange={e => set('quantidade', e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>

            {/* Coleção, número e raridade: o Mercado separa as cartas por coleção e filtra/ordena pelo resto */}
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3 xl:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1fr)]">
              <div className="min-w-0">
                <label className="label" htmlFor="carta-colecao">Coleção</label>
                <input id="carta-colecao" className="input" list="colecoes-da-carta" value={form.colecao} onChange={e => set('colecao', e.target.value)}
                  placeholder="Ex: Escarlate e Violeta 151" />
                <datalist id="colecoes-da-carta">
                  {(colecoes[form.jogo] ?? []).map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="carta-numero">Número</label>
                <input id="carta-numero" className="input" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="199/165" />
              </div>
              <div className="col-span-2 min-w-0 xl:col-span-1">
                <label className="label" htmlFor="carta-raridade">Raridade</label>
                <input id="carta-raridade" className="input" list="raridades-da-carta" value={form.raridade} onChange={e => set('raridade', e.target.value)}
                  placeholder="Escolha ou escreva (ex: Rara Dupla)" />
                <datalist id="raridades-da-carta">
                  {raridadesDoJogo(form.jogo).map(r => <option key={r} value={r} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="carta-preco">Preço (R$) *</label>
              <div className="flex gap-2 sm:max-w-md">
                <input id="carta-preco" className="input flex-1 min-w-0" type="text" inputMode="decimal" placeholder="0,00" value={form.preco}
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
              <p className="text-xs text-gray-400 mt-1.5">
                {liga ? 'Abre a busca desta carta na Liga numa aba nova — confira o menor preço e digite aqui.'
                  : form.nome.trim() ? 'Este jogo não tem Liga — pesquise o preço por fora.'
                  : 'Digite o nome pra conferir o preço na Liga.'}
              </p>
              {comCatalogo && tcg && (
                <div className="mt-3 rounded-xl border border-surface-500 p-3 space-y-2 text-xs sm:max-w-xl">
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
                              {p.variante} · {p.referencia == null ? '—' : ref.cotacaoDegradada ? usd(p.referencia) : brlDeCentavos(Math.round(p.referencia * ref.cotacao * 100))}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-gray-300">Referência (mercado lá fora)</span>
                        <b className="text-base font-black text-white">{ref.referenciaCentavos != null ? brlDeCentavos(ref.referenciaCentavos) : '—'}</b>
                      </div>
                      <p className="text-gray-400">
                        {usd(ref.mercadoUsd)}{!ref.cotacaoDegradada && <> × {rotuloCotacao({ valor: ref.cotacao, obtidaEm: ref.cotacaoEm ?? null, fonte: ref.cotacaoFonte ?? null })}</>}
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
            </div>

            <div>
              <label className="label" htmlFor="carta-obs">Observação (opcional)</label>
              <textarea id="carta-obs" className="input h-20 resize-none" value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Ex: holo, primeira edição, pequena marca no verso" />
            </div>
          </div>
        </fieldset>

        <div className={RODAPE_PDV}>
          {!inicial && (
            <button type="button" onClick={() => router.push(`${LISTA}/nova?jogo=${encodeURIComponent(form.jogo)}`)} disabled={salvando}
              aria-label="Voltar para escolher a carta" className="btn-secondary min-h-11 px-3 text-sm disabled:opacity-50">
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> <span className="max-sm:hidden">Escolher outra carta</span><span className="sm:hidden">Voltar</span>
            </button>
          )}
          <div className="hidden md:block md:flex-1" />
          <button type="button" onClick={() => router.push(LISTA)} disabled={salvando} className="btn-secondary min-h-11 text-sm max-md:hidden">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando || enviando}
            className="btn-primary min-h-11 flex-1 md:flex-none justify-center text-sm disabled:opacity-50">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {inicial ? 'Salvar' : 'Pôr no Mercado'}
          </button>
        </div>
      </section>
    </div>
  )
}
