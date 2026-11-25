'use client'
// =============================================================================
// AbrirComandaPelaConta — botão "Abrir minha comanda" na conta do cliente (v1.101.0, chave "comanda-pela-conta").
//
// Sem ler o QR Code da mesa. Se a trava "Só abre na loja" estiver ligada (Configurações do painel),
// pede a localização do celular uma vez e manda pra API medir a distância (a posição não é gravada).
// A comanda aberta chega pela tela por conta própria (evento ComandaOpened); onAberta só garante
// que ela apareça mesmo com o tempo real caído.
// =============================================================================
import { useEffect, useState } from 'react'
import { Loader2, MapPin, Receipt } from 'lucide-react'
import { comandaApi, ComandaPelaContaStatus } from '@/lib/api'

/** null enquanto carrega ou quando a API falha — aí a tela mostra só o jeito antigo (QR/balcão). */
export function useComandaPelaConta() {
  const [status, setStatus] = useState<ComandaPelaContaStatus | null>(null)
  useEffect(() => {
    comandaApi.pelaConta().then(r => setStatus(r.data)).catch(() => setStatus(null))
  }, [])
  return status
}

type Local = { latitude: number; longitude: number; precisaoMetros: number }

function pedirLocalizacao(): Promise<Local> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador não informa a localização. Leia o QR Code da mesa ou peça no balcão.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisaoMetros: Math.round(p.coords.accuracy) }),
      e => reject(new Error(e.code === e.PERMISSION_DENIED
        ? 'A localização está bloqueada pra este site. Libere nas configurações do navegador, ou leia o QR Code da mesa.'
        : 'Não deu pra pegar a localização agora. Tente de novo perto de uma janela, ou leia o QR Code da mesa.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  })
}

export function BotaoAbrirComanda({ precisaLocalizacao, cor, onAberta }: {
  precisaLocalizacao: boolean
  cor: string
  onAberta: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setAbrindo(true)
    setErro(null)
    try {
      const local = precisaLocalizacao ? await pedirLocalizacao() : undefined
      await comandaApi.abrirPelaConta(local)
      onAberta()
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (e instanceof Error && !('response' in e) ? e.message : null)
      setErro(msg ?? 'Não foi possível abrir a comanda agora. Tente de novo ou peça no balcão.')
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <div className="space-y-2 max-w-xs mx-auto">
      <button type="button" onClick={abrir} disabled={abrindo}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black text-white transition-all active:scale-95 disabled:opacity-70"
        style={{ backgroundColor: cor, boxShadow: '0 4px 14px rgba(30,79,214,0.28)' }}>
        {abrindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
        {abrindo ? (precisaLocalizacao ? 'Conferindo se você está na loja...' : 'Abrindo...') : 'Abrir minha comanda'}
      </button>
      {precisaLocalizacao && !erro && (
        <p className="text-[11px] font-semibold flex items-center justify-center gap-1" style={{ color: '#4D8FAC' }}>
          <MapPin className="w-3 h-3 shrink-0" /> Só abre na loja — o celular vai pedir sua localização.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs font-semibold rounded-lg px-3 py-2"
          style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#B91C1C', border: '1px solid rgba(220,38,38,0.2)' }}>
          {erro}
        </p>
      )}
    </div>
  )
}
