// Minimal API for building the office screen until the shared server.ts lands: npm run dev:server (port 3001).
// One route: POST /api/permits/:id/socket returns a socket grant with role "viewer". It never mints "clerk".
import "./agents/env"

import { createServer } from "node:http"

import { actors } from "../generated/index.js"

const PORT = Number(process.env.API_PORT ?? 3001)

createServer(async (req, res) => {
  const match = req.method === "POST" ? req.url?.match(/^\/api\/permits\/([\w-]+)\/socket$/) : null
  if (!match) {
    res.writeHead(404).end()
    return
  }
  try {
    const grant = await actors.Permit.prepareWebsocket({ actorId: match[1]!, metadata: { role: "viewer" } })
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(grant))
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(error) }))
  }
}).listen(PORT, "127.0.0.1", () => console.log(`office dev API on http://127.0.0.1:${PORT}`))
