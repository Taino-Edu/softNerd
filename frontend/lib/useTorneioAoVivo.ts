// =============================================================================
// useTorneioAoVivo — tela da liguinha que se atualiza sozinha (/hubs/torneio)
//
// O servidor só avisa "mudou" (TorneioAtualizado); a tela chama `recarregar` e
// busca de novo pela API. Sem polling: no dia do torneio a loja inteira sai pelo
// mesmo IP e o limite de requisições é por IP. Se o hub cair, um refresh lento
// (60 s) segura a tela até reconectar.
//
// Avisos em sequência (vários resultados lançados juntos) viram UMA recarga, com
// atraso aleatório de até 1,5 s: 30 celulares não batem no servidor no mesmo instante.
// =============================================================================
'use client'

import { useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

export function useTorneioAoVivo(championshipId: string | null | undefined, recarregar: () => void) {
  const recarregarRef = useRef(recarregar)
  recarregarRef.current = recarregar

  useEffect(() => {
    if (!championshipId) return
    let parado = false
    let agendada: ReturnType<typeof setTimeout> | null = null
    const recarregarEspalhado = () => {
      if (agendada) return
      agendada = setTimeout(() => { agendada = null; recarregarRef.current() }, 300 + Math.random() * 1200)
    }

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${BASE_URL}/hubs/torneio`, { withCredentials: true })
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    hub.on('TorneioAtualizado', (e: { championshipId: string }) => {
      if (e?.championshipId === championshipId) recarregarEspalhado()
    })
    // Reconectou: pode ter perdido aviso no meio — entra de novo no grupo e recarrega
    hub.onreconnected(() => {
      hub.invoke('Acompanhar', championshipId).catch(() => {})
      recarregarEspalhado()
    })

    hub.start()
      .then(() => { if (!parado) return hub.invoke('Acompanhar', championshipId) })
      .catch(() => { /* sem hub: o refresh lento abaixo segura */ })

    const lento = setInterval(() => {
      if (hub.state !== signalR.HubConnectionState.Connected) recarregarRef.current()
    }, 60_000)

    return () => {
      parado = true
      clearInterval(lento)
      if (agendada) clearTimeout(agendada)
      hub.stop().catch(() => {})
    }
  }, [championshipId])
}
