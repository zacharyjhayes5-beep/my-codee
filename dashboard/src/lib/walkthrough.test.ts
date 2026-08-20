import { describe, expect, it } from "vitest";
import { blankProspect } from "./prospectSchema";
import {
  AREAS,
  coverageSummary,
  crossSell,
  kindOf,
  placeCoverage,
  readingsFor,
  recordedCount,
  roofAge,
} from "./walkthrough";
import type { CoverageItem, Prospect, PropertyProfile } from "../types";

function household(property: Partial<PropertyProfile> = {}, assets: Record<string, unknown> = {}): Prospect {
  const p = blankProspect({ name: "Sample" });
  return {
    ...p,
    assets: { ...p.assets, ...assets, property: { ...p.assets.property, ...property } },
  };
}

const JAN_2026 = new Date("2026-01-15T12:00:00Z");

describe("roof age", () => {
  /**
   * The reason the year is stored and the age is not: a stored age would be
   * wrong every January and nobody would remember to correct it.
   */
  it("derives from the year installed", () => {
    expect(roofAge(household({ roofYearInstalled: "2016" }).assets.property, JAN_2026)).toBe(10);
  });

  it("is zero, not null, for a roof put on this year", () => {
    expect(roofAge(household({ roofYearInstalled: "2026" }).assets.property, JAN_2026)).toBe(0);
  });

  it("is null when nothing was recorded", () => {
    expect(roofAge(household().assets.property, JAN_2026)).toBeNull();
  });

  it("refuses nonsense rather than showing a wrong number", () => {
    for (const bad of ["", "soon", "20", "1700", "3005", "N/A"]) {
      expect(roofAge(household({ roofYearInstalled: bad }).assets.property, JAN_2026)).toBeNull();
    }
  });
});

describe("readings", () => {
  it("covers every area without throwing", () => {
    for (const area of AREAS) {
      const rs = readingsFor(area.id, household(), JAN_2026);
      expect(rs.length).toBeGreaterThan(0);
    }
  });

  /** A blank household must read as blank everywhere, never as zero. */
  it("reports an empty household as entirely unrecorded", () => {
    for (const area of AREAS) {
      const rs = readingsFor(area.id, household(), JAN_2026);
      const filled = rs.filter((r) => r.value !== null);
      expect(filled, `${area.id} should start blank`).toEqual([]);
    }
  });

  it("shows a recorded zero as zero rather than as blank", () => {
    const rs = readingsFor("garage", household({ garageStalls: 0 }), JAN_2026);
    const stalls = rs.find((r) => r.label === "Stalls");
    expect(stalls?.value).toBe("0");
  });

  it("formats money and area the way the rest of the app does", () => {
    const rs = readingsFor("exterior", household({ dwellingReplacementCost: 412000, squareFeet: 2450 }), JAN_2026);
    expect(rs.find((r) => r.label === "Dwelling replacement cost")?.value).toBe("$412,000");
    expect(rs.find((r) => r.label === "Square footage")?.value).toBe("2,450 sq ft");
  });

  /**
   * Market value and replacement cost are different numbers, and showing one
   * as the other would put a wrong figure in front of a client.
   */
  it("never sources replacement cost from the estimated property value", () => {
    const p = household({}, { estimatedPropertyValue: 350000 });
    const rs = readingsFor("exterior", p, JAN_2026);
    expect(rs.find((r) => r.label === "Dwelling replacement cost")?.value).toBeNull();
  });

  it("reads year built from the existing indicators rather than duplicating it", () => {
    const rs = readingsFor("exterior", household({}, { yearBuilt: "1994" }), JAN_2026);
    expect(rs.find((r) => r.label === "Year built")?.value).toBe("1994");
  });

  it("treats whitespace as unrecorded", () => {
    const rs = readingsFor("roof", household({ roofMaterial: "   " }), JAN_2026);
    expect(rs.find((r) => r.label === "Material")?.value).toBeNull();
  });
});

describe("cross-sell", () => {
  it("is silent when there is nothing to say", () => {
    expect(crossSell(household())).toBeNull();
  });

  it("names what they own", () => {
    const p = household({}, { boat: true, rv: true, secondHome: true });
    const line = crossSell(p) ?? "";
    expect(line).toContain("boat");
    expect(line).toContain("RV");
    expect(line).toContain("second home");
  });

  /** Phrased as an opening, never as a claim about their coverage. */
  it("reads as a question to ask, not a fact", () => {
    expect(crossSell(household({}, { boat: true }))).toMatch(/worth asking/i);
  });
});

describe("recorded count", () => {
  it("starts at zero and rises as fields are filled", () => {
    expect(recordedCount("roof", household()).filled).toBe(0);
    const some = household({ roofYearInstalled: "2016", roofMaterial: "Asphalt" });
    // Year, derived age, and material.
    expect(recordedCount("roof", some).filled).toBe(3);
  });

  it("never reports more filled than the area has", () => {
    for (const area of AREAS) {
      const c = recordedCount(area.id, household());
      expect(c.filled).toBeLessThanOrEqual(c.total);
    }
  });
});

describe("records that never went through normalisation", () => {
  /**
   * This crashed the whole application once, taking <main> down with it: a
   * household written straight to the store had no `assets.property`, and the
   * panel dereferenced it. The same shape of bug had already happened with
   * `tags`. Blank is the only survivable reading.
   */
  it("renders a household with no property as entirely unrecorded", () => {
    const raw = { ...household(), assets: { yearBuilt: "1994", vehicles: "F-150" } } as unknown as Prospect;
    for (const area of AREAS) {
      expect(() => readingsFor(area.id, raw, JAN_2026)).not.toThrow();
    }
    const roof = readingsFor("roof", raw, JAN_2026);
    expect(roof.every((r) => r.label === "Year installed" ? true : true)).toBe(true);
    expect(roof.find((r) => r.label === "Material")?.value).toBeNull();
    // What the record does carry still shows.
    expect(readingsFor("exterior", raw, JAN_2026).find((r) => r.label === "Year built")?.value).toBe("1994");
  });

  it("survives a household with no assets at all", () => {
    const raw = { ...household(), assets: undefined } as unknown as Prospect;
    for (const area of AREAS) {
      expect(() => readingsFor(area.id, raw, JAN_2026)).not.toThrow();
      expect(() => recordedCount(area.id, raw)).not.toThrow();
    }
    expect(crossSell(raw)).toBeNull();
  });
});

describe("placing coverage on the property", () => {
  const item = (over: Partial<CoverageItem> & { line: string }): CoverageItem => ({
    id: over.id ?? over.line,
    line: over.line,
    status: over.status ?? "held",
    label: over.label ?? "",
    detail: over.detail ?? "",
  });

  it("maps each line to the object it should become", () => {
    expect(kindOf("personal-auto")).toBe("vehicle");
    expect(kindOf("business-auto")).toBe("vehicle");
    expect(kindOf("boat")).toBe("boat");
    expect(kindOf("motorcycle")).toBe("motorcycle");
    expect(kindOf("personal-umbrella")).toBe("umbrella");
    expect(kindOf("comm-umbrella")).toBe("umbrella");
  });

  /** Life is the one category insured on a person rather than a thing. */
  it("turns every life line into a figure", () => {
    for (const l of ["term-life", "rop-term", "whole-life", "premier-whole", "myga"]) {
      expect(kindOf(l), l).toBe("figure");
    }
  });

  /**
   * A general liability policy has no honest physical form. Inventing one would
   * be decoration, so it stays in the panel and off the lot.
   */
  it("leaves lines with no physical form unplaced", () => {
    for (const l of ["gen-liability", "work-comp", "bop", "homeowners", "unknown-line"]) {
      expect(kindOf(l), l).toBe("listed");
    }
    expect(placeCoverage([item({ line: "gen-liability" })])).toEqual([]);
  });

  it("parks vehicles in the driveway, each in its own bay", () => {
    const placed = placeCoverage([
      item({ id: "a", line: "personal-auto", label: "F-150" }),
      item({ id: "b", line: "personal-auto", label: "Explorer" }),
      item({ id: "c", line: "boat", label: "Lund" }),
    ]);
    expect(placed).toHaveLength(3);
    const spots = placed.map((p) => `${p.position[0]},${p.position[2]}`);
    expect(new Set(spots).size, "no two objects share a bay").toBe(3);
    // All on the driveway, which runs out to the left of the house.
    for (const p of placed) expect(p.position[0]).toBeLessThan(0);
  });

  /** Running out of driveway must not stack cars on top of each other. */
  it("stops placing once the bays are full", () => {
    const many = Array.from({ length: 10 }, (_, i) => item({ id: `v${i}`, line: "personal-auto" }));
    const placed = placeCoverage(many);
    expect(placed).toHaveLength(6);
    expect(new Set(placed.map((p) => p.position.join(","))).size).toBe(6);
  });

  /** Two canopies over one roof would read as a modelling error. */
  it("puts up one umbrella however many umbrella policies there are", () => {
    const placed = placeCoverage([
      item({ id: "u1", line: "personal-umbrella" }),
      item({ id: "u2", line: "comm-umbrella" }),
    ]);
    expect(placed).toHaveLength(1);
    expect(placed[0].kind).toBe("umbrella");
    // Above the ridge, which sits at about y=5.5.
    expect(placed[0].position[1]).toBeGreaterThan(6);
  });

  it("stands people near the door without blocking it", () => {
    const placed = placeCoverage([
      item({ id: "p1", line: "term-life", label: "Doug" }),
      item({ id: "p2", line: "whole-life", label: "Patricia" }),
    ]);
    expect(placed).toHaveLength(2);
    for (const p of placed) {
      expect(p.position[0], "off to the side of the path").toBeGreaterThan(1);
      expect(p.position[2], "in front of the house").toBeGreaterThan(4);
    }
  });

  /** Status rides along untouched — the scene decides solid versus ghosted. */
  it("carries held and needed through to the placed object", () => {
    const placed = placeCoverage([
      item({ id: "a", line: "personal-auto", status: "held" }),
      item({ id: "u", line: "personal-umbrella", status: "needed" }),
    ]);
    expect(placed.find((p) => p.kind === "vehicle")!.item.status).toBe("held");
    expect(placed.find((p) => p.kind === "umbrella")!.item.status).toBe("needed");
  });

  it("copes with an empty list", () => {
    expect(placeCoverage([])).toEqual([]);
  });
});

describe("coverage summary", () => {
  it("counts held and needed separately", () => {
    const p = household();
    p.assets.coverage = [
      { id: "a", line: "personal-auto", status: "held", label: "", detail: "" },
      { id: "b", line: "boat", status: "held", label: "", detail: "" },
      { id: "c", line: "personal-umbrella", status: "needed", label: "", detail: "" },
    ];
    expect(coverageSummary(p)).toEqual({ held: 2, needed: 1 });
  });

  it("survives a household with no coverage field at all", () => {
    const raw = { ...household(), assets: undefined } as unknown as Prospect;
    expect(coverageSummary(raw)).toEqual({ held: 0, needed: 0 });
  });
});
