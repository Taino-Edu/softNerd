'use client'
// Mercado de Cartas com reserva (v1.91.0, chave "cartas-como-produto") — pedido do Maikon de 19/11: "ele clica na
// carta, ele consegue fazer a reserva dela, pra vir na loja pegar, como se ela fosse um produto". Cada carta é um
// produto marcado como carta avulsa: o "Adicionar" põe na sacola e a reserva/Pix seguem o caminho de qualquer
// pedido do site. Só a loja vende (sem mercado entre jogadores).
//
// Desenho do catálogo de cartas que o Paulinho fez e o Maikon mandou em 19/11 ("tipo assim"): abas por jogo e por
// coleção, cartas agrupadas por coleção, número · raridade · idioma · estado em cada uma, filtros de raridade e
// idioma, ordem por numeração/preço/raridade, galeria ou lista e "Ver na Liga" embaixo da carta. Do jeito dele,
// mas no fundo branco do site e sem o "valor somado de todas as cartas" (o Maikon pediu pra tirar).
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  Search, Loader2, Layers, ShoppingBag, Package, ChevronDown, LayoutGrid, List, Check, Plus, ExternalLink,
} from 'lucide-react'
import { productApi, categoryApi, Product, ProductCategory } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { brl } from '@/lib/format'
import { fotoLeve } from '@/lib/fotoLeve'
import { voarParaSacola } from '@/lib/voarParaSacola'
import { useSiteConfig } from '@/lib/useSiteConfig'
import { calcPrecoVitrine, resolvePixPercent } from '@/lib/precoVitrine'
import {
  JOGOS_DE_CARTA, IDIOMAS_DE_CARTA, linkDaLiga, pesoDaRaridade, compararNumero,
} from '@/lib/cartasAvulsas'
import CabecalhoCliente from '@/components/cliente/CabecalhoCliente'
import AvisoSacola, { usePorNaSacola } from '@/components/loja/AvisoSacola'
import BandeiraIdioma from '@/components/loja/BandeiraIdioma'

/** Paleta clara da loja (cores no style: o tema claro do site remapeia classes text-white/surface). */
const L = {
  fundo: '#F5F8FA', card: '#FFFFFF', borda: 'rgba(12,61,90,0.12)', texto: '#0F1B33', suave: '#5B6B84',
  azul: '#1E4FD6', foto: '#EEF2F8', pix: '#00806D', amarelo: '#FFE45E', amareloTexto: '#3D2E00',
}

const SEM_COLECAO = 'Outras cartas'

type Ordem = 'numero' | 'menor' | 'maior' | 'raridade' | 'novas'
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'numero',   rotulo: 'Numeração' },
  { valor: 'menor',    rotulo: 'Menor preço' },
  { valor: 'maior',    rotulo: 'Maior preço' },
  { valor: 'raridade', rotulo: 'Raridade' },
  { valor: 'novas',    rotulo: 'Chegaram agora' },
]

/** "Pokémon" → "pokemon", "Escarlate e Violeta 151" → "escarlate-e-violeta-151" (endereço da aba, como no catálogo). */
function slug(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const precoDe = (p: Product) => (p.isOnPromo && p.discountPriceInReais != null ? p.discountPriceInReais : p.priceInReais)
const colecaoDe = (p: Product) => p.cartaColecao?.trim() || SEM_COLECAO

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className="shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-bold whitespace-nowrap transition-colors"
      style={ativo
        ? { backgroundColor: L.texto, borderColor: L.texto, color: '#FFFFFF' }
        : { backgroundColor: L.card, borderColor: L.borda, color: L.texto }}>
      {children}
    </button>
  )
}

/** Raridade, idioma e estado — os selinhos embaixo do nome (no catálogo: "Rara Dupla 🇧🇷 NM"). */
function Selinhos({ p }: { p: Product }) {
  const idioma = p.cartaIdioma ? IDIOMAS_DE_CARTA.find(i => i.valor === p.cartaIdioma)?.rotulo ?? p.cartaIdioma : null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.cartaNumero && <span className="text-[11px] font-semibold tabular-nums" style={{ color: L.suave }}>{p.cartaNumero}</span>}
      {p.cartaRaridade && (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: L.foto, color: L.texto }}>{p.cartaRaridade}</span>
      )}
      {p.cartaIdioma && <span style={{ color: L.suave }}><BandeiraIdioma idioma={p.cartaIdioma} titulo={idioma ?? undefined} /></span>}
      {p.cartaCondicao && (
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md border" style={{ borderColor: L.pix, color: L.pix }}>{p.cartaCondicao}</span>
      )}
    </div>
  )
}

type PrecoCarta = { preco: number; antigo: number | null; pix: number | null }

/** largo = botão da galeria; sem largo (lista) vira só o "+" no celular, pra caber preço e Liga na linha. */
function BotaoSacola({ onAdd, foto, largo }: { onAdd: () => void; foto: React.RefObject<HTMLImageElement | null>; largo?: boolean }) {
  const [posto, setPosto] = useState(false)
  return (
    <button type="button"
      onClick={() => { onAdd(); voarParaSacola(foto.current); setPosto(true); setTimeout(() => setPosto(false), 1600) }}
      className={clsx('inline-flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-black transition-all active:scale-95',
        largo ? 'w-full py-2' : 'p-2.5 sm:px-3 sm:py-2')}
      aria-label={posto ? 'Na sacola' : 'Adicionar à sacola'}
      style={posto ? { backgroundColor: L.pix, color: '#FFFFFF' } : { backgroundColor: L.azul, color: '#FFFFFF' }}>
      {posto
        ? <><Check className="w-3.5 h-3.5" /><span className={clsx(!largo && 'hidden sm:inline')}>Na sacola</span></>
        : <><Plus className="w-3.5 h-3.5" /><span className={clsx(!largo && 'hidden sm:inline')}>Adicionar</span></>}
    </button>
  )
}

function LinkLiga({ p }: { p: Product }) {
  const liga = linkDaLiga(p.cartaJogo, p.name)
  if (!liga) return null
  return (
    <a href={liga} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 whitespace-nowrap"
      style={{ color: L.azul }} title="Abre a busca desta carta na Liga numa aba nova">
      Ver na Liga <ExternalLink className="w-3 h-3" />
    </a>
  )
}

function CartaGaleria({ p, v, onAdd }: { p: Product; v: PrecoCarta; onAdd: () => void }) {
  const foto = useRef<HTMLImageElement>(null)
  return (
    <div className="flex flex-col rounded-2xl border overflow-hidden" style={{ backgroundColor: L.card, borderColor: L.borda }}>
      <Link href={`/produtos/${p.id}`} className="relative block p-2.5 sm:p-3" style={{ backgroundColor: L.foto }}>
        <div className="aspect-[63/88] flex items-center justify-center">
          {p.imageUrl
            ? <img ref={foto} src={fotoLeve(p.imageUrl, 480)} alt={p.name} loading="lazy" decoding="async"
                className="w-full h-full object-contain rounded-lg drop-shadow-md" />
            : <Layers className="w-10 h-10" style={{ color: L.suave, opacity: 0.35 }} />}
        </div>
        <span className="absolute top-2 right-2 text-[11px] font-black px-1.5 py-0.5 rounded-md shadow-sm"
          style={{ backgroundColor: L.amarelo, color: L.amareloTexto }} title={`${p.stockQuantity} ${p.stockQuantity === 1 ? 'cópia' : 'cópias'} na loja`}>
          ×{p.stockQuantity}
        </span>
      </Link>
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        <Link href={`/produtos/${p.id}`} className="text-sm font-black leading-tight line-clamp-2" style={{ color: L.texto }}>{p.name}</Link>
        <Selinhos p={p} />
        <div className="mt-auto pt-1.5">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[15px] font-black px-2 py-0.5 rounded-md" style={{ backgroundColor: L.amarelo, color: L.amareloTexto }}>
              {brl(v.preco)}
            </span>
            {v.antigo != null && <span className="text-xs line-through" style={{ color: L.suave }}>{brl(v.antigo)}</span>}
          </div>
          {v.pix != null && <p className="text-xs font-bold mt-1" style={{ color: L.pix }}>{brl(v.pix)} no Pix</p>}
        </div>
        <BotaoSacola onAdd={onAdd} foto={foto} largo />
        <div className="text-center"><LinkLiga p={p} /></div>
      </div>
    </div>
  )
}

function CartaLinha({ p, v, onAdd }: { p: Product; v: PrecoCarta; onAdd: () => void }) {
  const foto = useRef<HTMLImageElement>(null)
  return (
    <div className="flex items-center gap-3 p-2.5 sm:p-3">
      <Link href={`/produtos/${p.id}`} className="shrink-0 w-11 sm:w-12 aspect-[63/88] rounded-md flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: L.foto }}>
        {p.imageUrl
          ? <img ref={foto} src={fotoLeve(p.imageUrl, 160)} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" />
          : <Layers className="w-4 h-4" style={{ color: L.suave, opacity: 0.4 }} />}
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/produtos/${p.id}`} className="block text-sm font-black truncate" style={{ color: L.texto }}>{p.name}</Link>
        <div className="mt-1"><Selinhos p={p} /></div>
        <div className="mt-1 flex items-center gap-3 sm:hidden">
          <span className="text-sm font-black whitespace-nowrap" style={{ color: L.texto }}>{brl(v.preco)}</span>
          <span className="text-xs" style={{ color: L.suave }}>×{p.stockQuantity}</span>
          <LinkLiga p={p} />
        </div>
      </div>
      <div className="hidden sm:block text-right shrink-0 w-32">
        <p className="text-sm font-black" style={{ color: L.texto }}>{brl(v.preco)}</p>
        {v.pix != null && <p className="text-[11px] font-bold" style={{ color: L.pix }}>{brl(v.pix)} no Pix</p>}
        <p className="text-[11px]" style={{ color: L.suave }}>{p.stockQuantity} {p.stockQuantity === 1 ? 'cópia' : 'cópias'}</p>
      </div>
      <div className="hidden sm:block shrink-0 w-24 text-center"><LinkLiga p={p} /></div>
      <div className="shrink-0"><BotaoSacola onAdd={onAdd} foto={foto} /></div>
    </div>
  )
}

export default function MercadoCartasLoja() {
  const site = useSiteConfig()
  const { porNaSacola, nome: naSacola } = usePorNaSacola()
  const [cartas, setCartas]         = useState<Product[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca]           = useState('')
  const [jogo, setJogo]             = useState('')
  const [colecao, setColecao]       = useState('')
  const [raridade, setRaridade]     = useState('')
  const [idioma, setIdioma]         = useState('')
  const [ordem, setOrdem]           = useState<Ordem>('numero')
  const [vista, setVista]           = useState<'galeria' | 'lista'>('galeria')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  // Desconto do Pix herda da categoria (e da categoria pai) — sem elas o Mercado anunciava o padrão da loja
  // e o valor cobrado no Pix podia ser outro (achado do Codex no PR #179)
  const [categorias, setCategorias] = useState<ProductCategory[]>([])
  // Visitante (veio pelo menu da página inicial) volta pra página inicial; cliente volta pra área dele
  const [voltar, setVoltar] = useState('/')

  // Lista inteira de uma vez (a API já limita a 500): abas, filtros e busca são na tela, sem esperar a rede
  useEffect(() => {
    if (isLoggedIn()) setVoltar('/cliente')
    categoryApi.list().then(r => setCategorias(r.data)).catch(() => {})
    productApi.cartas()
      .then(r => { setCartas(r.data); abaDoEndereco(r.data) })
      .catch(() => setCartas([]))
      .finally(() => setCarregando(false))
  }, [])

  // Endereço com aba (#pokemon--escarlate-e-violeta-151), como no catálogo: dá pra mandar o link da coleção
  function abaDoEndereco(lista: Product[]) {
    const [j, c] = decodeURIComponent(window.location.hash.slice(1)).split('--')
    const jogoDaAba = JOGOS_DE_CARTA.find(x => slug(x) === j)
    setJogo(jogoDaAba ?? '')
    const col = jogoDaAba ? lista.find(p => p.cartaJogo === jogoDaAba && slug(colecaoDe(p)) === c) : undefined
    setColecao(col ? colecaoDe(col) : '')
  }
  useEffect(() => {
    const mudou = () => abaDoEndereco(cartas)
    window.addEventListener('hashchange', mudou)
    return () => window.removeEventListener('hashchange', mudou)
  }, [cartas])

  useEffect(() => {
    if (carregando) return
    const aba = jogo ? `#${slug(jogo)}--${colecao ? slug(colecao) : 'todas'}` : ''
    if (aba !== window.location.hash) history.replaceState(null, '', aba || window.location.pathname + window.location.search)
  }, [jogo, colecao, carregando])

  function escolherJogo(j: string) { setJogo(j); setColecao(''); setRaridade(''); setIdioma('') }

  const jogos = useMemo(() => JOGOS_DE_CARTA
    .map(j => ({ jogo: j, n: cartas.filter(c => c.cartaJogo === j).length }))
    .filter(j => j.n > 0), [cartas])

  const doJogo = useMemo(() => (jogo ? cartas.filter(c => c.cartaJogo === jogo) : cartas), [cartas, jogo])

  const colecoes = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of doJogo) m.set(colecaoDe(c), (m.get(colecaoDe(c)) ?? 0) + 1)
    return [...m.entries()]
      .sort(([a], [b]) => (a === SEM_COLECAO ? 1 : b === SEM_COLECAO ? -1 : a.localeCompare(b, 'pt-BR')))
      .map(([nome, n]) => ({ nome, n }))
  }, [doJogo])

  const raridades = useMemo(() => [...new Set(doJogo.map(c => c.cartaRaridade).filter((r): r is string => !!r))]
    .sort((a, b) => pesoDaRaridade(jogo || null, a) - pesoDaRaridade(jogo || null, b) || a.localeCompare(b, 'pt-BR')), [doJogo, jogo])
  const idiomas = useMemo(() => [...new Set(doJogo.map(c => c.cartaIdioma).filter((i): i is string => !!i))], [doJogo])

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return doJogo.filter(c =>
      (!colecao || colecaoDe(c) === colecao) &&
      (!raridade || c.cartaRaridade === raridade) &&
      (!idioma || c.cartaIdioma === idioma) &&
      (!t || c.name.toLowerCase().includes(t) || (c.cartaColecao ?? '').toLowerCase().includes(t)
          || (c.cartaNumero ?? '').toLowerCase().includes(t)))
  }, [doJogo, colecao, raridade, idioma, busca])

  // Agrupadas por coleção (no "Todos os jogos", por jogo e coleção), na ordem escolhida dentro de cada grupo
  const grupos = useMemo(() => {
    const cmp = (a: Product, b: Product) =>
      ordem === 'menor' ? precoDe(a) - precoDe(b)
      : ordem === 'maior' ? precoDe(b) - precoDe(a)
      : ordem === 'raridade' ? pesoDaRaridade(b.cartaJogo, b.cartaRaridade) - pesoDaRaridade(a.cartaJogo, a.cartaRaridade)
      : ordem === 'novas' ? b.createdAt.localeCompare(a.createdAt)
      : compararNumero(a.cartaNumero, b.cartaNumero) || a.name.localeCompare(b.name, 'pt-BR')
    const m = new Map<string, { titulo: string; jogo: string; colecao: string; itens: Product[] }>()
    for (const c of filtradas) {
      const chave = `${c.cartaJogo ?? ''}|${colecaoDe(c)}`
      if (!m.has(chave)) m.set(chave, { titulo: jogo ? colecaoDe(c) : `${c.cartaJogo ?? 'Outro'} · ${colecaoDe(c)}`, jogo: c.cartaJogo ?? '', colecao: colecaoDe(c), itens: [] })
      m.get(chave)!.itens.push(c)
    }
    const ordemJogo = (j: string) => { const i = JOGOS_DE_CARTA.indexOf(j as typeof JOGOS_DE_CARTA[number]); return i < 0 ? 99 : i }
    return [...m.values()]
      .sort((a, b) => ordemJogo(a.jogo) - ordemJogo(b.jogo)
        || (a.colecao === SEM_COLECAO ? 1 : b.colecao === SEM_COLECAO ? -1 : a.colecao.localeCompare(b.colecao, 'pt-BR')))
      .map(g => ({ ...g, itens: [...g.itens].sort(cmp) }))
  }, [filtradas, ordem, jogo])

  function precos(p: Product): PrecoCarta {
    const preco = precoDe(p)
    const antigo = p.isOnPromo && p.discountPriceInReais != null ? p.priceInReais : null
    if (!site) return { preco, antigo, pix: null }
    const v = calcPrecoVitrine(preco, p.maxInstallments, site, resolvePixPercent(p, categorias, site.pixDiscountPercent))
    return { preco, antigo, pix: v.pixPercent > 0 ? v.precoPix : null }
  }

  const comFiltro    = busca.trim() !== '' || jogo !== '' || raridade !== '' || idioma !== '' || colecao !== ''
  const mercadoVazio = !carregando && cartas.length === 0
  const nFiltros     = (raridade ? 1 : 0) + (idioma ? 1 : 0)
  const copias       = filtradas.reduce((s, c) => s + c.stockQuantity, 0)
  function limpar() { setBusca(''); setColecao(''); setRaridade(''); setIdioma('') }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: L.fundo, colorScheme: 'light' }}>
      <CabecalhoCliente titulo="Mercado de Cartas" subtitulo="Cartas avulsas da loja · reserve e retire na loja" voltar={voltar} />

      <div className="max-w-6xl mx-auto px-4 pt-5">
        {carregando ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: L.azul }} /></div>
        ) : mercadoVazio ? (
          <div className="text-center py-14 px-6 rounded-2xl border" style={{ backgroundColor: L.card, borderColor: L.borda }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: L.foto }}>
              <Layers className="w-8 h-8" style={{ color: L.azul }} />
            </div>
            <p className="text-lg font-black" style={{ color: L.texto }}>Ainda não tem carta avulsa à venda</p>
            <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ color: L.suave }}>
              A loja anuncia as cartas avulsas aqui assim que chegam. Enquanto isso, dá uma olhada nos boosters, decks e acessórios.
            </p>
            <Link href="/produtos" className="inline-flex items-center gap-2 mt-5 rounded-xl px-5 py-2.5 text-sm font-black transition-all active:scale-95"
              style={{ backgroundColor: L.azul, color: '#FFFFFF' }}>
              <ShoppingBag className="w-4 h-4" /> Ver produtos da loja
            </Link>
          </div>
        ) : (
          <>
            {/* Abas de jogo (só os que têm carta) */}
            <div className="abas-rolagem flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
              <Chip ativo={!jogo} onClick={() => escolherJogo('')}>Todos <span className="opacity-60 ml-1">{cartas.length}</span></Chip>
              {jogos.map(j => (
                <Chip key={j.jogo} ativo={jogo === j.jogo} onClick={() => escolherJogo(j.jogo)}>
                  {j.jogo} <span className="opacity-60 ml-1">{j.n}</span>
                </Chip>
              ))}
            </div>

            {/* Abas de coleção do jogo escolhido */}
            {jogo && colecoes.length > 1 && (
              <div className="abas-rolagem flex gap-2 overflow-x-auto pb-1 mt-3 -mx-4 px-4 sm:mx-0 sm:px-0">
                <Chip ativo={!colecao} onClick={() => setColecao('')}>Todas <span className="opacity-60 ml-1">{doJogo.length}</span></Chip>
                {colecoes.map(c => (
                  <Chip key={c.nome} ativo={colecao === c.nome} onClick={() => setColecao(c.nome)}>
                    {c.nome} <span className="opacity-60 ml-1">{c.n}</span>
                  </Chip>
                ))}
              </div>
            )}

            {/* Busca, galeria/lista e filtros */}
            <div className="mt-4 rounded-2xl border" style={{ backgroundColor: L.card, borderColor: L.borda }}>
              <div className="flex gap-2 p-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: L.suave }} />
                  <input className="w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: L.fundo, borderColor: L.borda, color: L.texto }}
                    placeholder={colecao ? `Buscar em ${colecao}…` : 'Buscar em todas as coleções…'}
                    aria-label="Buscar carta, coleção ou número" value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <div className="flex rounded-xl border overflow-hidden shrink-0" style={{ borderColor: L.borda }} role="group" aria-label="Jeito de ver">
                  {([['galeria', LayoutGrid, 'Galeria'], ['lista', List, 'Lista']] as const).map(([v, Icone, rotulo]) => (
                    <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v} title={rotulo}
                      className="flex items-center gap-1.5 px-3 text-[13px] font-bold"
                      style={vista === v ? { backgroundColor: L.texto, color: '#FFFFFF' } : { backgroundColor: L.card, color: L.texto }}>
                      <Icone className="w-4 h-4" /><span className="hidden sm:inline">{rotulo}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setFiltrosAbertos(a => !a)} aria-expanded={filtrosAbertos}
                className="w-full flex items-center gap-1.5 px-4 py-2.5 border-t text-sm font-bold" style={{ borderColor: L.borda, color: L.texto }}>
                <ChevronDown className={clsx('w-4 h-4 transition-transform', !filtrosAbertos && '-rotate-90')} />
                Filtros e ordem
                {nFiltros > 0 && <span className="ml-1 text-[11px] font-black px-1.5 rounded-full" style={{ backgroundColor: L.azul, color: '#FFFFFF' }}>{nFiltros}</span>}
              </button>
              {filtrosAbertos && (
                <div className="px-4 pb-4 space-y-3 text-sm">
                  {raridades.length > 0 && (
                    <div className="sm:flex sm:items-center gap-3">
                      <p className="w-20 shrink-0 font-semibold mb-1.5 sm:mb-0" style={{ color: L.suave }}>Raridade</p>
                      <div className="flex gap-2 flex-wrap">
                        <Chip ativo={!raridade} onClick={() => setRaridade('')}>Todas</Chip>
                        {raridades.map(r => <Chip key={r} ativo={raridade === r} onClick={() => setRaridade(r)}>{r}</Chip>)}
                      </div>
                    </div>
                  )}
                  {idiomas.length > 1 && (
                    <div className="sm:flex sm:items-center gap-3">
                      <p className="w-20 shrink-0 font-semibold mb-1.5 sm:mb-0" style={{ color: L.suave }}>Idioma</p>
                      <div className="flex gap-2 flex-wrap">
                        <Chip ativo={!idioma} onClick={() => setIdioma('')}>Todos</Chip>
                        {idiomas.map(i => (
                          <Chip key={i} ativo={idioma === i} onClick={() => setIdioma(i)}>
                            <span className="inline-flex items-center gap-1.5">
                              <BandeiraIdioma idioma={i} /> {IDIOMAS_DE_CARTA.find(x => x.valor === i)?.rotulo ?? i}
                            </span>
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="sm:flex sm:items-center gap-3">
                    <p className="w-20 shrink-0 font-semibold mb-1.5 sm:mb-0" style={{ color: L.suave }}>Ordenar</p>
                    <div className="flex gap-2 flex-wrap">
                      {ORDENS.map(o => <Chip key={o.valor} ativo={ordem === o.valor} onClick={() => setOrdem(o.valor)}>{o.rotulo}</Chip>)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {filtradas.length === 0 ? (
              <div className="mt-5 text-center py-16 px-6 rounded-2xl border" style={{ backgroundColor: L.card, borderColor: L.borda }}>
                <Package className="w-12 h-12 mx-auto mb-3" style={{ color: L.suave, opacity: 0.4 }} />
                <p className="text-lg font-black" style={{ color: L.texto }}>Nenhuma carta encontrada</p>
                <p className="text-sm mt-1" style={{ color: L.suave }}>Nada com essa busca. Tente outro nome, coleção ou filtro.</p>
                {comFiltro && (
                  <button onClick={limpar} className="mt-4 rounded-xl border px-4 py-2 text-sm font-bold"
                    style={{ borderColor: L.borda, color: L.azul, backgroundColor: L.card }}>
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3 mt-6 mb-1">
                  <h2 className="text-xl sm:text-2xl font-black" style={{ color: L.texto }}>
                    {colecao || (jogo ? `${jogo} · todas as coleções` : 'Todas as cartas')}
                  </h2>
                  <p className="text-xs sm:text-sm shrink-0" style={{ color: L.suave }}>
                    {filtradas.length} {filtradas.length === 1 ? 'carta' : 'cartas'}, {copias} {copias === 1 ? 'cópia' : 'cópias'}
                  </p>
                </div>
                <p className="text-sm mb-2" style={{ color: L.suave }}>
                  Toque em <b style={{ color: L.texto }}>Adicionar</b> pra pôr a carta na sacola — você reserva, paga no Pix e retira na loja.
                </p>

                {grupos.map(g => (
                  <section key={`${g.jogo}|${g.colecao}`} className="mt-5">
                    {/* Com uma coleção escolhida o título já diz qual é — sem repetir o cabeçalho do grupo */}
                    <div className={clsx('flex items-baseline justify-between gap-3 border-b pb-2 mb-3', colecao && 'hidden')} style={{ borderColor: L.borda }}>
                      <h3 className="font-black" style={{ color: L.texto }}>{g.titulo}</h3>
                      <p className="text-xs shrink-0" style={{ color: L.suave }}>
                        {g.itens.length} {g.itens.length === 1 ? 'carta' : 'cartas'}, {g.itens.reduce((s, c) => s + c.stockQuantity, 0)} cópias
                      </p>
                    </div>
                    {vista === 'galeria' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {g.itens.map(p => <CartaGaleria key={p.id} p={p} v={precos(p)} onAdd={() => porNaSacola(p)} />)}
                      </div>
                    ) : (
                      <div className="rounded-2xl border divide-y" style={{ backgroundColor: L.card, borderColor: L.borda }}>
                        {g.itens.map(p => <CartaLinha key={p.id} p={p} v={precos(p)} onAdd={() => porNaSacola(p)} />)}
                      </div>
                    )}
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <AvisoSacola nome={naSacola} />
    </div>
  )
}
