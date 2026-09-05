import type { Call, Opportunity, Prospect, Task } from "../types";
import { attemptCounts, callsFor } from "./calls";
import { RULE_CONSTANTS } from "./rules";

/**
 * NEXT CALL.
 *
 * Two questions, kept apart on purpose: may this household be called at all,
 * and if several may, which one first. Mixing them is how hot leads end up
 * buried under a thousand cold names.
 */

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

export type SuppressionReason =
  | "do-not-contact"
  | "bad-number"
  | "not-interested"
  | "closed"
  | "won"
  | "attempts-exhausted"
  | "dormant"
  | "scheduled-later";

export interface Eligibility {
  eligible: boolean;
  reason?: SuppressionReason;
  /** Plain-language explanation, shown wherever a household is held back. */
  detail?: string;
  /** True once three messages have been left — keep dialling, stop leaving them. */
  voicemailCapReached: boolean;
  /** When the next attempt becomes due, if it is being held. */
  nextEligibleOn?: string;
}

/**
 * The scheduled callback lives on the rule-generated task rather than a second
 * copy on the household, so correcting a call moves the schedule with it.
 */
export function scheduledCallbackFor(tasks: Task[], prospectId: string): Task | undefined {
  return tasks
    .filter(
      (t) =>
        t.prospectId === prospectId &&
        !t.done &&
        (t.ruleId === "no-answer-callback" ||
          t.ruleId === "voicemail-callback" ||
          t.ruleId === "nurture-follow-up"),
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
}

export function eligibilityOf(
  prospect: Prospect,
  calls: Call[],
  tasks: Task[],
  today: string,
): Eligibility {
  const mine = callsFor(calls, prospect.id);
  const counts = attemptCounts(mine);
  const voicemailCapReached = counts.voicemails >= RULE_CONSTANTS.maxVoicemails;

  const held = (reason: SuppressionReason, detail: string): Eligibility => ({
    eligible: false,
    reason,
    detail,
    voicemailCapReached,
  });

  if (prospect.doNotContact) {
    return held("do-not-contact", "Marked do not contact");
  }

  if (prospect.needsPhoneNumber) {
    return held("bad-number", "Needs a working phone number");
  }

  // The attempt cap flags for review; it never closes the household itself.
  if (prospect.needsReview || counts.attempts >= RULE_CONSTANTS.maxAttempts) {
    return held(
      "attempts-exhausted",
      `${counts.attempts} attempts used — waiting on your review`,
    );
  }

  if (prospect.stage === "Won") {
    return held("won", "Already written");
  }

  if (prospect.stage === "Closed") {
    const why = prospect.closedReason ?? "closed";
    return held(why === "not-interested" ? "not-interested" : "closed", `Closed — ${why}`);
  }

  const callback = scheduledCallbackFor(tasks, prospect.id);

  /**
   * A household in Nurture with nothing scheduled has used up its revisits.
   * Serving it back up would be an automatic re-approach, which is exactly
   * what stopping the cycle was meant to prevent — it waits to be reactivated
   * or rescheduled by hand.
   */
  if (prospect.stage === "Nurture" && !callback) {
    return held("dormant", "Dormant — reactivate or reschedule to call again");
  }

  if (callback?.dueDate && callback.dueDate > today) {
    return {
      eligible: false,
      reason: "scheduled-later",
      detail: `Next attempt due ${callback.dueDate}`,
      nextEligibleOn: callback.dueDate,
      voicemailCapReached,
    };
  }

  // A household whose next action is booked for a future date is not due yet,
  // however hot it is. Without this a hot lead sits at the top of the queue
  // permanently and you never get past it.
  if (prospect.nextActionDate && prospect.nextActionDate > today) {
    return {
      eligible: false,
      reason: "scheduled-later",
      detail: `${prospect.nextAction || "Next action"} due ${prospect.nextActionDate}`,
      nextEligibleOn: prospect.nextActionDate,
      voicemailCapReached,
    };
  }

  return { eligible: true, voicemailCapReached };
}

/* ------------------------------------------------------------------ */
/* Priority                                                            */
/* ------------------------------------------------------------------ */

/** Lower number is worked first. Ties break on how long they have waited. */
export const TIERS = {
  hotOpportunityDue: 1,
  followUpDue: 2,
  newQualified: 3,
  targeted: 4,
  priorNoAnswer: 5,
  everythingElse: 6,
} as const;

export const TIER_LABELS: Record<number, string> = {
  1: "Hot opportunity due",
  2: "Follow-up due",
  3: "Newly qualified",
  4: "Targeted",
  5: "Prior no answer",
  6: "Cold list",
};

export interface QueueEntry {
  prospect: Prospect;
  eligibility: Eligibility;
  tier: number;
  tierLabel: string;
  /** Why this one sits where it does, for the card and for debugging. */
  why: string;
  attempts: number;
  voicemails: number;
  lastContactedAt: string;
}

export interface QueueInput {
  prospects: Prospect[];
  calls: Call[];
  tasks: Task[];
  opportunities: Opportunity[];
  today: string;
}

function tierFor(
  prospect: Prospect,
  input: QueueInput,
  attempts: number,
  totalCalls: number,
): { tier: number; why: string } {
  const { opportunities, tasks, today } = input;

  const mine = opportunities.filter((o) => o.prospectId === prospect.id);
  const hotDue = mine.find(
    (o) =>
      o.stage !== "Won" &&
      o.stage !== "Lost" &&
      o.nextActionDate &&
      o.nextActionDate <= today,
  );

  // A hot lead or an opportunity with work due today outranks everything.
  if (hotDue) {
    return { tier: TIERS.hotOpportunityDue, why: `${hotDue.stage} — ${hotDue.nextAction}` };
  }
  if (prospect.stage === "Opportunity" || prospect.stage === "Review Scheduled") {
    return { tier: TIERS.hotOpportunityDue, why: `Stage is ${prospect.stage}` };
  }

  const dueTask = tasks.find(
    (t) => t.prospectId === prospect.id && !t.done && t.dueDate && t.dueDate <= today,
  );
  if (dueTask) {
    return { tier: TIERS.followUpDue, why: dueTask.text };
  }

  if (prospect.nextActionDate && prospect.nextActionDate <= today) {
    return { tier: TIERS.followUpDue, why: prospect.nextAction || "Follow-up due" };
  }

  const grade = prospect.priorityGrade;

  // "Never called" means no call of any kind — not merely no unanswered ones.
  if (totalCalls === 0) {
    if (grade === "A" || grade === "B") {
      return { tier: TIERS.newQualified, why: `Grade ${grade}, never called` };
    }
    if (prospect.whyTheyFit.trim()) {
      return { tier: TIERS.targeted, why: prospect.whyTheyFit };
    }
    return { tier: TIERS.everythingElse, why: "Never called" };
  }

  if (attempts > 0) {
    return { tier: TIERS.priorNoAnswer, why: `${attempts} prior attempt${attempts === 1 ? "" : "s"}` };
  }

  return {
    tier: TIERS.priorNoAnswer,
    why: `${totalCalls} prior call${totalCalls === 1 ? "" : "s"}`,
  };
}

/**
 * Everyone, ranked and annotated — including the ones being held back, so a
 * queue that looks empty can explain itself rather than just being empty.
 */
export function buildQueue(input: QueueInput): QueueEntry[] {
  const entries = input.prospects.map((prospect) => {
    const mine = callsFor(input.calls, prospect.id);
    const counts = attemptCounts(mine);
    const eligibility = eligibilityOf(prospect, input.calls, input.tasks, input.today);
    const { tier, why } = tierFor(prospect, input, counts.attempts, counts.total);

    return {
      prospect,
      eligibility,
      tier,
      tierLabel: TIER_LABELS[tier],
      why,
      attempts: counts.attempts,
      voicemails: counts.voicemails,
      lastContactedAt: prospect.lastContactedAt,
    };
  });

  return entries.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    // Within a tier, whoever has waited longest goes first.
    const aTouch = a.lastContactedAt || "";
    const bTouch = b.lastContactedAt || "";
    if (aTouch !== bTouch) return aTouch.localeCompare(bTouch);
    return a.prospect.createdAt.localeCompare(b.prospect.createdAt);
  });
}

/** The one to work now, or null when nobody is callable. */
export function nextCall(input: QueueInput): QueueEntry | null {
  return buildQueue(input).find((e) => e.eligibility.eligible) ?? null;
}

export interface QueueStats {
  callable: number;
  held: number;
  byReason: Record<string, number>;
  needingReview: number;
}

export function queueStats(entries: QueueEntry[]): QueueStats {
  const byReason: Record<string, number> = {};
  let callable = 0;

  for (const entry of entries) {
    if (entry.eligibility.eligible) {
      callable++;
      continue;
    }
    const reason = entry.eligibility.reason ?? "held";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }

  return {
    callable,
    held: entries.length - callable,
    byReason,
    needingReview: byReason["attempts-exhausted"] ?? 0,
  };
}
