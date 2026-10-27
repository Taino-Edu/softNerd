'use client'

// =============================================================================
// /liga/torneio/[id] — Telão do torneio (público, sem login)
// Timer da rodada, mesas e classificação ao vivo (/hubs/torneio). docs/liguinha.md
// Telão no estilo da Liga Mensal com os sprites dos decks (components/liga/TelaoNovo.tsx).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { torneioApi, TorneioPublicoDto } from '@/lib/api'
import { useTorneioAoVivo } from '@/lib/useTorneioAoVivo'
import TelaoNovo from '@/components/liga/TelaoNovo'
import { useFuncionalidade } from '@/lib/useFuncionalidade'
import { rotasDoEvento } from '@/lib/caminhosTorneio'

export default function TelaoTorneioPage() {
  const { id } = useParams<{ id: string }>()
  const [t, setT] = useState<TorneioPublicoDto | null>(null)
  const [erro, setErro] = useState(false)
  const separado = useFuncionalidade('campeonato-separado') === true
  const pathname = usePathname()
  const router = useRouter()

  const recarregar = useCallback(() => {
    torneioApi.publico(id).then(r => { setT(r.data); setErro(false) }).catch(() => setErro(true))
  }, [id])

  useEffect(() => { recarregar() }, [recarregar])
  useTorneioAoVivo(id, recarregar)

  // Telão no endereço da outra modalidade (link antigo): vai pro endereço certo do evento
  useEffect(() => {
    if (!t || !separado) return
    const certo = rotasDoEvento(t.modalidade, true).telao(t.id)
    if (pathname && pathname !== certo) router.replace(certo)
  }, [t, separado, pathname, router])

  if (!t) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        {erro ? <p className="text-gray-400">Torneio não encontrado.</p> : <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />}
      </div>
    )
  }

  return <TelaoNovo t={t} />
}
