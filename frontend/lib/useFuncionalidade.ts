'use client'
// useFuncionalidade — a chave de funcionalidade está ligada? (docs/mapa/README.md → "Mudança grande")
//
//   const novo = useFuncionalidade('codigo-da-chave')
//   if (novo === undefined) return <Carregando />   // ainda não sabe
//   return novo ? <TelaNova /> : <TelaAntiga />
//
// Uma requisição por carga de página, dividida entre todos os componentes que perguntam.
// Se a API falhar, devolve false: na dúvida, o jeito antigo (que já funcionava).

import { useEffect, useState } from 'react'
import { funcionalidadesApi } from '@/lib/api'

let pedido: Promise<Record<string, boolean>> | null = null

function carregar() {
  pedido ??= funcionalidadesApi.estado()
    .then(r => r.data)
    .catch(() => {
      pedido = null // deixa tentar de novo na próxima tela
      return {}
    })
  return pedido
}

export function useFuncionalidade(codigo: string): boolean | undefined {
  const [ligada, setLigada] = useState<boolean>()

  useEffect(() => {
    let vivo = true
    carregar().then(estado => { if (vivo) setLigada(estado[codigo] ?? false) })
    return () => { vivo = false }
  }, [codigo])

  return ligada
}
