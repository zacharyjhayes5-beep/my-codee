-- Campaign entries.
--
-- One row per logged outreach activity, across the five channels. Additive
-- and standalone: nothing already in the database references it, so this can
-- be applied before or after any Worker version without ordering risk.
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
