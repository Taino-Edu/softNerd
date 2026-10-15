'use client'
// =============================================================================
// lgpd/page.tsx — Página pública de exercício de direitos LGPD
// Permite ao titular abrir solicitações e consultar protocolos.
// =============================================================================

import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import { useState } from 'react'
import { Shield, Search, ChevronDown } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

const TIPOS_SOLICITACAO = [
  { value: 'Acesso',       label: 'Acesso — Quero saber quais dados vocês têm sobre mim' },
  { value: 'Retificacao',  label: 'Retificação — Quero corrigir dados incorretos' },
  { value: 'Exclusao',     label: 'Exclusão — Quero que meus dados sejam apagados' },
  { value: 'Portabilidade',label: 'Portabilidade — Quero receber meus dados em formato digital' },
  { value: 'Oposicao',     label: 'Oposição — Quero opor-me a um uso específico dos meus dados' },
]

type StatusConsulta = {
  id: string
  requestType: string
  status: string
  adminResponse: string | null
  createdAt: string
  deadline: string
  respondedAt: string | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Recebido:  { label: 'Recebido',   color: 'bg-yellow-100 text-yellow-800' },
  EmAnalise: { label: 'Em Análise', color: 'bg-blue-100 text-blue-800' },
  Concluido: { label: 'Concluído',  color: 'bg-green-100 text-green-800' },
  Negado:    { label: 'Negado',     color: 'bg-red-100 text-red-800' },
}

export default function LgpdPage() {
  // ── Estado do formulário ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    requesterName:  '',
    requesterEmail: '',
    requesterCpf:   '',
    requestType:    '',
    description:    '',
  })
  const [loading,   setLoading]   = useState(false)
  const [protocolo, setProtocolo] = useState<{ protocol: string; deadline: string; message: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // ── Estado da consulta ────────────────────────────────────────────────────
  const [consultaId,      setConsultaId]      = useState('')
  const [consultaEmail,   setConsultaEmail]   = useState('')   // obrigatório para evitar enumeração
  const [consultaResult,  setConsultaResult]  = useState<StatusConsulta | null>(null)
  const [consultaError,   setConsultaError]   = useState<string | null>(null)
  const [consultaLoading, setConsultaLoading] = useState(false)

  // ── Submit do formulário ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setProtocolo(null)

    const cpfLimpo = form.requesterCpf.replace(/\D/g, '')
    if (cpfLimpo.length !== 11) {
      setFormError('CPF deve conter 11 dígitos.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/lgpd/request`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, requesterCpf: cpfLimpo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Erro ao enviar solicitação.')
      setProtocolo(data)
      setForm({ requesterName: '', requesterEmail: '', requesterCpf: '', requestType: '', description: '' })
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Consulta de protocolo ─────────────────────────────────────────────────
  // O backend exige e-mail de confirmação para evitar enumeração de protocolos
  async function handleConsulta(e: React.FormEvent) {
    e.preventDefault()
    setConsultaError(null)
    setConsultaResult(null)
    if (!consultaId.trim() || !consultaEmail.trim()) return

    setConsultaLoading(true)
    try {
      const params = new URLSearchParams({ email: consultaEmail.trim() })
      const res = await fetch(`${API_BASE}/api/lgpd/request/${consultaId.trim()}?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Protocolo não encontrado.')
      setConsultaResult(data)
    } catch (err: unknown) {
      setConsultaError(err instanceof Error ? err.message : 'Erro ao consultar.')
    } finally {
      setConsultaLoading(false)
    }
  }

  const statusInfo = consultaResult ? STATUS_LABELS[consultaResult.status] : null

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Cabeçalho */}
      <header className="bg-[#10286B] text-white py-6 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-2xl font-bold">
            <span className="text-[#42B6EE]">Santuário</span>
            <span> Nerd</span>
          </Link>
          <div className="flex items-center gap-4"><span className="text-sm text-gray-400 hidden sm:block">Privacidade &amp; LGPD</span><ThemeToggle compact /></div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Título */}
        <div className="flex items-start gap-3 mb-8">
          <Shield className="w-8 h-8 text-[#42B6EE] mt-1 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold">Seus Direitos sobre seus Dados — LGPD</h1>
            <p className="text-gray-600 mt-1 text-sm leading-relaxed">
              Pela Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018), você tem o direito de
              acessar, corrigir, excluir ou portar seus dados pessoais. Preencha o formulário abaixo
              e responderemos em até <strong>15 dias corridos</strong>.
            </p>
          </div>
        </div>

        {/* Formulário de solicitação */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <h2 className="text-lg font-bold mb-5">Abrir Solicitação</h2>

          {protocolo ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <h3 className="font-bold text-green-800 text-lg mb-1">Solicitação enviada!</h3>
              <p className="text-green-700 text-sm mb-3">{protocolo.message}</p>
              <div className="bg-white border border-green-200 rounded-lg p-3 font-mono text-sm break-all">
                <span className="text-gray-500">Protocolo: </span>
                <strong>{protocolo.protocol}</strong>
              </div>
              <p className="text-xs text-green-600 mt-2">
                Prazo de resposta: <strong>{new Date(protocolo.deadline).toLocaleDateString('pt-BR')}</strong>.
                Você também receberá um e-mail de confirmação.
              </p>
              <button
                onClick={() => setProtocolo(null)}
                className="mt-4 text-sm text-[#42B6EE] underline"
              >
                Abrir nova solicitação
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.requesterName}
                  onChange={e => setForm(f => ({ ...f, requesterName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42B6EE]"
                  placeholder="Seu nome completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.requesterEmail}
                  onChange={e => setForm(f => ({ ...f, requesterEmail: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42B6EE]"
                  placeholder="seu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={14}
                  value={form.requesterCpf}
                  onChange={e => setForm(f => ({ ...f, requesterCpf: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42B6EE]"
                  placeholder="000.000.000-00"
                />
                <p className="text-xs text-gray-400 mt-1">Usado apenas para identificação do titular.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de solicitação <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={form.requestType}
                    onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#42B6EE] bg-white"
                  >
                    <option value="">Selecione o tipo...</option>
                    {TIPOS_SOLICITACAO.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  maxLength={2000}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42B6EE] resize-none"
                  placeholder="Detalhe sua solicitação se desejar..."
                />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#42B6EE] text-white font-medium py-2.5 rounded-lg text-sm hover:bg-[#2ea8e0] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Enviando...' : 'Enviar solicitação'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                Seus dados serão usados exclusivamente para responder esta solicitação.
              </p>
            </form>
          )}
        </div>

        {/* Consulta de protocolo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Search className="w-5 h-5 text-[#42B6EE]" />
            <h2 className="text-lg font-bold">Consultar Protocolo Existente</h2>
          </div>

          <form onSubmit={handleConsulta} className="space-y-2 mb-4">
            <input
              type="text"
              value={consultaId}
              onChange={e => setConsultaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42B6EE] font-mono"
              placeholder="Número do protocolo (ex: abc123-...)"
              required
            />
            {/* E-mail obrigatório: confirma posse do protocolo, evita enumeração */}
            <div className="flex gap-2">
              <input
                type="email"
                value={consultaEmail}
                onChange={e => setConsultaEmail(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42B6EE]"
                placeholder="E-mail usado na solicitação"
                required
              />
              <button
                type="submit"
                disabled={consultaLoading}
                className="bg-[#42B6EE] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2ea8e0] disabled:opacity-50 transition-colors"
              >
                {consultaLoading ? '...' : 'Consultar'}
              </button>
            </div>
          </form>

          {consultaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {consultaError}
            </div>
          )}

          {consultaResult && statusInfo && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-400">#{consultaResult.id}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">Tipo</p>
                  <p className="font-medium">{consultaResult.requestType}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Prazo de resposta</p>
                  <p className="font-medium">
                    {new Date(consultaResult.deadline).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Aberta em</p>
                  <p className="font-medium">
                    {new Date(consultaResult.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {consultaResult.respondedAt && (
                  <div>
                    <p className="text-gray-400 text-xs">Respondida em</p>
                    <p className="font-medium">
                      {new Date(consultaResult.respondedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>
              {consultaResult.adminResponse && (
                <div className="bg-gray-50 rounded-lg p-3 mt-2">
                  <p className="text-xs text-gray-400 mb-1">Resposta da Santuário Nerd:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{consultaResult.adminResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Links */}
        <div className="mt-8 text-center text-sm text-gray-500 space-x-4">
          <Link href="/privacidade" className="text-[#42B6EE] underline">Política de Privacidade</Link>
          <Link href="/termos" className="text-[#42B6EE] underline">Termos de Uso</Link>
        </div>
      </main>
    </div>
  )
}
