/**
 * Deciding whether an owner is a person or an organization.
 *
 * This is the one place the rule lives, so adjusting it means editing the list
 * below and nothing else.
 *
 * Matching is on whole tokens, never substrings. That distinction is the whole
 * game: "PRINCE" contains "INC", "COOK" contains "CO", and "SCORPIO" contains
 * "CORP". A substring match would quietly discard real households.
 *
 * TRUST and ESTATE are deliberately absent. A family trust holding a house is
 * an ordinary household — "GELL LEONARD S TRUST" is a person — and excluding
 * them would throw away a large share of the target market.
 */

export const ENTITY_TOKENS: readonly string[] = [
  "LLC",
  "L.L.C.",
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "LLP",
  "LP",
  "BANK",
  "CHURCH",
  "SCHOOL",
  "SCHOOLS",
  "TOWNSHIP",
  "CITY",
  "COUNTY",
  "STATE",
  "ASSOCIATION",
  "ASSOC",
  "HOA",
  "AUTHORITY",
  "GOVERNMENT",
  "FOUNDATION",
  "COMPANY",
  "CO",
  // Consistently organizations in this dataset, and unambiguous as tokens.
  "MINISTRIES",
  "PARTNERSHIP",
  "PARTNERS",
  "HOLDINGS",
  "PROPERTIES",
  "DEVELOPMENT",
  "CONDOMINIUM",
  "CONDO",
  "APARTMENTS",
  "UNIVERSITY",
  "COLLEGE",
  "DISTRICT",
  "DEPARTMENT",
  "COMMISSION",
  "TRUSTEES",
];

const TOKEN_SET = new Set(ENTITY_TOKENS);

/**
 * Splits an owner string into comparable tokens.
 *
 * Punctuation is dropped rather than treated as a separator so that "L.L.C."
 * collapses to "LLC" and "SMITH, JOHN" yields "SMITH" and "JOHN".
 */
export function tokenize(owner: string): string[] {
  return owner
    .toUpperCase()
    .split(/[^A-Z0-9.]+/)
    .map((t) => t.replace(/\.(?=.)/g, "").replace(/\.$/, ""))
    .filter(Boolean);
}

export interface EntityVerdict {
  isEntity: boolean;
  /** The token that triggered exclusion, for the run log. */
  matched?: string;
}

/** Whether this owner name looks like an organization rather than a household. */
export function classifyOwner(owner: string): EntityVerdict {
  for (const token of tokenize(owner)) {
    if (TOKEN_SET.has(token)) return { isEntity: true, matched: token };
  }
  return { isEntity: false };
}

export function isEntity(owner: string): boolean {
  return classifyOwner(owner).isEntity;
}
