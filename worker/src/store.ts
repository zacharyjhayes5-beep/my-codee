/**
 * Every D1 access lives here.
 *
 * Two rules the rest of the Worker relies on:
 *
 *   - nothing is written until the GIS scan has completed successfully, so a
 *     failed fetch cannot leave the ledger half-advanced;
 *   - all writes for a run go through one `batch()`, which D1 executes as a
 *     single implicit transaction, and every insert is idempotent, so a retry
 *     after a failure cannot double-write.
 */

import type { ParcelRecord } from "./normalize";

export interface RunCounts {
  scanned: number;
  excludedEntities: number;
  alreadySeen: number;
  ownerChanges: number;
  eligible: number;
  selected: number;
  inserted: number;
}

export interface KnownParcel {
  pnum: string;
  ownerNormalized: string;
}

export interface SelectedLead extends ParcelRecord {
  id: string;
  reason: "new-parcel" | "owner-change";
}

/**
 * The whole ledger, as a map from parcel to last-known owner.
 *
 * Roughly 15,000 rows of two short strings is small enough to hold in memory
 * and makes the comparison a map lookup rather than 15,000 round trips.
 */
export async function loadKnownParcels(db: D1Database): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  const { results } = await db
    .prepare("SELECT pnum, owner_normalized FROM parcels")
    .all<{ pnum: string; owner_normalized: string }>();
  for (const row of results ?? []) known.set(row.pnum, row.owner_normalized);
  return known;
}

export async function startRun(db: D1Database, trigger: string): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "INSERT INTO ingestion_runs (started_at, status, trigger) VALUES (?, 'running', ?) RETURNING id",
    )
    .bind(now, trigger)
    .first<{ id: number }>();
  return result?.id ?? 0;
}

export async function failRun(db: D1Database, runId: number, error: string): Promise<void> {
  await db
    .prepare(
      "UPDATE ingestion_runs SET finished_at = ?, status = 'error', error = ? WHERE id = ?",
    )
    .bind(new Date().toISOString(), error.slice(0, 1000), runId)
    .run();
}

/**
 * Commit a successful run: the selected leads, the ledger updates for those
 * leads, their ownership history, and the run's counters — in one batch.
 *
 * Only *selected* parcels advance the ledger. A parcel that was eligible but
 * not chosen for this batch stays unseen, so it remains available tomorrow;
 * marking everything scanned as processed would silently discard the backlog.
 */
export async function commitRun(
  db: D1Database,
  runId: number,
  leads: SelectedLead[],
  counts: RunCounts,
): Promise<void> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const lead of leads) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO leads (
             id, pnum, govt_unit, owner_raw, owner_normalized,
             property_address, property_city, property_state, property_zip,
             owner_address, owner_city, owner_zip,
             acreage, reason, created_at, run_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          lead.id,
          lead.pnum,
          lead.govtUnit,
          lead.ownerRaw,
          lead.ownerNormalized,
          lead.propertyAddress,
          lead.propertyCity,
          lead.propertyState,
          lead.propertyZip,
          lead.ownerAddress,
          lead.ownerCity,
          lead.ownerZip,
          lead.acreage,
          lead.reason,
          now,
          runId,
        ),
    );

    // Upsert the ledger. On a repeat visit only the owner and counters move;
    // first_seen_at is preserved so the parcel's history stays intact.
    statements.push(
      db
        .prepare(
          `INSERT INTO parcels (
             pnum, govt_unit, owner_normalized, owner_raw,
             first_seen_at, last_seen_at, times_surfaced
           ) VALUES (?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(pnum) DO UPDATE SET
             owner_normalized = excluded.owner_normalized,
             owner_raw = excluded.owner_raw,
             last_seen_at = excluded.last_seen_at,
             times_surfaced = parcels.times_surfaced + 1`,
        )
        .bind(lead.pnum, lead.govtUnit, lead.ownerNormalized, lead.ownerRaw, now, now),
    );

    statements.push(
      db
        .prepare(
          `INSERT INTO parcel_owner_history (pnum, owner_normalized, owner_raw, observed_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(lead.pnum, lead.ownerNormalized, lead.ownerRaw, now),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE ingestion_runs SET
           finished_at = ?, status = 'ok',
           scanned = ?, excluded_entities = ?, already_seen = ?,
           owner_changes = ?, eligible = ?, selected = ?, inserted = ?
         WHERE id = ?`,
      )
      .bind(
        now,
        counts.scanned,
        counts.excludedEntities,
        counts.alreadySeen,
        counts.ownerChanges,
        counts.eligible,
        counts.selected,
        counts.inserted,
        runId,
      ),
  );

  await db.batch(statements);
}

export interface LeadRow {
  id: string;
  pnum: string;
  govt_unit: string;
  owner_raw: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  owner_address: string | null;
  owner_city: string | null;
  owner_zip: string | null;
  acreage: number | null;
  reason: string;
  created_at: string;
}

/** Leads the dashboard has not yet taken. */
export async function unsyncedLeads(db: D1Database, limit: number): Promise<LeadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, pnum, govt_unit, owner_raw, property_address, property_city,
              property_state, property_zip, owner_address, owner_city, owner_zip,
              acreage, reason, created_at
         FROM leads
        WHERE synced_at IS NULL
     ORDER BY created_at, pnum
        LIMIT ?`,
    )
    .bind(limit)
    .all<LeadRow>();
  return results ?? [];
}

/**
 * Mark leads as taken.
 *
 * Acknowledgement is a separate call from the read on purpose: the dashboard
 * confirms only after the records are committed to IndexedDB, so a sync that
 * dies mid-write leaves them unsynced and they arrive again next time.
 */
export async function markSynced(db: D1Database, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const now = new Date().toISOString();
  const statements = ids.map((id) =>
    db
      .prepare("UPDATE leads SET synced_at = ? WHERE id = ? AND synced_at IS NULL")
      .bind(now, id),
  );
  const results = await db.batch(statements);
  return results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
}

export async function recentRuns(db: D1Database, limit = 20): Promise<unknown[]> {
  const { results } = await db
    .prepare("SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all();
  return results ?? [];
}
