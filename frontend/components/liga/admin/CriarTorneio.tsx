'use client'
// Criar em um passo (Central da Liguinha), conforme a modalidade:
//   Liga       → cria, abre inscrições e já prepara o suíço (código + melhor de + tempo + lugares)
//   Campeonato → só inscrição e venda (vagas + taxa), sem formato nem rodadas por enquanto
// Depois cai na tela do evento, aba Jogadores.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, Swords, Trophy } from 'lucide-react'
import { championshipApi, torneioApi, Modalidade } from '@/lib/api'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import EscolherModalidade from './EscolherModalidade'
import EscolherEntrada from './EscolherEntrada'
import { hojeBrasil } from '@/lib/format'
import Janela from './Janela'

const JOGOS = ['Pokemon', 'One Piece', 'Magic', 'Yu-Gi-Oh', 'Lorcana', 'Digimon']

function mensagemDe(e: unknown, padrao: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? padrao
}

/** sugestoes: valores de entrada usados por último em cada modalidade (atalhos). */
export default function CriarTorneio({ onFechar, sugestoes }: { onFechar: () => void; sugestoes?: Record<Modalidade, number[]> }) {
  const router = useRouter()
  const hoje = hojeBrasil()
  const modalidades = useFuncionalidade('liga-modalidades') !== false
  const [modalidade, setModalidade] = useState<Modalidade>('Liga')
  const ehLiga = modalidade === 'Liga' || !modalidades
  const nomePadrao = (m: Modalidade) => `${m === 'Liga' ? 'Liguinha' : 'Campeonato'} ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`
  const [nome, setNome] = useState(nomePadrao('Liga'))
  const [data, setData] = useState(hoje)
  const [hora, setHora] = useState('14:00')
  const [jogo, setJogo] = useState('Pokemon')
  const [melhorDe, setMelhorDe] = useState(1)
  const [minutos, setMinutos] = useState(50)
  const [lugares, setLugares] = useState(24)
  const [vagas, setVagas] = useState('')
  const [centavos, setCentavos] = useState(0)
  const [salvando, setSalvando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { toast.error('Dê um nome.'); return }
    const maxVagas = vagas.trim() ? parseInt(vagas, 10) : null
    if (maxVagas !== null && (isNaN(maxVagas) || maxVagas < 2)) { toast.error('Vagas inválidas.'); return }
    setSalvando(true)
    try {
      // data/hora digitadas são de Brasília: o navegador da loja está nesse fuso
      const inicio = new Date(`${data}T${hora}:00`).toISOString()
      const { data: ch } = await championshipApi.create({
        name: nome.trim(), game: jogo, startDate: inicio, entryFeeInCents: centavos,
        modalidade: ehLiga ? 'Liga' : 'Campeonato', maxParticipants: ehLiga ? null : maxVagas,
      })
      await championshipApi.setStatus(ch.id, 'Inscricoes')
      if (ehLiga) await torneioApi.preparar(ch.id, { melhorDe, minutosRodada: minutos, lugares })
      toast.success(ehLiga ? 'Liguinha criada! Agora adicione os jogadores.' : 'Campeonato criado, inscrições abertas!')
      router.push(`/admin/liguinha/${ch.id}?aba=jogadores`)
    } catch (err) {
      toast.error(mensagemDe(err, 'Não deu pra criar.'))
      setSalvando(false)
    }
  }

  return (
    <Janela titulo={ehLiga ? 'Criar liguinha' : 'Criar campeonato'} icone={<Trophy className="w-5 h-5 text-accent-gold" />} onFechar={onFechar}>
      <form onSubmit={criar} className="space-y-4">
        {modalidades && (
          <EscolherModalidade valor={modalidade} onChange={m => {
            // troca o nome sugerido junto, se ainda não foi editado
            if (nome === nomePadrao(modalidade)) setNome(nomePadrao(m))
            setModalidade(m)
          }} />
        )}
        <label className="block text-sm">
          <span className="block text-xs font-semibold text-gray-400 mb-1.5">Nome</span>
          <input value={nome} onChange={e => setNome(e.target.value)} maxLength={200} className="input w-full" autoFocus />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-gray-400 mb-1.5">Dia</span>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="input w-full" />
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-gray-400 mb-1.5">Hora</span>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="input w-full" />
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-gray-400 mb-1.5">Jogo</span>
            <select value={jogo} onChange={e => setJogo(e.target.value)} className="input w-full">
              {JOGOS.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </label>
        </div>
        {ehLiga ? (
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Partida</span>
              <select value={melhorDe} onChange={e => setMelhorDe(Number(e.target.value))} className="input w-full">
                <option value={1}>Melhor de 1</option>
                <option value={3}>Melhor de 3</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Min. por rodada</span>
              <input type="number" min={5} max={180} value={minutos} onChange={e => setMinutos(Number(e.target.value))} className="input w-full" />
            </label>
            <label className="block text-sm">
              <span className="block text-xs font-semibold text-gray-400 mb-1.5">Lugares</span>
              <input type="number" min={2} max={400} value={lugares} onChange={e => setLugares(Number(e.target.value))} className="input w-full" />
            </label>
          </div>
        ) : (
          <label className="block text-sm max-w-[12rem]">
            <span className="block text-xs font-semibold text-gray-400 mb-1.5">Vagas</span>
            <input type="number" min={2} value={vagas} onChange={e => setVagas(e.target.value)} placeholder="Sem limite" className="input w-full" />
          </label>
        )}
        <div>
          <span className="block text-xs font-semibold text-gray-400 mb-1.5">
            Entrada {ehLiga ? 'desta etapa' : 'do campeonato'} <span className="font-normal text-gray-500">— grátis, o valor de sempre ou um valor a mais numa edição especial</span>
          </span>
          {/* key: troca de modalidade remonta com o estado certo de grátis/paga */}
          <EscolherEntrada key={modalidade} centavos={centavos} onChange={setCentavos}
            sugestoes={sugestoes?.[ehLiga ? 'Liga' : 'Campeonato'] ?? []} />
        </div>
        <p className="text-xs text-gray-400">
          {ehLiga
            ? 'Suíço: 3 pontos por vitória, 1 por empate, desempate pelo aproveitamento dos adversários. Ao encerrar, a colocação vai sozinha pra Liga Mensal (10/7/5/3/1).'
            : 'Campeonato: por enquanto é só inscrição e venda — conta os inscritos e quanto entrou. Não tem rodadas e não soma na Liga Mensal.'}
        </p>
        <button type="submit" disabled={salvando} className="btn-primary w-full justify-center py-3">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
          {ehLiga ? 'Criar e adicionar jogadores' : 'Criar e abrir inscrições'}
        </button>
      </form>
    </Janela>
  )
}
