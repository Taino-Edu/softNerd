'use client'
// "Lançar etapa de fora" (Central da Liguinha): etapa jogada no papel ou em outro app.
// 1) cola a classificação (um por linha, na ordem) → 2) confere quem já é cliente e quem
// vai ser cadastrado (dá pra ligar a outro cliente) → 3) lança: vira campeonato encerrado
// com colocação e soma na Liga Mensal (Services/Liga/EtapaExternaService.cs).
import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle2, ClipboardList, Link2, Loader2, UserPlus, X } from 'lucide-react'
import { torneioApi, EtapaExternaLinha, EtapaExternaRequest } from '@/lib/api'
import { hojeBrasil } from '@/lib/format'
import Janela from './Janela'
import EscolherCliente from './EscolherCliente'
import { lerLista } from './nomes'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function mensagemDe(e: unknown, padrao: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? padrao
}

/** Último sábado até hoje (a liguinha costuma ser no sábado). */
function ultimoSabado(hoje: string) {
  const d = new Date(`${hoje}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Escolha da tela por linha: cliente (id + nome), null = cadastrar novo; sem entrada = o servidor decide pelo nome. */
type Escolha = { id: string; nome: string } | null

export default function LancarEtapa({ onFechar, onLancada }: { onFechar: () => void; onLancada: () => void }) {
  const hoje = hojeBrasil()
  const [data, setData] = useState(ultimoSabado(hoje))
  const mes = MESES[Number(data.slice(5, 7)) - 1] ?? ''
  const [nome, setNome] = useState(`Liguinha ${mes.charAt(0).toUpperCase() + mes.slice(1)} — etapa de ${data.slice(8, 10)}/${data.slice(5, 7)}`)
  const [jogo, setJogo] = useState('Pokemon')
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<EtapaExternaLinha[] | null>(null)
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({})
  const [ligando, setLigando] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [lancadaId, setLancadaId] = useState<string | null>(null)

  const lista = lerLista(texto)

  function pedido(): EtapaExternaRequest {
    return {
      nome: nome.trim(), data, jogo,
      jogadores: lista.map((j, i) => {
        const escolhido = escolhas[i + 1]
        return { nome: j.nome, deck: j.deck, userId: escolhido?.id ?? null, novoCadastro: escolhido === null }
      }),
    }
  }

  async function conferir() {
    if (lista.length < 2) { toast.error('Cole pelo menos 2 jogadores, um por linha.'); return }
    setOcupado(true)
    try {
      const { data: r } = await torneioApi.simularEtapaExterna(pedido())
      setLinhas(r.linhas)
    } catch (e) {
      toast.error(mensagemDe(e, 'Não deu pra conferir a lista.'))
    } finally { setOcupado(false) }
  }

  async function lancar() {
    setOcupado(true)
    try {
      const { data: r } = await torneioApi.lancarEtapaExterna(pedido())
      toast.success(`Etapa lançada: ${r.linhas.length} jogadores na Liga.`)
      setLancadaId(r.championshipId ?? null)
      onLancada()
    } catch (e) {
      toast.error(mensagemDe(e, 'Não deu pra lançar a etapa.'))
    } finally { setOcupado(false) }
  }

  function escolher(posicao: number, e: Escolha) {
    setEscolhas(x => ({ ...x, [posicao]: e }))
    setLigando(null)
    // a conferência precisa rodar de novo com a escolha (pode virar "aparece duas vezes")
    setLinhas(ls => ls?.map(l => l.posicao === posicao
      ? { ...l, userId: e?.id ?? null, clienteNome: e?.nome ?? null, situacao: e ? 'existente' : 'novo' }
      : l) ?? null)
  }

  if (lancadaId) {
    return (
      <Janela titulo="Etapa lançada" icone={<CheckCircle2 className="w-5 h-5 txt-ok" />} onFechar={onFechar}>
        <p className="text-sm text-gray-300">
          A etapa entrou no histórico como torneio encerrado e as colocações já somam na Liga Mensal.
        </p>
        <div className="flex gap-2 mt-5">
          <Link href={`/admin/liguinha/${lancadaId}`} className="btn-primary flex-1 justify-center">Ver a etapa</Link>
          <button onClick={onFechar} className="btn-secondary flex-1 justify-center">Fechar</button>
        </div>
      </Janela>
    )
  }

  const novos = linhas?.filter(l => !l.userId).length ?? 0

  return (
    <Janela titulo="Lançar etapa de fora" icone={<ClipboardList className="w-5 h-5 text-brand-400" />} onFechar={onFechar} largura="max-w-2xl">
      {!linhas ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Pra etapa jogada no papel ou em outro app: cole a classificação final e ela entra no histórico e na Liga Mensal
            como se tivesse rodado aqui.
          </p>
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-gray-400 mb-1.5">Nome da etapa</span>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={200} className="input w-full" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Dia em que foi jogada</span>
              <input type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} className="input w-full" />
            </label>
            <label className="block text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Jogo</span>
              <input value={jogo} onChange={e => setJogo(e.target.value)} className="input w-full" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-gray-400 mb-1.5">
              Classificação — um jogador por linha, do 1º ao último (deck opcional depois de &quot; - &quot;)
            </span>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={10}
              placeholder={'Luan Patrick Camargo - Dragapult ex\nPedro Henrique Boni Justino\nCaique Santiago de Castro\n…'}
              className="input w-full font-mono text-sm" />
          </label>
          <p className="text-xs text-gray-500">{lista.length} jogador{lista.length === 1 ? '' : 'es'} na lista. Números na frente (&quot;1º&quot;, &quot;2.&quot;) são ignorados.</p>
          <button onClick={conferir} disabled={ocupado || lista.length < 2} className="btn-primary w-full justify-center py-3">
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Conferir antes de lançar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            <strong className="text-white">{nome}</strong> · {data.slice(8, 10)}/{data.slice(5, 7)}/{data.slice(0, 4)} ·{' '}
            {linhas.length} jogadores{novos > 0 ? ` · ${novos} cadastro${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'} (só com o nome)` : ''}
          </p>
          <div className="rounded-xl border border-surface-500 divide-y divide-surface-500">
            {linhas.map(l => (
              <div key={l.posicao} className="px-3 py-2 space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-7 text-right font-bold text-gray-400">{l.posicao}º</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-white truncate">{l.nome}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {l.situacao === 'existente' && <>Cliente: {l.clienteNome}</>}
                      {l.situacao === 'novo' && <>Cadastro novo, só com o nome</>}
                      {l.situacao === 'homonimos' && <span className="txt-alerta">Mais de um cliente com esse nome — escolha ou vira cadastro novo</span>}
                      {l.deck ? ` · ${l.deck}` : ''}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-brand-400 w-12 text-right">+{l.pontos} pts</span>
                  {l.userId ? (
                    <button onClick={() => escolher(l.posicao, null)} title="Não é esse cliente: cadastrar novo"
                      className="text-gray-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={() => setLigando(ligando === l.posicao ? null : l.posicao)} title="Ligar a um cliente que já existe"
                      className="text-gray-500 hover:text-white p-1"><Link2 className="w-4 h-4" /></button>
                  )}
                </div>
                {ligando === l.posicao && (
                  <div className="pl-10">
                    <EscolherCliente inicial={l.nome.split(' ')[0]} autoFocus
                      onEscolher={c => escolher(l.posicao, { id: c.id, nome: c.name })} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {linhas.some(l => l.situacao === 'homonimos') && (
            <p className="text-xs txt-alerta flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Nomes com mais de um cliente viram cadastro novo se você não escolher.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setLinhas(null)} disabled={ocupado} className="btn-secondary flex-1 justify-center">Voltar e editar</button>
            <button onClick={lancar} disabled={ocupado} className="btn-primary flex-1 justify-center">
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Lançar etapa
            </button>
          </div>
        </div>
      )}
    </Janela>
  )
}
