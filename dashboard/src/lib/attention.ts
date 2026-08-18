import type { Opportunity, Prospect, ReviewProposal, Task } from "../types";
import { localDay } from "./calls";
import { isStalled } from "./opportunities";
import { researchCount } from "./research";

/**
 * What Needs Me.
 *
 * A short, ranked list of what genuinely wants attention now. The hard part is
 * what it leaves out — a list of everything is the thing this replaces.
 */

export type AttentionKind =
  | "hot-opportunity"
  | "overdue-follow-up"
  | "appointment-today"
  | "quote-due"
  | "stalled-quote"
  | "attempt-review"
  | "needs-research"
  | "pending-review";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** Rank — lower is more urgent. */
  rank: number;
  title: string;
  detail: string;
  prospectId?: string;
  /** Where pressing it should land. */
  target: "prospects" | "todo" | "pipeline";
}

const RANKS: Record<AttentionKind, number> = {
  "hot-opportunity": 1,
  "appointment-today": 2,
  "overdue-follow-up": 3,
  "quote-due": 4,
  "stalled-quote": 5,
  "attempt-review": 6,
  // Below the work that closes business, above housekeeping. Research is how
  // tomorrow's calls get made, so it belongs on the list — but never ahead of
  // a quote that is already live.
  "needs-research": 7,
  "pending-review": 8,
};

export interface AttentionInput {
  prospects: Prospect[];
  opportunities: Opportunity[];
  tasks: Task[];
  reviews: ReviewProposal[];
  today: string;
}

export function whatNeedsMe(input: AttentionInput, limit = 5): AttentionItem[] {
  const { prospects, opportunities, tasks, reviews, today } = input;
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name || "A household";

  const items: AttentionItem[] = [];

  for (const opportunity of opportunities) {
    if (opportunity.stage === "Written" || opportunity.stage === "Lost") continue;

    const appointmentToday = opportunity.appointments.find((a) => localDay(a.at) === today);
    if (appointmentToday) {
      items.push({
        id: `appt-${appointmentToday.id}`,
        kind: "appointment-today",
        rank: RANKS["appointment-today"],
        title: `${appointmentToday.kind === "insurance-review" ? "Insurance review" : "Appointment"} — ${nameOf(opportunity.prospectId)}`,
        detail: new Date(appointmentToday.at).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }),
        prospectId: opportunity.prospectId,
        target: "pipeline",
      });
    }

    if (opportunity.nextActionDate && opportunity.nextActionDate <= today) {
      const overdue = opportunity.nextActionDate < today;
      items.push({
        id: `opp-${opportunity.id}`,
        kind: "hot-opportunity",
        rank: RANKS["hot-opportunity"],
        title: `${nameOf(opportunity.prospectId)} — ${opportunity.nextAction}`,
        detail: `${opportunity.stage}${overdue ? ` · overdue since ${opportunity.nextActionDate}` : " · due today"}`,
        prospectId: opportunity.prospectId,
        target: "pipeline",
      });
    } else if (isStalled(opportunity, today)) {
      items.push({
        id: `stall-${opportunity.id}`,
        kind: "stalled-quote",
        rank: RANKS["stalled-quote"],
        title: `${nameOf(opportunity.prospectId)} has sat at ${opportunity.stage}`,
        detail: `Nothing has moved since ${opportunity.updatedAt}`,
        prospectId: opportunity.prospectId,
        target: "pipeline",
      });
    }
  }

  for (const task of tasks) {
    if (task.done || !task.dueDate) continue;
    if (task.dueDate > today) continue;

    const overdue = task.dueDate < today;
    const isQuote = task.kind === "quote" || task.ruleId === "build-quote";

    items.push({
      id: `task-${task.id}`,
      kind: overdue ? "overdue-follow-up" : isQuote ? "quote-due" : "overdue-follow-up",
      rank: overdue ? RANKS["overdue-follow-up"] : isQuote ? RANKS["quote-due"] : RANKS["quote-due"],
      title: task.text,
      detail: overdue ? `Overdue since ${task.dueDate}` : "Due today",
      prospectId: task.prospectId,
      target: "todo",
    });
  }

  const flagged = prospects.filter((p) => p.needsReview);
  if (flagged.length > 0) {
    items.push({
      id: "attempt-review",
      kind: "attempt-review",
      rank: RANKS["attempt-review"],
      title: `${flagged.length} household${flagged.length === 1 ? "" : "s"} hit the attempt cap`,
      detail: "Keep calling or close them — nothing was closed automatically",
      target: "prospects",
    });
  }

  const research = researchCount(prospects);
  if (research > 0) {
    items.push({
      id: "needs-research",
      kind: "needs-research",
      rank: RANKS["needs-research"],
      title: `${research} propert${research === 1 ? "y" : "ies"} need a phone number`,
      detail: "Found on the county roll. Add a number and they join the call queue.",
      target: "prospects",
    });
  }

  const pending = reviews.filter((r) => r.status === "pending" || r.status === "edited");
  if (pending.length > 0) {
    items.push({
      id: "pending-reviews",
      kind: "pending-review",
      rank: RANKS["pending-review"],
      title: `${pending.length} proposal${pending.length === 1 ? "" : "s"} waiting`,
      detail: "Nothing applies until you approve it",
      target: "todo",
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

/** Everything due or overdue, for the follow-up list rather than the top five. */
export function actionableFollowUps(input: AttentionInput): AttentionItem[] {
  return whatNeedsMe(input, Number.MAX_SAFE_INTEGER).filter(
    (i) => i.kind === "overdue-follow-up" || i.kind === "quote-due" || i.kind === "hot-opportunity",
  );
}
