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
  run_id            INTEGER,
  -- Enrichment is downstream of durable ingestion. A provider can fail
  -- without changing dedupe, delivery or dashboard acknowledgement.
  enrichment_status TEXT NOT NULL DEFAULT 'pending',
  enrichment_provider TEXT,
  enrichment_confidence TEXT,
  enrichment_attempted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_unsynced ON leads (synced_at);
CREATE INDEX IF NOT EXISTS idx_leads_pnum ON leads (pnum);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment ON leads (enrichment_status, created_at);

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

-- ---------------------------------------------------------------------------
-- One-time setup codes
--
-- Getting the API token into a browser is the one step that cannot be done
-- over an ordinary channel without writing the token somewhere it should not
-- be. A setup code is single-use and short-lived: it is exchanged once for the
-- token and is dead immediately afterwards, so a code that leaks is worthless
-- within minutes and cannot be replayed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS setup_codes (
  code        TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

-- ---------------------------------------------------------------------------
-- Google Sheet export outbox
--
-- The spreadsheet is a mirror, never a dependency. Nothing in the ingestion
-- path waits on Google: a lead is written to `leads`, queued here in the same
-- transaction, and delivered afterwards on a best-effort basis. If Google is
-- down the row simply stays pending and the next scheduled run tries again.
--
-- Keyed on `pnum` rather than lead id, because the parcel is the permanent
-- identity in this system and the spreadsheet holds one logical row per
-- parcel. When ownership changes the same parcel is re-queued with the newer
-- lead, and the sheet upserts rather than appending — a parcel that sells
-- twice is still one row, updated.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sheet_exports (
  pnum             TEXT PRIMARY KEY,
  -- The lead whose contents should be sent. Updated on re-queue.
  lead_id          TEXT NOT NULL,
  -- 'pending' | 'done'
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  queued_at        TEXT NOT NULL,
  last_attempt_at  TEXT,
  exported_at      TEXT,
  -- Message only. Never a URL, header or secret.
  last_error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_sheet_exports_status ON sheet_exports (status);
-- ---------------------------------------------------------------------------
-- Campaign entries
--
-- One row per logged outreach activity, across the five channels.
--
-- The dashboard is the system of record — entries are written locally into
-- IndexedDB and this table is the durable copy, so `id` is the id the client
-- generated rather than a rowid. That makes a re-sync an upsert instead of a
-- duplicate.
CREATE TABLE IF NOT EXISTS campaign_entries (
  id               TEXT PRIMARY KEY,
  -- 'mailing' | 'cold-calls' | 'community' | 'social-media' | 'referrals'
  channel          TEXT NOT NULL,
  -- The day the activity happened, ISO yyyy-mm-dd. Not the day it was typed.
  date             TEXT NOT NULL,
  created_at       TEXT NOT NULL,

  -- Per-channel fields. Every one is nullable, because the five channels ask
  -- five different questions and a column that is required for one of them
  -- would be a lie for the other four.
  campaign         TEXT,    -- mailing
  calls_made       INTEGER, -- cold calls
  description      TEXT,    -- community, social media
  referred_by      TEXT,    -- referrals
  referred_people  TEXT,    -- referrals, comma-separated names
  notes            TEXT
);

-- The screen reads one channel at a time, newest first.
CREATE INDEX IF NOT EXISTS idx_campaign_entries_channel
  ON campaign_entries (channel, date DESC);
