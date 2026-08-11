import type { Book, LineId, PolicyEntry } from "../types";

/**
 * Line-of-business catalog. Names come from the Property/Casualty and
 * Life/Annuities rate tables in the 2026 Agency Compensation guide; the
 * category is what drives the goal meters and tier gauges.
 */
export interface LineOfBusiness {
  id: string;
  name: string;
  category: LineId;
  books: Book[];
}

export const linesOfBusiness: LineOfBusiness[] = [
  // Property
  { id: "homeowners", name: "Homeowners", category: "property", books: ["personal"] },
  { id: "renters", name: "Renters", category: "property", books: ["personal"] },
  { id: "condo", name: "Condo", category: "property", books: ["personal"] },
  { id: "dwelling", name: "Dwelling Package", category: "property", books: ["personal", "commercial"] },
  { id: "mobile-home", name: "Mobile Homeowners", category: "property", books: ["personal"] },
  { id: "farmowners", name: "Farmowners", category: "property", books: ["personal", "commercial"] },
  { id: "lake-estate", name: "Lake Estate", category: "property", books: ["personal", "commercial"] },
  { id: "country-estate", name: "Country Estate", category: "property", books: ["personal", "commercial"] },
  { id: "comm-property", name: "Commercial Property", category: "property", books: ["commercial"] },

  // Casualty
  { id: "personal-auto", name: "Personal Auto", category: "casualty", books: ["personal"] },
  { id: "business-auto", name: "Business Auto", category: "casualty", books: ["commercial"] },
  { id: "personal-umbrella", name: "Personal Umbrella", category: "casualty", books: ["personal"] },
  { id: "comm-umbrella", name: "Commercial Umbrella", category: "casualty", books: ["commercial"] },
  { id: "spa", name: "SPA", category: "casualty", books: ["personal", "commercial"] },
  { id: "boat", name: "Boat / Watercraft", category: "casualty", books: ["personal"] },
  { id: "motorcycle", name: "Motorcycle / RV", category: "casualty", books: ["personal"] },
  { id: "work-comp", name: "Work Comp", category: "casualty", books: ["commercial"] },
  { id: "gen-liability", name: "General Liability", category: "casualty", books: ["commercial"] },
  { id: "bop", name: "Business Owners Policy", category: "casualty", books: ["commercial"] },
  { id: "guardian", name: "Guardian", category: "casualty", books: ["commercial"] },
  { id: "inland-marine", name: "Commercial Inland Marine", category: "casualty", books: ["commercial"] },
  { id: "comm-package", name: "Commercial Package Policy", category: "casualty", books: ["commercial"] },

  // Life
  { id: "term-life", name: "Term Life", category: "life", books: ["life"] },
  { id: "rop-term", name: "Return of Premium Term 20", category: "life", books: ["life"] },
  { id: "whole-life", name: "FB Select Whole Life", category: "life", books: ["life"] },
  { id: "premier-whole", name: "Premier Whole Life", category: "life", books: ["life"] },
  { id: "single-premium", name: "Single Premium Whole Life", category: "life", books: ["life"] },
  { id: "myga", name: "Multi-Year Guaranteed Annuity", category: "life", books: ["life"] },
  { id: "deferred-annuity", name: "Deferred Annuity", category: "life", books: ["life"] },
  { id: "payout-annuity", name: "Payout Annuity", category: "life", books: ["life"] },
];

export const lineById = new Map(linesOfBusiness.map((l) => [l.id, l]));

export function linesForBook(book: Book): LineOfBusiness[] {
  return linesOfBusiness.filter((l) => l.books.includes(book));
}

export const books: { id: Book; name: string }[] = [
  { id: "personal", name: "Personal" },
  { id: "life", name: "Life" },
  { id: "commercial", name: "Commercial" },
];

/* ---------------- derived values — the workbook's formulas ---------------- */

/** Gross Commission — =Premium * Percentage Earned */
export function grossCommission(entry: PolicyEntry): number {
  return entry.premium * entry.percentEarned;
}

/** Net Commission — =Gross + (Gross * Multiplier) */
export function netCommission(entry: PolicyEntry): number {
  const gross = grossCommission(entry);
  return gross + gross * entry.multiplier;
}

export interface Totals {
  count: number;
  premium: number;
  gross: number;
  net: number;
  deathBenefit: number;
  avgPremium: number;
  avgRate: number;
}

export function totalsFor(entries: PolicyEntry[]): Totals {
  const count = entries.length;
  let premium = 0;
  let gross = 0;
  let net = 0;
  let deathBenefit = 0;
  let rateSum = 0;

  for (const e of entries) {
    premium += e.premium;
    gross += grossCommission(e);
    net += netCommission(e);
    deathBenefit += e.deathBenefit;
    rateSum += e.percentEarned;
  }

  return {
    count,
    premium,
    gross,
    net,
    deathBenefit,
    avgPremium: count > 0 ? premium / count : 0,
    avgRate: count > 0 ? rateSum / count : 0,
  };
}

/** Policy counts and premium per goal category, derived from the book. */
export function countsByCategory(entries: PolicyEntry[]) {
  const empty = { property: 0, casualty: 0, life: 0 };
  const counts = { ...empty };
  const premium = { ...empty };

  for (const e of entries) {
    const category = lineById.get(e.lineOfBusiness)?.category;
    if (!category) continue;
    counts[category] += 1;
    premium[category] += e.premium;
  }
  return { counts, premium };
}

/* ---------------- formatting ---------------- */

export function currency(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function percent(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Month index (0-11) of an ISO date, or null when unset/unparseable. */
export function monthOf(iso: string): number | null {
  if (!iso) return null;
  const month = Number(iso.slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : null;
}
