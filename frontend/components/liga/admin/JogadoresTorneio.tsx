'use client'
// Aba "Jogadores" da Central da Liguinha — como no Challonge: adiciona pela busca, por nome
// (quem não tem cadastro vira cliente de balcão só com o nome, igual ao caixa) ou vários de
// uma vez colando a lista. Quem chega na hora já entra presente (check-in).
// Cliente com conta: dá pra escolher um dos decks salvos em "Meus decks" (v1.59.0) — o mesmo
// deck que ele escolheria entrando pelo código; o servidor confere que o deck é dele.
import { useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layers, ListPlus, Loader2, Trash2, UserPlus, X } from 'lucide-react'
import { championshipApi, deckApi, torneioApi, userApi, DeckDto, PainelTorneioDto } from '@/lib/api'
import { Switch } from '@/components/ui/Switch'
import SpriteDeck from '@/components/liga/SpriteDeck'
import EscolherCliente from './EscolherCliente'
import { lerLista, normalizarNome } from './nomes'

function mensagemDe(e: unknown, padrao: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? padrao
}

/** inscricao: campeonato avulso (só inscrição e venda) — ninguém entra presente sozinho e o título vira "Inscritos". */
/** jogo: os decks salvos desse jogo aparecem primeiro na escolha. */
export default function JogadoresTorneio({ p, pago, onMudou, inscricao = false, jogo }: { p: PainelTorneioDto; pago: boolean; onMudou: () => void; inscricao?: boolean; jogo?: string }) {
  const encerrado = p.status === 'Finalizado' || p.status === 'Cancelado'
  const [modo, setModo] = useState<'um' | 'varios'>('um')
  const [deck, setDeck] = useState('')
  // Liguinha paga: quem entra pelo painel recebe a cobrança e só joga depois de pagar — não entra presente sozinho
  const [presente, setPresente] = useState(!inscricao && !pago)
  const [novoNome, setNovoNome] = useState('')
  const [novoZap, setNovoZap] = useState('')
  const [lista, setLista] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Cliente escolhido na busca, esperando a escolha do deck
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null)
  const [decksDele, setDecksDele] = useState<DeckDto[] | null>(null)
  const [deckId, setDeckId] = useState('')   // '' = digitar o nome
  const [deckTexto, setDeckTexto] = useState('')

  async function inscrever(userId: string, deckNome: string | null, idDoDeck?: string) {
    const { data: part } = await championshipApi.adminRegister(p.id, userId, deckNome || undefined, idDoDeck || undefined)
    if (presente) await torneioApi.checkIn(p.id, part.id, true)
  }

  function escolher(c: { id: string; name: string }) {
    setEscolhido({ id: c.id, nome: c.name })
    setDecksDele(null); setDeckId(''); setDeckTexto('')
    deckApi.getByUser(c.id)
      .then(r => {
        // os do jogo do torneio primeiro, depois os mais recentes
        const doJogo = (d: DeckDto) => (jogo && d.game?.toLowerCase() === jogo.toLowerCase() ? 0 : 1)
        const ordem = [...r.data].sort((a, b) => doJogo(a) - doJogo(b) || b.updatedAt.localeCompare(a.updatedAt))
        setDecksDele(ordem)
        if (ordem.length > 0 && doJogo(ordem[0]) === 0) setDeckId(ordem[0].id)
      })
      .catch(() => setDecksDele([]))
  }

  async function adicionarEscolhido() {
    if (!escolhido) return
    setOcupado('um')
    try {
      await inscrever(escolhido.id, deckId ? null : deckTexto.trim() || null, deckId || undefined)
      toast.success(`${escolhido.nome} entrou no torneio.`)
      setEscolhido(null); setDecksDele(null)
      onMudou()
    } catch (e) { toast.error(mensagemDe(e, `Não deu pra adicionar ${escolhido.nome}.`)) }
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
              <div>
                <span className="block text-xs font-semibold text-gray-400 mb-1.5">Cliente da loja</span>
                {!escolhido ? (
                  <EscolherCliente onEscolher={escolher} />
                ) : (
                  <div className="rounded-xl border border-surface-400 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{escolhido.nome}</span>
                      <button type="button" onClick={() => setEscolhido(null)} title="Escolher outro cliente"
                        className="text-gray-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="text-sm">
                      <span className="mb-1.5 text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> Deck
                      </span>
                      {decksDele === null ? (
                        <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-2">
                          {deckId && <span className="w-9 flex justify-center shrink-0"><SpriteDeck deck={decksDele.find(d => d.id === deckId)?.name} tamanho={32} /></span>}
                          <select value={deckId} onChange={e => setDeckId(e.target.value)} className="input w-full" aria-label="Deck do jogador">
                            {decksDele.map(d => <option key={d.id} value={d.id}>{d.name}{d.game ? ` · ${d.game}` : ''}</option>)}
                            <option value="">{decksDele.length ? 'Outro deck (digitar)' : 'Sem deck salvo (digitar)'}</option>
                          </select>
                        </span>
                      )}
                    </div>
                    {deckId === '' && decksDele !== null && (
                      <input value={deckTexto} onChange={e => setDeckTexto(e.target.value)} maxLength={200}
                        placeholder="Nome do deck (opcional)" className="input w-full" aria-label="Nome do deck" />
                    )}
                    <button type="button" onClick={adicionarEscolhido} disabled={ocupado !== null || decksDele === null} className="btn-primary w-full justify-center">
                      {ocupado === 'um' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Adicionar {escolhido.nome.split(' ')[0]}
                    </button>
                  </div>
                )}
              </div>
              <form onSubmit={adicionarNovo} className="rounded-xl border border-dashed border-surface-400 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-400">Não tem cadastro? Entra só com o nome</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={novoNome} onChange={e => setNovoNome(e.target.value)} maxLength={150} placeholder="Nome do jogador" className="input flex-1" />
                  <input value={novoZap} onChange={e => setNovoZap(e.target.value)} inputMode="tel" placeholder="WhatsApp (opcional)" className="input sm:w-44" />
                </div>
                <input value={deck} onChange={e => setDeck(e.target.value)} maxLength={200} placeholder="Deck (opcional)" className="input w-full" aria-label="Deck do jogador novo" />
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
          {pago && <p className="text-xs txt-alerta">Inscrição paga: cada jogador adicionado recebe a cobrança Pix e só entra no pareamento depois de pagar (ou quando você marcar o pagamento no balcão).</p>}
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
