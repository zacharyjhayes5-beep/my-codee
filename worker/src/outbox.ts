/**
 * The Sheet-export outbox.
 *
 * Draining is written against a narrow `OutboxStore` interface rather than D1
 * directly, so the part that matters — one bad record must not stop the other
 * twenty-four — can be tested without a database.
 */

import { buildSheetRow, postSheetRow, type Fetcher, type SheetConfig } from "./sheets";
import type { LeadRow } from "./store";

export interface OutboxRow {
  pnum: string;
  lead_id: string;
  status: string;
  attempts: number;
  queued_at: string;
  last_attempt_at: string | null;
  exported_at: string | null;
  last_error: string | null;
}

/** Everything draining needs from storage. */
export interface OutboxStore {
  /** Pending parcels whose last attempt is old enough to try again. */
  claimPending(limit: number, notAttemptedSince: string): Promise<OutboxRow[]>;
  /** The lead contents for a parcel, or null when it has since vanished. */
  leadFor(pnum: string): Promise<LeadRow | null>;
  markExported(pnum: string, at: string): Promise<void>;
  markFailed(pnum: string, at: string, error: string): Promise<void>;
}

export interface DrainResult {
  attempted: number;
  exported: number;
  failed: number;
  /** Set when the mirror is not configured. Never an error. */
  skipped?: string;
}

/**
 * How long to wait before retrying a parcel that failed.
 *
 * The cron runs once a weekday, so this only bites when a drain is triggered
 * by hand — it stops a manual retry loop from hammering a broken endpoint.
 */
export const RETRY_AFTER_MINUTES = 10;

export function retryCutoff(now: Date): string {
  return new Date(now.getTime() - RETRY_AFTER_MINUTES * 60_000).toISOString();
}

/**
 * Send whatever is waiting.
 *
 * Each parcel is handled in its own try/catch and its own store write, so a
 * single failure — a bad row, a rejected request, a thrown exception — costs
 * exactly that one parcel and the rest of the batch continues. Nothing here
 * throws: the caller is the scheduled handler, and a mirror problem must never
 * surface as an ingestion failure.
 */
export async function drainOutbox(
  store: OutboxStore,
  config: SheetConfig | null,
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
  limit = 200,
): Promise<DrainResult> {
  if (!config) {
    return { attempted: 0, exported: 0, failed: 0, skipped: "sheet mirror not configured" };
  }

  const iso = now.toISOString();
  let pending: OutboxRow[];
  try {
    pending = await store.claimPending(limit, retryCutoff(now));
  } catch {
    return { attempted: 0, exported: 0, failed: 0, skipped: "outbox unavailable" };
  }

  let exported = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const lead = await store.leadFor(row.pnum);
      if (!lead) {
        // The parcel is queued but its lead is gone. Nothing can be sent, and
        // retrying forever helps nobody.
        await store.markFailed(row.pnum, iso, "No lead found for this parcel");
        failed++;
        continue;
      }

      const result = await postSheetRow(config, buildSheetRow(lead, iso), fetcher);
      if (result.ok) {
        await store.markExported(row.pnum, iso);
        exported++;
      } else {
        await store.markFailed(row.pnum, iso, result.error ?? "Unknown sheet error");
        failed++;
      }
    } catch {
      // A thrown error on one parcel must not end the loop.
      try {
        await store.markFailed(row.pnum, iso, "Unexpected error during export");
      } catch {
        // Even the bookkeeping failing is survivable — it stays pending.
      }
      failed++;
    }
  }

  return { attempted: pending.length, exported, failed };
}

/* ---------------------------------------------------------------------------
   The D1 implementation
   --------------------------------------------------------------------------- */

export function d1Outbox(db: D1Database): OutboxStore {
  return {
    async claimPending(limit, notAttemptedSince) {
      const { results } = await db
        .prepare(
          `SELECT pnum, lead_id, status, attempts, queued_at, last_attempt_at, exported_at, last_error
             FROM sheet_exports
            WHERE status = 'pending'
              AND (last_attempt_at IS NULL OR last_attempt_at <= ?)
         ORDER BY queued_at, pnum
            LIMIT ?`,
        )
        .bind(notAttemptedSince, limit)
        .all<OutboxRow>();
      return results ?? [];
    },

    async leadFor(pnum) {
      return await db
        .prepare(
          `SELECT id, pnum, govt_unit, owner_raw, property_address, property_city,
                  property_state, property_zip, owner_address, owner_city, owner_zip,
                  acreage, reason, created_at
             FROM leads
            WHERE pnum = ?
         ORDER BY created_at DESC
            LIMIT 1`,
        )
        .bind(pnum)
        .first<LeadRow>();
    },

    async markExported(pnum, at) {
      await db
        .prepare(
          `UPDATE sheet_exports
              SET status = 'done', exported_at = ?, last_attempt_at = ?,
                  attempts = attempts + 1, last_error = NULL
            WHERE pnum = ?`,
        )
        .bind(at, at, pnum)
        .run();
    },

    async markFailed(pnum, at, error) {
      await db
        .prepare(
          `UPDATE sheet_exports
              SET last_attempt_at = ?, attempts = attempts + 1, last_error = ?
            WHERE pnum = ?`,
        )
        .bind(at, error.slice(0, 300), pnum)
        .run();
    },
  };
}

/**
 * Queue every GIS lead that this mirror has never handled.
 *
 * Idempotent by construction: `INSERT ... ON CONFLICT DO NOTHING` means a
 * parcel already in the outbox — pending or already exported — is left exactly
 * as it is. Running the backfill repeatedly cannot re-send anything or create
 * a second row.
 */
export async function backfillOutbox(db: D1Database, now: Date = new Date()): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO sheet_exports (pnum, lead_id, status, queued_at)
       SELECT l.pnum, l.id, 'pending', ?
         FROM leads l
        WHERE l.pnum NOT IN (SELECT pnum FROM sheet_exports)
     GROUP BY l.pnum
       ON CONFLICT(pnum) DO NOTHING`,
    )
    .bind(now.toISOString())
    .run();
  return result.meta?.changes ?? 0;
}

export async function outboxSummary(db: D1Database): Promise<unknown> {
  return await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM sheet_exports) AS total,
         (SELECT COUNT(*) FROM sheet_exports WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM sheet_exports WHERE status = 'done') AS exported,
         (SELECT COUNT(*) FROM leads) AS leads`,
    )
    .first();
}
