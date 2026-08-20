import { describe, expect, it } from "vitest";
import {
  PROSPECT_SCHEMA_VERSION,
  STATUS_TO_STAGE,
  blankProspect,
  needsProspectMigration,
  normalizeProspect,
  normalizeProspects,
} from "./prospectSchema";

/**
 * The v3 shape, written out in full. Every assertion below is about this exact
 * record surviving the move — a household that loses its phone number or its
 * Granola note in migration is unrecoverable, so this is the file that has to
 * be right.
 */
function legacy(overrides: Record<string, unknown> = {}) {
  return {
    id: "pr1",
    name: "Tom & Linda Vargas",
    status: "Open to Quote",
    lines: ["property", "life"],
    area: "Fenton, MI",
    phone: "(810) 555-0199",
    email: "vargas@example.com",
    nextStep: "send home + auto quote",
    notes: [
      { id: "n1", date: "2026-07-04", title: "Discovery call", body: "Roof is 4 years old.", source: "granola" },
      { id: "n2", date: "2026-07-18", title: "Manual note", body: "Prefers evenings.", source: "manual" },
    ],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-18",
    ...overrides,
  };
}

describe("status → stage, all six", () => {
  const cases: [string, string, string | null][] = [
    ["New", "New", null],
    ["Contacted", "Contacted", null],
    ["Meeting Scheduled", "Review Scheduled", null],
    ["Open to Quote", "Quoting", null],
    ["Closed", "Closed", "legacy-unknown"],
    ["Lost", "Closed", "lost"],
  ];

  for (const [status, stage, reason] of cases) {
    it(`${status} becomes ${stage}${reason ? ` (${reason})` : ""}`, () => {
      const result = normalizeProspect(legacy({ status }));
      expect(result.stage).toBe(stage);
      expect(result.closedReason).toBe(reason);
    });
  }

  it("covers every status the old app could store", () => {
    expect(Object.keys(STATUS_TO_STAGE).sort()).toEqual(
      ["Closed", "Contacted", "Lost", "Meeting Scheduled", "New", "Open to Quote"].sort(),
    );
  });

  it("falls back to New for a status it has never seen", () => {
    expect(normalizeProspect(legacy({ status: "Something Else" })).stage).toBe("New");
  });
});

describe("nothing is lost", () => {
  const migrated = normalizeProspect(legacy());

  it("keeps the identity and display name", () => {
    expect(migrated.id).toBe("pr1");
    expect(migrated.name).toBe("Tom & Linda Vargas");
  });

  it("keeps contact details and lines of business", () => {
    expect(migrated.phone).toBe("(810) 555-0199");
    expect(migrated.email).toBe("vargas@example.com");
    expect(migrated.lines).toEqual(["property", "life"]);
  });

  it("keeps the area label the Lead Map clusters on", () => {
    expect(migrated.area).toBe("Fenton, MI");
  });

  it("keeps every note, with its date, body and source", () => {
    expect(migrated.notes).toHaveLength(2);
    expect(migrated.notes[0]).toEqual(legacy().notes[0]);
    expect(migrated.notes[1].source).toBe("manual");
  });

  it("keeps the original dates", () => {
    expect(migrated.createdAt).toBe("2026-07-01");
    expect(migrated.updatedAt).toBe("2026-07-18");
  });

  it("carries the free-text next step across to nextAction", () => {
    expect(migrated.nextAction).toBe("send home + auto quote");
  });
});

describe("nothing is invented", () => {
  const migrated = normalizeProspect(legacy());

  it("gives the carried-over next action no due date", () => {
    expect(migrated.nextActionDate).toBe("");
  });

  it("leaves priority grade blank", () => {
    expect(migrated.priorityGrade).toBe("");
  });

  it("leaves conversion score null rather than guessing a middle value", () => {
    expect(migrated.conversionScore).toBeNull();
  });

  it("leaves the call outcome fields empty", () => {
    expect(migrated.lastOutcome).toBeNull();
    expect(migrated.lastOutcomeAt).toBe("");
  });

  it("does not infer a last-contacted date from the note dates", () => {
    expect(migrated.lastContactedAt).toBe("");
  });

  it("creates no contacts, because it cannot know who is who", () => {
    expect(migrated.contacts).toEqual([]);
  });

  it("leaves the structured address blank and the area label alone", () => {
    expect(migrated.address).toEqual({ line1: "", city: "", state: "", zip: "" });
    expect(migrated.area).toBe("Fenton, MI");
  });

  it("does not mark anyone do-not-contact", () => {
    expect(migrated.doNotContact).toBe(false);
  });

  it("leaves source blank when the old record had none", () => {
    expect(migrated.source).toBe("");
  });

  it("only ever sets a closed reason for the two terminal statuses", () => {
    for (const status of ["New", "Contacted", "Meeting Scheduled", "Open to Quote"]) {
      expect(normalizeProspect(legacy({ status })).closedReason).toBeNull();
    }
  });
});

describe("running it twice changes nothing", () => {
  it("is idempotent", () => {
    const once = normalizeProspect(legacy());
    const twice = normalizeProspect(once);
    expect(twice).toEqual(once);
  });

  it("does not reset a stage that has no old-status equivalent", () => {
    const opportunity = blankProspect({ stage: "Opportunity", conversionScore: 9, priorityGrade: "A" });
    const again = normalizeProspect(opportunity);
    expect(again.stage).toBe("Opportunity");
    expect(again.conversionScore).toBe(9);
    expect(again.priorityGrade).toBe("A");
  });

  it("preserves a closed reason set after migration", () => {
    const dormant = blankProspect({ stage: "Closed", closedReason: "dormant" });
    expect(normalizeProspect(dormant).closedReason).toBe("dormant");
  });
});

describe("junk in, usable record out", () => {
  it("survives an empty object", () => {
    const result = normalizeProspect({});
    expect(result.stage).toBe("New");
    expect(result.id).toBeTruthy();
    expect(result.notes).toEqual([]);
  });

  it("survives null and undefined", () => {
    expect(normalizeProspect(null).stage).toBe("New");
    expect(normalizeProspect(undefined).stage).toBe("New");
  });

  it("drops line ids that are not real categories", () => {
    expect(normalizeProspect(legacy({ lines: ["property", "boats", 7] })).lines).toEqual(["property"]);
  });

  it("returns an empty list for a non-array", () => {
    expect(normalizeProspects("nope")).toEqual([]);
    expect(normalizeProspects(null)).toEqual([]);
  });
});

describe("detecting work to do", () => {
  it("spots a pre-v4 record", () => {
    expect(needsProspectMigration([legacy()])).toBe(true);
  });

  it("leaves an already-migrated list alone", () => {
    expect(needsProspectMigration([blankProspect(), blankProspect()])).toBe(false);
  });

  it("spots a single stale record in an otherwise migrated list", () => {
    expect(needsProspectMigration([blankProspect(), legacy()])).toBe(true);
  });

  it("reports the schema version the app is on", () => {
    // Bumped to 9 when the property profile was added. This assertion exists to
    // make a version change deliberate rather than incidental — if it fails,
    // confirm the migration was intended before moving the number.
    expect(PROSPECT_SCHEMA_VERSION).toBe(10);
  });
});

describe("property profile — schema v9", () => {
  /**
   * The whole migration promise in one test. A record written before v9 has no
   * property at all; it must come back with every field present and every one
   * of them empty. Inventing a roof material would read as a fact somebody
   * could quote a policy from.
   */
  it("gives an older record a complete, entirely blank property", () => {
    const p = normalizeProspect({ id: "x", name: "Olson", assets: { yearBuilt: "1994" } });

    expect(p.assets.yearBuilt).toBe("1994");
    expect(p.assets.property).toEqual({
      constructionType: "",
      squareFeet: null,
      exteriorMaterial: "",
      dwellingReplacementCost: null,
      roofYearInstalled: "",
      roofMaterial: "",
      roofConcerns: "",
      underwritingFlags: "",
      basementType: "",
      basementFinishedPct: null,
      waterBackupNotes: "",
      garageType: "",
      garageStalls: null,
      acreage: null,
      otherStructures: "",
      pool: "",
    });
  });

  it("keeps a record that has no assets object at all working", () => {
    const p = normalizeProspect({ id: "x", name: "No assets" });
    expect(p.assets.property.roofMaterial).toBe("");
  });

  it("carries real values through untouched", () => {
    const p = normalizeProspect({
      id: "x",
      name: "Filled in",
      assets: {
        property: {
          roofYearInstalled: "2016",
          roofMaterial: "Architectural shingle",
          squareFeet: 2400,
          basementFinishedPct: 60,
          acreage: 1.4,
        },
      },
    });
    expect(p.assets.property.roofYearInstalled).toBe("2016");
    expect(p.assets.property.roofMaterial).toBe("Architectural shingle");
    expect(p.assets.property.squareFeet).toBe(2400);
    expect(p.assets.property.basementFinishedPct).toBe(60);
    expect(p.assets.property.acreage).toBe(1.4);
  });

  /** Idempotence is the property the whole migration rests on. */
  it("is unchanged by a second pass", () => {
    const once = normalizeProspect({ id: "x", name: "Twice", assets: { property: { squareFeet: 1800 } } });
    const twice = normalizeProspect(once);
    expect(twice.assets.property).toEqual(once.assets.property);
  });

  /** Garbage in a stored record must not become a number on screen. */
  it("refuses non-finite and non-numeric values", () => {
    const p = normalizeProspect({
      id: "x",
      name: "Bad numbers",
      assets: {
        property: {
          squareFeet: "2400",
          acreage: NaN,
          garageStalls: Infinity,
          dwellingReplacementCost: null,
        },
      },
    });
    expect(p.assets.property.squareFeet).toBeNull();
    expect(p.assets.property.acreage).toBeNull();
    expect(p.assets.property.garageStalls).toBeNull();
    expect(p.assets.property.dwellingReplacementCost).toBeNull();
  });

  it("survives property being a string, a number or null", () => {
    for (const junk of ["nonsense", 42, null, []]) {
      const p = normalizeProspect({ id: "x", name: "Junk", assets: { property: junk } });
      expect(p.assets.property.constructionType).toBe("");
    }
  });
});

describe("coverage — schema v10", () => {
  it("gives an older record an empty coverage list", () => {
    const p = normalizeProspect({ id: "x", name: "Olson", assets: { yearBuilt: "1994" } });
    expect(p.assets.coverage).toEqual([]);
    // v9 is untouched by v10.
    expect(p.assets.property.roofMaterial).toBe("");
  });

  it("carries real items through intact", () => {
    const p = normalizeProspect({
      id: "x",
      name: "Filled",
      assets: {
        coverage: [
          { id: "a", line: "personal-auto", status: "held", label: "2021 Explorer", detail: "Ford" },
          { id: "b", line: "personal-umbrella", status: "needed", label: "", detail: "" },
        ],
      },
    });
    expect(p.assets.coverage).toHaveLength(2);
    expect(p.assets.coverage[0]).toEqual({
      id: "a",
      line: "personal-auto",
      status: "held",
      label: "2021 Explorer",
      detail: "Ford",
    });
    expect(p.assets.coverage[1].status).toBe("needed");
  });

  /**
   * A malformed row would become an unlabelled mesh floating in the scene, so
   * anything without both an id and a line is dropped rather than rendered.
   */
  it("drops rows that could not be rendered", () => {
    const p = normalizeProspect({
      id: "x",
      name: "Junk",
      assets: {
        coverage: [
          { id: "", line: "boat" },
          { id: "ok", line: "" },
          { line: "boat" },
          null,
          "nonsense",
          42,
          { id: "good", line: "boat" },
        ],
      },
    });
    expect(p.assets.coverage.map((c) => c.id)).toEqual(["good"]);
  });

  /** Two objects sharing an id would collide in the scene graph. */
  it("keeps only the first of a duplicated id", () => {
    const p = normalizeProspect({
      id: "x",
      name: "Dupes",
      assets: {
        coverage: [
          { id: "a", line: "boat", label: "first" },
          { id: "a", line: "personal-auto", label: "second" },
        ],
      },
    });
    expect(p.assets.coverage).toHaveLength(1);
    expect(p.assets.coverage[0].label).toBe("first");
  });

  /**
   * An unreadable status must never come back as "held". Ghosted overstates
   * nothing; solid claims they own something.
   */
  it("falls back to needed rather than held", () => {
    const p = normalizeProspect({
      id: "x",
      name: "Bad status",
      assets: {
        coverage: [
          { id: "a", line: "boat", status: "owned" },
          { id: "b", line: "boat", status: undefined },
          { id: "c", line: "boat", status: 1 },
        ],
      },
    });
    expect(p.assets.coverage.every((c) => c.status === "needed")).toBe(true);
  });

  it("survives coverage being a string, a number, an object or null", () => {
    for (const junk of ["nope", 7, null, { id: "a" }]) {
      const p = normalizeProspect({ id: "x", name: "J", assets: { coverage: junk } });
      expect(p.assets.coverage).toEqual([]);
    }
  });

  it("is unchanged by a second pass", () => {
    const once = normalizeProspect({
      id: "x",
      name: "Twice",
      assets: { coverage: [{ id: "a", line: "boat", status: "held", label: "Lund" }] },
    });
    expect(normalizeProspect(once).assets.coverage).toEqual(once.assets.coverage);
  });
});
