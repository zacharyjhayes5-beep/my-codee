/**
 * Everything tunable about ingestion, in one place.
 *
 * Batch size is deliberately two values rather than one. The spec requires the
 * whole path to be proved with three leads before it is allowed to surface 25,
 * so the size is chosen by BATCH_MODE at run time instead of being edited and
 * redeployed.
 */

export const GIS_LAYER_URL =
  "https://gis.kentcountymi.gov/agisprod/rest/services/ParcelsWithCondos/MapServer/0/query";

/** Residential improved. Both GIS fields are strings, so the value is quoted. */
export const PROPERTY_CLASS = "401";

export interface Municipality {
  /** GOVERNMENTALUNIT code in the GIS layer. */
  unit: string;
  name: string;
  /** How many of a full 25-lead batch should come from here. */
  target: number;
  /** How many of a 3-lead development batch. */
  devTarget: number;
}

export const MUNICIPALITIES: Municipality[] = [
  { unit: "11", name: "Ada Township", target: 9, devTarget: 1 },
  { unit: "18", name: "Cascade Township", target: 8, devTarget: 1 },
  { unit: "44", name: "East Grand Rapids", target: 8, devTarget: 1 },
];

export const UNIT_CODES = MUNICIPALITIES.map((m) => m.unit);

/** GIS returns at most 1000 features per request and supports paging. */
export const PAGE_SIZE = 1000;

/** A guard against an unbounded loop if the service misreports paging. */
export const MAX_PAGES = 60;

export type BatchMode = "dev" | "full";

export function targetsFor(mode: BatchMode): { unit: string; target: number }[] {
  return MUNICIPALITIES.map((m) => ({
    unit: m.unit,
    target: mode === "dev" ? m.devTarget : m.target,
  }));
}

export function batchSize(mode: BatchMode): number {
  return targetsFor(mode).reduce((sum, t) => sum + t.target, 0);
}

export function municipalityName(unit: string): string {
  return MUNICIPALITIES.find((m) => m.unit === unit)?.name ?? unit;
}
