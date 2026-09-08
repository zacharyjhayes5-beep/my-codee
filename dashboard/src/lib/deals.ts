import type { Opportunity, Prospect } from "../types";
import { newId } from "./storage";
import { blankOpportunity } from "./opportunities";

/**
 * The kanban's own record.
 *
 * Deliberately not the `Opportunity` the rest of the app runs on. The board
 * asks a coarser question — which of four columns is this in, and what has
 * been quoted — and it wants repeated lines ("two autos") and line types the
 * opportunity model has never carried. Keeping them apart means the board can
 * match the design exactly without bending everything downstream of it.
 *
 * The two are reconciled in step 3, when this stops living in local state.
 */

export type DealStage = "New" | "Quoted" | "Pending Decision" | "Written";

export type LineType =
  | "Auto"
  | "Home"
  | "Umbrella"
  | "Life"
  | "Farm / Ranch"
  | "Commercial"
  | "Renters"
  | "Boat / RV";

export type DealSource =
  | "Referral"
  | "Mailing"
  | "Cold call"
  | "Community"
  | "Social media"
  | "Walk-in";

/** Premium is the string as typed, parsed on read — never rounded on entry. */
export interface QuoteLine {
  line: LineType;
  premium: string;
}

export interface Deal {
  id: string;
  name: string;
  place: string;
  phone: string;
  source: DealSource;
  stage: DealStage;
  carrier: string;
  effective: string;
  notes: string;
  rows: QuoteLine[];
  /** ISO. What "Nd in stage" counts from. */
  stageEnteredAt: string;
}

export const DEAL_STAGES: { id: DealStage; label: string; hue: string }[] = [
  { id: "New", label: "New", hue: "#8f8b84" },
  { id: "Quoted", label: "Quoted", hue: "#c9a86a" },
  { id: "Pending Decision", label: "Pending Decision", hue: "#b0803e" },
  { id: "Written", label: "Written", hue: "#4f7f75" },
];

export const LINE_TYPES: LineType[] = [
  "Auto",
  "Home",
  "Umbrella",
  "Life",
  "Farm / Ranch",
  "Commercial",
  "Renters",
  "Boat / RV",
];

export const DEAL_SOURCES: DealSource[] = [
  "Referral",
  "Mailing",
  "Cold call",
  "Community",
  "Social media",
  "Walk-in",
];

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Sum of the lines. Anything unparseable counts as nothing, never as NaN. */
export function dealTotal(deal: Deal): number {
  return (deal.rows ?? []).reduce(
    (sum, r) => sum + (parseFloat(String(r.premium).replace(/[^0-9.]/g, "")) || 0),
    0,
  );
}

export function blankDeal(stage: DealStage = "New", at = new Date().toISOString()): Deal {
  return {
    id: newId(),
    name: "",
    place: "",
    phone: "",
    source: "Referral",
    stage,
    carrier: "",
    effective: "",
    notes: "",
    rows: [{ line: "Auto", premium: "" }],
    stageEnteredAt: at,
  };
}

/** Whole days since the card entered its column. */
export function daysInStage(deal: Deal, now = new Date()): number {
  const entered = new Date(deal.stageEnteredAt);
  if (Number.isNaN(entered.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - entered.getTime()) / 86_400_000));
}

/** "new" on the first day, then "4d in stage". */
export function ageLabel(deal: Deal, now = new Date()): string {
  const days = daysInStage(deal, now);
  return days === 0 ? "new" : `${days}d in stage`;
}

/** Ten days is cold, five is warm, anything fresher is unremarkable. */
export function ageTone(deal: Deal, now = new Date()): string {
  const days = daysInStage(deal, now);
  if (days >= 10) return "#9c5a48";
  if (days >= 5) return "#b0803e";
  return "#7e7a74";
}

/** Everything still in play — the board's headline figure excludes Written. */
export function openPremium(deals: Deal[]): number {
  return deals.filter((d) => d.stage !== "Written").reduce((t, d) => t + dealTotal(d), 0);
}

/**
 * Moving a card resets its clock.
 *
 * Days-in-stage is the point of the colour on the card, so it has to count
 * from the move rather than from when the household first appeared.
 */
export function moveDeal(
  deals: Deal[],
  id: string,
  stage: DealStage,
  at = new Date().toISOString(),
): Deal[] {
  return deals.map((d) =>
    d.id === id && d.stage !== stage ? { ...d, stage, stageEnteredAt: at } : d,
  );
}

export function upsertDeal(deals: Deal[], deal: Deal): Deal[] {
  return deals.some((d) => d.id === deal.id)
    ? deals.map((d) => (d.id === deal.id ? deal : d))
    : [...deals, deal];
}

export function removeDeal(deals: Deal[], id: string): Deal[] {
  return deals.filter((d) => d.id !== id);
}

/* ------------------------------------------------------------------ */
/* Seeding the board from what the app already knows                   */
/* ------------------------------------------------------------------ */

/** The eight opportunity stages folded onto the board's four. */
const STAGE_FROM_OPPORTUNITY: Record<string, DealStage | null> = {
  "Qualified / Open": "New",
  "Fact-Find / Information Gathering": "New",
  Quoting: "Quoted",
  "Quote Presented": "Quoted",
  "Decision Pending": "Pending Decision",
  Won: "Written",
  // Neither has a column, and inventing one for them would put dead work on
  // a board about live work.
  Lost: null,
  Nurture: null,
};

const LINE_FROM_OPPORTUNITY: Record<string, LineType> = {
  Auto: "Auto",
  Home: "Home",
  Umbrella: "Umbrella",
  Life: "Life",
  Commercial: "Commercial",
  Other: "Auto",
};

/** The stage an opportunity is written back as, one per column. */
export const OPPORTUNITY_STAGE_FOR: Record<DealStage, string> = {
  New: "Qualified / Open",
  Quoted: "Quoting",
  "Pending Decision": "Decision Pending",
  Written: "Won",
};

/**
 * Build the board from the opportunities already in the app.
 *
 * The board is a view over the records the rest of the dashboard reads, not
 * a second copy of them. That is what keeps Operator's queue, the daily
 * brief and the book of business agreeing with what is on screen here.
 */
export function dealsFromOpportunities(
  opportunities: Opportunity[],
  prospects: Prospect[],
): Deal[] {
  const byId = new Map(prospects.map((p) => [p.id, p]));

  return opportunities
    .map((o) => {
      const stage = STAGE_FROM_OPPORTUNITY[o.stage];
      if (!stage) return null;
      const household = byId.get(o.prospectId);

      // Rows the board wrote win. Anything older is read out of the coarser
      // `lines` and `premiums` it had at the time.
      const stored = (o.quoteRows ?? []).filter((r) => r && typeof r.line === "string");
      const rows: QuoteLine[] =
        stored.length > 0
          ? stored.map((r) => ({
              line: (LINE_TYPES.includes(r.line as LineType) ? r.line : "Auto") as LineType,
              premium: String(r.premium ?? ""),
            }))
          : (o.lines ?? []).map((line) => ({
              line: LINE_FROM_OPPORTUNITY[line] ?? "Auto",
              premium: o.premiums?.[line] != null ? String(o.premiums[line]) : "",
            }));

      return {
        id: o.id,
        name: household?.name ?? "Unknown household",
        place: household?.area?.split(",")[0] ?? "",
        phone: household?.phone ?? "",
        source: (DEAL_SOURCES.includes(o.source as DealSource)
          ? o.source
          : "Referral") as DealSource,
        stage,
        carrier: o.carrier ?? "",
        effective: o.nextActionDate ?? "",
        notes: o.notes ?? "",
        rows: rows.length > 0 ? rows : [{ line: "Auto" as LineType, premium: "" }],
        stageEnteredAt:
          o.stageEnteredAt ||
          (o.updatedAt ? `${o.updatedAt}T00:00:00` : new Date().toISOString()),
      } satisfies Deal;
    })
    .filter((d): d is Deal => d !== null);
}


/* ------------------------------------------------------------------ */
/* Writing the board back                                              */
/* ------------------------------------------------------------------ */

/**
 * The household and the account a saved card becomes.
 *
 * The drawer edits both at once — a name and a town belong to the person, a
 * stage and a quote belong to the work — so saving has to touch two records.
 * Both are returned together and written in one go, rather than one of them
 * landing and the other not.
 */
export function recordsFromDeal(
  deal: Deal,
  opportunity: Opportunity | undefined,
  prospect: Prospect | undefined,
): { opportunity: Opportunity; prospect: Prospect | undefined } {
  const base = opportunity ?? blankOpportunity(prospect?.id ?? deal.id);

  const next: Opportunity = {
    ...base,
    id: deal.id,
    prospectId: prospect?.id ?? base.prospectId,
    stage: OPPORTUNITY_STAGE_FOR[deal.stage] as Opportunity["stage"],
    stageEnteredAt: deal.stageEnteredAt,
    quoteRows: deal.rows,
    // `lines` still drives everything written before the board existed, so it
    // is kept in step with the rows rather than left to rot.
    lines: [...new Set(deal.rows.map((r) => OPPORTUNITY_LINE_FOR[r.line]).filter(Boolean))] as Opportunity["lines"],
    source: deal.source,
    carrier: deal.carrier,
    notes: deal.notes,
    nextActionDate: deal.effective || base.nextActionDate,
    // The model refuses an account with no next action; a saved card that has
    // never had one gets the plainest true statement of what it is.
    nextAction: base.nextAction || "Follow up",
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  const household = prospect
    ? {
        ...prospect,
        name: deal.name || prospect.name,
        area: deal.place ? `${deal.place}, MI` : prospect.area,
        phone: deal.phone || prospect.phone,
      }
    : undefined;

  return { opportunity: next, prospect: household };
}

/** The reverse of LINE_FROM_OPPORTUNITY, for the lines the old field can name. */
const OPPORTUNITY_LINE_FOR: Record<string, string> = {
  Auto: "Auto",
  Home: "Home",
  Umbrella: "Umbrella",
  Life: "Life",
  Commercial: "Commercial",
  "Farm / Ranch": "Other",
  Renters: "Other",
  "Boat / RV": "Other",
};

/**
 * Rebuild the board's rows from the older per-line premiums.
 *
 * The household record still edits `lines` and `premiums`, and the board
 * reads `quoteRows`. Without this, pricing a line from inside a household
 * would be a silent no-op — the number saved and the board never moved.
 * Called wherever the older editor writes.
 */
export function syncQuoteRowsFromPremiums(opportunity: Opportunity): Opportunity {
  return {
    ...opportunity,
    quoteRows: (opportunity.lines ?? []).map((line) => ({
      line: LINE_FROM_OPPORTUNITY[line] ?? "Auto",
      premium:
        opportunity.premiums?.[line] != null ? String(opportunity.premiums[line]) : "",
    })),
  };
}
