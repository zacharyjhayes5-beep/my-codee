import type { Call, CallOutcome, Prospect } from "../types";

/**
 * Call schema v2 renamed three outcomes to the exact wording in the spec.
 * The values are stored on every call record and mirrored onto the household's
 * `lastOutcome`, so both have to be carried across — a rename that only
 * touches the dropdown leaves old calls showing a value nothing recognises.
 */

export const CALL_SCHEMA_VERSION = 2;

export const OUTCOME_RENAMES: Record<string, CallOutcome> = {
  "No Answer — Voicemail Left": "No Answer — Voicemail",
  "Bad Phone Number": "Bad Number",
  "Hot Lead — Very Interested": "Hot Lead",
  "Not at This Time": "Not At This Time",
};

const CURRENT: CallOutcome[] = [
  "No Answer — No Voicemail",
  "No Answer — Voicemail",
  "Bad Number",
  "Definitely Not Interested",
  "Not At This Time",
  "Somewhat Interested",
  "Hot Lead",
  "Insurance Review Scheduled",
];

/** Maps an outcome of any vintage onto the current wording. */
export function currentOutcome(value: unknown): CallOutcome | null {
  if (typeof value !== "string" || !value) return null;
  if (CURRENT.includes(value as CallOutcome)) return value as CallOutcome;
  return OUTCOME_RENAMES[value] ?? null;
}

export function normalizeCall(call: Call): Call {
  const outcome = currentOutcome(call.outcome);
  return outcome && outcome !== call.outcome ? { ...call, outcome } : call;
}

export function normalizeCalls(calls: Call[]): Call[] {
  return calls.map(normalizeCall);
}

/** True when at least one record still holds a retired outcome name. */
export function callsNeedMigration(calls: Call[]): boolean {
  return calls.some((c) => currentOutcome(c.outcome) !== c.outcome);
}

export function normalizeProspectOutcome(prospect: Prospect): Prospect {
  if (!prospect.lastOutcome) return prospect;
  const outcome = currentOutcome(prospect.lastOutcome);
  return outcome && outcome !== prospect.lastOutcome ? { ...prospect, lastOutcome: outcome } : prospect;
}
