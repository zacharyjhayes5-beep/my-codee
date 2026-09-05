import type { Opportunity, Prospect, Stage, Task } from "../types";
import { lineOptions } from "./defaultData";

/**
 * How a household is *presented* — the tone of its stage, when it was last
 * touched, and the one thing owed to it.
 *
 * Operator's "then" queue and the Leads table show the same household in two
 * places, so the derivations they share live here rather than in either
 * screen. Nothing in this file writes; it is all read-only presentation.
 */

/** The six muted jewels. Every status carries a label as well as a tone. */
export type Tone = "slate" | "cognac" | "terracotta" | "verdigris" | "brass" | "grey";

/**
 * A household is quiet once nothing has touched it for this many days.
 *
 * Eleven is the mock's threshold, and it is a threshold rather than a stored
 * flag on purpose: "quiet" is a fact about the calendar, so it has to be
 * recomputed every time it is read, not written down once and left to rot.
 */
export const QUIET_AFTER_DAYS = 11;

/**
 * Stage tones. The design names four — New, Quoted, Reviewing, Won — but the
 * records carry ten, so the rest are folded onto the nearest of the four
 * rather than given colours the design never specified.
 */
const STAGE_TONE: Record<Stage, Tone> = {
  New: "brass",
  Attempting: "brass",
  Contacted: "brass",
  Qualifying: "cognac",
  Quoting: "verdigris",
  "Review Scheduled": "cognac",
  Opportunity: "verdigris",
  Won: "grey",
  Nurture: "grey",
  Closed: "grey",
};

export function stageTone(stage: Stage): Tone {
  return STAGE_TONE[stage] ?? "grey";
}

/** Terminal households are done with; they never want a next move. */
export function isTerminal(prospect: Prospect): boolean {
  return prospect.stage === "Won" || prospect.stage === "Closed" || prospect.doNotContact;
}

/**
 * When this household was last *contacted*.
 *
 * Contact first, then the last recorded outcome, and then nothing. It used to
 * fall back to `updatedAt`, which was wrong twice over: a county lead that
 * arrived yesterday and has never been spoken to read as "Yesterday", and
 * editing any field at all — a phone number, a next step — would reset the
 * clock and quietly pull the household out of Gone quiet. Touching a record
 * is not touching a person.
 *
 * Returns "" when nobody has ever been reached, which is a different fact
 * from having been reached a long time ago, and the callers treat it so.
 */
export function lastTouchOf(prospect: Prospect): string {
  return prospect.lastContactedAt || prospect.lastOutcomeAt || "";
}

/** Whole days between two ISO days; null when either is missing. */
export function daysSince(iso: string, todayIso: string): number | null {
  if (!iso) return null;
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const now = new Date(`${todayIso}T00:00:00`).getTime();
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.round((now - then) / 86_400_000);
}

/** Open, but nothing has moved for longer than the staleness threshold. */
export function isQuiet(prospect: Prospect, todayIso: string): boolean {
  if (isTerminal(prospect)) return false;
  const days = daysSince(lastTouchOf(prospect), todayIso);
  return days !== null && days >= QUIET_AFTER_DAYS;
}

/** "11 days ago" / "Today" / "Never" — the Last touch cell, and the queue. */
export function lastTouchLabel(prospect: Prospect, todayIso: string): string {
  const days = daysSince(lastTouchOf(prospect), todayIso);
  if (days === null) return "Never";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** "Grand Rapids, MI" — whatever the record actually has. */
export function townOf(prospect: Prospect): string {
  return prospect.area || prospect.address?.city || "";
}

/** "Property, Casualty" — em dash when the household holds nothing yet. */
export function linesHeldLabel(prospect: Prospect): string {
  const names = prospect.lines
    .map((id) => lineOptions.find((l) => l.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(", ") : "—";
}

/**
 * The single highest-priority open action owed to a household.
 *
 * Its own next action wins, because somebody wrote it deliberately. Failing
 * that: an open task, then an open opportunity's next action, then a sentence
 * derived from the stage — never a blank cell, because "Next step" is the
 * most important column on the Leads screen and an empty one is a dead end.
 */
export function nextStepOf(
  prospect: Prospect,
  tasks: Task[],
  opportunities: Opportunity[],
): string {
  if (prospect.nextAction) return prospect.nextAction;

  const task = tasks.find((t) => !t.done && t.prospectId === prospect.id);
  if (task) return task.text;

  const open = opportunities.find(
    (o) => o.prospectId === prospect.id && o.stage !== "Won" && o.stage !== "Lost" && o.nextAction,
  );
  if (open) return open.nextAction;

  switch (prospect.stage) {
    case "New":
      return "Make the first call";
    case "Attempting":
      return "Keep trying to reach them";
    case "Contacted":
      return "Book the fact-find";
    case "Qualifying":
      return "Finish the fact-find";
    case "Quoting":
      return "Get the quote out";
    case "Review Scheduled":
      return "Prepare for the review";
    case "Opportunity":
      return "Ask for the business";
    case "Nurture":
      return "Check back in";
    case "Won":
      return "Schedule the annual review";
    default:
      return "Decide whether to reopen";
  }
}

/** Households with no way to reach them — the research queue, by another name. */
export function missingPhone(prospects: Prospect[]): Prospect[] {
  return prospects.filter((p) => !isTerminal(p) && !p.phone.trim());
}
