'use client'

// =============================================================================
// /admin/liguinha/[id] — Torneio na Central da Liguinha (v1.56.0)
//
// Abas (como no Challonge): Painel (o painel do organizador de sempre —
// components/liga/PainelTorneio), Jogadores (adicionar por busca, por nome ou
// vários de uma vez), Rodadas (histórico de mesas) e Classificação.
// Etapa lançada de fora (formato Livre) mostra só a colocação gravada.
// Campeonato avulso (modalidade Campeonato): por enquanto só inscritos e vendas.
// Atualiza sozinho pelo /hubs/torneio.
// =============================================================================

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import clsx from 'clsx'
import { ArrowLeft, CircleDollarSign, ExternalLink, Loader2, Monitor, Users, Wallet, CheckCircle2 } from 'lucide-react'
import { Badge, BadgeTone } from '@/components/ui/Badge'
import {
  championshipApi, torneioApi, Championship, ChampionshipParticipant, PainelTorneioDto,
} from '@/lib/api'
import { useTorneioAoVivo } from '@/lib/useTorneioAoVivo'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import PainelTorneio from '@/components/liga/PainelTorneio'
import TabelaTorneio from '@/components/liga/TabelaTorneio'
import SpriteDeck from '@/components/liga/SpriteDeck'
import JogadoresTorneio from '@/components/liga/admin/JogadoresTorneio'
import HistoricoRodadas from '@/components/liga/admin/HistoricoRodadas'
import { dataBR, pontosPorColocacao } from '@/components/liga/admin/nomes'
import { brlDeCentavos } from '@/lib/format'
import Janela from '@/components/liga/admin/Janela'
import EscolherEntrada from '@/components/liga/admin/EscolherEntrada'
import toast from 'react-hot-toast'

type Aba = 'painel' | 'jogadores' | 'rodadas' | 'classificacao'

const STATUS: Record<string, { rotulo: string; tone: BadgeTone }> = {
  Planejado:   { rotulo: 'Rascunho',          tone: 'neutral' },
  Inscricoes:  { rotulo: 'Inscrições abertas', tone: 'info' },
  EmAndamento: { rotulo: 'Em andamento',      tone: 'warning' },
  Finalizado:  { rotulo: 'Encerrado',         tone: 'success' },
  Cancelado:   { rotulo: 'Cancelado',         tone: 'danger' },
}

export default function TorneioCentralPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-brand-400 animate-spin" /></div>}>
      <TorneioCentral />
    </Suspense>
  )
}

function TorneioCentral() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const params = useSearchParams()
  const [ch, setCh] = useState<Championship | null>(null)
  const [p, setP] = useState<PainelTorneioDto | null>(null)
  const [colocados, setColocados] = useState<ChampionshipParticipant[] | null>(null)
  const [erro, setErro] = useState('')
  const [mudandoPreco, setMudandoPreco] = useState(false)

  const recarregar = useCallback(() => {
    torneioApi.painel(id).then(r => { setP(r.data); setErro('') })
      .catch(e => setErro((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não deu pra carregar o torneio.'))
    championshipApi.listAll().then(r => setCh(r.data.find(c => c.id === id) ?? null)).catch(() => {})
  }, [id])
  useEffect(() => { recarregar() }, [recarregar])
  useTorneioAoVivo(id, recarregar)

  const suico = p?.formato === 'Suico'
  const modalidades = useFuncionalidade('liga-modalidades') !== false
  // Campeonato avulso não soma na Liga (com a chave ligada); sem saber ainda, trata como Liga
  const somaNaLiga = !modalidades || (ch?.modalidade ?? 'Liga') === 'Liga'
  // Campeonato avulso que não virou suíço: só inscrição e venda
  const avulso = !somaNaLiga && !suico
  const lancado = !!p && !suico && p.status === 'Finalizado' && !avulso

  // Etapa lançada de fora / campeonato comum encerrado: a colocação está no participante
  useEffect(() => {
    if (!lancado) return
    championshipApi.participants(id).then(r => setColocados(r.data)).catch(() => setColocados([]))
  }, [id, lancado])

  const abas: { a: Aba; rotulo: string }[] = avulso ? [{ a: 'jogadores', rotulo: 'Inscritos' }] : [
    ...(lancado ? [] : [{ a: 'painel' as Aba, rotulo: 'Painel' }]),
    { a: 'jogadores', rotulo: 'Jogadores' },
    ...(suico && (p?.rodadaAtual ?? 0) > 0 ? [{ a: 'rodadas' as Aba, rotulo: 'Rodadas' }] : []),
    { a: 'classificacao', rotulo: 'Classificação' },
  ]
  const pedida = params.get('aba') as Aba | null
  const aba: Aba = abas.some(x => x.a === pedida) ? pedida! : (avulso ? 'jogadores' : lancado ? 'classificacao' : 'painel')
  const irPara = (a: Aba) => router.replace(`/admin/liguinha/${id}?aba=${a}`, { scroll: false })

  if (!p) {
    return (
      <div className="flex justify-center py-16">
        {erro ? <p className="txt-erro">{erro}</p> : <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />}
      </div>
    )
  }

  const st = STATUS[p.status] ?? STATUS.Planejado

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="space-y-3">
        <Link href="/admin/liguinha" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Central da Liguinha
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-white truncate">{p.nome}</h1>
            <p className="text-sm text-gray-400">
              {ch ? `${dataBR(ch.startDate, { weekday: 'long', day: '2-digit', month: 'long' })} · ${ch.game} · ` : ''}
              {modalidades && ch ? (somaNaLiga ? 'Liguinha (soma na Liga Mensal) · ' : 'Campeonato (inscrição e venda, não soma na Liga)') : ''}
              {avulso ? '' : suico ? `Suíço · melhor de ${p.melhorDe} · ${p.minutosRodada} min` : lancado ? 'Etapa lançada (colocação final)' : 'Formato livre'}
            </p>
          </div>
          {ch && (
            <button onClick={() => setMudandoPreco(true)} disabled={p.status === 'Finalizado' || p.status === 'Cancelado'}
              className="btn-secondary text-sm" title="Preço da entrada deste evento">
              <CircleDollarSign className="w-4 h-4" /> {ch.entryFeeInCents > 0 ? `Entrada ${brlDeCentavos(ch.entryFeeInCents)}` : 'Entrada grátis'}
            </button>
          )}
          <Badge tone={st.tone}>{st.rotulo}</Badge>
          {suico && (
            <Link href={`/liga/torneio/${p.id}`} target="_blank" className="btn-secondary text-sm"><Monitor className="w-4 h-4" /> Telão</Link>
          )}
          <Link href="/admin/campeonatos" className="btn-secondary text-sm" title="Pagamentos, pré-inscrições e capa ficam na tela de Campeonatos">
            <ExternalLink className="w-4 h-4" /> Campeonatos
          </Link>
        </div>
        <div className="flex gap-1 border-b border-surface-500 overflow-x-auto" role="tablist">
          {abas.map(({ a, rotulo }) => (
            <button key={a} role="tab" aria-selected={aba === a} onClick={() => irPara(a)}
              className={clsx('px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px',
                aba === a ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white')}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {mudandoPreco && ch && (
        <MudarPreco ch={ch} inscritos={p.participantes.length} onFechar={() => setMudandoPreco(false)}
          onSalvo={() => { setMudandoPreco(false); recarregar() }} />
      )}
      {avulso && ch && <ResumoVendas id={id} taxaEmCentavos={ch.entryFeeInCents} vagas={ch.maxParticipants} versao={p.participantes.length} />}
      {aba === 'painel' && <PainelTorneio id={id} embutido somaNaLiga={somaNaLiga} />}
      {aba === 'jogadores' && <JogadoresTorneio p={p} pago={(ch?.entryFeeInCents ?? 0) > 0} onMudou={recarregar} inscricao={avulso} />}
      {aba === 'rodadas' && <HistoricoRodadas id={id} rodadaAtual={p.rodadaAtual} />}
      {aba === 'classificacao' && (
        lancado ? <Colocacao colocados={colocados} somaNaLiga={somaNaLiga} /> :
        p.classificacao.length > 0 ? <TabelaTorneio linhas={p.classificacao} grande /> :
        <p className="card text-sm text-gray-400">A classificação aparece depois da primeira rodada.</p>
      )}
    </div>
  )
}

/** Colocação gravada (etapa lançada de fora ou campeonato comum) com os pontos da Liga. */
function Colocacao({ colocados, somaNaLiga }: { colocados: ChampionshipParticipant[] | null; somaNaLiga: boolean }) {
  if (!colocados) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-400 animate-spin" /></div>
  const ordem = [...colocados].sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999))
  return (
    <section className="card">
      <h2 className="font-semibold text-white mb-3">Classificação final</h2>
      <div className="divide-y divide-surface-500">
        {ordem.map(x => (
          <div key={x.id} className="flex items-center gap-3 py-2">
            <span className="w-8 text-right font-bold text-gray-300">{x.placement ? `${x.placement}º` : '—'}</span>
            <span className="w-9 flex justify-center"><SpriteDeck deck={x.deckName} tamanho={32} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-white truncate">{x.userName}</span>
              {x.deckName && <span className="block text-xs text-gray-400 truncate">{x.deckName}</span>}
            </span>
            {x.placement && somaNaLiga && <span className="text-xs font-bold text-brand-400">+{pontosPorColocacao(x.placement)} pts na Liga</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Campeonato avulso: quantos se inscreveram, quantos pagaram e quanto entrou / falta entrar.
 *  Soma o valor da cobrança de cada um — o preço da entrada pode ter mudado depois das primeiras inscrições. */
function ResumoVendas({ id, taxaEmCentavos, vagas, versao }: { id: string; taxaEmCentavos: number; vagas: number | null; versao: number }) {
  const [inscritos, setInscritos] = useState<ChampionshipParticipant[] | null>(null)
  useEffect(() => {
    championshipApi.participants(id).then(r => setInscritos(r.data)).catch(() => setInscritos([]))
  }, [id, versao])
  if (!inscritos) return null
  // Sem cobrança: pago no balcão (vale o preço atual) ou inscrição grátis / vaga firme (zero)
  const valor = (x: ChampionshipParticipant) => x.valorInscricaoEmCentavos ?? (x.entryFeePaidAt ? taxaEmCentavos : 0)
  const pagos = inscritos.filter(x => x.entryFeePaidAt)
  const devendo = inscritos.filter(x => !x.entryFeePaidAt && x.inscricaoExpiraEm)
  const arrecadado = pagos.reduce((t, x) => t + valor(x), 0)
  const aReceber = devendo.reduce((t, x) => t + valor(x), 0)
  const pendentes = devendo.length
  const tiles = [
    { icone: <Users className="w-3.5 h-3.5" />, rotulo: 'Inscritos', valor: `${inscritos.length}${vagas ? ` / ${vagas}` : ''}`, detalhe: vagas ? `${Math.max(0, vagas - inscritos.length)} vagas sobrando` : 'sem limite de vagas' },
    { icone: <CheckCircle2 className="w-3.5 h-3.5" />, rotulo: 'Pagos', valor: String(pagos.length), detalhe: pendentes > 0 ? `${pendentes} a pagar` : taxaEmCentavos > 0 ? 'ninguém devendo' : 'inscrição grátis' },
    { icone: <CircleDollarSign className="w-3.5 h-3.5" />, rotulo: 'Arrecadado', valor: brlDeCentavos(arrecadado), detalhe: taxaEmCentavos > 0 ? `entrada atual ${brlDeCentavos(taxaEmCentavos)}` : '—' },
    { icone: <Wallet className="w-3.5 h-3.5" />, rotulo: 'A receber', valor: brlDeCentavos(aReceber), detalhe: pendentes > 0 ? 'inscrições não pagas' : 'nada pendente' },
  ]
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {tiles.map(t => (
        <div key={t.rotulo} className="card !p-4">
          <p className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">{t.icone}{t.rotulo}</p>
          <p className="text-2xl font-bold text-white mt-1">{t.valor}</p>
          <p className="text-xs text-gray-500 truncate">{t.detalhe}</p>
        </div>
      ))}
    </div>
  )
}

/** Preço da entrada deste evento (grátis, o de sempre ou um valor a mais numa edição especial). */
function MudarPreco({ ch, inscritos, onFechar, onSalvo }: { ch: Championship; inscritos: number; onFechar: () => void; onSalvo: () => void }) {
  const [centavos, setCentavos] = useState(ch.entryFeeInCents)
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    try {
      await championshipApi.update(ch.id, {
        name: ch.name, description: ch.description, game: ch.game, startDate: ch.startDate, endDate: ch.endDate,
        registrationDeadline: ch.registrationDeadline, maxParticipants: ch.maxParticipants, imageUrl: ch.imageUrl,
        minutosParaPagar: ch.minutosParaPagar, entryFeeInCents: centavos,
      })
      toast.success(centavos > 0 ? `Entrada agora é ${brlDeCentavos(centavos)}.` : 'Entrada agora é grátis.')
      onSalvo()
    } catch { toast.error('Não deu pra mudar o preço.'); setSalvando(false) }
  }
  return (
    <Janela titulo="Preço da entrada" icone={<CircleDollarSign className="w-5 h-5 text-brand-400" />} onFechar={onFechar}>
      <div className="space-y-4">
        <EscolherEntrada centavos={centavos} onChange={setCentavos} />
        {inscritos > 0 && (
          <p className="text-xs txt-alerta">Já tem {inscritos} inscrito{inscritos === 1 ? '' : 's'}: quem já está inscrito fica como estava; o preço novo vale pra quem entrar daqui pra frente.</p>
        )}
        <button onClick={salvar} disabled={salvando || centavos === ch.entryFeeInCents} className="btn-primary w-full justify-center">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Salvar preço
        </button>
      </div>
    </Janela>
  )
}
