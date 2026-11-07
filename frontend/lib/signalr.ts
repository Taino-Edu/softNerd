// =============================================================================
// lib/signalr.ts — Cliente SignalR para atualizações em tempo real
//
// Transportes (ordem de preferência):
//   1. WebSockets  — mais rápido, full-duplex, baixa latência
//   2. SSE         — fallback se WS bloqueado por proxy/firewall
//   3. LongPolling — último recurso
// =============================================================================
import * as signalR from '@microsoft/signalr'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

let connection: signalR.HubConnection | null = null
let iniciando: Promise<void> | null = null
let usuarios = 0
let paradaAgendada: ReturnType<typeof setTimeout> | null = null
const ouvintesEstado = new Set<(conectado: boolean) => void>()

// Quem sai de uma tela e entra em outra (ou o Strict Mode do React em dev) larga e
// pega o hub quase junto. Parar na hora derrubava a conexão que a tela nova acabava
// de receber; esperar um pouco deixa a próxima tela aproveitar a mesma conexão.
const GRACA_PARADA_MS = 1500

function avisaEstado() {
  const conectado = connection?.state === signalR.HubConnectionState.Connected
  ouvintesEstado.forEach(ouvinte => ouvinte(conectado))
}

/** Avisa quando a conexão cai, reconecta ou volta. Devolve a função que cancela. */
export function ouvirEstadoHub(ouvinte: (conectado: boolean) => void): () => void {
  ouvintesEstado.add(ouvinte)
  return () => { ouvintesEstado.delete(ouvinte) }
}

export function getComandaHub(): signalR.HubConnection {
  if (!connection) {
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${BASE_URL}/hubs/comanda`, {
        // Token via cookie HttpOnly — browser envia automaticamente
        withCredentials: true,
        // WebSocket primeiro (mais rápido), depois SSE, depois LongPolling
        transport: signalR.HttpTransportType.WebSockets |
                   signalR.HttpTransportType.ServerSentEvents |
                   signalR.HttpTransportType.LongPolling,
      })
      // Reconecta imediatamente, depois 1s, 2s, 5s, 10s, 10s, 10s...
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          if (ctx.previousRetryCount === 0) return 0
          if (ctx.previousRetryCount === 1) return 1000
          if (ctx.previousRetryCount === 2) return 2000
          if (ctx.previousRetryCount <= 5)  return 5000
          return 10000
        }
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build()
    connection.onclose(avisaEstado)
    connection.onreconnecting(avisaEstado)
    connection.onreconnected(avisaEstado)
  }
  return connection
}

/** Liga o hub se estiver parado e espera a conexão. Várias chamadas dividem a mesma partida. */
export async function garanteHub(): Promise<signalR.HubConnection> {
  const hub = getComandaHub()
  if (hub.state === signalR.HubConnectionState.Disconnected && !iniciando) {
    iniciando = hub.start().finally(() => { iniciando = null; avisaEstado() })
  }
  if (iniciando) await iniciando
  return hub
}

/**
 * Rede de segurança do tempo real: enquanto o hub NÃO está conectado, roda `recarregar`
 * a cada `cadaMs` e tenta religar. Conectado, não faz nada (sem polling à toa: o limite
 * de requisições é por IP e a loja inteira sai pelo mesmo). Devolve a função que cancela.
 */
export function recarregarSeDesconectado(recarregar: () => void, cadaMs = 30_000): () => void {
  const id = setInterval(() => {
    if (connection?.state === signalR.HubConnectionState.Connected) return
    garanteHub().catch(() => {})
    recarregar()
  }, cadaMs)
  return () => clearInterval(id)
}

/** Cada tela que usa o hub chama startHub ao montar e stopHub ao desmontar. */
export async function startHub(): Promise<signalR.HubConnection> {
  usuarios++
  if (paradaAgendada) {
    clearTimeout(paradaAgendada)
    paradaAgendada = null
  }
  return garanteHub()
}

export function stopHub() {
  usuarios = Math.max(0, usuarios - 1)
  if (usuarios > 0 || paradaAgendada) return
  paradaAgendada = setTimeout(() => {
    paradaAgendada = null
    if (usuarios > 0) return
    const parar = connection
    connection = null
    parar?.stop().catch(() => {})
    avisaEstado()
  }, GRACA_PARADA_MS)
}

// Tipos dos eventos SignalR
export interface ComandaUpdatedEvent {
  comandaId: string; userId: string; userName: string
  tableIdentifier: string | null; totalInReais: number
  status: string; lastItemAdded: string | null; updatedAt: string
}

export interface ComandaOpenedEvent {
  comandaId: string
  tableIdentifier: string | null
}

export interface ComandaClosedEvent {
  comandaId: string
  paymentMethod: string
}

export interface ComandaCancelledEvent {
  comandaId: string
}
