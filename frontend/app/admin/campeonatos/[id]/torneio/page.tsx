'use client'

// /admin/campeonatos/[id]/torneio — Painel do organizador da liguinha.
// O conteúdo mora em components/liga/PainelTorneio.tsx (também usado na Central da Liguinha).
import { useParams } from 'next/navigation'
import PainelTorneio from '@/components/liga/PainelTorneio'

export default function PainelTorneioPage() {
  const { id } = useParams<{ id: string }>()
  return <PainelTorneio id={id} />
}
