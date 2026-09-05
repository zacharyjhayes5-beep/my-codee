import { describe, expect, it } from "vitest";
import { blankProspect } from "./prospectSchema";
import { findDuplicates, mergeInto } from "./dedupe";
import {
  applyMapping,
  guessMapping,
  parseCsv,
  prospectFromRow,
  rowIsUsable,
} from "./intake";
import {
  OPPORTUNITY_STAGES,
  blankOpportunity,
  isStalled,
  patchOpportunity,
  summarizeByStage,
  temperatureOf,
  validateOpportunity,
} from "./opportunities";

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

describe("reading a CSV", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,address\n"Reed, Dana","12 Maple St, Howell"')).toEqual([
      ["name", "address"],
      ["Reed, Dana", "12 Maple St, Howell"],
    ]);
  });

  it("handles doubled quotes and newlines inside fields", () => {
    const rows = parseCsv('note\n"He said ""call back"""');
    expect(rows[1][0]).toBe('He said "call back"');
  });

  it("drops blank lines rather than making empty prospects", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toHaveLength(2);
  });
});

describe("guessing the columns", () => {
  it("matches the obvious headers", () => {
    const mapping = guessMapping(["First Name", "Last Name", "Phone", "Address", "City", "Zip"]);
    expect(mapping[0]).toBe("firstName");
    expect(mapping[1]).toBe("lastName");
    expect(mapping[2]).toBe("phone");
    expect(mapping[3]).toBe("line1");
    expect(mapping[4]).toBe("city");
    expect(mapping[5]).toBe("zip");
  });

  it("copes with looser spellings", () => {
    const mapping = guessMapping(["Owner First", "Owner Last", "Primary Phone", "Site Address"]);
    expect(mapping[0]).toBe("firstName");
    expect(mapping[1]).toBe("lastName");
    expect(mapping[2]).toBe("phone");
    expect(mapping[3]).toBe("line1");
  });

  it("never assigns the same field twice", () => {
    const mapping = guessMapping(["Name", "Name", "Name"]);
    const assigned = Object.values(mapping).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("leaves an unrecognised column ignored rather than guessing", () => {
    const mapping = guessMapping(["Roof Material"]);
    expect(mapping[0]).toBe("");
  });

  it("recognises the county's parcel number under its usual spellings", () => {
    expect(guessMapping(["Parcel Number"])[0]).toBe("parcelId");
    expect(guessMapping(["Parcel ID"])[0]).toBe("parcelId");
    expect(guessMapping(["PNUM"])[0]).toBe("parcelId");
  });
});

describe("turning rows into households", () => {
  const rows = parseCsv(
    "First Name,Last Name,Phone,Address,City,State\nDana,Reed,(517) 555-0134,12 Maple St,Howell,MI\n,,,,,\nKen,Ames,,9 Oak Rd,Fenton,MI",
  );
  const mapping = guessMapping(rows[0]);
  const mapped = applyMapping(rows, mapping, true);

  it("skips a row with nothing to call and nobody to call", () => {
    expect(rowIsUsable(mapped[0])).toBe(true);
    expect(mapped.filter(rowIsUsable)).toHaveLength(2);
  });

  it("builds the household name from the parts", () => {
    const p = prospectFromRow(mapped[0], "Kent list");
    expect(p.name).toBe("Dana Reed");
    expect(p.firstName).toBe("Dana");
    expect(p.phone).toBe("(517) 555-0134");
  });

  it("carries the parcel number through, so a later county sync deduplicates", () => {
    // Without this the household is invisible to runSync's parcel check and
    // the next batch from the county creates a second copy of it.
    const withParcel = parseCsv(
      "Owner Name,Address,City,Parcel Number\nHorton Sharon Trust,147 El Centro Blvd SE,East Grand Rapids,41-14-27-376-005",
    );
    const m = guessMapping(withParcel[0]);
    const mappedRows = applyMapping(withParcel, m, true);
    const p = prospectFromRow(mappedRows[0], "Kent County GIS");
    expect(p.parcelId).toBe("41-14-27-376-005");
    expect(p.name).toBe("Horton Sharon Trust");
  });

  it("leaves the parcel blank when the file has no such column", () => {
    expect(prospectFromRow(mapped[0], "Kent list").parcelId).toBe("");
  });

  it("fills the area label the Lead Map needs", () => {
    expect(prospectFromRow(mapped[0], "Kent list").area).toBe("Howell, MI");
  });

  it("creates a primary contact from the name", () => {
    const p = prospectFromRow(mapped[0], "Kent list");
    expect(p.contacts).toHaveLength(1);
    expect(p.contacts[0].isPrimary).toBe(true);
    expect(p.contacts[0].dob).toBe("");
  });

  it("uses the list's lead source when the file has no column for it", () => {
    expect(prospectFromRow(mapped[0], "Kent list").leadSource).toBe("Kent list");
  });

  it("invents nothing — no score, grade, or outcome", () => {
    const p = prospectFromRow(mapped[0], "Kent list");
    expect(p.conversionScore).toBeNull();
    expect(p.priorityGrade).toBe("");
    expect(p.lastOutcome).toBeNull();
    expect(p.stage).toBe("New");
  });
});

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

describe("duplicate detection", () => {
  const existing = [
    blankProspect({
      id: "p1",
      name: "Dana Reed",
      firstName: "Dana",
      lastName: "Reed",
      phone: "(517) 555-0134",
      email: "dana@example.com",
      address: { line1: "12 Maple St", city: "Howell", state: "MI", zip: "48843" },
    }),
    blankProspect({
      id: "p2",
      name: "Ken Ames",
      firstName: "Ken",
      lastName: "Ames",
      phone: "(810) 555-0199",
      address: { line1: "9 Oak Rd", city: "Fenton", state: "MI", zip: "48430" },
    }),
  ];

  function candidate(overrides: Record<string, unknown> = {}) {
    return {
      firstName: "",
      lastName: "",
      name: "",
      phone: "",
      email: "",
      address: { line1: "", city: "", state: "", zip: "" },
      ...overrides,
    } as Parameters<typeof findDuplicates>[0];
  }

  it("treats a shared phone number as certain, whatever the name", () => {
    const found = findDuplicates(
      candidate({ firstName: "D.", lastName: "Reed-Smith", phone: "517-555-0134" }),
      existing,
    );
    expect(found[0].strength).toBe("certain");
    expect(found[0].existing.id).toBe("p1");
  });

  it("treats a shared email as certain", () => {
    const found = findDuplicates(candidate({ email: "DANA@example.com" }), existing);
    expect(found[0].strength).toBe("certain");
  });

  it("treats the same name at the same address as certain", () => {
    const found = findDuplicates(
      candidate({
        firstName: "Dana",
        lastName: "Reed",
        address: { line1: "12 Maple Street", city: "Howell", state: "MI", zip: "" },
      }),
      existing,
    );
    expect(found[0].strength).toBe("certain");
  });

  it("flags a different name at the same address as likely, not certain", () => {
    const found = findDuplicates(
      candidate({
        firstName: "Linda",
        lastName: "Reed",
        address: { line1: "12 Maple St", city: "Howell", state: "MI", zip: "" },
      }),
      existing,
    );
    expect(found[0].strength).toBe("likely");
  });

  it("flags a same name elsewhere as only possible", () => {
    const found = findDuplicates(
      candidate({
        firstName: "Dana",
        lastName: "Reed",
        address: { line1: "500 Far Away Dr", city: "Traverse City", state: "MI", zip: "" },
      }),
      existing,
    );
    expect(found[0].strength).toBe("possible");
  });

  it("finds nothing for a genuinely new household", () => {
    expect(
      findDuplicates(candidate({ firstName: "Marcus", lastName: "Webb", phone: "(616) 555-0000" }), existing),
    ).toEqual([]);
  });

  it("orders the strongest match first", () => {
    const found = findDuplicates(
      candidate({ firstName: "Ken", lastName: "Ames", phone: "(517) 555-0134" }),
      existing,
    );
    expect(found[0].strength).toBe("certain");
  });
});

describe("merging", () => {
  const existing = blankProspect({
    id: "p1",
    name: "Dana Reed",
    phone: "(517) 555-0134",
    email: "",
    whyTheyFit: "Lakefront home",
    address: { line1: "12 Maple St", city: "Howell", state: "MI", zip: "" },
  });

  it("fills gaps from the incoming record", () => {
    const merged = mergeInto(existing, {
      email: "dana@example.com",
      address: { line1: "", city: "", state: "", zip: "48843" },
    });
    expect(merged.email).toBe("dana@example.com");
    expect(merged.address.zip).toBe("48843");
  });

  it("never overwrites something already there", () => {
    const merged = mergeInto(existing, { phone: "(999) 999-9999", whyTheyFit: "different reason" });
    expect(merged.phone).toBe("(517) 555-0134");
    expect(merged.whyTheyFit).toBe("Lakefront home");
  });

  it("keeps the id of the record being merged into", () => {
    expect(mergeInto(existing, { id: "other" } as never).id).toBe("p1");
  });

  it("records where the merged-in data came from", () => {
    expect(mergeInto(existing, { leadSource: "Kent list" }).mergedFrom).toContain("Kent list");
  });
});

/* ------------------------------------------------------------------ */
/* Opportunities                                                       */
/* ------------------------------------------------------------------ */

describe("the non-negotiable opportunity rule", () => {
  it("refuses one with no next action", () => {
    const v = validateOpportunity(blankOpportunity("p1"));
    expect(v.ok).toBe(false);
    expect(v.problems).toContain("a next action");
    expect(v.problems).toContain("a next action date");
  });

  it("refuses one with an action but no date", () => {
    const v = validateOpportunity(blankOpportunity("p1", { nextAction: "Quote them" }));
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual(["a next action date"]);
  });

  it("refuses whitespace as an action", () => {
    const v = validateOpportunity(
      blankOpportunity("p1", { nextAction: "   ", nextActionDate: "2026-09-01" }),
    );
    expect(v.ok).toBe(false);
  });

  it("accepts one with both", () => {
    const v = validateOpportunity(
      blankOpportunity("p1", { nextAction: "Present the quote", nextActionDate: "2026-09-01" }),
    );
    expect(v.ok).toBe(true);
  });
});

describe("opportunity history", () => {
  const base = blankOpportunity("p1", {
    nextAction: "Quote",
    nextActionDate: "2026-09-01",
  });

  it("records a stage change", () => {
    const moved = patchOpportunity(base, { stage: "Quote Presented" });
    expect(moved.history).toHaveLength(1);
    expect(moved.history[0].summary).toContain("Quote Presented");
  });

  it("records nothing when nothing moved", () => {
    expect(patchOpportunity(base, { stage: base.stage }).history).toHaveLength(0);
  });

  it("keeps earlier history when more changes land", () => {
    const once = patchOpportunity(base, { stage: "Quoting" });
    const twice = patchOpportunity(once, { stage: "Quote Presented" });
    expect(twice.history).toHaveLength(2);
  });
});

describe("pipeline views", () => {
  const opps = [
    blankOpportunity("p1", { stage: "Quoting", estimatedValue: 1200, nextActionDate: "2026-08-01" }),
    blankOpportunity("p2", { stage: "Quoting", estimatedValue: 800, nextActionDate: "2099-01-01" }),
    blankOpportunity("p3", { stage: "Won", estimatedValue: 2000, nextActionDate: "2099-01-01" }),
  ];

  it("counts and values each stage", () => {
    const summary = summarizeByStage(opps, "2026-08-15");
    const quoting = summary.find((s) => s.stage === "Quoting")!;
    expect(quoting.count).toBe(2);
    expect(quoting.value).toBe(2000);
  });

  it("counts what is due or overdue", () => {
    const quoting = summarizeByStage(opps, "2026-08-15").find((s) => s.stage === "Quoting")!;
    expect(quoting.dueOrOverdue).toBe(1);
  });

  it("covers all eight stages", () => {
    expect(summarizeByStage([], "2026-08-15")).toHaveLength(8);
    expect(OPPORTUNITY_STAGES).toHaveLength(8);
  });

  it("flags a quote left presented too long", () => {
    const stale = blankOpportunity("p1", { stage: "Quote Presented", updatedAt: "2026-08-01" });
    expect(isStalled(stale, "2026-08-15")).toBe(true);
    expect(isStalled(stale, "2026-08-03")).toBe(false);
  });

  it("does not call an early-stage opportunity stalled", () => {
    const fresh = blankOpportunity("p1", { stage: "Qualified / Open", updatedAt: "2026-01-01" });
    expect(isStalled(fresh, "2026-08-15")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Temperature                                                         */
/* ------------------------------------------------------------------ */

describe("derived temperature", () => {
  it("is Hot for an opportunity stage regardless of score", () => {
    const reading = temperatureOf(blankProspect({ stage: "Opportunity" }));
    expect(reading.temperature).toBe("Hot");
    expect(reading.because).toContain("Opportunity");
  });

  it("is Hot for a high score", () => {
    expect(temperatureOf(blankProspect({ stage: "Contacted", conversionScore: 9 })).temperature).toBe("Hot");
  });

  it("is Warm in the middle", () => {
    expect(temperatureOf(blankProspect({ stage: "Contacted", conversionScore: 6 })).temperature).toBe("Warm");
  });

  it("is Nurture lower down", () => {
    expect(temperatureOf(blankProspect({ stage: "Contacted", conversionScore: 4 })).temperature).toBe("Nurture");
  });

  it("is Cold at the bottom, and for a closed household", () => {
    expect(temperatureOf(blankProspect({ stage: "Contacted", conversionScore: 2 })).temperature).toBe("Cold");
    expect(temperatureOf(blankProspect({ stage: "Closed", closedReason: "lost" })).temperature).toBe("Cold");
  });

  it("is Cold, not warm, when there is no score to go on", () => {
    const reading = temperatureOf(blankProspect({ stage: "New" }));
    expect(reading.temperature).toBe("Cold");
    expect(reading.because).toBe("No conversion score yet");
  });

  it("always explains itself", () => {
    for (const score of [1, 5, 8, 10]) {
      const reading = temperatureOf(blankProspect({ stage: "Contacted", conversionScore: score }));
      expect(reading.because).toBeTruthy();
    }
  });
});
