import { describe, expect, it } from "vitest";
import {
  buildResearchQueue,
  needsResearch,
  researchCount,
  researchedPatch,
  unreachablePatch,
} from "./research";
import { formatPhone, isValidPhone } from "./phone";
import { blankProspect, normalizeProspect } from "./prospectSchema";
import { eligibilityOf } from "./queue";
import { buildDailyBrief } from "./dailyBrief";
import { whatNeedsMe } from "./attention";
import type { Prospect } from "../types";

/** A household exactly as the GIS sync creates one. */
function gisLead(over: Partial<Prospect> = {}): Prospect {
  return blankProspect({
    name: "Hefferan David J & Meggan S",
    source: "gis",
    parcelId: "41-15-01-100-005",
    needsPhoneNumber: true,
    area: "Ada, MI",
    stage: "New",
    createdAt: "2026-08-18",
    updatedAt: "2026-08-18",
    ...over,
  });
}

describe("needsResearch", () => {
  it("includes a GIS household with no number", () => {
    expect(needsResearch(gisLead())).toBe(true);
  });

  /**
   * The Bad Number outcome also sets needsPhoneNumber. Somebody already called
   * belongs in the calling workflow's own review list, not in a bulk research
   * queue for cold properties.
   */
  it("excludes a non-GIS household whose number turned out to be bad", () => {
    expect(needsResearch(gisLead({ source: "manual" }))).toBe(false);
    expect(needsResearch(gisLead({ source: "granola" }))).toBe(false);
    expect(needsResearch(gisLead({ source: "import" }))).toBe(false);
  });

  it("excludes a GIS household that already has a number", () => {
    expect(needsResearch(gisLead({ needsPhoneNumber: false }))).toBe(false);
  });

  it("excludes closed, won and do-not-contact households", () => {
    expect(needsResearch(gisLead({ stage: "Closed", closedReason: "unreachable" }))).toBe(false);
    expect(needsResearch(gisLead({ stage: "Won" }))).toBe(false);
    expect(needsResearch(gisLead({ doNotContact: true }))).toBe(false);
  });

  it("ignores unrelated prospects entirely", () => {
    const ordinary = blankProspect({ name: "Dana Reed", source: "manual", phone: "(616) 555-0100" });
    expect(needsResearch(ordinary)).toBe(false);
  });
});

describe("buildResearchQueue", () => {
  it("puts the newest batch above older ones", () => {
    const queue = buildResearchQueue([
      gisLead({ id: "old", name: "Older", createdAt: "2026-08-11" }),
      gisLead({ id: "new", name: "Newer", createdAt: "2026-08-18" }),
      gisLead({ id: "mid", name: "Middle", createdAt: "2026-08-14" }),
    ]);
    expect(queue.map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  /** The list must not reshuffle underneath you while you work it. */
  it("is stable for records created on the same day", () => {
    const sameDay = [
      gisLead({ id: "c", name: "Carter" }),
      gisLead({ id: "a", name: "Ames" }),
      gisLead({ id: "b", name: "Brooks" }),
    ];
    const first = buildResearchQueue(sameDay).map((p) => p.id);
    const again = buildResearchQueue([...sameDay].reverse()).map((p) => p.id);
    expect(first).toEqual(again);
    expect(first).toEqual(["a", "b", "c"]);
  });

  it("leaves out everything that does not qualify", () => {
    const queue = buildResearchQueue([
      gisLead({ id: "keep" }),
      gisLead({ id: "done", needsPhoneNumber: false }),
      gisLead({ id: "shut", stage: "Closed" }),
      blankProspect({ id: "other", source: "manual" }),
    ]);
    expect(queue.map((p) => p.id)).toEqual(["keep"]);
  });

  it("counts what it queues", () => {
    const list = [gisLead({ id: "1" }), gisLead({ id: "2" }), gisLead({ id: "3", stage: "Closed" })];
    expect(researchCount(list)).toBe(2);
    expect(researchCount([])).toBe(0);
  });
});

describe("researchedPatch", () => {
  it("stores the number in the existing household phone field, formatted", () => {
    const patch = researchedPatch("6165550142", "", "2026-08-18")!;
    expect(patch.phone).toBe("(616) 555-0142");
    expect(patch.needsPhoneNumber).toBe(false);
    expect(patch.updatedAt).toBe("2026-08-18");
  });

  it("accepts the shapes a number gets pasted in", () => {
    for (const raw of ["616-555-0142", "(616) 555-0142", "+1 616 555 0142", "1-616-555-0142"]) {
      expect(researchedPatch(raw, "", "2026-08-18")?.phone).toBe("(616) 555-0142");
    }
  });

  /** A half-typed number must not clear the flag and queue an undialable household. */
  it("refuses anything that is not dialable", () => {
    for (const raw of ["", "616555", "abc", "555-0142"]) {
      expect(researchedPatch(raw, "", "2026-08-18")).toBeNull();
    }
  });

  it("takes an email only when one was typed", () => {
    expect(researchedPatch("6165550142", "", "2026-08-18")).not.toHaveProperty("email");
    expect(researchedPatch("6165550142", " a@b.com ", "2026-08-18")?.email).toBe("a@b.com");
  });

  it("never touches the parcel number the upstream ledger depends on", () => {
    const patch = researchedPatch("6165550142", "", "2026-08-18")!;
    expect(patch).not.toHaveProperty("parcelId");
    expect(patch).not.toHaveProperty("id");
  });
});

describe("researching a household end to end", () => {
  it("removes it from the queue and hands it to the calling engine", () => {
    const lead = gisLead();

    // Before: waiting on research, and held out of the call queue.
    expect(needsResearch(lead)).toBe(true);
    expect(eligibilityOf(lead, [], [], "2026-08-18").eligible).toBe(false);
    expect(eligibilityOf(lead, [], [], "2026-08-18").reason).toBe("bad-number");

    const researched = { ...lead, ...researchedPatch("616-555-0142", "", "2026-08-18")! };

    // After: gone from the queue, and callable.
    expect(needsResearch(researched)).toBe(false);
    expect(buildResearchQueue([researched])).toHaveLength(0);
    expect(eligibilityOf(researched, [], [], "2026-08-18").eligible).toBe(true);
    expect(researched.phone).toBe("(616) 555-0142");
  });

  it("survives a save and reload through the normalizer", () => {
    const researched = { ...gisLead(), ...researchedPatch("6165550142", "z@x.com", "2026-08-18")! };
    const reloaded = normalizeProspect(JSON.parse(JSON.stringify(researched)));
    expect(reloaded.phone).toBe("(616) 555-0142");
    expect(reloaded.email).toBe("z@x.com");
    expect(reloaded.needsPhoneNumber).toBe(false);
    expect(reloaded.parcelId).toBe("41-15-01-100-005");
    expect(needsResearch(reloaded)).toBe(false);
  });
});

describe("unreachablePatch", () => {
  it("closes the household with an existing reason rather than deleting it", () => {
    const patch = unreachablePatch("2026-08-18");
    expect(patch.stage).toBe("Closed");
    expect(patch.closedReason).toBe("unreachable");
    // Marked as your decision, so a later rule replay cannot move it back.
    expect(patch.stageSource).toBe("manual");
  });

  it("takes it out of the queue but keeps the record and its parcel", () => {
    const skipped = { ...gisLead(), ...unreachablePatch("2026-08-18") };
    expect(needsResearch(skipped)).toBe(false);
    expect(skipped.parcelId).toBe("41-15-01-100-005");
    expect(skipped.name).toBe("Hefferan David J & Meggan S");
  });

  it("does not make a closed household callable", () => {
    const skipped = { ...gisLead(), ...unreachablePatch("2026-08-18") };
    expect(eligibilityOf(skipped, [], [], "2026-08-18").eligible).toBe(false);
  });
});

describe("the morning surfaces", () => {
  const input = (prospects: Prospect[]) => ({
    prospects,
    calls: [],
    tasks: [],
    opportunities: [],
    reviews: [],
    today: "2026-08-18",
    yesterday: "2026-08-17",
    now: new Date("2026-08-18T08:00:00"),
  });

  it("mentions the backlog in the daily brief", () => {
    const brief = buildDailyBrief(input([gisLead({ id: "1" }), gisLead({ id: "2" })]));
    expect(brief.focus.some((f) => f.includes("2 new properties need a phone number"))).toBe(true);
  });

  it("says nothing about research when there is none", () => {
    const brief = buildDailyBrief(input([blankProspect({ source: "manual" })]));
    expect(brief.focus.some((f) => f.toLowerCase().includes("phone number"))).toBe(false);
  });

  it("uses singular wording for one property", () => {
    const brief = buildDailyBrief(input([gisLead()]));
    expect(brief.focus.some((f) => f.includes("1 new property needs a phone number"))).toBe(true);
  });

  it("raises it in What Needs Me", () => {
    const items = whatNeedsMe(input([gisLead({ id: "1" }), gisLead({ id: "2" })]));
    const research = items.find((i) => i.kind === "needs-research");
    expect(research?.title).toContain("2 properties");
    expect(research?.target).toBe("prospects");
  });

  it("stays off What Needs Me when the queue is empty", () => {
    const items = whatNeedsMe(input([blankProspect({ source: "manual" })]));
    expect(items.some((i) => i.kind === "needs-research")).toBe(false);
  });
});

describe("phone formatting", () => {
  it("is the same rule everywhere", () => {
    expect(formatPhone("616.555.0142")).toBe("(616) 555-0142");
    expect(isValidPhone("616.555.0142")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(formatPhone("")).toBe("");
  });
});
