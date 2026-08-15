import type {
  Call,
  ClosedReason,
  Contact,
  Prospect,
  Stage,
  Task,
  Urgency,
} from "../types";
import { newId } from "./storage";

/**
 * Outcome rules.
 *
 * The whole engine is a replay: sort a household's calls oldest to newest,
 * walk them, and whatever state you end on is the truth. Nothing is patched
 * incrementally, which is what makes editing or deleting a call in the middle
 * of a run come out right — there is no accumulated state to unwind, only the
 * same walk over a shorter list.
 */

/* ------------------------------------------------------------------ */
/* The editable numbers                                                */
/* ------------------------------------------------------------------ */

/**
 * Every cap and cadence lives here. Changing how often callbacks come round is
 * a value edit, not a code change, and nothing outside this file may hard-code
 * one of these numbers.
 */
export const RULE_CONSTANTS = {
  /** Total unanswered dials before a household is written off, both kinds. */
  maxAttempts: 7,
  /** How many of those attempts may leave a message. */
  maxVoicemails: 3,
  /** Days until the next try after a silent no-answer. */
  callbackDaysNoVoicemail: 2,
  /** Days until the next try after leaving a message. */
  callbackDaysAfterVoicemail: 3,
  /** Months between nurture touches — first, then second. Third closes. */
  nurtureFollowUpMonths: [1, 2] as const,
  /** Days to build a quote once the household is qualified. */
  quoteDays: 1,
  /** Days to chase the details a quote still needs. */
  collectDetailsDays: 2,
};

export type RuleId =
  | "no-answer-callback"
  | "voicemail-callback"
  | "attempts-exhausted"
  | "bad-number"
  | "not-interested"
  | "nurture-follow-up"
  | "nurture-dormant"
  | "build-quote"
  | "collect-details"
  | "hot-lead"
  | "review-appointment";

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayOf(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function addDays(fromIso: string, days: number): string {
  const d = dayOf(fromIso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export function addMonths(fromIso: string, months: number): string {
  const d = dayOf(fromIso);
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(targetMonth);
  // Clamp so 31 January + 1 month lands on the last day of February.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return isoDay(d);
}

/* ------------------------------------------------------------------ */
/* Quote readiness                                                     */
/* ------------------------------------------------------------------ */

export interface QuoteReadiness {
  ready: boolean;
  /** Human-readable names of what is still missing, in a stable order. */
  missing: string[];
}

/**
 * What a quote needs: one contact with a first name, last name and date of
 * birth, plus a household address. Nothing here fills a gap in — a missing
 * field is reported, never guessed.
 */
export function quoteReadiness(prospect: Prospect): QuoteReadiness {
  const missing: string[] = [];

  const best = pickQuoteContact(prospect.contacts);

  if (!best) {
    missing.push("first name", "last name", "date of birth");
  } else {
    if (!best.firstName.trim()) missing.push("first name");
    if (!best.lastName.trim()) missing.push("last name");
    if (!best.dob.trim()) missing.push("date of birth");
  }

  const a = prospect.address;
  if (!a.line1.trim()) missing.push("street address");
  if (!a.city.trim()) missing.push("city");
  if (!a.state.trim()) missing.push("state");
  if (!a.zip.trim()) missing.push("ZIP");

  return { ready: missing.length === 0, missing };
}

/** The contact a quote would be written for — primary first, else the fullest. */
function pickQuoteContact(contacts: Contact[]): Contact | null {
  if (contacts.length === 0) return null;
  const primary = contacts.find((c) => c.isPrimary);
  if (primary) return primary;
  return contacts.reduce((best, c) => (score(c) > score(best) ? c : best));
}

function score(c: Contact): number {
  return [c.firstName, c.lastName, c.dob].filter((v) => v.trim()).length;
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

/** A task the rules want to exist. Turned into a real Task by the caller. */
export interface DesiredTask {
  ruleId: RuleId;
  text: string;
  detail: string;
  /** Empty means deliberately undated — it must not read as due today. */
  dueDate: string;
  urgency: Urgency;
  kind: NonNullable<Task["kind"]>;
  callId: string;
}

export interface RuleOutcomeState {
  stage: Stage;
  closedReason: ClosedReason | null;
  doNotContact: boolean;
  /** Set only by the Hot Lead rule, which requires one on the call. */
  nextAction: string | null;
  nextActionDate: string;
  /** At most one open rule task at a time — a newer call supersedes the last. */
  pendingTask: DesiredTask | null;
  /** Which call left the household in this state. */
  causedByCallId: string | null;
  attempts: number;
  voicemails: number;
  notAtThisTimeCount: number;
  /** True once the combined dial cap is reached. */
  exhausted: boolean;
}

function emptyState(): RuleOutcomeState {
  return {
    stage: "New",
    closedReason: null,
    doNotContact: false,
    nextAction: null,
    nextActionDate: "",
    pendingTask: null,
    causedByCallId: null,
    attempts: 0,
    voicemails: 0,
    notAtThisTimeCount: 0,
    exhausted: false,
  };
}

/**
 * Walks a household's calls in the order they happened and returns the state
 * they add up to. `prospect` is read only for quote readiness.
 */
export function replayCalls(prospect: Prospect, calls: Call[]): RuleOutcomeState {
  const ordered = [...calls].sort((a, b) => a.at.localeCompare(b.at));
  const state = emptyState();

  for (const call of ordered) {
    state.causedByCallId = call.id;
    applyOne(prospect, call, state);
  }

  return state;
}

function applyOne(prospect: Prospect, call: Call, state: RuleOutcomeState): void {
  const { maxAttempts } = RULE_CONSTANTS;

  switch (call.outcome) {
    case "No Answer — No Voicemail":
    case "No Answer — Voicemail Left": {
      const leftMessage = call.outcome === "No Answer — Voicemail Left";
      state.attempts += 1;
      if (leftMessage) state.voicemails += 1;

      state.stage = "Attempting";
      state.closedReason = null;

      if (state.attempts >= maxAttempts) {
        // The cap is combined: both no-answer kinds count toward the same seven.
        state.stage = "Closed";
        state.closedReason = "unreachable";
        state.exhausted = true;
        state.pendingTask = null;
        return;
      }

      const days = leftMessage
        ? RULE_CONSTANTS.callbackDaysAfterVoicemail
        : RULE_CONSTANTS.callbackDaysNoVoicemail;

      state.pendingTask = {
        ruleId: leftMessage ? "voicemail-callback" : "no-answer-callback",
        text: `Call again — ${householdLabel(prospect)}`,
        detail: `Attempt ${state.attempts} of ${maxAttempts}${
          leftMessage ? `, voicemail ${state.voicemails} of ${RULE_CONSTANTS.maxVoicemails}` : ""
        }.`,
        dueDate: addDays(call.at, days),
        urgency: "week",
        kind: "followup",
        callId: call.id,
      };
      return;
    }

    case "Bad Phone Number": {
      state.stage = "Closed";
      state.closedReason = "bad-number";
      state.pendingTask = {
        ruleId: "bad-number",
        text: `Find a better number — ${householdLabel(prospect)}`,
        detail: "The number on file did not reach anyone.",
        // Deliberately undated so it never reads as due today.
        dueDate: "",
        urgency: "someday",
        kind: "admin",
        callId: call.id,
      };
      return;
    }

    case "Definitely Not Interested": {
      state.stage = "Closed";
      state.closedReason = "not-interested";
      state.doNotContact = true;
      state.pendingTask = null;
      return;
    }

    case "Not at This Time": {
      state.notAtThisTimeCount += 1;
      const months = RULE_CONSTANTS.nurtureFollowUpMonths;

      if (state.notAtThisTimeCount > months.length) {
        // Third time of asking — closed as dormant, and never on a timer again.
        state.stage = "Closed";
        state.closedReason = "dormant";
        state.pendingTask = null;
        return;
      }

      const gap = months[state.notAtThisTimeCount - 1];
      state.stage = "Nurture";
      state.closedReason = null;
      state.pendingTask = {
        ruleId: "nurture-follow-up",
        text: `Follow up — ${householdLabel(prospect)}`,
        detail:
          state.notAtThisTimeCount === 1
            ? `First nurture touch, ${gap} month out.`
            : `Final nurture touch, ${gap} months out. Closes as dormant after this.`,
        dueDate: addMonths(call.at, gap),
        urgency: "soon",
        kind: "followup",
        callId: call.id,
      };
      return;
    }

    case "Somewhat Interested": {
      const readiness = quoteReadiness(prospect);
      state.closedReason = null;

      if (readiness.ready) {
        state.stage = "Quoting";
        state.pendingTask = {
          ruleId: "build-quote",
          text: `Build quote — ${householdLabel(prospect)}`,
          detail: "Details are complete.",
          dueDate: addDays(call.at, RULE_CONSTANTS.quoteDays),
          urgency: "now",
          kind: "quote",
          callId: call.id,
        };
      } else {
        state.stage = "Qualifying";
        state.pendingTask = {
          ruleId: "collect-details",
          text: `Collect missing quote details — ${householdLabel(prospect)}`,
          detail: `Still needed: ${readiness.missing.join(", ")}.`,
          dueDate: addDays(call.at, RULE_CONSTANTS.collectDetailsDays),
          urgency: "week",
          kind: "followup",
          callId: call.id,
        };
      }
      return;
    }

    case "Hot Lead — Very Interested": {
      const action = (call.nextAction ?? "").trim();
      state.stage = "Opportunity";
      state.closedReason = null;
      state.nextAction = action || null;
      state.nextActionDate = isoDay(dayOf(call.at));
      state.pendingTask = {
        ruleId: "hot-lead",
        text: action || `Next step — ${householdLabel(prospect)}`,
        detail: "Logged as a hot lead.",
        dueDate: isoDay(dayOf(call.at)),
        urgency: "now",
        kind: "followup",
        callId: call.id,
      };
      return;
    }

    case "Insurance Review Scheduled": {
      const when = call.appointmentAt ?? "";
      state.stage = "Review Scheduled";
      state.closedReason = null;
      state.nextAction = "Insurance review";
      state.nextActionDate = when ? isoDay(dayOf(when)) : "";
      state.pendingTask = {
        ruleId: "review-appointment",
        text: `Insurance review — ${householdLabel(prospect)}`,
        detail: "Booked from a logged call.",
        dueDate: when ? isoDay(dayOf(when)) : "",
        urgency: "week",
        kind: "appointment",
        callId: call.id,
      };
      return;
    }
  }
}

function householdLabel(prospect: Prospect): string {
  return prospect.name.trim() || "this household";
}

/* ------------------------------------------------------------------ */
/* Applying the result                                                 */
/* ------------------------------------------------------------------ */

/** True when a task was created by the rules rather than typed by hand. */
export function isRuleTask(task: Task): boolean {
  return Boolean(task.ruleId);
}

export function taskFromDesired(desired: DesiredTask, prospectId: string, createdOn: string): Task {
  return {
    id: newId(),
    text: desired.text,
    detail: desired.detail,
    urgency: desired.urgency,
    done: false,
    dueDate: desired.dueDate || undefined,
    source: "manual",
    createdAt: createdOn,
    prospectId,
    callId: desired.callId,
    ruleId: desired.ruleId,
    kind: desired.kind,
  };
}

export interface Reconciliation {
  prospect: Prospect;
  tasks: Task[];
}

/**
 * Brings one household and the task list into line with what its calls say.
 *
 * `applyStage` is false when the household's stage was last moved by hand —
 * a deliberate override outlives a later correction to an old call. Logging a
 * new call passes true, because that is an explicit action.
 *
 * Only rule-generated, still-open tasks are touched. A task somebody typed is
 * never modified, and a completed rule task is left as the record of something
 * that actually happened.
 */
export function reconcileProspect(
  prospect: Prospect,
  calls: Call[],
  allTasks: Task[],
  options: { applyStage: boolean; today: string },
): Reconciliation {
  const mine = calls.filter((c) => c.prospectId === prospect.id);
  const state = replayCalls(prospect, mine);

  const keep: Task[] = [];
  for (const task of allTasks) {
    const isMineAndRuleMade = task.prospectId === prospect.id && isRuleTask(task);
    // Untouched: other households, hand-typed tasks, and anything already done.
    if (!isMineAndRuleMade || task.done) {
      keep.push(task);
      continue;
    }
    // Open rule tasks for this household are rebuilt below.
  }

  const wanted = state.pendingTask;
  const tasks = wanted ? [...keep, taskFromDesired(wanted, prospect.id, options.today)] : keep;

  let next: Prospect = { ...prospect, doNotContact: state.doNotContact };

  if (state.nextAction) {
    next = { ...next, nextAction: state.nextAction, nextActionDate: state.nextActionDate };
  }

  const stageIsOurs = options.applyStage || prospect.stageSource === "rule";

  if (stageIsOurs) {
    if (mine.length > 0) {
      next = {
        ...next,
        stage: state.stage,
        closedReason: state.closedReason,
        stageSource: "rule",
        stageCallId: state.causedByCallId,
      };
    } else {
      // Every call is gone. There is nothing left to derive a stage from, so
      // the household keeps where it stands but stops claiming a rule put it
      // there — the provenance would otherwise point at a call that no longer
      // exists.
      next = { ...next, stageSource: "manual", stageCallId: null };
    }
  }

  return { prospect: next, tasks };
}
