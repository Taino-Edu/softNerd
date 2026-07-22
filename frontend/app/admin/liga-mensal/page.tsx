'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Medal, Award, Loader2, Layers, ChevronDown, Check, Swords, ExternalLink,
  Plus, Pencil, Trash2, X, PenLine,
} from 'lucide-react'
import {
  ligaMensalApi, championshipApi, LigaMensalDto, LigaMensalMesDto, Championship, ChampionshipParticipant,
  LigaMensalManualEntryDto,
} from '@/lib/api'

const MEDAL_COLOR = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-brand-400']

function brYearMonth(iso: string) {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(new Date(iso))
}

/** Mesma pontuação usada no backend: 1º=10, 2º=7, 3º=5, 4º=3, demais=1. */
function pontosPorColocacao(p: number) {
  return p === 1 ? 10 : p === 2 ? 7 : p === 3 ? 5 : p === 4 ? 3 : 1
}

function PlacementRow({ championshipId, p, onSaved }: {
  championshipId: string
  p: ChampionshipParticipant
  onSaved: () => void
}) {
  const [valor, setValor]   = useState(p.placement?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = valor !== (p.placement?.toString() ?? '')

  async function salvar() {
    const n = parseInt(valor, 10)
    if (!n || n <= 0) { toast.error('Colocação deve ser maior que zero.'); return }
    setSaving(true)
    try {
      await championshipApi.setPlacement(championshipId, p.id, n)
      toast.success(`${p.userName}: ${n}º lugar salvo.`)
      onSaved()
    } catch {
      toast.error('Erro ao salvar colocação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm text-gray-300 flex-1 min-w-0 truncate">{p.userName}</span>
      {p.deckName && <span className="text-xs text-gray-500 truncate max-w-[140px] hidden sm:inline">{p.deckName}</span>}
      <input
        type="number" min={1} placeholder="Pos."
        value={valor} onChange={e => setValor(e.target.value)}
        className="input w-16 text-center px-2 py-1 text-sm"
      />
      {valor && parseInt(valor, 10) > 0 && (
        <span className="text-xs font-bold text-brand-400 w-14 text-right">{pontosPorColocacao(parseInt(valor, 10))} pts</span>
      )}
      <button
        onClick={salvar}
        disabled={!dirty || saving}
        className="p-1.5 rounded-lg bg-brand-500/15 text-brand-400 hover:bg-brand-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Salvar colocação"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

function ChampionshipCard({ ch, onPlacementSaved }: { ch: Championship; onPlacementSaved: () => void }) {
  const [participants, setParticipants] = useState<ChampionshipParticipant[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    championshipApi.participants(ch.id).then(r => setParticipants(r.data)).catch(() => setParticipants([]))
  }, [ch.id])

  useEffect(() => { if (open && participants === null) load() }, [open, participants, load])

  return (
    <div className="card p-4">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{ch.name}</p>
          <p className="text-xs text-gray-500">{ch.game} · {new Date(ch.startDate).toLocaleDateString('pt-BR')} · {ch.participantCount ?? 0} participante{(ch.participantCount ?? 0) !== 1 ? 's' : ''}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-surface-500">
          {participants === null ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-brand-400 animate-spin" /></div>
          ) : participants.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">Sem participantes inscritos.</p>
          ) : (
            <div className="divide-y divide-surface-500/60">
              {participants.map(p => (
                <PlacementRow key={p.id} championshipId={ch.id} p={p}
                  onSaved={() => { load(); onPlacementSaved() }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ManualEntryModal({ ano, mes, entry, onClose, onSaved }: {
  ano: number
  mes: number
  entry: LigaMensalManualEntryDto | null
  onClose: () => void
  onSaved: () => void
}) {
  const [playerName, setPlayerName]   = useState(entry?.playerName ?? '')
  const [totalPoints, setTotalPoints] = useState(entry?.totalPoints?.toString() ?? '')
  const [decks, setDecks]             = useState(entry?.decks ?? '')
  const [observacao, setObservacao]   = useState(entry?.observacao ?? '')
  const [saving, setSaving]           = useState(false)

  async function salvar() {
    const nome = playerName.trim()
    const pontos = parseInt(totalPoints, 10)
    if (!nome) { toast.error('Digite o nome do jogador.'); return }
    if (isNaN(pontos)) { toast.error('Digite os pontos.'); return }

    setSaving(true)
    try {
      const body = { ano, mes, playerName: nome, totalPoints: pontos, decks: decks || undefined, observacao: observacao || undefined }
      if (entry) await ligaMensalApi.manualUpdate(entry.id, body)
      else await ligaMensalApi.manualCreate(body)
      toast.success(`${nome}: ${pontos} pts salvos.`)
      onSaved()
      onClose()
    } catch {
      toast.error('Erro ao salvar lançamento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white flex items-center gap-2">
            <PenLine className="w-4 h-4 text-brand-400" /> {entry ? 'Editar lançamento' : 'Lançamento manual'}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-300" /></button>
        </div>

        <div>
          <label className="label">Nome do jogador</label>
          <input className="input w-full" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Ex: Cabral" autoFocus />
        </div>
        <div>
          <label className="label">Pontos totais no mês</label>
          <input type="number" className="input w-full" value={totalPoints} onChange={e => setTotalPoints(e.target.value)} placeholder="Ex: 17" />
        </div>
        <div>
          <label className="label">Decks (opcional)</label>
          <input className="input w-full" value={decks} onChange={e => setDecks(e.target.value)} placeholder="Separados por vírgula" />
        </div>
        <div>
          <label className="label">Observação (opcional)</label>
          <textarea className="input w-full" rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: histórico anotado à mão antes do sistema" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminLigaMensalPage() {
  const [data, setData]   = useState<LigaMensalDto | null>(null)
  const [meses, setMeses] = useState<LigaMensalMesDto[]>([])
  const [championships, setChampionships] = useState<Championship[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState<string>('')
  const [manualEntries, setManualEntries] = useState<LigaMensalManualEntryDto[]>([])
  const [manualModal, setManualModal] = useState<{ entry: LigaMensalManualEntryDto | null } | null>(null)

  const carregarRanking = useCallback((sel: string) => {
    const [ano, mes] = sel ? sel.split('-').map(Number) : [undefined, undefined]
    return ligaMensalApi.ranking(ano, mes).then(r => {
      setData(r.data)
      if (!sel) setSelecionado(`${r.data.ano}-${r.data.mes}`)
    })
  }, [])

  useEffect(() => {
    ligaMensalApi.meses().then(r => setMeses(r.data)).catch(() => {})
    championshipApi.listAll().then(r => setChampionships(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    carregarRanking(selecionado).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado])

  const carregarManuais = useCallback(() => {
    if (!data) return
    ligaMensalApi.manualList(data.ano, data.mes).then(r => setManualEntries(r.data)).catch(() => setManualEntries([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ano, data?.mes])

  useEffect(() => { carregarManuais() }, [carregarManuais])

  async function excluirManual(entry: LigaMensalManualEntryDto) {
    if (!confirm(`Excluir o lançamento manual de ${entry.playerName} (${entry.totalPoints} pts)?`)) return
    try {
      await ligaMensalApi.manualDelete(entry.id)
      toast.success('Lançamento removido.')
      carregarManuais()
      carregarRanking(selecionado)
    } catch {
      toast.error('Erro ao remover lançamento.')
    }
  }

  const championshipsDoMes = data
    ? championships.filter(c => brYearMonth(c.startDate) === `${data.ano}-${String(data.mes).padStart(2, '0')}`)
    : []

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {manualModal && data && (
        <ManualEntryModal
          ano={data.ano} mes={data.mes} entry={manualModal.entry}
          onClose={() => setManualModal(null)}
          onSaved={() => { carregarManuais(); carregarRanking(selecionado) }}
        />
      )}

      <PageHeader
        title="Liga Mensal"
        subtitle={
          <>Pontos somados a partir da colocação dos campeonatos semanais. Público em <Link href="/liga" target="_blank" className="text-brand-400 hover:underline inline-flex items-center gap-1">/liga <ExternalLink className="w-3 h-3" /></Link></>
        }
        actions={meses.length > 0 && (
          <select
            value={selecionado}
            onChange={e => setSelecionado(e.target.value)}
            className="input w-full sm:w-56"
          >
            {!meses.some(m => `${m.ano}-${m.mes}` === selecionado) && data && (
              <option value={`${data.ano}-${data.mes}`}>{data.mesLabel}</option>
            )}
            {meses.map(m => (
              <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>{m.mesLabel}</option>
            ))}
          </select>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-brand-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Ranking */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Ranking · {data?.mesLabel}</p>
              {data && (
                <button
                  onClick={() => setManualModal({ entry: null })}
                  className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Lançamento manual
                </button>
              )}
            </div>
            {data && data.ranking.length === 0 ? (
              <div className="card p-6 text-center text-sm text-gray-500">Nenhuma pontuação registrada neste mês ainda.</div>
            ) : (
              <div className="space-y-2">
                {data?.ranking.map((r, i) => {
                  const isTop4 = i < 4
                  const MedalIcon = i < 3 ? Medal : (isTop4 ? Award : null)
                  return (
                    <div key={r.userId} className={`card p-3 flex items-center gap-3 ${isTop4 ? 'border-brand-500/40' : ''}`}>
                      <div className="w-7 flex-shrink-0 flex items-center justify-center">
                        {MedalIcon ? <MedalIcon className={`w-5 h-5 ${MEDAL_COLOR[i]}`} /> : <span className="text-sm font-bold text-gray-500">{i + 1}º</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{r.playerName}</p>
                        {r.decks.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 truncate">
                            <Layers className="w-3 h-3 flex-shrink-0" /><span className="truncate">{r.decks.join(', ')}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-black text-brand-400 leading-none">{r.totalPoints}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{r.eventsPlayed} evento{r.eventsPlayed !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Lançamentos manuais */}
          {manualEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" /> Lançamentos manuais do mês
              </p>
              <div className="card divide-y divide-surface-500/60 !p-0">
                {manualEntries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{entry.playerName}</p>
                      {entry.decks && <p className="text-xs text-gray-500 truncate">{entry.decks}</p>}
                      {entry.observacao && <p className="text-xs text-gray-500 truncate">{entry.observacao}</p>}
                    </div>
                    <span className="text-sm font-bold text-brand-400 flex-shrink-0">{entry.totalPoints} pts</span>
                    <button onClick={() => setManualModal({ entry })} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-surface-700 transition-colors flex-shrink-0" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => excluirManual(entry)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0" title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gerenciar colocações */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5" /> Campeonatos do mês — definir colocação
            </p>
            {championshipsDoMes.length === 0 ? (
              <div className="card p-6 text-center text-sm text-gray-500">
                Nenhum campeonato cadastrado neste mês. Crie em <Link href="/admin/campeonatos" className="text-brand-400 hover:underline">Campeonatos</Link>.
              </div>
            ) : (
              <div className="space-y-2">
                {championshipsDoMes.map(ch => (
                  <ChampionshipCard key={ch.id} ch={ch} onPlacementSaved={() => carregarRanking(selecionado)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
