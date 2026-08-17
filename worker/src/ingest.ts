/**
 * One ingestion run, start to finish.
 *
 * Order matters and is the safety property: the entire GIS scan completes
 * before a single row is written. If the fetch throws, the run is recorded as
 * an error and the ledger is untouched — no parcel is marked processed, no
 * partial batch is inserted, and tomorrow's run sees exactly what today's saw.
 */

import type { BatchMode } from "./config";
import { batchSize } from "./config";
import { classifyOwner } from "./entities";
import { fetchAllParcels, type Fetcher } from "./gis";
import { leadId, toParcelRecord } from "./normalize";
import { selectBatch } from "./select";
import {
  commitRun,
  failRun,
  loadKnownParcels,
  startRun,
  type RunCounts,
  type SelectedLead,
} from "./store";

export interface IngestResult extends RunCounts {
  runId: number;
  status: "ok" | "error";
  error?: string;
}

export async function runIngestion(
  db: D1Database,
  mode: BatchMode,
  trigger: string,
  fetcher: Fetcher = fetch,
): Promise<IngestResult> {
  const runId = await startRun(db, trigger);
  const counts: RunCounts = {
    scanned: 0,
    excludedEntities: 0,
    alreadySeen: 0,
    ownerChanges: 0,
    eligible: 0,
    selected: 0,
    inserted: 0,
  };

  try {
    // 1. Read everything first. Nothing is written until this returns.
    const raw = await fetchAllParcels(fetcher);
    counts.scanned = raw.length;

    // 2. The ledger, for deduplication and change detection.
    const known = await loadKnownParcels(db);

    // 3. Classify.
    //
    // The live layer returns roughly 92 rows whose PNUM repeats — condominium
    // records sharing a parent parcel. The parcel number is the permanent key,
    // so the first row for a parcel wins and the rest are ignored; without
    // this, one property could yield two leads in a single batch.
    const seenThisScan = new Set<string>();
    const eligible: SelectedLead[] = [];
    for (const attrs of raw) {
      const parcel = toParcelRecord(attrs);
      if (!parcel) continue;

      if (seenThisScan.has(parcel.pnum)) continue;
      seenThisScan.add(parcel.pnum);

      if (classifyOwner(parcel.ownerRaw).isEntity) {
        counts.excludedEntities++;
        continue;
      }

      const previousOwner = known.get(parcel.pnum);

      if (previousOwner === undefined) {
        eligible.push({
          ...parcel,
          id: leadId(parcel.pnum, parcel.ownerNormalized),
          reason: "new-parcel",
        });
        continue;
      }

      if (previousOwner !== parcel.ownerNormalized) {
        counts.ownerChanges++;
        eligible.push({
          ...parcel,
          id: leadId(parcel.pnum, parcel.ownerNormalized),
          reason: "owner-change",
        });
        continue;
      }

      // Seen before, same owner. Nothing to do.
      counts.alreadySeen++;
    }
    counts.eligible = eligible.length;

    // 4. Take this run's quota.
    const selected = selectBatch(eligible, mode);
    counts.selected = selected.length;
    counts.inserted = selected.length;

    // 5. One batch: leads, ledger, history, counters.
    await commitRun(db, runId, selected, counts);

    return { runId, status: "ok", ...counts };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await failRun(db, runId, message);
    return { runId, status: "error", error: message, ...counts };
  }
}

export function expectedBatchSize(mode: BatchMode): number {
  return batchSize(mode);
}
