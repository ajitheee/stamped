// Step 1 acceptance. With `bun run dev` running:
//   bun run accept                    → creates a permit, checks the Clerk-only rule and the broadcast
//   restart `bun run dev`, then
//   bun run accept -- --after-restart → checks the same permit survived
import { readFileSync, writeFileSync } from "node:fs"

import { DEMO_APPLICATION, type PermitApplication } from "../../../apps/api/src/contracts.js"
import { actors } from "../generated/index.js"

const ID_FILE = new URL("../.accept-id", import.meta.url)

function check(ok: boolean, label: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`)
  if (!ok) process.exitCode = 1
}

async function rejects(call: Promise<unknown>): Promise<boolean> {
  try {
    await call
    return false
  } catch {
    return true
  }
}

async function until(done: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms
  while (!done() && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  return done()
}

async function listen(id: string) {
  const { websocketUrl } = await actors.Permit.prepareWebsocket({ actorId: id, metadata: null })
  const socket = new WebSocket(websocketUrl)
  const received: PermitApplication[] = []
  socket.addEventListener("message", (e) => received.push(JSON.parse(String(e.data))))
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve)
    socket.addEventListener("error", reject)
  })
  return { socket, received }
}

if (process.argv.includes("--after-restart")) {
  const id = readFileSync(ID_FILE, "utf8").trim()
  const state = await actors.Permit.get(id).get()
  check(state?.status === "IN_REVIEW", `${id} is still IN_REVIEW after restart`)
  check(
    !!state?.events.some((e) => e.type === "STATUS_CHANGED" && e.from === "READY_FOR_REVIEW" && e.to === "IN_REVIEW"),
    "STATUS_CHANGED event survived restart",
  )
} else {
  const id = `accept-${Date.now()}`
  const permit = actors.Permit.get(id)
  await permit.init({ ...DEMO_APPLICATION, id })
  const a = await listen(id)
  const b = await listen(id)

  check(await rejects(permit.setStatus("IN_REVIEW", "building", "Building tries to start review")), "building cannot change status")
  check(await rejects(permit.setStatus("PRE_REVIEW_COMPLETE", "clerk", "Skipping review")), "clerk cannot skip a step")
  const after = await permit.setStatus("IN_REVIEW", "clerk", "Starting pre-review")
  check(after.status === "IN_REVIEW", "clerk moves READY_FOR_REVIEW → IN_REVIEW")

  const sawReview = (s: { received: PermitApplication[] }) => s.received.some((x) => x.status === "IN_REVIEW")
  check(await until(() => sawReview(a) && sawReview(b)), "both sockets received the broadcast")
  a.socket.close()
  b.socket.close()

  writeFileSync(ID_FILE, id)
  console.log("\nNow restart `bun run dev`, then run: bun run accept -- --after-restart")
}
