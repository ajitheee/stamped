// Live permit state for the office screen: asks the API for a viewer socket grant, then follows the actor's state frames
// (one "state" on connect, a "state_update" with the changed fields after every change). Stand-in for the shared
// usePermit hook; swap the import when that lands.
import { useEffect, useState } from "react"

import type { PermitApplication } from "../../../api/src/contracts"

export type PermitState = Omit<PermitApplication, "id">
export type Connection = "connecting" | "live" | "reconnecting"

const RETRY_MS = 1500

export function usePermitLive(permitId: string): { state: PermitState | null; connection: Connection } {
  const [state, setState] = useState<PermitState | null>(null)
  const [connection, setConnection] = useState<Connection>("connecting")

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const again = () => {
      if (stopped) return
      setConnection("reconnecting")
      retry = setTimeout(connect, RETRY_MS)
    }

    async function connect() {
      try {
        const res = await fetch(`/api/permits/${encodeURIComponent(permitId)}/socket`, { method: "POST" })
        if (!res.ok) throw new Error(`socket grant failed: ${res.status}`)
        const { websocketUrl } = (await res.json()) as { websocketUrl: string }
        if (stopped) return
        socket = new WebSocket(websocketUrl)
        socket.onopen = () => setConnection("live")
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data))
          if (message.type === "state") setState(message.state)
          else if (message.type === "state_update") setState((s) => (s ? { ...s, ...message.changes } : s))
        }
        socket.onclose = again
      } catch {
        again()
      }
    }

    void connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      socket?.close()
    }
  }, [permitId])

  return { state, connection }
}
