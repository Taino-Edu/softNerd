'use client'
// Aba "Jogadores" da Central da Liguinha — como no Challonge: adiciona pela busca, por nome
// (quem não tem cadastro vira cliente de balcão só com o nome, igual ao caixa) ou vários de
// uma vez colando a lista. Quem chega na hora já entra presente (check-in).
import { useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { ListPlus, Loader2, Trash2, UserPlus } from 'lucide-react'
import { championshipApi, torneioApi, userApi, PainelTorneioDto } from '@/lib/api'
import { Switch } from '@/components/ui/Switch'
import SpriteDeck from '@/components/liga/SpriteDeck'
import EscolherCliente from './EscolherCliente'
import { lerLista, normalizarNome } from './nomes'

function mensagemDe(e: unknown, padrao: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? padrao
}

/** inscricao: campeonato avulso (só inscrição e venda) — ninguém entra presente sozinho e o título vira "Inscritos". */
export default function JogadoresTorneio({ p, pago, onMudou, inscricao = false }: { p: PainelTorneioDto; pago: boolean; onMudou: () => void; inscricao?: boolean }) {
  const encerrado = p.status === 'Finalizado' || p.status === 'Cancelado'
  const [modo, setModo] = useState<'um' | 'varios'>('um')
  const [deck, setDeck] = useState('')
  const [presente, setPresente] = useState(!inscricao)
  const [novoNome, setNovoNome] = useState('')
  const [novoZap, setNovoZap] = useState('')
  const [lista, setLista] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function inscrever(userId: string, deckNome: string | null) {
    const { data: part } = await championshipApi.adminRegister(p.id, userId, deckNome || undefined)
    if (presente) await torneioApi.checkIn(p.id, part.id, true)
  }

  async function adicionarCliente(userId: string, nome: string) {
    setOcupado('um')
    try {
      await inscrever(userId, deck.trim() || null)
      toast.success(`${nome} entrou no torneio.`)
      setDeck('')
      onMudou()
    } catch (e) { toast.error(mensagemDe(e, `Não deu pra adicionar ${nome}.`)) }
    finally { setOcupado(null) }
  }

  async function adicionarNovo(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoNome.trim()
    if (!nome) return
    setOcupado('novo')
    try {
      const { data: u } = await userApi.adminCreate({ name: nome, whatsApp: novoZap.replace(/\D/g, '') || undefined })
      await inscrever(u.id, deck.trim() || null)
      toast.success(`${nome} cadastrado e no torneio.`)
      setNovoNome(''); setNovoZap(''); setDeck('')
      onMudou()
    } catch (err) { toast.error(mensagemDe(err, `Não deu pra cadastrar ${nome}.`)) }
    finally { setOcupado(null) }
  }

  async function adicionarVarios() {
    const jogadores = lerLista(lista)
    if (jogadores.length === 0) return
    setOcupado('varios')
    let ok = 0, novos = 0
    const falhas: string[] = []
    for (const j of jogadores) {
      try {
        // mesmo nome de exatamente 1 cliente → ele; senão cadastro novo só com o nome
        const { data: achados } = await userApi.list(j.nome, 'Customer')
        const iguais = achados.filter(c => normalizarNome(c.name) === normalizarNome(j.nome))
        let userId = iguais.length === 1 ? iguais[0].id : null
        if (!userId) { userId = (await userApi.adminCreate({ name: j.nome })).data.id; novos++ }
        await inscrever(userId, j.deck)
        ok++
      } catch (e) { falhas.push(`${j.nome}: ${mensagemDe(e, 'erro')}`) }
    }
    setOcupado(null)
    onMudou()
    if (ok) toast.success(`${ok} jogador${ok === 1 ? '' : 'es'} adicionado${ok === 1 ? '' : 's'}${novos ? ` (${novos} cadastro${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'})` : ''}.`)
    if (falhas.length) { toast.error(falhas.slice(0, 3).join('\n'), { duration: 8000 }); setLista(falhas.map(f => f.split(':')[0]).join('\n')) }
    else setLista('')
  }

  async function acao(chave: string, fn: () => Promise<unknown>) {
    setOcupado(chave)
    try { await fn(); onMudou() }
    catch (e) { toast.error(mensagemDe(e, 'Não deu certo.')) }
    finally { setOcupado(null) }
  }

  const presentes = p.participantes.filter(x => x.checkInEm && !x.desistiuNaRodada).length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] items-start">
      {!encerrado && (
        <section className="card space-y-4">
          <div className="flex gap-2">
            {(['um', 'varios'] as const).map(m => (
              <button key={m} onClick={() => setModo(m)}
                className={clsx('text-sm px-3 py-1.5 rounded-lg', modo === m ? 'btn-primary' : 'btn-secondary')}>
                {m === 'um' ? 'Adicionar jogador' : 'Vários de uma vez'}
              </button>
            ))}
          </div>

          {modo === 'um' ? (
            <>
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-gray-400 mb-1.5">Deck (opcional)</span>
                <input value={deck} onChange={e => setDeck(e.target.value)} maxLength={200} placeholder="Ex.: Dragapult ex" className="input w-full" />
              </label>
              <div>
                <span className="block text-xs font-semibold text-gray-400 mb-1.5">Cliente da loja</span>
                <EscolherCliente onEscolher={c => adicionarCliente(c.id, c.name)} />
              </div>
              <form onSubmit={adicionarNovo} className="rounded-xl border border-dashed border-surface-400 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-400">Não tem cadastro? Entra só com o nome</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={novoNome} onChange={e => setNovoNome(e.target.value)} maxLength={150} placeholder="Nome do jogador" className="input flex-1" />
                  <input value={novoZap} onChange={e => setNovoZap(e.target.value)} inputMode="tel" placeholder="WhatsApp (opcional)" className="input sm:w-44" />
                </div>
                <button type="submit" disabled={!novoNome.trim() || ocupado !== null} className="btn-secondary text-sm w-full justify-center">
                  {ocupado === 'novo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Cadastrar e adicionar
                </button>
              </form>
            </>
          ) : (
            <>
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-gray-400 mb-1.5">Um jogador por linha (deck opcional depois de &quot; - &quot;)</span>
                <textarea value={lista} onChange={e => setLista(e.target.value)} rows={9}
                  placeholder={'Ana Souza - Gardevoir ex\nBruno Lima\nCarla Dias - Dragapult ex'} className="input w-full font-mono text-sm" />
              </label>
              <p className="text-xs text-gray-500">
                Quem tem exatamente o mesmo nome de um cliente entra com o cadastro dele; os outros viram cadastro novo só com o nome.
              </p>
              <button onClick={adicionarVarios} disabled={ocupado !== null || lerLista(lista).length === 0} className="btn-primary w-full justify-center">
                {ocupado === 'varios' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                Adicionar {lerLista(lista).length || ''} jogador{lerLista(lista).length === 1 ? '' : 'es'}
              </button>
            </>
          )}

          <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
            Já entra presente (check-in)
            <Switch ligado={presente} onChange={setPresente} label="Já entra presente" />
          </label>
          {pago && <p className="text-xs txt-alerta">Torneio com inscrição paga: cada jogador adicionado recebe a cobrança Pix.</p>}
        </section>
      )}

      <section className={clsx('card', encerrado && 'lg:col-span-2')}>
        <h2 className="font-semibold text-white mb-3">
          {inscricao ? 'Inscritos' : 'Jogadores'} <span className="text-sm font-normal text-gray-400">({inscricao ? `${p.participantes.length} inscritos · ${presentes} presentes` : `${presentes} presentes de ${p.participantes.length}`})</span>
        </h2>
        {p.participantes.length === 0 ? (
          <p className="text-sm text-gray-400">Ninguém ainda. Adicione ao lado ou passe o código pros jogadores entrarem pelo celular.</p>
        ) : (
          <div className="divide-y divide-surface-500">
            {p.participantes.map(x => (
              <div key={x.id} className="flex items-center gap-3 py-2">
                <span className="w-7 text-xs text-gray-500">#{x.playerNumber}</span>
                <span className="w-9 flex justify-center"><SpriteDeck deck={x.deck} tamanho={32} /></span>
                <span className="flex-1 min-w-0">
                  <span className={clsx('block text-sm truncate', x.desistiuNaRodada ? 'text-gray-500 line-through' : 'text-white')}>{x.nome}</span>
                  <span className="block text-xs text-gray-400 truncate">
                    {x.deck ?? 'sem deck'}{!x.pago ? ' · não pago' : ''}{x.desistiuNaRodada ? ` · saiu na rodada ${x.desistiuNaRodada}` : ''}
                  </span>
                </span>
                {!encerrado && !x.desistiuNaRodada && (
                  <Switch ligado={!!x.checkInEm} label={`Presença de ${x.nome}`} disabled={ocupado !== null}
                    onChange={v => acao(`c${x.id}`, () => torneioApi.checkIn(p.id, x.id, v))} />
                )}
                {!encerrado && p.rodadaAtual === 0 && (
                  <button title={`Tirar ${x.nome} do torneio`} disabled={ocupado !== null}
                    onClick={() => confirm(`Tirar ${x.nome} do torneio?`) && acao(`r${x.id}`, () => championshipApi.removeParticipant(p.id, x.id))}
                    className="text-gray-500 hover:text-white p-1"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
