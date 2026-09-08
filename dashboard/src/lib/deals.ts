import type { Opportunity, Prospect } from "../types";
import { newId } from "./storage";

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

/**
 * Build the board from the opportunities already in the app.
 *
 * Step one holds the board in local state, and seeding it from real
 * households rather than invented ones is what makes the review worth
 * anything — the columns show his own book.
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

      const rows: QuoteLine[] = (o.lines ?? []).map((line) => ({
        line: LINE_FROM_OPPORTUNITY[line] ?? "Auto",
        premium: o.premiums?.[line] != null ? String(o.premiums[line]) : "",
      }));

      return {
        id: o.id,
        name: household?.name ?? "Unknown household",
        place: household?.area?.split(",")[0] ?? "",
        phone: household?.phone ?? "",
        source: "Referral" as DealSource,
        stage,
        carrier: "",
        effective: o.nextActionDate ?? "",
        notes: o.notes ?? "",
        rows: rows.length > 0 ? rows : [{ line: "Auto" as LineType, premium: "" }],
        stageEnteredAt: o.updatedAt ? `${o.updatedAt}T00:00:00` : new Date().toISOString(),
      } satisfies Deal;
    })
    .filter((d): d is Deal => d !== null);
}
