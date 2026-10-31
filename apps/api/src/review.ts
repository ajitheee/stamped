// stamped — review runner. Applies the deterministic rules to a frozen revision and records findings.
// No LLM and no status changes here: status moves only through the Clerk's socket (clerk-socket.ts).
import { actors } from "../generated/index.js"
import { blocksStamp, currentFindings, type Deck, type Finding, type PermitApplication } from "./contracts"
import { ALL_RULES, FIELD_TO_RULES, type RuleId, runRule } from "./rules"

type PermitState = Omit<PermitApplication, "id">

/** Runs the given rules against the frozen deck of the current revision and records each finding. */
export async function runRules(permitId: string, ruleIds: readonly RuleId[]): Promise<Finding[]> {
  const permit = actors.Permit.get(permitId)
  const state = await permit.read()
  const frozen = state.revisions.find((r) => r.revision === state.revision)
  if (!frozen) throw new Error(`Revision ${state.revision} of ${permitId} has not been frozen by the Clerk`)
  const input = { permitId, revision: state.revision, deck: frozen.deck, property: state.property }
  const findings = ruleIds.map((ruleId) => runRule(ruleId, input))
  for (const f of findings) await permit.addFinding(f)
  return findings
}

/** Deck fields that differ between the current frozen revision and the one before it. Read from the record, not the message. */
export function changedFields(state: PermitState): string[] {
  const current = state.revisions.find((r) => r.revision === state.revision)
  const previous = state.revisions.find((r) => r.revision === state.revision - 1)
  if (!current || !previous) return []
  return (Object.keys(current.deck) as (keyof Deck)[])
    .filter((k) => current.deck[k] !== previous.deck[k])
    .map((k) => `deck.${k}`)
}

/** Rules touched by a set of changed fields, in checklist order. */
export function affectedRules(fields: string[]): RuleId[] {
  const hit = new Set(fields.flatMap((field) => FIELD_TO_RULES[field] ?? []))
  return ALL_RULES.filter((ruleId) => hit.has(ruleId))
}

/** The Clerk's call once both reviewers report: any open CORRECTION or NEEDS_INFORMATION sends it back. */
export function decide(state: PermitState): "CORRECTIONS_REQUESTED" | "PRE_REVIEW_COMPLETE" {
  return currentFindings(state.findings).some(blocksStamp) ? "CORRECTIONS_REQUESTED" : "PRE_REVIEW_COMPLETE"
}
