// stamped — shared contracts. THE agreement between the office (Kris) and the applicant (teammate).
// Nobody changes this file without telling the other person.
import { z } from "zod";

// ---------- Status machine (Clerk is the only writer) ----------
export const Status = z.enum([
  "INTAKE",
  "READY_FOR_REVIEW",
  "IN_REVIEW",
  "CORRECTIONS_REQUESTED",
  "REVISED",
  "PRE_REVIEW_COMPLETE",
]);
export type Status = z.infer<typeof Status>;

export const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  INTAKE: ["READY_FOR_REVIEW"],
  READY_FOR_REVIEW: ["IN_REVIEW"],
  IN_REVIEW: ["CORRECTIONS_REQUESTED", "PRE_REVIEW_COMPLETE"],
  CORRECTIONS_REQUESTED: ["REVISED"],
  REVISED: ["IN_REVIEW"],
  PRE_REVIEW_COMPLETE: [],
};

// ---------- Findings ----------
export const FindingStatus = z.enum([
  "PASS",
  "CORRECTION",
  "NEEDS_INFORMATION",
  "NEEDS_HUMAN_VERIFICATION",
]);
export type FindingStatus = z.infer<typeof FindingStatus>;

export const RuleId = z.enum(["SJ-PERMIT-01", "CRC-GUARD-01", "SJ-DETAIL-01", "SJ-ZONING-01"]);
export type RuleId = z.infer<typeof RuleId>;

export const Finding = z.object({
  findingId: z.string(),
  ruleId: RuleId,
  reviewer: z.enum(["building", "zoning"]),
  revision: z.number().int().min(1),
  status: FindingStatus,
  field: z.string().optional(),           // e.g. "deck.guardHeightIn"
  observed: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  required: z.string().optional(),        // human-readable requirement
  reason: z.string(),                      // one plain sentence
  sourceUrl: z.string().url(),
  sourceLabel: z.string(),                 // e.g. "San Jose Decks page", "2025 CRC R321 (verify)"
  humanReviewNeeded: z.boolean().default(false),
});
export type Finding = z.infer<typeof Finding>;

// ---------- The application ----------
export const Property = z.object({
  address: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  apn: z.string().optional(),
  parcelId: z.string().optional(),
  zoning: z.string().optional(),           // e.g. "R-1-8"
  lookupConfidence: z.enum(["unconfirmed", "confirmed_by_user", "fixture"]).default("unconfirmed"),
  lookedUpAt: z.string().optional(),       // ISO timestamp
});

export const Deck = z.object({
  lengthFt: z.number().positive().optional(),
  widthFt: z.number().positive().optional(),
  maxHeightIn: z.number().nonnegative().optional(),
  attached: z.boolean().optional(),
  ledgerType: z.enum(["lag_screws", "through_bolts", "nails", "unknown"]).optional(),
  rearSetbackFt: z.number().nonnegative().optional(),
  guardProvided: z.boolean().optional(),
  guardHeightIn: z.number().nonnegative().optional(),
});
export type Deck = z.infer<typeof Deck>;

export const Event = z.object({
  at: z.string(),                           // ISO timestamp
  actor: z.enum(["intake", "clerk", "building", "zoning", "system", "user"]),
  type: z.string(),                         // "STATUS_CHANGED" | "FINDING_ADDED" | "FIELD_CONFIRMED" | ...
  detail: z.string(),
  from: Status.optional(),
  to: Status.optional(),
});
export type Event = z.infer<typeof Event>;

export const PermitApplication = z.object({
  id: z.string(),
  jurisdiction: z.literal("San Jose, CA"),
  status: Status,
  revision: z.number().int().min(1),
  property: Property,
  deck: Deck,
  intake: z.object({
    complete: z.boolean(),
    missingFields: z.array(z.string()),
  }),
  findings: z.array(Finding),
  events: z.array(Event),
  packetUrl: z.string().nullable(),
});
export type PermitApplication = z.infer<typeof PermitApplication>;

// Minimum fields before "Run pre-review" is allowed.
export const MINIMUM_FIELDS = [
  "property.address",
  "deck.lengthFt",
  "deck.widthFt",
  "deck.maxHeightIn",
  "deck.attached",
] as const;

// ---------- Agent Relay envelope ----------
export const RelayMessageType = z.enum([
  "REVIEW_REQUEST",
  "FINDING",
  "NEEDS_INPUT",
  "REVISION_SUBMITTED",
  "REVIEW_COMPLETE",
]);

export const RelayEnvelope = z.object({
  permitId: z.string(),
  revision: z.number().int().min(1),
  sender: z.enum(["intake", "clerk", "building", "zoning"]),
  type: RelayMessageType,
  findingId: z.string().optional(),
  payload: z.unknown(),
  timestamp: z.string(),
});
export type RelayEnvelope = z.infer<typeof RelayEnvelope>;

// ---------- Demo fixture (revision 1) ----------
export const DEMO_APPLICATION: PermitApplication = {
  id: "sj-deck-0412",
  jurisdiction: "San Jose, CA",
  status: "READY_FOR_REVIEW",
  revision: 1,
  property: {
    address: "770 Lincoln Ave, San Jose, CA 95126",
    zoning: "R-1-8",                        // replace with the real GIS value once verified
    lookupConfidence: "fixture",
  },
  deck: {
    lengthFt: 16,
    widthFt: 12,
    maxHeightIn: 36,
    attached: true,
    rearSetbackFt: 4,
    guardProvided: true,
    guardHeightIn: 36,
    // ledgerType intentionally missing → NEEDS_INFORMATION
  },
  intake: { complete: true, missingFields: [] },
  findings: [],
  events: [],
  packetUrl: null,
};
