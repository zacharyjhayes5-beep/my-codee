import type {
  Book,
  Opportunity,
  OpportunityLine,
  PolicyEntry,
  Prospect,
} from "../types";
import { newId, today } from "./storage";
import { premiumTotal } from "./opportunities";

/**
 * What happens when an account is marked Written.
 *
 * Marking Written used to change a word on a screen and nothing else: the
 * household stayed open, the book of business stayed empty, and every goal
 * on Operator kept reading zero next to business that had actually been
 * sold. This is the seam that was missing.
 *
 * Two rules govern it:
 *
 *   - It only ever fills in what the account already knows — the lines and
 *     the premium against each. It never invents a commission rate, because
 *     an invented rate is money on a screen that nobody earned. Rate and
 *     multiplier land at zero and the Progress screen asks for them.
 *   - It is keyed on the account, so marking Written twice, or editing an
 *     account that is already Written, does not write the book twice.
 */

/**
 * The catalogue line each account line becomes.
 *
 * The account asks a coarse question — Auto, Home, Umbrella — and the book
 * keeps a fine one. These are the ordinary personal-lines answers; anything
 * else he sells is entered on the book directly, where the whole catalogue
 * is available.
 */
const LINE_TO_CATALOGUE: Record<OpportunityLine, { id: string; book: Book } | null> = {
  Auto: { id: "personal-auto", book: "personal" },
  Home: { id: "homeowners", book: "personal" },
  Umbrella: { id: "personal-umbrella", book: "personal" },
  Life: { id: "term-life", book: "life" },
  Commercial: { id: "comm-package", book: "commercial" },
  // No honest catalogue answer. It still counts as a policy, filed against
  // the closest personal line, and he can retype it on the book.
  Other: null,
};

/** Marks every policy this seam created, so it is never counted twice. */
export function writtenTag(opportunityId: string, line: OpportunityLine): string {
  return `auto:${opportunityId}:${line}`;
}

/** Whether the book already carries the policies for this account. */
export function alreadyWritten(entries: PolicyEntry[], opportunityId: string): boolean {
  return entries.some((e) => (e.notes ?? "").startsWith(`auto:${opportunityId}:`));
}

function splitName(name: string): { firstName: string; lastName: string } {
  const clean = (name || "").trim();
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * One policy per line the account covers, carrying that line's premium.
 *
 * A line with no premium still becomes a policy — it was sold, and the
 * policy count is what the goals are measured in. The premium is simply
 * zero until somebody fills it in.
 */
export function policiesFromOpportunity(
  opportunity: Opportunity,
  prospect: Prospect | undefined,
  effectiveDate = today(),
): PolicyEntry[] {
  const { firstName, lastName } = splitName(prospect?.name ?? "");

  return opportunity.lines.map((line) => {
    const mapped = LINE_TO_CATALOGUE[line] ?? { id: "personal-auto", book: "personal" as Book };
    return {
      id: newId(),
      book: mapped.book,
      effectiveDate,
      firstName,
      lastName,
      companyName: "",
      deathBenefit: 0,
      lineOfBusiness: mapped.id,
      policyNumber: "",
      premium: opportunity.premiums?.[line] ?? 0,
      // Never guessed. The Progress screen asks for these once and applies
      // them; a rate invented here would put money on the screen that
      // nobody earned.
      percentEarned: 0,
      multiplier: 0,
      lastReview: "",
      notes: writtenTag(opportunity.id, line),
      prospectId: opportunity.prospectId,
    };
  });
}

export interface WrittenResult {
  entries: PolicyEntry[];
  /** The household, moved to Won. Undefined when it was already there. */
  prospect?: Prospect;
  added: number;
  premium: number;
}

/**
 * Everything that follows from an account being marked Written.
 *
 * Returns the whole next state rather than applying it, so the caller writes
 * once and a half-applied conversion is not possible.
 */
export function applyWritten(
  opportunity: Opportunity,
  prospect: Prospect | undefined,
  entries: PolicyEntry[],
  effectiveDate = today(),
): WrittenResult | null {
  if (opportunity.stage !== "Written") return null;
  if (alreadyWritten(entries, opportunity.id)) return null;

  const created = policiesFromOpportunity(opportunity, prospect, effectiveDate);

  return {
    entries: [...entries, ...created],
    prospect:
      prospect && prospect.stage !== "Won"
        ? { ...prospect, stage: "Won", stageSource: "manual", updatedAt: effectiveDate }
        : undefined,
    added: created.length,
    premium: premiumTotal(opportunity),
  };
}

/**
 * Undo the conversion when an account is moved back out of Written.
 *
 * A stage set by mistake has to be correctable, and leaving the policies
 * behind would leave the book claiming business that is not there. Only the
 * policies this seam created are removed — anything typed on the book by
 * hand is untouched.
 */
export function undoWritten(entries: PolicyEntry[], opportunityId: string): PolicyEntry[] {
  return entries.filter((e) => !(e.notes ?? "").startsWith(`auto:${opportunityId}:`));
}
