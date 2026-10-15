'use client'
import { useEffect, useState } from 'react'
import { deckApi, DeckListDto } from '@/lib/api'
import { Plus, Loader2, Swords, BookOpen, Lock, Globe, Trash2 } from 'lucide-react'
import CabecalhoCliente from '@/components/cliente/CabecalhoCliente'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const C = { navy: '#0C3D5A', blue: '#1E4FD6', blue2: '#163CA8', yellow: '#FFE45E', bg: '#EBF7FD', white: '#FFFFFF', muted: '#4D8FAC', border: 'rgba(62,194,242,0.18)' }

const GAME_EMOJI: Record<string, string> = {
  Pokemon: '🔴', 'Yu-Gi-Oh!': '🟡', MTG: '♠️', 'LoL Riftbound': '⚔️',
}

export default function MeusDecksPage() {
  const router = useRouter()
  const [decks, setDecks]     = useState<DeckListDto[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    deckApi.list().then(r => setDecks(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o deck "${name}"?`)) return
    setDeleting(id)
    try {
      await deckApi.delete(id)
      setDecks(prev => prev.filter(d => d.id !== id))
      toast.success('Deck excluído!')
    } catch {
      toast.error('Erro ao excluir.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <Toaster position="top-center" />

      {/* Header */}
      <CabecalhoCliente titulo="Meus Decks" subtitulo="Sua coleção e listas pra campeonato"
        acao={
          <button
            onClick={() => router.push('/cliente/decks/novo')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 shrink-0"
            style={{ backgroundColor: C.yellow, color: '#3D2E00' }}
          >
            <Plus className="w-4 h-4" /> Novo
          </button>
        } />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.blue }} />
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="w-14 h-14 mx-auto opacity-20" style={{ color: C.navy }} />
            <p className="font-black text-lg" style={{ color: C.navy }}>Nenhum deck ainda</p>
            <p className="text-sm" style={{ color: C.muted }}>Crie seu primeiro deck e registre suas cartas.</p>
            <button
              onClick={() => router.push('/cliente/decks/novo')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
              style={{ backgroundColor: C.blue, color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> Criar deck
            </button>
          </div>
        ) : (
          decks.map(deck => (
            <div
              key={deck.id}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(12,61,90,0.06)' }}
            >
              <div className="px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: C.bg }}>
                  {GAME_EMOJI[deck.game] ?? <Swords className="w-5 h-5" style={{ color: C.blue }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black truncate" style={{ color: C.navy }}>{deck.name}</p>
                  <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: C.muted }}>
                    {deck.game} · {deck.format} · {deck.cardCount} cartas
                    <span className="flex items-center gap-0.5">
                      {deck.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {deck.isPublic ? 'Público' : 'Privado'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/cliente/decks/${deck.id}`}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    style={{ backgroundColor: C.blue, color: '#fff' }}
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleDelete(deck.id, deck.name)}
                    disabled={deleting === deck.id}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                    style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
                  >
                    {deleting === deck.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
