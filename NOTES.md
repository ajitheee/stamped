# NOTES — where the docs differ from CLAUDE.md

## Durable Actors (v0.14.6, read 2026-10-31)

- **Runs on macOS/Linux only.** Needs Bun 1.4.2+, and the runtime ships no Windows build. On Windows, run the actor service in a GitHub Codespace (or WSL).
- **Entrypoint is `services/actors/src/actors.ts`**, loaded by `durable-actors dev`. `Permit` lives in `src/Permit.ts` and is re-exported there.
- **`broadcast(value)` JSON-encodes for you.** We broadcast the state object, not `JSON.stringify(state)` (that would double-encode). A new socket gets the current state from `onConnect`.
- **`@Persisted` saves on assignment only.** `this.state.events.push(...)` is not saved. Every Permit method builds a new state and assigns it once.
- **Clients don't open a fixed socket URL.** The backend calls `actors.Permit.prepareWebsocket({ actorId, metadata: null })` and gets a short-lived `websocketUrl` grant, which must be opened before `connectByMs`. So `GET /api/permits/:id/events` should hand out a grant, or proxy the socket.
- **Generated client:** run `bun run generate` with the dev server up. It writes `services/actors/generated/` (gitignored, as in their examples). Regenerate after changing actor methods. `actors.Permit.get(id).method()` works as CLAUDE.md assumed.
- **Reentrancy:** calls are serialized by default. `@Interleave` opts a method out and disables rollback for the whole class. Permit does not use it.

### Found while running it (not in the docs)

- **Every prototype method is an actor method and must be `async`.** TypeScript `private` doesn't hide a helper; the build fails with "actor method Permit.commit must be async". Use `#private` methods for sync helpers.
- **Don't give a Zod schema and a type the same name in an actor file.** If a public method uses that type, the declaration compiler also pulls in the schema's Zod type and fails with "Cannot resolve public type dependency strip". The patch schema is `FieldPatchSchema` for this reason.
- **Use Zod 3 in both `apps/api` and `services/actors`.** `durable-actors` itself depends on Zod 4. Without its own `zod@^3` dependency, `services/actors` resolves `zod` to that Zod 4 copy, and the generated client's types (copied from `contracts.ts`, written for Zod 3) silently become `any`. `generate` still prints "Type dependencies: zod@4.6.7"; ignore it.
- **Use Bun, not npm**, in both folders (`bun install`). The lockfiles are `bun.lock`.

## Running the actor service (Codespace)

```
export PATH=$HOME/.bun/bin:$PATH        # Bun is installed in the Codespace
cd /workspaces/stamped/services/actors
cp .env.example .env                    # once
bun install && bun run dev              # wait for "Connect your application"
bun run generate                        # second terminal, after changing actor methods
bun run accept                          # Step 1 acceptance; restart dev, then: bun run accept -- --after-restart
```

Step 1 acceptance passed on 2026-10-31: building rejected, clerk accepted, a skipped transition rejected, both sockets got the broadcast, and the status and event survived a restart.

## Small additions to the Step 1 spec

- `setStatus` and `bumpRevision` accept any actor in `by`, not only `"clerk"`, so the rejection of non-clerk callers can be shown at runtime.
- `init` appends a `CREATED` event and `bumpRevision` appends `REVISION_BUMPED`, so the audit timeline has a first line and shows revisions.

## Agent Relay

- Not read yet (Step 3).
