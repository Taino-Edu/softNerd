'use client'
// =============================================================================
// TravaLocalComanda — Configurações → "Comanda pela conta" (v1.101.0, só o dono).
//
// O cliente já abre a comanda pela conta (chave "comanda-pela-conta"). Esta trava é opcional:
// ligada, só abre com o celular dentro do raio da loja. Pra ligar, o dono marca onde a loja fica —
// o jeito mais fácil é apertar "Usar minha localização" estando DENTRO da loja.
// Vale pra loja toda (fica nas configurações do site, não nas preferências de quem está logado).
// =============================================================================
import { useEffect, useState } from 'react'
import { Loader2, LocateFixed, MapPin, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/Switch'
import { siteConfigApi, TravaLocalDto } from '@/lib/api'
import { useFuncionalidade } from '@/lib/useFuncionalidade'

const RAIOS = [100, 200, 300, 500, 1000] as const

export function TravaLocalComanda() {
  const chaveLigada = useFuncionalidade('comanda-pela-conta')
  const [trava, setTrava] = useState<TravaLocalDto | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [localizando, setLocalizando] = useState(false)

  useEffect(() => {
    siteConfigApi.travaLocal().then(r => setTrava(r.data)).catch(() => setTrava(null))
  }, [])

  async function salvar(nova: TravaLocalDto) {
    setSalvando(true)
    try {
      const { data } = await siteConfigApi.salvarTravaLocal(nova)
      setTrava(data)
      toast.success('Salvo!', { duration: 1500 })
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  function marcarAqui() {
    if (!trava) return
    if (!('geolocation' in navigator)) { toast.error('Este navegador não informa a localização.'); return }
    setLocalizando(true)
    navigator.geolocation.getCurrentPosition(
      p => {
        setLocalizando(false)
        if (p.coords.accuracy > 150)
          toast(`Sinal fraco (erro de ~${Math.round(p.coords.accuracy)} m). Se puder, tente de novo perto da porta.`, { icon: '📍' })
        salvar({ ...trava, latitude: round6(p.coords.latitude), longitude: round6(p.coords.longitude) })
      },
      e => {
        setLocalizando(false)
        toast.error(e.code === e.PERMISSION_DENIED
          ? 'Libere a localização pra este site nas configurações do navegador.'
          : 'Não deu pra pegar a localização agora. Tente de novo.')
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }

  if (!trava) {
    return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
  }

  const temLugar = trava.latitude != null && trava.longitude != null

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 leading-relaxed">
        {chaveLigada === false
          ? <>O botão <strong className="text-gray-200">Abrir minha comanda</strong> está desligado em Mudanças com volta — hoje a comanda só abre pelo QR Code da mesa ou pelo painel.</>
          : <>O cliente abre a comanda pela própria conta, sem ler o QR Code. Vale pra loja toda.</>}
      </p>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Só abre na loja</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Pede a localização do celular e só abre dentro do raio. Segura o cliente de casa, mas um GPS falso passa — é um freio, não um cadeado.
          </p>
        </div>
        <div className="shrink-0">
          <Switch ligado={trava.ligada} label="Só abre na loja" cor="marca"
            onChange={v => {
              if (v && !temLugar) { toast.error('Marque onde a loja fica antes de ligar.'); return }
              salvar({ ...trava, ligada: v })
            }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /> Onde a loja fica</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {temLugar
              ? <>Marcado em {trava.latitude!.toFixed(5)}, {trava.longitude!.toFixed(5)} · <a className="underline hover:text-gray-300" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps?q=${trava.latitude},${trava.longitude}`}>ver no mapa</a></>
              : 'Ainda não marcado. Aperte o botão estando dentro da loja.'}
          </p>
        </div>
        <button type="button" onClick={marcarAqui} disabled={localizando || salvando}
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-bold border bg-surface-700 border-surface-500 text-white hover:border-brand-400 disabled:opacity-60 transition-all">
          {localizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
          {temLugar ? 'Marcar de novo aqui' : 'Usar minha localização'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Raio</p>
          <p className="text-xs text-gray-500 mt-0.5">Dentro de prédio o GPS erra de 20 a 100 m — raio curto barra quem está no balcão.</p>
        </div>
        <div className="flex gap-1">
          {RAIOS.map(r => (
            <button key={r} type="button" disabled={salvando}
              onClick={() => salvar({ ...trava, raioMetros: r })}
              className={trava.raioMetros === r
                ? 'h-8 px-2.5 rounded text-xs font-bold border bg-accent-green/20 border-accent-green/60 text-accent-green'
                : 'h-8 px-2.5 rounded text-xs font-bold border bg-surface-700 border-surface-500 text-gray-400'}>
              {r >= 1000 ? `${r / 1000} km` : `${r} m`}
            </button>
          ))}
        </div>
      </div>

      {salvando && <p className="text-[11px] text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</p>}
    </div>
  )
}

/** Ícone da seção, junto pra página não precisar importar. */
export const IconeComandaPelaConta = <Receipt className="w-5 h-5 text-brand-400" />

/** 6 casas ≈ 10 cm: mais que isso é ruído do GPS. */
function round6(n: number) { return Math.round(n * 1e6) / 1e6 }
