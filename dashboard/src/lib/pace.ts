import { differenceInCalendarDays } from "date-fns";
import type { Period, PolicyLine } from "../types";
import type { LineId } from "../types";

/**
 * How far through the period we are, and whether the book is keeping up.
 *
 * This lived inside ProgressTab, which was fine while Progress was the only
 * screen that showed it. The Operator goal strip needs the same numbers, and
 * two copies of a pace calculation is exactly the kind of thing that drifts,
 * so it is one function now and both screens read it.
 */

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export interface PaceReading {
  /** False when the period is malformed — end on or before start. */
  valid: boolean;
  daysLeft: number;
  /** How much of the *period* has gone, 0–100. Drives the pace marker. */
  elapsedPct: number;
  /** How much of the *goal* is written, 0–100. Drives the bar fill. */
  writtenPct: number;
  /** Where the count should be today if the period ran evenly. */
  expectedTotal: number;
  written: number;
  goal: number;
  remaining: number;
  /** Policies per week needed to finish from here. */
  perWeek: number;
  /** written − expected. Positive is ahead. */
  delta: number;
  onPace: boolean;
  /** Whole policies behind, 0 when on pace or ahead. */
  behindBy: number;
}

export function readPace(period: Period, written: number, goal: number): PaceReading {
  const start = parseDay(period.start);
  const end = parseDay(period.end);
  const now = new Date();

  const totalDays = Math.max(1, differenceInCalendarDays(end, start));
  const elapsedDays = Math.min(totalDays, Math.max(0, differenceInCalendarDays(now, start)));
  const daysLeft = Math.max(0, differenceInCalendarDays(end, now));
  const elapsedPct = (elapsedDays / totalDays) * 100;
  const weeksLeft = daysLeft / 7;
  const remaining = Math.max(0, goal - written);
  const expectedTotal = (goal * elapsedPct) / 100;
  const delta = written - expectedTotal;

  return {
    valid: end > start,
    daysLeft,
    elapsedPct,
    // Clamped: a bar that overshoots its track reads as a rendering fault
    // rather than as good news.
    writtenPct: goal > 0 ? Math.min(100, (written / goal) * 100) : 0,
    expectedTotal,
    written,
    goal,
    remaining,
    perWeek: weeksLeft >= 1 ? remaining / weeksLeft : remaining,
    delta,
    // Half a policy either way is rounding, not a verdict.
    onPace: delta > -0.5,
    behindBy: delta > -0.5 ? 0 : Math.round(Math.abs(delta)),
  };
}

/** The book's count and goal across every line, which is what pace measures. */
export function lineTotals(lines: PolicyLine[], counts: Record<LineId, number>) {
  return lines.reduce(
    (acc, l) => {
      acc.policyCount += counts[l.id] ?? 0;
      acc.policyGoal += l.policyGoal;
      return acc;
    },
    { policyCount: 0, policyGoal: 0 },
  );
}
