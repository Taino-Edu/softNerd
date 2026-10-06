'use client'
// Página pública de pagamento do crediário — é o link que vai no aviso de
// vencimento (WhatsApp/e-mail). Abre sem login: mostra o saldo, gera o Pix e
// confirma sozinha quando o pagamento cai.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { CheckCircle, Copy, Loader2, QrCode, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { pagarCrediarioApi, PagamentoCrediarioPix, PagamentoCrediarioResumo } from '@/lib/api'

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function mensagemErro(err: unknown, padrao: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao
}

export default function PagarCrediarioPage() {
  const { token } = useParams<{ token: string }>()

  const [resumo, setResumo]       = useState<PagamentoCrediarioResumo | null>(null)
  const [erro, setErro]           = useState<string | null>(null)
  const [pix, setPix]             = useState<PagamentoCrediarioPix | null>(null)
  const [gerando, setGerando]     = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [pago, setPago]           = useState(false)
  // O que pagar: esta conta inteira, todas as contas do cliente ou um valor escolhido
  const [modo, setModo]           = useState<'conta' | 'tudo' | 'valor'>('conta')
  const [valorTexto, setValorTexto] = useState('')
  const [tudoQuitado, setTudoQuitado] = useState(false)

  useEffect(() => {
    pagarCrediarioApi.resumo(token)
      .then(r => {
        setResumo(r.data)
        setPago(r.data.quitado)
        // Link vindo do "Pagar tudo" do perfil já abre com essa opção marcada
        if (r.data.outrasContas > 0 && new URLSearchParams(window.location.search).get('tudo') === '1') setModo('tudo')
      })
      .catch(err => setErro(mensagemErro(err, 'Não deu pra abrir este link agora.')))
  }, [token])

  // "1.234,56" (vírgula decimal) ou "12.50" (ponto decimal, sem vírgula)
  const valorEscolhido = Number(valorTexto.includes(',')
    ? valorTexto.replace(/\./g, '').replace(',', '.')
    : valorTexto)
  const valorAPagar = !resumo ? 0
    : modo === 'tudo'  ? resumo.saldoTodasEmReais
    : modo === 'valor' ? (Number.isFinite(valorEscolhido) ? valorEscolhido : 0)
    : resumo.saldoRestanteEmReais
  const valorInvalido = !!resumo && modo === 'valor' &&
    (!(valorEscolhido >= resumo.valorMinimoEmReais) || valorEscolhido > resumo.saldoRestanteEmReais)

  async function gerarPix() {
    if (valorInvalido) return
    setGerando(true)
    try {
      const { data: p } = await pagarCrediarioApi.gerarPix(token,
        modo === 'tudo'  ? { tudo: true }
        : modo === 'valor' ? { valorEmCentavos: Math.round(valorEscolhido * 100) }
        : {})
      setPix(p)
    } catch (err) {
      toast.error(mensagemErro(err, 'Não deu pra gerar o Pix agora.'))
    } finally {
      setGerando(false)
    }
  }

  /** `silencioso` = veio do relógio, não do botão: não enche a tela de aviso. */
  const verificar = useCallback(async (silencioso = false) => {
    if (!pix) return
    if (!silencioso) setVerificando(true)
    try {
      const { data: s } = await pagarCrediarioApi.statusPix(token, pix.txId)
      if (s.status === 'CONCLUIDA') {
        setPago(s.quitado)
        setTudoQuitado(s.saldoTodasEmReais <= 0)
        setResumo(prev => prev
          ? { ...prev, saldoRestanteEmReais: s.saldoRestanteEmReais, saldoTodasEmReais: s.saldoTodasEmReais, quitado: s.quitado }
          : prev)
        setPix(prev => prev ? { ...prev, status: 'CONCLUIDA' } : prev)
        if (!s.quitado) toast.success('Pagamento recebido!')
      } else if (!silencioso) {
        toast('Ainda não identificamos o pagamento. Tenta de novo em alguns segundos.')
      }
    } catch {
      if (!silencioso) toast.error('Erro ao conferir o pagamento.')
    } finally {
      if (!silencioso) setVerificando(false)
    }
  }, [pix, token])

  // Confere sozinho enquanto o QR está na tela — ninguém precisa clicar
  useEffect(() => {
    if (!pix || pix.status !== 'ATIVA') return
    const id = setInterval(() => { verificar(true) }, 6000)
    return () => clearInterval(id)
  }, [pix, verificar])

  async function copiar() {
    if (!pix?.pixCopiaCola) return
    try {
      await navigator.clipboard.writeText(pix.pixCopiaCola)
      toast.success('Código Pix copiado!')
    } catch {
      toast.error('Não deu pra copiar — segure no código e copie à mão.')
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        {erro ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm space-y-3">
            <Wallet className="w-10 h-10 mx-auto text-gray-300" />
            <p className="font-black text-gray-900">{erro}</p>
            <p className="text-sm text-gray-500">Confira se o link está completo ou fale com a loja.</p>
          </div>
        ) : !resumo ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : (
          <>
            <p className="text-center text-sm font-bold text-gray-500">{resumo.loja}</p>

            {pago ? (
              <div className="bg-white border border-emerald-100 rounded-2xl p-8 text-center shadow-sm space-y-3">
                <CheckCircle className="w-14 h-14 mx-auto text-emerald-500" />
                <p className="text-xl font-black text-gray-900">
                  {tudoQuitado && resumo.outrasContas > 0 ? 'Todas as contas quitadas ✅' : 'Conta quitada ✅'}
                </p>
                <p className="text-sm text-gray-500">
                  Valeu, {resumo.primeiroNome}! {tudoQuitado || resumo.saldoTodasEmReais <= 0
                    ? 'Não tem mais nada a pagar.'
                    : `Ainda tem ${brl(resumo.saldoTodasEmReais)} em outra conta — dá pra pagar pelo seu perfil.`}
                </p>
              </div>
            ) : (
              <>
                <div className={clsx(
                  'bg-white border rounded-2xl p-6 text-center shadow-sm space-y-1',
                  resumo.vencido ? 'border-red-100' : 'border-gray-100',
                )}>
                  <p className="text-sm text-gray-500">Olá, {resumo.primeiroNome}! Seu crediário:</p>
                  <p className="text-4xl font-black text-gray-900">{brl(resumo.saldoRestanteEmReais)}</p>
                  <p className={clsx('text-sm font-bold', resumo.vencido ? 'text-red-500' : 'text-gray-600')}>
                    {resumo.vencido
                      ? `Venceu em ${data(resumo.dataVencimento)} (${resumo.diasDeAtraso} ${resumo.diasDeAtraso === 1 ? 'dia' : 'dias'} de atraso)`
                      : `Vence em ${data(resumo.dataVencimento)}`}
                  </p>
                  {resumo.valorPagoEmReais > 0 && (
                    <p className="text-xs text-gray-400">
                      Já pago {brl(resumo.valorPagoEmReais)} de {brl(resumo.valorEmReais)}
                    </p>
                  )}
                </div>

                {!resumo.pixDisponivel ? (
                  <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center shadow-sm text-sm text-gray-500">
                    O pagamento por Pix não está disponível agora. Dá pra pagar direto no balcão da loja.
                  </div>
                ) : !pix ? (
                  <div className="space-y-3">
                    <div className="bg-white border border-gray-100 rounded-2xl p-2 shadow-sm space-y-1">
                      <Opcao ativo={modo === 'conta'} onClick={() => setModo('conta')}
                        titulo="Pagar esta conta" valor={brl(resumo.saldoRestanteEmReais)} />
                      {resumo.outrasContas > 0 && (
                        <Opcao ativo={modo === 'tudo'} onClick={() => setModo('tudo')}
                          titulo={`Pagar todas as contas (${resumo.outrasContas + 1})`}
                          detalhe="Um Pix só — quita primeiro a que vence antes"
                          valor={brl(resumo.saldoTodasEmReais)} />
                      )}
                      <Opcao ativo={modo === 'valor'} onClick={() => setModo('valor')}
                        titulo="Pagar outro valor" detalhe="Pague uma parte agora e o resto depois" />
                      {modo === 'valor' && (
                        <div className="px-3 pb-2">
                          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-violet-500">
                            <span className="text-sm font-bold text-gray-500">R$</span>
                            <input
                              autoFocus
                              inputMode="decimal"
                              placeholder="0,00"
                              value={valorTexto}
                              onChange={e => setValorTexto(e.target.value.replace(/[^\d,.]/g, ''))}
                              className="flex-1 text-lg font-black text-gray-900 outline-none bg-transparent"
                              aria-label="Valor a pagar"
                            />
                          </div>
                          {valorTexto && valorInvalido && (
                            <p className="text-xs text-red-500 mt-1">
                              {valorEscolhido > resumo.saldoRestanteEmReais
                                ? `Passa do que falta nesta conta (${brl(resumo.saldoRestanteEmReais)}).`
                                : `O mínimo é ${brl(resumo.valorMinimoEmReais)}.`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={gerarPix}
                      disabled={gerando || valorInvalido || valorAPagar <= 0}
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-black text-white bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {gerando ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                      {valorAPagar > 0 && !valorInvalido ? `Gerar Pix de ${brl(valorAPagar)}` : 'Gerar Pix'}
                    </button>
                  </div>
                ) : pix.status === 'CONCLUIDA' ? (
                  <div className="bg-white border border-emerald-100 rounded-2xl p-6 text-center shadow-sm space-y-2">
                    <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
                    <p className="font-black text-gray-900">Pagamento recebido!</p>
                    <p className="text-sm text-gray-500">
                      Ainda faltam {brl(resumo.saldoRestanteEmReais)} nesta conta.
                    </p>
                    <button
                      onClick={() => { setPix(null); setModo('conta'); setValorTexto('') }}
                      className="text-sm font-bold text-violet-600"
                    >
                      Pagar o restante
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
                    {pix.imagemQrCode && (
                      <img src={pix.imagemQrCode} alt="QR Code do Pix"
                        className="w-52 h-52 mx-auto rounded-xl border border-gray-200" />
                    )}
                    <p className="text-center text-lg font-black text-gray-900">{brl(pix.valorEmReais)}</p>
                    {pix.pixCopiaCola && (
                      <button onClick={copiar}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 transition-colors">
                        <Copy className="w-4 h-4" /> Copiar código Pix
                      </button>
                    )}
                    <p className="text-center text-xs text-gray-400">
                      No app do banco, escolha Pix → Copia e Cola. A confirmação aparece aqui sozinha.
                    </p>
                    <button onClick={() => verificar()} disabled={verificando}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-violet-600 text-violet-600 disabled:opacity-60">
                      {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Já paguei, conferir
                    </button>
                  </div>
                )}

                {resumo.compras.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Compras nesta conta</p>
                    <div className="space-y-1">
                      {resumo.compras.map((c, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-500">{data(c.data)}</span>
                          <span className="font-mono text-gray-700">{brl(c.valorEmReais)}</span>
                        </div>
                      ))}
                    </div>
                    <Link href="/cliente/perfil?tab=crediario" className="block text-center text-xs font-bold text-violet-600 mt-3">
                      Ver os itens no meu perfil
                    </Link>
                  </div>
                )}
              </>
            )}

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Pagamento direto pra conta da loja
            </p>
          </>
        )}
      </div>
    </main>
  )
}

function Opcao({ ativo, onClick, titulo, detalhe, valor }: {
  ativo: boolean
  onClick: () => void
  titulo: string
  detalhe?: string
  valor?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
        ativo ? 'bg-violet-50' : 'hover:bg-gray-50',
      )}
    >
      <span className={clsx(
        'w-4 h-4 rounded-full border-2 shrink-0',
        ativo ? 'border-violet-600 bg-violet-600 shadow-[inset_0_0_0_3px_white]' : 'border-gray-300',
      )} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-gray-900">{titulo}</span>
        {detalhe && <span className="block text-[11px] text-gray-500">{detalhe}</span>}
      </span>
      {valor && <span className="text-sm font-black text-gray-900 shrink-0">{valor}</span>}
    </button>
  )
}
