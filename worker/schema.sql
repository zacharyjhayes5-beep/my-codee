-- D1 schema for Kent County GIS lead ingestion.
--
-- Three concerns, deliberately kept apart:
--   parcels                — the permanent ledger. One row per PNUM, forever.
--   parcel_owner_history   — append-only record of who owned what, and when.
--   leads                  — what has actually been surfaced to the dashboard.
--
-- The ledger is what makes deduplication permanent: it survives a cleared
-- browser, a new machine, and a restored backup, none of which IndexedDB does.

-- ---------------------------------------------------------------------------
-- Permanent parcel ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parcels (
  pnum              TEXT PRIMARY KEY,
  govt_unit         TEXT NOT NULL,
  -- The owner as last observed, normalized. Comparing an incoming owner
  -- against this is how a sale is detected on a later run.
  owner_normalized  TEXT NOT NULL,
  owner_raw         TEXT NOT NULL,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  -- How many times this parcel has produced a lead. A parcel that sells twice
  -- legitimately produces two, years apart.
  times_surfaced    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_parcels_unit ON parcels (govt_unit);

-- ---------------------------------------------------------------------------
-- Ownership history — append only, never updated or deleted.
--
-- Keeping this separate from `parcels` is what lets the ledger record "we have
-- processed this parcel before" without losing the previous owner, which is
-- the fact that makes future change-detection possible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parcel_owner_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  pnum              TEXT NOT NULL,
  owner_normalized  TEXT NOT NULL,
  owner_raw         TEXT NOT NULL,
  observed_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_pnum ON parcel_owner_history (pnum);

-- ---------------------------------------------------------------------------
-- Leads surfaced to the dashboard
--
-- `id` is deterministic — a hash of parcel plus normalized owner — so a run
-- that fails halfway and is retried cannot produce a second copy of the same
-- lead. The insert is INSERT OR IGNORE against this primary key.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                TEXT PRIMARY KEY,
  pnum              TEXT NOT NULL,
  govt_unit         TEXT NOT NULL,
  owner_raw         TEXT NOT NULL,
  owner_normalized  TEXT NOT NULL,
  property_address  TEXT,
  property_city     TEXT,
  property_state    TEXT,
  property_zip      TEXT,
  owner_address     TEXT,
  owner_city        TEXT,
  owner_zip         TEXT,
  acreage           REAL,
  -- 'new-parcel' | 'owner-change'
  reason            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  -- NULL until the dashboard has pulled it. This is what stops the same lead
  -- being downloaded on every sync.
  synced_at         TEXT,
  run_id            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_leads_unsynced ON leads (synced_at);
CREATE INDEX IF NOT EXISTS idx_leads_pnum ON leads (pnum);

-- ---------------------------------------------------------------------------
-- Ingestion runs — enough to answer "did the automation actually run, and
-- what did it do", and nothing more.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at         TEXT NOT NULL,
  finished_at        TEXT,
  -- 'running' | 'ok' | 'error'
  status             TEXT NOT NULL,
  trigger            TEXT NOT NULL,
  scanned            INTEGER NOT NULL DEFAULT 0,
  excluded_entities  INTEGER NOT NULL DEFAULT 0,
  already_seen       INTEGER NOT NULL DEFAULT 0,
  owner_changes      INTEGER NOT NULL DEFAULT 0,
  eligible           INTEGER NOT NULL DEFAULT 0,
  selected           INTEGER NOT NULL DEFAULT 0,
  inserted           INTEGER NOT NULL DEFAULT 0,
  error              TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON ingestion_runs (started_at);
