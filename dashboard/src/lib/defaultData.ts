import type { LineId, Period, PolicyLine, ProspectStatus } from "../types";

export const defaultPolicyLines: PolicyLine[] = [
  { id: "property", name: "Property", policyCount: 0, policyGoal: 40, premium: 0, premiumGoal: 0 },
  { id: "casualty", name: "Casualty", policyCount: 0, policyGoal: 40, premium: 0, premiumGoal: 0 },
  { id: "life", name: "Life", policyCount: 0, policyGoal: 25, premium: 0, premiumGoal: 0 },
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

export const seriesColors: Record<LineId, string> = {
  property: "var(--series-1)",
  casualty: "var(--series-2)",
  life: "var(--series-3)",
};
