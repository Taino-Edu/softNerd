'use client'

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BrainCircuit, X, Send, Loader2, ChevronDown, Sparkles, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { usePreferences } from '@/hooks/usePreferences'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface AiAction {
  type: 'navigate' | 'openWizard'
  route?: string
}

const SUGGESTIONS = [
  'Quanto vendi hoje?',
  'Quem está devendo no crediário?',
  'Quais produtos estão com estoque baixo?',
  'Quais são os produtos mais vendidos?',
  'Quantas comandas estão abertas agora?',
  'Abre o estoque',
  'Abre a frente de caixa',
]

const BTN_SIZE = 52
const STORAGE_KEY = 'ai-btn-pos'

const CORNER_STYLES: Record<string, { bottom?: number | string; top?: number | string; left?: number | string; right?: number | string }> = {
  'bottom-right': { bottom: 20, right: 16 },
  'bottom-left':  { bottom: 20, left:  16 },
  'top-right':    { top:    16, right: 16 },
  'top-left':     { top:    16, left:  16 },
}

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
  interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    start(): void
    stop(): void
    onresult: ((e: SpeechRecognitionEvent) => void) | null
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string
  }
}

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = 'pt-BR'
  utt.rate = 1.05
  utt.pitch = 1
  // Prefere voz PT-BR se disponível
  const voices = window.speechSynthesis.getVoices()
  const ptVoice = voices.find(v => v.lang.startsWith('pt'))
  if (ptVoice) utt.voice = ptVoice
  window.speechSynthesis.speak(utt)
}

export default function AiChatWidget() {
  const router      = useRouter()
  const { prefs }   = usePreferences()
  const [open,      setOpen]      = useState(false)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [pos,       setPos]       = useState<{ x: number; y: number } | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceOn,   setVoiceOn]   = useState(false)
  const [hasSpeech, setHasSpeech] = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const posRef       = useRef({ x: 0, y: 0 })
  const isDragging   = useRef(false)
  const recognRef    = useRef<SpeechRecognition | null>(null)

  // Detecta suporte a speech
  useEffect(() => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    setHasSpeech(!!SR)
  }, [])

  // Posição salva
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number }
        posRef.current = p; setPos(p); return
      }
    } catch {}
    const p = { x: window.innerWidth - BTN_SIZE - 16, y: window.innerHeight - BTN_SIZE - 20 }
    posRef.current = p; setPos(p)
  }, [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // ── Drag ──────────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const startX = e.clientX, startY = e.clientY
    const origX  = posRef.current.x, origY = posRef.current.y
    isDragging.current = false

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!isDragging.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) isDragging.current = true
      if (isDragging.current) {
        const newX = Math.max(4, Math.min(window.innerWidth  - BTN_SIZE - 4, origX + dx))
        const newY = Math.max(4, Math.min(window.innerHeight - BTN_SIZE - 4, origY + dy))
        posRef.current = { x: newX, y: newY }; setPos({ x: newX, y: newY })
      }
    }
    function onUp() {
      if (isDragging.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(posRef.current))
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleClick() { if (!isDragging.current) setOpen(o => !o) }

  // ── Voice input ───────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    if (listening) {
      recognRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SR()
    rec.lang           = 'pt-BR'
    rec.continuous     = false
    rec.interimResults = false

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setInput(transcript)
      setListening(false)
      // Auto-envia após reconhecer
      setTimeout(() => sendText(transcript), 100)
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)

    rec.start()
    recognRef.current = rec
    setListening(true)
  }, [listening]) // eslint-disable-line

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const { data } = await aiApi.chat(text)
      const reply = data.success ? data.reply : (data.reply || 'Erro ao obter resposta.')
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])

      // Lê em voz alta se ativo
      if (voiceOn) speak(reply)

      // Executa action de navegação
      const action = data.action as AiAction | undefined
      if (action?.type === 'navigate' && action.route) {
        setTimeout(() => { router.push(action.route!); setOpen(false) }, 800)
      } else if (action?.type === 'openWizard') {
        setTimeout(() => {
          // Dispara evento customizado que a venda-avulsa escuta
          window.dispatchEvent(new CustomEvent('ai:openWizard'))
          router.push('/admin/venda-avulsa')
          setOpen(false)
        }, 800)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Não consegui conectar ao assistente. Tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }, [loading, voiceOn, router])

  async function send(text?: string) {
    await sendText(text ?? input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Painel
  const panelStyle = pos ? (() => {
    const panelW = 400, panelH = Math.min(window.innerHeight * 0.72, 520)
    const openTop = pos.y > panelH + 12
    const left = Math.max(8, Math.min(pos.x, window.innerWidth - panelW - 8))
    return openTop
      ? { left, bottom: window.innerHeight - pos.y + 12, top: 'auto'  }
      : { left, top:    pos.y + BTN_SIZE + 12,           bottom: 'auto' }
  })() : { bottom: 80, right: 16 }

  if (!prefs.aiButton.enabled) return null

  return (
    <>
      {/* ── Painel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed z-50 flex flex-col w-[340px] sm:w-[400px] rounded-2xl shadow-2xl overflow-hidden"
             style={{ ...panelStyle, background: '#111117', border: '1px solid #303040', maxHeight: '72vh' }}>

          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-3"
               style={{ background: 'linear-gradient(135deg, #1a1028 0%, #111117 100%)', borderBottom: '1px solid #303040' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                <BrainCircuit size={15} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Assistente IA</p>
                <p className="text-[10px] text-violet-400 leading-tight">Santuário Nerd · Gemini</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Toggle voz */}
              <button
                onClick={() => { setVoiceOn(v => !v); window.speechSynthesis?.cancel() }}
                title={voiceOn ? 'Desligar voz' : 'Ligar voz'}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ color: voiceOn ? '#a78bfa' : '#6b7280', background: voiceOn ? '#3b1f6a33' : 'transparent' }}>
                {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button onClick={() => setOpen(false)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                      aria-label="Fechar">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 0 }}>
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="flex flex-col items-center pt-2 pb-1">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
                       style={{ background: 'linear-gradient(135deg, #7c3aed33, #6d28d933)', border: '1px solid #7c3aed44' }}>
                    <Sparkles size={22} className="text-violet-400" />
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    Pergunte sobre vendas, estoque,<br />crediários ou navegue pelo sistema
                  </p>
                  {hasSpeech && (
                    <p className="text-[10px] text-violet-500 mt-1">
                      🎤 Fale com o assistente usando o microfone
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)}
                            className="w-full text-left text-xs px-3 py-2.5 rounded-xl text-violet-200 hover:text-white hover:border-violet-500/50 transition-all"
                            style={{ background: '#1a1a2e', border: '1px solid #4c2d8a' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                     style={m.role === 'user'
                       ? { background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                       : { background: '#1a1a26', color: '#e5e7eb', border: '1px solid #2d2d40', borderRadius: '16px 16px 16px 4px' }
                     }>
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl flex items-center gap-2"
                     style={{ background: '#1a1a26', border: '1px solid #2d2d40', borderRadius: '16px 16px 16px 4px' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3" style={{ borderTop: '1px solid #303040', background: '#111117' }}>
            <div className="flex items-end gap-2 rounded-xl p-1"
                 style={{ background: '#252538', border: `1px solid ${listening ? '#ef4444' : '#6d28d9'}` }}>

              {/* Microfone */}
              {hasSpeech && (
                <button
                  onClick={toggleMic}
                  disabled={loading}
                  title={listening ? 'Parar gravação' : 'Falar com o assistente'}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all mb-0.5 disabled:opacity-30"
                  style={{
                    background: listening ? 'rgba(239,68,68,0.2)' : 'transparent',
                    color: listening ? '#ef4444' : '#7c3aed',
                    animation: listening ? 'pulse 1s infinite' : 'none',
                  }}>
                  {listening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}

              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={listening ? 'Ouvindo...' : 'Pergunte algo ou diga "abre o estoque"…'}
                rows={1}
                disabled={loading || listening}
                className="flex-1 resize-none bg-transparent text-sm text-violet-200 placeholder-gray-500 px-2 py-1.5 outline-none disabled:opacity-50"
                style={{ maxHeight: '80px', lineHeight: '1.5' }}
              />

              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 hover:opacity-90 active:scale-95 mb-0.5"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                aria-label="Enviar">
                {loading ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-white" />}
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5 text-center">
              Enter para enviar · Shift+Enter nova linha{hasSpeech ? ' · 🎤 microfone' : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Botão flutuante ─────────────────────────────────────────────────── */}
      {prefs.aiButton.mode === 'fixed' ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-colors hover:brightness-110 active:brightness-90"
          style={{
            ...CORNER_STYLES[prefs.aiButton.corner] ?? CORNER_STYLES['bottom-right'],
            width: BTN_SIZE, height: BTN_SIZE,
            background: open ? '#4c1d95' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            boxShadow: `0 4px 24px rgba(109, 40, 217, ${listening ? 0.9 : 0.6})`,
          }}
          aria-label={open ? 'Fechar assistente IA' : 'Abrir assistente IA'}>
          {listening
            ? <Mic size={22} className="text-red-400 animate-pulse" />
            : open
              ? <ChevronDown size={22} className="text-white" />
              : <BrainCircuit size={22} className="text-white" />
          }
        </button>
      ) : pos ? (
        <button
          onPointerDown={onPointerDown}
          onClick={handleClick}
          className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-colors hover:brightness-110 active:brightness-90 touch-none select-none"
          style={{
            left: pos.x, top: pos.y,
            width: BTN_SIZE, height: BTN_SIZE,
            background: open ? '#4c1d95' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            boxShadow: `0 4px 24px rgba(109, 40, 217, ${listening ? 0.9 : 0.6})`,
            cursor: 'grab',
          }}
          aria-label={open ? 'Fechar assistente IA' : 'Abrir assistente IA'}
          title="Assistente IA — arraste para reposicionar">
          {listening
            ? <Mic size={22} className="text-red-400 animate-pulse" />
            : open
              ? <ChevronDown size={22} className="text-white" />
              : <BrainCircuit size={22} className="text-white" />
          }
        </button>
      ) : null}
    </>
  )
}
