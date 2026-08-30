'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi, comandaApi } from '@/lib/api'
import { saveAuth, isLoggedIn } from '@/lib/auth'
import toast, { Toaster } from 'react-hot-toast'
import {
  User, Hash, MessageCircle, Loader2,
  X, Shield, ChevronRight, ArrowLeft, Receipt
} from 'lucide-react'

const STORAGE_KEY = 'mesa-last-user'

interface SavedUser {
  name: string
  cpf: string | null
  whatsApp: string
  displayCpf: string
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-[#3EC2F2]" />
            <h2 className="text-gray-900 font-bold text-sm">Privacidade & Dados</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto text-sm text-gray-500 space-y-4 leading-relaxed">
          <p><strong className="text-gray-900">Santuário Nerd — Política de Privacidade</strong></p>
          <p>Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), informamos como tratamos seus dados.</p>
          <div className="space-y-3">
            <div className="bg-blue-50 p-4 rounded-2xl">
              <p className="font-bold text-gray-800 text-[11px] uppercase mb-1">Dados coletados</p>
              <p>Nome completo, CPF e número de WhatsApp.</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl">
              <p className="font-bold text-gray-800 text-[11px] uppercase mb-1">Finalidade</p>
              <p>Identificação do cliente para abertura de comanda e registro de pontos de fidelidade.</p>
            </div>
          </div>
          <p><strong className="text-gray-900">Seus direitos:</strong> Acesso, correção ou exclusão a qualquer momento pelo painel do cliente.</p>
          <p className="text-[10px] text-gray-400 italic">Responsável: Santuário Nerd — José Bonifácio, SP.</p>
        </div>
        <div className="p-5 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-4 font-black text-gray-900 rounded-2xl hover:opacity-90 active:scale-95 transition-all shadow-md"
            style={{ background: 'linear-gradient(135deg, #FFE45E, #F5C518)' }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MesaPage() {
  const params  = useParams()
  const router  = useRouter()
  const mesa    = decodeURIComponent(params.mesa as string)

  const [step, setStep]             = useState<'quick' | 'form' | 'loading'>('form')
  const [savedUser, setSavedUser]   = useState<SavedUser | null>(null)
  const [name, setName]             = useState('')
  const [cpf, setCpf]               = useState('')
  const [whatsApp, setWhatsApp]     = useState('')
  const [consent, setConsent]       = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  /** Já tem comanda aberta nesta conta: dá pra ir direto, sem reidentificar. */
  const [temComandaAberta, setTemComandaAberta] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const user: SavedUser = JSON.parse(raw)
        if (user.name && user.whatsApp) {
          setSavedUser(user)
          setStep('quick')
        }
      }
    } catch {}
  }, [])

  // Quem já está logado e com comanda aberta não precisa passar pelo formulário
  // de novo — abrir outra comanda pela mesa seria repetir o que já existe.
  useEffect(() => {
    if (!isLoggedIn()) return
    comandaApi.myComanda()
      .then(() => setTemComandaAberta(true))
      .catch(() => setTemComandaAberta(false))
  }, [])

  function formatCpf(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11)
    setCpf(digits)
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  function formatPhone(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 13)
    setWhatsApp(digits)
    return digits
  }

  function maskCpf(cpf: string) {
    const d = cpf.replace(/\D/g, '')
    if (d.length !== 11) return cpf
    return `***.***.${d.slice(6, 9)}-${d.slice(9)}`
  }

  async function handleLogin(isQuick = false) {
    const requestCpfRaw   = isQuick ? savedUser!.cpf : cpf.replace(/\D/g, '')
    const requestCpf      = requestCpfRaw || null  // null quando não informado
    const requestName     = isQuick ? savedUser!.name : name
    const requestWhatsApp = isQuick ? savedUser!.whatsApp : whatsApp

    if (!isQuick && !consent) {
      toast.error('Você precisa aceitar os termos de privacidade.')
      return
    }

    setStep('loading')
    try {
      const { data } = await authApi.quickLogin(requestName, requestCpf, requestWhatsApp, mesa)
      saveAuth(data)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        name: requestName, cpf: requestCpf, whatsApp: requestWhatsApp,
        displayCpf: requestCpf ? maskCpf(requestCpf) : ''
      }))
      toast.success('Entrada autorizada! Boas compras.', { icon: '🏰' })
      setTimeout(() => router.push('/cliente'), 800)
    } catch (err: any) {
      setStep(isQuick ? 'quick' : 'form')
      toast.error(err.response?.data?.message || 'Erro ao realizar login rápido.')
    }
  }

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, #3EC2F2 0%, #1A6DB5 60%, #1352A2 100%)' }}>

      <Toaster position="top-center" toastOptions={{ style: { background: '#fff', color: '#1a1a2e', border: '1px solid #e5e7eb' } }} />

      {/* Nuvens decorativas */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
        <div className="absolute top-6 left-2 w-24 h-8 bg-white/25 rounded-full blur-md" />
        <div className="absolute top-10 left-14 w-36 h-6 bg-white/20 rounded-full blur-md" />
        <div className="absolute top-5 right-6 w-28 h-8 bg-white/25 rounded-full blur-md" />
        <div className="absolute top-14 right-2 w-18 h-5 bg-white/15 rounded-full blur-sm" />
        <div className="absolute top-20 left-4 w-16 h-4 bg-white/15 rounded-full blur-sm" />
      </div>

      {/* Cabeçalho */}
      <div className="relative pt-10 pb-2 px-6 text-center">
        <h1 className="text-xl font-black text-white leading-none tracking-wide">Santuário Nerd</h1>
        <p className="text-[9px] font-bold text-white/65 uppercase tracking-[0.22em] mt-0.5">
          Seu Universo Geek Começa Aqui
        </p>
        <p className="text-[11px] text-white/55 mt-2 font-medium">Mesa {mesa}</p>
      </div>

      {/* Mascote — flutuando no gradiente, sem moldura */}
      <div className="relative flex justify-center py-4">
        <img
          src="/logo-maikon.png"
          alt="Mascote Maikon"
          className="w-32 h-32 object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
        />
      </div>

      {/* Card branco principal */}
      <div className="relative flex-1 bg-white rounded-t-[2.5rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] px-6 pt-8 pb-12">

        {/* Comanda já aberta: atalho direto, sem repetir a identificação */}
        {temComandaAberta && step !== 'loading' && (
          <Link href="/cliente"
            className="mb-6 flex items-center gap-3 rounded-2xl bg-blue-50 border border-blue-100 p-4 max-w-sm mx-auto transition-all active:scale-95">
            <div className="w-10 h-10 rounded-full bg-[#3EC2F2]/15 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-[#3EC2F2]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">Você já tem uma comanda aberta</p>
              <p className="text-[11px] text-gray-500">Toque para abrir sem preencher nada</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          </Link>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-[#3EC2F2]" />
            <p className="text-sm text-gray-500 font-semibold">Verificando dados...</p>
          </div>
        )}

        {/* Quick Login */}
        {step === 'quick' && savedUser && (
          <div className="space-y-6 max-w-sm mx-auto">
            <div className="text-center">
              <h2 className="text-xl font-black text-gray-900">Identificação do Cliente</h2>
              <p className="text-gray-400 text-sm mt-1">
                Bem-vindo de volta,{' '}
                <span className="text-[#3EC2F2] font-bold">{savedUser.name.split(' ')[0]}</span>!
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#3EC2F2]/15 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-[#3EC2F2]" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{savedUser.name}</p>
                {savedUser.displayCpf && <p className="text-[11px] text-gray-500 font-mono">{savedUser.displayCpf}</p>}
                <p className="text-[11px] text-gray-500">{savedUser.whatsApp}</p>
              </div>
            </div>

            <button
              onClick={() => handleLogin(true)}
              className="w-full py-4 font-black text-gray-900 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all text-base shadow-lg"
              style={{ background: 'linear-gradient(135deg, #FFE45E, #F5C518)' }}
            >
              Abrir Comanda <ChevronRight className="w-5 h-5" />
            </button>

            <button onClick={() => setStep('form')}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-2">
              Não é você? Clique aqui
            </button>
          </div>
        )}

        {/* Formulário */}
        {step === 'form' && (
          <div className="space-y-5 max-w-sm mx-auto">
            <div className="text-center">
              <h2 className="text-xl font-black text-gray-900">Identificação do Cliente</h2>
              <p className="text-gray-400 text-sm mt-1">Preencha seus dados para abrir a comanda</p>
            </div>

            <div className="space-y-4">

              <div>
                <label className="block text-[11px] font-black text-[#1A6DB5] uppercase tracking-wider mb-2">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#3EC2F2] focus:ring-2 focus:ring-[#3EC2F2]/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#1A6DB5] uppercase tracking-wider mb-2">
                  CPF <span className="font-normal text-gray-400 normal-case">(opcional)</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel" value={cpf} onChange={e => setCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 pl-10 pr-4 text-sm text-gray-900 font-mono placeholder-gray-400 outline-none focus:border-[#3EC2F2] focus:ring-2 focus:ring-[#3EC2F2]/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#1A6DB5] uppercase tracking-wider mb-2">
                  WhatsApp / Telefone
                </label>
                <div className="relative">
                  <MessageCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel" value={whatsApp} onChange={e => setWhatsApp(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#3EC2F2] focus:ring-2 focus:ring-[#3EC2F2]/20 transition-all"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#3EC2F2] focus:ring-[#3EC2F2] shrink-0"
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  Li e concordo com os{' '}
                  <button type="button" onClick={() => setShowPrivacy(true)} className="text-[#3EC2F2] font-semibold underline underline-offset-2">
                    Termos de Uso
                  </button>
                  {' '}e a{' '}
                  <button type="button" onClick={() => setShowPrivacy(true)} className="text-[#3EC2F2] font-semibold underline underline-offset-2">
                    Política de Privacidade
                  </button>
                  {' '}do Santuário Nerd, conforme a{' '}
                  <strong className="text-gray-700">Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>.
                </span>
              </label>
            </div>

            <button
              onClick={() => handleLogin(false)}
              className="w-full py-4 font-black text-gray-900 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all text-base shadow-lg"
              style={{ background: 'linear-gradient(135deg, #FFE45E, #F5C518)' }}
            >
              Abrir Comanda <ChevronRight className="w-5 h-5" />
            </button>

            {savedUser && (
              <button onClick={() => setStep('quick')}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1">
                <ArrowLeft className="w-3 h-3" /> Voltar
              </button>
            )}
          </div>
        )}

        {step !== 'loading' && (
          <p className="text-center text-xs text-gray-400 mt-8">
            Já tem conta com e-mail e senha?{' '}
            <Link href="/entrar" className="text-[#3EC2F2] font-semibold underline underline-offset-2">
              Entrar pela conta
            </Link>
          </p>
        )}

        <p className="text-center text-[10px] text-gray-300 mt-10 font-medium">
          Powered by Santuário Nerd © 2025
        </p>
      </div>

      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  )
}
