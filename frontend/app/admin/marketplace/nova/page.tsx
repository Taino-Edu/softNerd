'use client'
// Nova carta, etapa 1: escolher a carta no catálogo (v1.102.0, chave "cadastro-carta-telas"). Ver components/admin/CadastroCarta.tsx.
import { Suspense } from 'react'
import { EscolherCartaTela } from '@/components/admin/CadastroCarta'

// useSearchParams precisa de Suspense em volta (senão o build do Next recusa a página)
export default function Page() {
  return <Suspense fallback={null}><EscolherCartaTela /></Suspense>
}
