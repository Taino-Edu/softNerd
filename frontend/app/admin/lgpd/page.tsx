'use client'
// =============================================================================
// admin/lgpd/page.tsx — Painel admin de Compliance LGPD
// Aba 1: Requisições LGPD | Aba 2: Audit Log
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { Shield, FileText, Clock, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight, Paperclip, Download, FileDown } from 'lucide-react'
import Link from 'next/link'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface LgpdRequest {
  id: string
  requesterName: string
  requesterEmail: string
  requesterCpf: string
  requestType: string
  description: string | null
  status: string
  adminResponse: string | null
  createdAt: string
  deadline: string
  respondedAt: string | null
  isOverdue: boolean
  isUrgent: boolean
  temAnexo: boolean
  anexoNome: string | null
}

interface AuditLog {
  id: string
  actorUserId: string | null
  actorUserName: string | null
  action: string
  entityType: string
  entityId: string | null
  details: string | null
  createdAt: string
}

interface AuditPagedResponse {
  items: AuditLog[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  Recebido:  {
    label:     'Recebido',
    className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    icon:      <Clock className="w-3 h-3" />,
  },
  EmAnalise: {
    label:     'Em Análise',
    className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    icon:      <FileText className="w-3 h-3" />,
  },
  Concluido: {
    label:     'Concluído',
    className: 'bg-accent-green/20 text-accent-green border border-accent-green/30',
    icon:      <CheckCircle className="w-3 h-3" />,
  },
  Negado: {
    label:     'Negado',
    className: 'bg-accent-red/20 text-accent-red border border-accent-red/30',
    icon:      <XCircle className="w-3 h-3" />,
  },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, className: 'bg-gray-500/20 text-gray-400 border border-gray-500/30', icon: null }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}>
      {s.icon}
      {s.label}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Modal de resposta ─────────────────────────────────────────────────────────

function RespondModal({
  request,
  onClose,
  onSaved,
}: {
  request: LgpdRequest
  onClose: () => void
  onSaved:  () => void
}) {
  const [status,       setStatus]       = useState(request.status === 'Recebido' ? 'EmAnalise' : request.status)
  const [response,     setResponse]     = useState(request.adminResponse ?? '')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [saved,        setSaved]        = useState(request.status !== 'Recebido')

  // Anexo
  const [file,         setFile]         = useState<File | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [uploadError,  setUploadError]  = useState<string | null>(null)
  const [uploadOk,     setUploadOk]     = useState(request.temAnexo)
  const [anexoNome,    setAnexoNome]    = useState<string | null>(request.anexoNome)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!response.trim()) { setError('A resposta é obrigatória.'); return }
    setError(null)
    setLoading(true)
    try {
      await api.put(`/api/lgpd/requests/${request.id}/respond`, { status, adminResponse: response })
      setSaved(true)
      onSaved()
    } catch {
      setError('Erro ao salvar resposta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload() {
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<{ anexoNome: string }>(`/api/lgpd/requests/${request.id}/attachment`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAnexoNome(res.data.anexoNome)
      setUploadOk(true)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setUploadError('Erro ao enviar arquivo. Verifique o tamanho (máx 10 MB) e tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  function handleDownload() {
    window.open(`/api/lgpd/requests/${request.id}/attachment`, '_blank')
  }

  const isReadOnly = request.status === 'Concluido' || request.status === 'Negado'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-surface-800 rounded-2xl shadow-2xl border border-surface-500 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-white mb-1">
          {isReadOnly ? 'Ver Resposta' : 'Responder Solicitação'}
        </h3>
        <p className="text-xs text-gray-400 mb-4 font-mono"># {request.id}</p>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <p className="text-gray-400 text-xs">Solicitante</p>
            <p className="text-white font-medium">{request.requesterName}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Tipo</p>
            <p className="text-white font-medium">{request.requestType}</p>
          </div>
        </div>

        {request.description && (
          <div className="bg-surface-700 rounded-lg p-3 mb-4 text-sm text-gray-300 max-h-24 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-1">Descrição do solicitante:</p>
            {request.description}
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            disabled={isReadOnly}
            className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
          >
            <option value="EmAnalise">Em Análise</option>
            <option value="Concluido">Concluído</option>
            <option value="Negado">Negado</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">
            Resposta formal {!isReadOnly && <span className="text-red-400">*</span>}
          </label>
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            rows={5}
            maxLength={4000}
            disabled={isReadOnly}
            className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-gray-500 disabled:opacity-60"
            placeholder="Descreva a resposta formal ao titular dos dados..."
          />
          {!isReadOnly && <p className="text-xs text-gray-500 mt-1">{response.length}/4000 caracteres</p>}
        </div>

        {/* ── Seção de anexo ─────────────────────────────────────── */}
        <div className="border border-surface-500 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-300 flex items-center gap-1.5 mb-3">
            <Paperclip className="w-3.5 h-3.5" />
            Documento anexado
          </p>

          {uploadOk && anexoNome ? (
            <div className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2">
              <span className="text-xs text-green-400 truncate max-w-[200px]">{anexoNome}</span>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors ml-2 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-2">Nenhum anexo ainda.</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.txt"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-surface-600 file:text-white hover:file:bg-surface-500"
            />
            {file && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-1.5 self-start px-3 py-1.5 bg-surface-600 hover:bg-surface-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                {uploading ? 'Enviando...' : `Anexar "${file.name}"`}
              </button>
            )}
            {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
            {uploadOk && !uploadError && <p className="text-xs text-green-400">Arquivo salvo com sucesso.</p>}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isReadOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar resposta'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function LgpdAdminPage() {
  const [tab, setTab] = useState<'requests' | 'audit'>('requests')

  // ── Requisições LGPD ────────────────────────────────────────────────────
  const [requests,      setRequests]      = useState<LgpdRequest[]>([])
  const [reqLoading,    setReqLoading]    = useState(true)
  const [reqError,      setReqError]      = useState<string | null>(null)
  const [statusFilter,  setStatusFilter]  = useState('')
  const [responding,    setResponding]    = useState<LgpdRequest | null>(null)

  const loadRequests = useCallback(async () => {
    setReqLoading(true)
    setReqError(null)
    try {
      const res = await api.get<LgpdRequest[]>('/api/lgpd/requests', {
        params: statusFilter ? { status: statusFilter } : undefined,
      })
      setRequests(res.data)
    } catch {
      setReqError('Erro ao carregar solicitações LGPD.')
    } finally {
      setReqLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    if (tab === 'requests') loadRequests()
  }, [tab, loadRequests])

  // ── Audit Log ───────────────────────────────────────────────────────────
  const [auditData,       setAuditData]       = useState<AuditPagedResponse | null>(null)
  const [auditLoading,    setAuditLoading]    = useState(false)
  const [auditError,      setAuditError]      = useState<string | null>(null)
  const [auditPage,       setAuditPage]       = useState(1)
  const [auditActionFilter, setAuditActionFilter] = useState('')

  const loadAudit = useCallback(async (page = 1, actionFilter = auditActionFilter) => {
    setAuditLoading(true)
    setAuditError(null)
    try {
      const params: Record<string, string | number> = { page, pageSize: 50 }
      if (actionFilter) params.entityType = actionFilter === 'Auth' ? 'Auth' : actionFilter
      const res = await api.get<AuditPagedResponse>('/api/audit', { params })
      setAuditData(res.data)
      setAuditPage(page)
    } catch {
      setAuditError('Erro ao carregar audit log.')
    } finally {
      setAuditLoading(false)
    }
  }, [auditActionFilter])

  useEffect(() => {
    if (tab === 'audit') loadAudit(1)
  }, [tab, loadAudit])

  return (
    <div className="p-4 sm:p-6">
      {/* Título */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">LGPD &amp; Privacidade</h1>
          <p className="text-xs text-gray-400">Gestão de solicitações e trilha de auditoria</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-surface-700 rounded-xl p-1 w-fit mb-6">
        {(['requests', 'audit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t
                ? 'bg-brand-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'requests' ? 'Requisições LGPD' : 'Audit Log'}
          </button>
        ))}
      </div>

      {/* ── Aba: Requisições ───────────────────────────────────────────────── */}
      {tab === 'requests' && (
        <div>
          {/* Filtro */}
          <div className="flex gap-2 mb-4">
            {['', 'Recebido', 'EmAnalise', 'Concluido', 'Negado'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === s
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-700 text-gray-400 hover:text-white'
                }`}
              >
                {s === '' ? 'Todos' : STATUS_STYLES[s]?.label ?? s}
              </button>
            ))}
          </div>

          {reqLoading && (
            <p className="text-gray-400 text-sm">Carregando...</p>
          )}
          {reqError && (
            <p className="text-red-400 text-sm">{reqError}</p>
          )}

          {!reqLoading && !reqError && (
            <div className="bg-surface-800 rounded-2xl border border-surface-500 overflow-hidden">
              {requests.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Nenhuma solicitação encontrada.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-500 text-xs text-gray-400">
                        <th className="text-left px-4 py-3 font-medium">Protocolo</th>
                        <th className="text-left px-4 py-3 font-medium">Solicitante</th>
                        <th className="text-left px-4 py-3 font-medium">Tipo</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Prazo</th>
                        <th className="text-left px-4 py-3 font-medium">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map(req => (
                        <tr
                          key={req.id}
                          className={`border-b border-surface-500/50 hover:bg-surface-700/50 transition-colors ${
                            req.isOverdue ? 'bg-red-900/10' : req.isUrgent ? 'bg-yellow-900/10' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {req.isOverdue && (
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" aria-label="Prazo vencido" />
                              )}
                              {!req.isOverdue && req.isUrgent && (
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" aria-label="Prazo urgente" />
                              )}
                              <span className="font-mono text-xs text-gray-400 max-w-[100px] truncate">
                                {req.id}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(req.createdAt)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">{req.requesterName}</p>
                            <p className="text-xs text-gray-400">{req.requesterEmail}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-300">{req.requestType}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={req.status} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${req.isOverdue ? 'text-red-400' : req.isUrgent ? 'text-yellow-400' : 'text-gray-400'}`}>
                              {fmtDate(req.deadline)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              <button
                                onClick={() => setResponding(req)}
                                className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors text-left"
                              >
                                {req.status === 'Concluido' || req.status === 'Negado'
                                  ? 'Ver resposta'
                                  : 'Responder'}
                              </button>
                              {(req.requestType === 'Acesso' || req.requestType === 'Portabilidade') && (
                                <Link
                                  href={`/admin/lgpd/documento/${req.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                                >
                                  <FileDown className="w-3 h-3" />
                                  Gerar relatório
                                </Link>
                              )}
                              {req.temAnexo && (
                                <a
                                  href={`/api/lgpd/requests/${req.id}/attachment`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  {req.anexoNome ?? 'Anexo'}
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Audit Log ─────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            {(['', 'Auth', 'User', 'LgpdRequest'] as const).map(f => (
              <button key={f}
                onClick={() => { setAuditActionFilter(f); loadAudit(1, f) }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  auditActionFilter === f
                    ? f === 'Auth' ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'bg-brand-500/20 text-brand-400 border border-brand-500/40'
                    : 'bg-surface-700 text-gray-400 hover:text-white border border-surface-500'
                }`}>
                {f === '' ? 'Todos' : f === 'Auth' ? '🔐 Segurança' : f === 'User' ? '👤 Usuários' : '📋 LGPD'}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">
              {auditData ? `${auditData.totalCount} registros` : ''}
            </span>
          </div>

          {/* Alerta de segurança: logins falhos */}
          {auditData && auditData.items.filter(l => l.action === 'LoginFalhou').length > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">Tentativas de login malsucedidas detectadas</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {auditData.items.filter(l => l.action === 'LoginFalhou').length} falha(s) nesta página.
                  {' '}Filtre por "Segurança" para ver o detalhamento. IPs são armazenados como hash (LGPD).
                </p>
              </div>
            </div>
          )}

          {auditLoading && <p className="text-gray-400 text-sm">Carregando...</p>}
          {auditError  && <p className="text-red-400 text-sm">{auditError}</p>}

          {!auditLoading && !auditError && auditData && (
            <>
              <div className="bg-surface-800 rounded-2xl border border-surface-500 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-500 text-xs text-gray-400">
                        <th className="text-left px-4 py-3 font-medium">Data</th>
                        <th className="text-left px-4 py-3 font-medium">Ator</th>
                        <th className="text-left px-4 py-3 font-medium">Ação</th>
                        <th className="text-left px-4 py-3 font-medium">Entidade</th>
                        <th className="text-left px-4 py-3 font-medium">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.items.map(log => {
                        const isFail = log.action === 'LoginFalhou'
                        return (
                          <tr key={log.id} className={`border-b border-surface-500/50 hover:bg-surface-700/50 transition-colors ${isFail ? 'bg-red-500/5' : ''}`}>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {fmtDateTime(log.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-white text-xs">{log.actorUserName ?? <span className="text-gray-500 italic">anônimo</span>}</p>
                              {log.actorUserId && (
                                <p className="text-gray-500 text-xs font-mono">{log.actorUserId.substring(0, 8)}…</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-medium text-xs ${isFail ? 'text-red-400' : log.action === 'LoginSucesso' ? 'text-green-400' : 'text-brand-400'}`}>
                                {isFail ? '⚠ ' : log.action === 'LoginSucesso' ? '✓ ' : ''}{log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-300 text-xs">{log.entityType}</p>
                              {log.entityId && (
                                <p className="text-gray-500 text-xs font-mono">{log.entityId.substring(0, 12)}…</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate" title={log.details ?? ''}>
                              {log.details
                                ? (() => { try { const d = JSON.parse(log.details); return d.email ?? log.details } catch { return log.details } })()
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginação */}
              <div className="flex items-center justify-between text-sm text-gray-400">
                <p>Página {auditData.page} de {auditData.totalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadAudit(auditPage - 1)}
                    disabled={auditPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 bg-surface-700 rounded-lg hover:bg-surface-500 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <button
                    onClick={() => loadAudit(auditPage + 1)}
                    disabled={auditPage >= auditData.totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 bg-surface-700 rounded-lg hover:bg-surface-500 disabled:opacity-40 transition-colors"
                  >
                    Próximo <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de resposta */}
      {responding && (
        <RespondModal
          request={responding}
          onClose={() => setResponding(null)}
          onSaved={() => {
            setResponding(null)
            loadRequests()
          }}
        />
      )}
    </div>
  )
}
