/**
 * The Research Queue.
 *
 * Kent County publishes an owner and an address, and no way to reach either.
 * Every GIS household therefore arrives with `needsPhoneNumber` set, and the
 * calling queue deliberately holds those back — a name with no number is not
 * something you can dial.
 *
 * That leaves a gap this file closes: the work of finding the number. It is
 * the only thing standing between an automatically generated lead and the
 * calling engine that already exists, and nothing else in the application
 * surfaces it.
 *
 * This is a *view* over households, not a second store. Researching one is a
 * normal prospect edit through the normal repository path; the household then
 * stops matching the predicate and leaves the queue on its own.
 */

import type { Prospect } from "../types";
import { formatPhone } from "./phone";

/**
 * Whether a household is waiting on phone research.
 *
 * Restricted to GIS-origin records on purpose. `needsPhoneNumber` is also set
 * by the Bad Number call outcome, and a household you have already spoken to
 * whose number turned out to be wrong belongs in the calling workflow's own
 * review list, not in a bulk research queue for cold properties.
 *
 * Closed, Won and do-not-contact households are excluded because they are not
 * work: a number would not make them callable.
 */
export function needsResearch(prospect: Prospect): boolean {
  if (prospect.source !== "gis") return false;
  if (!prospect.needsPhoneNumber) return false;
  if (prospect.doNotContact) return false;
  if (prospect.stage === "Closed" || prospect.stage === "Won") return false;
  return true;
}

/**
 * The queue, newest first.
 *
 * Newest first because the batch arrives daily and today's is the batch you
 * came in to work; an older one that has been skipped over is not more urgent,
 * only older. Ordering falls back to name and then id so it is completely
 * stable — the list must not reshuffle underneath you while you work it.
 *
 * Priority grade is deliberately not used: GIS records arrive ungraded, so it
 * would sort every row identically while implying a judgement nobody made.
 */
export function buildResearchQueue(prospects: Prospect[]): Prospect[] {
  return prospects.filter(needsResearch).sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.id.localeCompare(b.id);
  });
}

export function researchCount(prospects: Prospect[]): number {
  let n = 0;
  for (const p of prospects) if (needsResearch(p)) n++;
  return n;
}

/**
 * The edit that completes research on a household.
 *
 * Returns null when the number is not dialable, so a half-typed entry cannot
 * clear the flag and quietly drop the household into the calling queue with a
 * number nobody can ring.
 *
 * Clearing `needsPhoneNumber` is what hands the household to the existing
 * calling rules — no other change is needed, and none is made. If a later call
 * is logged as a Bad Number the rules engine replays and sets the flag again,
 * which is correct: it is back to needing research.
 */
export function researchedPatch(
  rawPhone: string,
  rawEmail: string,
  today: string,
): Partial<Prospect> | null {
  const phone = formatPhone(rawPhone);
  if (!phone) return null;

  const patch: Partial<Prospect> = {
    phone,
    needsPhoneNumber: false,
    updatedAt: today,
  };

  const email = rawEmail.trim();
  if (email) patch.email = email;

  return patch;
}

/**
 * The edit that takes a household out of research without deleting it.
 *
 * "unreachable" is an existing closed reason and is the honest one: no number
 * could be found. The record stays in place, so the upstream parcel ledger is
 * untouched and the household is never surfaced by GIS a second time.
 *
 * `stageSource: "manual"` marks this as your decision, which is what stops a
 * later rule reconciliation moving the stage back.
 */
export function unreachablePatch(today: string): Partial<Prospect> {
  return {
    stage: "Closed",
    closedReason: "unreachable",
    stageSource: "manual",
    stageCallId: null,
    updatedAt: today,
  };
}
