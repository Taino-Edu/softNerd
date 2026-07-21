'use client'
// =============================================================================
// admin/fiscal/cupom/[id]/page.tsx — Cupom NFC-e simplificado, pra imprimir na
// térmica ou mostrar na tela do caixa. Não é o DANFE oficial pixel-perfect,
// mas cobre os elementos essenciais: itens, total, chave de acesso, QR Code.
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fiscalApi, CupomDto } from '@/lib/api'

function fmtMoeda(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtChave(chave?: string) {
  if (!chave) return ''
  return chave.match(/.{1,4}/g)?.join(' ') ?? chave
}

export default function CupomNfcePage() {
  const params = useParams()
  const id = params?.id as string
  const [cupom, setCupom] = useState<CupomDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fiscalApi.obterCupom(id)
      .then(r => setCupom(r.data))
      .catch((err: unknown) => setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'Não foi possível carregar o cupom. Verifique se você está autenticado como administrador.',
      ))
  }, [id])

  const print = () => window.print()

  if (error) {
    return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#c00' }}><strong>Erro:</strong> {error}</div>
  }
  if (!cupom) {
    return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#555' }}>Carregando cupom...</div>
  }

  return (
    <>
      <style>{`
        @media print {
          .print-btn { display: none !important; }
          body { background: white !important; }
        }
        body { margin: 0; background: #eee; }
      `}</style>

      <div className="print-btn" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}>
        <button onClick={print} style={{
          background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif',
        }}>
          Imprimir
        </button>
      </div>

      <div style={{
        fontFamily: 'monospace', fontSize: 12, color: '#000', background: '#fff',
        width: 320, margin: '24px auto', padding: 16, lineHeight: 1.5,
      }}>
        <div style={{ textAlign: 'center', fontWeight: 700 }}>{cupom.razaoSocial || 'Empresa não configurada'}</div>
        <div style={{ textAlign: 'center' }}>CNPJ: {cupom.cnpj}</div>
        <div style={{ textAlign: 'center' }}>{cupom.endereco}</div>
        <hr />
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          {cupom.status === 'Cancelada' ? 'NFC-e CANCELADA' : 'DOCUMENTO AUXILIAR DA NFC-e'}
        </div>
        {cupom.status === 'AutorizadaContingencia' && (
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 11 }}>
            EMITIDA EM CONTINGÊNCIA — PENDENTE DE TRANSMISSÃO À SEFAZ
          </div>
        )}
        <hr />

        {cupom.itens.map((item, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div>{item.nome}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.quantidade} x {fmtMoeda(item.precoUnitarioCentavos)}</span>
              <span>{fmtMoeda(item.subtotalCentavos)}</span>
            </div>
          </div>
        ))}

        <hr />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>TOTAL</span>
          <span>{fmtMoeda(cupom.valorTotalCentavos)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Forma de pagamento</span>
          <span>{cupom.formaPagamento}</span>
        </div>
        <hr />

        <div>Série {cupom.serie} · Número {cupom.numero}</div>
        {cupom.emitidoEm && <div>Emissão: {new Date(cupom.emitidoEm).toLocaleString('pt-BR')}</div>}
        {cupom.protocolo && <div>Protocolo: {cupom.protocolo}</div>}

        {cupom.chaveAcesso && (
          <>
            <hr />
            <div style={{ textAlign: 'center', wordBreak: 'break-all' }}>{fmtChave(cupom.chaveAcesso)}</div>
            <div style={{ textAlign: 'center', fontSize: 10 }}>Consulte pela Chave de Acesso no site da SEFAZ</div>
          </>
        )}

        {cupom.qrCodeUrl && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            {/* Gera a imagem do QR a partir da URL montada no backend — serviço público gratuito */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(cupom.qrCodeUrl)}`}
              alt="QR Code NFC-e" width={140} height={140} style={{ margin: '0 auto' }}
            />
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 10, marginTop: 8 }}>
          Documento emitido eletronicamente pelo Santuário Nerd
        </div>
      </div>
    </>
  )
}
