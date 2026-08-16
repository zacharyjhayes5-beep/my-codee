import type { Call, Opportunity, Prospect, Task } from "../types";
import { localDay } from "./calls";

/**
 * Daily activity goals and pace.
 *
 * A progress bar tells you where you are. What actually helps at 2pm is what
 * you have to do per hour from here to still land it, so every reading carries
 * that too.
 */

export interface GoalTarget {
  id: GoalId;
  label: string;
  /** The number that counts as a day done. */
  goal: number;
  /** The better day, where there is one. */
  stretch?: number;
  hint: string;
}

export type GoalId = "coldCalls" | "referralOutreach" | "targetedProspects" | "quoteFollowUps";

/** Editable in one place, like every other cadence in the system. */
export const DAILY_GOALS: GoalTarget[] = [
  { id: "coldCalls", label: "Cold calls", goal: 30, stretch: 50, hint: "Dials logged today" },
  { id: "referralOutreach", label: "Referral outreach", goal: 2, hint: "Calls to referred households" },
  { id: "targetedProspects", label: "Targeted prospects", goal: 3, hint: "Calls to researched households" },
  { id: "quoteFollowUps", label: "Quote follow-ups", goal: 2, hint: "Quote work moved on" },
];

/** The working day the pace is measured against. */
export const WORKDAY = { startHour: 8, endHour: 17 };

function isToday(iso: string, today: string): boolean {
  return typeof iso === "string" && localDay(iso) === today;
}

function looksReferred(prospect: Prospect | undefined): boolean {
  if (!prospect) return false;
  const source = `${prospect.leadSource} ${prospect.source}`.toLowerCase();
  return source.includes("referr");
}

export interface GoalReading extends GoalTarget {
  done: number;
  /** 0–100, clamped. */
  percent: number;
  /** Where you would be if the day were spread evenly. */
  expected: number;
  onPace: boolean;
  remaining: number;
  /** What it now takes per remaining hour. Null once the goal is met. */
  perHourNeeded: number | null;
  /** One line saying what to do about it. */
  advice: string;
}

export interface DayCounts {
  coldCalls: number;
  referralOutreach: number;
  targetedProspects: number;
  quoteFollowUps: number;
  conversations: number;
  somewhatInterested: number;
  hotLeads: number;
  reviewsScheduled: number;
}

/** Everything the day's numbers are counted from, in one pass. */
export function countDay(
  calls: Call[],
  prospects: Prospect[],
  tasks: Task[],
  today: string,
): DayCounts {
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const todays = calls.filter((c) => isToday(c.at, today));

  let referralOutreach = 0;
  let targetedProspects = 0;
  let conversations = 0;
  let somewhatInterested = 0;
  let hotLeads = 0;
  let reviewsScheduled = 0;

  for (const call of todays) {
    const prospect = byId.get(call.prospectId);

    if (looksReferred(prospect)) referralOutreach += 1;
    if (prospect?.whyTheyFit.trim()) targetedProspects += 1;

    switch (call.outcome) {
      case "No Answer — No Voicemail":
      case "No Answer — Voicemail":
      case "Bad Number":
        break;
      default:
        // Somebody actually picked up.
        conversations += 1;
    }

    if (call.outcome === "Somewhat Interested") somewhatInterested += 1;
    if (call.outcome === "Hot Lead") hotLeads += 1;
    if (call.outcome === "Insurance Review Scheduled") reviewsScheduled += 1;
  }

  // Quote work counts when a quote task is ticked off, not when it is created.
  const quoteFollowUps = tasks.filter(
    (t) =>
      t.done &&
      isToday(t.completedAt ?? "", today) &&
      (t.kind === "quote" || t.ruleId === "build-quote" || t.ruleId === "collect-details"),
  ).length;

  return {
    coldCalls: todays.length,
    referralOutreach,
    targetedProspects,
    quoteFollowUps,
    conversations,
    somewhatInterested,
    hotLeads,
    reviewsScheduled,
  };
}

/** How much of the working day is gone, 0–1. */
export function dayElapsed(now: Date): number {
  const hours = now.getHours() + now.getMinutes() / 60;
  const { startHour, endHour } = WORKDAY;
  if (hours <= startHour) return 0;
  if (hours >= endHour) return 1;
  return (hours - startHour) / (endHour - startHour);
}

export function hoursLeft(now: Date): number {
  const hours = now.getHours() + now.getMinutes() / 60;
  return Math.max(0, WORKDAY.endHour - Math.max(hours, WORKDAY.startHour));
}

export function readGoals(counts: DayCounts, now: Date): GoalReading[] {
  const elapsed = dayElapsed(now);
  const left = hoursLeft(now);

  return DAILY_GOALS.map((target) => {
    const done = counts[target.id];
    const expected = Math.round(target.goal * elapsed);
    const remaining = Math.max(0, target.goal - done);
    const onPace = done >= expected;
    const perHourNeeded = remaining === 0 ? null : left > 0 ? remaining / left : Infinity;

    let advice: string;
    if (remaining === 0) {
      advice =
        target.stretch && done < target.stretch
          ? `Goal met — ${target.stretch - done} more for the stretch`
          : "Goal met";
    } else if (left <= 0) {
      advice = `${remaining} short, day is over`;
    } else if (onPace) {
      advice = `On pace — ${Math.ceil(perHourNeeded as number)}/hr keeps it`;
    } else {
      advice = `Behind — needs ${Math.ceil(perHourNeeded as number)}/hr for the rest of the day`;
    }

    return {
      ...target,
      done,
      percent: Math.min(100, target.goal > 0 ? (done / target.goal) * 100 : 0),
      expected,
      onPace,
      remaining,
      perHourNeeded,
      advice,
    };
  });
}

/* ------------------------------------------------------------------ */
/* End of day                                                          */
/* ------------------------------------------------------------------ */

export interface EndOfDayReport {
  counts: DayCounts;
  newOpportunities: number;
  pipelineMoves: { name: string; summary: string }[];
  goals: GoalReading[];
  tomorrow: { text: string; why: string }[];
}

export function endOfDay(
  calls: Call[],
  prospects: Prospect[],
  tasks: Task[],
  opportunities: Opportunity[],
  today: string,
  now: Date,
): EndOfDayReport {
  const counts = countDay(calls, prospects, tasks, today);
  const byId = new Map(prospects.map((p) => [p.id, p]));

  const newOpportunities = opportunities.filter((o) => isToday(o.createdAt, today)).length;

  const pipelineMoves = opportunities
    .flatMap((o) =>
      o.history
        .filter((h) => h.field === "stage" && isToday(h.at, today))
        .map((h) => ({
          name: byId.get(o.prospectId)?.name ?? "A household",
          summary: h.summary,
        })),
    )
    .slice(0, 8);

  const tomorrowIso = nextDay(today);
  const tomorrow: { text: string; why: string }[] = [];

  for (const opportunity of opportunities) {
    if (opportunity.nextActionDate && opportunity.nextActionDate <= tomorrowIso) {
      tomorrow.push({
        text: `${byId.get(opportunity.prospectId)?.name ?? "Household"} — ${opportunity.nextAction}`,
        why: opportunity.stage,
      });
    }
  }

  for (const task of tasks) {
    if (task.done || !task.dueDate || task.dueDate > tomorrowIso) continue;
    tomorrow.push({ text: task.text, why: task.dueDate < today ? "overdue" : "due" });
  }

  return {
    counts,
    newOpportunities,
    pipelineMoves,
    goals: readGoals(counts, now),
    tomorrow: tomorrow.slice(0, 8),
  };
}

export function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
