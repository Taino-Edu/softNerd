'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  userApi, UserProfile, crediarioApi, CrediariosDto, comandaApi, ComandaDto, championshipApi, MyParticipation,
  reservationApi, MyReservation, minhasNotasApi, MinhaNotaDto,
} from '@/lib/api'
import { getUserName, clearAuth } from '@/lib/auth'
import { authApi } from '@/lib/api'
import {
  Star, User, Phone, CreditCard, Clock, AlertCircle, ArrowLeft, LogOut,
  CheckCircle, Wallet, CalendarClock, Receipt, ChevronDown, ChevronUp,
  ShoppingBag, XCircle, Trophy, Coins, ShieldCheck, Mail, Settings, BookOpen,
  Bell, Package, X, Hourglass, FileText, Pencil, Check, Loader2 as Loader2Icon,
  QrCode,
} from 'lucide-react'
import PixReservaModal from '@/components/PixReservaModal'
import clsx from 'clsx'
import toast, { Toaster } from 'react-hot-toast'

function EditProfileModal({ profile, onClose, onSaved }: {
  profile: UserProfile
  onClose: () => void
  onSaved: (updated: UserProfile) => void
}) {
  const [name, setName]         = useState(profile.name)
  const [email, setEmail]       = useState(profile.email ?? '')
  const [whatsApp, setWhatsApp] = useState(profile.whatsApp ?? '')
  const [saving, setSaving]     = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('O nome não pode ficar vazio.'); return }
    // Conta com senha não pode ficar sem e-mail — login e redefinição dependem dele
    if (profile.hasPassword && !email.trim()) {
      toast.error('Sua conta usa e-mail e senha para entrar — o e-mail não pode ficar vazio.')
      return
    }
    setSaving(true)
    try {
      const { data } = await userApi.updateMe({
        name: name.trim(),
        email: email.trim(),
        whatsApp: whatsApp.trim(),
      })
      toast.success('Dados atualizados!')
      onSaved(data)
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar seus dados.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <form onSubmit={handleSave}
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">Editar meus dados</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider">Nome</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#42B6EE]"
            placeholder="Seu nome"
          />
        </div>

        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider">
            E-mail {profile.hasPassword && <span className="text-red-400">· obrigatório</span>}
          </label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            required={profile.hasPassword}
            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#42B6EE]"
            placeholder="seu@email.com"
          />
        </div>

        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider">WhatsApp</label>
          <input
            value={whatsApp} onChange={e => setWhatsApp(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#42B6EE]"
            placeholder="11999999999"
          />
        </div>

        {profile.cpf && (
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider">CPF</label>
            <div className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
              {profile.cpf}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">CPF errado? Fale com o Maikon no balcão pra corrigir.</p>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-black text-white transition-colors disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #29B5E8, #1A6DB5)' }}>
          {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar alterações
        </button>
      </form>
    </div>
  )
}

export default function PerfilPage() {
  const router = useRouter()
  const [profile,        setProfile]        = useState<UserProfile | null>(null)
  const [crediarios,     setCrediarios]     = useState<CrediariosDto[]>([])
  const [history,        setHistory]        = useState<ComandaDto[]>([])
  const [participations, setParticipations] = useState<MyParticipation[]>([])
  const [fila,           setFila]           = useState<MyReservation[]>([])
  const [reservations,   setReservations]   = useState<MyReservation[]>([])
  const [notas,          setNotas]          = useState<MinhaNotaDto[]>([])
  const [notasBloqueadas, setNotasBloqueadas] = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [expanded,       setExpanded]       = useState<string | null>(null)
  const [tab,            setTab]            = useState<'pontos' | 'historico' | 'torneios' | 'crediario' | 'filas' | 'notas'>('pontos')
  const [isUploading,    setIsUploading]    = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [pixGroupId,     setPixGroupId]     = useState<string | null>(null)

  async function refetchReservas() {
    try {
      const r = await reservationApi.mine()
      setReservations(r.data.filter(x => x.kind === 'pre_venda' && x.status === 'active'))
      setFila(r.data.filter(x => x.kind === 'fila' && x.status === 'waiting'))
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    Promise.all([
      userApi.me().then(r => setProfile(r.data)).catch(() => {}),
      crediarioApi.meuHistorico().then(r => setCrediarios(r.data)).catch(() => {}),
      comandaApi.myHistory().then(r => setHistory(r.data)).catch(() => {}),
      championshipApi.myParticipations().then(r => setParticipations(r.data)).catch(() => {}),
      reservationApi.mine().then(r => {
        setReservations(r.data.filter(x => x.kind === 'pre_venda' && x.status === 'active'))
        setFila(r.data.filter(x => x.kind === 'fila' && x.status === 'waiting'))
      }).catch(() => {}),
      minhasNotasApi.list().then(r => setNotas(r.data)).catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 423) setNotasBloqueadas(true)
      }),
    ]).finally(() => setLoading(false))
  }, [])

  async function handleLeaveFila(entry: MyReservation) {
    try {
      await reservationApi.cancel(entry.id)
      setFila(prev => prev.filter(e => e.id !== entry.id))
      toast.success('Você saiu da fila.')
    } catch { toast.error('Erro ao sair da fila.') }
  }

  async function handleCancelReservation(res: MyReservation) {
    if (!confirm('Cancelar esta pré-venda? O item volta para o estoque da loja.')) return
    try {
      await reservationApi.cancel(res.id)
      setReservations(prev => prev.filter(r => r.id !== res.id))
      toast.success('Pré-venda cancelada.')
    } catch { toast.error('Erro ao cancelar pré-venda.') }
  }

  const crediario = crediarios.find(c => c.status === 'Aberto' || c.status === 'Vencido') ?? null

  const agora = new Date()
  const consumoMensal = history
    .filter(c => {
      if (!c.closedAt || c.status !== 'Fechada') return false
      const d = new Date(c.closedAt)
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear()
    })
    .reduce((s, c) => s + c.totalInReais, 0)

  async function handleLogout() {
    try { await authApi.logout() } catch {}
    clearAuth()
    router.push('/')
  }

  async function handleAvatarClick() {
    document.getElementById('avatar-upload')?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB.')
      return
    }
    setIsUploading(true)
    try {
      const { data } = await authApi.uploadProfileImage(file)
      setProfile(prev => prev ? { ...prev, profileImageUrl: data.url } : prev)
      toast.success('Avatar atualizado!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao enviar imagem.')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const isExpired = profile?.pointsExpired

  const tabs = [
    { id: 'pontos',    icon: Star,    label: 'Pontos'   },
    { id: 'historico', icon: Receipt, label: 'Histórico' },
    { id: 'torneios',  icon: Trophy,  label: 'Torneios' },
    { id: 'filas',     icon: Bell,    label: 'Pré-vendas', badge: fila.length + reservations.length },
    { id: 'crediario', icon: Wallet,  label: 'Dívida'   },
    { id: 'notas',     icon: FileText, label: 'Notas Fiscais' },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster position="bottom-center" toastOptions={{ style: { background: '#fff', color: '#1a1a2e', border: '1px solid #e5e7eb' } }} />

      {/* ── HEADER GRADIENTE ── */}
      <header className="relative pb-20 pt-safe"
        style={{ background: 'linear-gradient(160deg, #29B5E8 0%, #1A6DB5 60%, #1352A2 100%)' }}>

        {/* Nuvens decorativas */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute top-4 left-2 w-20 h-6 bg-white/20 rounded-full blur-md" />
          <div className="absolute top-8 left-16 w-32 h-5 bg-white/15 rounded-full blur-md" />
          <div className="absolute top-3 right-4 w-24 h-6 bg-white/20 rounded-full blur-md" />
        </div>

        {/* Barra de navegação */}
        <div className="relative flex items-center justify-between px-5 pt-12 pb-4 max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors active:scale-90"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-black text-white uppercase tracking-[0.2em]">Minha Conta</h1>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-red-400/60 transition-colors"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar + nome (centro do header) */}
        <div className="relative flex flex-col items-center px-4 max-w-lg mx-auto">
          <input
            type="file" id="avatar-upload"
            accept="image/jpeg, image/png, image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={handleAvatarClick}
            disabled={isUploading}
            className="relative w-20 h-20 rounded-full shadow-xl overflow-hidden group ring-4 ring-white/40 hover:ring-white/70 transition-all"
          >
            {isUploading ? (
              <div className="w-full h-full bg-[#1A6DB5] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white" />
              </div>
            ) : profile?.profileImageUrl ? (
              <>
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || 'https://santuarionerd.com.br'}${profile.profileImageUrl}`}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white">Editar</span>
                </div>
              </>
            ) : (
              <div className="w-full h-full bg-[#1A6DB5] flex items-center justify-center">
                <User className="w-9 h-9 text-white/80" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white">Editar</span>
                </div>
              </div>
            )}
          </button>

          {!loading && (
            <div className="mt-3 text-center">
              <h2 className="text-lg font-black text-white leading-tight">
                {profile?.name ?? getUserName() ?? 'Visitante'}
              </h2>
              <div className="flex flex-col items-center gap-1 mt-1">
                {profile?.email && (
                  <span className="flex items-center gap-1.5 text-[11px] text-white/70 font-medium">
                    <Mail className="w-3 h-3" /> {profile.email}
                  </span>
                )}
                {profile?.whatsApp && (
                  <span className="flex items-center gap-1.5 text-[11px] text-white/70 font-medium">
                    <Phone className="w-3 h-3" /> {profile.whatsApp}
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditingProfile(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 rounded-full"
              >
                <Pencil className="w-3 h-3" /> Editar dados
              </button>
            </div>
          )}
        </div>
      </header>

      {editingProfile && profile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditingProfile(false)}
          onSaved={updated => setProfile(updated)}
        />
      )}

      {pixGroupId && (
        <PixReservaModal
          groupId={pixGroupId}
          onClose={() => setPixGroupId(null)}
          onPago={refetchReservas}
        />
      )}

      {/* ── CARD PRINCIPAL (sobrepõe o header) ── */}
      <div className="flex-1 -mt-12 bg-gray-50 rounded-t-[2rem] relative z-10 px-4 pt-6 pb-20 max-w-lg mx-auto w-full">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-8 h-8 text-[#42B6EE]" />
            <p className="text-sm text-gray-400 font-semibold">Consultando registros...</p>
          </div>
        ) : (
          <>
            {/* ── STATS RÁPIDOS ── */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <p className="text-[10px] font-black text-[#42B6EE] uppercase tracking-wider mb-1">Pontos Nerd</p>
                <p className="text-2xl font-black text-gray-900">{profile?.pointsBalance ?? 0}</p>
                {isExpired && (
                  <p className="text-[9px] text-red-500 font-bold mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Expirado
                  </p>
                )}
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <p className="text-[10px] font-black text-[#42B6EE] uppercase tracking-wider mb-1">Gasto no Mês</p>
                <p className="text-2xl font-black text-gray-900">
                  R$ {consumoMensal.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>

            {/* ── TABS ── */}
            <nav className="flex bg-white border border-gray-100 shadow-sm p-1 rounded-2xl gap-1 mb-5 sticky top-4 z-20">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx(
                    'relative flex-1 flex flex-col items-center py-2.5 rounded-xl transition-all',
                    tab === t.id
                      ? 'text-white shadow-md'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  )}
                  style={tab === t.id ? { background: 'linear-gradient(135deg, #29B5E8, #1A6DB5)' } : {}}
                >
                  {'badge' in t && t.badge > 0 && (
                    <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                  <t.icon className={clsx('w-4 h-4 mb-1', tab === t.id ? 'text-white' : 'text-gray-400')} />
                  <span className="text-[10px] font-black uppercase tracking-tight">{t.label}</span>
                </button>
              ))}
            </nav>

            {/* ── TAB: PONTOS ── */}
            {tab === 'pontos' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                  <Star className="absolute -right-4 -bottom-4 w-24 h-24 text-[#42B6EE] opacity-[0.06]" />
                  <p className="text-xs font-black text-[#42B6EE] uppercase tracking-widest mb-1">Saldo de Experiência</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-gray-900">{profile?.pointsBalance ?? 0}</span>
                    <span className="text-gray-400 font-bold uppercase text-xs tracking-widest">Pontos</span>
                  </div>
                  {isExpired && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-500 text-xs font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Seus pontos expiraram. Continue frequentando para ganhar novos!
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</p>
                      <p className="text-sm font-black text-emerald-500">Ativo</p>
                    </div>
                  </div>
                  {profile && profile.balanceInCents > 0 && (
                    <div className="text-right">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Cashback</p>
                      <p className="text-sm font-black text-emerald-500">
                        R$ {(profile.balanceInCents / 100).toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: HISTÓRICO ── */}
            {tab === 'historico' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {history.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center shadow-sm">
                    <Clock className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400 italic">Nenhum registro encontrado...</p>
                  </div>
                ) : (
                  history.map(c => {
                    const open = expanded === c.id
                    return (
                      <div key={c.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        <button
                          onClick={() => setExpanded(open ? null : c.id)}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 text-left">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                              <Receipt className="w-5 h-5 text-[#42B6EE]" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">
                                Comanda {c.closedAt ? new Date(c.closedAt).toLocaleDateString('pt-BR') : 'Ativa'}
                              </p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                {c.items.length} itens • {c.status}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-black text-emerald-500 text-sm">
                              R$ {c.totalInReais.toFixed(2).replace('.', ',')}
                            </span>
                            {open
                              ? <ChevronUp className="w-4 h-4 text-gray-400" />
                              : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </button>
                        {open && (
                          <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 space-y-2 pt-3">
                            {c.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-medium">{item.quantity}x {item.itemNameSnapshot}</span>
                                <span className="text-gray-700 font-bold">R$ {item.subtotalInReais.toFixed(2).replace('.', ',')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* ── TAB: TORNEIOS ── */}
            {tab === 'torneios' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {participations.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center shadow-sm">
                    <Trophy className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400 italic">Você ainda não entrou em batalhas...</p>
                  </div>
                ) : (
                  participations.map(p => (
                    <div key={p.participationId} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[11px] font-black text-[#42B6EE] uppercase tracking-widest">{p.game}</p>
                          <h3 className="text-base font-black text-gray-900 leading-tight mt-0.5">{p.championshipName}</h3>
                        </div>
                        <div className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-black text-emerald-600 uppercase shrink-0">
                          Inscrito
                        </div>
                      </div>
                      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                          <CalendarClock className="w-3.5 h-3.5 text-[#42B6EE]" />
                          {new Date(p.startDate).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                          <Coins className="w-3.5 h-3.5 text-[#42B6EE]" />
                          R$ {p.entryFeeInReais.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── TAB: PRÉ-VENDAS & FILA ── */}
            {tab === 'filas' && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {fila.length === 0 && reservations.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center shadow-sm">
                    <Bell className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400 italic">Você não tem pré-vendas ativas nem está em nenhuma fila.</p>
                  </div>
                ) : (
                  <>
                    {reservations.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Pré-vendas</p>
                        {reservations.map(r => (
                          <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 overflow-hidden">
                              {r.productImageUrl
                                ? <img src={r.productImageUrl} alt={r.productName} className="w-full h-full object-cover" />
                                : <Package className="w-5 h-5 text-amber-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{r.productName}</p>
                              {r.variantLabel && <p className="text-[11px] text-gray-400">{r.variantLabel}</p>}
                              {r.expiresAt ? (
                                <p className="text-[11px] text-amber-500 font-bold flex items-center gap-1 mt-0.5">
                                  <Hourglass className="w-3 h-3" /> Aguardando pagamento
                                </p>
                              ) : (
                                <p className="text-[11px] text-emerald-500 font-black uppercase tracking-wide mt-0.5">
                                  Paga ✓ — aguardando retirada
                                </p>
                              )}
                              {r.preVendaReleaseDate && (
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  Retirada a partir de {new Date(r.preVendaReleaseDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              {r.expiresAt && (
                                <button onClick={() => setPixGroupId(r.reservationGroupId)}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-purple-500 hover:bg-purple-50 transition-colors"
                                  title="Pagar via Pix">
                                  <QrCode className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => handleCancelReservation(r)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Cancelar pré-venda">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {fila.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Na fila</p>
                        {fila.map(f => (
                          <div key={f.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 overflow-hidden">
                              {f.productImageUrl
                                ? <img src={f.productImageUrl} alt={f.productName} className="w-full h-full object-cover" />
                                : <Package className="w-5 h-5 text-purple-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{f.productName}</p>
                              <p className="text-[11px] text-purple-500 font-bold mt-0.5">
                                {f.posicaoFila ? `#${f.posicaoFila} na fila` : 'Na fila'}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-0.5">Avisamos quando chegar — aí vira pré-venda</p>
                            </div>
                            <button onClick={() => handleLeaveFila(f)}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                              title="Sair da fila">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── TAB: CREDIÁRIO ── */}
            {tab === 'crediario' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {!crediario ? (
                  <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm space-y-4">
                    <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-black text-gray-900 text-lg">Tudo limpo!</p>
                      <p className="text-gray-400 text-sm">Você não possui dívidas ativas no santuário.</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-red-100 rounded-2xl p-8 text-center shadow-sm space-y-5">
                    <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
                      <Wallet className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-red-500 uppercase tracking-widest">Dívida Pendente</p>
                      <p className="text-4xl font-black text-gray-900">
                        R$ {crediario.saldoRestanteEmReais.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-2xl">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-bold uppercase">Vencimento</span>
                        <span className="text-red-500 font-bold">
                          {new Date(crediario.dataVencimento).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                      * Compareça ao balcão para quitar sua dívida com o Maikon.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: NOTAS FISCAIS ── */}
            {tab === 'notas' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {notasBloqueadas ? (
                  <div className="bg-red-50 border border-red-100 rounded-2xl py-14 text-center shadow-sm">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-red-300" />
                    <p className="text-sm font-bold text-red-500">Módulo bloqueado por hora</p>
                  </div>
                ) : notas.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-14 text-center shadow-sm">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400 italic">Nenhuma nota fiscal emitida ainda.</p>
                  </div>
                ) : (
                  notas.map(n => (
                    <div key={n.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">
                          R$ {(n.valorTotalEmCentavos / 100).toFixed(2).replace('.', ',')}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(n.emitidoEm ?? n.createdAt).toLocaleDateString('pt-BR')} · {n.status}
                        </p>
                      </div>
                      {n.status === 'Autorizada' ? (
                        <Link href={`/cliente/notas/${n.id}`} target="_blank"
                          className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors shrink-0 px-3 py-1.5 rounded-lg bg-blue-50">
                          Ver cupom
                        </Link>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic shrink-0">aguardando</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            {/* ── MEUS DECKS ── */}
            <Link
              href="/cliente/decks"
              className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-4 hover:bg-gray-50 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">Meus Decks</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Crie e gerencie seus decks</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-300 -rotate-90" />
            </Link>

            {/* ── CONFIGURAÇÕES ── */}
            <Link
              href="/cliente/configuracoes"
              className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-2 hover:bg-gray-50 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-[#42B6EE]" />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">Configurações</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">IA, sons e preferências</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-300 -rotate-90" />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}
