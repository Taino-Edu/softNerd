'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { publicProfileApi, PublicProfileDto } from '@/lib/api'
import Link from 'next/link'
import ParceiroDaConta from '@/components/pokemon/ParceiroDaConta'
import { nomeDoId } from '@/lib/pokemonPreferido'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import {
  ArrowLeft, User as UserIcon, Trophy, BookOpen,
  Loader2, Shield, Star, Calendar, Layers,
} from 'lucide-react'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

function PlacementBadge({ place }: { place: number }) {
  if (place === 1) return <span className="text-2xl">🥇</span>
  if (place === 2) return <span className="text-2xl">🥈</span>
  if (place === 3) return <span className="text-2xl">🥉</span>
  return <span className="text-sm font-black text-brand-300">{place}º</span>
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [profile, setProfile] = useState<PublicProfileDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'decks' | 'trophies'>('decks')
  const pokemonLigado = useFuncionalidade('pokemon-preferido') === true

  useEffect(() => {
    if (!id) return
    publicProfileApi.get(id)
      .then(r => setProfile(r.data))
      .catch(e => {
        if (e?.response?.status === 404) setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
    </div>
  )

  if (notFound || !profile) return (
    <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center gap-4 text-center p-8">
      <UserIcon className="w-16 h-16 text-surface-600" />
      <h1 className="text-2xl font-bold text-white">Perfil não encontrado</h1>
      <p className="text-gray-400">Este usuário não existe ou tem o perfil oculto.</p>
      <button onClick={() => router.back()} className="btn-secondary">Voltar</button>
    </div>
  )

  const memberYear = new Date(profile.memberSince).getFullYear()
  const podiumCount = profile.championships.filter(c => c.placement && c.placement <= 3).length

  return (
    <div className="min-h-screen bg-surface-900 pb-20">
      {/* Banner + avatar */}
      <div className="relative">
        <div className="h-36 bg-gradient-to-br from-brand-900 via-surface-800 to-surface-900" />
        <div className="absolute -bottom-14 left-6 flex items-end gap-1">
          {profile.profileImageUrl ? (
            <img
              src={`${BASE}${profile.profileImageUrl}`}
              alt={profile.name}
              className="w-24 h-24 rounded-full border-4 border-surface-900 object-cover shadow-xl"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-surface-900 bg-surface-700 flex items-center justify-center shadow-xl">
              <UserIcon className="w-10 h-10 text-surface-400" />
            </div>
          )}
          {/* Pokémon preferido do jogador (chave pokemon-preferido) */}
          {pokemonLigado && profile.pokemonFavorito && (
            <ParceiroDaConta id={profile.pokemonFavorito} shiny={!!profile.pokemonFavoritoShiny} nome={nomeDoId(profile.pokemonFavorito)} />
          )}
        </div>
      </div>

      <div className="pt-16 px-6">
        {/* Nome e info */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">{profile.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Membro desde {memberYear}
              </span>
              {podiumCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <Trophy className="w-3 h-3" /> {podiumCount} pódio{podiumCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => router.back()} className="p-2 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors text-gray-400 mt-1">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Stats rápidos */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="card text-center">
            <p className="text-xl font-black text-brand-300">{profile.publicDecks.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Decks públicos</p>
          </div>
          <div className="card text-center">
            <p className="text-xl font-black text-brand-300">{profile.championships.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Torneios</p>
          </div>
          <div className="card text-center">
            <p className="text-xl font-black text-yellow-400">{podiumCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Pódios</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-5 mb-4">
          <button
            onClick={() => setTab('decks')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 ${tab === 'decks' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-gray-400 hover:bg-surface-700'}`}
          >
            <BookOpen className="w-4 h-4" /> Decks ({profile.publicDecks.length})
          </button>
          <button
            onClick={() => setTab('trophies')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 ${tab === 'trophies' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-gray-400 hover:bg-surface-700'}`}
          >
            <Trophy className="w-4 h-4" /> Torneios ({profile.championships.length})
          </button>
        </div>

        {/* Decks */}
        {tab === 'decks' && (
          profile.publicDecks.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Nenhum deck público</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.publicDecks.map(deck => (
                <Link
                  key={deck.id}
                  href={`/cliente/decks/${deck.id}`}
                  className="card flex items-center gap-4 hover:ring-1 hover:ring-brand-500/40 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{deck.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {deck.game}{deck.format ? ` · ${deck.format}` : ''} · {deck.cardCount} cartas
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {/* Torneios */}
        {tab === 'trophies' && (
          profile.championships.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Nenhum torneio disputado</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {profile.championships
                .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
                .map(c => (
                <div key={c.championshipId} className="card flex items-center gap-4">
                  <div className="w-12 flex items-center justify-center shrink-0">
                    {c.placement ? <PlacementBadge place={c.placement} /> : <Shield className="w-5 h-5 text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{c.championshipName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.game} · {new Date(c.startDate).toLocaleDateString('pt-BR')}
                      {c.deckName ? ` · 🃏 ${c.deckName}` : ''}
                    </p>
                  </div>
                  {c.playerNumber && (
                    <span className="text-xs text-gray-500 shrink-0">#{c.playerNumber}</span>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
