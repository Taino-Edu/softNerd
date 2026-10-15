'use client'
// useSiteConfig — Personalizar Site (nome, cores, logo) pra componentes que aparecem em toda
// página (rodapé geral). Uma requisição por carga de página, dividida entre quem pergunta,
// igual ao useFuncionalidade. Falhou: devolve null e o componente fica no padrão dele.

import { useEffect, useState } from 'react'
import { siteConfigApi, SiteConfigDto } from '@/lib/api'

let pedido: Promise<SiteConfigDto | null> | null = null

function carregar() {
  pedido ??= siteConfigApi.get()
    .then(r => r.data)
    .catch(() => {
      pedido = null // deixa tentar de novo na próxima tela
      return null
    })
  return pedido
}

export function useSiteConfig(): SiteConfigDto | null {
  const [cfg, setCfg] = useState<SiteConfigDto | null>(null)

  useEffect(() => {
    let vivo = true
    carregar().then(c => { if (vivo) setCfg(c) })
    return () => { vivo = false }
  }, [])

  return cfg
}
