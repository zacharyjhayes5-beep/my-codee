import type { Prospect } from "../types";

/**
 * Duplicate detection for intake.
 *
 * Nothing here decides anything on its own. It returns candidates with a
 * reason, and the import screen asks. Blindly creating a second record for a
 * household you already called is the failure this exists to prevent — and
 * silently merging two households that only look alike is the other one.
 */

export type MatchStrength = "certain" | "likely" | "possible";

export interface DuplicateMatch {
  existing: Prospect;
  strength: MatchStrength;
  /** Plain-language reason, shown next to the merge choice. */
  reason: string;
}

function digits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalize(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Street number and name only — enough to spot the same house. */
function normalizeStreet(line1: string): string {
  return normalize(line1)
    .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKey(prospect: Pick<Prospect, "firstName" | "lastName" | "name">): string {
  const first = normalize(prospect.firstName);
  const last = normalize(prospect.lastName);
  if (first || last) return `${first} ${last}`.trim();
  return normalize(prospect.name);
}

export type Candidate = Pick<
  Prospect,
  "firstName" | "lastName" | "name" | "phone" | "email" | "address"
>;

/**
 * Finds households that may already be this one. Ordered strongest first so
 * the review screen can lead with its best guess.
 */
export function findDuplicates(candidate: Candidate, existing: Prospect[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  const candPhone = digits(candidate.phone);
  const candEmail = normalize(candidate.email);
  const candName = nameKey(candidate);
  const candStreet = normalizeStreet(candidate.address?.line1 ?? "");
  const candCity = normalize(candidate.address?.city ?? "");

  for (const person of existing) {
    const theirPhone = digits(person.phone);
    const theirEmail = normalize(person.email);
    const theirName = nameKey(person);
    const theirStreet = normalizeStreet(person.address?.line1 ?? "");
    const theirCity = normalize(person.address?.city ?? "");

    // A shared phone number is the strongest signal available.
    if (candPhone && candPhone.length >= 10 && candPhone === theirPhone) {
      matches.push({ existing: person, strength: "certain", reason: "Same phone number" });
      continue;
    }

    if (candEmail && candEmail === theirEmail) {
      matches.push({ existing: person, strength: "certain", reason: "Same email address" });
      continue;
    }

    const sameName = Boolean(candName) && candName === theirName;
    const sameStreet = Boolean(candStreet) && candStreet === theirStreet && candCity === theirCity;

    if (sameName && sameStreet) {
      matches.push({ existing: person, strength: "certain", reason: "Same name and address" });
      continue;
    }

    if (sameStreet) {
      matches.push({
        existing: person,
        strength: "likely",
        reason: `Same address as ${person.name || "an existing household"}`,
      });
      continue;
    }

    if (sameName) {
      matches.push({
        existing: person,
        strength: "possible",
        reason: candCity && candCity === theirCity ? "Same name, same city" : "Same name",
      });
    }
  }

  const order: Record<MatchStrength, number> = { certain: 0, likely: 1, possible: 2 };
  return matches.sort((a, b) => order[a.strength] - order[b.strength]);
}

/**
 * Fills gaps in the existing record from the incoming one. Existing values
 * always win — a merge may add what is missing but must never quietly replace
 * something already there.
 */
export function mergeInto(existing: Prospect, incoming: Partial<Prospect>): Prospect {
  const pick = (a: string, b: string | undefined) => (a && a.trim() ? a : (b ?? ""));

  return {
    ...existing,
    firstName: pick(existing.firstName, incoming.firstName),
    lastName: pick(existing.lastName, incoming.lastName),
    name: pick(existing.name, incoming.name),
    phone: pick(existing.phone, incoming.phone),
    email: pick(existing.email, incoming.email),
    area: pick(existing.area, incoming.area),
    leadSource: pick(existing.leadSource, incoming.leadSource),
    whyTheyFit: pick(existing.whyTheyFit, incoming.whyTheyFit),
    importantNotes: pick(existing.importantNotes, incoming.importantNotes),
    address: {
      line1: pick(existing.address.line1, incoming.address?.line1),
      city: pick(existing.address.city, incoming.address?.city),
      state: pick(existing.address.state, incoming.address?.state),
      zip: pick(existing.address.zip, incoming.address?.zip),
    },
    contacts: [...existing.contacts, ...(incoming.contacts ?? [])],
    notes: [...existing.notes, ...(incoming.notes ?? [])],
    lines: Array.from(new Set([...existing.lines, ...(incoming.lines ?? [])])),
    // Where the merged-in record came from, so the trail is not lost.
    mergedFrom: [...existing.mergedFrom, ...(incoming.leadSource ? [incoming.leadSource] : [])],
  };
}
