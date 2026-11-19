'use client'
// Cartas avulsas da loja (v1.91.0, chave "cartas-como-produto") — tela Marketplace do painel.
// Cada carta é um produto marcado (cartaAvulsa): o cliente reserva pela sacola e paga no Pix como qualquer
// produto, o estoque baixa sozinho e a carta também sai no Frente de Caixa. Cópias iguais = quantidade.
// "Ver na Liga" abre a busca da carta na Liga pra conferir o menor preço (pedido do Maikon, 19/11).
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { productApi, uploadApi, Product } from '@/lib/api'
import { brlDeCentavos } from '@/lib/format'
import { Table } from '@/components/ui/Table'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  JOGOS_DE_CARTA, CONDICOES_DE_CARTA, IDIOMAS_DE_CARTA, CATEGORIA_CARTA_AVULSA, resumoCarta, linkDaLiga,
} from '@/lib/cartasAvulsas'
import {
  Search, Package, Loader2, Trash2, Eye, Plus, Pencil, X, ImagePlus, ExternalLink, Layers,
} from 'lucide-react'

type Form = {
  nome: string; jogo: string; condicao: string; idioma: string; colecao: string
  preco: string; quantidade: string; descricao: string
}

function centavosDe(texto: string) {
  return Math.round(parseFloat(texto.replace(/\./g, '').replace(',', '.') || '0') * 100)
}

// ── Modal criar / editar carta ────────────────────────────────────────────────
function CartaModal({ inicial, onClose, onSalvo }: {
  inicial?: Product
  onClose: () => void
  onSalvo: (p: Product) => void
}) {
  const [form, setForm] = useState<Form>({
    nome:       inicial?.name ?? '',
    jogo:       inicial?.cartaJogo ?? 'Pokémon',
    condicao:   inicial?.cartaCondicao ?? 'NM',
    idioma:     inicial?.cartaIdioma ?? 'PT',
    colecao:    inicial?.cartaColecao ?? '',
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
      }
      const { data } = inicial ? await productApi.update(inicial.id, corpo) : await productApi.create(corpo)
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

        <div>
          <label className="label">Coleção e número</label>
          <input className="input" value={form.colecao} onChange={e => set('colecao', e.target.value)} placeholder="Ex: 151 · 199/165" />
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
export default function CartasDaLoja() {
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

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return cartas.filter(c =>
      (!jogo || c.cartaJogo === jogo) &&
      (!t || c.name.toLowerCase().includes(t) || (c.cartaColecao ?? '').toLowerCase().includes(t)))
  }, [cartas, busca, jogo])

  const aVenda    = cartas.filter(c => c.stockQuantity > 0)
  const copias    = aVenda.reduce((s, c) => s + c.stockQuantity, 0)
  const esgotadas = cartas.length - aVenda.length

  function salvo(p: Product) {
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
          <button onClick={() => setNova(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nova carta
          </button>
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
          <input className="input pl-9" placeholder="Buscar por nome ou coleção..." value={busca} onChange={e => setBusca(e.target.value)} />
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
                      {c.cartaColecao && <p className="text-xs text-gray-400 truncate max-w-[240px]">{c.cartaColecao}</p>}
                      {/* Celular: preço e quantidade aqui (as colunas só aparecem do tablet pra cima) */}
                      <p className="sm:hidden text-xs mt-0.5">
                        <span className="font-bold text-brand-300">{brlDeCentavos(c.priceInCents)}</span>
                        <span className="text-gray-400"> · {c.stockQuantity > 0 ? `${c.stockQuantity} ${c.stockQuantity === 1 ? 'cópia' : 'cópias'}` : 'esgotada'}</span>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden sm:table-cell p-4 font-bold text-brand-300 whitespace-nowrap">{brlDeCentavos(c.priceInCents)}</td>
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

      {nova && <CartaModal onClose={() => setNova(false)} onSalvo={salvo} />}
      {editando && <CartaModal inicial={editando} onClose={() => setEditando(null)} onSalvo={salvo} />}
    </div>
  )
}
