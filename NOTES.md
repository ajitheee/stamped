# NOTES

## PermitActor API (`services/actors/src/Permit.ts`)

One actor per permit, addressed by the permit id. Each contract key is its own `@Persisted @Emittable` field with the same name, so a socket gets `{ type: "state", state }` on connect and `{ type: "state_update", changes }` after every change.

**Applicant side (RPC)**
- `read()` returns the whole record minus `id`.
- `appendChat(message)`
- `setProperty(property)` and `applyIntakePatch({ deck, missingFields, unknownFields })` throw once the draft is confirmed.
- `confirmIntake(at)` locks the draft. It is idempotent and throws while `missingMinimum()` is not empty.
- `submitRevision({ deck, changedFields })` works only at CORRECTIONS_REQUESTED and returns the new revision. One submit per round: a second one before the Clerk freezes it is refused.

**Office side (RPC)**
- `addFinding(finding)` works only IN_REVIEW and only for the current revision. A rerun of the same rule and revision replaces it.
- `logRelay(relayKey, entry)` appends one `relayLog` line per key and returns `false` for a redelivered message.
- `claim(receiver, relayKey)` returns `true` only the first time that receiver sees the message. Call it before acting on any Relay message.

**Status (socket only, no RPC)**
- Send `{ type: "setStatus", to, why, requestId }`. The reply is `{ type: "ack", requestId, status }` or `{ type: "denied", requestId, reason }`.
- It is accepted only if the socket's grant has `metadata.role === "clerk"` and `ALLOWED_TRANSITIONS` allows the move. `apps/api/src/clerk-socket.ts` wraps this.
- READY_FOR_REVIEW needs a confirmed intake and freezes revision 1. REVISED freezes the submitted revision. Rules read these frozen copies.
- PRE_REVIEW_COMPLETE needs findings for the current revision and no open CORRECTION or NEEDS_INFORMATION (`blocksStamp`).
- Socket metadata is `{ role: "applicant" | "clerk" | "building" | "zoning" | "viewer" }`. **`POST /api/permits/:id/socket` must mint only `"applicant"` or `"viewer"`.** Only the Clerk's backend mints `"clerk"`.
- **Not signed yet:** dev runs with "Authentication is disabled" until `DURABLE_ACTORS_SECRET` is set on both sides.

## Rules (`apps/api/src/rules.ts`)

- Rules read the frozen deck. `null` means not provided.
- Every finding has `citation` and `evidence`.
- **SJ-PERMIT-01** has five triggers: area ≥ 200 sq ft, ≥ 30 in at any point, attached, serves an exit door, serves as a door landing. Any one trigger means a permit is required, even if other answers are unknown.
- **CRC-GUARD-01** cites 2025 CRC R321.1.1 and R321.1.2. A guard is required above 30 in; deck guards must be at least 42 in. Its constant is separate from the permit trigger's.
- **SJ-DETAIL-01** checks only that a ledger connection is described.
- **SJ-ZONING-01** is always NEEDS_HUMAN_VERIFICATION, including when the zoning district wasn't retrieved, because a homeowner can't supply a district and NEEDS_INFORMATION would block the stamp forever. It flags any overlay.
- **Citations are not verified by the office side.** The San Jose site blocked an automated fetch. Check them against the city pages before the demo.

## API (`apps/api`)

- **Actor client:** generated into `apps/api/generated/` (gitignored) from the running actor service: `cp .env.example .env`, `bun install`, `bun run generate`. Rerun `generate` after the actor's methods change.
- **`review.ts`:**
  - `runRules(id, ruleIds)` runs rules on the current frozen revision.
  - `changedFields(state)` compares frozen revisions, so it doesn't trust the message.
  - `affectedRules(fields)`.
  - `decide(state)` returns the Clerk's call.
- **`moduleResolution: bundler`**, because `rules.ts` imports `./contracts` without an extension. Under Node, run the agents with `tsx`.
- **Acceptance:** `bun run accept` covers intake, the Clerk-only status, the four demo findings, a refused early stamp, two revisions that each rerun only the affected rule, the stamp, Relay de-duplication, and a viewer socket seeing every status live. That's 20 checks. Then restart the actor service and run `bun run accept -- --after-restart` (2 checks). All passed on 2026-10-31.

## Durable Actors (v0.14.6)

- **macOS/Linux only:** it needs Bun 1.4.2+ and ships no Windows build. Office code is tested in a GitHub Codespace. The demo runs on the applicant side's Mac (dev binds to loopback).
- **Entrypoint:** `services/actors/src/actors.ts` re-exports `Permit`.
- **Saving:** `@Persisted` saves on assignment only. Reassign arrays and objects; never push or mutate in place.
- **Async methods:** every prototype method is a callable actor method and must be `async`, so TypeScript `private` doesn't hide one. Sync helpers work as `#private` methods.
- **Zod schema names:** don't give a Zod schema and a type the same name in an actor file. The declaration compiler then fails with "Cannot resolve public type dependency strip".
- **Zod 3 in both folders:** `durable-actors` brings Zod 4. Without its own `zod@^3`, `services/actors` picks up Zod 4, and the generated client's types silently become `any`. `generate` still prints "Type dependencies: zod@4.6.7"; ignore it.
- **Bun, not npm:** use Bun in both folders. The lockfiles are `bun.lock`.

## Running the actor service (Codespace)

```
export PATH=$HOME/.bun/bin:$PATH
cd /workspaces/stamped/services/actors && cp .env.example .env && bun install && bun run dev
cd /workspaces/stamped/apps/api && cp .env.example .env && bun install && bun run generate && bun run accept
```

## Agent Relay (from the applicant side; office side has not used it yet)

- Pin `@agent-relay/sdk@15.0.1`. It is confirmed as the latest on npm and needs Node 22+. The docs page shows v7.
- Pass `workspaceKey` and `baseUrl` in code. `arws_` keys use `https://armadillo.agentrelay.com/`; `rklive_` keys use the default.
- Register intake, clerk, building and zoning once, share the tokens, and reconnect on boot.
- Post at the channel's top level. Delivery is at least once, so de-duplicate with `claim` and `logRelay`, never in memory.
- Run agents under Node.
