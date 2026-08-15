import { describe, expect, it } from "vitest";
import type { Book, PolicyEntry } from "../types";
import {
  countsByCategory,
  currency,
  grossCommission,
  lifeBreakdown,
  linesOfBusiness,
  monthOf,
  netCommission,
  percent,
  totalsFor,
} from "./policies";

/**
 * These lock the numbers that come off Zach's own workbook. Every expected
 * value here was worked out by hand — if a change makes one of these fail,
 * the change is wrong until proven otherwise, not the test.
 */

interface EntryOverrides {
  book?: Book;
  effectiveDate?: string;
  lineOfBusiness?: string;
  premium?: number;
  percentEarned?: number;
  multiplier?: number;
  deathBenefit?: number;
}

function entry(id: string, overrides: EntryOverrides = {}): PolicyEntry {
  return {
    id,
    book: "personal",
    effectiveDate: "2026-03-15",
    firstName: "Test",
    lastName: id,
    companyName: "",
    deathBenefit: 0,
    lineOfBusiness: "homeowners",
    policyNumber: id,
    premium: 0,
    percentEarned: 0,
    multiplier: 0,
    lastReview: "",
    notes: "",
    ...overrides,
  };
}

describe("grossCommission — premium x percentage earned", () => {
  it("multiplies premium by the rate", () => {
    // 2,400 premium at 9% = 216.00
    const e = entry("a", { premium: 2400, percentEarned: 0.09 });
    expect(grossCommission(e)).toBeCloseTo(216, 10);
  });

  it("is zero when the rate is zero", () => {
    expect(grossCommission(entry("b", { premium: 5000, percentEarned: 0 }))).toBe(0);
  });

  it("ignores the multiplier entirely", () => {
    const withMultiplier = entry("c", { premium: 1000, percentEarned: 0.5, multiplier: 1 });
    expect(grossCommission(withMultiplier)).toBe(500);
  });
});

describe("netCommission — gross plus gross x multiplier", () => {
  it("adds the multiplier bonus on top of gross", () => {
    // gross 500, multiplier 0.50 -> 500 + 250 = 750
    const e = entry("d", { premium: 1000, percentEarned: 0.5, multiplier: 0.5 });
    expect(netCommission(e)).toBe(750);
  });

  it("equals gross when the multiplier is zero", () => {
    const e = entry("e", { premium: 1000, percentEarned: 0.5, multiplier: 0 });
    expect(netCommission(e)).toBe(grossCommission(e));
  });

  it("doubles gross at a 1.00 multiplier — the Tier 3 case", () => {
    const e = entry("f", { premium: 1000, percentEarned: 0.5, multiplier: 1 });
    expect(netCommission(e)).toBe(1000);
  });
});

describe("totalsFor", () => {
  const entries = [
    entry("g", { premium: 1000, percentEarned: 0.5, multiplier: 0.5 }),
    entry("h", { premium: 2000, percentEarned: 0.25, multiplier: 1, deathBenefit: 250_000 }),
  ];

  it("sums premium, gross, net and death benefit", () => {
    const t = totalsFor(entries);
    expect(t.count).toBe(2);
    expect(t.premium).toBe(3000);
    expect(t.gross).toBe(1000); // 500 + 500
    expect(t.net).toBe(1750); // 750 + 1000
    expect(t.deathBenefit).toBe(250_000);
  });

  it("averages premium and rate across the rows", () => {
    const t = totalsFor(entries);
    expect(t.avgPremium).toBe(1500);
    expect(t.avgRate).toBe(0.375); // (0.50 + 0.25) / 2
  });

  it("returns zeroes rather than NaN for an empty book", () => {
    const t = totalsFor([]);
    expect(t.count).toBe(0);
    expect(t.avgPremium).toBe(0);
    expect(t.avgRate).toBe(0);
    expect(t.net).toBe(0);
  });
});

describe("countsByCategory", () => {
  const entries = [
    entry("i", { lineOfBusiness: "homeowners", premium: 1200 }),
    entry("j", { lineOfBusiness: "personal-auto", premium: 900 }),
    entry("k", { lineOfBusiness: "term-life", premium: 600 }),
    entry("l", { lineOfBusiness: "myga", premium: 5000 }),
  ];

  it("buckets policies into property, casualty and life", () => {
    const { counts } = countsByCategory(entries);
    expect(counts).toEqual({ property: 1, casualty: 1, life: 2 });
  });

  it("sums premium per category", () => {
    const { premium } = countsByCategory(entries);
    expect(premium).toEqual({ property: 1200, casualty: 900, life: 5600 });
  });

  it("keeps annuities inside life — the compensation guide groups them there", () => {
    const { counts } = countsByCategory([entry("m", { lineOfBusiness: "deferred-annuity" })]);
    expect(counts.life).toBe(1);
  });

  it("skips a line of business that is not in the catalog", () => {
    const { counts } = countsByCategory([entry("n", { lineOfBusiness: "not-a-real-line" })]);
    expect(counts).toEqual({ property: 0, casualty: 0, life: 0 });
  });
});

describe("lifeBreakdown — the All-American split", () => {
  const entries = [
    entry("o", { lineOfBusiness: "term-life", premium: 600, percentEarned: 0.5 }),
    entry("p", { lineOfBusiness: "whole-life", premium: 1000, percentEarned: 0.5 }),
    entry("q", { lineOfBusiness: "myga", premium: 5000, percentEarned: 0.02 }),
    entry("r", { lineOfBusiness: "homeowners", premium: 1200, percentEarned: 0.15 }),
  ];

  it("counts life policies without annuities", () => {
    expect(lifeBreakdown(entries).policies).toBe(2);
  });

  it("counts annuities separately", () => {
    expect(lifeBreakdown(entries).annuities).toBe(1);
  });

  it("excludes annuity commission from the life commission figure", () => {
    // 300 + 500 = 800. The annuity's 100 is deliberately left out.
    expect(lifeBreakdown(entries).gross).toBeCloseTo(800, 10);
  });

  it("ignores property and casualty rows completely", () => {
    const b = lifeBreakdown([entry("s", { lineOfBusiness: "personal-auto", premium: 900, percentEarned: 0.1 })]);
    expect(b).toEqual({ policies: 0, gross: 0, annuities: 0 });
  });

  it("differs from countsByCategory when annuities are present — on purpose", () => {
    const byCategory = countsByCategory(entries).counts.life;
    const forAllAmerican = lifeBreakdown(entries).policies;
    expect(byCategory).toBe(3);
    expect(forAllAmerican).toBe(2);
  });
});

describe("line of business catalog", () => {
  it("gives every line a real category", () => {
    for (const line of linesOfBusiness) {
      expect(["property", "casualty", "life"]).toContain(line.category);
    }
  });

  it("gives every line at least one book", () => {
    for (const line of linesOfBusiness) {
      expect(line.books.length).toBeGreaterThan(0);
    }
  });

  it("uses unique ids", () => {
    const ids = linesOfBusiness.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only flags life-category lines as annuities", () => {
    for (const line of linesOfBusiness.filter((l) => l.annuity)) {
      expect(line.category).toBe("life");
    }
  });

  it("has exactly the three annuity products", () => {
    const annuities = linesOfBusiness.filter((l) => l.annuity).map((l) => l.id);
    expect(annuities.sort()).toEqual(["deferred-annuity", "myga", "payout-annuity"]);
  });
});

describe("formatting", () => {
  it("formats currency with two decimals by default", () => {
    expect(currency(1234.5)).toBe("$1,234.50");
  });

  it("drops decimals when asked", () => {
    expect(currency(2500, 0)).toBe("$2,500");
  });

  it("formats a decimal rate as a percentage to one place", () => {
    expect(percent(0.09)).toBe("9.0%");
    expect(percent(0.375)).toBe("37.5%");
  });
});

describe("monthOf", () => {
  it("reads the month as a zero-based index", () => {
    expect(monthOf("2026-03-15")).toBe(2);
    expect(monthOf("2026-01-01")).toBe(0);
    expect(monthOf("2026-12-31")).toBe(11);
  });

  it("returns null for an empty or impossible date", () => {
    expect(monthOf("")).toBeNull();
    expect(monthOf("2026-13-01")).toBeNull();
    expect(monthOf("2026-00-01")).toBeNull();
  });
});
