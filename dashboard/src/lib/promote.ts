import type { Opportunity, Prospect } from "../types";
import { blankOpportunity, CLOSED_STAGES } from "./opportunities";
import { today } from "./storage";

/**
 * A household earns its place on the pipeline the moment it has real work
 * attached to it.
 *
 * Leads is the cold list — two hundred names off the county roll, most of
 * them never spoken to. Pipeline is the short list of people something is
 * actually happening with. The difference between the two was a record you
 * had to remember to create by hand, from a screen that did not offer it,
 * so it never got created and Pipeline stayed empty while real work sat in
 * a text field on Leads.
 *
 * Writing a next step, or putting a date against one, is the moment that
 * work becomes real. That is what moves them across.
 */

/** A household with a live account is already on the pipeline. */
export function hasOpenAccount(opportunities: Opportunity[], prospectId: string): boolean {
  return opportunities.some(
    (o) => o.prospectId === prospectId && !CLOSED_STAGES.includes(o.stage),
  );
}

/**
 * The account a household should get, or null if it should not get one.
 *
 * Deliberately conservative — it declines far more often than it fires:
 *
 *   - nothing for a household that already has a live account, so editing a
 *     next step twice does not make two;
 *   - nothing for one that is closed, won or marked do-not-contact, because
 *     that work is finished;
 *   - nothing for a blank next step, so clearing the field is not a promotion.
 */
export function accountForPromotion(
  prospect: Prospect,
  opportunities: Opportunity[],
  at = today(),
): Opportunity | null {
  const nextAction = (prospect.nextAction ?? "").trim();
  const nextActionDate = (prospect.nextActionDate ?? "").trim();

  if (!nextAction && !nextActionDate) return null;
  if (prospect.doNotContact) return null;
  if (prospect.stage === "Closed" || prospect.stage === "Won") return null;
  if (hasOpenAccount(opportunities, prospect.id)) return null;

  return blankOpportunity(prospect.id, {
    stage: "Qualified / Open",
    // Carried across rather than restated, so the thing he typed on Leads is
    // the thing the pipeline shows.
    nextAction: nextAction || "Follow up",
    nextActionDate: nextActionDate || at,
    conversionScore: prospect.conversionScore,
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Whether a patch is the kind that should promote.
 *
 * Only a change to the next step or its date counts. Fixing a phone number
 * or a spelling is not a commitment to do anything.
 */
export function patchPromotes(patch: Partial<Prospect>): boolean {
  return (
    (typeof patch.nextAction === "string" && patch.nextAction.trim().length > 0) ||
    (typeof patch.nextActionDate === "string" && patch.nextActionDate.trim().length > 0)
  );
}
