import type {
  Address,
  AssetIndicators,
  ClosedReason,
  Contact,
  CoverageItem,
  PropertyProfile,
  Prospect,
  ProspectNote,
  ProspectTag,
  Stage,
} from "../types";
import { newId } from "./storage";

/**
 * Prospect schema v4.
 *
 * The old six-value `status` was doing three jobs — pipeline position, call
 * outcome and terminal result. v4 splits those apart. This file holds the one
 * conversion used everywhere: the database upgrade on boot, and restoring a
 * v1 or v2 backup that still contains the old shape.
 *
 * The rule throughout is that nothing is invented. A field we cannot know from
 * the old record comes out blank, because a guessed conversion score or a
 * made-up follow-up date is worse than an empty one — it looks like fact.
 */

/**
 * 4 split the old `status`. 5 added `stageSource` / `stageCallId` so a stage
 * knows whether a rule or a person put it there. 6 added the intake and
 * research fields — names, lead source, Why They Fit, Important Notes and the
  * asset indicators. 7 added parcelId and the "gis" source for automated
 * ingestion. 8 added tags.
 */
export const PROSPECT_SCHEMA_VERSION = 10;

/** The six statuses v3 could hold, and where each one lands. */
export const STATUS_TO_STAGE: Record<string, Stage> = {
  New: "New",
  Contacted: "Contacted",
  "Meeting Scheduled": "Review Scheduled",
  "Open to Quote": "Quoting",
  Closed: "Closed",
  Lost: "Closed",
};

/** Only the two terminal statuses carry a reason across. */
export const STATUS_TO_CLOSED_REASON: Record<string, ClosedReason | null> = {
  Closed: "legacy-unknown",
  Lost: "lost",
};

export function blankAddress(): Address {
  return { line1: "", city: "", state: "", zip: "" };
}

export function blankContact(): Contact {
  return {
    id: newId(),
    firstName: "",
    lastName: "",
    dob: "",
    phone: "",
    email: "",
    isPrimary: true,
    quoteReadyNote: "",
    relationship: "",
    occupation: "",
    employer: "",
  };
}

/** Researched indicators, all empty. Nothing here is ever assumed. */
export function blankAssets(): AssetIndicators {
  return {
    ownership: "",
    estimatedPropertyValue: null,
    propertyType: "",
    yearBuilt: "",
    lakefront: false,
    secondHome: false,
    vehicles: "",
    boat: false,
    rv: false,
    recreational: "",
    businessOwnership: "",
    other: "",
    property: blankPropertyProfile(),
    coverage: [],
  };
}

/**
 * The physical property, all empty.
 *
 * Added in v9. Every existing record gets this shape with nothing in it, which
 * is the only honest outcome — the county publishes none of it and inventing a
 * roof material would read as a fact somebody could quote a policy from.
 */
export function blankPropertyProfile(): PropertyProfile {
  return {
    constructionType: "",
    squareFeet: null,
    exteriorMaterial: "",
    dwellingReplacementCost: null,
    roofYearInstalled: "",
    roofMaterial: "",
    roofConcerns: "",
    underwritingFlags: "",
    basementType: "",
    basementFinishedPct: null,
    waterBackupNotes: "",
    garageType: "",
    garageStalls: null,
    acreage: null,
    otherStructures: "",
    pool: "",
  };
}

/** A household record with every v4 field present and nothing assumed. */
export function blankProspect(overrides: Partial<Prospect> = {}): Prospect {
  const now = new Date().toISOString().slice(0, 10);
  return {
    id: newId(),
    name: "",
    firstName: "",
    lastName: "",
    leadSource: "",
    whyTheyFit: "",
    importantNotes: "",
    assets: blankAssets(),
    needsPhoneNumber: false,
    needsReview: false,
    mergedFrom: [],
    contacts: [],
    address: blankAddress(),
    area: "",
    stage: "New",
    stageSource: "manual",
    stageCallId: null,
    closedReason: null,
    priorityGrade: "",
    conversionScore: null,
    lastOutcome: null,
    lastOutcomeAt: "",
    lastContactedAt: "",
    nextAction: "",
    nextActionDate: "",
    doNotContact: false,
    source: "",
    parcelId: "",
    tags: [],
    lines: [],
    phone: "",
    email: "",
    notes: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** The v3 shape, as far as we need to read it. */
interface LegacyProspect {
  id?: string;
  name?: string;
  status?: string;
  lines?: unknown;
  area?: string;
  phone?: string;
  email?: string;
  nextStep?: string;
  notes?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

function isStage(value: unknown): value is Stage {
  return (
    typeof value === "string" &&
    [
      "New",
      "Attempting",
      "Contacted",
      "Qualifying",
      "Quoting",
      "Review Scheduled",
      "Opportunity",
      "Won",
      "Nurture",
      "Closed",
    ].includes(value)
  );
}

function asNotes(value: unknown): ProspectNote[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is ProspectNote => Boolean(n) && typeof n === "object");
}

/**
 * Tags off a stored record.
 *
 * Anything malformed is dropped rather than repaired — a tag with no label is
 * not a tag, and inventing one would put a mark on a household that nobody
 * chose. Records written before tags existed simply have none.
 */
function asTags(value: unknown): ProspectTag[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .map((t, i) => ({
      id: typeof t.id === "string" && t.id ? t.id : `tag_${i}_${Math.random().toString(36).slice(2, 7)}`,
      label: typeof t.label === "string" ? t.label.trim() : "",
      color: typeof t.color === "string" && t.color ? t.color : "navy",
    }))
    .filter((t) => t.label.length > 0);
}

function asContacts(value: unknown): Contact[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Partial<Contact> => Boolean(c) && typeof c === "object")
    .map((c) => ({
      id: typeof c.id === "string" && c.id ? c.id : newId(),
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      dob: c.dob ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      isPrimary: Boolean(c.isPrimary),
      quoteReadyNote: c.quoteReadyNote ?? "",
      relationship: c.relationship ?? "",
      occupation: c.occupation ?? "",
      employer: c.employer ?? "",
    }));
}

function asAssets(value: unknown): AssetIndicators {
  if (!value || typeof value !== "object") return blankAssets();
  const a = value as Partial<AssetIndicators>;
  return {
    ownership: a.ownership === "owner" || a.ownership === "renter" ? a.ownership : "",
    estimatedPropertyValue:
      typeof a.estimatedPropertyValue === "number" ? a.estimatedPropertyValue : null,
    propertyType: a.propertyType ?? "",
    yearBuilt: a.yearBuilt ?? "",
    lakefront: Boolean(a.lakefront),
    secondHome: Boolean(a.secondHome),
    vehicles: a.vehicles ?? "",
    boat: Boolean(a.boat),
    rv: Boolean(a.rv),
    recreational: a.recreational ?? "",
    businessOwnership: a.businessOwnership ?? "",
    other: a.other ?? "",
    property: asPropertyProfile(a.property),
    coverage: asCoverage(a.coverage),
  };
}

/**
 * Coverage items, dropping anything malformed rather than rendering it.
 *
 * A bad row here would become a mesh floating in the scene with no label, so
 * the bar for keeping one is that it has both an id and a line. Everything
 * else is coerced to a safe default: an unrecognised status becomes "needed",
 * which is the reading that cannot overstate what somebody owns.
 */
function asCoverage(value: unknown): CoverageItem[] {
  if (!Array.isArray(value)) return [];
  const out: CoverageItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Partial<CoverageItem>;
    const id = typeof c.id === "string" ? c.id.trim() : "";
    const line = typeof c.line === "string" ? c.line.trim() : "";
    if (!id || !line || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      line,
      status: c.status === "held" ? "held" : "needed",
      label: typeof c.label === "string" ? c.label : "",
      detail: typeof c.detail === "string" ? c.detail : "",
    });
  }
  return out;
}

/** Idempotent, like everything else here: a v9 record passes through intact. */
function asPropertyProfile(value: unknown): PropertyProfile {
  if (!value || typeof value !== "object") return blankPropertyProfile();
  const p = value as Partial<PropertyProfile>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    constructionType: p.constructionType ?? "",
    squareFeet: num(p.squareFeet),
    exteriorMaterial: p.exteriorMaterial ?? "",
    dwellingReplacementCost: num(p.dwellingReplacementCost),
    roofYearInstalled: p.roofYearInstalled ?? "",
    roofMaterial: p.roofMaterial ?? "",
    roofConcerns: p.roofConcerns ?? "",
    underwritingFlags: p.underwritingFlags ?? "",
    basementType: p.basementType ?? "",
    basementFinishedPct: num(p.basementFinishedPct),
    waterBackupNotes: p.waterBackupNotes ?? "",
    garageType: p.garageType ?? "",
    garageStalls: num(p.garageStalls),
    acreage: num(p.acreage),
    otherStructures: p.otherStructures ?? "",
    pool: p.pool ?? "",
  };
}

function asAddress(value: unknown): Address {
  if (!value || typeof value !== "object") return blankAddress();
  const a = value as Partial<Address>;
  return {
    line1: a.line1 ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    zip: a.zip ?? "",
  };
}

/**
 * Brings one prospect up to v4. Safe to run on a record that is already v4 —
 * a restore of a current backup passes through here unchanged, so there is
 * only ever one code path to reason about.
 */
export function normalizeProspect(input: unknown): Prospect {
  const raw = (input ?? {}) as LegacyProspect & Partial<Prospect>;

  // Already v4 if it carries a recognised stage.
  const alreadyMigrated = isStage(raw.stage);

  const stage: Stage = alreadyMigrated
    ? (raw.stage as Stage)
    : (STATUS_TO_STAGE[raw.status ?? ""] ?? "New");

  const closedReason: ClosedReason | null = alreadyMigrated
    ? (raw.closedReason ?? null)
    : (STATUS_TO_CLOSED_REASON[raw.status ?? ""] ?? null);

  const lines = Array.isArray(raw.lines)
    ? raw.lines.filter((l): l is Prospect["lines"][number] =>
        l === "property" || l === "casualty" || l === "life",
      )
    : [];

  const createdAt = raw.createdAt ?? new Date().toISOString().slice(0, 10);

  return {
    id: raw.id ?? newId(),
    name: raw.name ?? "",
    firstName: raw.firstName ?? "",
    lastName: raw.lastName ?? "",
    leadSource: raw.leadSource ?? "",
    whyTheyFit: raw.whyTheyFit ?? "",
    importantNotes: raw.importantNotes ?? "",
    assets: asAssets(raw.assets),
    needsPhoneNumber: Boolean(raw.needsPhoneNumber),
    needsReview: Boolean(raw.needsReview),
    mergedFrom: Array.isArray(raw.mergedFrom) ? raw.mergedFrom : [],
    contacts: asContacts(raw.contacts),
    address: asAddress(raw.address),
    area: raw.area ?? "",
    stage,
    // Anything that predates the field was last touched by a person, not a
    // rule — claiming otherwise would let reconciliation overwrite a stage
    // nobody asked it to.
    stageSource: raw.stageSource === "rule" ? "rule" : "manual",
    stageCallId: raw.stageCallId ?? null,
    closedReason,
    priorityGrade: raw.priorityGrade ?? "",
    conversionScore:
      typeof raw.conversionScore === "number" ? raw.conversionScore : null,
    lastOutcome: raw.lastOutcome ?? null,
    lastOutcomeAt: raw.lastOutcomeAt ?? "",
    lastContactedAt: raw.lastContactedAt ?? "",
    // The old free-text next step carries over verbatim. It never had a date
    // attached and does not get given one here.
    nextAction: raw.nextAction ?? raw.nextStep ?? "",
    nextActionDate: raw.nextActionDate ?? "",
    doNotContact: Boolean(raw.doNotContact),
    source: raw.source ?? "",
    // Blank for every record that predates GIS ingestion. Never invented.
    parcelId: raw.parcelId ?? "",
    tags: asTags(raw.tags),
    lines,
    phone: raw.phone ?? "",
    email: raw.email ?? "",
    notes: asNotes(raw.notes),
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
  };
}

export function normalizeProspects(input: unknown): Prospect[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeProspect);
}

/** True when a stored list still has at least one pre-v4 record in it. */
export function needsProspectMigration(rows: unknown[]): boolean {
  return rows.some((row) => !isStage((row as { stage?: unknown })?.stage));
}
