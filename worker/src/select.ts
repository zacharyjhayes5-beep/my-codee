/**
 * Choosing which eligible parcels become this run's leads.
 *
 * The batch is quota'd by municipality (9/8/8, or 1/1/1 in development). When
 * one municipality cannot fill its quota the remainder is redistributed to the
 * others, so a batch is always full if there is any eligible work anywhere.
 */

import type { BatchMode } from "./config";
import { targetsFor } from "./config";

/**
 * The minimum a row needs for selection. Deliberately without an index
 * signature, so richer record types satisfy it structurally.
 */
export interface Eligible {
  pnum: string;
  govtUnit: string;
  reason: "new-parcel" | "owner-change";
}

/**
 * Take up to the quota from each municipality, then fill any shortfall from
 * whatever is left over, in municipality order.
 *
 * Owner changes are taken before brand-new parcels: a house that has just
 * changed hands is a better call than one that has sat with the same owner for
 * twenty years, and there are far fewer of them.
 */
export function selectBatch<T extends Eligible>(eligible: T[], mode: BatchMode): T[] {
  const targets = targetsFor(mode);

  const byUnit = new Map<string, T[]>();
  for (const { unit } of targets) byUnit.set(unit, []);
  for (const row of eligible) {
    const bucket = byUnit.get(row.govtUnit);
    if (bucket) bucket.push(row);
  }

  for (const bucket of byUnit.values()) {
    bucket.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === "owner-change" ? -1 : 1;
      return a.pnum.localeCompare(b.pnum);
    });
  }

  const picked: T[] = [];
  const taken = new Map<string, number>();

  // First pass: each municipality takes its own quota.
  for (const { unit, target } of targets) {
    const bucket = byUnit.get(unit) ?? [];
    const take = bucket.slice(0, target);
    picked.push(...take);
    taken.set(unit, take.length);
  }

  // Second pass: redistribute whatever the first pass could not fill.
  const wanted = targets.reduce((sum, t) => sum + t.target, 0);
  let shortfall = wanted - picked.length;

  for (const { unit } of targets) {
    if (shortfall <= 0) break;
    const bucket = byUnit.get(unit) ?? [];
    const already = taken.get(unit) ?? 0;
    const extra = bucket.slice(already, already + shortfall);
    picked.push(...extra);
    taken.set(unit, already + extra.length);
    shortfall -= extra.length;
  }

  return picked;
}
