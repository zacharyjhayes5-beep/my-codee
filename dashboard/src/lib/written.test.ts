import { describe, expect, it } from "vitest";
import type { Opportunity, PolicyEntry, Prospect } from "../types";
import { blankOpportunity } from "./opportunities";
import { blankProspect } from "./prospectSchema";
import { countsByCategory, totalsFor } from "./policies";
import {
  NEW_BUSINESS_RATE,
  alreadyWritten,
  applyWritten,
  policiesFromOpportunity,
  undoWritten,
} from "./written";

/** One id for the whole file: blankOpportunity mints a new one on each call. */
const BASE = blankOpportunity("hh-1");

function account(over: Partial<Opportunity> = {}): Opportunity {
  return {
    ...BASE,
    stage: "Won",
    lines: ["Home", "Auto", "Umbrella"],
    premiums: { Home: 1375, Auto: 670, Umbrella: 155 },
    nextAction: "Issue",
    nextActionDate: "2026-09-01",
    ...over,
  };
}

const household: Prospect = blankProspect({ id: "hh-1", name: "Dave Credo", stage: "Quoting" });

describe("marking an account won", () => {
  it("writes one policy per line, carrying that line's premium", () => {
    const rows = policiesFromOpportunity(account(), household, "2026-09-01");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.premium).sort((a, b) => a - b)).toEqual([155, 670, 1375]);
    expect(rows.every((r) => r.prospectId === "hh-1")).toBe(true);
    expect(rows.every((r) => r.effectiveDate === "2026-09-01")).toBe(true);
  });

  it("files each line under the right part of the book", () => {
    const rows = policiesFromOpportunity(account(), household, "2026-09-01");
    const counts = countsByCategory(rows);
    // Home is property; auto and umbrella are both casualty.
    expect(counts.counts.property).toBe(1);
    expect(counts.counts.casualty).toBe(2);
    expect(counts.counts.life).toBe(0);
  });

  it("splits the household name so the book reads like the rest of it", () => {
    const [row] = policiesFromOpportunity(account(), household, "2026-09-01");
    expect(row.firstName).toBe("Dave");
    expect(row.lastName).toBe("Credo");
  });

  /**
   * New business earns a quarter of premium — his figure. The workbook's
   * formula has to land on exactly that, so it is asserted in money rather
   * than in the rate alone.
   */
  it("earns a quarter of premium, and no multiplier on top", () => {
    const rows = policiesFromOpportunity(account(), household, "2026-09-01");
    expect(rows.every((r) => r.percentEarned === NEW_BUSINESS_RATE)).toBe(true);
    expect(rows.every((r) => r.multiplier === 0)).toBe(true);

    const totals = totalsFor(rows);
    expect(totals.premium).toBe(2200);
    expect(totals.net).toBe(550); // a quarter of 2,200
    expect(totals.net).toBeCloseTo(totals.premium * 0.25, 10);
  });

  it("moves the household to Won", () => {
    const result = applyWritten(account(), household, [], "2026-09-01");
    expect(result?.prospect?.stage).toBe("Won");
  });

  it("leaves a household that is already Won alone", () => {
    const won = { ...household, stage: "Won" as const };
    expect(applyWritten(account(), won, [], "2026-09-01")?.prospect).toBeUndefined();
  });

  it("does nothing for an account that is not written", () => {
    expect(applyWritten(account({ stage: "Quoting" }), household, [], "2026-09-01")).toBeNull();
  });

  it("does not write the book twice for the same account", () => {
    const first = applyWritten(account(), household, [], "2026-09-01");
    expect(first?.added).toBe(3);
    expect(alreadyWritten(first!.entries, account().id)).toBe(true);
    // Saving the account again — a note edited, the date moved — must not
    // post a second set of policies.
    expect(applyWritten(account(), household, first!.entries, "2026-09-02")).toBeNull();
  });

  it("keeps a line that was sold with no premium yet, as a policy worth nothing", () => {
    const rows = policiesFromOpportunity(
      account({ lines: ["Home", "Life"], premiums: { Home: 1000 } }),
      household,
      "2026-09-01",
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.lineOfBusiness === "term-life")?.premium).toBe(0);
  });

  it("takes the policies back when the account leaves Written", () => {
    const result = applyWritten(account(), household, [], "2026-09-01")!;
    const typedByHand: PolicyEntry = { ...result.entries[0], id: "hand-1", notes: "typed in" };
    const book = [...result.entries, typedByHand];

    const after = undoWritten(book, account().id);
    // Only what the seam created goes; anything entered by hand stays.
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("hand-1");
  });

  it("leaves another account's policies alone when one is undone", () => {
    const a = applyWritten(account(), household, [], "2026-09-01")!;
    const other: Opportunity = {
      ...blankOpportunity("hh-2"),
      stage: "Won",
      lines: ["Home"],
      premiums: { Home: 900 },
      nextAction: "Issue",
      nextActionDate: "2026-09-01",
    };
    const b = applyWritten(other, household, a.entries, "2026-09-01")!;

    const after = undoWritten(b.entries, account().id);
    expect(after).toHaveLength(1);
    expect(after[0].premium).toBe(900);
  });
});
