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

export const seriesColors: Record<LineId, string> = {
  property: "var(--series-1)",
  casualty: "var(--series-2)",
  life: "var(--series-3)",
};
