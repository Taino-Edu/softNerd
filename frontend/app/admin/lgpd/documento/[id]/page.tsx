'use client'
// =============================================================================
// admin/lgpd/documento/[id]/page.tsx — Relatório imprimível de dados LGPD
// Gerado pelo sistema para atender Art. 18 (Acesso / Portabilidade).
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { brl } from '@/lib/format'

interface DadosCadastrais {
  nome: string
  cpf: string
  email?: string
  whatsapp?: string
  cadastradoEm?: string
  ultimaAtualizacao?: string
  consentimento?: string
  status?: string
  nota?: string
}

interface ComandaResumo {
  protocolo: string
  abertura: string
  fechamento: string
  pagamento: string
}

interface Saldos {
  pontos?: number
  pontosExpiraEm?: string
  cashbackReais?: number
  nota?: string
}

interface Relatorio {
  protocolo: string
  tipoSolicitacao: string
  geradoEm: string
  dadosCadastrais: DadosCadastrais
  historicoComandasFechadas: ComandaResumo[]
  saldos: Saldos
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <tr>
      <td style={{ padding: '6px 12px 6px 0', color: '#555', fontSize: '13px', width: '40%', fontWeight: 500, verticalAlign: 'top' }}>
        {label}
      </td>
      <td style={{ padding: '6px 0', fontSize: '13px', color: '#111', verticalAlign: 'top' }}>
        {value}
      </td>
    </tr>
  )
}

export default function DocumentoLgpdPage() {
  const params   = useParams()
  const id       = params?.id as string
  const [data,   setData]    = useState<Relatorio | null>(null)
  const [error,  setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api.get<Relatorio>(`/api/lgpd/requests/${id}/relatorio`)
      .then(r => setData(r.data))
      .catch(() => setError('Não foi possível carregar o relatório. Verifique se você está autenticado como administrador.'))
  }, [id])

  const print = () => window.print()

  if (error) {
    return (
      <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#c00' }}>
        <strong>Erro:</strong> {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#555' }}>
        Carregando relatório...
      </div>
    )
  }

  const d = data.dadosCadastrais
  const s = data.saldos

  return (
    <>
      <style>{`
        @media print {
          .print-btn { display: none !important; }
          body { background: white !important; }
        }
        body { margin: 0; background: #f5f5f5; }
      `}</style>

      {/* Botão imprimir — some no print */}
      <div className="print-btn" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}>
        <button
          onClick={print}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '10px 22px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,.2)',
          }}
        >
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Documento */}
      <div style={{
        maxWidth: 760,
        margin: '32px auto',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 16px rgba(0,0,0,.08)',
        padding: '48px 56px',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}>

        {/* Cabeçalho */}
        <div style={{ borderBottom: '2px solid #111', paddingBottom: 16, marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>
            Santuário Nerd — José Bonifácio, SP
          </p>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 700, color: '#111' }}>
            Relatório de Dados Pessoais
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#444' }}>
            Exercício de Direitos — LGPD Art. 18 —{' '}
            <strong>
              {data.tipoSolicitacao === 'Acesso' ? 'Direito de Acesso (Art. 18, II)' :
               data.tipoSolicitacao === 'Portabilidade' ? 'Portabilidade de Dados (Art. 18, V)' :
               data.tipoSolicitacao}
            </strong>
          </p>
        </div>

        {/* Metadados do protocolo */}
        <div style={{ background: '#f8f8f8', borderRadius: 6, padding: '12px 16px', marginBottom: 28, fontSize: 12, color: '#555' }}>
          <span style={{ marginRight: 24 }}><strong>Protocolo:</strong> {data.protocolo}</span>
          <span><strong>Gerado em:</strong> {data.geradoEm} (UTC)</span>
        </div>

        {/* 1. Dados Cadastrais */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111', borderBottom: '1px solid #ddd', paddingBottom: 6, marginBottom: 12 }}>
            1. Dados Cadastrais
          </h2>
          {d.nota ? (
            <p style={{ fontSize: 13, color: '#c00' }}>{d.nota}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <Row label="Nome completo"       value={d.nome} />
                <Row label="CPF"                 value={d.cpf} />
                <Row label="E-mail"              value={d.email} />
                <Row label="WhatsApp"            value={d.whatsapp} />
                <Row label="Data de cadastro"    value={d.cadastradoEm} />
                <Row label="Última atualização"  value={d.ultimaAtualizacao} />
                <Row label="Consentimento"       value={d.consentimento} />
                <Row label="Status da conta"     value={d.status} />
              </tbody>
            </table>
          )}
        </section>

        {/* 2. Saldos */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111', borderBottom: '1px solid #ddd', paddingBottom: 6, marginBottom: 12 }}>
            2. Saldos e Benefícios
          </h2>
          {s.nota ? (
            <p style={{ fontSize: 13, color: '#888' }}>{s.nota}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <Row label="Pontos acumulados"      value={s.pontos} />
                <Row label="Pontos expiram em"      value={s.pontosExpiraEm} />
                <Row label="Cashback (crédito loja)" value={s.cashbackReais != null ? brl(Number(s.cashbackReais)) : undefined} />
              </tbody>
            </table>
          )}
        </section>

        {/* 3. Histórico de comandas */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111', borderBottom: '1px solid #ddd', paddingBottom: 6, marginBottom: 12 }}>
            3. Histórico de Atendimentos ({data.historicoComandasFechadas.length} registros)
          </h2>
          {data.historicoComandasFechadas.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>Nenhum atendimento registrado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#333' }}>Protocolo</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#333' }}>Abertura</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#333' }}>Fechamento</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#333' }}>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {data.historicoComandasFechadas.map((c, i) => (
                  <tr key={c.protocolo} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '5px 8px', color: '#666', fontFamily: 'monospace', fontSize: 10 }}>
                      {c.protocolo.substring(0, 18)}…
                    </td>
                    <td style={{ padding: '5px 8px', color: '#333' }}>{c.abertura}</td>
                    <td style={{ padding: '5px 8px', color: '#333' }}>{c.fechamento}</td>
                    <td style={{ padding: '5px 8px', color: '#333' }}>{c.pagamento}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.historicoComandasFechadas.length === 50 && (
            <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              * Exibindo os 50 atendimentos mais recentes. Para histórico completo, solicite ao administrador.
            </p>
          )}
        </section>

        {/* Rodapé legal */}
        <div style={{ borderTop: '1px solid #ddd', paddingTop: 16, fontSize: 11, color: '#888', lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Este documento foi gerado automaticamente pelo sistema Santuário Nerd em {data.geradoEm} (UTC)
            em atendimento ao exercício de direitos previstos no Art. 18 da Lei nº 13.709/2018 (LGPD).
            Os dados apresentados refletem o estado atual do cadastro no momento da geração.
          </p>
          <p style={{ margin: '6px 0 0' }}>
            <strong>Controlador:</strong> Santuário Nerd — José Bonifácio, SP |{' '}
            <strong>E-mail:</strong> privacidade@softnerd.com.br
          </p>
        </div>
      </div>
    </>
  )
}
