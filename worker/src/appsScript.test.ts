import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Tests the Apps Script that is actually committed.
 *
 * The file is loaded and evaluated rather than reimplemented here, so these
 * cover the real logic that will be pasted into the spreadsheet — the pure
 * parts, which is where deduplication and the no-overwrite rule live. The
 * Google APIs are only referenced inside doPost/writeRow and are not touched.
 */

interface Script {
  parcelKey(v: unknown): string;
  normalizeHeader(v: unknown): string;
  mapColumns(header: unknown[]): Record<string, number>;
  findParcelColumn(header: unknown[]): number;
  findParcelRow(rows: unknown[][], parcelColumn: number, parcel: unknown): number;
  buildRowValues(
    existing: unknown[] | null,
    columnMap: Record<string, number>,
    row: Record<string, unknown>,
    width: number,
  ): unknown[];
  secretMatches(supplied: unknown, expected: unknown): boolean;
  COLUMNS: { key: string; header: string }[];
}

let script: Script;

beforeAll(() => {
  const source = readFileSync(join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
  const context: Record<string, unknown> = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  script = context as unknown as Script;
});

const HEADER = [
  "Date Added",
  "Owner Name",
  "Property Address",
  "Property City",
  "Mailing Address",
  "Mailing City",
  "Municipality",
  "Parcel Number",
  "Source",
  "Phone",
  "Email",
  "Last Updated",
];

describe("parcelKey", () => {
  /** The same parcel however the sheet has mangled it. */
  it("compares on digits, so formatting cannot split one parcel into two", () => {
    const canonical = script.parcelKey("41-15-01-100-005");
    expect(script.parcelKey(" 41-15-01-100-005 ")).toBe(canonical);
    expect(script.parcelKey("41 15 01 100 005")).toBe(canonical);
    expect(script.parcelKey("4115011000 05")).toBe(canonical);
  });

  it("treats blanks as no parcel", () => {
    expect(script.parcelKey("")).toBe("");
    expect(script.parcelKey(null)).toBe("");
    expect(script.parcelKey(undefined)).toBe("");
  });
});

describe("header handling", () => {
  it("maps every maintained column to its position", () => {
    const map = script.mapColumns(HEADER);
    expect(map.parcelNumber).toBe(7);
    expect(map.ownerName).toBe(1);
    expect(map.lastUpdated).toBe(11);
  });

  /** An existing sheet is matched by name, never by position. */
  it("follows an existing sheet's column order rather than imposing one", () => {
    const reordered = ["Parcel Number", "Owner Name", "Date Added"];
    const map = script.mapColumns(reordered);
    expect(map.parcelNumber).toBe(0);
    expect(map.ownerName).toBe(1);
    expect(map.dateAdded).toBe(2);
    // Columns the sheet does not have are simply absent.
    expect(map.municipality).toBe(-1);
  });

  it("is not confused by case or padding in existing headers", () => {
    expect(script.mapColumns(["  PARCEL NUMBER  "]).parcelNumber).toBe(0);
  });

  it("recognises the names an existing sheet might use for the parcel", () => {
    for (const name of ["Parcel Number", "Parcel", "PNUM", "Parcel #", "parcel no"]) {
      expect(script.findParcelColumn([name])).toBe(0);
    }
  });

  it("reports no parcel column rather than guessing one", () => {
    expect(script.findParcelColumn(["Name", "Address"])).toBe(-1);
  });
});

describe("finding an existing parcel", () => {
  const rows = [
    ["2026-08-18", "A OWNER", "", "", "", "", "", "41-15-01-100-005"],
    ["2026-08-18", "B OWNER", "", "", "", "", "", "41-19-01-300-009"],
  ];

  it("finds a parcel already in the sheet", () => {
    expect(script.findParcelRow(rows, 7, "41-19-01-300-009")).toBe(1);
  });

  it("finds it despite different formatting", () => {
    expect(script.findParcelRow(rows, 7, "41 15 01 100 005")).toBe(0);
  });

  it("reports a new parcel as absent", () => {
    expect(script.findParcelRow(rows, 7, "41-14-27-376-003")).toBe(-1);
  });

  it("treats an empty sheet as all-new", () => {
    expect(script.findParcelRow([], 7, "41-15-01-100-005")).toBe(-1);
  });

  it("refuses to match when there is no parcel to match on", () => {
    expect(script.findParcelRow(rows, 7, "")).toBe(-1);
    expect(script.findParcelRow(rows, -1, "41-15-01-100-005")).toBe(-1);
  });
});

describe("buildRowValues", () => {
  it("fills a new row from the payload", () => {
    const columnMap = script.mapColumns(HEADER);
    const values = script.buildRowValues(null, columnMap, { ownerName: "NEW OWNER", parcelNumber: "41-1" }, HEADER.length);
    expect(values[1]).toBe("NEW OWNER");
    expect(values[7]).toBe("41-1");
    expect(values).toHaveLength(HEADER.length);
  });

  it("updates only the columns it maintains", () => {
    const columnMap = script.mapColumns(HEADER);
    const existing = new Array(HEADER.length).fill("");
    existing[1] = "OLD OWNER";
    const values = script.buildRowValues(existing, columnMap, { ownerName: "NEW OWNER" }, HEADER.length);
    expect(values[1]).toBe("NEW OWNER");
  });

  /**
   * The Worker always sends blank phone and email, because the county has
   * neither. That must never wipe a number somebody typed into the sheet.
   */
  it("never overwrites an existing value with a blank", () => {
    const columnMap = script.mapColumns(HEADER);
    const existing = new Array(HEADER.length).fill("");
    existing[9] = "(616) 555-0142";
    existing[10] = "someone@example.com";

    const values = script.buildRowValues(
      existing,
      columnMap,
      { ownerName: "OWNER", phone: "", email: "" },
      HEADER.length,
    );

    expect(values[9]).toBe("(616) 555-0142");
    expect(values[10]).toBe("someone@example.com");
  });

  it("preserves columns the sheet has that this script knows nothing about", () => {
    const withExtra = [...HEADER, "My Own Notes"];
    const columnMap = script.mapColumns(withExtra);
    const existing = new Array(withExtra.length).fill("");
    existing[12] = "called them Tuesday";

    const values = script.buildRowValues(existing, columnMap, { ownerName: "OWNER" }, withExtra.length);

    expect(values[12]).toBe("called them Tuesday");
  });

  it("ignores payload fields the sheet has no column for", () => {
    const narrow = ["Parcel Number"];
    const columnMap = script.mapColumns(narrow);
    const values = script.buildRowValues(null, columnMap, { ownerName: "X", parcelNumber: "41-1" }, 1);
    expect(values).toEqual(["41-1"]);
  });

  /** Sending the same row twice must produce the same row. */
  it("is idempotent for a repeated identical payload", () => {
    const columnMap = script.mapColumns(HEADER);
    const payload = { ownerName: "OWNER", parcelNumber: "41-1", lastUpdated: "2026-08-19" };
    const first = script.buildRowValues(null, columnMap, payload, HEADER.length);
    const second = script.buildRowValues(first, columnMap, payload, HEADER.length);
    expect(second).toEqual(first);
  });

  it("applies an ownership change to the same row rather than a new one", () => {
    const columnMap = script.mapColumns(HEADER);
    const existing = script.buildRowValues(
      null,
      columnMap,
      { ownerName: "OLD OWNER", parcelNumber: "41-1", lastUpdated: "2026-01-05" },
      HEADER.length,
    );
    const updated = script.buildRowValues(
      existing,
      columnMap,
      { ownerName: "NEW OWNER", parcelNumber: "41-1", lastUpdated: "2026-08-19" },
      HEADER.length,
    );

    expect(updated[1]).toBe("NEW OWNER");
    expect(updated[7]).toBe("41-1");
    expect(updated[11]).toBe("2026-08-19");
  });
});

describe("secretMatches", () => {
  it("accepts the configured secret and nothing else", () => {
    expect(script.secretMatches("abc123", "abc123")).toBe(true);
    expect(script.secretMatches("abc124", "abc123")).toBe(false);
    expect(script.secretMatches("abc", "abc123")).toBe(false);
  });

  /** An unconfigured script must reject everything, including empty. */
  it("rejects when nothing is configured", () => {
    expect(script.secretMatches("", "")).toBe(false);
    expect(script.secretMatches("anything", "")).toBe(false);
    expect(script.secretMatches("", null)).toBe(false);
  });
});

describe("the committed script itself", () => {
  it("contains no hard-coded secret", () => {
    const source = readFileSync(join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
    expect(source).toContain("PropertiesService.getScriptProperties()");
    // The only place a secret may come from is Script Properties.
    expect(source).not.toMatch(/WEBHOOK_SECRET\s*=\s*["'][^"']{6,}["']/);
  });

  it("writes only to the BSA Leads tab", () => {
    const source = readFileSync(join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
    expect(source).toContain('var SHEET_NAME = "BSA Leads"');
  });

  /** Nothing in this integration may remove a row somebody is relying on. */
  it("never deletes rows or sheets", () => {
    const source = readFileSync(join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
    for (const forbidden of ["deleteRow", "deleteRows", "deleteSheet", "clearContents", "clear("]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
