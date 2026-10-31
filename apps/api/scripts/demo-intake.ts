// Step 3 acceptance: plays the applicant side over Agent Relay to drive the office agents end to end.
// Needs the actor service and the agents running (npm run agents). Then: npm run demo:intake [permit-id]
// Open /office/<permit-id> first to watch it live; DEMO_PAUSE_MS=4000 pauses between rounds for an audience.
import "../src/agents/env"

import { actors } from "../generated/index.js"
import { connect } from "../src/agents/relay"
import { permitChannel, type PermitApplication, type Property } from "../src/contracts"

type State = Omit<PermitApplication, "id">

// Test-only property. The applicant side fills the real one from the San Jose GIS lookup.
const PROPERTY: Property = {
  address: "770 Lincoln Ave, San Jose, CA 95126",
  lat: 0,
  lng: 0,
  apn: "00000000",
  parcelId: "test",
  zoning: "R-1-8",
  zoningBase: "R-1-8",
  zoningOverlay: null,
  rezoningFile: null,
  lookupConfidence: 100,
  source: "fixture",
  fetchedAt: new Date().toISOString(),
}

function check(ok: boolean, label: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`)
  if (!ok) process.exitCode = 1
}

const id = process.argv[2] ?? `relay-${Date.now()}`
const permit = actors.Permit.get(id)
const pause = () => new Promise((r) => setTimeout(r, Number(process.env.DEMO_PAUSE_MS ?? 0)))

async function waitFor(label: string, done: (s: State) => boolean, ms = 90_000): Promise<State> {
  const end = Date.now() + ms
  for (;;) {
    const s = await permit.read()
    if (done(s)) return s
    if (Date.now() > end) {
      check(false, `timed out waiting for ${label} (status ${s.status}, revision ${s.revision})`)
      return s
    }
    await new Promise((r) => setTimeout(r, 500))
  }
}
const sentBack = (revision: number) => (s: State) =>
  s.status === "CORRECTIONS_REQUESTED" && s.relayLog.some((l) => l.type === "NEEDS_INPUT" && l.revision === revision)

// Intake fills and confirms the draft, opens the permit's channel and invites the office.
await permit.setProperty(PROPERTY)
await permit.applyIntakePatch({
  deck: { lengthFt: 16, widthFt: 12, maxHeightIn: 36, attached: true, guardHeightIn: 36 },
  missingFields: [],
  unknownFields: [],
})
await permit.confirmIntake(new Date().toISOString())
const intake = await connect("intake")
await intake.client.channels.create({ name: permitChannel(id), topic: `Pre-review of ${PROPERTY.address}` })
for (const agent of ["clerk", "building", "zoning"]) await intake.client.channels.invite(permitChannel(id), agent)
console.log(`#${permitChannel(id)} open; asking the Clerk for pre-review`)

await intake.send({ permitId: id, revision: 1, type: "REVIEW_REQUEST", payload: {} }, "Homeowner confirmed the deck application and asked for pre-review.")
const r1 = await waitFor("revision 1 decision", sentBack(1))
const statuses = Object.fromEntries(r1.findings.map((f) => [f.ruleId, f.status]))
check(
  statuses["SJ-PERMIT-01"] === "PASS" && statuses["CRC-GUARD-01"] === "CORRECTION" &&
    statuses["SJ-DETAIL-01"] === "NEEDS_INFORMATION" && statuses["SJ-ZONING-01"] === "NEEDS_HUMAN_VERIFICATION",
  `revision 1 findings: ${Object.entries(statuses).map(([r, s]) => `${r} ${s}`).join(", ")}`,
)

await pause()
const rev2 = await permit.submitRevision({ deck: { guardHeightIn: 42 }, changedFields: ["deck.guardHeightIn"] })
await intake.send({ permitId: id, revision: rev2, type: "REVISION_SUBMITTED", payload: { changedFields: ["deck.guardHeightIn"] } }, "Homeowner raised the guard to 42 in.")
const r2 = await waitFor("revision 2 decision", sentBack(2))
const rerun2 = r2.findings.filter((f) => f.revision === 2)
check(rerun2.length === 1 && rerun2[0]?.ruleId === "CRC-GUARD-01" && rerun2[0].status === "PASS", `revision 2 reran: ${rerun2.map((f) => `${f.ruleId} ${f.status}`).join(", ")}`)

await pause()
const rev3 = await permit.submitRevision({ deck: { ledgerType: "1/2 in through-bolts" }, changedFields: ["deck.ledgerType"] })
await intake.send({ permitId: id, revision: rev3, type: "REVISION_SUBMITTED", payload: { changedFields: ["deck.ledgerType"] } }, "Homeowner described the ledger: 1/2 in through-bolts.")
const r3 = await waitFor("PRE_REVIEW_COMPLETE", (s) => s.status === "PRE_REVIEW_COMPLETE")
check(r3.status === "PRE_REVIEW_COMPLETE", `final status ${r3.status} at revision ${r3.revision}`)

const senders = new Set(r3.relayLog.map((l) => l.sender))
check(["intake", "clerk", "building", "zoning"].every((s) => senders.has(s as never)), `relay log has all four agents (${r3.relayLog.length} lines)`)
const channel = await intake.client.messages.list(permitChannel(id), { limit: 100 })
check(channel.length >= r3.relayLog.length, `#${permitChannel(id)} holds ${channel.length} messages`)

console.log("\nOffice feed (relayLog):")
for (const l of r3.relayLog) console.log(`  r${l.revision} ${l.sender.padEnd(8)} ${l.type.padEnd(18)} ${l.text}`)
process.exit()
