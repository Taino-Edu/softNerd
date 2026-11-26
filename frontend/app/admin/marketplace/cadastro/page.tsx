'use client'
// Cadastro da carta (nova, etapa 2, ou editar com ?id=) — v1.102.0, chave "cadastro-carta-telas". Ver components/admin/CadastroCarta.tsx.
import { Suspense } from 'react'
import { CadastroCartaTela } from '@/components/admin/CadastroCarta'

// useSearchParams precisa de Suspense em volta (senão o build do Next recusa a página)
export default function Page() {
  return <Suspense fallback={null}><CadastroCartaTela /></Suspense>
}
