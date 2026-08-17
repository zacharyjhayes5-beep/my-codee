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
    expect(PROSPECT_SCHEMA_VERSION).toBe(7);
  });
});
