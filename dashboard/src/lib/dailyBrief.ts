import type { Call, Opportunity, Prospect, ReviewProposal, Task } from "../types";
import { localDay } from "./calls";
import { countDay, readGoals, type GoalReading } from "./goals";
import { buildQueue } from "./queue";
import { researchCount } from "./research";

/**
 * The Daily Brief.
 *
 * Thirty seconds to understand the day. It answers what happened yesterday,
 * what is booked today, what is late, who is worth ringing, and — the part
 * that earns its place — what to actually do first.
 */

export interface ScheduleItem {
  id: string;
  at: string;
  time: string;
  title: string;
  detail: string;
  prospectId: string;
  kind: "insurance-review" | "meeting" | "call";
}

export function todaysSchedule(
  opportunities: Opportunity[],
  prospects: Prospect[],
  today: string,
): ScheduleItem[] {
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const items: ScheduleItem[] = [];

  for (const opportunity of opportunities) {
    for (const appointment of opportunity.appointments) {
      if (localDay(appointment.at) !== today) continue;
      items.push({
        id: appointment.id,
        at: appointment.at,
        time: new Date(appointment.at).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }),
        title:
          appointment.kind === "insurance-review"
            ? `Insurance review — ${byId.get(opportunity.prospectId)?.name ?? "Household"}`
            : `${byId.get(opportunity.prospectId)?.name ?? "Household"}`,
        detail: `${opportunity.stage}${opportunity.lines.length ? ` · ${opportunity.lines.join(", ")}` : ""}`,
        prospectId: opportunity.prospectId,
        kind: appointment.kind,
      });
    }
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}

export interface FollowUpItem {
  id: string;
  title: string;
  why: string;
  priority: "overdue" | "today";
  recommended: string;
  dueDate: string;
  prospectId?: string;
}

/** Only what is actionable — never the whole contact list. */
export function dueFollowUps(
  tasks: Task[],
  opportunities: Opportunity[],
  prospects: Prospect[],
  today: string,
): FollowUpItem[] {
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const items: FollowUpItem[] = [];

  for (const task of tasks) {
    if (task.done || !task.dueDate || task.dueDate > today) continue;
    items.push({
      id: `task-${task.id}`,
      title: task.text,
      why: task.prospectId ? (byId.get(task.prospectId)?.name ?? "Household") : "Standalone task",
      priority: task.dueDate < today ? "overdue" : "today",
      recommended: task.kind === "quote" ? "Finish the quote" : "Call them",
      dueDate: task.dueDate,
      prospectId: task.prospectId,
    });
  }

  for (const opportunity of opportunities) {
    if (opportunity.stage === "Written" || opportunity.stage === "Lost") continue;
    if (!opportunity.nextActionDate || opportunity.nextActionDate > today) continue;
    items.push({
      id: `opp-${opportunity.id}`,
      title: opportunity.nextAction,
      why: `${byId.get(opportunity.prospectId)?.name ?? "Household"} · ${opportunity.stage}`,
      priority: opportunity.nextActionDate < today ? "overdue" : "today",
      recommended: opportunity.nextAction,
      dueDate: opportunity.nextActionDate,
      prospectId: opportunity.prospectId,
    });
  }

  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "overdue" ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/* ------------------------------------------------------------------ */
/* The brief                                                           */
/* ------------------------------------------------------------------ */

export interface DailyBrief {
  yesterday: { dials: number; conversations: number; hotLeads: number; reviewsBooked: number };
  appointments: ScheduleItem[];
  followUps: { overdue: number; today: number };
  freshProspects: { id: string; name: string; why: string }[];
  goals: GoalReading[];
  /** The single most important thing right now, in one line. */
  headline: string;
  /** What to actually do, in order. */
  focus: string[];
}

export function buildDailyBrief(input: {
  prospects: Prospect[];
  calls: Call[];
  tasks: Task[];
  opportunities: Opportunity[];
  reviews: ReviewProposal[];
  today: string;
  yesterday: string;
  now: Date;
}): DailyBrief {
  const { prospects, calls, tasks, opportunities, reviews, today, yesterday, now } = input;

  const yesterdayCounts = countDay(calls, prospects, tasks, yesterday);
  const appointments = todaysSchedule(opportunities, prospects, today);
  const followUps = dueFollowUps(tasks, opportunities, prospects, today);
  const overdue = followUps.filter((f) => f.priority === "overdue").length;
  const dueToday = followUps.filter((f) => f.priority === "today").length;

  const goals = readGoals(countDay(calls, prospects, tasks, today), now);

  // Worth ringing today: eligible, graded or researched, never yet called.
  const queue = buildQueue({ prospects, calls, tasks, opportunities, today });
  const freshProspects = queue
    .filter((e) => e.eligibility.eligible && e.attempts === 0 && e.tier <= 4)
    .slice(0, 5)
    .map((e) => ({ id: e.prospect.id, name: e.prospect.name || "Untitled", why: e.why }));

  const pendingReviews = reviews.filter((r) => r.status === "pending" || r.status === "edited").length;

  /* --- the one thing --- */
  let headline: string;
  if (appointments.length > 0) {
    headline = `${appointments[0].title} at ${appointments[0].time}`;
  } else if (overdue > 0) {
    headline = `${overdue} follow-up${overdue === 1 ? " is" : "s are"} overdue`;
  } else if (dueToday > 0) {
    headline = `${dueToday} follow-up${dueToday === 1 ? "" : "s"} due today`;
  } else if (freshProspects.length > 0) {
    headline = `${freshProspects.length} qualified household${freshProspects.length === 1 ? "" : "s"} ready to call`;
  } else {
    headline = "Nothing booked — the queue is the work";
  }

  /* --- what to do, in order --- */
  const focus: string[] = [];

  if (appointments.length > 0) {
    focus.push(`Be ready for ${appointments.length} appointment${appointments.length === 1 ? "" : "s"}`);
  }
  if (overdue > 0) {
    focus.push(`Clear ${overdue} overdue follow-up${overdue === 1 ? "" : "s"} before new dials`);
  }
  if (dueToday > 0) {
    // Without this the brief could name follow-ups in its headline and then
    // never tell you to do them.
    focus.push(`Work ${dueToday} follow-up${dueToday === 1 ? "" : "s"} due today`);
  }

  const quoteWork = followUps.filter((f) => f.recommended.toLowerCase().includes("quote")).length;
  if (quoteWork > 0) {
    focus.push(`${quoteWork} quote${quoteWork === 1 ? "" : "s"} waiting — these close, cold calls do not`);
  }

  // Research feeds tomorrow's dialling, so it sits with the dialling advice
  // rather than ahead of quote work that is already live.
  const research = researchCount(prospects);
  if (research > 0) {
    focus.push(
      `${research} new propert${research === 1 ? "y needs" : "ies need"} a phone number before you can call them`,
    );
  }

  const coldCalls = goals.find((g) => g.id === "coldCalls");
  if (coldCalls && coldCalls.remaining > 0) {
    focus.push(
      coldCalls.onPace
        ? `Then dial — ${coldCalls.remaining} to go and on pace`
        : `Then dial hard — ${coldCalls.advice.toLowerCase()}`,
    );
  }

  if (pendingReviews > 0) {
    focus.push(`${pendingReviews} call review${pendingReviews === 1 ? "" : "s"} to approve when there's a gap`);
  }

  return {
    yesterday: {
      dials: yesterdayCounts.coldCalls,
      conversations: yesterdayCounts.conversations,
      hotLeads: yesterdayCounts.hotLeads,
      reviewsBooked: yesterdayCounts.reviewsScheduled,
    },
    appointments,
    followUps: { overdue, today: dueToday },
    freshProspects,
    goals,
    headline,
    focus,
  };
}

export function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Correspondence                                                      */
/* ------------------------------------------------------------------ */

/**
 * Correspondence is entered by hand for now. There is no mail, calendar or
 * messaging connection and this phase does not add one — the triage exists so
 * the shape is right when a real source arrives.
 */
export type CorrespondenceBucket = "action" | "worth-knowing" | "informational";

export interface CorrespondenceNote {
  id: string;
  at: string;
  from: string;
  subject: string;
  bucket: CorrespondenceBucket;
  handled: boolean;
}

export const BUCKET_LABELS: Record<CorrespondenceBucket, string> = {
  action: "Requires action",
  "worth-knowing": "Worth knowing",
  informational: "Informational",
};

export function triageCorrespondence(notes: CorrespondenceNote[]) {
  const open = notes.filter((n) => !n.handled);
  return {
    action: open.filter((n) => n.bucket === "action"),
    worthKnowing: open.filter((n) => n.bucket === "worth-knowing"),
    informational: open.filter((n) => n.bucket === "informational"),
    total: open.length,
  };
}
