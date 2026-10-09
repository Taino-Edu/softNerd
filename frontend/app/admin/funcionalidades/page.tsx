'use client'
// /admin/funcionalidades — chaves de funcionalidade ("mudança com volta")
//
// Mudança grande entra ligada, com o jeito antigo guardado no código. Se der problema
// em produção, o dono desliga aqui e o sistema volta na hora, sem deploy.
// Catálogo: CardGameStore/Configuration/Funcionalidades.cs

import { useEffect, useState } from 'react'
import { Loader2, RotateCcw, CalendarClock } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { funcionalidadesApi, FuncionalidadeDto } from '@/lib/api'
import { diaBR, dataHoraBR, hojeBrasil } from '@/lib/format'

export default function FuncionalidadesPage() {
  const [lista, setLista] = useState<FuncionalidadeDto[]>()
  const [salvando, setSalvando] = useState<string>()

  useEffect(() => {
    funcionalidadesApi.painel()
      .then(r => setLista(r.data))
      .catch(() => { setLista([]); toast.error('Não foi possível carregar as chaves.') })
  }, [])

  async function definir(f: FuncionalidadeDto, ligada: boolean) {
    const aviso = ligada
      ? `Ligar "${f.nome}"?\n\n${f.oQueMuda}`
      : `Voltar pro jeito antigo em "${f.nome}"?\n\n${f.seDesligar}\n\nVale na hora, pra todo mundo.`
    if (!confirm(aviso)) return

    setSalvando(f.codigo)
    try {
      const { data } = await funcionalidadesApi.definir(f.codigo, ligada)
      setLista(atual => atual?.map(x => x.codigo === data.codigo ? data : x))
      toast.success(ligada ? 'Ligada.' : 'Voltou pro jeito antigo.')
    } catch {
      toast.error('Não foi possível salvar. Tente de novo.')
    } finally {
      setSalvando(undefined)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-4xl">
      <Toaster position="top-center" />
      <PageHeader
        title="Mudanças com volta"
        subtitle="Mudanças grandes do sistema entram aqui. Se uma delas der problema, desligue e o sistema volta ao jeito antigo na hora."
      />

      {lista === undefined && (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      )}

      {lista?.length === 0 && (
        <div className="card text-sm text-gray-400">Nenhuma mudança com volta no momento.</div>
      )}

      {lista?.map(f => {
        const foraDoPadrao = f.ligada !== f.padrao
        const passouDaRevisao = f.revisarEm <= hojeBrasil()
        return (
          <div key={f.codigo} className="card space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-white">{f.nome}</h2>
                  {f.ligada
                    ? <Badge tone="success">Jeito novo</Badge>
                    : <Badge tone="warning" icon={<RotateCcw className="w-3 h-3" />}>Jeito antigo</Badge>}
                </div>
                <p className="text-xs text-gray-400">desde a {f.desde} · <code>{f.codigo}</code></p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {salvando === f.codigo && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                <Switch
                  ligado={f.ligada}
                  onChange={v => definir(f, v)}
                  label={`${f.nome}: ${f.ligada ? 'jeito novo' : 'jeito antigo'}`}
                  disabled={salvando !== undefined}
                />
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500 font-bold">Ligada (jeito novo)</dt>
                <dd className="text-gray-300 mt-0.5">{f.oQueMuda}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500 font-bold">Desligada (jeito antigo)</dt>
                <dd className="text-gray-300 mt-0.5">{f.seDesligar}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              {f.alteradaEm
                ? <span>Mudada por {f.alteradaPor || 'alguém'} em {dataHoraBR(f.alteradaEm)}</span>
                : <span>Nunca mexida: está no padrão</span>}
              <span className="flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" />
                {passouDaRevisao
                  ? <span className="txt-alerta">Hora de revisar: se não deu problema, o jeito antigo pode ser apagado do código</span>
                  : <>Revisar em {diaBR(f.revisarEm)}</>}
              </span>
              {foraDoPadrao && <span className="txt-alerta">Fora do padrão</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
