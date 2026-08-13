import type { LineId, Period, PolicyLine, ProspectStatus, Urgency } from "../types";

export const defaultPolicyLines: PolicyLine[] = [
  { id: "property", name: "Property", policyGoal: 40, premiumGoal: 0 },
  { id: "casualty", name: "Casualty", policyGoal: 40, premiumGoal: 0 },
  { id: "life", name: "Life", policyGoal: 25, premiumGoal: 0 },
];

// End of period is fixed by the goal; the start is editable on the Progress tab.
export const defaultPeriod: Period = { start: "2026-01-01", end: "2027-01-01" };

export const defaultOwnerName = "Zach Hayes";

export const lineOptions: { id: LineId; name: string }[] = [
  { id: "property", name: "Property" },
  { id: "casualty", name: "Casualty" },
  { id: "life", name: "Life" },
];

export const prospectStatuses: ProspectStatus[] = [
  "New",
  "Contacted",
  "Meeting Scheduled",
  "Open to Quote",
  "Closed",
  "Lost",
];

/** The four sections of the To-Do tab, in the order they're shown. */
export const urgencyLevels: { id: Urgency; name: string; blurb: string }[] = [
  { id: "now", name: "Now", blurb: "Today, or already late" },
  { id: "week", name: "This week", blurb: "Has a day on it" },
  { id: "soon", name: "Soon", blurb: "Matters, no date yet" },
  { id: "someday", name: "Someday", blurb: "When there's room" },
];

export const urgencyColor: Record<Urgency, string> = {
  now: "var(--status-critical)",
  week: "var(--status-warning)",
  soon: "var(--accent)",
  someday: "var(--text-muted)",
};

export const urgencyName: Record<Urgency, string> = {
  now: "Now",
  week: "This week",
  soon: "Soon",
  someday: "Someday",
};

export const statusClass: Record<ProspectStatus, string> = {
  New: "badge-muted",
  Contacted: "badge-info",
  "Meeting Scheduled": "badge-warning",
  "Open to Quote": "badge-serious",
  Closed: "badge-good",
  Lost: "badge-critical",
};

/**
 * NADP commission-multiplier tiers, month 6 row of the 2026 Agency
 * Compensation guide (Part V, page 8). Property and Casualty are counted
 * together there, so `pc` is the combined target.
 */
export interface Tier {
  id: string;
  name: string;
  multiplier: string;
  pc: number;
  life: number;
}

export const monthSixTiers: Tier[] = [
  { id: "tier-1", name: "Tier 1", multiplier: "0.50", pc: 50, life: 12 },
  { id: "tier-2", name: "Tier 2", multiplier: "0.70", pc: 63, life: 18 },
  { id: "tier-3", name: "Tier 3", multiplier: "1.00", pc: 77, life: 24 },
];

/**
 * All-American qualifications, 2026, for agents contracted 2022 or after.
 * Two alternative paths — meeting either one qualifies. Both also require the
 * persistency and annuity minimums below, which is why those are separate.
 */
export interface AllAmericanPath {
  id: string;
  name: string;
  blurb: string;
  /** New life commission, gross — before the NADP multiplier. */
  commission: number;
  /** New inforce and retained life policies, annuities not counted. */
  policies: number;
}

export const allAmericanPaths: AllAmericanPath[] = [
  { id: "path-a", name: "Path A", blurb: "Higher commission, fewer policies", commission: 11000, policies: 35 },
  { id: "path-b", name: "Path B", blurb: "Lower commission, more policies", commission: 9000, policies: 50 },
];

/** 36-month life persistency, required on both paths. */
export const allAmericanPersistency = 85;

/** New annuities, required on both paths. */
export const allAmericanAnnuities = 1;

export const seriesColors: Record<LineId, string> = {
  property: "var(--series-1)",
  casualty: "var(--series-2)",
  life: "var(--series-3)",
};
