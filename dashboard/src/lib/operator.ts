import type { Opportunity, Prospect, ReviewProposal, Task } from "../types";
import { whatNeedsMe } from "./attention";
import {
  daysSince,
  isQuiet,
  isTerminal,
  lastTouchOf,
  missingPhone,
  nextStepOf,
  type Tone,
} from "./leadView";

/**
 * What Operator shows: who is up next, and what is waiting on you.
 *
 * Both are derived, never stored. The ranking is the one `attention.ts`
 * already does — this adds the household the item belongs to and the short
 * imperative tag the design puts on the right of each row.
 */

export interface QueueItem {
  id: string;
  /** I–IV. The design numbers the queue in roman. */
  numeral: string;
  name: string;
  reason: string;
  /** TODAY / CHASE / QUIET / SCHEDULE — what to actually do. */
  action: string;
  tone: Tone;
  prospectId?: string;
}

const NUMERALS = ["I", "II", "III", "IV"];

/**
 * The four households that most deserve the next hour.
 *
 * `whatNeedsMe` ranks the work; this turns the top of that ranking into
 * households, one row each, so the same family cannot occupy the whole queue
 * by having three overdue things at once.
 */
export function upNext(
  input: {
    prospects: Prospect[];
    opportunities: Opportunity[];
    tasks: Task[];
    reviews: ReviewProposal[];
    today: string;
  },
  limit = 4,
): QueueItem[] {
  const { prospects, today } = input;
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const rows: QueueItem[] = [];
  const seen = new Set<string>();

  // Ask for far more than four: the ranked list is mostly household work, but
  // the housekeeping entries at the bottom have no household at all.
  for (const item of whatNeedsMe(input, 60)) {
    if (rows.length >= limit) break;
    if (!item.prospectId) continue;
    if (seen.has(item.prospectId)) continue;

    const prospect = byId.get(item.prospectId);
    if (!prospect || isTerminal(prospect)) continue;

    seen.add(item.prospectId);
    const overdue = item.kind === "overdue-follow-up";
    const stalled = item.kind === "stalled-quote";

    rows.push({
      id: item.id,
      numeral: NUMERALS[rows.length] ?? String(rows.length + 1),
      name: prospect.name,
      reason: item.title,
      action:
        item.kind === "appointment-today"
          ? "TODAY"
          : stalled
            ? "QUIET"
            : overdue
              ? "CHASE"
              : item.kind === "attempt-review"
                ? "REVIEW"
                : "TODAY",
      tone: stalled ? "terracotta" : overdue ? "terracotta" : "brass",
      prospectId: item.prospectId,
    });
  }

  // Still short? Fill from the households that have gone quiet longest. A
  // four-row queue that renders two rows looks broken rather than calm.
  if (rows.length < limit) {
    const quiet = prospects
      .filter((p) => !isTerminal(p) && !seen.has(p.id))
      .map((p) => ({ p, days: daysSince(lastTouchOf(p), today) }))
      .sort((a, b) => (b.days ?? 9_999) - (a.days ?? 9_999));

    for (const { p } of quiet) {
      if (rows.length >= limit) break;
      seen.add(p.id);
      rows.push({
        id: `quiet-${p.id}`,
        numeral: NUMERALS[rows.length] ?? String(rows.length + 1),
        name: p.name,
        reason: nextStepOf(p, input.tasks, input.opportunities),
        action: isQuiet(p, today) ? "QUIET" : "SCHEDULE",
        tone: isQuiet(p, today) ? "terracotta" : "grey",
        prospectId: p.id,
      });
    }
  }

  return rows;
}

export interface WaitingRow {
  id: "overdue" | "today" | "reviews" | "no-phone";
  label: string;
  count: number;
  tone: Tone;
}

/** The four counts on the right of the goal row. Each one is a way in. */
export function waitingOnYou(input: {
  tasks: Task[];
  reviews: ReviewProposal[];
  prospects: Prospect[];
  today: string;
}): WaitingRow[] {
  const { tasks, reviews, prospects, today } = input;
  const open = tasks.filter((t) => !t.done && t.dueDate);

  return [
    {
      id: "overdue",
      label: "Overdue tasks",
      count: open.filter((t) => (t.dueDate ?? "") < today).length,
      tone: "terracotta",
    },
    {
      id: "today",
      label: "Due today",
      count: open.filter((t) => t.dueDate === today).length,
      tone: "brass",
    },
    {
      id: "reviews",
      label: "Reviews to approve",
      count: reviews.filter((r) => r.status === "pending" || r.status === "edited").length,
      tone: "brass",
    },
    {
      id: "no-phone",
      label: "Leads missing a phone",
      count: missingPhone(prospects).length,
      tone: "grey",
    },
  ];
}

/** Overdue / today / tomorrow / later / done — the tone of a task's due tag. */
export function dueTag(task: Task, today: string): { label: string; tone: Tone } {
  if (task.done) return { label: "DONE", tone: "verdigris" };
  if (!task.dueDate) return { label: "NO DATE", tone: "grey" };

  const days = daysSince(today, task.dueDate);
  if (days === null) return { label: "NO DATE", tone: "grey" };
  if (days < 0) return { label: "OVERDUE", tone: "terracotta" };
  if (days === 0) return { label: "TODAY", tone: "brass" };
  if (days === 1) return { label: "TOMORROW", tone: "brass" };
  return { label: `${days} DAYS`, tone: "grey" };
}
