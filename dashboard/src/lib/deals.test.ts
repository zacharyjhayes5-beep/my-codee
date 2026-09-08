import { describe, expect, it } from "vitest";
import type { Opportunity, Prospect } from "../types";
import { blankOpportunity } from "./opportunities";
import { blankProspect } from "./prospectSchema";
import {
  ageLabel,
  ageTone,
  blankDeal,
  daysInStage,
  dealTotal,
  dealsFromOpportunities,
  money,
  moveDeal,
  openPremium,
  removeDeal,
  upsertDeal,
  type Deal,
} from "./deals";

const deal = (over: Partial<Deal> = {}): Deal => ({
  ...blankDeal(),
  id: "d1",
  name: "Marcy & Ted Hall",
  place: "Grand Ledge",
  rows: [
    { line: "Auto", premium: "1840" },
    { line: "Home", premium: "1260" },
    { line: "Umbrella", premium: "285" },
  ],
  stage: "Quoted",
  ...over,
});

/** The figure the reference design shows on that card. */
describe("what a card is worth", () => {
  it("sums the lines", () => {
    expect(dealTotal(deal())).toBe(3385);
    expect(money(dealTotal(deal()))).toBe("$3,385");
  });

  it("reads a premium however it was typed", () => {
    const d = deal({ rows: [{ line: "Auto", premium: "$1,840.50" }] });
    expect(dealTotal(d)).toBeCloseTo(1840.5, 2);
  });

  it("counts an empty or unparseable premium as nothing, never NaN", () => {
    const d = deal({ rows: [{ line: "Auto", premium: "" }, { line: "Home", premium: "abc" }] });
    expect(dealTotal(d)).toBe(0);
  });

  it("survives a card with no lines at all", () => {
    expect(dealTotal(deal({ rows: [] }))).toBe(0);
  });
});

describe("the board's headline", () => {
  it("counts every stage except Written as open", () => {
    const deals = [
      deal({ id: "a", stage: "Quoted" }),
      deal({ id: "b", stage: "Pending Decision" }),
      deal({ id: "c", stage: "Written" }),
    ];
    // Three identical cards; the written one is excluded.
    expect(openPremium(deals)).toBe(3385 * 2);
  });
});

describe("days in stage", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const aged = (days: number) =>
    deal({ stageEnteredAt: new Date(now.getTime() - days * 86_400_000).toISOString() });

  it("counts whole days from the move", () => {
    expect(daysInStage(aged(4), now)).toBe(4);
  });

  it("says new on the first day", () => {
    expect(ageLabel(aged(0), now)).toBe("new");
    expect(ageLabel(aged(4), now)).toBe("4d in stage");
  });

  it("tones at the design's thresholds", () => {
    expect(ageTone(aged(1), now)).toBe("#7e7a74");
    expect(ageTone(aged(4), now)).toBe("#7e7a74");
    expect(ageTone(aged(5), now)).toBe("#b0803e");
    expect(ageTone(aged(9), now)).toBe("#b0803e");
    expect(ageTone(aged(10), now)).toBe("#9c5a48");
    expect(ageTone(aged(21), now)).toBe("#9c5a48");
  });

  it("does not go negative on a clock that has slipped", () => {
    expect(daysInStage(aged(-3), now)).toBe(0);
  });

  it("tolerates a card with no timestamp", () => {
    expect(daysInStage(deal({ stageEnteredAt: "" }), now)).toBe(0);
  });
});

describe("dragging a card", () => {
  const at = "2026-09-15T12:00:00.000Z";

  it("moves it and restarts its clock", () => {
    const before = deal({ stageEnteredAt: "2026-09-01T00:00:00.000Z" });
    const [after] = moveDeal([before], "d1", "Pending Decision", at);
    expect(after.stage).toBe("Pending Decision");
    expect(after.stageEnteredAt).toBe(at);
  });

  /** Dropping a card back where it started is not a move. */
  it("leaves the clock alone when the column has not changed", () => {
    const before = deal({ stage: "Quoted", stageEnteredAt: "2026-09-01T00:00:00.000Z" });
    const [after] = moveDeal([before], "d1", "Quoted", at);
    expect(after.stageEnteredAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("leaves every other card alone", () => {
    const other = deal({ id: "d2", stage: "New" });
    const after = moveDeal([deal(), other], "d1", "Written", at);
    expect(after.find((d) => d.id === "d2")!.stage).toBe("New");
  });
});

describe("saving and deleting", () => {
  it("adds a card that is not there yet", () => {
    expect(upsertDeal([], deal())).toHaveLength(1);
  });

  it("replaces one that is, rather than duplicating it", () => {
    const after = upsertDeal([deal()], deal({ name: "Renamed" }));
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("Renamed");
  });

  it("removes by id", () => {
    expect(removeDeal([deal(), deal({ id: "d2" })], "d1").map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("seeding the board from the app's own records", () => {
  const household = (id: string, name: string, area: string) =>
    blankProspect({ id, name, area, phone: "(517) 555-0100" }) as Prospect;

  const account = (id: string, pid: string, stage: string, over: Partial<Opportunity> = {}) =>
    ({ ...blankOpportunity(pid), id, stage, ...over }) as Opportunity;

  const prospects = [household("p1", "Marcy & Ted Hall", "Grand Ledge, MI")];

  it("folds the eight opportunity stages onto the board's four", () => {
    const rows = dealsFromOpportunities(
      [
        account("a", "p1", "Qualified / Open"),
        account("b", "p1", "Fact-Find / Information Gathering"),
        account("c", "p1", "Quoting"),
        account("d", "p1", "Quote Presented"),
        account("e", "p1", "Decision Pending"),
        account("f", "p1", "Won"),
      ],
      prospects,
    );
    expect(rows.map((r) => r.stage)).toEqual([
      "New",
      "New",
      "Quoted",
      "Quoted",
      "Pending Decision",
      "Written",
    ]);
  });

  it("leaves Lost and Nurture off the board entirely", () => {
    const rows = dealsFromOpportunities(
      [account("a", "p1", "Lost"), account("b", "p1", "Nurture")],
      prospects,
    );
    expect(rows).toHaveLength(0);
  });

  it("carries the household's name, town and premiums across", () => {
    const [row] = dealsFromOpportunities(
      [
        account("a", "p1", "Quoting", {
          lines: ["Auto", "Home"],
          premiums: { Auto: 1840, Home: 1260 },
        }),
      ],
      prospects,
    );
    expect(row.name).toBe("Marcy & Ted Hall");
    // The town only, not "Grand Ledge, MI".
    expect(row.place).toBe("Grand Ledge");
    expect(dealTotal(row)).toBe(3100);
  });

  it("gives a card with no lines one empty row to start from", () => {
    const [row] = dealsFromOpportunities([account("a", "p1", "Quoting", { lines: [] })], prospects);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].premium).toBe("");
  });

  it("does not invent a household for an account whose prospect is gone", () => {
    const [row] = dealsFromOpportunities([account("a", "missing", "Quoting")], []);
    expect(row.name).toBe("Unknown household");
  });
});
