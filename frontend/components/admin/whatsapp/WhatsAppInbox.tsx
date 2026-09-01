'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, BotOff, Check, CheckCheck, CircleUserRound, ExternalLink, Loader2, MessageCircle,
  PauseCircle, PlayCircle, QrCode, Search, Send, Sparkles, UserRound, WifiOff,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  WhatsAppConversation, WhatsAppMessage, WhatsAppStatus, whatsappAdminApi,
} from '@/lib/api'

interface Props {
  compact?: boolean
  initialPhone?: string | null
  onUnreadChange?: (count: number) => void
  /** Abre o QR. Sem isso o estado vazio só explica, não oferece a ação. */
  onConnect?: () => void
  /** Esconde a coluna de pontos/pedidos — usada na janela destacada, estreita demais para três colunas. */
  hideCustomerPanel?: boolean
  /** Ocupa a janela inteira em vez de descontar a altura do cabeçalho do admin. */
  fillWindow?: boolean
}

function PipelineStep({ done, label, hint }: { done: boolean; label: string; hint?: string }) {
  return (
    <li className="flex gap-3 text-left">
      <span className={clsx('mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0',
        done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}>
        {done ? <Check size={12} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0">
        <p className={clsx('text-sm', done ? 'text-gray-400' : 'text-white font-medium')}>{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
    </li>
  )
}

/**
 * Lista vazia tem três causas muito diferentes e o mesmo visual antes disso aqui:
 * número não conectado, fluxo do n8n desligado, ou realmente ninguém escreveu.
 * A do meio é a perigosa — a loja parece calma enquanto perde cliente.
 */
function InboxSetupState({ status, onConnect }: { status: WhatsAppStatus | null; onConnect?: () => void }) {
  const connected = !!status?.connected
  const everReceived = !!status?.lastInboundAt

  const { title, body } = !connected
    ? {
      title: 'Nenhum número conectado',
      body: 'Conecte o WhatsApp da loja para que as mensagens dos clientes cheguem nesta tela.',
    }
    : !everReceived
      ? {
        title: 'Conectado, mas nada chega aqui',
        body: 'O número está pareado, mas o sistema nunca recebeu uma mensagem. Enquanto o fluxo do n8n não estiver importado e ativo, quem escrever para a loja não é atendido nem registrado.',
      }
      : {
        title: 'Nenhuma conversa por enquanto',
        body: 'Tudo funcionando. Mensagens novas aparecem aqui sozinhas.',
      }

  return (
    <div className="h-full overflow-y-auto grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 grid place-items-center mx-auto mb-4">
          <MessageCircle size={26} />
        </div>
        <h2 className="text-lg font-semibold text-white text-center">{title}</h2>
        <p className="text-sm text-gray-400 text-center mt-2 leading-relaxed">{body}</p>

        <ul className="space-y-3 mt-6 rounded-2xl border border-surface-500 bg-surface-800 p-4">
          <PipelineStep done={!!status?.configured}
            label="Evolution API configurada"
            hint={status?.configured ? undefined : 'Falta preencher EVOLUTION_API_KEY no .env do servidor.'} />
          <PipelineStep done={connected}
            label="Número do WhatsApp pareado"
            hint={connected ? undefined : 'Use o botão Conectar número e leia o QR no celular da loja.'} />
          <PipelineStep done={everReceived}
            label="Fluxo do n8n entregando mensagens"
            hint={everReceived
              ? `Última mensagem recebida em ${new Date(status!.lastInboundAt!).toLocaleString('pt-BR')}.`
              : 'Importe o workflow e deixe ele ativo no n8n. Sem isso a Evolution recebe a mensagem e ela se perde.'} />
        </ul>

        <div className="flex flex-wrap gap-2 justify-center mt-5">
          {!connected && onConnect && (
            <button onClick={onConnect} className="btn-primary flex items-center gap-2 text-sm">
              <QrCode className="w-4 h-4" /> Conectar número
            </button>
          )}
          {connected && !everReceived && (
            <a href="/automacao/" target="_blank" rel="noreferrer"
              className="btn-primary flex items-center gap-2 text-sm">
              <ExternalLink className="w-4 h-4" /> Abrir o n8n
            </a>
          )}
        </div>

        <p className="text-[11px] text-gray-600 text-center mt-6 leading-relaxed">
          Esta tela não é o WhatsApp Web: ela não mostra o histórico do aparelho.
          Só aparecem aqui as conversas que chegarem a partir de agora.
        </p>
      </div>
    </div>
  )
}

function timeLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function WhatsAppInbox({
  compact = false, initialPhone, onUnreadChange, onConnect,
  hideCustomerPanel = false, fillWindow = false,
}: Props) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(initialPhone ?? null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => conversations.find(c => c.phone === selectedPhone) ?? null,
    [conversations, selectedPhone],
  )

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingList(true)
    try {
      const { data } = await whatsappAdminApi.conversations(search, unreadOnly)
      setConversations(data)
      onUnreadChange?.(data.reduce((sum, item) => sum + item.unreadCount, 0))
      if (!compact) setSelectedPhone(current => current ?? data[0]?.phone ?? null)
    } catch {
      if (!quiet) toast.error('Não consegui carregar as conversas do WhatsApp.')
    } finally {
      if (!quiet) setLoadingList(false)
    }
  }, [compact, onUnreadChange, search, unreadOnly])

  const loadMessages = useCallback(async (phone: string, quiet = false) => {
    if (!quiet) setLoadingMessages(true)
    try {
      const { data } = await whatsappAdminApi.messages(phone)
      setMessages(data)
      await whatsappAdminApi.markRead(phone)
    } catch {
      if (!quiet) toast.error('Não consegui carregar esta conversa.')
    } finally {
      if (!quiet) setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    whatsappAdminApi.status().then(r => setStatus(r.data)).catch(() =>
      setStatus({ configured: false, connected: false, state: 'unavailable' }))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => loadConversations(), 180)
    return () => window.clearTimeout(timer)
  }, [loadConversations])

  useEffect(() => {
    const timer = window.setInterval(() => loadConversations(true), 10_000)
    return () => window.clearInterval(timer)
  }, [loadConversations])

  useEffect(() => {
    if (!selectedPhone) { setMessages([]); return }
    loadMessages(selectedPhone)
    const timer = window.setInterval(() => loadMessages(selectedPhone, true), 8_000)
    return () => window.clearInterval(timer)
  }, [loadMessages, selectedPhone])

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages])

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!selectedPhone || !text || sending) return
    setSending(true)
    try {
      await whatsappAdminApi.send(selectedPhone, text)
      setDraft('')
      await Promise.all([loadMessages(selectedPhone, true), loadConversations(true)])
      toast.success('Mensagem enviada pelo WhatsApp.')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Não foi possível enviar a mensagem.')
    } finally { setSending(false) }
  }

  async function toggleMode() {
    if (!selected) return
    try {
      await whatsappAdminApi.setMode(selected.phone, selected.humanMode)
      await loadConversations(true)
      toast.success(selected.humanMode ? 'Bot reativado.' : 'Você assumiu a conversa por 4 horas.')
    } catch { toast.error('Não foi possível alterar o atendimento.') }
  }

  async function toggleBotDisabled() {
    if (!selected) return
    const next = !selected.botDisabled
    try {
      await whatsappAdminApi.setBotDisabled(selected.phone, next)
      await loadConversations(true)
      toast.success(next
        ? 'O bot não responde mais este contato. As mensagens continuam chegando aqui.'
        : 'O bot voltou a responder este contato.')
    } catch { toast.error('Não foi possível alterar o bot deste contato.') }
  }

  const showList = !compact || !selected
  const showChat = !compact || !!selected
  const filtering = search.trim() !== '' || unreadOnly
  // Busca sem resultado continua mostrando a lista: quem filtrou sabe por que está vazio.
  const showSetup = !loadingList && conversations.length === 0 && !filtering
  // A coluna de dados do cliente só existe quando há cliente. Antes ela ficava
  // reservada no grid e virava um bloco cinza morto na largura inteira.
  const showCustomerPanel = !compact && !hideCustomerPanel && !!selected

  const shell = clsx(
    'grid min-h-0 overflow-hidden bg-surface-800',
    compact && 'h-full rounded-xl grid-cols-1 border border-surface-500',
    !compact && (fillWindow
      ? 'h-full grid-cols-1'
      : 'h-[calc(100vh-142px)] min-h-[560px] rounded-2xl border border-surface-500'),
  )

  if (showSetup) {
    return (
      <div className={clsx(shell, 'grid-cols-1')}>
        <InboxSetupState status={status} onConnect={onConnect} />
      </div>
    )
  }

  return (
    <div className={clsx(
      shell,
      !compact && (showCustomerPanel
        ? 'lg:grid-cols-[320px_minmax(380px,1fr)_270px]'
        : 'lg:grid-cols-[320px_minmax(380px,1fr)]'),
    )}>
      {showList && (
        <aside className={clsx('min-h-0 flex flex-col bg-surface-900/70', !compact && 'border-r border-surface-500')}>
          <div className="p-3 border-b border-surface-500 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-300">Conversas</span>
              <span className={clsx('text-[10px] px-2 py-1 rounded-full flex items-center gap-1',
                status?.connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                {status?.connected ? <CheckCheck size={11} /> : <WifiOff size={11} />}
                {status?.connected ? 'Conectado' : 'Offline'}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input className="input pl-9 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Nome ou WhatsApp" />
            </div>
            <button onClick={() => setUnreadOnly(value => !value)}
              className={clsx('text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors',
                unreadOnly ? 'border-brand-500 text-brand-400 bg-brand-500/10' : 'border-surface-500 text-gray-500')}>
              Somente não lidas
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="h-32 grid place-items-center"><Loader2 className="animate-spin text-brand-400" /></div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />Nenhuma conversa ainda.
              </div>
            ) : conversations.map(conversation => (
              <button key={conversation.phone} onClick={() => setSelectedPhone(conversation.phone)}
                className={clsx('w-full text-left p-3 border-b border-surface-700 transition-colors flex gap-3',
                  selectedPhone === conversation.phone ? 'bg-brand-500/10' : 'hover:bg-surface-700/60')}>
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
                  <CircleUserRound size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{conversation.displayName}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">{timeLabel(conversation.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {conversation.botDisabled
                      ? <BotOff size={11} className="text-red-400 shrink-0" />
                      : conversation.humanMode
                        ? <UserRound size={11} className="text-amber-400 shrink-0" />
                        : <Bot size={11} className="text-brand-400 shrink-0" />}
                    <p className="text-xs text-gray-500 truncate">{conversation.lastMessage || 'Nova conversa'}</p>
                    {conversation.unreadCount > 0 && (
                      <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-emerald-500 text-[10px] text-black font-bold grid place-items-center">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

      {showChat && (
        <section className={clsx('min-h-0 flex flex-col bg-surface-900',
          !compact && showCustomerPanel && 'border-r border-surface-500')}>
          {selected ? (
            <>
              <header className="h-16 px-4 flex items-center gap-3 border-b border-surface-500 bg-surface-800/90 shrink-0">
                {compact && <button onClick={() => setSelectedPhone(null)} className="text-xs text-brand-400">Voltar</button>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{selected.displayName}</p>
                  <p className="text-[11px] text-gray-500">
                    +55 {selected.phone} · {selected.botDisabled
                      ? 'Bot desligado para este contato'
                      : selected.humanMode ? 'Maikon atendendo' : 'Bot atendendo'}
                  </p>
                </div>
                <button onClick={toggleBotDisabled}
                  title={selected.botDisabled
                    ? 'Deixar o bot responder este contato de novo'
                    : 'Nunca responder este contato automaticamente'}
                  className={clsx('p-2 rounded-xl border text-xs flex items-center gap-1.5',
                    selected.botDisabled ? 'border-red-500/40 text-red-400' : 'border-surface-500 text-gray-500')}>
                  <BotOff size={16} />
                  {!compact && (selected.botDisabled ? 'Bot desligado' : 'Silenciar bot')}
                </button>
                <button onClick={toggleMode} disabled={selected.botDisabled}
                  title={selected.botDisabled
                    ? 'O bot já está desligado para este contato'
                    : selected.humanMode ? 'Devolver ao bot' : 'Assumir conversa'}
                  className={clsx('p-2 rounded-xl border text-xs flex items-center gap-1.5 disabled:opacity-40',
                    selected.humanMode ? 'border-brand-500/40 text-brand-400' : 'border-amber-500/40 text-amber-400')}>
                  {selected.humanMode ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                  {!compact && (selected.humanMode ? 'Ativar bot' : 'Assumir')}
                </button>
              </header>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="h-full grid place-items-center"><Loader2 className="animate-spin text-emerald-400" /></div>
                ) : messages.map(message => (
                  <div key={message.id} className={clsx('flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm',
                      message.direction === 'outbound'
                        ? 'bg-emerald-700 text-white rounded-br-sm'
                        : 'bg-surface-700 text-gray-100 rounded-bl-sm')}>
                      <div className="flex items-center gap-1.5 text-[10px] mb-1 opacity-75">
                        {message.author === 'bot' ? <Bot size={11} /> : message.direction === 'outbound' ? <UserRound size={11} /> : null}
                        <span>{message.author === 'bot' ? 'BOT' : message.direction === 'outbound' ? message.author.toUpperCase() : 'CLIENTE'}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                      <p className="text-[9px] text-right mt-1 opacity-60">{timeLabel(message.sentAt)}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} className="p-3 border-t border-surface-500 bg-surface-800 flex gap-2 shrink-0">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} maxLength={2000}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
                  placeholder={status?.connected ? 'Responder como Maikon…' : 'Conecte o WhatsApp para responder'}
                  disabled={!status?.connected || sending}
                  className="input min-h-11 max-h-28 resize-y flex-1 text-sm" />
                <button disabled={!status?.connected || !draft.trim() || sending}
                  className="w-11 h-11 rounded-xl bg-emerald-500 text-black grid place-items-center disabled:opacity-40">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
            </>
          ) : (
            <div className="h-full grid place-items-center text-center p-8 text-gray-500">
              <div><MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Selecione uma conversa.</p></div>
            </div>
          )}
        </section>
      )}

      {showCustomerPanel && selected && (
        <aside className="hidden lg:flex min-h-0 flex-col p-4 overflow-y-auto bg-surface-800">
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center mx-auto mb-2"><CircleUserRound size={34} /></div>
              <p className="font-semibold text-white">{selected.displayName}</p>
              <p className="text-xs text-gray-500">+55 {selected.phone}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-800 border border-surface-500 p-3"><p className="text-[10px] text-gray-500">Pontos</p><p className="text-lg font-bold text-white">{selected.pointsBalance}</p></div>
              <div className="rounded-xl bg-surface-800 border border-surface-500 p-3"><p className="text-[10px] text-gray-500">Pedidos ativos</p><p className="text-lg font-bold text-white">{selected.activeReservations}</p></div>
            </div>
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
              <p className="text-xs font-semibold text-violet-300 flex items-center gap-1.5"><Sparkles size={13} /> Segurança da IA</p>
              <p className="text-[11px] text-gray-500 mt-1">Perguntas simples podem ser automáticas. Pix, reservas e pagamentos sempre consultam dados reais.</p>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
