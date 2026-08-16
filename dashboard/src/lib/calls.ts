import type { Call, CallOutcome, Prospect } from "../types";
import { newId } from "./storage";

/**
 * Everything derived from call records. Kept out of the components so the
 * arithmetic that decides "how many times have I rung this household" has one
 * home and can be tested against hand counts.
 */

/** The two outcomes that mean nobody picked up. */
export const NO_ANSWER_OUTCOMES: CallOutcome[] = [
  "No Answer — No Voicemail",
  "No Answer — Voicemail",
];

export function isNoAnswer(outcome: CallOutcome): boolean {
  return NO_ANSWER_OUTCOMES.includes(outcome);
}

export function blankCall(prospectId: string): Call {
  return {
    id: newId(),
    prospectId,
    at: new Date().toISOString(),
    direction: "outbound",
    outcome: "No Answer — No Voicemail",
    durationMin: null,
    summary: "",
    notes: "",
    sourceRef: null,
    createdBy: "manual",
    createdAt: new Date().toISOString(),
  };
}

/** Only this household's calls, newest first. */
export function callsFor(calls: Call[], prospectId: string): Call[] {
  return calls
    .filter((c) => c.prospectId === prospectId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The most recent call by when it happened, not when it was typed in. */
export function latestCall(prospectCalls: Call[]): Call | null {
  if (prospectCalls.length === 0) return null;
  return prospectCalls.reduce((newest, c) => (c.at > newest.at ? c : newest));
}

export interface AttemptCounts {
  /** Dials that went unanswered — what the seven-attempt cap counts. */
  attempts: number;
  /** How many of those left a message — capped at three. */
  voicemails: number;
  /** Every logged call, answered or not. */
  total: number;
}

export function attemptCounts(prospectCalls: Call[]): AttemptCounts {
  let attempts = 0;
  let voicemails = 0;

  for (const call of prospectCalls) {
    if (!isNoAnswer(call.outcome)) continue;
    attempts += 1;
    if (call.outcome === "No Answer — Voicemail") voicemails += 1;
  }

  return { attempts, voicemails, total: prospectCalls.length };
}

/**
 * Rewrites the three fields on the household that mirror its newest call.
 * Always recomputed from the full list rather than patched from whichever call
 * was just saved — that is what makes editing or deleting the latest call
 * settle back to the right answer instead of leaving a stale outcome behind.
 */
export function withLatestCallFields(prospect: Prospect, prospectCalls: Call[]): Prospect {
  const newest = latestCall(prospectCalls);

  if (!newest) {
    return {
      ...prospect,
      lastOutcome: null,
      lastOutcomeAt: "",
      lastContactedAt: "",
    };
  }

  return {
    ...prospect,
    lastOutcome: newest.outcome,
    lastOutcomeAt: newest.at,
    // Any logged call counts as a touch, answered or not.
    lastContactedAt: newest.at,
  };
}

/* ------------------------------------------------------------------ */
/* Date handling for the form                                          */
/* ------------------------------------------------------------------ */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * The calendar day an instant falls on **where the user is**.
 *
 * Slicing an ISO string gives the UTC date, so a call logged at eight in the
 * evening in Michigan would be stamped with tomorrow and vanish from today's
 * numbers. Everything that compares a timestamp against "today" goes through
 * here.
 */
export function localDay(iso: string): string {
  if (!iso) return "";
  // A date-only value is already a local calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input wants. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the input gives back → an ISO instant. Empty stays empty. */
export function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** "Tue 12 Aug, 2:15 pm" — short enough for a list row. */
export function formatCallMoment(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
