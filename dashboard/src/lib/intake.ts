import type { Prospect } from "../types";
import { blankProspect } from "./prospectSchema";
import { newId, today } from "./storage";

/**
 * Lead intake. Every lane — quick add, bulk import, researched lists — lands
 * in the same prospect table. There is deliberately no second database for
 * "online leads".
 */

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Minimal RFC-4180 reader: quoted fields, embedded commas, doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim()));
}

/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */

/** Fields an import can fill. Anything else in the file is ignored. */
export const IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "name",
  "phone",
  "email",
  "line1",
  "city",
  "state",
  "zip",
  "leadSource",
  "whyTheyFit",
  "importantNotes",
  "parcelId",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  firstName: "First name",
  lastName: "Last name",
  name: "Household name",
  phone: "Phone",
  email: "Email",
  line1: "Street address",
  city: "City",
  state: "State",
  zip: "ZIP",
  leadSource: "Lead source",
  whyTheyFit: "Why they fit",
  importantNotes: "Important notes",
  parcelId: "Parcel number",
};

/** Header spellings seen in the wild, so the first guess is usually right. */
const HEADER_HINTS: Record<ImportField, string[]> = {
  firstName: ["first name", "first", "firstname", "fname", "owner first"],
  lastName: ["last name", "last", "lastname", "lname", "surname", "owner last"],
  name: ["name", "household", "full name", "owner", "owner name", "contact"],
  phone: ["phone", "telephone", "mobile", "cell", "phone number", "primary phone"],
  email: ["email", "e-mail", "email address"],
  line1: ["address", "street", "address 1", "address1", "street address", "site address"],
  city: ["city", "town", "municipality"],
  state: ["state", "st", "province"],
  zip: ["zip", "zip code", "postal", "postal code", "zipcode"],
  leadSource: ["source", "lead source", "origin", "list"],
  whyTheyFit: ["why", "why they fit", "fit", "reason"],
  importantNotes: ["notes", "note", "comments", "important notes"],
  parcelId: ["parcel number", "parcel", "parcel id", "pnum", "permanent parcel number"],
};

/**
 * First guess at which column is which. Always shown for confirmation — a
 * wrong guess that nobody sees is how a phone column becomes a ZIP code.
 */
export function guessMapping(headers: string[]): Record<number, ImportField | ""> {
  const mapping: Record<number, ImportField | ""> = {};
  const taken = new Set<ImportField>();

  headers.forEach((header, index) => {
    const cleaned = header.toLowerCase().trim();
    let best: ImportField | "" = "";

    for (const field of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      const hints = HEADER_HINTS[field];
      if (hints.some((h) => cleaned === h)) {
        best = field;
        break;
      }
    }

    if (!best) {
      for (const field of IMPORT_FIELDS) {
        if (taken.has(field)) continue;
        if (HEADER_HINTS[field].some((h) => cleaned.includes(h))) {
          best = field;
          break;
        }
      }
    }

    if (best) taken.add(best);
    mapping[index] = best;
  });

  return mapping;
}

export interface MappedRow {
  index: number;
  values: Partial<Record<ImportField, string>>;
}

export function applyMapping(
  rows: string[][],
  mapping: Record<number, ImportField | "">,
  hasHeader: boolean,
): MappedRow[] {
  const body = hasHeader ? rows.slice(1) : rows;

  return body.map((cells, index) => {
    const values: Partial<Record<ImportField, string>> = {};
    cells.forEach((cell, column) => {
      const field = mapping[column];
      if (!field) return;
      const trimmed = cell.trim();
      if (trimmed) values[field] = trimmed;
    });
    return { index, values };
  });
}

/** A row with nothing to call and nobody to call is not a prospect. */
export function rowIsUsable(row: MappedRow): boolean {
  const v = row.values;
  const hasName = Boolean(v.firstName || v.lastName || v.name);
  const hasReach = Boolean(v.phone || v.email || v.line1);
  return hasName && hasReach;
}

/** Builds a household from a mapped row. Nothing is invented. */
export function prospectFromRow(row: MappedRow, defaultSource: string): Prospect {
  const v = row.values;
  const first = v.firstName ?? "";
  const last = v.lastName ?? "";
  const household = v.name ?? [first, last].filter(Boolean).join(" ");

  const contacts =
    first || last
      ? [
          {
            id: newId(),
            firstName: first,
            lastName: last,
            dob: "",
            phone: v.phone ?? "",
            email: v.email ?? "",
            isPrimary: true,
            quoteReadyNote: "",
            relationship: "",
            occupation: "",
            employer: "",
          },
        ]
      : [];

  const city = v.city ?? "";
  const state = v.state ?? "";

  return blankProspect({
    name: household || "Untitled household",
    firstName: first,
    lastName: last,
    phone: v.phone ?? "",
    email: v.email ?? "",
    address: { line1: v.line1 ?? "", city, state, zip: v.zip ?? "" },
    // The Lead Map clusters on this, so keep it filled where we can.
    area: city ? `${city}${state ? `, ${state}` : ""}` : "",
    leadSource: v.leadSource ?? defaultSource,
    whyTheyFit: v.whyTheyFit ?? "",
    importantNotes: v.importantNotes ?? "",
    contacts,
    /**
     * The county's permanent parcel number, when the file carries one.
     *
     * `runSync` deduplicates on this and nothing else, so an imported
     * household without it is invisible to the check and the next county
     * batch creates a second copy of the same address. Importing a GIS
     * export used to do exactly that.
     */
    parcelId: v.parcelId ?? "",
    source: "import",
    createdAt: today(),
    updatedAt: today(),
  });
}
