import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Tests the Apps Script that is actually committed, by loading and evaluating
 * it rather than reimplementing it. Only the pure helpers are exercised; the
 * Google APIs live in doPost and are not touched.
 */

interface Script {
  parcelKey(v: unknown): string;
  rowValues(row: Record<string, unknown>, existing: unknown[] | null): unknown[];
  secretMatches(supplied: unknown, expected: unknown): boolean;
  HEADERS: string[];
  KEYS: string[];
  PARCEL_COL: number;
}

const SOURCE = join(__dirname, "..", "apps-script", "Code.gs");
let script: Script;

beforeAll(() => {
  const context: Record<string, unknown> = {};
  vm.createContext(context);
  vm.runInContext(readFileSync(SOURCE, "utf8"), context);
  script = context as unknown as Script;
});

describe("column layout", () => {
  it("keeps headers and payload keys in step", () => {
    expect(script.HEADERS).toHaveLength(script.KEYS.length);
  });

  it("points PARCEL_COL at the parcel column", () => {
    expect(script.HEADERS[script.PARCEL_COL]).toBe("Parcel Number");
    expect(script.KEYS[script.PARCEL_COL]).toBe("parcelNumber");
  });
});

describe("parcelKey", () => {
  it("matches the same parcel however it is formatted", () => {
    const canonical = script.parcelKey("41-15-01-100-005");
    expect(script.parcelKey(" 41-15-01-100-005 ")).toBe(canonical);
    expect(script.parcelKey("41 15 01 100 005")).toBe(canonical);
  });

  it("distinguishes different parcels", () => {
    expect(script.parcelKey("41-15-01-100-005")).not.toBe(script.parcelKey("41-15-01-100-006"));
  });

  it("treats blanks as no parcel", () => {
    expect(script.parcelKey("")).toBe("");
    expect(script.parcelKey(null)).toBe("");
  });
});

describe("rowValues", () => {
  const full = {
    dateAdded: "2026-08-18",
    ownerName: "OWNER",
    propertyAddress: "1 SAMPLE ST",
    propertyCity: "ADA MI 49301",
    mailingAddress: "1 SAMPLE ST",
    mailingCity: "ADA 49301",
    municipality: "Ada Township",
    parcelNumber: "41-15-01-100-005",
    source: "Kent County GIS",
    phone: "",
    email: "",
    lastUpdated: "2026-08-19",
  };

  it("produces one value per column", () => {
    expect(script.rowValues(full, null)).toHaveLength(script.HEADERS.length);
  });

  it("puts the parcel in the parcel column", () => {
    expect(script.rowValues(full, null)[script.PARCEL_COL]).toBe("41-15-01-100-005");
  });

  /**
   * The Worker always sends blank phone and email, because the county has
   * neither. That must never wipe a number typed into the sheet by hand.
   */
  it("never overwrites an existing value with a blank", () => {
    const existing = script.rowValues(full, null) as string[];
    existing[9] = "(616) 555-0142";
    existing[10] = "someone@example.com";

    const updated = script.rowValues({ ...full, ownerName: "NEW OWNER" }, existing);

    expect(updated[9]).toBe("(616) 555-0142");
    expect(updated[10]).toBe("someone@example.com");
    expect(updated[1]).toBe("NEW OWNER");
  });

  it("is idempotent for a repeated identical payload", () => {
    const first = script.rowValues(full, null);
    expect(script.rowValues(full, first)).toEqual(first);
  });

  it("applies an ownership change to the same row", () => {
    const before = script.rowValues(full, null);
    const after = script.rowValues({ ...full, ownerName: "SOLD TO" }, before);
    expect(after[1]).toBe("SOLD TO");
    expect(after[script.PARCEL_COL]).toBe("41-15-01-100-005");
  });

  it("treats missing fields as blank rather than undefined", () => {
    expect(script.rowValues({ parcelNumber: "41-1" }, null)[1]).toBe("");
  });
});

describe("secretMatches", () => {
  it("accepts the configured secret and nothing else", () => {
    expect(script.secretMatches("abc123", "abc123")).toBe(true);
    expect(script.secretMatches("abc124", "abc123")).toBe(false);
    expect(script.secretMatches("abc", "abc123")).toBe(false);
  });

  it("rejects everything when nothing is configured", () => {
    expect(script.secretMatches("", "")).toBe(false);
    expect(script.secretMatches("anything", "")).toBe(false);
  });
});

describe("the committed script", () => {
  const source = () => readFileSync(SOURCE, "utf8");

  it("holds no hard-coded secret", () => {
    expect(source()).toContain("PropertiesService.getScriptProperties()");
    expect(source()).not.toMatch(/WEBHOOK_SECRET\s*=\s*["'][^"']{6,}["']/);
  });

  it("writes only to the GIS Leads tab", () => {
    expect(source()).toContain('var SHEET_NAME = "GIS Leads"');
  });

  it("never deletes rows or sheets", () => {
    for (const forbidden of ["deleteRow", "deleteColumn", "deleteSheet", "clearContents", "clear("]) {
      expect(source()).not.toContain(forbidden);
    }
  });
});
