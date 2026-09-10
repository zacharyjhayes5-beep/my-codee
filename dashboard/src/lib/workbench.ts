import type {
  ChecklistItem,
  ChecklistStatus,
  Opportunity,
  PolicyTerm,
  PrebindItem,
  Prospect,
  QuoteVersion,
  Workbench,
  WorkbenchDoc,
  WorkbenchLine,
} from "../types";
import { newId, today } from "./storage";
import { patchOpportunity } from "./opportunities";

/**
 * The Quote Workbench.
 *
 * One workspace per account, answering five questions: what is already held,
 * what is missing, where the quotes stand, what is stopping the account from
 * being ready for a pre-bind review, and what is owed next.
 *
 * Everything in this file is pure. The workbench record it operates on hangs
 * off an `Opportunity` and never duplicates it — the stage, the next action
 * and the next action date all stay on the opportunity, which is what keeps
 * Operator's queue and the pipeline board agreeing with this screen.
 *
 * Two rules govern the whole module:
 *
 *   1. **Nothing is invented.** No premium is guessed, no coverage is treated
 *      as equivalent to another, no saving is computed from incomplete inputs,
 *      and a linked document never promotes an item to verified.
 *   2. **Nothing entered is silently dropped.** Changing the selected lines
 *      hides starter prompts that were never touched; it deletes nothing that
 *      holds a status, a note, a date or a document.
 */

/* ------------------------------------------------------------------ */
/* Lines                                                               */
/* ------------------------------------------------------------------ */

export const WORKBENCH_LINES: WorkbenchLine[] = [
  "auto",
  "home",
  "condo",
  "renters",
  "umbrella",
  "life",
];

export const LINE_LABELS: Record<WorkbenchLine, string> = {
  auto: "Auto",
  home: "Home",
  condo: "Condo",
  renters: "Renters",
  umbrella: "Umbrella",
  life: "Life",
};

/**
 * The workbench's lines folded onto the four the opportunity model can name.
 *
 * One-way on purpose. Condo and renters both answer to Home upstream, and
 * flattening them here would lose the distinction the checklists depend on.
 */
const OPPORTUNITY_LINE_FOR: Record<WorkbenchLine, Opportunity["lines"][number]> = {
  auto: "Auto",
  home: "Home",
  condo: "Home",
  renters: "Home",
  umbrella: "Umbrella",
  life: "Life",
};

/** The lines a workbench starts with, read off the account it belongs to. */
export function linesFromOpportunity(opportunity: Opportunity): WorkbenchLine[] {
  const out = new Set<WorkbenchLine>();
  for (const line of opportunity.lines ?? []) {
    if (line === "Auto") out.add("auto");
    else if (line === "Home") out.add("home");
    else if (line === "Umbrella") out.add("umbrella");
    else if (line === "Life") out.add("life");
  }
  for (const row of opportunity.quoteRows ?? []) {
    const key = String(row?.line ?? "").toLowerCase();
    if (key === "auto") out.add("auto");
    else if (key === "home") out.add("home");
    else if (key === "renters") out.add("renters");
    else if (key === "umbrella") out.add("umbrella");
    else if (key === "life") out.add("life");
  }
  return WORKBENCH_LINES.filter((l) => out.has(l));
}

/**
 * The coarse lines the opportunity should carry, given the workbench's.
 *
 * Used so that selecting Condo in here does not leave the board showing an
 * account with no lines at all. Lines the opportunity already holds that this
 * cannot express — Commercial, Other — are kept.
 */
export function opportunityLinesFrom(
  lines: WorkbenchLine[],
  existing: Opportunity["lines"] = [],
): Opportunity["lines"] {
  const mapped = new Set(lines.map((l) => OPPORTUNITY_LINE_FOR[l]));
  for (const line of existing) {
    if (line === "Commercial" || line === "Other") mapped.add(line);
  }
  return [...mapped];
}

/* ------------------------------------------------------------------ */
/* Writing back to the account                                         */
/* ------------------------------------------------------------------ */

/** Which pane of the workbench is showing. Shared so it is named once. */
export type WorkbenchPane = "overview" | "checklist" | "quotes" | "documents" | "prebind";

/**
 * Fields whose change is a decision, and so earns a line of history.
 *
 * The rest are typing. The workbench saves as you go rather than on a button,
 * which is right for a workspace this size but means every keystroke reaches
 * the opportunity — and `patchOpportunity` records an event per differing
 * tracked field. Left alone, typing a fifteen-character next action wrote
 * fifteen history entries, each one noise, all of them kept forever.
 *
 * So free text is written straight to the record, the way the walkthrough
 * already treats property detail: data entry, not a decision. Choosing a
 * stage or a line still goes through `patchOpportunity`, because those are
 * discrete, deliberate and worth being able to trace.
 */
const HISTORIC_FIELDS = new Set<keyof Opportunity>(["stage", "lines", "closedReason"]);

export function applyOpportunityPatch(
  opportunity: Opportunity,
  patch: Partial<Opportunity>,
  day = today(),
): Opportunity {
  const decides = Object.keys(patch).some((key) =>
    HISTORIC_FIELDS.has(key as keyof Opportunity),
  );
  return decides
    ? patchOpportunity(opportunity, patch)
    : { ...opportunity, ...patch, updatedAt: day };
}

/* ------------------------------------------------------------------ */
/* Starter checklists                                                  */
/* ------------------------------------------------------------------ */

/**
 * Organisational prompts, not underwriting requirements.
 *
 * No authoritative Farm Bureau checklist exists anywhere in this repository,
 * so nothing here claims to be one. These are the things worth remembering to
 * ask, every one of them editable and removable, and the interface labels
 * them as what they are.
 */
export const STARTER_ITEMS: Record<WorkbenchLine, string[]> = {
  auto: [
    "Drivers in the household",
    "Vehicles — year, make, model",
    "Current declarations page",
    "Usage and annual mileage",
    "Requested coverage choices",
    "Unresolved questions",
  ],
  home: [
    "Property details",
    "Occupancy",
    "Roof — age and material",
    "Updates — wiring, plumbing, furnace",
    "Other structures",
    "Current declarations page",
    "Unresolved questions",
  ],
  condo: [
    "Unit details",
    "Occupancy",
    "Association master policy — what it covers",
    "Interior updates and improvements",
    "Current declarations page",
    "Unresolved questions",
  ],
  renters: [
    "Unit details",
    "Occupancy",
    "Personal property estimate",
    "Current declarations page",
    "Unresolved questions",
  ],
  umbrella: [
    "Underlying policies and limits",
    "Household exposure questions",
    "Drivers and vehicles on the underlying auto",
    "Unresolved questions",
  ],
  life: [
    "Intended insured",
    "Purpose of the coverage",
    "Requested coverage amount",
    "Next fact-finding step",
    "Unresolved questions",
  ],
};

/**
 * Pre-bind preparation prompts.
 *
 * Same caveat, stated louder: these are the agent's own planning categories.
 * Checking every box means the agent has gathered what he meant to gather. It
 * does not mean coverage is bound, underwriting has approved anything, or a
 * carrier's requirements have been satisfied.
 */
export const PREBIND_DEFAULTS: { label: string; category: string }[] = [
  { label: "Fact finder complete", category: "Fact finder" },
  { label: "Current declarations on file", category: "Current declarations" },
  { label: "Selected proposal confirmed with the household", category: "Selected proposal" },
  { label: "Replacement cost estimate — where applicable", category: "Replacement cost" },
  { label: "Photos — where applicable", category: "Photos" },
  { label: "Applications, forms and signatures identified", category: "Forms" },
  { label: "Underwriting questions and outstanding conditions", category: "Underwriting" },
];

/* ------------------------------------------------------------------ */
/* Building and normalising                                            */
/* ------------------------------------------------------------------ */

export function starterItem(line: WorkbenchLine, label: string, day = today()): ChecklistItem {
  return {
    id: newId(),
    line,
    label,
    status: "needed",
    notes: "",
    updatedAt: day,
    custom: false,
  };
}

export function blankPrebindItem(
  label: string,
  category: string,
  day = today(),
  custom = false,
): PrebindItem {
  return { id: newId(), label, category, status: "needed", notes: "", updatedAt: day, custom };
}

export function blankWorkbench(
  opportunityId: string,
  prospectId: string,
  lines: WorkbenchLine[] = [],
  day = today(),
): Workbench {
  const base: Workbench = {
    id: newId(),
    opportunityId,
    prospectId,
    lines: [],
    items: [],
    quotes: [],
    docs: [],
    prebind: PREBIND_DEFAULTS.map((d) => blankPrebindItem(d.label, d.category, day)),
    createdAt: day,
    updatedAt: day,
  };
  return syncLines(base, lines, day);
}

const STATUSES: ChecklistStatus[] = ["needed", "requested", "received", "verified", "na"];
function isStatus(value: unknown): value is ChecklistStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

const TERMS: PolicyTerm[] = ["annual", "six-month", "monthly", "quarterly", "unknown"];
function isTerm(value: unknown): value is PolicyTerm {
  return typeof value === "string" && (TERMS as string[]).includes(value);
}

/**
 * Brings a stored workbench up to the current shape.
 *
 * Run on every read, idempotent, for the same reason prospects and
 * opportunities are: a row written by an older build, a half-finished write or
 * a hand-edited store must not be able to take a screen down.
 */
export function normalizeWorkbench(row: Workbench): Workbench {
  const day = today();
  return {
    ...row,
    lines: Array.isArray(row.lines) ? row.lines.filter((l) => WORKBENCH_LINES.includes(l)) : [],
    items: (Array.isArray(row.items) ? row.items : []).map((i) => ({
      ...i,
      status: isStatus(i?.status) ? i.status : "needed",
      notes: typeof i?.notes === "string" ? i.notes : "",
      label: typeof i?.label === "string" ? i.label : "Untitled item",
      line: i?.line && WORKBENCH_LINES.includes(i.line) ? i.line : null,
      updatedAt: typeof i?.updatedAt === "string" ? i.updatedAt : day,
      custom: i?.custom === true,
    })),
    quotes: (Array.isArray(row.quotes) ? row.quotes : []).map((q) => ({
      ...q,
      kind: q?.kind === "current" ? ("current" as const) : ("proposed" as const),
      line: q?.line && WORKBENCH_LINES.includes(q.line) ? q.line : "auto",
      premium:
        typeof q?.premium === "string" ? q.premium : q?.premium != null ? String(q.premium) : "",
      term: isTerm(q?.term) ? q.term : "unknown",
      coverages: Array.isArray(q?.coverages) ? q.coverages : [],
      carrier: typeof q?.carrier === "string" ? q.carrier : "",
      label: typeof q?.label === "string" ? q.label : "",
      billingNotes: typeof q?.billingNotes === "string" ? q.billingNotes : "",
      differences: typeof q?.differences === "string" ? q.differences : "",
      questions: typeof q?.questions === "string" ? q.questions : "",
      quoteDate: typeof q?.quoteDate === "string" ? q.quoteDate : "",
      effectiveDate: typeof q?.effectiveDate === "string" ? q.effectiveDate : "",
      // A current policy is a baseline, never a thing being bound. Older rows
      // that somehow carry the flag are corrected rather than trusted.
      planningToBind: q?.kind === "current" ? false : q?.planningToBind === true,
      createdAt: typeof q?.createdAt === "string" ? q.createdAt : day,
      updatedAt: typeof q?.updatedAt === "string" ? q.updatedAt : day,
    })),
    docs: (Array.isArray(row.docs) ? row.docs : []).map((d) => ({
      ...d,
      name: typeof d?.name === "string" ? d.name : "Untitled document",
      category: typeof d?.category === "string" ? d.category : "",
      location: typeof d?.location === "string" ? d.location : "",
      notes: typeof d?.notes === "string" ? d.notes : "",
      createdAt: typeof d?.createdAt === "string" ? d.createdAt : day,
    })),
    prebind: (Array.isArray(row.prebind) ? row.prebind : []).map((p) => ({
      ...p,
      status: isStatus(p?.status) ? p.status : "needed",
      label: typeof p?.label === "string" ? p.label : "Untitled item",
      category: typeof p?.category === "string" ? p.category : "",
      notes: typeof p?.notes === "string" ? p.notes : "",
      updatedAt: typeof p?.updatedAt === "string" ? p.updatedAt : day,
      custom: p?.custom === true,
    })),
  };
}

export function normalizeWorkbenches(rows: Workbench[]): Workbench[] {
  return (Array.isArray(rows) ? rows : []).map(normalizeWorkbench);
}

export function workbenchFor(all: Workbench[], opportunityId: string): Workbench | undefined {
  return all.find((w) => w.opportunityId === opportunityId);
}

export function upsertWorkbench(all: Workbench[], bench: Workbench, day = today()): Workbench[] {
  const next = { ...bench, updatedAt: day };
  return all.some((w) => w.id === bench.id)
    ? all.map((w) => (w.id === bench.id ? next : w))
    : [...all, next];
}

/* ------------------------------------------------------------------ */
/* Changing the selected lines                                         */
/* ------------------------------------------------------------------ */

/** True when a starter prompt still holds nothing anybody typed. */
export function itemIsEmpty(item: ChecklistItem): boolean {
  return (
    item.status === "needed" &&
    !item.notes.trim() &&
    !item.docId &&
    !item.requestedAt &&
    !item.custom
  );
}

/**
 * Re-seeds the checklist for a new set of lines.
 *
 * Adding a line appends whichever of its starter prompts are not already
 * there. Dropping a line removes only its untouched starter prompts —
 * anything with a status, a note, a date, a document, or added by hand stays,
 * because a mis-click on a line chip must not be able to destroy an
 * afternoon's work. Items kept this way are still reachable: `visibleItems`
 * groups them under the line they came from and says the line is deselected.
 */
export function syncLines(bench: Workbench, lines: WorkbenchLine[], day = today()): Workbench {
  const selected = WORKBENCH_LINES.filter((l) => lines.includes(l));
  const keep = bench.items.filter((i) => {
    if (i.line === null) return true;
    if (selected.includes(i.line)) return true;
    return !itemIsEmpty(i);
  });

  const added: ChecklistItem[] = [];
  for (const line of selected) {
    const have = new Set(
      keep.filter((i) => i.line === line).map((i) => i.label.trim().toLowerCase()),
    );
    for (const label of STARTER_ITEMS[line]) {
      if (!have.has(label.trim().toLowerCase())) added.push(starterItem(line, label, day));
    }
  }

  return { ...bench, lines: selected, items: [...keep, ...added], updatedAt: day };
}

/* ------------------------------------------------------------------ */
/* Checklist operations                                                */
/* ------------------------------------------------------------------ */

export function patchItem(
  items: ChecklistItem[],
  id: string,
  patch: Partial<ChecklistItem>,
  day = today(),
): ChecklistItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: day } : i));
}

export function addCustomItem(
  items: ChecklistItem[],
  label: string,
  line: WorkbenchLine | null,
  day = today(),
): ChecklistItem[] {
  if (!label.trim()) return items;
  return [
    ...items,
    {
      id: newId(),
      line,
      label: label.trim(),
      status: "needed",
      notes: "",
      updatedAt: day,
      custom: true,
    },
  ];
}

export function removeItem(items: ChecklistItem[], id: string): ChecklistItem[] {
  return items.filter((i) => i.id !== id);
}

/**
 * Marks the named items requested, and stamps the date.
 *
 * Deliberately its own action. Copying a request does not send it, so copying
 * must not change a status — the agent presses this once the message has
 * actually gone out. Items already further along are left alone: moving a
 * received document back to requested would be a lie about where it stands.
 */
export function markRequested(
  items: ChecklistItem[],
  ids: string[],
  day = today(),
): ChecklistItem[] {
  const set = new Set(ids);
  return items.map((i) =>
    set.has(i.id) && (i.status === "needed" || i.status === "requested")
      ? { ...i, status: "requested" as const, requestedAt: day, updatedAt: day }
      : i,
  );
}

/** The items a request would be about — what is still owed, in line order. */
export function outstandingItems(items: ChecklistItem[]): ChecklistItem[] {
  const order = (i: ChecklistItem) => (i.line ? WORKBENCH_LINES.indexOf(i.line) : 99);
  return items
    .filter((i) => i.status === "needed" || i.status === "requested")
    .sort((a, b) => order(a) - order(b));
}

export interface ItemGroup {
  line: WorkbenchLine | null;
  label: string;
  /** False when the group only exists because kept items point at it. */
  selected: boolean;
  items: ChecklistItem[];
}

/** Items grouped for display, in line order, household-wide items last. */
export function visibleItems(bench: Workbench): ItemGroup[] {
  const groups: ItemGroup[] = [];
  const lines = [...new Set([...bench.lines, ...bench.items.map((i) => i.line)])].filter(
    (l): l is WorkbenchLine => l !== null,
  );
  for (const line of WORKBENCH_LINES.filter((l) => lines.includes(l))) {
    const items = bench.items.filter((i) => i.line === line);
    if (items.length === 0) continue;
    const selected = bench.lines.includes(line);
    groups.push({
      line,
      label: selected ? LINE_LABELS[line] : `${LINE_LABELS[line]} — line not selected`,
      selected,
      items,
    });
  }
  const loose = bench.items.filter((i) => i.line === null);
  if (loose.length > 0) {
    groups.push({ line: null, label: "Household", selected: true, items: loose });
  }
  return groups;
}

export interface StatusCounts {
  needed: number;
  requested: number;
  received: number;
  verified: number;
  na: number;
}

export function countStatuses(items: { status: ChecklistStatus }[]): StatusCounts {
  const counts: StatusCounts = { needed: 0, requested: 0, received: 0, verified: 0, na: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/**
 * A factual sentence about where the checklist stands.
 *
 * Counts only, phrased as counts. There is deliberately no score and no
 * percentage: a single number would imply a judgement about readiness that
 * nothing here is entitled to make.
 */
export function summaryLine(counts: StatusCounts): string {
  const parts: string[] = [];
  if (counts.needed) parts.push(`${counts.needed} needed`);
  if (counts.requested) parts.push(`${counts.requested} requested`);
  if (counts.received) parts.push(`${counts.received} received awaiting verification`);
  if (counts.verified) parts.push(`${counts.verified} verified`);
  if (counts.na) parts.push(`${counts.na} not applicable`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing on the list yet.";
}

export const STATUS_LABELS: Record<ChecklistStatus, string> = {
  needed: "Needed",
  requested: "Requested",
  received: "Received",
  verified: "Verified",
  na: "N/A",
};

/* ------------------------------------------------------------------ */
/* Premiums                                                            */
/* ------------------------------------------------------------------ */

/**
 * The typed premium as a number, or null.
 *
 * Null is the whole point. A blank premium is "nothing priced yet", and the
 * one thing it must never become is zero — a zero would flow into a total, a
 * comparison and a savings figure as though somebody had quoted free
 * insurance.
 */
export function parsePremium(value: string): number | null {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** How many of these go into a year. `unknown` deliberately has no factor. */
const PER_YEAR: Partial<Record<PolicyTerm, number>> = {
  annual: 1,
  "six-month": 2,
  quarterly: 4,
  monthly: 12,
};

export const TERM_LABELS: Record<PolicyTerm, string> = {
  annual: "12-month",
  "six-month": "6-month",
  quarterly: "Quarterly",
  monthly: "Monthly",
  unknown: "Term not recorded",
};

export function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `$${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export interface Annualized {
  /** The yearly figure. */
  value: number;
  /** The figure as entered, untouched. */
  original: number;
  term: PolicyTerm;
  /** True when `value` was calculated rather than entered. */
  converted: boolean;
  /** Says so in words, e.g. "$640 × 2 six-month terms". */
  note: string;
}

/**
 * A quote's premium expressed over a year, or null when it cannot be.
 *
 * Returns null for a missing premium and for a premium whose term is unknown.
 * Both are refusals on purpose: an unlabelled figure multiplied by a guessed
 * factor is how a six-month premium gets compared against an annual one and
 * reported as a saving.
 */
export function annualizedPremium(quote: QuoteVersion): Annualized | null {
  const original = parsePremium(quote.premium);
  if (original === null) return null;
  const factor = PER_YEAR[quote.term];
  if (!factor) return null;
  return {
    value: original * factor,
    original,
    term: quote.term,
    converted: factor !== 1,
    note:
      factor === 1
        ? `${money(original)} for 12 months, as entered`
        : `${money(original)} × ${factor} ${TERM_LABELS[quote.term].toLowerCase()} terms = ${money(original * factor)} a year (calculated)`,
  };
}

export type ComparisonStatus = "comparable" | "missing-premium" | "unknown-term";

export interface PremiumComparison {
  status: ComparisonStatus;
  /** Only on "comparable". Positive means the proposal costs less. */
  annualDifference: number | null;
  current: Annualized | null;
  proposed: Annualized | null;
  /** What to show. Never a savings claim unless the inputs support one. */
  message: string;
  /** True when either side had to be annualized to be compared. */
  annualizedForComparison: boolean;
}

/**
 * Compares a baseline against a proposal, or explains why it cannot.
 *
 * The refusals matter more than the arithmetic. A missing premium on either
 * side, or a term nobody has labelled, means there is no comparison to make —
 * and saying so is the correct output, not a figure with a caveat next to it.
 * Nothing here speaks to whether the coverage is equivalent; that is a
 * judgement the agent records in words on the quote itself.
 */
export function comparePremiums(
  current: QuoteVersion | undefined,
  proposed: QuoteVersion | undefined,
): PremiumComparison {
  const a = current ? annualizedPremium(current) : null;
  const b = proposed ? annualizedPremium(proposed) : null;

  const premiumMissing =
    !current ||
    !proposed ||
    parsePremium(current.premium) === null ||
    parsePremium(proposed.premium) === null;

  if (premiumMissing) {
    return {
      status: "missing-premium",
      annualDifference: null,
      current: a,
      proposed: b,
      message: "No price comparison — a premium has not been entered on both.",
      annualizedForComparison: false,
    };
  }

  if (!a || !b) {
    return {
      status: "unknown-term",
      annualDifference: null,
      current: a,
      proposed: b,
      message: "No price comparison — the policy term is not recorded on both.",
      annualizedForComparison: false,
    };
  }

  const difference = a.value - b.value;
  const converted = a.converted || b.converted;
  const direction =
    difference > 0
      ? `${money(difference)} less a year`
      : difference < 0
        ? `${money(Math.abs(difference))} more a year`
        : "the same a year";

  return {
    status: "comparable",
    annualDifference: difference,
    current: a,
    proposed: b,
    message: converted
      ? `${direction} — compared on annualized figures, calculated from the terms entered. Price only; coverage differences are listed separately.`
      : `${direction}. Price only; coverage differences are listed separately.`,
    annualizedForComparison: converted,
  };
}

/* ------------------------------------------------------------------ */
/* Quote versions                                                      */
/* ------------------------------------------------------------------ */

export function blankQuote(
  line: WorkbenchLine,
  kind: "current" | "proposed",
  day = today(),
): QuoteVersion {
  return {
    id: newId(),
    kind,
    line,
    carrier: "",
    label: kind === "current" ? "Current policy" : "",
    quoteDate: kind === "proposed" ? day : "",
    effectiveDate: "",
    premium: "",
    term: "unknown",
    billingNotes: "",
    coverages: [],
    differences: "",
    questions: "",
    planningToBind: false,
    createdAt: day,
    updatedAt: day,
  };
}

export function patchQuote(
  quotes: QuoteVersion[],
  id: string,
  patch: Partial<QuoteVersion>,
  day = today(),
): QuoteVersion[] {
  return quotes.map((q) => (q.id === id ? { ...q, ...patch, updatedAt: day } : q));
}

/**
 * Marks one proposed quote as the one intended for binding.
 *
 * One per line, and only ever one. Two versions of the same line both marked
 * for binding is not a richer data model, it is an unanswered question — and
 * the pre-bind handoff would then name both as the selected proposal. Pressing
 * it on a quote that is already selected clears it.
 */
export function setPlanningToBind(quotes: QuoteVersion[], id: string): QuoteVersion[] {
  const target = quotes.find((q) => q.id === id);
  if (!target || target.kind !== "proposed") return quotes;
  const turningOff = target.planningToBind;
  return quotes.map((q) => {
    if (q.id === id) return { ...q, planningToBind: !turningOff };
    if (!turningOff && q.kind === "proposed" && q.line === target.line) {
      return { ...q, planningToBind: false };
    }
    return q;
  });
}

export function bindingQuotes(bench: Workbench): QuoteVersion[] {
  return bench.quotes.filter((q) => q.kind === "proposed" && q.planningToBind);
}

export interface LineQuotes {
  line: WorkbenchLine;
  current: QuoteVersion | undefined;
  proposed: QuoteVersion[];
}

export function quotesByLine(bench: Workbench): LineQuotes[] {
  const lines = [...new Set([...bench.lines, ...bench.quotes.map((q) => q.line)])];
  return WORKBENCH_LINES.filter((l) => lines.includes(l)).map((line) => ({
    line,
    current: bench.quotes.find((q) => q.line === line && q.kind === "current"),
    proposed: bench.quotes.filter((q) => q.line === line && q.kind === "proposed"),
  }));
}

export function quoteTitle(quote: QuoteVersion): string {
  const bits = [quote.carrier.trim(), quote.label.trim()].filter(Boolean);
  if (bits.length > 0) return bits.join(" — ");
  return quote.kind === "current" ? "Current policy" : "Untitled quote";
}

/** "$1,240 (12-month)", or a plain statement that nothing is priced. */
export function premiumPhrase(quote: QuoteVersion): string {
  const parsed = parsePremium(quote.premium);
  if (parsed === null) return "premium not entered";
  return `${money(parsed)} (${TERM_LABELS[quote.term]})`;
}

/* ------------------------------------------------------------------ */
/* The whole account at once                                           */
/* ------------------------------------------------------------------ */

/**
 * The proposal that speaks for a line.
 *
 * The one marked Planning to bind, if there is one. Failing that, a single
 * proposal is unambiguous enough to stand for the line on its own. Two or
 * more unmarked proposals is a question nobody has answered yet, so nothing
 * is chosen — picking the cheapest, or the newest, would be inventing a
 * decision the agent has not made.
 */
export function chosenProposal(group: LineQuotes): QuoteVersion | undefined {
  const marked = group.proposed.find((q) => q.planningToBind);
  if (marked) return marked;
  return group.proposed.length === 1 ? group.proposed[0] : undefined;
}

export interface LineComparison {
  line: WorkbenchLine;
  current: QuoteVersion | undefined;
  proposed: QuoteVersion | undefined;
  comparison: PremiumComparison;
}

export interface PortfolioTotals {
  lines: LineComparison[];
  /** Lines where a baseline and a proposal can both be put on a yearly footing. */
  comparable: LineComparison[];
  /** Lines left out of the total, each with the reason in plain words. */
  excluded: { line: WorkbenchLine; reason: string }[];
  currentTotal: number | null;
  proposedTotal: number | null;
  /** Positive means the comparable proposals cost less over a year. */
  difference: number | null;
  /** Every proposal that can be annualized, whether or not it has a baseline. */
  proposedKnownTotal: number | null;
  /** How many chosen proposals that total actually covers. */
  proposedPricedLines: number;
  /** How many chosen proposals carry no usable figure. */
  proposedUnpriced: number;
  message: string;
}

/**
 * Adds the account up, and is explicit about what it could not add.
 *
 * A total is the most dangerous number on this screen: it is the one that
 * gets read out loud. So a line only counts toward it when both sides carry a
 * premium *and* a term, and every line that could not be counted is listed
 * with its reason rather than quietly dropped. A total over two of three
 * lines described as though it covered all three is exactly the failure this
 * is shaped to prevent.
 */
export function portfolioTotals(bench: Workbench): PortfolioTotals {
  const lines: LineComparison[] = quotesByLine(bench).map((group) => {
    const proposed = chosenProposal(group);
    return {
      line: group.line,
      current: group.current,
      proposed,
      comparison: comparePremiums(group.current, proposed),
    };
  });

  const comparable = lines.filter((l) => l.comparison.status === "comparable");

  const excluded = lines
    .filter((l) => l.comparison.status !== "comparable")
    .map((l) => ({
      line: l.line,
      reason:
        l.proposed === undefined
          ? bench.quotes.some((q) => q.line === l.line && q.kind === "proposed")
            ? "more than one quote and none marked Planning to bind"
            : "no proposed quote yet"
          : l.current === undefined
            ? "no current policy recorded to compare against"
            : l.comparison.status === "unknown-term"
              ? "a policy term is not recorded"
              : "a premium is not entered",
    }));

  const annualizedProposals = lines
    .map((l) => (l.proposed ? annualizedPremium(l.proposed) : null))
    .filter((a): a is Annualized => a !== null);

  const proposedUnpriced = lines.filter(
    (l) => l.proposed && annualizedPremium(l.proposed) === null,
  ).length;

  const currentTotal =
    comparable.length > 0
      ? comparable.reduce((sum, l) => sum + (l.comparison.current?.value ?? 0), 0)
      : null;
  const proposedTotal =
    comparable.length > 0
      ? comparable.reduce((sum, l) => sum + (l.comparison.proposed?.value ?? 0), 0)
      : null;
  const difference =
    currentTotal !== null && proposedTotal !== null ? currentTotal - proposedTotal : null;

  let message: string;
  if (comparable.length === 0) {
    message =
      lines.length === 0
        ? "Nothing to compare yet."
        : "No total to compare — no line has both a current policy and a proposal with a premium and a term.";
  } else {
    const scope =
      excluded.length === 0
        ? `Across all ${comparable.length} line${comparable.length === 1 ? "" : "s"}`
        : `Across ${comparable.length} of ${lines.length} lines`;
    const direction =
      difference! > 0
        ? `${money(difference!)} less a year`
        : difference! < 0
          ? `${money(Math.abs(difference!))} more a year`
          : "the same a year";
    message = `${scope}: ${money(currentTotal!)} now versus ${money(proposedTotal!)} proposed — ${direction}. Price only; coverage differences are listed on each quote.`;
  }

  return {
    lines,
    comparable,
    excluded,
    currentTotal,
    proposedTotal,
    difference,
    proposedKnownTotal:
      annualizedProposals.length > 0
        ? annualizedProposals.reduce((sum, a) => sum + a.value, 0)
        : null,
    proposedPricedLines: annualizedProposals.length,
    proposedUnpriced,
    message,
  };
}

/* ------------------------------------------------------------------ */
/* Keeping the board in step                                           */
/* ------------------------------------------------------------------ */

/** The board's line names, which are coarser than the workbench's. */
const BOARD_LINE_FOR: Record<WorkbenchLine, string> = {
  auto: "Auto",
  home: "Home",
  condo: "Home",
  renters: "Renters",
  umbrella: "Umbrella",
  life: "Life",
};

/**
 * The pipeline board's quote rows, rebuilt from the workbench.
 *
 * The board asks for one annual figure per line, so each chosen proposal is
 * put on a yearly footing first — a six-month premium written straight onto
 * the card would halve the account's apparent value. A line whose premium
 * cannot be annualized contributes an empty figure rather than a zero, which
 * the board already renders as "No quote".
 *
 * Returns null when there is nothing worth writing, and the caller then
 * leaves whatever the drawer put there alone. That matters: until the
 * workbench holds a priced quote it has no business overwriting a figure the
 * agent typed on the card.
 */
export function quoteRowsFromWorkbench(bench: Workbench): { line: string; premium: string }[] | null {
  const groups = quotesByLine(bench);
  const rows: { line: string; premium: string }[] = [];
  let priced = 0;

  for (const group of groups) {
    const proposal = chosenProposal(group);
    if (!proposal) continue;
    const annual = annualizedPremium(proposal);
    if (annual) priced += 1;
    rows.push({
      line: BOARD_LINE_FOR[group.line],
      premium: annual ? String(Math.round(annual.value * 100) / 100) : "",
    });
  }

  return priced > 0 ? rows : null;
}

/* ------------------------------------------------------------------ */
/* What the household already has                                      */
/* ------------------------------------------------------------------ */

export interface CurrentPolicyLine {
  line: WorkbenchLine;
  quote: QuoteVersion;
  annual: Annualized | null;
}

/** The current policies on record, in line order. Entered, never inferred. */
export function currentInsurance(bench: Workbench): CurrentPolicyLine[] {
  return quotesByLine(bench)
    .filter((g) => g.current !== undefined)
    .map((g) => ({
      line: g.line,
      quote: g.current!,
      annual: annualizedPremium(g.current!),
    }));
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const DOC_CATEGORIES = [
  "Declarations page",
  "Quote / proposal",
  "Application or form",
  "Photo",
  "Replacement cost estimate",
  "Correspondence",
  "Other",
];

export function blankDoc(day = today()): WorkbenchDoc {
  return {
    id: newId(),
    name: "",
    category: "Declarations page",
    location: "",
    notes: "",
    line: null,
    createdAt: day,
  };
}

/**
 * Whether a location is something a browser can actually open.
 *
 * A `C:\Users\...` path is not, and rendering it as a dead link would be a
 * small lie told repeatedly. Anything that is not http(s) gets a copy-path
 * control instead.
 */
export function docLinkKind(location: string): "url" | "path" | "empty" {
  const trimmed = String(location ?? "").trim();
  if (!trimmed) return "empty";
  return /^https?:\/\//i.test(trimmed) ? "url" : "path";
}

/**
 * Creates a document and hands back its id, ready to link.
 *
 * Exists so that "I have this on file" does not mean leaving the checklist,
 * going to the Documents pane, adding a row, coming back and finding the item
 * again. The name is seeded from whatever asked for it; the location is left
 * blank because only the agent knows where the file actually is.
 */
export function attachNewDoc(
  bench: Workbench,
  seed: { name: string; line?: WorkbenchLine | null; category?: string },
  day = today(),
): { bench: Workbench; docId: string } {
  const doc: WorkbenchDoc = {
    ...blankDoc(day),
    name: seed.name.trim() || "Untitled document",
    category: seed.category ?? "Declarations page",
    line: seed.line ?? null,
  };
  return { bench: { ...bench, docs: [...bench.docs, doc] }, docId: doc.id };
}

export function docById(bench: Workbench, id: string | undefined): WorkbenchDoc | undefined {
  return id ? bench.docs.find((d) => d.id === id) : undefined;
}

/* ------------------------------------------------------------------ */
/* Pre-bind                                                            */
/* ------------------------------------------------------------------ */

export interface PrebindReading {
  counts: StatusCounts;
  outstanding: PrebindItem[];
  selected: QuoteVersion[];
  /**
   * What is true, and nothing more. Never "ready to bind", never "approved",
   * never "requirements met" — those are claims this application cannot make.
   */
  summary: string;
}

export function readPrebind(bench: Workbench): PrebindReading {
  const counts = countStatuses(bench.prebind);
  const outstanding = bench.prebind.filter(
    (p) => p.status === "needed" || p.status === "requested",
  );
  const selected = bindingQuotes(bench);

  const quotePart =
    selected.length === 0
      ? "No quote is marked Planning to bind yet"
      : `${selected.length} quote${selected.length === 1 ? "" : "s"} marked for review`;

  const itemPart =
    outstanding.length === 0
      ? "nothing outstanding on the preparation list"
      : `${outstanding.length} preparation item${outstanding.length === 1 ? "" : "s"} outstanding`;

  return { counts, outstanding, selected, summary: `${quotePart} · ${itemPart}.` };
}

export function patchPrebind(
  items: PrebindItem[],
  id: string,
  patch: Partial<PrebindItem>,
  day = today(),
): PrebindItem[] {
  return items.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: day } : p));
}

/* ------------------------------------------------------------------ */
/* Copyable text                                                       */
/* ------------------------------------------------------------------ */

/** The first name to greet, falling back to something that is never wrong. */
export function greetingName(prospect: Prospect | undefined): string {
  const contact = (prospect?.contacts ?? []).find((c) => c.isPrimary) ?? prospect?.contacts?.[0];
  const first = (contact?.firstName || prospect?.firstName || "").trim();
  if (first) return first;
  const fromName = (prospect?.name || "").trim().split(/[\s&]+/)[0];
  return fromName || "there";
}

/**
 * Items a request should never ask somebody to type into ordinary email or
 * text.
 *
 * The agency's approved secure method is *referred to* rather than named: no
 * portal is invented here, and nothing asks the household to put a licence
 * number or a date of birth in a message.
 */
const SENSITIVE =
  /declaration|dec page|licen[cs]e|social security|\bssn\b|date of birth|\bdob\b|medical|policy number/i;

export function isSensitive(label: string): boolean {
  return SENSITIVE.test(label);
}

export interface RequestDraftInput {
  prospect: Prospect | undefined;
  items: ChecklistItem[];
  lines: WorkbenchLine[];
  ownerName?: string;
}

/**
 * Drafts the missing-information message.
 *
 * Built only from the items handed in, which the agent has already chosen.
 * Received and verified items never reach here — the caller offers only what
 * is outstanding — and nothing is sent: the draft is editable text that goes
 * to the clipboard.
 */
export function requestDraft(input: RequestDraftInput): string {
  const { prospect, items, lines, ownerName } = input;
  const name = greetingName(prospect);
  const words = lines.map((l) => LINE_LABELS[l].toLowerCase());
  const about =
    words.length === 0
      ? "your insurance quotes"
      : words.length === 1
        ? `your ${words[0]} quote`
        : `your ${words.slice(0, -1).join(", ")} and ${words[words.length - 1]} quotes`;

  const out: string[] = [
    `Hi ${name}, I'm working on ${about}. When you get a chance, could you send over the following?`,
    "",
  ];

  for (const item of items) {
    const prefix = item.line ? `${LINE_LABELS[item.line]}: ` : "";
    out.push(`• ${prefix}${item.label}${item.notes.trim() ? ` — ${item.notes.trim()}` : ""}`);
  }

  if (items.some((i) => isSensitive(i.label))) {
    out.push(
      "",
      "For anything with personal details on it, I'll send that over the agency's secure method rather than plain email or text — just say the word and I'll get it to you.",
    );
  }

  const signature = (ownerName || "Zach").trim().split(/\s+/)[0];
  out.push("", `Thanks! ${signature}`);
  return out.join("\n");
}

/**
 * A proposal summary built only from what was entered.
 *
 * Price and coverage are kept apart on purpose. A cheaper premium alongside a
 * higher deductible is two facts, and collapsing them into one "savings" line
 * is the thing this is written to avoid.
 */
export function proposalSummary(bench: Workbench, prospect: Prospect | undefined): string {
  const out: string[] = [`Proposal summary — ${prospect?.name || "household"}`, ""];
  let wrote = false;

  for (const group of quotesByLine(bench)) {
    const chosen = group.proposed.filter((q) => q.planningToBind);
    const shown = chosen.length > 0 ? chosen : group.proposed;
    if (shown.length === 0 && !group.current) continue;
    wrote = true;

    out.push(LINE_LABELS[group.line].toUpperCase());
    out.push(
      group.current
        ? `  Current: ${quoteTitle(group.current)} — ${premiumPhrase(group.current)}`
        : "  Current: not recorded",
    );

    for (const quote of shown) {
      out.push(
        `  Proposed: ${quoteTitle(quote)} — ${premiumPhrase(quote)}${quote.planningToBind ? " · planning to bind" : ""}`,
      );
      if (quote.effectiveDate) out.push(`    Effective ${quote.effectiveDate}`);
      for (const c of quote.coverages) {
        if (c.label.trim() || c.value.trim()) out.push(`    ${c.label}: ${c.value}`);
      }
      if (quote.billingNotes.trim()) out.push(`    Billing: ${quote.billingNotes.trim()}`);

      const comparison = comparePremiums(group.current, quote);
      out.push(`    Price: ${comparison.message}`);
      if (comparison.current?.converted) out.push(`      Current: ${comparison.current.note}`);
      if (comparison.proposed?.converted) out.push(`      Proposed: ${comparison.proposed.note}`);

      if (quote.differences.trim()) {
        out.push(`    Coverage differences / trade-offs: ${quote.differences.trim()}`);
      }
      if (quote.questions.trim()) out.push(`    Open questions: ${quote.questions.trim()}`);
    }
    out.push("");
  }

  if (!wrote) return `${out[0]}\n\nNothing entered yet.`;
  out.push(
    "Figures and coverage details above are as entered in the workbench. Coverage is not",
    "assumed to be equivalent between policies — read the differences line on each quote.",
  );
  return out.join("\n");
}

/**
 * The internal handoff for a pre-bind review.
 *
 * Names only the quotes explicitly marked Planning to bind, and states what is
 * still outstanding. It is careful about what it does not say: no line in here
 * asserts that coverage is bound, that underwriting has approved anything, or
 * that a carrier's requirements are satisfied.
 */
export function handoffSummary(
  bench: Workbench,
  prospect: Prospect | undefined,
  opportunity: Opportunity | undefined,
  day = today(),
): string {
  const reading = readPrebind(bench);
  const out: string[] = [
    `Pre-bind review handoff — ${prospect?.name || "household"}`,
    `Prepared ${day}`,
    "",
  ];

  if (prospect?.phone || prospect?.email) {
    out.push(`Contact: ${[prospect.phone, prospect.email].filter(Boolean).join(" · ")}`, "");
  }

  out.push("QUOTES SELECTED FOR BINDING");
  if (reading.selected.length === 0) {
    out.push("  None marked Planning to bind.");
  } else {
    for (const quote of reading.selected) {
      out.push(`  ${LINE_LABELS[quote.line]} — ${quoteTitle(quote)} — ${premiumPhrase(quote)}`);
      out.push(`    Intended effective date: ${quote.effectiveDate || "not set"}`);
      if (quote.billingNotes.trim()) out.push(`    Billing: ${quote.billingNotes.trim()}`);
      if (quote.differences.trim()) out.push(`    Coverage notes: ${quote.differences.trim()}`);
      if (quote.questions.trim()) out.push(`    Open questions: ${quote.questions.trim()}`);
    }
  }

  const docs = bench.docs.filter((d) => d.name.trim() || d.location.trim());
  out.push("", "SUPPORTING DOCUMENTS");
  if (docs.length === 0) {
    out.push("  None linked.");
  } else {
    for (const doc of docs) {
      out.push(
        `  ${doc.name || "Untitled"}${doc.category ? ` (${doc.category})` : ""} — ${doc.location || "location not recorded"}`,
      );
    }
  }

  out.push("", "OUTSTANDING — PREPARATION LIST");
  if (reading.outstanding.length === 0) {
    out.push("  Nothing outstanding.");
  } else {
    for (const item of reading.outstanding) {
      out.push(
        `  [${STATUS_LABELS[item.status]}] ${item.label}${item.notes.trim() ? ` — ${item.notes.trim()}` : ""}`,
      );
    }
  }

  const info = outstandingItems(bench.items);
  out.push("", "OUTSTANDING — INFORMATION AND QUESTIONS");
  if (info.length === 0) {
    out.push("  Nothing outstanding.");
  } else {
    for (const item of info) {
      out.push(
        `  [${STATUS_LABELS[item.status]}] ${item.line ? `${LINE_LABELS[item.line]}: ` : ""}${item.label}${item.notes.trim() ? ` — ${item.notes.trim()}` : ""}`,
      );
    }
  }

  if (opportunity) {
    out.push(
      "",
      `Stage: ${opportunity.stage}`,
      `Next action: ${opportunity.nextAction || "not set"}${opportunity.nextActionDate ? ` (due ${opportunity.nextActionDate})` : ""}`,
    );
  }

  out.push(
    "",
    "This is a preparation summary only. Nothing here states that coverage is bound,",
    "that underwriting has approved anything, or that a carrier's requirements have",
    "been met.",
  );

  return out.join("\n");
}
