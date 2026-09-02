'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Trophy, Swords, Calendar, Users, Clock, CheckCircle2,
  AlertCircle, Loader2, ChevronRight, ArrowLeft, MessageCircle,
} from 'lucide-react'
import Link from 'next/link'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ChampionshipPublic {
  id: string
  name: string
  game: string
  status: string
  startDate: string
  endDate?: string | null
  registrationDeadline?: string | null
  maxParticipants: number | null
  entryFeeInCents: number
  entryFeeInReais: number
  description?: string | null
  imageUrl?: string | null
  participantCount: number
  preInscricaoCount: number
  listaEsperaCount: number
}

interface PreInscricaoResult {
  id: string
  nome: string
  isListaEspera: boolean
  numero: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

const STATUS_INFO: Record<string, { label: string; color: string; accepting: boolean }> = {
  Planejado:   { label: 'Em breve',          color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',   accepting: true  },
  Inscricoes:  { label: 'Inscrições abertas', color: 'text-green-400 bg-green-500/10 border-green-500/30', accepting: true  },
  EmAndamento: { label: 'Em andamento',       color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', accepting: false },
  Finalizado:  { label: 'Finalizado',         color: 'text-gray-400 bg-gray-500/10 border-gray-500/20',   accepting: false },
  Cancelado:   { label: 'Cancelado',          color: 'text-red-400 bg-red-500/10 border-red-500/30',      accepting: false },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatWhatsApp(raw: string) {
  return raw.replace(/\D/g, '')
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ChampionshipPublicPage() {
  const { id } = useParams<{ id: string }>()

  const [ch, setCh]           = useState<ChampionshipPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [nome, setNome]         = useState('')
  const [whats, setWhats]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]     = useState<{ ok: boolean; listaEspera?: boolean; msg: string } | null>(null)


  useEffect(() => {
    if (!id) return
    fetch(`${BASE}/api/championship/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(data => { if (data) setCh(data) })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !whats.trim()) return
    setSubmitting(true)
    try {
      const r = await fetch(`${BASE}/api/championship/${id}/preinscricoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), whatsApp: formatWhatsApp(whats) }),
      })
      const data: PreInscricaoResult & { message?: string } = await r.json()
      if (!r.ok) {
        setResult({ ok: false, msg: data.message || 'Erro ao realizar inscrição. Tente novamente.' })
      } else {
        setResult({
          ok: true,
          listaEspera: data.isListaEspera,
          msg: data.isListaEspera
            ? `${data.nome}, você está na fila de espera! Você é o número ${data.numero} da lista. Entraremos em contato pelo WhatsApp caso uma vaga abra.`
            : `${data.nome}, pré-inscrição confirmada! Você é o participante número ${data.numero}. Entraremos em contato pelo WhatsApp.`,
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        // Atualiza contagem local
        setCh(prev => prev ? {
          ...prev,
          preInscricaoCount: prev.preInscricaoCount + (data.isListaEspera ? 0 : 1),
          listaEsperaCount:  prev.listaEsperaCount  + (data.isListaEspera ? 1 : 0),
        } : prev)
      }
    } catch {
      setResult({ ok: false, msg: 'Erro de conexão. Verifique sua internet e tente novamente.' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Estados de carregamento ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    )
  }

  if (notFound || !ch) {
    return (
      <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Trophy className="w-14 h-14 text-gray-600" />
        <h1 className="text-xl font-bold text-white">Campeonato não encontrado</h1>
        <p className="text-gray-400 text-sm">O link pode estar incorreto ou o campeonato foi removido.</p>
      </div>
    )
  }

  const statusInfo  = STATUS_INFO[ch.status] ?? STATUS_INFO.Cancelado
  const filled      = ch.preInscricaoCount
  const max         = ch.maxParticipants
  const isFull      = max !== null && filled >= max
  const fillPct     = max ? Math.min(100, Math.round((filled / max) * 100)) : null
  const deadlinePast = ch.registrationDeadline
    ? new Date(ch.registrationDeadline) < new Date()
    : false
  const canRegister = statusInfo.accepting && !deadlinePast

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-900 text-white">

      {/* Navbar fixa — voltar + branding */}
      <nav className="fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 gap-3 bg-surface-900/90 backdrop-blur-md border-b border-surface-700">
        <button
          onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = '/')}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-brand-400 truncate">Santuário Nerd</p>
        </div>
      </nav>

      {/* Banner — mt-14 para cair abaixo da navbar fixa */}
      <div className="relative w-full h-48 sm:h-64 bg-surface-800 overflow-hidden mt-14">
        {ch.imageUrl
          ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ch.imageUrl} alt={ch.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Trophy className="w-16 h-16 text-gray-700" />
            </div>
          )
        }
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/60 to-transparent" />
      </div>

      {/* Conteúdo */}
      <div className="max-w-lg mx-auto px-4 pb-32 -mt-8 relative z-10 space-y-5">

        {/* Cabeçalho */}
        <div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <h1 className="text-2xl font-bold text-white mt-2 leading-tight">{ch.name}</h1>
          <p className="flex items-center gap-1.5 text-gray-400 text-sm mt-1">
            <Swords className="w-3.5 h-3.5 shrink-0" /> {ch.game}
          </p>
        </div>

        {/* Infos */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-800 rounded-xl p-3 border border-surface-500">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Calendar className="w-3.5 h-3.5" /> Data
            </div>
            <p className="text-sm font-semibold text-white capitalize leading-tight">
              {formatDate(ch.startDate)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{formatTime(ch.startDate)}</p>
          </div>
          <div className="bg-surface-800 rounded-xl p-3 border border-surface-500">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Trophy className="w-3.5 h-3.5" /> Inscrição
            </div>
            <p className={`text-sm font-semibold ${ch.entryFeeInCents === 0 ? 'text-green-400' : 'text-accent-gold'}`}>
              {ch.entryFeeInCents === 0 ? 'Gratuito' : `R$ ${ch.entryFeeInReais.toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Vagas */}
        {(max !== null || ch.preInscricaoCount > 0) && (
          <div className="bg-surface-800 rounded-xl p-4 border border-surface-500 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-400">
                <Users className="w-4 h-4" /> Vagas preenchidas
              </span>
              <span className="font-semibold text-white">
                {filled}{max ? ` / ${max}` : ''}
              </span>
            </div>
            {fillPct !== null && (
              <div className="h-2 bg-surface-600 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : 'bg-brand-500'}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            )}
            {ch.listaEsperaCount > 0 && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {ch.listaEsperaCount} pessoa{ch.listaEsperaCount !== 1 ? 's' : ''} na lista de espera
              </p>
            )}
          </div>
        )}

        {/* Descrição */}
        {ch.description && (
          <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sobre o torneio</h2>
            <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{ch.description}</p>
          </div>
        )}

        {/* Prazo de inscrição */}
        {ch.registrationDeadline && (
          <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
            deadlinePast
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <Clock className="w-4 h-4 shrink-0" />
            {deadlinePast
              ? 'Prazo de inscrição encerrado'
              : `Inscrições até ${formatDate(ch.registrationDeadline)}`
            }
          </div>
        )}

        {/* Resultado de inscrição bem-sucedida */}
        {result?.ok && (
          <div className={`rounded-xl p-5 border text-center space-y-3 ${
            result.listaEspera
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-green-500/10 border-green-500/30'
          }`}>
            {result.listaEspera
              ? <Clock className="w-8 h-8 text-amber-400 mx-auto" />
              : <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto" />
            }
            <p className={`font-semibold ${result.listaEspera ? 'text-amber-300' : 'text-green-300'}`}>
              {result.listaEspera ? 'Lista de espera' : 'Pré-inscrição confirmada!'}
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">{result.msg}</p>
            <Link
              href="/"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao início
            </Link>
          </div>
        )}

        {/* Inscrições oficiais são incluídas exclusivamente pelo Maikon. */}
        {canRegister && ch.status === 'Inscricoes' && (
          <div className="bg-surface-800 rounded-xl p-5 border border-brand-500/30 text-center space-y-3">
            <MessageCircle className="w-8 h-8 text-brand-400 mx-auto" />
            <p className="font-semibold text-white">Faça sua inscrição</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Entre na sua conta, confirme seus dados e pague o Pix para garantir a vaga.
              A inclusão manual continua disponível somente para o Maikon.
            </p>
            <Link href={`/?campeonato=${id}`}
              className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm">
              Continuar inscrição <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
        {/* Formulário de pré-inscrição (antes das inscrições abrirem oficialmente) */}
        {!result?.ok && ch.status !== 'Inscricoes' && (
          canRegister ? (
            <div className="bg-surface-800 rounded-xl p-5 border border-surface-500 space-y-4">
              <div>
                <h2 className="font-bold text-white text-lg">
                  {isFull ? 'Entrar na lista de espera' : 'Fazer pré-inscrição'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isFull
                    ? 'As vagas estão preenchidas. Caso alguém desista, entraremos em contato.'
                    : 'Preencha seus dados e entraremos em contato pelo WhatsApp para confirmar.'
                  }
                </p>
              </div>

              {isFull && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 text-xs text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Campeonato lotado — você entrará na lista de espera.</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nome completo</label>
                  <input
                    className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    required
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">WhatsApp</label>
                  <input
                    className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                    placeholder="(11) 99999-9999"
                    value={whats}
                    onChange={e => setWhats(e.target.value)}
                    required
                    type="tel"
                    maxLength={30}
                  />
                </div>

                {result && !result.ok && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {result.msg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ChevronRight className="w-4 h-4" />
                  }
                  {isFull ? 'Entrar na lista de espera' : 'Confirmar pré-inscrição'}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-surface-800 rounded-xl p-5 border border-surface-500 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-gray-500 mx-auto" />
              <p className="font-semibold text-gray-300">
                {ch.status === 'Cancelado'
                  ? 'Campeonato cancelado'
                  : ch.status === 'Finalizado'
                  ? 'Este campeonato já foi realizado'
                  : ch.status === 'EmAndamento'
                  ? 'Campeonato em andamento'
                  : 'Inscrições encerradas'
                }
              </p>
              <p className="text-sm text-gray-500">
                Acompanhe nossos campeonatos e fique de olho nos próximos!
              </p>
            </div>
          )
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 pt-2">
          SoftNerd — sua loja de cards favorita
        </p>
      </div>
    </div>
  )
}
