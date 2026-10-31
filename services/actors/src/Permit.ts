// stamped — PermitActor. One instance per permit id; the single durable record agents write decisions to.
// Relay is for talking. This is for remembering. Screens read only this.
import { Actor, type ActorSocket, Persisted } from "durable-actors"

import {
  ALLOWED_TRANSITIONS,
  Deck,
  Finding,
  PermitApplication,
  Property,
  Status,
  type Event,
} from "../../../apps/api/src/contracts.js"

type Who = Event["actor"]
type FieldPatch = Partial<Deck> & { property?: Partial<PermitApplication["property"]> }

// Named apart from the FieldPatch type: sharing the name pulls Zod's types into the actor's public surface,
// which the Durable Actors declaration compiler cannot emit.
const FieldPatchSchema = Deck.partial().extend({ property: Property.partial().optional() }).strict()

// Fields can only change while nobody is reviewing them.
const EDITABLE: Status[] = ["INTAKE", "READY_FOR_REVIEW", "CORRECTIONS_REQUESTED"]

const event = (actor: Who, type: string, detail: string): Event => ({
  at: new Date().toISOString(),
  actor,
  type,
  detail,
})

export class Permit extends Actor<null, null, PermitApplication> {
  @Persisted private state: PermitApplication | null = null

  /** Sets state if empty; otherwise returns the existing record unchanged. */
  async init(app: PermitApplication): Promise<PermitApplication> {
    if (this.state) return this.state
    const parsed = PermitApplication.parse(app)
    if (parsed.id !== this.id) throw new Error(`Application id ${parsed.id} does not match permit ${this.id}`)
    return this.#commit({
      ...parsed,
      events: [...parsed.events, event("system", "CREATED", `Permit opened at ${parsed.status}`)],
    })
  }

  async get(): Promise<PermitApplication | null> {
    return this.state
  }

  async confirmFields(patch: FieldPatch, actor: Who): Promise<PermitApplication> {
    const s = this.#require()
    if (!EDITABLE.includes(s.status)) throw new Error(`Fields are locked while status is ${s.status}`)
    const { property, ...deck } = FieldPatchSchema.parse(patch)
    const confirmed = [
      ...Object.entries(deck).map(([k, v]) => event(actor, "FIELD_CONFIRMED", `deck.${k} = ${v}`)),
      ...Object.entries(property ?? {}).map(([k, v]) => event(actor, "FIELD_CONFIRMED", `property.${k} = ${v}`)),
    ]
    if (confirmed.length === 0) return s
    return this.#commit({
      ...s,
      deck: { ...s.deck, ...deck },
      property: { ...s.property, ...property },
      events: [...s.events, ...confirmed],
    })
  }

  /** The Clerk is the only status writer. Everyone else is rejected, as is any transition not in the contract. */
  async setStatus(to: Status, by: Who, why: string): Promise<PermitApplication> {
    const s = this.#require()
    const next = Status.parse(to)
    if (by !== "clerk") throw new Error(`Only the clerk can change status; ${by} tried ${s.status} → ${next}`)
    if (!ALLOWED_TRANSITIONS[s.status].includes(next)) throw new Error(`Cannot move from ${s.status} to ${next}`)
    return this.#commit({
      ...s,
      status: next,
      events: [...s.events, { ...event("clerk", "STATUS_CHANGED", why), from: s.status, to: next }],
    })
  }

  /** Reruns for the same rule and revision replace the earlier finding in place. */
  async addFinding(f: Finding): Promise<PermitApplication> {
    const s = this.#require()
    const finding = Finding.parse(f)
    if (finding.revision !== s.revision) {
      throw new Error(`Finding ${finding.findingId} is for revision ${finding.revision}; permit is at ${s.revision}`)
    }
    const i = s.findings.findIndex((x) => x.ruleId === finding.ruleId && x.revision === finding.revision)
    return this.#commit({
      ...s,
      findings: i === -1 ? [...s.findings, finding] : s.findings.map((x, j) => (j === i ? finding : x)),
      events: [...s.events, event(finding.reviewer, "FINDING_ADDED", `${finding.ruleId}: ${finding.status}`)],
    })
  }

  /** Old findings stay; they carry their own revision number. */
  async bumpRevision(by: Who): Promise<PermitApplication> {
    const s = this.#require()
    if (by !== "clerk") throw new Error(`Only the clerk can open a new revision; ${by} tried`)
    const revision = s.revision + 1
    return this.#commit({
      ...s,
      revision,
      events: [...s.events, event("clerk", "REVISION_BUMPED", `Revision ${revision} opened`)],
    })
  }

  async onConnect(socket: ActorSocket<null, PermitApplication>): Promise<void> {
    if (this.state) socket.send(this.state)
  }

  // Helpers use #private: the runtime treats every prototype method as a callable actor method and requires it async.
  // @Persisted saves on assignment, so every change builds a new object and assigns it once.
  #commit(next: PermitApplication): PermitApplication {
    this.state = next
    this.broadcast(next)
    return next
  }

  #require(): PermitApplication {
    if (!this.state) throw new Error(`Permit ${this.id} has not been created`)
    return this.state
  }
}
