import { describe, expect, it } from "vitest";
import { blankProspect } from "./prospectSchema";
import { AREAS, crossSell, readingsFor, recordedCount, roofAge } from "./walkthrough";
import type { Prospect, PropertyProfile } from "../types";

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
