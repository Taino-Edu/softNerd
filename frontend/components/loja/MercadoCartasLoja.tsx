'use client'
// Mercado de Cartas com reserva (v1.91.0, chave "cartas-como-produto") — pedido do Maikon de 19/11: "ele clica na
// carta, ele consegue fazer a reserva dela, pra vir na loja pegar, como se ela fosse um produto". Cada carta é um
// produto marcado como carta avulsa: o cartão é o mesmo de Produtos, o "Adicionar" põe na sacola e a reserva/Pix
// seguem o caminho de qualquer pedido do site. Só a loja vende (sem mercado entre jogadores).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Search, Loader2, Layers, ShoppingBag, Package } from 'lucide-react'
import { productApi, Product } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'
import { useSiteConfig } from '@/lib/useSiteConfig'
import { calcPrecoVitrine, resolvePixPercent } from '@/lib/precoVitrine'
import { JOGOS_DE_CARTA, resumoCarta } from '@/lib/cartasAvulsas'
import CabecalhoCliente from '@/components/cliente/CabecalhoCliente'
import CartaoProduto, { CoresVitrine } from '@/components/loja/CartaoProduto'
import AvisoSacola, { usePorNaSacola } from '@/components/loja/AvisoSacola'

/** Paleta clara da loja (cores no style: o tema claro do site remapeia classes text-white/surface). */
const L = {
  fundo: '#F5F8FA', card: '#FFFFFF', borda: 'rgba(12,61,90,0.10)', texto: '#0F1B33', suave: '#5B6B84',
  azul: '#1E4FD6', foto: '#F1F5FD',
}
const CORES: CoresVitrine = {
  card: L.card, cardAlt: L.foto, border: L.borda, navy: L.texto, text: L.suave, blue: L.azul, pix: '#00806D', yellow: '#FFE45E',
}

export default function MercadoCartasLoja() {
  const site = useSiteConfig()
  const { porNaSacola, nome: naSacola } = usePorNaSacola()
  const [cartas, setCartas]         = useState<Product[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca]           = useState('')
  const [jogo, setJogo]             = useState('')
  // Visitante (veio pelo menu da página inicial) volta pra página inicial; cliente volta pra área dele
  const [voltar, setVoltar] = useState('/')
  useEffect(() => { if (isLoggedIn()) setVoltar('/cliente') }, [])

  // Busca com folga de 300 ms: não pede a lista a cada letra
  useEffect(() => {
    setCarregando(true)
    let vivo = true
    const t = setTimeout(() => {
      productApi.cartas({ jogo, busca: busca.trim() })
        .then(r => { if (vivo) setCartas(r.data) })
        .catch(() => { if (vivo) setCartas([]) })
        .finally(() => { if (vivo) setCarregando(false) })
    }, busca ? 300 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, jogo])

  const comFiltro    = busca.trim() !== '' || jogo !== ''
  const mercadoVazio = !carregando && cartas.length === 0 && !comFiltro
  // Filtros escondidos no mercado vazio e na primeira carga (não aparecem e somem)
  const semFiltros   = mercadoVazio || (carregando && cartas.length === 0 && !comFiltro)

  function precos(p: Product) {
    if (!site) return { pix: null, cartao: null }
    const preco = p.isOnPromo && p.discountPriceInReais != null ? p.discountPriceInReais : p.priceInReais
    const v = calcPrecoVitrine(preco, p.maxInstallments, site, resolvePixPercent(p, [], site.pixDiscountPercent))
    return {
      pix: v.pixPercent > 0 ? { precoPix: v.precoPix, pixPercent: v.pixPercent } : null,
      cartao: v.parcelas >= 2 ? { parcelas: v.parcelas, valorParcela: v.valorParcela } : null,
    }
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: L.fundo, colorScheme: 'light' }}>
      <CabecalhoCliente titulo="Mercado de Cartas" subtitulo="Cartas avulsas da loja · reserve e retire na loja" voltar={voltar} />

      <div className="max-w-5xl mx-auto px-4 pt-5">
        <div className={clsx('flex gap-2 mb-5', semFiltros && 'hidden')}>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: L.suave }} />
            <input className="w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: L.card, borderColor: L.borda, color: L.texto }}
              placeholder="Buscar carta…" aria-label="Buscar carta ou coleção" title="Busca no nome e na coleção (ex.: 151, 199/165)" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className="rounded-xl border px-3 py-2.5 text-sm max-w-[160px] outline-none" aria-label="Jogo"
            style={{ backgroundColor: L.card, borderColor: L.borda, color: L.texto }} value={jogo} onChange={e => setJogo(e.target.value)}>
            <option value="">Todos os jogos</option>
            {JOGOS_DE_CARTA.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        {carregando && cartas.length === 0 ? (
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
        ) : cartas.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-2xl border" style={{ backgroundColor: L.card, borderColor: L.borda }}>
            <Package className="w-12 h-12 mx-auto mb-3" style={{ color: L.suave, opacity: 0.4 }} />
            <p className="text-lg font-black" style={{ color: L.texto }}>Nenhuma carta encontrada</p>
            <p className="text-sm mt-1" style={{ color: L.suave }}>Nada com essa busca. Tente outro nome ou outro jogo.</p>
            <button onClick={() => { setBusca(''); setJogo('') }} className="mt-4 rounded-xl border px-4 py-2 text-sm font-bold"
              style={{ borderColor: L.borda, color: L.azul, backgroundColor: L.card }}>
              Limpar busca
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: L.suave }}>
              Toque em <b style={{ color: L.texto }}>Adicionar</b> pra pôr a carta na sacola — você reserva, paga no Pix e retira na loja.
            </p>
            <div className={clsx('grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 transition-opacity', carregando && 'opacity-60')}>
              {cartas.map(p => {
                const { pix, cartao } = precos(p)
                return (
                  <CartaoProduto key={p.id} p={p} C={CORES} pix={pix} cartao={cartao} grande
                    href={`/produtos/${p.id}`} categoria={resumoCarta(p) || 'Carta avulsa'}
                    onAdd={() => porNaSacola(p)} />
                )
              })}
            </div>
          </>
        )}
      </div>

      <AvisoSacola nome={naSacola} />
    </div>
  )
}
