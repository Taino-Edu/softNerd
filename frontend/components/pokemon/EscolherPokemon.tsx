'use client'
// "Qual o seu Pokémon preferido?" — seletor da Minha Conta (chave pokemon-preferido, v1.65.0).
// Busca por nome ou número, "Me surpreenda", versão brilhante e prévia animada antes de salvar.
// A lista (public/pokedex.json) só é baixada quando o seletor abre.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Shuffle, Sparkles, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'
import { Switch } from '@/components/ui/Switch'
import PokemonParceiro from './PokemonParceiro'
import { buscarPokemon, carregarPokedex, numeroDex, QUERIDINHOS, sortear, spriteParado, type PokemonDex } from '@/lib/pokemonPreferido'

export default function EscolherPokemon({ atual, titulo, subtitulo, onClose, onSalvo }: {
  atual: { id: string; shiny: boolean } | null
  titulo?: string
  subtitulo?: string
  onClose: () => void
  onSalvo: (pokemon: string | null, shiny: boolean) => void
}) {
  const [lista, setLista]       = useState<PokemonDex[] | null>(null)
  const [erroLista, setErro]    = useState(false)
  const [termo, setTermo]       = useState('')
  const [escolhido, setEscolha] = useState<PokemonDex | null>(null)
  const [shiny, setShiny]       = useState(atual?.shiny ?? false)
  const [salvando, setSalvando] = useState(false)
  const busca = useRef<HTMLInputElement>(null)

  // Só na abertura: a tela de trás re-renderizar não pode desfazer o que a pessoa já escolheu aqui
  const atualId = atual?.id ?? null
  useEffect(() => {
    carregarPokedex()
      .then(l => { setLista(l); if (atualId) setEscolha(l.find(p => p.id === atualId) ?? null) })
      .catch(() => setErro(true))
  }, [atualId])

  const grade = useMemo(() => {
    if (!lista) return []
    if (termo.trim()) return buscarPokemon(lista, termo)
    return QUERIDINHOS.map(id => lista.find(p => p.id === id)).filter((p): p is PokemonDex => !!p)
  }, [lista, termo])

  async function salvar(pokemon: string | null) {
    setSalvando(true)
    try {
      const { data } = await userApi.definirPokemon(pokemon, pokemon ? shiny : false)
      onSalvo(data.pokemon, data.shiny)
      if (data.pokemon && escolhido) toast.success(`${escolhido.nome} agora é o seu parceiro!`)
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Não deu pra salvar agora. Tenta de novo?')
    } finally {
      setSalvando(false)
    }
  }

  const mudou = (escolhido?.id ?? null) !== (atual?.id ?? null) || (!!escolhido && shiny !== (atual?.shiny ?? false))

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="escolher-pokemon-titulo"
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 id="escolher-pokemon-titulo" className="text-lg font-black text-gray-900">
              {titulo ?? 'Qual o seu Pokémon preferido?'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitulo ?? 'Ele fica com você na sua conta.'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prévia: o escolhido animado, com nome e número */}
        <div className="mx-6 mt-4 rounded-2xl flex items-center gap-4 p-4"
          style={{ background: 'linear-gradient(160deg, #EEF3FF 0%, #DCE6FF 100%)' }}>
          <div className="w-24 h-24 shrink-0 flex items-end justify-center">
            {escolhido
              ? <PokemonParceiro id={escolhido.id} shiny={shiny} tamanho={96} titulo={escolhido.nome} />
              : <span className="w-20 h-20 rounded-full border-2 border-dashed border-[#1E4FD6]/40 flex items-center justify-center text-3xl font-black text-[#1E4FD6]/50">?</span>}
          </div>
          <div className="min-w-0 flex-1">
            {escolhido ? (
              <>
                <p className="text-[11px] font-bold text-[#1E4FD6]/70">{numeroDex(escolhido.numero)}</p>
                <p className="text-base font-black text-gray-900 truncate">{escolhido.nome}</p>
                <label className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-700">
                  <Switch ligado={shiny} onChange={setShiny} label="Versão brilhante" cor="amarelo" />
                  <Sparkles className="w-3.5 h-3.5 text-yellow-500" /> Brilhante
                </label>
              </>
            ) : (
              <p className="text-sm font-bold text-gray-600">Escolha um aqui embaixo, busque pelo nome ou deixe a sorte decidir.</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-6 mt-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input ref={busca} value={termo} onChange={e => setTermo(e.target.value)} type="search" inputMode="search"
              placeholder="Nome ou número" aria-label="Buscar Pokémon"
              className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#1E4FD6]" />
          </div>
          <button type="button" disabled={!lista}
            onClick={() => { if (lista) { const p = sortear(lista); setEscolha(p); setTermo('') } }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-black text-[#1E4FD6] bg-[#1E4FD6]/10 hover:bg-[#1E4FD6]/15 disabled:opacity-50">
            <Shuffle className="w-4 h-4" /> Me surpreenda
          </button>
        </div>

        <div className="px-6 mt-3 flex-1 overflow-y-auto min-h-[180px]">
          {!termo.trim() && lista && <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Os queridinhos</p>}
          {erroLista ? (
            <p className="text-sm text-gray-500 py-8 text-center">Não deu pra carregar a lista agora. Feche e abra de novo.</p>
          ) : !lista ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#1E4FD6] animate-spin" /></div>
          ) : grade.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">Nenhum Pokémon com esse nome. Confere a escrita?</p>
          ) : (
            <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2 pb-2">
              {grade.map(p => {
                const ativo = escolhido?.id === p.id
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setEscolha(p)} aria-pressed={ativo} title={p.nome}
                      className={`w-full rounded-xl flex flex-col items-center pt-1 pb-1.5 px-1 transition-colors ${ativo ? 'bg-[#1E4FD6]/10 ring-2 ring-[#1E4FD6]' : 'hover:bg-gray-100'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spriteParado(p.id)} alt="" width={56} height={56} loading="lazy" decoding="async"
                        className="w-14 h-14 object-contain" style={{ imageRendering: 'pixelated' }}
                        onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                      <span className="text-[10px] font-bold text-gray-700 leading-tight text-center line-clamp-2 w-full">{p.nome}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* pr-20 no celular: o botão do VLibras (mãozinha, canto de baixo à direita) cobria o "Escolher" */}
        <div className="pl-6 pr-20 sm:pr-6 pt-3 pb-6 border-t border-gray-100 flex items-center gap-3">
          {atual && (
            <button type="button" disabled={salvando} onClick={() => salvar(null)}
              className="text-xs font-bold text-gray-500 hover:text-red-500 disabled:opacity-50">
              Tirar Pokémon
            </button>
          )}
          <button type="button" disabled={!escolhido || !mudou || salvando} onClick={() => escolhido && salvar(escolhido.id)}
            className="ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black disabled:opacity-40"
            style={{ background: '#1E4FD6', color: '#FFFFFF' }}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {escolhido ? `Escolher ${escolhido.nome}` : 'Escolher'}
          </button>
        </div>
      </div>
    </div>
  )
}
