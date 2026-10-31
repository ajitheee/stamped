// stamped — deterministic rules. No LLM in here. The model only explains these results.
// Every threshold cites its source. Verify section numbers before they appear on screen.
import type { PermitApplication, Finding, RuleId } from "./contracts";

const SRC = {
  sjDecks: {
    url: "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/single-family-duplex-properties/decks",
    label: "San Jose Decks page",
  },
  crc: {
    url: "https://www.dgs.ca.gov/bsc/codes",
    label: "California Residential Code, guards (2025 CRC R321 / 2022 CRC R312 — verify section)",
  },
  sjForm352: {
    url: "https://www.sanjoseca.gov/home/showpublisheddocument/107050/638593203745800000",
    label: "San Jose Form 352 plan set instructions",
  },
  sjZoning: {
    url: "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/design-considerations",
    label: "San Jose design considerations / municipal zoning standards",
  },
};

// Thresholds (source: San Jose Decks page). Re-check the page the morning of the demo.
const PERMIT_AREA_SQFT = 200;
const PERMIT_HEIGHT_IN = 30;
// Source: California Residential Code — guards required above 30 in; CA minimum guard height 42 in.
const GUARD_TRIGGER_IN = 30;
const GUARD_MIN_HEIGHT_IN = 42;

type RuleFn = (app: PermitApplication) => Omit<Finding, "findingId" | "revision">;

const id = (ruleId: RuleId, app: PermitApplication) => `${app.id}-r${app.revision}-${ruleId}`;

export const RULES: Record<RuleId, RuleFn> = {
  "SJ-PERMIT-01": (app) => {
    const d = app.deck;
    if (d.lengthFt == null || d.widthFt == null || d.maxHeightIn == null || d.attached == null) {
      return {
        ruleId: "SJ-PERMIT-01", reviewer: "building", status: "NEEDS_INFORMATION",
        reason: "Need length, width, height above grade and whether the deck is attached to decide if a permit is required.",
        sourceUrl: SRC.sjDecks.url, sourceLabel: SRC.sjDecks.label, humanReviewNeeded: false,
      };
    }
    const area = d.lengthFt * d.widthFt;
    const triggers: string[] = [];
    if (area >= PERMIT_AREA_SQFT) triggers.push(`area ${area} sq ft ≥ ${PERMIT_AREA_SQFT}`);
    if (d.maxHeightIn >= PERMIT_HEIGHT_IN) triggers.push(`height ${d.maxHeightIn} in ≥ ${PERMIT_HEIGHT_IN}`);
    if (d.attached) triggers.push("attached to the dwelling");
    return {
      ruleId: "SJ-PERMIT-01", reviewer: "building", status: "PASS",
      field: "deck", observed: triggers.length ? triggers.join("; ") : "none of the triggers",
      required: triggers.length ? "Building permit required" : "Permit may not be required; confirm with the City",
      reason: triggers.length
        ? `A building permit is required: ${triggers.join(", ")}.`
        : "None of the City's permit triggers apply; confirm with the City before building.",
      sourceUrl: SRC.sjDecks.url, sourceLabel: SRC.sjDecks.label, humanReviewNeeded: triggers.length === 0,
    };
  },

  "CRC-GUARD-01": (app) => {
    const d = app.deck;
    if (d.maxHeightIn == null) {
      return {
        ruleId: "CRC-GUARD-01", reviewer: "building", status: "NEEDS_INFORMATION",
        reason: "Need the maximum height above grade to decide whether a guard is required.",
        sourceUrl: SRC.crc.url, sourceLabel: SRC.crc.label, humanReviewNeeded: false,
      };
    }
    if (d.maxHeightIn <= GUARD_TRIGGER_IN) {
      return {
        ruleId: "CRC-GUARD-01", reviewer: "building", status: "PASS",
        field: "deck.maxHeightIn", observed: d.maxHeightIn, required: `guard only above ${GUARD_TRIGGER_IN} in`,
        reason: `Deck is ${d.maxHeightIn} in above grade; a guard is not required at or below ${GUARD_TRIGGER_IN} in.`,
        sourceUrl: SRC.crc.url, sourceLabel: SRC.crc.label, humanReviewNeeded: false,
      };
    }
    if (d.guardProvided == null || d.guardHeightIn == null) {
      return {
        ruleId: "CRC-GUARD-01", reviewer: "building", status: "NEEDS_INFORMATION",
        field: "deck.guardHeightIn",
        reason: `Deck is ${d.maxHeightIn} in above grade, so a guard is required. State the guard height.`,
        sourceUrl: SRC.crc.url, sourceLabel: SRC.crc.label, humanReviewNeeded: false,
      };
    }
    if (d.guardHeightIn < GUARD_MIN_HEIGHT_IN) {
      return {
        ruleId: "CRC-GUARD-01", reviewer: "building", status: "CORRECTION",
        field: "deck.guardHeightIn", observed: d.guardHeightIn, required: `${GUARD_MIN_HEIGHT_IN} in minimum`,
        reason: `Guard is ${d.guardHeightIn} in; California requires at least ${GUARD_MIN_HEIGHT_IN} in for a deck ${d.maxHeightIn} in above grade.`,
        sourceUrl: SRC.crc.url, sourceLabel: SRC.crc.label, humanReviewNeeded: false,
      };
    }
    return {
      ruleId: "CRC-GUARD-01", reviewer: "building", status: "PASS",
      field: "deck.guardHeightIn", observed: d.guardHeightIn, required: `${GUARD_MIN_HEIGHT_IN} in minimum`,
      reason: `Guard is ${d.guardHeightIn} in, which meets the ${GUARD_MIN_HEIGHT_IN} in minimum.`,
      sourceUrl: SRC.crc.url, sourceLabel: SRC.crc.label, humanReviewNeeded: false,
    };
  },

  "SJ-DETAIL-01": (app) => {
    const d = app.deck;
    if (d.attached && (d.ledgerType == null || d.ledgerType === "unknown")) {
      return {
        ruleId: "SJ-DETAIL-01", reviewer: "building", status: "NEEDS_INFORMATION",
        field: "deck.ledgerType",
        reason: "The deck is attached to the house, but the ledger connection (lag screws or through-bolts) is not described. Plans must show it.",
        sourceUrl: SRC.sjForm352.url, sourceLabel: SRC.sjForm352.label, humanReviewNeeded: false,
      };
    }
    if (d.attached && d.ledgerType === "nails") {
      return {
        ruleId: "SJ-DETAIL-01", reviewer: "building", status: "CORRECTION",
        field: "deck.ledgerType", observed: "nails", required: "lag screws or through-bolts",
        reason: "A ledger attached with nails only is not an accepted connection; use lag screws or through-bolts per the plan requirements.",
        sourceUrl: SRC.sjForm352.url, sourceLabel: SRC.sjForm352.label, humanReviewNeeded: false,
      };
    }
    return {
      ruleId: "SJ-DETAIL-01", reviewer: "building", status: "PASS",
      field: "deck.ledgerType", observed: d.ledgerType ?? "freestanding",
      reason: d.attached ? "Ledger connection type is stated." : "Freestanding deck; no ledger connection needed.",
      sourceUrl: SRC.sjForm352.url, sourceLabel: SRC.sjForm352.label, humanReviewNeeded: false,
    };
  },

  "SJ-ZONING-01": (app) => {
    const z = app.property.zoning;
    if (!z) {
      return {
        ruleId: "SJ-ZONING-01", reviewer: "zoning", status: "NEEDS_INFORMATION",
        field: "property.zoning",
        reason: "Zoning district not yet retrieved for this parcel.",
        sourceUrl: SRC.sjZoning.url, sourceLabel: SRC.sjZoning.label, humanReviewNeeded: false,
      };
    }
    // We do NOT hard-code a universal setback. We report the district and the stated setback for human verification.
    return {
      ruleId: "SJ-ZONING-01", reviewer: "zoning", status: "NEEDS_HUMAN_VERIFICATION",
      field: "deck.rearSetbackFt", observed: app.deck.rearSetbackFt ?? null,
      required: `Verify rear setback and exceptions for district ${z}`,
      reason: `Parcel is zoned ${z}. The stated rear setback is ${app.deck.rearSetbackFt ?? "unknown"} ft; the district's setback rule and any exceptions must be verified by a planner.`,
      sourceUrl: SRC.sjZoning.url, sourceLabel: SRC.sjZoning.label, humanReviewNeeded: true,
    };
  },
};

/** Run one rule and attach ids. */
export function runRule(ruleId: RuleId, app: PermitApplication): Finding {
  const base = RULES[ruleId](app);
  return { ...base, findingId: id(ruleId, app), revision: app.revision };
}

/** Which rules a field change affects (used by /revise so only affected rules rerun). */
export const FIELD_TO_RULES: Record<string, RuleId[]> = {
  "deck.lengthFt": ["SJ-PERMIT-01"],
  "deck.widthFt": ["SJ-PERMIT-01"],
  "deck.maxHeightIn": ["SJ-PERMIT-01", "CRC-GUARD-01"],
  "deck.attached": ["SJ-PERMIT-01", "SJ-DETAIL-01"],
  "deck.guardProvided": ["CRC-GUARD-01"],
  "deck.guardHeightIn": ["CRC-GUARD-01"],
  "deck.ledgerType": ["SJ-DETAIL-01"],
  "deck.rearSetbackFt": ["SJ-ZONING-01"],
  "property.zoning": ["SJ-ZONING-01"],
};

export const BUILDING_RULES: RuleId[] = ["SJ-PERMIT-01", "CRC-GUARD-01", "SJ-DETAIL-01"];
export const ZONING_RULES: RuleId[] = ["SJ-ZONING-01"];

/* Expected on DEMO_APPLICATION (revision 1):
   SJ-PERMIT-01 → PASS (permit required: 192 sq ft < 200, but 36 in ≥ 30 and attached)
   CRC-GUARD-01 → CORRECTION (36 in < 42 in)
   SJ-DETAIL-01 → NEEDS_INFORMATION (attached, ledger not described)
   SJ-ZONING-01 → NEEDS_HUMAN_VERIFICATION (R-1-8, setback 4 ft stated)
   After revise guardHeightIn → 42: CRC-GUARD-01 → PASS, nothing else reruns.
*/
