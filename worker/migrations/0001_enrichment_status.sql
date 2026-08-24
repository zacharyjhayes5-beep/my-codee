-- Additive production migration. Apply only after tests pass and before a
-- Worker version that selects these columns is deployed.
ALTER TABLE leads ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN enrichment_provider TEXT;
ALTER TABLE leads ADD COLUMN enrichment_confidence TEXT;
ALTER TABLE leads ADD COLUMN enrichment_attempted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_enrichment ON leads (enrichment_status, created_at);
